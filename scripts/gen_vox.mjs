// Generate player_model.vox — high-resolution detailed player model (~80 voxels tall)
// Run: node scripts/gen_vox.mjs
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════ PALETTE ═══════════════════
// Skin
const SKIN    = 0xe6b58a, SKIN_D  = 0xcf9a6f, SKIN_D2 = 0xb07e54;
const SKIN_HL = 0xf3cca0, BLUSH   = 0xe09a82;
// Hair (messy brown)
const HAIR    = 0x5a3a20, HAIR_D  = 0x3c2513, HAIR_D2 = 0x281809, HAIR_HI = 0x7d5230, HAIR_HL = 0x9c6b40;
// Shirt (white tee)
const SHIRT   = 0xf6f5ef, SHIRT_D = 0xdadace, SHIRT_D2= 0xc2c2b4, SHIRT_HI= 0xffffff;
// Print graphic removed (plain shirt)
// Pocket
const POCK    = 0xececdf, POCK_ST = 0xbfbfae;
// Pants (gray jeans)
const PANT    = 0x6b7280, PANT_D  = 0x545a66, PANT_D2 = 0x40454f, PANT_HI = 0x848c98, SEAM = 0x9aa2ae;
// Boots (leather)
const BOOT    = 0x5c3d22, BOOT_D  = 0x3d2816, BOOT_HI = 0x7d5230, SOLE = 0x28221d, LACE = 0xd8c48c;
// Belt
const BELT    = 0x3a2a1a, BUCKLE  = 0xc9a94a, BUCKLE_D = 0xa2842f;
// Eyes / mouth
const EYE_W   = 0xf5f2ec, IRIS = 0x6b4426, PUPIL = 0x15100c, EYE_HI = 0xffffff;
const MOUTH   = 0xb05a4a, MOUTH_D = 0x8a3a30;

// ═══════════════════ VOXEL STORE (coord-dedup, last write wins) ═══════════════════
const store = new Map();
const key = (x, y, z) => `${x},${y},${z}`;
function add(x, y, z, c) { store.set(key(Math.round(x), Math.round(y), Math.round(z)), c); }
function addM(x, y, z, c) { add(x, y, z, c); add(-x, y, z, c); } // mirror across x=0
function box(x0, y0, z0, x1, y1, z1, c) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const za = Math.min(z0, z1), zb = Math.max(z0, z1);
  for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) for (let z = za; z <= zb; z++) add(x, y, z, c);
}
// elliptical column along Y (rounded limbs/torso)
function col(cx, cz, y0, y1, rx, rz, c) {
  for (let y = y0; y <= y1; y++)
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
      for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
        const dx = (x - cx) / rx, dz = (z - cz) / rz;
        if (dx * dx + dz * dz <= 1.02) add(x, y, z, c);
      }
}
// rounded box (rounded vertical corners in x-z plane)
function rbox(x0, y0, z0, x1, y1, z1, r, c) {
  const cx0 = x0 + r, cx1 = x1 - r, cz0 = z0 + r, cz1 = z1 - r;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    let dx = 0, dz = 0;
    if (x < cx0) dx = x - cx0; else if (x > cx1) dx = x - cx1;
    if (z < cz0) dz = z - cz0; else if (z > cz1) dz = z - cz1;
    if (dx * dx + dz * dz <= r * r + 0.3) add(x, y, z, c);
  }
}
// ellipsoid (head), optional shell for hair
function ellipsoid(cx, cy, cz, rx, ry, rz, c, inner = 0) {
  for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++)
      for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d <= 1.02 && d >= inner) add(x, y, z, c);
      }
}

// ═══════════════════ PROPORTIONS ═══════════════════
const LEG_X = 4;          // leg center offset
const HEAD_CY = 64, HEAD_RX = 6, HEAD_RY = 8, HEAD_RZ = 6;

