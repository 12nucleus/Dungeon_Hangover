// ─────────────────────────────────────────────────────────────
//   (a) windup: a windup:1 enemy skill declares a `telegraph` (no damage),
//       then resolves exactly once on the following aiStep.
//   (b) interrupt: a party bonus action vs a winding foe emits
//       `telegraphCancel` and clears the foe's pendingSkill.
//   (c) pack flanking: two allies adjacent to one target log `FLANKED`.
//   (d) elites: createFloor50Roster seeds at least one Champion with
//       1.5× max HP and +2 AC.
//   (e) combos: validateCombos over the full skill table reports 0 issues.
//   (f) party windup: declaring pays the action at declaration; the payout
//       fires free next turn start (canUse bypass + no double pay).
//   (g) counter-interrupt: an adjacent sharp foe breaks a party windup
//       (telegraphCancel, Dazed, reaction spent).
//   (h) reflex QTE: reactInterrupt with perfect timing auto-succeeds for
//       free, consumes the interrupter's hasReaction, and refuses repeats.
// Run with:   node scripts/test_combat_overhaul.mjs
// ─────────────────────────────────────────────────────────────
import esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rm, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '..', 'node_modules', '.tmp_combat_test');
const SRC = (p) => resolve(__dirname, '..', 'src', 'game', p);

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

