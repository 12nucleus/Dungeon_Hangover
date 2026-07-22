// ─────────────────────────────────────────────────────────────
// Dungeon plan preview — generates the dungeon with the same seed
// as the game and prints:
//
//   1. An ASCII top-down map (# walkable, . room, B boss, P spawn, D door)
//   2. A summary (seed, rooms, walkable tiles, spawn, boss, mezzanines)
//   3. An SVG file for visual inspection (no external deps needed)
//
// Run with:   node scripts/dungeon_preview.mjs [seed]
//
// Example:    node scripts/dungeon_preview.mjs 20260420
//             node scripts/dungeon_preview.mjs 42
// ─────────────────────────────────────────────────────────────
import esbuild from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GEN_SRC = resolve(__dirname, '..', 'src', 'levels', 'gen', 'dungeonGen.ts');
const VOX_SRC = resolve(__dirname, '..', 'src', 'game', 'voxelTerrain.ts');
const OUT_DIR = resolve(__dirname, '..', 'node_modules', '.tmp_dung_prev');
const GEN_OUT = resolve(OUT_DIR, 'dungeonGen.mjs');
const VOX_OUT = resolve(OUT_DIR, 'voxelTerrain.mjs');

const SEED = parseInt(process.argv[2] ?? '20260420', 10);

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

await esbuild.build({
  entryPoints: [VOX_SRC], bundle: true, format: 'esm', platform: 'node',
  outfile: VOX_OUT, external: ['three'], logLevel: 'silent',
});
await esbuild.build({
  entryPoints: [GEN_SRC], bundle: true, format: 'esm', platform: 'node',
  outfile: GEN_OUT, logLevel: 'silent',
});

const { generateDungeon } = await import(pathToFileURL(GEN_OUT).href);

// ── generate with the same params as dungeon.ts ──
const S = 120;
const d = generateDungeon({
  seed: SEED, size: S, rooms: 25, roomRadius: [4, 8], bore: [0.5, 0.7],
  loops: 3, spurs: 12, roughness: 0.04,
  sealFinalRoom: true, finalRoomRadius: [9, 12],
  mezzanines: 4, mezzanineSteps: 1,
  floorPalette: ['cave_floor', 'cave_stone', 'gravel'],
  wallPalette: ['cave_stone', 'cave_floor'],
  wallHeight: [2.8, 4.2],
});

// ── build room-tile lookup ──
const roomTiles = new Map();
for (let i = 0; i < d.rooms.length; i++) {
  for (let x = d.rooms[i].x0; x <= d.rooms[i].x1; x++)
    for (let z = d.rooms[i].z0; z <= d.rooms[i].z1; z++)
      roomTiles.set(`${x},${z}`, i);
}

// ── ASCII map ──
const W = d.walk;
let walkCount = 0;
// print at reduced resolution (every 2nd-cell) so it fits in the terminal
const step = 2;
const cols = Math.ceil(S / step);
console.log(`\n  Seed ${SEED} — ${S}×${S} grid (${cols}×${cols} shown, 1 char = ${step} tiles)\n`);
let header = '   ';
for (let c = 0; c < cols; c++) header += (c % 10 === 0 ? '|' : ' ');
console.log(header);
for (let z = 0; z < S; z += step) {
  let row = `${(z / step).toString().padStart(2, '0')} `;
  for (let x = 0; x < S; x += step) {
    // sample this block — majority vote
    let walk = 0, total = 0;
    let ch = ' ';
    for (let dx = 0; dx < step && x + dx < S; dx++) {
      for (let dz = 0; dz < step && z + dz < S; dz++) {
        total++;
        if (W[x + dx][z + dz]) {
          walk++;
          const ri = roomTiles.get(`${x + dx},${z + dz}`);
          if (d.bossRoomIndex !== undefined && ri === d.bossRoomIndex) ch = 'B';
          else if (d.partySpawn.x === x + dx && d.partySpawn.z === z + dz) ch = 'P';
          else if (d.bossDoor && d.bossDoor.x === x + dx && d.bossDoor.z === z + dz) ch = 'D';
          else if (ri !== undefined) ch = '.';
          else ch = walk > 1 ? '#' : ch;
        }
      }
    }
    row += walk > total / 2 ? ch : ' ';
    if (walk > 0) walkCount += walk;
  }
  console.log(row);
}

