// ─────────────────────────────────────────────────────────────
// Skills audit: cast every active skill headlessly and tabulate
// outcomes — crashes, fizzles, denies, clean casts.
// Run with:   node scripts/test_skills_audit.mjs
// ─────────────────────────────────────────────────────────────
import esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rm, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '..', 'node_modules', '.tmp_skills_audit');
const OUT = resolve(OUT_DIR, 'bundle.mjs');

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

// bundle combat.ts → exports Combat; re-import SKILLS/etc via skills.ts bundle
await esbuild.build({
  entryPoints: [resolve(__dirname, '..', 'src', 'game', 'combat.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: OUT, logLevel: 'silent',
});
const { Combat } = await import(pathToFileURL(OUT).href);
const sklOut = resolve(OUT_DIR, 'skillsbundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '..', 'src', 'game', 'skills.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: sklOut, logLevel: 'silent',
});
const { SKILLS, CONDITIONS, SUMMON_TEMPLATES } = await import(pathToFileURL(sklOut).href);
let ALL_CLASS_SKILLS = {};
try {
  const csOut = resolve(OUT_DIR, 'classbundle.mjs');
  await esbuild.build({
    entryPoints: [resolve(__dirname, '..', 'src', 'game', 'classSkills.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: csOut, logLevel: 'silent',
  });
  const cs = await import(pathToFileURL(csOut).href);
  ALL_CLASS_SKILLS = cs.ALL_CLASS_SKILLS ?? {};
} catch (e) {
  console.log('classSkills bundle fail:', e.message);
}

// ── flat 30×30 walkable arena ──
const S = 30;
const blocked = Array.from({ length: S }, () => new Array(S).fill(false));
const world = {
  inBounds: (x, z) => x >= 0 && z >= 0 && x < S && z < S,
  isWalkable: (x, z) => x >= 0 && z >= 0 && x < S && z < S && !blocked[x][z],
  heightAt: () => 1, blocked,
};

const mkUnit = (partial) => ({
  id: partial.id ?? 'u' + Math.floor(Math.random() * 1e6),
  name: partial.name ?? 'Unit', title: 'T', team: partial.team ?? 'enemy', klass: 'goblin',
  level: 1, xp: 0, skillPoints: 0, equipment: {}, maxHp: partial.maxHp ?? 50, hp: partial.hp ?? 50,
  ac: partial.ac ?? 10, abilities: { str: 18, dex: 14, con: 14, int: 14, wis: 14, cha: 16 },
  proficiency: 4, moveRange: 5, pos: { ...partial.pos }, alive: true,
  knownSkills: [...(partial.knownSkills ?? [])],
  equippedSkills: [...(partial.equippedSkills ?? partial.knownSkills ?? [])],
  unlockedNodes: [], bonusAC: 0, bonusMove: 0, cooldowns: {}, hasAction: true,
  hasBonus: true, movementLeft: 5, initiative: 0,
  conditions: [...(partial.conditions ?? [])],
  scheme: { skin: 0, cloth: 0, accent: 0, hair: 0, hood: false, bulk: 1 },
  weapon: 'dagger', xpValue: 0, ...partial,
});

// place a dummy on a guaranteed walkable+empty adjacent tile to the caster
function safeAdjacentTile(c, casterPos) {
  const tries = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2],
  ];
  for (const [dx, dz] of tries) {
    const x = casterPos.x + dx, z = casterPos.z + dz;
    if (world.isWalkable(x, z) && !c.occupied(x, z)) return { x, z };
  }
  return { x: casterPos.x + 1, z: casterPos.z };
}

// Build the union of all known skill defs
const allIds = new Set([...Object.keys(SKILLS), ...Object.keys(ALL_CLASS_SKILLS)]);
console.log(`Skills: ${Object.keys(SKILLS).length} base, ${Object.keys(ALL_CLASS_SKILLS).length} class. Total unique IDs: ${allIds.size}`);

// ── harness: for each skill, set up a fresh combat and cast ──
const buckets = {
  crash: [],          // threw an exception
  drawingBoard: [],   // "fizzles — its effect is still on the drawing board"
  noTemplate: [],     // "fizzles — no minion template"
  outRange: [],       // "Target out of range"
  noTarget: [],       // "No target selected"
  noEnemy: [],         // "No enemies in range"
  ok: [],              // clean (heal/damage/summon/etc. event)
  empty: [],           // empty event list (silent skip)
  other: [],           // any other outcome
};
let tested = 0, skipped = 0;

for (const sid of allIds) {
  const s = SKILLS[sid] ?? ALL_CLASS_SKILLS[sid];
  if (!s) { skipped++; continue; }
  if (s.passive) { skipped++; continue; } // passives don't cast

  tested++;
  const c = new Combat(world);
  const greg = mkUnit({
    id: 'greg', name: 'Greg', team: 'party',
    pos: { x: 10, z: 10 }, maxHp: 60, hp: 60, knownSkills: [sid], equippedSkills: [sid],
  });
  c.units = [greg];
  c.inCombat = true;
  c.turnOrder = [greg.id];
  c.activeIdx = 0;

  // spawn a rat dummy with a stable id on a safe adjacent walkable tile
  const RAT_ID = 'target_rat';
  const ratPos = safeAdjacentTile(c, greg.pos);
  const ratT = SUMMON_TEMPLATES['small_rat'] ? SUMMON_TEMPLATES['small_rat']() : mkUnit({
    name: 'Small Rat', team: 'enemy', pos: ratPos, maxHp: 30, hp: 30, knownSkills: ['bite'],
  });
  ratT.id = RAT_ID; ratT.pos = ratPos; ratT.team = 'enemy'; ratT.alive = true;
  c.units.push(ratT);
  c.turnOrder.push(RAT_ID);

  // ── route target per skill targeting flags (mirror engine useSkill 424-453) ──
  // selfOnly / selfCentered / allAllies → caster tile (GridPos)
  // targetsAllies single-target      → greg.id (string)
  // aoeRadius > 0 (not self*)        → ratPos  (GridPos)
  // single-target enemy              → RAT_ID   (string)
  let target;
  if (s.selfOnly || s.selfCentered || s.allAllies) target = greg.pos;
  else if (s.targetsAllies) target = greg.id;
  else if (s.aoeRadius && s.aoeRadius > 0) target = ratPos;
  else target = RAT_ID;

  // Reset Greg's action state each cast so action-cost doesn't reject the skill
  greg.hasAction = true; greg.hasBonus = true;
  let ev;
  try {
    ev = c.useSkill(greg, sid, target);
  } catch (e) {
    buckets.crash.push({ sid, err: e.message });
    continue;
  }

  if (!ev || !ev.length) { buckets.empty.push(sid); continue; }

  const logs = ev.filter((e) => e.type === 'log').map((e) => e.text);
  const last = logs[logs.length - 1] ?? '';
  const tag = s.id;

  // "No corpses to raise" is the CORRECT no-corpse fallback for raise-dead
  // skills — the raise branch (combat.ts:562) emits it cleanly. Treat as OK.
  if (s.raiseCorpses && logs.some((t) => t.includes('No corpses to raise'))) { buckets.ok.push(tag); continue; }
  if (logs.some((t) => t.includes('drawing board'))) buckets.drawingBoard.push(tag);
  else if (logs.some((t) => t.includes('no minion template'))) buckets.noTemplate.push(tag);
  else if (logs.some((t) => t.includes('out of range'))) buckets.outRange.push(tag);
  else if (logs.some((t) => t.includes('No target'))) buckets.noTarget.push(tag);
  else if (logs.some((t) => t.toLowerCase().includes('no enemies in range'))) buckets.noEnemy.push(tag);
  else {
    // any damage/heal/summon/float/dice event counts as "ok"
    const hasFx = ev.some((e) => ['damage', 'heal', 'summon', 'skillfx', 'float', 'dice', 'death'].includes(e.type));
    if (hasFx) buckets.ok.push(tag);
    else buckets.other.push({ sid, logs });
  }
}

// ── report ──
console.log(`\nTested ${tested} active skills (${skipped} passives/data-only skipped).\n`);
const fmt = (label, arr) => arr.length
  ? `  ${label.padEnd(16)} ${String(arr.length).padStart(3)} — ${arr.slice(0, 8).join(', ')}${arr.length > 8 ? ` … +${arr.length - 8}` : ''}`
  : `  ${label.padEnd(16)}   0`;
console.log(fmt('OK (clean)', buckets.ok));
console.log(fmt('Drawing board', buckets.drawingBoard));
console.log(fmt('No minion tpl', buckets.noTemplate));
console.log(fmt('Out of range', buckets.outRange));
console.log(fmt('No target', buckets.noTarget));
console.log(fmt('No enemies', buckets.noEnemy));
console.log(fmt('Empty ev', buckets.empty));
console.log(fmt('Other', buckets.other.map((o) => o.sid)));
console.log(fmt('CRASH', buckets.crash.map((o) => `${o.sid}(${o.err.slice(0, 30)})`)));

if (buckets.crash.length) {
  console.log('\n── crash detail ──');
  for (const c of buckets.crash) console.log(`  ${c.sid}: ${c.err}`);
}
if (buckets.other.length) {
  console.log('\n── other detail ──');
  for (const o of buckets.other) console.log(`  ${o.sid}: ${o.logs.join(' | ')}`);
}

const badCount = buckets.crash.length + buckets.drawingBoard.length + buckets.noTemplate.length
  + buckets.outRange.length + buckets.noTarget.length + buckets.noEnemy.length + buckets.empty.length
  + buckets.other.length;
console.log(`\n${badCount === 0 ? '✅ ALL ACTIVE SKILLS CLEAN' : `⚠️  ${badCount} skill(s) need attention`}`);
if (process.argv.includes('--json')) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(resolve(__dirname, 'skills_audit_report.json'), JSON.stringify({
    ok: buckets.ok, drawingBoard: buckets.drawingBoard, noTemplate: buckets.noTemplate,
    outRange: buckets.outRange, noTarget: buckets.noTarget, noEnemy: buckets.noEnemy,
    empty: buckets.empty, other: buckets.other.map((o) => o.sid),
    crash: buckets.crash.map((o) => ({ sid: o.sid, err: o.err })),
    tested, skipped,
  }, null, 2));
  console.log('→ wrote scripts/skills_audit_report.json');
}
process.exit(buckets.crash.length === 0 ? 0 : 1);
