// Generate one .vox file per monster roster variant into ./vox so they can
// be inspected in MagicaVoxel. Consumes the shared voxel library (orcModel +
// weaponVoxels) — the exact same geometry the in-game rig builds — merging all
// animated parts (translated by their world-space pivot), the emissive eyes,
// and the held weapon into a single static voxel grid.
// Run: node scripts/gen_monsters_vox.mjs
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { orcModel, weaponVoxels } from '../src/game/voxelModels.mjs';
import { writeVox } from './voxWrite.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'vox');
mkdirSync(outDir, { recursive: true });

// Roster schemes — kept in sync with src/game/skills.ts createRoster().
const MONSTERS = [
  { file: 'monster_snik_cutthroat', weapon: 'dagger',
    scheme: { skin: 0x6f9c3f, cloth: 0x4a3a28, accent: 0x2e2418, hair: 0x1c1c1c, hood: false, orc: true, bulk: 0.85 } },
  { file: 'monster_grib_archer', weapon: 'bow',
    scheme: { skin: 0x7da844, cloth: 0x39424e, accent: 0x232a33, hair: 0x1c1c1c, hood: true, orc: true, bulk: 0.85 } },
  { file: 'monster_zik_archer', weapon: 'bow',
    scheme: { skin: 0x699636, cloth: 0x39322a, accent: 0x242019, hair: 0x1c1c1c, hood: true, orc: true, bulk: 0.85 } },
  { file: 'monster_skar_boss', weapon: 'club',
    scheme: { skin: 0xb06a3a, cloth: 0x5c2e2e, accent: 0x38231f, hair: 0x0f0f0f, hood: false, orc: true, bulk: 1.15 } },
];

// merge a list of {x,y,z,c} voxels into `store`, offset by a world-space pivot
// (metres) converted to voxel units via the model's cube size C. Last write wins.
function merge(store, voxels, pivot, C) {
  const ox = Math.round(pivot[0] / C), oy = Math.round(pivot[1] / C), oz = Math.round(pivot[2] / C);
  for (const p of voxels) store.set(`${p.x + ox},${p.y + oy},${p.z + oz}`, p.c);
}

let total = 0;
for (const m of MONSTERS) {
  const model = orcModel(m.scheme, m.weapon);
  const C = model.cube;
  const store = new Map();
  // animated body parts, each placed at its pivot
  for (const part of Object.values(model.parts)) merge(store, part.voxels, part.pivot, C);
  // emissive eyes (single voxels)
  for (const pos of model.eyes.positions) merge(store, [{ x: 0, y: 0, z: 0, c: model.eyes.color }], pos, C);
  // held weapon rasterised at its hand pivot
  const wpn = weaponVoxels(m.weapon, m.scheme.accent);
  merge(store, wpn.voxels, wpn.pivot, C);

  const voxels = [];
  for (const [k, c] of store) { const [x, y, z] = k.split(',').map(Number); voxels.push({ x, y, z, c }); }
  const name = `${m.file}.vox`;
  const info = writeVox(join(outDir, name), voxels);
  console.log(`  ${name.padEnd(26)} ${String(info.voxels).padStart(5)} vox  ${info.sX}x${info.sZ}x${info.sY}  ${info.colors} colors`);
  total++;
}
console.log(`\nWrote ${total} monster .vox files to ${outDir}`);
