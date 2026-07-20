// Generate one .vox file per decorative prop (and seed variations)
// into ./vox so they can be inspected in MagicaVoxel.
// Run: node scripts/gen_props_vox.mjs
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PROP_BUILDERS, DESTRUCTIBLE_BUILDERS } from '../src/game/voxelModels.mjs';
import { writeVox } from './voxWrite.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'vox');
mkdirSync(outDir, { recursive: true });

// a few seeds per prop to capture variation
const SEEDS = [0.3, 0.6, 0.9];

let total = 0;
for (const [kind, builder] of Object.entries(PROP_BUILDERS)) {
  for (let i = 0; i < SEEDS.length; i++) {
    const model = builder(SEEDS[i]);
    const name = `${kind}_${i + 1}.vox`;
    const info = writeVox(join(outDir, name), model.voxels);
    console.log(`  ${name.padEnd(22)} ${String(info.voxels).padStart(5)} vox  ${info.sX}x${info.sZ}x${info.sY}  ${info.colors} colors`);
    total++;
  }
}
console.log('  ── destructibles ──');
for (const [kind, builder] of Object.entries(DESTRUCTIBLE_BUILDERS)) {
  const model = builder(0.5);
  const name = `destr_${kind}.vox`;
  const info = writeVox(join(outDir, name), model.voxels);
  console.log(`  ${name.padEnd(22)} ${String(info.voxels).padStart(5)} vox  ${info.sX}x${info.sZ}x${info.sY}  ${info.colors} colors`);
  total++;
}
console.log(`\nWrote ${total} .vox files to ${outDir}`);