// ═══════════════════ BOOTS (y 0..10) ═══════════════════
for (const s of [-1, 1]) {
  const cx = s * LEG_X;
  // sole
  rbox(cx - 3, 0, -4, cx + 3, 1, 6, 2, SOLE);
  box(cx - 3, 1, -4, cx + 3, 1, 6, BOOT_D);          // sole top rim
  // boot body (leather), toe extends forward (+z)
  rbox(cx - 3, 2, -4, cx + 3, 8, 5, 2, BOOT);
  // toe cap highlight
  box(cx - 2, 2, 5, cx + 2, 4, 6, BOOT_HI);
  // heel shadow
  box(cx - 2, 2, -4, cx + 2, 4, -4, BOOT_D);
  // ankle cuff
  rbox(cx - 3, 8, -3, cx + 3, 10, 4, 2, BOOT_HI);
  box(cx - 3, 9, -3, cx + 3, 9, 4, BOOT_D);
  // laces (front)
  for (let ly = 4; ly <= 8; ly += 2) { addM(cx - 1, ly, 6, LACE); add(cx + 1, ly, 6, LACE); }
  add(cx, 5, 6, LACE); add(cx, 7, 6, LACE);
  // stitching line along side
  box(cx - 3, 5, 0, cx - 3, 6, 0, BOOT_D);
  box(cx + 3, 5, 0, cx + 3, 6, 0, BOOT_D);
}

// ═══════════════════ LEGS / JEANS (y 10..35) ═══════════════════
for (const s of [-1, 1]) {
  const cx = s * LEG_X;
  col(cx, 0.5, 10, 34, 3.2, 3.4, PANT);              // main leg
  // cuff over boot
  col(cx, 0.5, 10, 11, 3.4, 3.6, PANT_D);
  // outer-seam highlight + inner shadow
  for (let y = 11; y <= 33; y++) {
    add(cx + s * 3, y, 0, SEAM);                      // outer seam stitch
    add(cx - s * 3, y, 0, PANT_D2);                   // inner shadow
    add(cx, y, 3, PANT_HI);                           // front sheen
    add(cx, y, -3, PANT_D);                           // back shadow
  }
  // knee fold creases
  box(cx - 2, 20, 3, cx + 2, 20, 4, PANT_D);
  box(cx - 2, 22, 3, cx + 2, 22, 4, PANT_HI);
  box(cx - 1, 18, 3, cx + 1, 18, 4, PANT_D);
  // lower cuff hem stitch
  box(cx - 3, 12, 3, cx + 3, 12, 3, SEAM);
  // knee patch shading
  col(cx, 3, 19, 23, 1.6, 1.2, PANT_HI);
}
// crotch / hip fill joining legs to waist
rbox(-8, 33, -4, 8, 36, 4, 2, PANT);
box(-1, 33, 3, 1, 36, 4, PANT_D);                    // center seam front
box(-1, 33, -4, 1, 36, -4, PANT_D2);                 // center seam back
// front pockets
for (const s of [-1, 1]) {
  box(s * 4, 34, 4, s * 6, 36, 4, PANT_D);           // pocket opening
  add(s * 4, 33, 4, SEAM); add(s * 6, 33, 4, SEAM);
}

// ═══════════════════ BELT (y 35..37) ═══════════════════
rbox(-8, 35, -4, 8, 37, 5, 2, BELT);
box(-2, 35, 5, 2, 37, 5, BUCKLE);                    // buckle
box(-1, 35, 5, 1, 36, 5, BUCKLE_D);
// belt loops
for (const bx of [-6, -2, 2, 6]) box(bx, 35, 5, bx, 37, 5, PANT_D);

// ═══════════════════ TORSO / T-SHIRT (y 37..56) ═══════════════════
// taper: waist halfX ~7, chest halfX ~8.5
for (let y = 37; y <= 55; y++) {
  const t = (y - 37) / 18;
  const hx = Math.round(7 + t * 1.8);
  const hz = 5;
  rbox(-hx, y, -hz, hx, y, hz, 2, SHIRT);
}
// hem at bottom
box(-8, 37, -4, 8, 37, 5, SHIRT_D);
// shoulders
rbox(-11, 53, -4, 11, 56, 4, 2, SHIRT);
box(-11, 53, 0, -9, 55, 0, SHIRT_D);
box(9, 53, 0, 11, 55, 0, SHIRT_D);

