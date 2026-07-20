// Generate one .vox file per monster roster variant into ./vox so they can
// be inspected in MagicaVoxel. Consumes the shared voxel library (orcModel +
// weaponVoxels) — the exact same geometry the in-game rig builds — merging all
// animated parts (translated by their world-space pivot), the emissive eyes,
// and the held weapon into a single static voxel grid.
// Run: node scripts/gen_monsters_vox.mjs
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { orcModel, ratModel, batModel, skeletonModel, weaponVoxels } from '../src/game/voxelModels.mjs';
import { writeVox } from './voxWrite.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'vox');
mkdirSync(outDir, { recursive: true });

// Roster schemes — kept in sync with src/game/skills.ts createRoster().
// `model` picks which shared builder to use; `weapon` is rasterised into the
// hand for the export (skeletons/orcs carry steel; rats & bats are unarmed).
const MONSTERS = [
  { file: 'monster_snik_cutthroat', model: 'orc', weapon: 'dagger',
    scheme: { skin: 0x6f9c3f, cloth: 0x4a3a28, accent: 0x2e2418, hair: 0x1c1c1c, hood: false, orc: true, bulk: 0.85 } },
  { file: 'monster_grib_archer', model: 'orc', weapon: 'bow',
    scheme: { skin: 0x7da844, cloth: 0x39424e, accent: 0x232a33, hair: 0x1c1c1c, hood: true, orc: true, bulk: 0.85 } },
  { file: 'monster_zik_archer', model: 'orc', weapon: 'bow',
    scheme: { skin: 0x699636, cloth: 0x39322a, accent: 0x242019, hair: 0x1c1c1c, hood: true, orc: true, bulk: 0.85 } },
  { file: 'monster_skar_boss', model: 'orc', weapon: 'club',
    scheme: { skin: 0xb06a3a, cloth: 0x5c2e2e, accent: 0x38231f, hair: 0x0f0f0f, hood: false, orc: true, bulk: 1.15 } },
  // ── dungeon beasts & undead (src/game/skills.ts createDungeonRoster) ──
  { file: 'monster_cave_rat', model: 'rat',
    scheme: { skin: 0x6b4a2f, cloth: 0x9a7a55, accent: 0xc79a9a, hair: 0x140f0f } },
  { file: 'monster_rabid_rat', model: 'rat',
    scheme: { skin: 0x7a3b2f, cloth: 0x9a5a4a, accent: 0xd88a76, hair: 0xff2a18, bulk: 1.1 } },
  { file: 'monster_cave_bat', model: 'bat',
    scheme: { skin: 0x3a2f3a, cloth: 0x2a2230, accent: 0x5a4a60, hair: 0xffd23a } },
  { file: 'monster_skeleton', model: 'skeleton', weapon: 'sword',
    scheme: { skin: 0xd8d2be, cloth: 0x3a2f28, accent: 0x9a9a9a, hair: 0x8fe3ff } },
  { file: 'monster_warlord_gorruk', model: 'orc', weapon: 'club',
    scheme: { skin: 0x5f7a3a, cloth: 0x3a2a2a, accent: 0x2a1f1a, hair: 0x101010, hood: false, orc: true, bulk: 1.35 } },
];

function buildModel(m) {
  switch (m.model) {
    case 'rat': return ratModel(m.scheme);
    case 'bat': return batModel(m.scheme);
    case 'skeleton': return skeletonModel(m.scheme, m.weapon);
    default: return orcModel(m.scheme, m.weapon);
  }
}

// merge a list of {x,y,z,c} voxels into `store`, offset by a world-space pivot
// (metres) converted to voxel units via the model's cube size C. Last write wins.
function merge(store, voxels, pivot, C) {
  const ox = Math.round(pivot[0] / C), oy = Math.round(pivot[1] / C), oz = Math.round(pivot[2] / C);
  for (const p of voxels) store.set(`${p.x + ox},${p.y + oy},${p.z + oz}`, p.c);
}

let total = 0;
for (const m of MONSTERS) {
  const model = buildModel(m);
  const C = model.cube;
  const store = new Map();
  // animated body parts, each placed at its pivot
  for (const part of Object.values(model.parts)) merge(store, part.voxels, part.pivot, C);
  // emissive eyes (single voxels) — orcs & skeletons
  if (model.eyes) for (const pos of model.eyes.positions) merge(store, [{ x: 0, y: 0, z: 0, c: model.eyes.color }], pos, C);
  // held weapon rasterised at its hand pivot (armed monsters only)
  if (m.weapon) {
    const wpn = weaponVoxels(m.weapon, m.scheme.accent);
    merge(store, wpn.voxels, wpn.pivot, C);
  }

  const voxels = [];
  for (const [k, c] of store) { const [x, y, z] = k.split(',').map(Number); voxels.push({ x, y, z, c }); }
  const name = `${m.file}.vox`;
  const info = writeVox(join(outDir, name), voxels);
  console.log(`  ${name.padEnd(26)} ${String(info.voxels).padStart(5)} vox  ${info.sX}x${info.sZ}x${info.sY}  ${info.colors} colors`);
  total++;
}
console.log(`\nWrote ${total} monster .vox files to ${outDir}`);