// Bundle each entry separately so its exports are reachable from node
// (combat.ts swallows skills/skillCombos/classSkills into its own closure).
await esbuild.build({
  entryPoints: [SRC('combat.ts'), SRC('skills.ts'), SRC('skillCombos.ts'), SRC('classSkills.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: OUT_DIR,
  outExtension: { '.js': '.mjs' },
  logLevel: 'silent',
});

const load = (name) => import(pathToFileURL(resolve(OUT_DIR, name)).href);
const { Combat } = await load('combat.mjs');
const { createFloor50Roster, SKILLS } = await load('skills.mjs');
const { validateCombos } = await load('skillCombos.mjs');
const { ALL_CLASS_SKILLS } = await load('classSkills.mjs');

// ── tiny flat arena (30×30 walkable) stub ──
const S = 30;
const blocked = Array.from({ length: S }, () => new Array(S).fill(false));
const world = {
  inBounds: (x, z) => x >= 0 && z >= 0 && x < S && z < S,
  isWalkable: (x, z) => x >= 0 && z >= 0 && x < S && z < S && !blocked[x][z],
  heightAt: () => 1,
  blocked,
};

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const mkUnit = (partial) => ({
  id: partial.id ?? 'u' + Math.floor(Math.random() * 1e6),
  name: partial.name ?? 'Unit', title: 'T', team: partial.team ?? 'enemy', klass: 'goblin',
  level: 1, xp: 0, skillPoints: 0, equipment: {}, maxHp: partial.maxHp ?? 20, hp: partial.hp ?? 20,
  ac: partial.ac ?? 10, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  proficiency: 2, moveRange: 5, pos: { ...partial.pos }, alive: true, knownSkills: [...(partial.knownSkills ?? [])],
  equippedSkills: [...(partial.equippedSkills ?? partial.knownSkills ?? [])], unlockedNodes: [],
  bonusAC: 0, bonusMove: 0, cooldowns: {}, hasAction: true, hasBonus: true, movementLeft: 5,
  initiative: 0, conditions: [...(partial.conditions ?? [])], scheme: { skin: 0, cloth: 0, accent: 0, hair: 0, hood: false },
  weapon: 'dagger', xpValue: 0,
  ...partial,
});

// ══ (a) windup declare + single resolve ══
console.log('\n── (a) telegraphed windup ──');
{
  const c = new Combat(world);
  const boss = mkUnit({ id: 'boss', name: 'Baron Gnaw', team: 'enemy', pos: { x: 5, z: 5 }, hp: 12, maxHp: 25, knownSkills: ['tail_sweep'] });
  const greg = mkUnit({ id: 'greg', name: 'Greg', team: 'party', pos: { x: 5, z: 6 }, hp: 30, maxHp: 30, ac: 4 });
  c.units = [boss, greg];
  c.inCombat = true;
  c.turnOrder = [boss.id, greg.id];
  c.activeIdx = 0;

  // declaration: windup:1 ⇒ telegraph, no damage this turn
  const decl = c.useSkill(boss, 'tail_sweep', boss.pos);
  check('declaration emits a telegraph event', decl.some((e) => e.type === 'telegraph'), 'events=' + decl.map((e) => e.type).join(','));
  check('declaration deals no damage yet', !decl.some((e) => e.type === 'damage'));
  check('pendingSkill set with 1 round of windup', boss.pendingSkill === 'tail_sweep' && boss.pendingRounds === 1);

  // resolution: the next aiStep holds the charge, then pays it out once
  const hold = c.aiStep();
  check('pending round decremented to resolve', boss.pendingRounds === undefined && boss.pendingSkill === undefined);
  check('resolution fires a combat result (not another telegraph)',
    hold.some((e) => e.type === 'actionResult' || e.type === 'damage') && !hold.some((e) => e.type === 'telegraph'),
    'events=' + hold.map((e) => e.type).join(','));
}

// ══ (b) interrupt cancels a windup ══
console.log('\n── (b) interrupt counterplay ──');
{
  const c = new Combat(world);
  const boss = mkUnit({ id: 'boss', name: 'Baron Gnaw', team: 'enemy', pos: { x: 5, z: 5 }, hp: 12, maxHp: 25, knownSkills: ['tail_sweep'], abilities: { str: 1, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
  const greg = mkUnit({ id: 'greg', name: 'Greg', team: 'party', pos: { x: 5, z: 6 }, hp: 30, maxHp: 30, ac: 10, abilities: { str: 30, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, knownSkills: ['shove'] });
  c.units = [boss, greg];
  c.inCombat = true;
  c.turnOrder = [boss.id, greg.id];
  c.activeIdx = 0;

  c.useSkill(boss, 'tail_sweep', boss.pos);            // wind it up
  const pre = boss.pendingSkill;
  const evs = c.useSkill(greg, 'interrupt', boss.id);  // party bonus action
  check('windup armed before interrupt', pre === 'tail_sweep');
  check('interrupt emits telegraphCancel', evs.some((e) => e.type === 'telegraphCancel'));
  check('interrupt clears the pendingSkill', boss.pendingSkill === undefined && boss.pendingTarget === undefined && boss.pendingRounds === undefined);
  check('interrupted foe is Dazed', boss.conditions.some((x) => x.id === 'dazed'));
}

// ══ (c) pack flanking advantage ══
console.log('\n── (c) pack flanking ──');
{
  const c = new Combat(world);
  const greg = mkUnit({ id: 'greg', name: 'Greg', team: 'party', pos: { x: 5, z: 5 }, hp: 30, maxHp: 30, ac: 20 });
  const a = mkUnit({ id: 'a', name: 'Small Rat', team: 'enemy', pos: { x: 4, z: 5 }, aiStyle: 'pack', knownSkills: ['bite'] });
  const b = mkUnit({ id: 'b', name: 'Small Rat', team: 'enemy', pos: { x: 6, z: 5 }, aiStyle: 'pack', knownSkills: ['bite'] });
  c.units = [a, b, greg];
  c.inCombat = true;
  c.turnOrder = [a.id, b.id, greg.id];
  c.activeIdx = 0;
  const evs = c.useSkill(a, 'bite', greg.id);
  check('attack vs a sandwiched target logs FLANKED', evs.some((e) => e.type === 'log' && e.text.includes('FLANKED')));
}

// ══ (d) elite/champion modifiers ══
console.log('\n── (d) elite champions ──');
{
  const R = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });
  const rooms = {};
  for (const k of ['r3', 'r4', 'r6', 'r7', 'r8', 'r11', 'r12', 'r14', 'r15', 'r18', 'r19', 'r20', 'r21', 'r22', 'r23', 'r24']) rooms[k] = R(0, 0, 6, 6);
  const sp = { party: { x: 3, z: 3 }, rooms, bossRatLair: R(0, 0, 6, 6), bossBathTile: { x: 3, z: 0 } };

  // base max HP for the names the roster can promote (non-boss). A Champion
  // must read 1.5× this (ceil) — the +2 AC and gold accent ride along.
  const BASE_HP = {
    'Small Rat': 3, 'Rat': 3, 'Mother Rat': 6, 'Baby Rat': 1, 'Large Rat': 10,
    'Sewer Leech': 4, 'Giant Leech': 15, 'Mold Blob': 5, 'Bone Rat': 12,
    'Goblin Guard': 8, 'Goblin Archer': 8,
  };

  let found = null;
  let seed = 0;
  for (; seed < 300 && !found; seed++) {
    const roster = createFloor50Roster(sp, seed);
    for (const u of roster) {
      if (u.elite) { found = { u, roster }; break; }
    }
  }
  check('some seed produces at least one elite', !!found, found ? `seed ${seed - 1}` : 'no seed in 0..299 produced an elite');
  if (found) {
    const { u } = found;
    const origName = u.name.replace(/^Champion /, '');
    check('elite name is prefixed "Champion"', u.name.startsWith('Champion '), u.name);
    check('elite gold accent applied', u.scheme?.accent === 0xffd76b);
    const base = BASE_HP[origName];
    check('elite max HP is ceil(1.5× base)', base !== undefined && u.maxHp === Math.ceil(base * 1.5), `${origName}: ${base} → ${u.maxHp}`);
    // +2 AC is uniform for every promotion; a rat base AC is 11 → 13
    const baseAC = { 'Small Rat': 11, 'Rat': 11, 'Large Rat': 12, 'Mold Blob': 10 }[origName];
    if (baseAC !== undefined) check('elite AC is base + 2', u.ac === baseAC + 2, `${origName}: ${baseAC} → ${u.ac}`);
  }
}

// ══ (e) combo validation ══
console.log('\n── (e) combo validation ──');
{
  const all = { ...SKILLS, ...ALL_CLASS_SKILLS };
  const issues = validateCombos(all);
  check('validateCombos reports 0 issues over the full skill table', issues.length === 0, issues.join(' | ') || 'none');
}

// ══ (f) party windup: pay-at-declaration, free payout ══
console.log('\n── (f) party windup duel: declaration + payout ──');
{
  const c = new Combat(world);
  const greg = mkUnit({ id: 'greg', name: 'Greg', team: 'party', pos: { x: 5, z: 5 }, hp: 30, maxHp: 30, ac: 10, knownSkills: ['fireball'] });
  const boss = mkUnit({ id: 'boss', name: 'Baron Gnaw', team: 'enemy', pos: { x: 12, z: 12 }, hp: 25, maxHp: 25, ac: 10, knownSkills: ['tail_sweep'] });
  c.units = [greg, boss];
  c.inCombat = true;
  c.turnOrder = [greg.id, boss.id];
  c.activeIdx = 0;

  const decl = c.useSkill(greg, 'fireball', { x: 12, z: 12 });
  check('party declaration emits a telegraph', decl.some((e) => e.type === 'telegraph'));
  check('declaration pays the action immediately', greg.hasAction === false);
  check('declaration keeps the bonus action', greg.hasBonus === true);
  check('cooldown charged at declaration', (greg.cooldowns['fireball'] ?? 0) > 0, `cd=${greg.cooldowns['fireball']}`);

  // round trip: boss turn, then Greg's turn start resolves the payout
  c.endTurn();
  const payout = c.endTurn();
  check('payout fires on the declarer next turn start', payout.some((e) => e.type === 'damage' || e.type === 'actionResult'), 'events=' + payout.map((e) => e.type).join(','));
  check('payout is a normal resolve (no re-telegraph)', !payout.some((e) => e.type === 'telegraph'));
  check('the payout IS the turn action', greg.hasAction === false);
  check('payout did not re-charge the cooldown', (greg.cooldowns['fireball'] ?? 0) === 3, `cd=${greg.cooldowns['fireball']} (expect 3: declared 4, ticked 1 at turn start)`);
}

// ══ (g) enemy counter-interrupt on a party telegraph ══
console.log('\n── (g) counter-interrupt ──');
{
  const c = new Combat(world);
  // str 30 (+10) auto-wins the contest; dex 30 passes the reflex gate
  const foe = mkUnit({ id: 'foe', name: 'Champion Sewer Leech', team: 'enemy', pos: { x: 6, z: 5 }, hp: 20, maxHp: 20, ac: 10, abilities: { str: 30, dex: 30, con: 10, int: 10, wis: 10, cha: 10 } });
  const greg = mkUnit({ id: 'greg', name: 'Greg', team: 'party', pos: { x: 5, z: 5 }, hp: 30, maxHp: 30, ac: 10, knownSkills: ['fireball'], abilities: { str: 3, dex: 3, con: 10, int: 10, wis: 10, cha: 10 } });
  c.units = [greg, foe];
  c.inCombat = true;
  c.turnOrder = [greg.id, foe.id];
  c.activeIdx = 0;

  const decl = c.useSkill(greg, 'fireball', foe.id);
  check('party windup declared with foe adjacent', decl.some((e) => e.type === 'telegraph'));
  check('adjacent sharp foe breaks the windup', decl.some((e) => e.type === 'telegraphCancel'));
  check('pending windup cleared by counter-interrupt', greg.pendingSkill === undefined && greg.pendingTarget === undefined);
  check('declarer is Dazed', greg.conditions.some((x) => x.id === 'dazed'));
  check('the foe spent its reaction', foe.hasReaction === false);
}

// ══ (h) reflex QTE: perfect timing auto-succeeds, free ══
console.log('\n── (h) reflex interrupt (QTE) ──');
{
  const c = new Combat(world);
  const boss = mkUnit({ id: 'boss', name: 'Baron Gnaw', team: 'enemy', pos: { x: 5, z: 5 }, hp: 12, maxHp: 25, knownSkills: ['tail_sweep'], abilities: { str: 1, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
  const greg = mkUnit({ id: 'greg', name: 'Greg', team: 'party', pos: { x: 5, z: 6 }, hp: 30, maxHp: 30, ac: 10, abilities: { str: 1, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
  c.units = [boss, greg];
  c.inCombat = true;
  c.turnOrder = [boss.id, greg.id];
  c.activeIdx = 0;

  c.useSkill(boss, 'tail_sweep', boss.pos);            // wind it up
  check('reaction candidate picks the adjacent party member', c.reactionCandidate(boss)?.id === 'greg');
  const evs = c.reactInterrupt(greg, boss, true);      // perfect timing
  check('perfect reflex emits telegraphCancel', evs.some((e) => e.type === 'telegraphCancel'));
  check('perfect interrupt costs no bonus action', greg.hasBonus === true);
  check('the interrupter spent its reaction', greg.hasReaction === false);
  check('winding foe is Dazed', boss.conditions.some((x) => x.id === 'dazed'));
  const again = c.reactInterrupt(greg, boss, true);
  check('a spent reaction cannot react again', again.length === 0);
}

await rm(OUT_DIR, { recursive: true, force: true });
console.log(failures === 0 ? '\n✅ OK — combat overhaul mechanics pass.\n' : `\n❌ ${failures} CHECK(S) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);