// ── fabric folds (vertical + diagonal) ──
for (let y = 38; y <= 53; y++) {
  add(-5, y, 5, SHIRT_D);                             // left vertical fold
  add(5, y, 5, SHIRT_HI);                             // right sheen
  add(0, y, -5, SHIRT_D);                             // back fold
}
// diagonal waist folds
for (let i = 0; i < 5; i++) { add(-6 + i, 39 + i, 5, SHIRT_D2); add(6 - i, 39 + i, 5, SHIRT_D2); }
// armpit shadow folds
box(-8, 48, 4, -6, 51, 5, SHIRT_D);
box(6, 48, 4, 8, 51, 5, SHIRT_D);
// collar (crew neck)
rbox(-3, 55, 2, 3, 57, 5, 1, SHIRT);
box(-2, 56, 5, 2, 56, 5, SHIRT_D);
box(-2, 57, 4, 2, 57, 5, SKIN_D2);                   // neck hole shadow

// ── chest pocket (wearer's left = viewer right, +x) ──
box(2, 46, 5, 5, 50, 5, POCK);                       // pocket face
box(2, 50, 5, 5, 50, 5, POCK_ST);                    // top stitch
add(2, 46, 5, POCK_ST); add(5, 46, 5, POCK_ST);      // bottom corners
box(2, 46, 5, 2, 50, 5, POCK_ST);                    // left stitch
box(5, 46, 5, 5, 50, 5, POCK_ST);                    // right stitch

// ═══════════════════ ARMS (short sleeves + bare forearms) ═══════════════════
for (const s of [-1, 1]) {
  const cx = s * 10;
  // sleeve (shirt) upper arm
  col(cx, 0, 48, 55, 2.6, 2.6, SHIRT);
  col(cx, 0, 48, 49, 2.8, 2.8, SHIRT_D);             // sleeve hem
  add(cx + s * 2, 52, 0, SHIRT_HI);                  // sleeve sheen
  add(cx - s * 2, 51, 0, SHIRT_D);                   // sleeve fold
  // bare forearm (skin)
  col(cx, 0, 34, 47, 2.2, 2.3, SKIN);
  for (let y = 35; y <= 46; y++) { add(cx, y, 2, SKIN_HL); add(cx, y, -2, SKIN_D); }
  add(cx + s * 2, 40, 1, SKIN_D);                    // muscle shade
  // elbow
  col(cx, -1, 47, 48, 2.0, 1.6, SKIN_D);
}

// ═══════════════════ HANDS (y 28..34) ═══════════════════
for (const s of [-1, 1]) {
  const cx = s * 10;
  // palm
  rbox(cx - 2, 30, -2, cx + 2, 34, 2, 1, SKIN);
  add(cx, 32, 2, SKIN_HL); add(cx, 31, -2, SKIN_D);
  // four fingers pointing down
  for (let f = -1; f <= 2; f++) {
    const fx = cx + f;
    box(fx, 28, -1, fx, 30, 1, SKIN);
    add(fx, 28, 0, SKIN_D);                          // fingertip shade
    add(fx, 29, 1, SKIN_HL);                         // knuckle
  }
  // thumb (to the side)
  box(cx + s * 2, 31, 1, cx + s * 3, 32, 2, SKIN);
  add(cx + s * 3, 31, 2, SKIN_D);
}

// ═══════════════════ NECK (y 55..58) ═══════════════════
col(0, -1, 55, 58, 2.2, 2.0, SKIN);
add(0, 56, -2, SKIN_D2);                             // nape shadow
box(-2, 56, 2, 2, 57, 2, SKIN_D);                    // chin shadow under jaw

// ═══════════════════ HEAD (y 56..72) ═══════════════════
ellipsoid(0, HEAD_CY, 0, HEAD_RX, HEAD_RY, HEAD_RZ, SKIN);
// jaw / chin taper
ellipsoid(0, 58, 1, 4.5, 3.5, 5, SKIN);
add(0, 56, 3, SKIN_D);                               // chin tip
// cheek shading + blush
for (const s of [-1, 1]) {
  add(s * 4, 61, 5, BLUSH);
  add(s * 4, 62, 4, SKIN_HL);                        // cheekbone highlight
  add(s * 5, 63, 2, SKIN_D);                         // temple shade
}
// forehead highlight
box(-2, 68, 5, 2, 69, 6, SKIN_HL);

