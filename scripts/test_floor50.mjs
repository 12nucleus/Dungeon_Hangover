// ─────────────────────────────────────────────────────────────
// Floor 50 mechanic unit checks (node, no browser):
//   (a) DoT ticks: Bleeding reduces HP at turn start
//   (b) Combat.summon adds a unit to initiative after the summoner
//   (c) Shove displaces 1 tile / slams into walls (1d4 + Prone)
//   (d) Frenzy: Boss Rat below 50% HP acts twice in a round
//   (e) hangoverPenalty: (1)===2, (3)===1, (5)===0
// Run with:   node scripts/test_floor50.mjs
// ─────────────────────────────────────────────────────────────
import esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rm, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '..', 'node_modules', '.tmp_f50_test');
const OUT = resolve(OUT_DIR, 'bundle.mjs');

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(__dirname, '..', 'src', 'game', 'combat.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: OUT,
  logLevel: 'silent',
});
const { Combat } = await import(pathToFileURL(OUT).href);

// ── tiny flat arena (30×30 walkable) — combat only touches the query
// surface, so a lightweight stub replaces the real VoxelWorld (no meshes) ──
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

// ══ (a) DoT tick ══
console.log('\n── (a) Bleeding DoT ──');
{
  const c = new Combat(world);
  const rat = mkUnit({ name: 'Rat', team: 'enemy', pos: { x: 5, z: 5 }, hp: 10, maxHp: 10, conditions: [{ id: 'bleeding', name: 'Bleeding', roundsLeft: 2 }] });
  const greg = mkUnit({ name: 'Greg', team: 'party', pos: { x: 10, z: 10 } });
  c.units = [rat, greg];
  c.inCombat = true;
  c.turnOrder = [rat.id, greg.id];
  c.activeIdx = 0;
  const before = rat.hp;
  c.beginTurn(); // private in TS — plain method at runtime
  check('bleeding tick reduces HP by 1-4', rat.hp < before && rat.hp >= before - 4, `${before} → ${rat.hp}`);
  check('bleeding condition decremented', rat.conditions[0]?.roundsLeft === 1);
}

// ══ (b) summon ══
console.log('\n── (b) Combat.summon ──');
{
  const c = new Combat(world);
  const summoner = mkUnit({ id: 'boss', name: 'Boss Rat', team: 'enemy', pos: { x: 5, z: 5 }, knownSkills: ['bite'] });
  const greg = mkUnit({ name: 'Greg', team: 'party', pos: { x: 8, z: 8 } });
  c.units = [summoner, greg];
  c.inCombat = true;
  c.turnOrder = [summoner.id, greg.id];
  c.activeIdx = 0;
  const tpl = mkUnit({ name: 'Small Rat', team: 'enemy', pos: { x: 0, z: 0 } });
  const sum = c.summon(tpl, summoner.pos, summoner.id);
  check('summon adds a unit', c.units.length === 3);
  check('summon placed on a free walkable tile', world.isWalkable(sum.pos.x, sum.pos.z));
  check('summon inserted right after the summoner in initiative',
    c.turnOrder[1] === sum.id, `order: ${c.turnOrder.join(',')}`);
  check('summon is alive at full HP', sum.alive && sum.hp === sum.maxHp);
}