// ── summary ──
let totalWalkable = 0;
for (const row of W) for (const c of row) if (c) totalWalkable++;
console.log(`\n┌─ Summary ──────────────────────────────────────`);
console.log(`│ Seed:           ${SEED}`);
console.log(`│ Grid:            ${S}×${S}`);
console.log(`│ Rooms:           ${d.rooms.length}`);
console.log(`│ Walkable tiles:  ${totalWalkable}`);
console.log(`│ Party spawn:     (${d.partySpawn.x}, ${d.partySpawn.z})`);
console.log(`│ Boss room idx:   ${d.bossRoomIndex}`);
console.log(`│ Boss door:        (${d.bossDoor?.x ?? '-'}, ${d.bossDoor?.z ?? '-'})`);
console.log(`│ Boss connect:    (${d.bossConnect?.x ?? '-'}, ${d.bossConnect?.z ?? '-'})`);
console.log(`│ Mezzanine rooms: ${d.mezzanineRoomIndices.join(', ') || 'none'}`);
console.log(`└───────────────────────────────────────────────`);

// ── room list ──
console.log(`\n  Rooms:`);
for (let i = 0; i < d.rooms.length; i++) {
  const r = d.rooms[i];
  const isBoss = i === d.bossRoomIndex;
  const isSpawn = d.partySpawn.x >= r.x0 && d.partySpawn.x <= r.x1 && d.partySpawn.z >= r.z0 && d.partySpawn.z <= r.z1;
  const tag = isBoss ? ' [BOSS]' : isSpawn ? ' [SPAWN]' : '';
  const isMezz = d.mezzanineRoomIndices.includes(i);
  if (isMezz) tag + ' [MEZZ]';
  console.log(`    ${i}: (${r.x0},${r.z0})-(${r.x1},${r.z1})  ${r.x1 - r.x0 + 1}×${r.z1 - r.z0 + 1}${tag}${isMezz ? ' [MEZZ]' : ''}`);
}

// ── SVG render (no external deps) ──
const cell = 5;
const pad = 10;
const imgW = S * cell + pad * 2;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgW}" style="background:#0a0a14">\n`;

// walkable tiles coloured by type + height
for (let x = 0; x < S; x++) {
  for (let z = 0; z < S; z++) {
    if (!W[x][z]) continue;
    let fill = '#3a3a44';
    const ri = roomTiles.get(`${x},${z}`);
    if (ri === d.bossRoomIndex) fill = '#ef4444';
    else if (ri !== undefined) fill = '#4a9a6a';
    else fill = '#5a5a66';
    // height shading
    const h = d.heights[x][z] ?? 1;
    const shade = Math.max(0.6, Math.min(1.3, h / 2));
    const hex = fill;
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const fr = Math.min(255, Math.round(r * shade)), fg = Math.min(255, Math.round(g * shade)), fb = Math.min(255, Math.round(b * shade));
    svg += `<rect x="${pad + x * cell}" y="${pad + z * cell}" width="${cell}" height="${cell}" fill="rgb(${fr},${fg},${fb})"/>\n`;
  }
}
// spawn marker
svg += `<rect x="${pad + d.partySpawn.x * cell}" y="${pad + d.partySpawn.z * cell}" width="${cell}" height="${cell}" fill="#7cc4ff"/>\n`;
// boss door marker
if (d.bossDoor) svg += `<rect x="${pad + d.bossDoor.x * cell}" y="${pad + d.bossDoor.z * cell}" width="${cell}" height="${cell}" fill="#fbbf24"/>\n`;

// room outlines
for (let i = 0; i < d.rooms.length; i++) {
  const r = d.rooms[i];
  const isBoss = i === d.bossRoomIndex;
  svg += `<rect x="${pad + r.x0 * cell}" y="${pad + r.z0 * cell}" width="${(r.x1 - r.x0 + 1) * cell}" height="${(r.z1 - r.z0 + 1) * cell}" fill="none" stroke="${isBoss ? '#ef4444' : '#4a9'}" stroke-width="0.5" opacity="0.4"/>\n`;
}

svg += `</svg>`;
const outSvg = resolve(__dirname, 'dungeon_preview.svg');
await writeFile(outSvg, svg, 'utf-8');
console.log(`\n📄 SVG map saved: ${outSvg.replace(__dirname, 'scripts')}`);
console.log(`   Open in a browser to see the full dungeon plan.\n`);

await rm(OUT_DIR, { recursive: true, force: true });