// ── ears ──
for (const s of [-1, 1]) {
  box(s * 6, 62, -1, s * 6, 64, 1, SKIN);
  add(s * 6, 63, 0, SKIN_D);                         // inner ear
  add(s * 7, 63, 0, SKIN);                           // outer rim
  add(s * 6, 61, 0, SKIN_D2);                        // lobe shade
}

// ── eyes (y 62..64) ── each eye 3 wide
for (const s of [-1, 1]) {
  const ex = s * 3;
  // eye socket shadow
  box(ex - 1, 62, 5, ex + 1, 63, 6, SKIN_D);
  // whites
  add(ex - 1, 63, 6, EYE_W); add(ex + 1, 63, 6, EYE_W);
  add(ex - 1, 62, 6, EYE_W); add(ex + 1, 62, 6, EYE_W);
  // iris + pupil (center)
  add(ex, 63, 6, IRIS); add(ex, 62, 6, PUPIL);
  // catchlight (kept flush with the face at z=6 so the eye doesn't poke out)
  add(ex + s, 63, 6, EYE_HI);
  // upper lid / lash line
  box(ex - 1, 64, 6, ex + 1, 64, 6, SKIN_D2);
  // lower lid
  add(ex, 61, 6, SKIN_D);
}

// ── eyebrows (y 65..66) ──
for (const s of [-1, 1]) {
  box(s * 2, 65, 6, s * 4, 65, 6, HAIR_D);
  add(s * 3, 66, 6, HAIR_D2);
}

// ── nose (protrudes +z) ──
box(0, 61, 6, 0, 63, 6, SKIN);
add(0, 61, 7, SKIN_HL);                              // nose tip
addM(1, 61, 6, SKIN_D2);                             // nostril shadow
add(0, 60, 6, SKIN_D);

// ── mouth (y 59) ──
box(-2, 59, 6, 2, 59, 6, MOUTH);
box(-1, 59, 6, 1, 59, 6, MOUTH_D);                   // mouth line
addM(2, 60, 6, MOUTH);                               // smile corners up
add(0, 58, 6, SKIN_D);                               // lower lip shadow

// ═══════════════════ HAIR (messy, y 65..82) ═══════════════════
// subtle per-voxel shade variation: mostly base HAIR with scattered
// highlights / occasional darks, so every layer matches & looks natural.
function hairShade(x, y, z) {
  const h = (((x + 40) * 73856093) ^ ((y + 40) * 19349663) ^ ((z + 40) * 83492791)) >>> 0;
  const r = h % 100;
  if (r < 10) return HAIR_HI;   // ~10% mid highlight
  if (r < 16) return HAIR_HL;   // ~6% bright highlight
  if (r < 24) return HAIR_D;    // ~8% shadow strand
  return HAIR;                  // ~76% base brown
}
// main cap: shell of ellipsoid larger than head, skip the face opening
const HR_CY = 66;
for (let x = -8; x <= 8; x++) for (let y = 63; y <= 82; y++) for (let z = -8; z <= 8; z++) {
  const dx = x / 7.2, dy = (y - HR_CY) / 9.0, dz = z / 7.0;
  const d = dx * dx + dy * dy + dz * dz;
  if (d > 1.05 || d < 0.62) continue;                // shell thickness
  // skip the face opening (front-lower area)
  if (z > 2 && y < 68) continue;
  if (z > 4 && y < 71) continue;
  add(x, y, z, hairShade(x, y, z));
}
// scalp fill on top to avoid holes
ellipsoid(0, 70, 0, 6.6, 6.0, 6.4, HAIR, 0.55);

// ── fringe / bangs over forehead (front, raised to y 68..71 so the forehead & eyes show) ──
const fringe = [
  [-5, 70, 6], [-4, 69, 6], [-4, 68, 7], [-3, 70, 7], [-2, 68, 7],
  [0, 69, 7], [2, 68, 7], [3, 70, 7], [4, 68, 7], [4, 69, 6], [5, 70, 6],
];
for (const [x, y, z] of fringe) add(x, y, z, HAIR);