// ══ (c) shove ══
console.log('\n── (c) Shove ──');
{
  const c = new Combat(world);
  // make (10,10) a wall for the slam test by reusing the open grid but
  // shoving toward x=0 (grid edge is non-walkable → slam path)
  const rat = mkUnit({ id: 'rat', name: 'Rat', team: 'enemy', pos: { x: 5, z: 5 }, hp: 8, maxHp: 8, abilities: { ...mkUnit({}).abilities, str: 1 } });
  const shover = mkUnit({ id: 'shover', name: 'Greg', team: 'party', pos: { x: 6, z: 5 }, abilities: { ...mkUnit({}).abilities, str: 30 }, knownSkills: ['shove'], equippedSkills: ['shove'] });
  c.units = [rat, shover];
  c.inCombat = true;
  c.turnOrder = [shover.id, rat.id];
  c.activeIdx = 0;
  const evs = c.useSkill(shover, 'shove', rat.id);
  const displaced = evs.some((e) => e.type === 'move' && e.unitId === rat.id);
  check('strong shove displaces the rat 1 tile away', displaced, `rat at ${rat.pos.x},${rat.pos.z}`);
  check('rat moved away from the shover', rat.pos.x === 4 && rat.pos.z === 5);

  // wall slam: shove the rat into an interior wall (blocked tile at x=3)
  blocked[3][5] = true;
  const rat2 = mkUnit({ id: 'rat2', name: 'Rat', team: 'enemy', pos: { x: 4, z: 5 }, hp: 8, maxHp: 8, abilities: { ...mkUnit({}).abilities, str: 1 } });
  const shover2 = mkUnit({ id: 'shover2', name: 'Greg', team: 'party', pos: { x: 5, z: 5 }, abilities: { ...mkUnit({}).abilities, str: 30 }, knownSkills: ['shove'], equippedSkills: ['shove'] });
  c.units = [rat2, shover2];
  c.turnOrder = [shover2.id, rat2.id];
  c.activeIdx = 0;
  const evs2 = c.useSkill(shover2, 'shove', rat2.id);
  const slammed = evs2.some((e) => e.type === 'damage' && e.unitId === rat2.id);
  const prone = rat2.conditions.some((x) => x.id === 'prone');
  check('shove into a wall deals 1d4 and Prone', slammed && prone, `damage=${slammed} prone=${prone}`);
}

// ══ (d) frenzy double action ══
console.log('\n── (d) Frenzy extra action ──');
{
  const c = new Combat(world);
  const baron = mkUnit({ id: 'baron', name: 'Baron Gnaw', team: 'enemy', pos: { x: 5, z: 5 }, hp: 10, maxHp: 25, knownSkills: ['bite', 'frenzy'], equippedSkills: ['bite', 'frenzy'] });
  const greg = mkUnit({ id: 'greg', name: 'Greg', team: 'party', pos: { x: 5, z: 6 }, hp: 30, maxHp: 30, ac: 10 });
  c.units = [baron, greg];
  c.inCombat = true;
  c.turnOrder = [baron.id, greg.id];
  c.activeIdx = 0;
  c.beginTurn(); // 40% HP → frenzy_extra armed
  check('frenzy armed below 50% HP', baron.cooldowns['frenzy_extra'] === 1);
  const e1 = c.useSkill(baron, 'bite', greg.id);
  check('first bite resolves', e1.some((e) => e.type === 'melee'));
  check('extra action granted after first action', baron.hasAction === true, `hasAction=${baron.hasAction}`);
  const e2 = c.useSkill(baron, 'bite', greg.id);
  check('second bite resolves (two actions this round)', e2.some((e) => e.type === 'melee'));
  check('no third action', baron.hasAction === false);
}

// ══ (e) hangover penalty ══
console.log('\n── (e) hangoverPenalty ──');
{
  const { hangoverPenalty } = await import(pathToFileURL(resolve(OUT_DIR, 'stats.mjs')).href).catch(() => ({}));
  // stats.ts is pure — bundle it separately
  const statsOut = resolve(OUT_DIR, 'stats.mjs');
  await esbuild.build({
    entryPoints: [resolve(__dirname, '..', 'src', 'game', 'stats.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: statsOut, logLevel: 'silent',
  });
  const stats = await import(pathToFileURL(statsOut).href);
  check('hangoverPenalty(1) === 2', stats.hangoverPenalty(1) === 2);
  check('hangoverPenalty(3) === 1', stats.hangoverPenalty(3) === 1);
  check('hangoverPenalty(5) === 0', stats.hangoverPenalty(5) === 0);
  check('MAX_LEVEL === 6', stats.MAX_LEVEL === 6);
}

await rm(OUT_DIR, { recursive: true, force: true });
console.log(failures === 0 ? '\n✅ OK — floor 50 mechanics pass.\n' : `\n❌ ${failures} CHECK(S) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
