// ─────────────────────────────────────────────────────────────
// Props layout audit — imports the real floor50 module and asserts
// that REMOVING every tile-blocking prop still leaves every room
// reachable from spawn (i.e. no torch/brazier/crate/stalagmite/etc
// sunders the dungeon or chokes a corridor).
// Run:  node scripts/audit_props.mjs
// ─────────────────────────────────────────────────────────────
import esbuild from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rm, mkdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'node_modules', '.tmp_f50_props');
const OUT = resolve(OUT_DIR, 'floor50.mjs');

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(__dirname, '..', 'src/levels/floor50.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: OUT,
  loader: { '.mjs': 'js' },
  absWorkingDir: resolve(__dirname, '..'),
  logLevel: 'error',
});

const { floor50Level, F50_DEBUG } = await import(pathToFileURL(OUT).href);
const { map } = F50_DEBUG;

const BLOCKING = new Set(['torch', 'bonfire', 'brazier', 'tent', 'campfire', 'crate', 'stalagmite', 'boulder']);
const props = floor50Level.props;

const blockingTiles = props.filter((p) => BLOCKING.has(p.kind)).map((p) => `${p.x},${p.z}`);
const blockingOnWall = props.filter((p) => BLOCKING.has(p.kind) && !map.walk[p.x]?.[p.z]);
const dupes = blockingTiles.filter((t, i) => blockingTiles.indexOf(t) !== i);

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' ' + detail}`); if (!cond) failures++; };

console.log(`total props: ${props.length}, blocking props: ${blockingTiles.length}`);

check('blocking props never land on walls', blockingOnWall.length === 0,
  `off-walk blocking props: ${blockingOnWall.map((p) => `${p.kind}@${p.x},${p.z}`).join(', ')}`);
check('no two blocking props share a tile', dupes.length === 0, `dupes: ${dupes.join(', ')}`);

// mark blocked tiles (remove blocking props from walk) — BFS all 25 rooms
const S = map.walk.length;
const walk = map.walk.map((row) => row.slice());
for (const t of blockingTiles) {
  const [x, z] = t.split(',').map(Number);
  if (map.walk[x]?.[z] && map.roomOf(x, z) === null) walk[x][z] = false;
}
// Only corridor (non-room) blocking props are dangerous — room ones are decor.

// 1. whole-dungeon connectivity with ALL blocking props removed
{
  const centerOf = (r) => ({ x: (r.x0 + r.x1) >> 1, z: (r.z0 + r.z1) >> 1 });
  const start = centerOf(map.rooms.r1);
  const seen = new Set([`${start.x},${start.z}`]);
  const q = [start];
  while (q.length) {
    const c = q.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, nz = c.z + dz;
      if (!walk[nx]?.[nz]) continue;
      const k = `${nx},${nz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, z: nz });
    }
  }
  const bad = Object.keys(map.rooms).filter((id) => !seen.has(`${centerOf(map.rooms[id]).x},${centerOf(map.rooms[id]).z}`));
  check('dungeon stays connected with blocking props removed', bad.length === 0,
    `rooms cut off: ${bad.join(',')}`);
}

// 2. per-prop: does this ONE prop locally choke a corridor (only 1 walkable
//    neighbour)? A prop in the middle of a 1-wide lane would have that.
//    (already prevented by the gate-lane reservation, but belt & braces)
{
  const choke = [];
  for (const p of props) {
    if (!BLOCKING.has(p.kind)) continue;
    if (map.roomOf(p.x, p.z) !== null) continue;   // room decor is fine
    let n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (walk[p.x + dx]?.[p.z + dz]) n++;
    }
    if (n <= 1) choke.push(`${p.kind}@${p.x},${p.z} (${n} nb)`);
  }
  check('no corridor blocking-prop sits in a 1-wide neck', choke.length === 0, choke.join(', '));
}

// 3. per-gate: each gate lane must be entirely walkable (0 blocking props)
{
  const lanes = []; // recompute width-1 corridors from F50_DEBUG.CORRIDORS
  for (const c of F50_DEBUG.CORRIDORS) {
    if (c.width !== 1) continue;
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i], b = c.pts[i + 1];
      const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
      const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
      for (let k = 0; k <= len; k++) lanes.push(`${a.x + dx * k + F50_DEBUG.OFFSET.x},${a.z + dz * k + F50_DEBUG.OFFSET.z}`);
    }
  }
  const laneBlock = blockingTiles.filter((t) => lanes.includes(t));
  check('no blocking prop on any gate lane', laneBlock.length === 0, laneBlock.join(', '));
}

await rm(OUT_DIR, { recursive: true, force: true });
console.log(failures === 0 ? '\n✅ Props OK — nothing blocks the player path.\n' : `\n❌ ${failures} PROP CHECK(S) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