// ── individual hair strands (highlights + darks for texture, all connected) ──
const strandsHI = [
  [-6, 72, 3], [-4, 74, 4], [-2, 75, 3], [0, 76, 2], [2, 75, 4], [4, 74, 3], [6, 72, 2],
  [-5, 72, 5], [-3, 71, 6], [3, 71, 6], [5, 72, 5], [-1, 74, 5], [1, 74, 5],
  [-6, 70, 1], [6, 70, 1], [-3, 75, 1], [3, 75, 1],
];
for (const [x, y, z] of strandsHI) add(x, y, z, HAIR_HI);
const strandsHL = [[-2, 76, 2], [2, 76, 2], [0, 75, 3], [-4, 74, 3], [4, 74, 3], [-1, 75, 4], [1, 75, 4]];
for (const [x, y, z] of strandsHL) add(x, y, z, HAIR_HL);
const strandsD = [
  [-7, 68, -2], [7, 68, -2], [-6, 66, -3], [6, 66, -3],
  [-5, 71, -5], [5, 71, -5], [-4, 73, -6], [4, 73, -6], [0, 74, -6],
];
for (const [x, y, z] of strandsD) add(x, y, z, HAIR_D);

// ── small connected top tufts (kept within the scalp, no floaters) ──
const tufts = [
  [-2, 76, 1], [2, 76, 1], [-1, 76, -1], [1, 76, -2], [3, 75, 0], [-3, 75, 0], [0, 76, 0],
];
for (const [x, y, z] of tufts) add(x, y, z, HAIR);
add(0, 77, 0, HAIR_HI);                              // single top tip (connects to scalp)

// ── LONG back hair: rounded curtain hanging from the nape to the shoulders ──
// The ellipsoid shell above already rounds the back of the skull; this only
// hangs the flowing length below it, with a curved (not flat) cross-section.
for (let y = 49; y <= 62; y++) {
  const t = (y - 49) / 13;                          // 0 bottom → 1 top
  const halfW = Math.round(3 + t * 3);              // 3 at bottom → 6 near head
  for (let x = -halfW; x <= halfW; x++) {
    const edge = 1 - Math.abs(x) / (halfW + 0.6);   // 1 center → ~0 at edges
    const back = -5 - Math.round(edge * 2);         // center z≈-7, edges z≈-5 (rounded)
    add(x, y, back, hairShade(x, y, back));         // outer layer (varied, matches hair)
    add(x, y, back + 1, hairShade(x, y, back + 1)); // main
    add(x, y, back + 2, hairShade(x, y, back + 2)); // inner (toward neck)
  }
  add(0, y, -5, (y % 3 === 0) ? HAIR_HI : HAIR);     // center highlight streak
}
// wavy pointed bottom tips at the shoulder line
const tips = [[-3, 48, -6], [0, 47, -6], [3, 48, -6], [-2, 48, -5], [2, 47, -5], [-4, 49, -6], [4, 49, -6]];
for (const [x, y, z] of tips) { add(x, y, z, hairShade(x, y, z)); add(x, y, z - 1, hairShade(x, y, z - 1)); }

// ── side hair flowing down past the ears (y 53..67) ──
for (const s of [-1, 1]) {
  for (let y = 53; y <= 67; y++) {
    add(s * 6, y, -2, HAIR);
    add(s * 6, y, -4, HAIR);
    add(s * 7, y, -3, HAIR_D);
    add(s * 5, y, -5, HAIR);                         // blend into back curtain
  }
  add(s * 6, 52, -3, HAIR);                          // side tip
  add(s * 5, 51, -4, HAIR_D);
  add(s * 6, 66, 3, HAIR_HI);                        // highlight near temple
}

// ── sideburns / front side wisps (kept light so the ears show) ──
for (const s of [-1, 1]) {
  box(s * 6, 66, 3, s * 7, 68, 4, HAIR);
  add(s * 7, 67, 4, HAIR_HI);
}

// ═══════════════════ PRUNE DISCONNECTED VOXELS ═══════════════════
// Keep only the largest connected component. Uses 18-connectivity
// (shared face or edge) so cubes that merely kiss at a single 3D corner
// — which read as "floating" — are dropped, while edge-attached detail stays.
{
  const keys = [...store.keys()];
  const seen = new Set();
  const neigh = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const m = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    if (m === 1 || m === 2) neigh.push([dx, dy, dz]); // face + edge, exclude corner (m===3)
  }
  let best = null;
  for (const start of keys) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      const [x, y, z] = cur.split(',').map(Number);
      for (const [dx, dy, dz] of neigh) {
        const nk = `${x + dx},${y + dy},${z + dz}`;
        if (store.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    if (!best || comp.length > best.length) best = comp;
  }
  const keep = new Set(best);
  let removed = 0;
  for (const k of keys) if (!keep.has(k)) { store.delete(k); removed++; }
  console.log(`Pruned ${removed} disconnected voxel(s); kept ${store.size}.`);
}

