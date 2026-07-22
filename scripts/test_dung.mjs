// Quick runtime verification that generateDungeon + carveRiver work with the
// new pipeline, across many seeds.  Pure JS — uses esbuild (already installed
// via vite) to transpile the TS module on the fly so Node can import it.
//
// Run with:   node scripts/test_dung.mjs
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GEN_SRC = resolve(__dirname, '..', 'src', 'levels', 'gen', 'dungeonGen.ts');
const VOX_SRC = resolve(__dirname, '..', 'src', 'game', 'voxelTerrain.ts');
const OUT_DIR = resolve(__dirname, '..', 'node_modules', '.tmp_test_dung');
const GEN_OUT = resolve(OUT_DIR, 'dungeonGen.mjs');
const VOX_OUT = resolve(OUT_DIR, 'voxelTerrain.mjs');

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

// Build voxelTerrain first (dependency of dungeon loop only by import — dungeonGen
// doesn't import it, but the helper below uses carveRiver)
await build({
  entryPoints: [VOX_SRC],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: VOX_OUT,
  external: ['three'],
  logLevel: 'silent',
});
await build({
  entryPoints: [GEN_SRC],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: GEN_OUT,
  logLevel: 'silent',
});

const { generateDungeon } = await import(pathToFileURL(GEN_OUT).href);
const { carveRiver } = await import(pathToFileURL(VOX_OUT).href);

const SEEDS = [];
for (let i = 0; i < 25; i++) SEEDS.push(20260420 + i);
SEEDS.push(1, 7, 42, 999, 123456789, 31337);

let failures = 0;

function flood(walk, start, S) {
  const seen = new Set([`${start.x},${start.z}`]);
  const q = [start];
  while (q.length) {
    const c = q.shift();
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = c.x + dx, nz = c.z + dz;
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      if (!walk[nx]?.[nz]) continue;
      const k = `${nx},${nz}`;
      if (seen.has(k)) continue;
      seen.add(k); q.push({ x: nx, z: nz });
    }
  }
  return seen;
}

let totalWaterTiles = 0;
let totalCascadeDrops = 0;

for (const seed of SEEDS) {
  try {
    const d = generateDungeon({
      seed, size: 90, rooms: 50, roomRadius: [3, 6], bore: [0.8, 1.4],
      loops: 14, spurs: 24, roughness: 0.14,
      sealFinalRoom: true, finalRoomRadius: [9, 12],
      mezzanines: 6, mezzanineSteps: 1,
      floorPalette: ['cave_floor', 'cave_stone', 'gravel'],
      wallPalette: ['cave_stone', 'cave_floor'],
      wallHeight: [2.6, 3.8],
    });
    if (d.bossRoomIndex === undefined || !d.bossDoor || !d.bossConnect)
      throw new Error('boss fields undefined');
    const r = d.rooms[d.bossRoomIndex];
    const inBand = (t) =>
      t.x >= r.x0 - 1 && t.x <= r.x1 + 1 && t.z >= r.z0 - 1 && t.z <= r.z1 + 1;
    if (!inBand(d.bossDoor)) throw new Error('bossDoor not in boss ring band');
    if (!d.walk[d.bossConnect.x]?.[d.bossConnect.z])
      throw new Error('bossConnect not walkable');
    if (!d.walk[d.partySpawn.x]?.[d.partySpawn.z])
      throw new Error('partySpawn not walkable');

    const reach = flood(d.walk, d.partySpawn, 90);
    if (!reach.has(`${d.bossConnect.x},${d.bossConnect.z}`))
      throw new Error('partySpawn cannot reach bossConnect');

    // carve a river between two far-apart walkable tiles, like dungeon.ts does
    const walkableTiles = [];
    for (let x = 2; x < 88; x++) for (let z = 2; z < 88; z++) if (d.walk[x][z]) walkableTiles.push({ x, z });
    if (walkableTiles.length > 1) {
      walkableTiles.sort((a, b) => a.x - b.x);
      const a = walkableTiles[Math.floor(walkableTiles.length * 0.10)];
      const b = walkableTiles[Math.floor(walkableTiles.length * 0.90)];
      const water = carveRiver(d.walk, d.heights, a, b, 1);
      let waterCount = 0;
      let drops = 0;
      for (let x = 0; x < 90; x++) for (let z = 0; z < 90; z++) {
        if (water?.[x]?.[z]) waterCount++;
        if (water?.[x]?.[z] && d.walk[x][z]) {
          for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x + dx, nz = z + dz;
            if (d.walk[nx]?.[nz] && d.heights[nx][nz] < d.heights[x][z] - 0.02) drops++;
          }
        }
      }
      totalWaterTiles += waterCount;
      totalCascadeDrops += drops;
      if (waterCount < 5) throw new Error(`river too short (${waterCount} water tiles)`);
    }

    let walkCount = 0;
    for (const row of d.walk) for (const c of row) if (c) walkCount++;
    console.log(`seed ${seed}: rooms=${d.rooms.length} walk=${walkCount} boss=(${d.bossDoor.x},${d.bossDoor.z}) OK`);
  } catch (e) {
    failures++;
    console.error(`seed ${seed}: FAIL — ${e.message}`);
  }
}

await rm(OUT_DIR, { recursive: true, force: true });
console.log(`\n${failures === 0 ? '✅ ALL SEEDS PASSED' : '❌ ' + failures + ' FAILED'}`);
console.log(`total water tiles: ${totalWaterTiles}, total cascade drops: ${totalCascadeDrops}`);
process.exit(failures > 0 ? 1 : 0);