// ═══════════════════ EXPORT (.vox) ═══════════════════
const voxels = [];
for (const [k, c] of store) {
  const [x, y, z] = k.split(',').map(Number);
  voxels.push({ x, y, z, c });
}
let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
for (const v of voxels) { mnX = Math.min(mnX, v.x); mnY = Math.min(mnY, v.y); mnZ = Math.min(mnZ, v.z); }
for (const v of voxels) { v.x -= mnX; v.y -= mnY; v.z -= mnZ; }
const sX = Math.max(...voxels.map(v => v.x)) + 1;
const sY = Math.max(...voxels.map(v => v.y)) + 1;
const sZ = Math.max(...voxels.map(v => v.z)) + 1;

// build palette (<=255 unique colors)
const cmap = new Map(); const pal = [[0, 0, 0, 0]];
for (const v of voxels) {
  const r = (v.c >> 16) & 0xff, g = (v.c >> 8) & 0xff, b = v.c & 0xff;
  const k = `${r},${g},${b}`;
  if (!cmap.has(k)) {
    if (pal.length >= 256) { cmap.set(k, 1); continue; }
    pal.push([r, g, b, 255]); cmap.set(k, pal.length - 1);
  }
}
while (pal.length < 256) pal.push([0, 0, 0, 0]);

const W = Buffer.alloc, S32 = v => { const b = W(4); b.writeInt32LE(v); return b; };
const SU32 = v => { const b = W(4); b.writeUInt32LE(v); return b; };

// SIZE (.vox: x=left-right, y=front-back=our z, z=up=our y)
const sb = W(12); sb.writeInt32LE(sX, 0); sb.writeInt32LE(sZ, 4); sb.writeInt32LE(sY, 8);

// XYZI (swap y/z: our y is up -> vox z; our z is depth -> vox y)
const xb = W(4 + voxels.length * 4); xb.writeInt32LE(voxels.length, 0);
for (let i = 0; i < voxels.length; i++) {
  const v = voxels[i], o = 4 + i * 4;
  const r = (v.c >> 16) & 0xff, g = (v.c >> 8) & 0xff, b = v.c & 0xff;
  xb.writeUInt8(v.x, o); xb.writeUInt8(v.z, o + 1); xb.writeUInt8(v.y, o + 2);
  xb.writeUInt8(cmap.get(`${r},${g},${b}`), o + 3);
}

// RGBA — MagicaVoxel maps rgba[i] -> palette index i+1, so shift up by one
const rb = W(256 * 4);
for (let i = 0; i < 256; i++) { const o = i * 4; const c = pal[i + 1] || [0, 0, 0, 0]; rb.writeUInt8(c[0], o); rb.writeUInt8(c[1], o + 1); rb.writeUInt8(c[2], o + 2); rb.writeUInt8(c[3], o + 3); }

const children = Buffer.concat([
  Buffer.from('SIZE', 'ascii'), S32(12), SU32(0), sb,
  Buffer.from('XYZI', 'ascii'), S32(xb.length), SU32(0), xb,
  Buffer.from('RGBA', 'ascii'), S32(rb.length), SU32(0), rb,
]);
const hd = W(8); hd.write('VOX ', 0, 'ascii'); hd.writeUInt32LE(150, 4);
const mh = W(12); mh.write('MAIN', 0, 'ascii'); mh.writeUInt32LE(0, 4); mh.writeUInt32LE(children.length, 8);

const vox = Buffer.concat([hd, mh, children]);
const out = join(__dirname, '..', 'player_model.vox');
writeFileSync(out, vox);
console.log(`Written ${out} — ${voxels.length} voxels, ${sX}x${sZ}x${sY}, ${pal.filter(p => p[3]).length - 0} colors`);
