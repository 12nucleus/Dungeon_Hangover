// ─────────────────────────────────────────────────────────────
//  Shared voxel-model library — pure ESM, framework agnostic.
//  Consumed by both the browser (src/game/props.ts builds THREE
//  meshes) and the node exporters (scripts/*.mjs write .vox files),
//  so prop geometry lives in ONE place.
//
//  Every model builder returns:
//    { voxels:[{x,y,z,c}], cube, glow?, particles?, anim?, blocks?,
//      hang?, name }
//  where voxels are grid coords (y up), colours are 0xRRGGBB, and
//  effect metadata (glow/particles/anim) is ignored by the .vox
//  exporter but honoured in-game.
// ─────────────────────────────────────────────────────────────

// ── deterministic RNG (mulberry32) ──
export function rng(seed) {
  let a = (seed * 0x9e3779b1) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── colour helpers ──
export function shade(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}
export function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// ── voxel store (coord-dedup, last write wins) ──
export class Vox {
  constructor() { this.m = new Map(); }
  add(x, y, z, c) { this.m.set(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`, c); return this; }
  addM(x, y, z, c) { this.add(x, y, z, c); this.add(-x, y, z, c); return this; }
  has(x, y, z) { return this.m.has(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`); }
  box(x0, y0, z0, x1, y1, z1, c) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const za = Math.min(z0, z1), zb = Math.max(z0, z1);
    for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) for (let z = za; z <= zb; z++) this.add(x, y, z, c);
    return this;
  }
  // solid elliptic column along Y
  col(cx, cz, y0, y1, rx, rz, c) {
    for (let y = y0; y <= y1; y++)
      for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dz = (z - cz) / rz;
          if (dx * dx + dz * dz <= 1.05) this.add(x, y, z, c);
        }
    return this;
  }
  // hollow elliptic ring along Y
  ring(cx, cz, y0, y1, rx, rz, c, thick = 1.15) {
    for (let y = y0; y <= y1; y++)
      for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dz = (z - cz) / rz;
          const d = dx * dx + dz * dz;
          const inner = (rx - thick) / rx;
          if (d <= 1.05 && d >= inner * inner) this.add(x, y, z, c);
        }
    return this;
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, c, inner = 0) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
      for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          const d = dx * dx + dy * dy + dz * dz;
          if (d <= 1.03 && d >= inner) this.add(x, y, z, c);
        }
    return this;
  }
  // tapered spike (radius shrinks along +Y). tip at y1. lean adds drift.
  spike(cx, cz, y0, y1, r0, r1, c, leanX = 0, leanZ = 0, colorFn = null) {
    const h = y1 - y0;
    for (let y = y0; y <= y1; y++) {
      const t = h === 0 ? 0 : (y - y0) / h;
      const r = r0 + (r1 - r0) * t;
      const ox = cx + leanX * t, oz = cz + leanZ * t;
      for (let x = Math.ceil(ox - r); x <= Math.floor(ox + r); x++)
        for (let z = Math.ceil(oz - r); z <= Math.floor(oz + r); z++) {
          const dx = (x - ox) / (r + 0.0001), dz = (z - oz) / (r + 0.0001);
          if (dx * dx + dz * dz <= 1.05) this.add(x, y, z, colorFn ? colorFn(y, t) : c);
        }
    }
    return this;
  }
  list() {
    const out = [];
    for (const [k, c] of this.m) { const [x, y, z] = k.split(',').map(Number); out.push({ x, y, z, c }); }
    return out;
  }
  get size() { return this.m.size; }
}

// small hash-noise colour picker for organic speckle
function speckle(pick, x, y, z) {
  const h = (((x + 91) * 73856093) ^ ((y + 47) * 19349663) ^ ((z + 13) * 83492791)) >>> 0;
  return pick[h % pick.length];
}

// ══════════════════════════════════════════════════════════════
//  ROCK PALETTES
// ══════════════════════════════════════════════════════════════
const ROCK = 0x6d6a73, ROCK_D = 0x4c4a52, ROCK_D2 = 0x35343b, ROCK_HI = 0x8a8792, ROCK_HL = 0x9f9caa;
const MOSS = 0x4d6a2e, MOSS_D = 0x37501f, MOSS_HI = 0x6f8a44;

function rockShade(y, t) {
  // lighter near tip, mossy/dark near base handled by caller
  const r = (((y + 7) * 2654435761) >>> 0) % 100;
  if (r < 8) return ROCK_HL;
  if (r < 20) return ROCK_HI;
  if (r < 30) return ROCK_D;
  return ROCK;
}

// ══════════════════════════════════════════════════════════════
//  DECORATIVE PROP BUILDERS
// ══════════════════════════════════════════════════════════════

// STALAGMITE — floor spike, high detail, optional twin, mossy base
export function propStalagmite(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 1);
  const v = new Vox();
  const cube = 0.055;
  const H = 26 + Math.floor(R() * 16);         // grid height
  const r0 = 5 + Math.floor(R() * 2);
  const lean = (R() - 0.5) * 6;
  const leanZ = (R() - 0.5) * 4;
  v.spike(0, 0, 0, H, r0, 0.6, ROCK, lean, leanZ, (y, t) => {
    const n = R();
    if (t > 0.82 && n < 0.6) return ROCK_HL;
    if (t > 0.6 && n < 0.5) return ROCK_HI;
    return rockShade(y, t);
  });
  // secondary smaller spike beside it
  if (R() < 0.7) {
    const sx = (R() < 0.5 ? -1 : 1) * (r0 + 1);
    const h2 = Math.floor(H * (0.45 + R() * 0.25));
    v.spike(sx, (R() - 0.5) * 3, 0, h2, 3, 0.5, ROCK, lean * 0.5, 0, (y, t) => rockShade(y, t));
  }
  // mossy base ring
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    const rr = r0 + 1 + R() * 1.5;
    const bx = Math.round(Math.cos(ang) * rr), bz = Math.round(Math.sin(ang) * rr);
    if (R() < 0.55) v.add(bx, 0, bz, R() < 0.5 ? MOSS : MOSS_D);
    if (R() < 0.3) v.add(bx, 1, bz, MOSS_HI);
  }
  // moss dabs climbing the lower shaft
  for (let y = 1; y < H * 0.4; y++) for (const s of [-1, 1]) {
    if (R() < 0.15) v.add(Math.round(s * (r0 - 1 - y * 0.1)), y, 0, MOSS);
  }
  return { name: 'stalagmite', voxels: v.list(), cube, blocks: true };
}

// STALACTITE — ceiling spike (hangs). built downward from y=0.
export function propStalactite(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 7);
  const v = new Vox();
  const cube = 0.055;
  const H = 18 + Math.floor(R() * 14);
  const r0 = 4 + Math.floor(R() * 2);
  const lean = (R() - 0.5) * 4;
  v.spike(0, 0, -H, 0, 0.6, r0, ROCK, 0, 0, (y, t) => rockShade(-y, 1 - t));
  // re-do properly: spike from top(0) tapering down. Use downward build:
  v.m.clear();
  for (let i = 0; i <= H; i++) {
    const y = -i;
    const t = i / H;
    const r = r0 * (1 - t) + 0.4;
    const ox = lean * t;
    for (let x = Math.ceil(ox - r); x <= Math.floor(ox + r); x++)
      for (let z = Math.ceil(-r); z <= Math.floor(r); z++) {
        const dx = (x - ox) / (r + 0.001), dz = z / (r + 0.001);
        if (dx * dx + dz * dz <= 1.05) v.add(x, y, z, rockShade(i, t));
      }
  }
  // drip highlight at tip
  v.add(Math.round(lean), -H, 0, ROCK_HL);
  return { name: 'stalactite', voxels: v.list(), cube, hang: true };
}

// CRYSTAL — glowing gem cluster. hue selectable.
function crystalCluster(seed, base, glowColor) {
  const R = rng(Math.floor(seed * 1000) + 3);
  const v = new Vox();
  const cube = 0.055;
  const lo = shade(base, 0.6), hi = shade(base, 1.35), tip = mix(base, 0xffffff, 0.55);
  const shards = 3 + Math.floor(R() * 4);
  let maxH = 0;
  for (let i = 0; i < shards; i++) {
    const ang = (i / shards) * Math.PI * 2 + R();
    const dist = i === 0 ? 0 : 2 + R() * 3;
    const cx = Math.round(Math.cos(ang) * dist);
    const cz = Math.round(Math.sin(ang) * dist);
    const h = (i === 0 ? 16 : 8) + Math.floor(R() * 8);
    maxH = Math.max(maxH, h);
    const r0 = i === 0 ? 3 : 2;
    const lx = (R() - 0.5) * 4, lz = (R() - 0.5) * 4;
    v.spike(cx, cz, 0, h, r0, 0.4, base, lx, lz, (yy, t) => {
      if (t > 0.7) return tip;
      if (t > 0.35) return hi;
      const n = (yy * 2654435761 >>> 0) % 10;
      return n < 3 ? lo : base;
    });
  }
  // scattered rubble crystals at base
  for (let a = 0; a < 14; a++) {
    if (R() < 0.5) v.add(Math.round((R() - 0.5) * 10), 0, Math.round((R() - 0.5) * 10), R() < 0.5 ? lo : base);
  }
  return {
    name: 'crystal', voxels: v.list(), cube,
    glow: { color: glowColor, intensity: 6, dist: 8, decay: 1.8, y: maxH * cube * 0.6, flicker: 0.25 },
    particles: { type: 'sparkle', color: glowColor, y: maxH * cube, spread: 0.35, rate: 1.4, count: 10 },
    anim: 'pulse',
  };
}
export function propCrystal(seed = 0.5) { return crystalCluster(seed, 0x8b5cf0, 0x8a5cf0); }
export function propCrystalBlue(seed = 0.5) { const m = crystalCluster(seed, 0x3aa0e8, 0x49b6ff); m.name = 'crystal_blue'; return m; }
export function propCrystalGreen(seed = 0.5) { const m = crystalCluster(seed, 0x36d17a, 0x49ffa0); m.name = 'crystal_green'; return m; }

// BOULDER — rounded mossy rock
export function propBoulder(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 11);
  const v = new Vox();
  const cube = 0.055;
  const rx = 8 + Math.floor(R() * 3), ry = 6 + Math.floor(R() * 2), rz = 8 + Math.floor(R() * 3);
  for (let x = -rx; x <= rx; x++) for (let y = 0; y <= ry * 2; y++) for (let z = -rz; z <= rz; z++) {
    const dx = x / rx, dy = (y - ry) / ry, dz = z / rz;
    const d = dx * dx + dy * dy + dz * dz;
    // lumpy surface
    const bump = 0.9 + speckle([0, 0.06, 0.12, -0.05], x, y, z);
    if (d <= bump) {
      let c = speckle([ROCK, ROCK, ROCK_D, ROCK_HI, ROCK_D2], x, y, z);
      // moss on the top
      if (y > ry * 1.3 && R() < 0.5) c = speckle([MOSS, MOSS_D, MOSS_HI], x, y, z);
      v.add(x, y, z, c);
    }
  }
  return { name: 'boulder', voxels: v.list(), cube, blocks: true };
}

// BONES — skull + ribcage + scattered shards
export function propBones(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 13);
  const v = new Vox();
  const cube = 0.055;
  const BONE = 0xd8d2c0, BONE_D = 0xb3ab93, BONE_D2 = 0x8f866c, SOCK = 0x2a2620;
  // skull
  const sx = -4, sy = 2, sz = 0;
  v.ellipsoid(sx, sy + 2, sz, 4, 4, 4, BONE);
  v.box(sx - 2, sy - 1, sz - 2, sx + 2, sy, sz + 2, BONE_D);   // jaw
  v.add(sx - 2, sy + 2, sz + 3, SOCK); v.add(sx + 2, sy + 2, sz + 3, SOCK); // eye sockets
  v.add(sx - 1, sy + 2, sz + 4, SOCK); v.add(sx + 1, sy + 2, sz + 4, SOCK);
  v.box(sx - 1, sy - 1, sz + 3, sx + 1, sy - 1, sz + 3, BONE_D2); // teeth line
  // spine + ribs
  for (let i = 0; i < 8; i++) {
    const bx = sx + 4 + i;
    v.add(bx, 0, 0, BONE_D);
    if (i % 2 === 0) {
      const rr = 3 - i * 0.15;
      for (let a = -1; a <= 1; a += 2) {
        for (let k = 1; k <= rr; k++) v.add(bx, Math.round(k * 0.6), Math.round(a * k), BONE);
        v.add(bx, Math.round(rr * 0.6) + 1, Math.round(a * rr), BONE_D);
      }
    }
  }
  // scattered shards
  for (let i = 0; i < 10; i++) {
    const bx = Math.round((R() - 0.5) * 18), bz = Math.round((R() - 0.5) * 14);
    const len = 1 + Math.floor(R() * 3);
    for (let k = 0; k < len; k++) v.add(bx + k, 0, bz, R() < 0.5 ? BONE : BONE_D);
  }
  return { name: 'bones', voxels: v.list(), cube };
}

// TORCH — wall/standing torch with wrapped rag head + embers
export function propTorch(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 17);
  const v = new Vox();
  const cube = 0.055;
  const WOOD = 0x6b4a2e, WOOD_D = 0x4a3320, WOOD_HI = 0x855f3a;
  const RAG = 0x3a2f24, IRON = 0x50535c;
  // pole
  for (let y = 0; y <= 26; y++) {
    const c = y % 5 === 0 ? WOOD_D : (y % 5 === 2 ? WOOD_HI : WOOD);
    v.add(0, y, 0, c); v.add(1, y, 0, WOOD_D); v.add(0, y, 1, WOOD_D);
    v.add(-1, y, 0, c); v.add(0, y, -1, c);
  }
  // iron bracket bands
  v.ring(0, 0, 8, 9, 1.6, 1.6, IRON);
  // rag-wrapped head
  v.ellipsoid(0, 29, 0, 3, 3, 3, RAG);
  v.box(-1, 27, -1, 1, 30, 1, RAG);
  return {
    name: 'torch', voxels: v.list(), cube, blocks: true,
    glow: { color: 0xff9540, intensity: 14, dist: 10, decay: 1.7, y: 30 * cube, flicker: 2.4 },
    particles: { type: 'flame', color: 0xffb545, y: 30 * cube, spread: 0.08, rate: 8, count: 14 },
    flame: { y: 30 * cube },
    anim: 'flicker',
  };
}

// BRAZIER — iron bowl on legs, glowing coals (NEW)
export function propBrazier(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 19);
  const v = new Vox();
  const cube = 0.055;
  const IRON = 0x4a4d55, IRON_D = 0x33353c, IRON_HI = 0x6a6d78;
  const COAL = 0x1c1410, EMBER = 0xff5a1e, EMBER_HI = 0xffb545;
  // three legs
  for (const a of [0, 1, 2]) {
    const ang = (a / 3) * Math.PI * 2;
    const lx = Math.round(Math.cos(ang) * 4), lz = Math.round(Math.sin(ang) * 4);
    for (let y = 0; y <= 10; y++) v.add(Math.round(lx * (1 - y / 20)), y, Math.round(lz * (1 - y / 20)), y < 2 ? IRON_D : IRON);
  }
  // bowl
  v.ring(0, 0, 10, 15, 6, 6, IRON, 1.6);
  v.col(0, 0, 10, 11, 6, 6, IRON_D);       // bottom
  for (let a = 0; a < 30; a++) { const ang = a / 30 * Math.PI * 2; v.add(Math.round(Math.cos(ang) * 6), 15, Math.round(Math.sin(ang) * 6), IRON_HI); }
  // coals
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
    if (x * x + z * z <= 16) {
      const n = R();
      v.add(x, 12, z, n < 0.35 ? EMBER : (n < 0.5 ? EMBER_HI : COAL));
    }
  }
  return {
    name: 'brazier', voxels: v.list(), cube, blocks: true,
    glow: { color: 0xff7a2a, intensity: 12, dist: 9, decay: 1.7, y: 13 * cube, flicker: 2.2 },
    particles: { type: 'flame', color: 0xffb545, y: 15 * cube, spread: 0.22, rate: 10, count: 18 },
    flame: { y: 15 * cube, big: true },
    anim: 'flicker',
  };
}

// MUSHROOM CLUSTER — glowing caps (NEW)
export function propMushroom(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 23);
  const v = new Vox();
  const cube = 0.055;
  const STEM = 0xe8e0d0, STEM_D = 0xc7bda6, GILL = 0xc98a4a;
  const capHues = [0x49b6ff, 0x8a5cf0, 0x36d17a];
  const cap = capHues[Math.floor(R() * capHues.length)];
  const capHi = mix(cap, 0xffffff, 0.5), capD = shade(cap, 0.7);
  const n = 2 + Math.floor(R() * 3);
  let maxTop = 0;
  for (let i = 0; i < n; i++) {
    const cx = i === 0 ? 0 : Math.round((R() - 0.5) * 12);
    const cz = i === 0 ? 0 : Math.round((R() - 0.5) * 12);
    const H = (i === 0 ? 10 : 6) + Math.floor(R() * 5);
    const stemR = i === 0 ? 1.6 : 1.1;
    v.col(cx, cz, 0, H, stemR, stemR, STEM);
    v.col(cx, cz, 0, 2, stemR + 0.4, stemR + 0.4, STEM_D);   // foot
    // cap dome
    const capR = stemR + 2.5 + R();
    for (let x = -Math.ceil(capR); x <= Math.ceil(capR); x++) for (let z = -Math.ceil(capR); z <= Math.ceil(capR); z++) {
      const d = Math.hypot(x, z) / capR;
      if (d <= 1.02) {
        const yy = H + Math.round((1 - d * d) * 3);
        v.add(cx + x, yy, cz + z, d > 0.8 ? capD : (((x + z) & 1) ? cap : capHi));
        maxTop = Math.max(maxTop, yy);
      }
    }
    // gills under cap
    for (let x = -Math.floor(capR); x <= Math.floor(capR); x++) for (let z = -Math.floor(capR); z <= Math.floor(capR); z++) {
      if (Math.hypot(x, z) <= capR - 0.5) v.add(cx + x, H - 1, cz + z, GILL);
    }
    // glowing spots on cap
    for (let s = 0; s < 3; s++) if (R() < 0.7) v.add(cx + Math.round((R() - 0.5) * capR), H + 3, cz + Math.round((R() - 0.5) * capR), capHi);
  }
  return {
    name: 'mushroom', voxels: v.list(), cube,
    glow: { color: mix(cap, 0xffffff, 0.3), intensity: 3.2, dist: 5, decay: 2, y: maxTop * cube * 0.7, flicker: 0.4 },
    particles: { type: 'spore', color: capHi, y: maxTop * cube, spread: 0.3, rate: 0.8, count: 6 },
    anim: 'sway',
  };
}

// BONFIRE — unlit wood teepee in a stone ring (engine lights it).
export function propBonfire(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 29);
  const v = new Vox();
  const cube = 0.055;
  const STONE = 0x5a5560, STONE_D = 0x413d47, STONE_HI = 0x6f6a78;
  const WOOD = 0x6b4a2e, WOOD_D = 0x4a3320, WOOD_HI = 0x855f3a, ASH = 0x3a3630;
  // stone ring
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    const rr = 9;
    const bx = Math.round(Math.cos(ang) * rr), bz = Math.round(Math.sin(ang) * rr);
    const c = a % 3 === 0 ? STONE_HI : (a % 3 === 1 ? STONE_D : STONE);
    v.ellipsoid(bx, 1, bz, 2.4, 2, 2.4, c);
  }
  // ash bed
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (x * x + z * z <= 34) v.add(x, 0, z, ASH);
  // teepee logs
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const bx = Math.cos(ang) * 5, bz = Math.sin(ang) * 5;
    const len = 12;
    for (let k = 0; k <= len; k++) {
      const t = k / len;
      const x = Math.round(bx * (1 - t));
      const z = Math.round(bz * (1 - t));
      const y = 1 + Math.round(t * 11);
      const c = k % 4 === 0 ? WOOD_HI : (k % 4 === 2 ? WOOD_D : WOOD);
      v.add(x, y, z, c);
      if (k < len - 2) v.add(x, y, z + 1, WOOD_D);
    }
  }
  return { name: 'bonfire', voxels: v.list(), cube, blocks: true, bonfire: true };
}

// COBWEB corner (NEW, flat-ish) — subtle, no glow
export function propWebPile(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 31);
  const v = new Vox();
  const cube = 0.055;
  const WEB = 0xdad6ce, WEB_D = 0xa7a49c;
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI;
    for (let k = 0; k < 12; k++) {
      const x = Math.round(Math.cos(ang) * k);
      const y = Math.round(k * 0.9);
      if (R() < 0.7) v.add(x, y, Math.round(Math.sin(ang) * k * 0.2), (i + k) & 1 ? WEB : WEB_D);
    }
  }
  return { name: 'webpile', voxels: v.list(), cube };
}

// RUBBLE — small rock scatter (NEW, non-blocking ground detail)
export function propRubble(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 37);
  const v = new Vox();
  const cube = 0.055;
  for (let i = 0; i < 9; i++) {
    const cx = Math.round((R() - 0.5) * 14), cz = Math.round((R() - 0.5) * 14);
    const s = 1 + Math.floor(R() * 2);
    v.box(cx, 0, cz, cx + s, s, cz + s, speckle([ROCK, ROCK_D, ROCK_HI], cx, i, cz));
  }
  return { name: 'rubble', voxels: v.list(), cube };
}

// TENT — the Hermit's canvas A-frame (room 2). A proper 3D wedge:
// two sloped roof panels meeting at a ridge pole, open door flap,
// corner guy-ropes. Big enough to read as a real tent.
export function propTent(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 41);
  const v = new Vox();
  const cube = 0.07;
  const CANVAS = 0x9a7a4a, CANVAS_D = 0x7a5e38, CANVAS_HI = 0xb8975f;
  const POLE = 0x6b4a2e, POLE_D = 0x4a3320, ROPE = 0xc8b48a;
  const HALF = 13;        // half-width of the footprint (voxels)
  const DEPTH = 10;       // half-depth
  const TOP = 20;         // ridge height
  // ridge pole (runs along z, the long axis)
  for (let z = -DEPTH; z <= DEPTH; z++) v.add(0, TOP, z, z % 5 === 0 ? POLE : POLE_D);
  // roof: for each z slice the cross-section is a triangle (|x| up to the slope)
  for (let z = -DEPTH; z <= DEPTH; z++) {
    const door = z >= DEPTH - 3;   // the +z end is the open doorway
    for (let x = -HALF; x <= HALF; x++) {
      const h = Math.round((1 - Math.abs(x) / (HALF + 1)) * TOP);
      for (let y = 0; y <= h; y++) {
        if (door && y < 10 && Math.abs(x) <= 4) continue;   // door opening
        const c = (x + z + y) % 7 === 0 ? CANVAS_HI : ((x + z) & 1 ? CANVAS : CANVAS_D);
        v.add(x, y, z, c);
      }
    }
  }
  // roof apex highlight along the ridge
  for (let z = -DEPTH; z <= DEPTH; z += 2) v.add(0, TOP + 1, z, CANVAS_HI);
  // door flap (rolled to the side)
  for (let x = -4; x <= 4; x++) for (let y = 0; y <= 9; y++) v.add(x, y, DEPTH + 1, CANVAS_D);
  // corner guy-ropes
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    for (let k = 1; k <= 5; k++) v.add(sx * (HALF + k), Math.max(1, 4 - k), sz * (DEPTH + k), ROPE);
  }
  return { name: 'tent', voxels: v.list(), cube, blocks: true };
}

// CAMPFIRE — small lit fire ring (dressing; NOT the respawn bonfire)
export function propCampfire(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 43);
  const v = new Vox();
  const cube = 0.055;
  const STONE = 0x5a5560, STONE_D = 0x413d47, WOOD = 0x6b4a2e, WOOD_D = 0x4a3320, ASH = 0x3a3630;
  // stone ring (small)
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const rr = 6;
    v.ellipsoid(Math.round(Math.cos(ang) * rr), 1, Math.round(Math.sin(ang) * rr), 2, 1.8, 2, a % 3 === 0 ? STONE_D : STONE);
  }
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) if (x * x + z * z <= 18) v.add(x, 0, z, ASH);
  // criss-cross logs + flames
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const bx = Math.cos(ang) * 3.5, bz = Math.sin(ang) * 3.5;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      v.add(Math.round(bx * (1 - t)), 1 + Math.round(t * 6), Math.round(bz * (1 - t)), k % 3 === 0 ? WOOD_D : WOOD);
    }
  }
  for (let y = 1; y <= 8; y++) v.add(0, y, 0, y > 5 ? 0xffb545 : 0xff7a1f);
  v.add(1, 6, 0, 0xff7a1f); v.add(-1, 5, 0, 0xff9a2a); v.add(0, 6, 1, 0xff9a2a);
  return {
    name: 'campfire', voxels: v.list(), cube, blocks: true,
    glow: { color: 0xff7a2a, intensity: 10, dist: 8, decay: 1.7, y: 7 * cube, flicker: 2.4 },
    particles: { type: 'flame', color: 0xffb545, y: 8 * cube, spread: 0.16, rate: 9, count: 16 },
    flame: { y: 8 * cube, big: false },
    anim: 'flicker',
  };
}

// BEDROLL — a proper bed: thick blanket layers, rolled foot, pillow
// (the Hermit's bed). ~2.2 world units long.
export function propBedroll(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 47);
  const v = new Vox();
  const cube = 0.09;
  const BLANKET = 0x8a5a3a, BLANKET_D = 0x6e4630, BLANKET_HI = 0xa87a52;
  const PILLOW = 0xc8b89a, PILLOW_D = 0xb0a080;
  // mattress base (footprint ~19×11)
  for (let x = -9; x <= 9; x++) for (let z = -5; z <= 5; z++) {
    const c = (x + z) & 1 ? BLANKET_D : BLANKET;
    v.add(x, 0, z, c);
  }
  // folded blanket layers (thicker in the middle)
  for (let y = 1; y <= 3; y++) {
    for (let x = -7; x <= 7; x++) for (let z = -4; z <= 4; z++) {
      if (Math.abs(x) + y > 8) continue;
      const c = y === 3 ? BLANKET_HI : ((x + z) & 1 ? BLANKET : BLANKET_D);
      v.add(x, y, z, c);
    }
  }
  // rolled foot end (a fat roll at -x)
  for (let x = -11; x <= -8; x++) for (let z = -4; z <= 4; z++) {
    v.add(x, 1, z, BLANKET_D);
    if (Math.abs(z) <= 2) v.add(x, 2, z, BLANKET);
  }
  // pillow at the +x end
  v.box(7, 1, -3, 10, 3, 3, PILLOW);
  v.add(8, 4, 0, PILLOW_D); v.add(9, 4, 0, PILLOW);
  return { name: 'bedroll', voxels: v.list(), cube };
}

// CRATE — wooden supply crate (non-destructible dressing)
export function propCrate(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 53);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x8a6a44, W_D = 0x6e5232, W_HI = 0xa8825a, IRON = 0x50535c;
  v.box(-4, 0, -4, 4, 5, 4, speckle([W, W_D, W_HI], 3, 1, 7));
  // iron straps
  for (let y = 0; y <= 5; y++) { v.add(-4, y, 0, IRON); v.add(4, y, 0, IRON); v.add(0, y, -4, IRON); v.add(0, y, 4, IRON); }
  return { name: 'crate', voxels: v.list(), cube, blocks: true };
}

// SKELETON — a lying humanoid skeleton (skull + ribcage + spine + splayed
// limbs), read as a corpse in the shallow water. Flat so it hugs the floor.
export function propSkeleton(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 67);
  const v = new Vox();
  const cube = 0.055;
  const BONE = 0xe8e2cc, BONE_D = 0xccc5aa, BONE_DRK = 0xa89f84;
  // spine (lying along +z)
  for (let z = 0; z <= 6; z++) v.add(0, 0, z, R() < 0.35 ? BONE_D : BONE);
  // ribcage (a few low arcs over the spine)
  for (const z of [1, 2, 3]) for (let x = -2; x <= 2; x++) {
    const e = Math.abs(x) / 2.3;
    if (e * e < 1.0 - z * 0.05) v.add(x, 0, z, e > 0.7 ? BONE_D : BONE);
  }
  // pelvis + skull
  v.box(-2, 0, 4, 2, 0, 5, BONE_D);
  v.ellipsoid(0, 1, 7, 2, 1.6, 1.7, BONE);
  v.add(0, 0, 9, BONE_DRK);                 // jaw
  v.add(-1, 0, 7, BONE_D); v.add(1, 0, 7, BONE_D); // eye sockets
  // splayed arms
  for (let x = 3; x <= 6; x++) v.add(x, 0, 2, BONE_D);
  for (let x = -3; x >= -6; x--) v.add(x, 0, 2, BONE_D);
  v.add(5, 0, 1, BONE_DRK); v.add(-5, 0, 1, BONE_DRK);
  // thigh + shin bones (legs spread)
  for (let z = 5; z <= 7; z++) { v.add(1, 0, z, BONE_D); v.add(-1, 0, z, BONE_D); }
  for (let z = 6; z <= 8; z++) { v.add(2, 0, z, BONE_DRK); v.add(-2, 0, z, BONE_DRK); }
  return { name: 'skeleton', voxels: v.list(), cube, blocks: false };
}

// PUDDLE — flat murky water/ground stain (the narrator's "puddle") at the spawn.
export function propPuddle(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 61);
  const v = new Vox();
  const cube = 0.055;
  const MUD = 0x3a3328, WAT = 0x2f5346, WAT_D = 0x234238, WAT_HI = 0x4a7a68;
  for (let x = -5; x <= 5; x++) for (let z = -4; z <= 4; z++) {
    const dx = x / 5.4, dz = z / 4.4;
    if (dx * dx + dz * dz > 1.0 + R() * 0.35 - 0.2) continue;
    const edge = Math.max(Math.abs(dx / 1.2), Math.abs(dz));
    const c = edge > 0.86 ? (R() < 0.5 ? MUD : WAT_D) : (R() < 0.18 ? WAT_HI : (R() < 0.5 ? WAT : WAT_D));
    if (R() < 0.12) continue;                       // ragged shoreline holes
    v.add(x, 0, z, c);
  }
  return { name: 'puddle', voxels: v.list(), cube, blocks: false };
}

// BUCKET — a small wooden bucket (the narrator's "bucket", takeable at spawn).
export function propBucket(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 63);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x7a562f, W_D = 0x54391d, W_HI = 0x966f40, IRON = 0x4c4f58;
  // banded wooden cylinder, open top
  for (let y = 0; y <= 3; y++) v.ring(0, 0, y, y, 2.4, 2.4, speckle([W, W_D, W_HI], 10, y, 3), 1.3);
  // solid bottom
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (x * x + z * z <= 5) v.add(x, 0, z, W_D);
  // iron hoop bands
  v.ring(0, 0, 1, 1, 2.5, 2.5, IRON, 0.3);
  v.ring(0, 0, 3, 3, 2.45, 2.45, IRON, 0.5);
  // wire handle
  for (let a = 0; a <= 180; a += 12) {
    const rad = (a * Math.PI) / 180;
    v.add(Math.round(2.3 * Math.cos(rad)), 3 + Math.round(1.3 * Math.sin(rad)), 0, IRON);
  }
  return { name: 'bucket', voxels: v.list(), cube, blocks: false };
}

// WALL SCRATCHES — a low carved message / tally-mark stone (the narrator's "writing").
export function propScratches(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 65);
  const v = new Vox();
  const cube = 0.055;
  const STONE = 0x595e66, STONE_D = 0x3d4148, STONE_HI = 0x6f7580, MARK = 0xb6b0a2, MARK_D = 0x8a8478;
  // a low angled stone shard leaning near the wall
  for (let x = -3; x <= 3; x++) for (let y = 0; y <= 2; y++) for (let z = -2; z <= 2; z++) {
    const edge = Math.max(Math.abs(x) / 3, Math.abs(z) / 2);
    if (edge * edge + (y / 2.6) * (y / 2.6) > 1.05) continue;
    v.add(x, y, z, edge > 0.78 ? (R() < 0.5 ? STONE_D : STONE) : (R() < 0.25 ? STONE_D : STONE_HI));
  }
  // carved scratch marks (jagged tally lines)
  const taps = [[-2,3,0],[-1,3,0],[0,3,0],[1,3,0],[2,3,0],[-1,2,2],[0,2,2],[2,2,2],[0,2,-2],[-2,2,-2],[-1,1,-1],[1,1,1]];
  for (const [x, y, z] of taps) { v.add(x, y, z, R() < 0.5 ? MARK : MARK_D); }
  return { name: 'scratches', voxels: v.list(), cube, blocks: false };
}

// ── interactable visuals ── every lootable / prompt has a visible model ──

// BODY — a drowned armored corpse floating face-up (r7 floating body, r12 corpse)
export function propBody(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 71);
  const v = new Vox();
  const cube = 0.055;
  const SKIN = 0xc9b094, SKIN_D = 0xa88f74, ARMOR = 0x6a4a30, ARMOR_D = 0x4c3422, BOOT = 0x3a2a1a, CLOTH = 0x5a6a7a;
  // legs floating slightly apart
  for (let z = 4; z <= 8; z++) { v.add(1, 0, z, R() < 0.3 ? CLOTH : ARMOR_D); v.add(-1, 0, z, R() < 0.3 ? CLOTH : ARMOR_D); }
  v.add(1, 0, 9, BOOT); v.add(-1, 0, 9, BOOT);
  // armored torso
  for (let x = -2; x <= 2; x++) for (let z = 0; z <= 4; z++) v.add(x, 0, z, R() < 0.25 ? ARMOR_D : ARMOR);
  v.add(-2, 1, 1, ARMOR_D); v.add(2, 1, 1, ARMOR_D);
  // splayed arms
  for (let x = 3; x <= 6; x++) v.add(x, 0, 1, R() < 0.4 ? SKIN : ARMOR_D);
  for (let x = -3; x >= -6; x--) v.add(x, 0, 1, R() < 0.4 ? SKIN : ARMOR_D);
  v.add(6, 0, 0, SKIN_D); v.add(-6, 0, 0, SKIN_D);
  // head
  v.ellipsoid(0, 1, -1, 1.8, 1.4, 1.6, SKIN);
  v.add(0, 0, -3, SKIN_D); v.add(-1, 1, -2, 0x2a2420); v.add(1, 1, -2, 0x2a2420);
  return { name: 'body', voxels: v.list(), cube, blocks: false };
}

// MAT — a straw sleeping mat (r2 rest mat)
export function propMat(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 73);
  const v = new Vox();
  const cube = 0.055;
  const STRAW = 0xb09a58, STRAW_D = 0x8a7840, STRAW_HI = 0xcab274;
  for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) {
    if (Math.abs(x) > 3.6 || Math.abs(z) > 2.6) continue;
    v.add(x, 0, z, R() < 0.2 ? STRAW_HI : R() < 0.45 ? STRAW_D : STRAW);
  }
  for (let x = -4; x <= 4; x++) { v.add(x, 0, -3, STRAW_D); v.add(x, 0, 3, STRAW_D); }
  return { name: 'mat', voxels: v.list(), cube, blocks: false };
}

// WINE PRESS — heavy wooden press frame (r6)
export function propWinePress(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 75);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x7a5230, W_D = 0x54391d, IRON = 0x4c4f58;
  v.box(-4, 0, 0, -4, 5, 1, W_D); v.box(4, 0, 0, 4, 5, 1, W_D);
  v.box(-4, 5, -1, 4, 5, 2, W);
  v.box(-3, 0, -2, 3, 0, 2, W_D);
  v.box(-3, 0, -2, -3, 1, 2, W); v.box(3, 0, -2, 3, 1, 2, W);
  v.box(-3, 0, -2, 3, 1, -2, W); v.box(-3, 0, 2, 3, 1, 2, W);
  v.add(0, 3, 0, IRON); v.add(0, 4, 0, IRON); v.add(0, 6, 0, IRON); v.add(0, 6, 1, W); v.add(0, 6, -1, W);
  return { name: 'wine_press', voxels: v.list(), cube, blocks: false };
}

// WINE BOTTLE — standing bottle (r6 wine, r25 bubble bath)
export function propWineBottle(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 77);
  const v = new Vox();
  const cube = 0.055;
  const G = 0x2f6f3a, G_D = 0x235028, CORK = 0x6b4a2a;
  v.col(0, 0, 0, 1, 1.2, 1.2, G);
  v.col(0, 0, 1, 3, 0.55, 0.55, G_D);
  v.add(0, 3, 0, CORK);
  return { name: 'wine_bottle', voxels: v.list(), cube, blocks: false };
}

// BROKEN BOTTLE — jagged glass shards (r6)
export function propBrokenBottle(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 79);
  const v = new Vox();
  const cube = 0.055;
  const G = 0x2f6f3a, G_HI = 0x4a9a58;
  const shards = [[-2, 0, 0], [-1, 0, 1], [0, 0, 0], [1, 0, -1], [2, 0, 1], [-1, 1, 0], [1, 1, 0], [0, 1, 1], [0, 2, 0]];
  for (const [x, y, z] of shards) v.add(x, y, z, R() < 0.35 ? G_HI : G);
  return { name: 'broken_bottle', voxels: v.list(), cube, blocks: false };
}

// VALVE — pipe valve wheel (r8)
export function propValve(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 81);
  const v = new Vox();
  const cube = 0.055;
  const IRON = 0x4a4d55, IRON_D = 0x33353c, IRON_HI = 0x767a86;
  v.box(-1, 0, 0, 1, 2, 1, IRON_D);
  v.ring(0, 0, 2, 2, 2.2, 2.2, IRON, 1.4);
  v.add(0, 2, 0, IRON_HI);
  return { name: 'valve', voxels: v.list(), cube, blocks: false };
}

// PIPE — a large horizontal sewer pipe (r8)
export function propPipe(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 83);
  const v = new Vox();
  const cube = 0.06;
  const IRON = 0x4a4d55, IRON_D = 0x33353c, IRON_HI = 0x767a86, RUST = 0x6a4a30;
  const oct = [[3, 1], [2, 2], [1, 3], [-1, 3], [-2, 2], [-3, 1], [-3, -1], [-2, -2], [-1, -3], [1, -3], [2, -2], [3, -1]];
  for (let z = -4; z <= 4; z++) {
    for (const [x, y] of oct) {
      const c = R() < 0.12 ? RUST : (R() < 0.3 ? IRON_D : IRON);
      v.add(x, y + 3, z, c);
      v.add(x, y + 4, z, IRON_D);
    }
  }
  for (let a = 0; a < 360; a += 45) {
    const rad = (a * Math.PI) / 180;
    v.add(Math.round(4.2 * Math.cos(rad)), 3 + Math.round(4.2 * Math.sin(rad)), -4, IRON_HI);
    v.add(Math.round(4.2 * Math.cos(rad)), 3 + Math.round(4.2 * Math.sin(rad)), 4, IRON_HI);
  }
  return { name: 'pipe', voxels: v.list(), cube, blocks: false };
}

// SIGN — wooden sign board on a post (r9 door sign, r13 note, r22 note)
export function propSign(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 85);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x7a5230, W_D = 0x54391d, W_HI = 0x966f40;
  v.box(0, 0, 0, 0, 3, 0, W_D);
  v.box(-3, 3, -1, 3, 4, 1, W);
  v.box(-3, 3, 0, 3, 4, 0, W_HI);
  v.add(0, 4, 0, W_D);
  return { name: 'sign', voxels: v.list(), cube, blocks: false };
}

// BUNK — wooden bunk bed (r10 rest bunk, r16 bed)
export function propBunk(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 87);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x6b451f, W_D = 0x4a2f14, BLANKET = 0x5a3a4a, PILLOW = 0xe8e2d0;
  v.box(-4, 0, -3, -4, 3, 3, W_D); v.box(4, 0, -3, 4, 3, 3, W_D);
  v.box(-4, 0, -3, 4, 0, 3, W);
  v.box(-4, 1, -3, 4, 1, 3, BLANKET);
  v.box(-3, 1, 2, 3, 1, 2, PILLOW);
  v.box(-4, 2, -3, 4, 2, 3, W);
  v.box(-1, 3, -3, 1, 3, -3, W_D);
  return { name: 'bunk', voxels: v.list(), cube, blocks: false };
}

// FOOTLOCKER — small banded box (r10, r21)
export function propFootlocker(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 89);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x6b451f, W_D = 0x4a2f14, IRON = 0x4a4d55, IRON_HI = 0x767a86;
  v.box(-2, 0, -2, 2, 1, 2, W);
  v.box(-2, 1, -2, 2, 1, 2, W_D);
  v.box(-2, 0, 0, 2, 1, 0, IRON);
  v.add(0, 1, 2, IRON_HI);
  v.add(0, 2, 0, W_D);
  return { name: 'footlocker', voxels: v.list(), cube, blocks: false };
}

// DICE TABLE — low gambling table with dice (r10); reused for the map (r21)
export function propDiceTable(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 91);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x7a5230, W_D = 0x54391d, DICE = 0xe8e2cc, DICE_D = 0xcfc5aa;
  v.box(-3, 0, -2, -3, 2, 2, W_D); v.box(3, 0, -2, 3, 2, 2, W_D);
  v.box(-3, 0, -2, 3, 2, -2, W_D); v.box(-3, 0, 2, 3, 2, 2, W_D);
  v.box(-3, 2, -2, 3, 2, 2, W);
  v.add(-1, 3, 0, DICE); v.add(0, 3, 0, DICE_D); v.add(1, 3, 0, DICE);
  v.add(-1, 3, 1, DICE_D); v.add(1, 3, 1, DICE);
  return { name: 'dice_table', voxels: v.list(), cube, blocks: false };
}

// NEST — shredded bedding pile (r11)
export function propNest(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 93);
  const v = new Vox();
  const cube = 0.055;
  const STRAW = 0xb09a58, STRAW_D = 0x8a7840, CLOTH = 0x8a7a6a;
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const d = Math.max(Math.abs(x) / 3.2, Math.abs(z) / 3.2);
    if (d > 1) continue;
    const h = Math.round(Math.max(0, (1 - d) * 2.2 + R() * 0.8));
    for (let y = 0; y <= h; y++) v.add(x, y, z, R() < 0.2 ? CLOTH : (R() < 0.5 ? STRAW : STRAW_D));
  }
  return { name: 'nest', voxels: v.list(), cube, blocks: false };
}

// DRAIN — iron floor grate (r12)
export function propDrain(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 95);
  const v = new Vox();
  const cube = 0.055;
  const IRON = 0x4a4d55, IRON_D = 0x33353c;
  v.box(-3, 0, -3, 3, 0, 3, IRON_D);
  for (let x = -2; x <= 2; x++) v.add(x, 0, 0, IRON);
  for (let x = -2; x <= 2; x++) { v.add(x, 0, -2, IRON); v.add(x, 0, 2, IRON); }
  v.add(0, 0, -1, IRON_D); v.add(0, 0, 1, IRON_D);
  return { name: 'drain', voxels: v.list(), cube, blocks: false };
}

// WRENCH — heavy pipe wrench (r14)
export function propWrench(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 97);
  const v = new Vox();
  const cube = 0.055;
  const IRON = 0x5a5e68, IRON_D = 0x3d4048, IRON_HI = 0x8a8f9c;
  v.box(-1, 0, 0, 1, 0, 4, IRON);
  v.box(-1, 1, 0, 1, 1, 4, IRON_D);
  v.box(-2, 0, 4, -1, 0, 6, IRON_HI); v.box(1, 0, 4, 2, 0, 6, IRON_HI);
  v.box(-2, 1, 4, -1, 1, 6, IRON); v.box(1, 1, 4, 2, 1, 6, IRON);
  v.add(0, 0, -1, IRON_D);
  return { name: 'wrench', voxels: v.list(), cube, blocks: false };
}

// PLUNGER — stick + rubber cup (r14)
export function propPlunger(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 99);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x7a5230, RUB = 0x5a2a2a, RUB_D = 0x3d1c1c;
  v.box(0, 1, 0, 0, 4, 0, W);
  v.col(0, 0, 0, 1, 2.0, 2.0, RUB);
  v.ring(0, 0, 0, 0, 2.4, 2.4, RUB_D, 1.2);
  return { name: 'plunger', voxels: v.list(), cube, blocks: false };
}

// PIPE FITTING — threaded ring, the helmet (r14)
export function propPipeFitting(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 101);
  const v = new Vox();
  const cube = 0.055;
  const IRON = 0x5a5e68, IRON_D = 0x3d4048, IRON_HI = 0x8a8f9c;
  v.ring(0, 0, 0, 2, 2.8, 2.8, IRON, 1.3);
  v.ring(0, 0, 0, 2, 3.6, 3.6, IRON_D, 1.5);
  for (let a = 0; a < 360; a += 90) {
    const rad = (a * Math.PI) / 180;
    v.add(Math.round(4.4 * Math.cos(rad)), 1, Math.round(4.4 * Math.sin(rad)), IRON_HI);
  }
  return { name: 'pipe_fitting', voxels: v.list(), cube, blocks: false };
}

// TOOLBOX — metal box with handle (r14)
export function propToolbox(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 103);
  const v = new Vox();
  const cube = 0.055;
  const IRON = 0x5a5e68, IRON_D = 0x3d4048, IRON_HI = 0x8a8f9c;
  v.box(-2, 0, -2, 2, 1, 2, IRON);
  v.box(-2, 1, -2, 2, 1, 2, IRON_D);
  v.box(-2, 1, 0, 2, 1, 0, IRON_HI);
  v.box(-1, 2, 0, 1, 2, 0, IRON_D);
  return { name: 'toolbox', voxels: v.list(), cube, blocks: false };
}

// CHEST — plain chest prop (reuses the destructible chest model)
export function propChest(seed = 0.5) {
  const m = destrChest(seed);
  return { name: 'chest', voxels: m.voxels, cube: m.cube, blocks: false };
}

// MIRROR — standing mirror (r16)
export function propMirror(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 105);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x6b451f, W_D = 0x4a2f14, GLASS = 0x9fc4d8, GLASS_HI = 0xd8ecf5;
  v.box(-2, 0, 0, -2, 4, 0, W_D); v.box(2, 0, 0, 2, 4, 0, W_D);
  v.box(-2, 4, -1, 2, 4, 1, W);
  v.box(-1, 1, 0, 1, 4, 0, GLASS);
  v.add(0, 2, 0, GLASS_HI);
  return { name: 'mirror', voxels: v.list(), cube, blocks: false };
}

// COMPASS — floor mosaic compass rose (r18)
export function propCompass(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 107);
  const v = new Vox();
  const cube = 0.055;
  const STONE = 0x595e66, STONE_D = 0x3d4148, GOLD = 0xc9a227, GOLD_D = 0x8a6d14;
  v.box(-4, 0, -4, 4, 0, 4, STONE);
  for (let i = -3; i <= 3; i++) {
    v.add(i, 0, 0, R() < 0.5 ? GOLD : GOLD_D);
    v.add(0, 0, i, R() < 0.5 ? GOLD : GOLD_D);
  }
  v.add(0, 0, 0, GOLD);
  v.add(1, 0, 1, STONE_D); v.add(-1, 0, 1, STONE_D); v.add(1, 0, -1, STONE_D); v.add(-1, 0, -1, STONE_D);
  return { name: 'compass', voxels: v.list(), cube, blocks: false };
}

// FOUNTAIN — stone basin with murky water (r18)
export function propFountain(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 109);
  const v = new Vox();
  const cube = 0.055;
  const STONE = 0x6a6e75, STONE_D = 0x4c5057, WAT = 0x2f5346, WAT_HI = 0x4a7a68;
  v.ring(0, 0, 0, 2, 3.2, 3.2, STONE, 1.6);
  v.ring(0, 0, 0, 0, 4.2, 4.2, STONE_D, 1.8);
  v.col(0, 0, 0, 0, 1.9, 1.9, WAT);
  v.add(0, 0, 0, WAT_HI); v.add(1, 0, 1, WAT_HI); v.add(-1, 0, -1, WAT_HI);
  return { name: 'fountain', voxels: v.list(), cube, blocks: false };
}

// WELL — stone well with winch frame (r20)
export function propWell(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 111);
  const v = new Vox();
  const cube = 0.07;
  const STONE = 0x6a6e75, STONE_D = 0x4c5057, WOOD = 0x6b451f;
  v.ring(0, 0, 0, 3, 3.6, 3.6, R() < 0.2 ? STONE_D : STONE, 1.8);
  v.ring(0, 0, 3, 3, 4.0, 4.0, STONE_D, 1.6);
  v.box(-3, 3, 0, -3, 6, 0, WOOD); v.box(3, 3, 0, 3, 6, 0, WOOD);
  v.box(-3, 6, -1, 3, 6, 1, WOOD);
  v.box(-1, 4, -1, 1, 5, 1, WOOD);
  return { name: 'well', voxels: v.list(), cube, blocks: false };
}

// CAULDRON — stew pot (r21)
export function propCauldron(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 113);
  const v = new Vox();
  const cube = 0.055;
  const IRON = 0x4a4d55, IRON_D = 0x33353c, STEW = 0x6a4a2a, STEW_HI = 0x8a5c34;
  v.col(0, 0, 0, 2, 2.4, 2.4, IRON);
  v.ring(0, 0, 0, 0, 2.8, 2.8, IRON_D, 1.4);
  v.col(0, 0, 0, 0, 1.2, 1.2, STEW);
  v.add(0, 2, 0, STEW_HI);
  return { name: 'cauldron', voxels: v.list(), cube, blocks: false };
}

// WEAPON RACK — posts with axe / spear / mace (r22)
export function propWeaponRack(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 115);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x6b451f, W_D = 0x4a2f14, STEEL = 0x767a86, STEEL_D = 0x4a4d55, RUST = 0x7a4a2a, WOOD = 0x8a5c2e;
  v.box(-4, 0, 0, -4, 4, 1, W_D); v.box(4, 0, 0, 4, 4, 1, W_D);
  v.box(-4, 3, 0, 4, 3, 1, W);
  v.box(-4, 1, 0, 4, 1, 1, W);
  v.box(-3, 2, 0, -2, 4, 0, WOOD); v.box(-3, 2, 0, -3, 3, 0, STEEL);
  v.box(0, 1, 1, 0, 4, 1, WOOD); v.add(0, 4, 1, STEEL);
  v.box(2, 2, 0, 3, 4, 0, WOOD); v.box(2, 2, 0, 3, 2, 0, RUST);
  return { name: 'weapon_rack', voxels: v.list(), cube, blocks: false };
}

// ALTAR — stone block with a soap dish (r23)
export function propAltar(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 117);
  const v = new Vox();
  const cube = 0.055;
  const STONE = 0x6a6e75, STONE_D = 0x4c5057, STONE_HI = 0x8a8f96, SOAP = 0xf0a8c0;
  v.box(-3, 0, -2, 3, 2, 2, STONE);
  v.box(-3, 2, -2, 3, 2, 2, STONE_D);
  v.box(-3, 3, -2, 3, 3, 2, STONE_HI);
  v.add(0, 4, 0, SOAP); v.add(0, 4, 1, SOAP);
  return { name: 'altar', voxels: v.list(), cube, blocks: false };
}

// THRONE — goblin throne (r24)
export function propThrone(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 119);
  const v = new Vox();
  const cube = 0.06;
  const W = 0x5a3a1e, W_D = 0x3e2814, W_HI = 0x7a5230, BONE = 0xe8e2cc;
  v.box(-3, 0, -2, 3, 1, 2, W_D);
  v.box(-3, 1, -2, 3, 3, -2, W);
  v.box(-3, 1, -2, -3, 4, 2, W); v.box(3, 1, -2, 3, 4, 2, W);
  v.box(-4, 4, -2, -3, 4, 2, W_HI); v.box(3, 4, -2, 4, 4, 2, W_HI);
  v.add(0, 4, -2, BONE); v.add(-2, 4, -2, BONE); v.add(2, 4, -2, BONE);
  return { name: 'throne', voxels: v.list(), cube, blocks: false };
}

// BANNER — hanging goblin banner (r24)
export function propBanner(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 121);
  const v = new Vox();
  const cube = 0.055;
  const CLOTH = 0x8a2a2a, CLOTH_D = 0x5c1c1c, CLOTH_HI = 0xb04040, GOLD = 0xc9a227, W_D = 0x4a2f14;
  v.box(-2, 0, 0, 2, 3, 0, CLOTH);
  v.box(-2, 3, 0, 2, 3, 0, CLOTH_D);
  v.box(-3, 3, -1, 3, 4, 1, W_D);
  v.add(0, 1, 0, GOLD); v.add(-1, 2, 0, GOLD); v.add(1, 2, 0, GOLD); v.add(0, 2, 0, CLOTH_HI);
  return { name: 'banner', voxels: v.list(), cube, blocks: false };
}

// DUCK — rubber duck (r25)
export function propDuck(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 123);
  const v = new Vox();
  const cube = 0.05;
  const Y = 0xf0c040, Y_D = 0xc99a28, BEAK = 0xe07830, EYE = 0x1a1a1a;
  v.ellipsoid(0, 0, 0, 1.6, 1.2, 2.0, Y);
  v.ellipsoid(0, 1.2, -1.0, 1.0, 1.0, 1.0, Y);
  v.add(0, 1.2, -2.0, BEAK);
  v.add(-0.7, 1.5, -1.6, EYE); v.add(0.7, 1.5, -1.6, EYE);
  v.add(0, 0.6, 2.2, Y_D);
  return { name: 'duck', voxels: v.list(), cube, blocks: false };
}

// TOWEL — rolled towel on a rack bar (r25)
export function propTowel(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 125);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x6b451f, CLOTH = 0xe8e2d0, CLOTH_D = 0xcfc5aa;
  v.box(-3, 0, 0, 3, 0, 0, W);
  v.box(-3, 1, -1, 3, 1, 1, CLOTH);
  v.box(-3, 1, 0, 3, 1, 0, CLOTH_D);
  v.add(-3, 1, 0, CLOTH_D); v.add(3, 1, 0, CLOTH_D);
  return { name: 'towel', voxels: v.list(), cube, blocks: false };
}

// ── NEW THEMED FURNITURE (floor-50 dressing pass) ─────────────

// ARMOR STAND — wooden mannequin holding a chestplate (armory)
export function propArmorStand(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 131);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x6b451f, W_D = 0x4a2f14, METAL = 0x8a8f9c, METAL_D = 0x5a5e68, CLOTH = 0x7a2a2a, GOLD = 0xc9a227;
  v.box(-2, 0, 0, -2, 5, 0, W_D); v.box(2, 0, 0, 2, 5, 0, W_D);   // legs
  v.box(-2, 0, -1, 2, 0, 1, W);                                   // feet bar
  v.box(0, 0, 0, 0, 6, 0, W);                                     // central post
  v.box(-3, 5, 0, 3, 5, 0, W);                                    // shoulder bar
  v.box(-3, 2, 0, 3, 5, 1, METAL);                                // chestplate front
  v.box(-3, 2, 1, 3, 4, 1, METAL_D);
  v.add(0, 5, 1, GOLD); v.add(-2, 3, 1, CLOTH); v.add(2, 3, 1, CLOTH);
  return { name: 'armor_stand', voxels: v.list(), cube, blocks: false };
}

// SHIELD RACK — row of round shields on a wall rack (armory)
export function propShieldRack(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 133);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x6b451f, W_D = 0x4a2f14, SH = 0x8a2a2a, SH_D = 0x5c1c1c, SH_HI = 0xb04040, BAND = 0xc9a227;
  v.box(-4, 0, 0, 4, 5, 1, W_D);     // frame back
  v.box(-4, 4, 0, 4, 5, 1, W);       // top rail
  v.box(-4, 0, 0, -4, 5, 1, W); v.box(4, 0, 0, 4, 5, 1, W);
  for (const sx of [-3, 0, 3]) {
    v.ellipsoid(sx, 3, 1.2, 2.0, 2.0, 0.5, SH);     // round shield
    v.ellipsoid(sx, 3, 1.2, 0.9, 0.9, 0.7, SH_HI);  // boss
    v.add(sx, 3, 1.7, BAND);                          // rim stud
  }
  return { name: 'shield_rack', voxels: v.list(), cube, blocks: false };
}

// BOOKSHELF — tall wooden shelf with coloured book spines
export function propBookshelf(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 135);
  const v = new Vox();
  const cube = 0.055;
  const W = 0x6b451f, W_D = 0x4a2f14;
  const BOOKS = [0x8a2a2a, 0x2a4a8a, 0x2a8a4a, 0xc9a227, 0x6a2a8a, 0x444a55, 0x8a5a2a];
  v.box(-3, 0, -1, 3, 7, 1, W_D);
  v.box(-3, 0, -1, -3, 7, 1, W); v.box(3, 0, -1, 3, 7, 1, W);
  v.box(-3, 7, -1, 3, 7, 1, W);
  for (const y of [2, 4, 6]) v.box(-3, y, -1, 3, y, 1, W_D);          // shelves
  for (const y of [1, 3, 5]) for (let x = -2; x <= 2; x++) {
    const c = BOOKS[Math.floor(R() * BOOKS.length)];
    v.box(x, y, -1, x, y + 1, 1, c);                                  // books
  }
  return { name: 'bookshelf', voxels: v.list(), cube, blocks: false };
}

// RUG — flat coloured floor mat (non-blocking, no light)
export function propRug(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 137);
  const v = new Vox();
  const cube = 0.05;
  const A = 0x6a2a2a, B = 0xc9a227, C = 0x5c1c1c, D = 0x3a1c1c;
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
    const d = Math.max(Math.abs(x) / 4.2, Math.abs(z) / 4.2);
    if (d > 1) continue;
    v.add(x, 0, z, d > 0.8 ? B : (d > 0.5 ? (R() < 0.5 ? A : C) : (R() < 0.4 ? D : A)));
  }
  return { name: 'rug', voxels: v.list(), cube, blocks: false };
}

// TAPESTRY — wall hanging (throne / armory / bath)
export function propTapestry(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 139);
  const v = new Vox();
  const cube = 0.055;
  const CL = 0x3a4a8a, CL_D = 0x26305f, GOLD = 0xc9a227, W_D = 0x4a2f14;
  v.box(-3, 0, -1, 3, 7, 1, CL);
  v.box(-3, 0, 0, 3, 0, 1, CL_D); v.box(-3, 7, 0, 3, 7, 1, CL_D);
  v.box(-4, 7, -1, 4, 7, 1, W_D);                                    // top rod
  v.add(-1, 3, 0, GOLD); v.add(1, 3, 0, GOLD); v.add(0, 5, 0, CL_D); v.add(0, 2, 0, GOLD);
  return { name: 'tapestry', voxels: v.list(), cube, blocks: false };
}

// CHANDELIER — hanging iron ring with candles (adds a soft light)
export function propChandelier(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 141);
  const v = new Vox();
  const cube = 0.05;
  const IRON = 0x4a4d55, IRON_D = 0x33353c, FLAME = 0xffb24a, WAX = 0xe8e2cc;
  v.ring(0, 0, 0, 0, 3.0, 3.0, IRON, 1.0);
  v.ring(0, 0, 0, 0, 1.4, 1.4, IRON_D, 0.7);
  for (let a = 0; a < 360; a += 60) {
    const rad = (a * Math.PI) / 180;
    const cx = Math.round(3 * Math.cos(rad)), cz = Math.round(3 * Math.sin(rad));
    v.box(cx, 0, cz, cx, 1, cz, WAX);
    v.add(cx, 2, cz, FLAME);
  }
  return { name: 'chandelier', voxels: v.list(), cube, blocks: false, hang: true,
    glow: { color: 0xffb24a, intensity: 1.5, dist: 16, decay: 2, y: 0, flicker: 0.3 }, flame: true };
}

// BARREL — decorative (NON-blocking) staved barrel for clutter
export function propBarrel(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 143);
  const v = new Vox();
  const cube = 0.055;
  const WOOD = 0x8a5c2e, WOOD_D = 0x5a3a1e, IRON = 0x4a4d55;
  v.col(0, 0, 0, 0, 4, 0, 1.8, 1.8, WOOD);
  v.ring(0, 0, 0, 1, 2.0, 2.0, IRON, 0.8);
  v.ring(0, 0, 0, 3, 2.0, 2.0, IRON, 0.8);
  v.box(-1, 4, -1, 1, 4, 1, WOOD_D);
  v.add(0, 5, 0, WOOD_D);
  return { name: 'barrel', voxels: v.list(), cube, blocks: false };
}
export const PROP_BUILDERS = {
  stalagmite: propStalagmite,
  stalactite: propStalactite,
  crystal: propCrystal,
  crystal_blue: propCrystalBlue,
  crystal_green: propCrystalGreen,
  boulder: propBoulder,
  bones: propBones,
  torch: propTorch,
  brazier: propBrazier,
  mushroom: propMushroom,
  bonfire: propBonfire,
  webpile: propWebPile,
  rubble: propRubble,
  tent: propTent,
  campfire: propCampfire,
  bedroll: propBedroll,
  crate: propCrate,
  puddle: propPuddle,
  bucket: propBucket,
  scratches: propScratches,
  skeleton: propSkeleton,
  // interactable visuals — every lootable / prompt has a visible model
  body: propBody,
  mat: propMat,
  wine_press: propWinePress,
  wine_bottle: propWineBottle,
  broken_bottle: propBrokenBottle,
  valve: propValve,
  pipe: propPipe,
  sign: propSign,
  bunk: propBunk,
  footlocker: propFootlocker,
  dice_table: propDiceTable,
  nest: propNest,
  drain: propDrain,
  wrench: propWrench,
  plunger: propPlunger,
  pipe_fitting: propPipeFitting,
  toolbox: propToolbox,
  chest: propChest,
  mirror: propMirror,
  compass: propCompass,
  fountain: propFountain,
  well: propWell,
  cauldron: propCauldron,
  weapon_rack: propWeaponRack,
  altar: propAltar,
  throne: propThrone,
  banner: propBanner,
  duck: propDuck,
  towel: propTowel,
  armor_stand: propArmorStand,
  shield_rack: propShieldRack,
  bookshelf: propBookshelf,
  rug: propRug,
  tapestry: propTapestry,
  chandelier: propChandelier,
  barrel: propBarrel,
};

// ══════════════════════════════════════════════════════════════
//  DESTRUCTIBLE PROP BUILDERS (smashable — crates, barrels, …)
//  Returned { voxels, cube, palette } — palette drives debris FX.
// ══════════════════════════════════════════════════════════════
const WOOD = 0x8d6238, WOOD_D = 0x5f3e22, WOOD_M = 0x7a5230, WOOD_HI = 0xa87c48;
const IRON2 = 0x4a4d55, IRON_D = 0x33353c, IRON_HI2 = 0x767a86, NAIL = 0x2b2926;
const CLAY = 0xb06a3a, CLAY_D = 0x854c26, CLAY_HI = 0xcb8757, CLAY_PAINT = 0x2f6f8f;
const GOLD2 = 0xf5c542, GOLD_D = 0xc79a25;
const CLOTH = 0xb8a06a, CLOTH_D = 0x8f7a4c, ROPE = 0x6b5836;

// CRATE — plank box with iron corner brackets & nails
export function destrCrate(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 101);
  const v = new Vox();
  const cube = 0.055;
  const N = 11;          // 0..11
  const plank = (x, y, z) => {
    // vertical plank grooves every 3 cols on x/z faces
    const groove = (Math.abs(z) % 3 === 0) || (Math.abs(x) % 3 === 0);
    const n = ((x * 7 + y * 13 + z * 5) & 3);
    return groove ? WOOD_D : (n === 0 ? WOOD_HI : (n === 1 ? WOOD_M : WOOD));
  };
  for (let x = 0; x <= N; x++) for (let y = 0; y <= N; y++) for (let z = 0; z <= N; z++) {
    const bx = x === 0 || x === N, by = y === 0 || y === N, bz = z === 0 || z === N;
    const edges = (bx ? 1 : 0) + (by ? 1 : 0) + (bz ? 1 : 0);
    if (edges === 0) continue;
    const px = x - N / 2, pz = z - N / 2;
    let c = plank(px, y, pz);
    if (edges >= 2) c = WOOD_D;                    // corner posts
    v.add(px, y, pz, c);
  }
  // iron corner brackets
  for (const cx of [0, N]) for (const cz of [0, N]) for (const cy of [1, N - 1]) {
    for (const [dx, dz] of [[0, 0], [Math.sign(N / 2 - cx) || 1, 0], [0, Math.sign(N / 2 - cz) || 1]]) {
      v.add(cx - N / 2 + dx, cy, cz - N / 2 + dz, IRON2);
    }
  }
  // nails on faces
  for (let i = 0; i < 8; i++) v.add(Math.round((R() - 0.5) * N), Math.round(R() * N), N - N / 2, NAIL);
  return { name: 'crate', voxels: v.list(), cube, palette: [WOOD, WOOD_D, WOOD_M, IRON2] };
}

// BARREL — curved staves, iron hoops, lid
export function destrBarrel(seed = 0.5) {
  const v = new Vox();
  const cube = 0.055;
  const H = 13;
  for (let y = 0; y <= H; y++) {
    const t = y / H;
    const r = 3.2 + Math.sin(t * Math.PI) * 1.7;     // belly bulge
    const hoop = y === 1 || y === H - 1 || y === Math.round(H / 2);
    const n = Math.ceil(r);
    for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
      const d = Math.hypot(x, z);
      if (d <= r && d > r - 1.25) {
        let c;
        if (hoop) c = ((x + z) & 1) ? IRON2 : IRON_HI2;
        else {
          const stave = (Math.round(Math.atan2(z, x) / (Math.PI * 2) * 16) & 1);
          c = stave ? WOOD_M : WOOD;
        }
        v.add(x, y, z, c);
      }
    }
  }
  // top lid
  const lr = 3.0;
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (Math.hypot(x, z) <= lr) v.add(x, H, z, ((x + z) & 1) ? WOOD_D : WOOD_M);
  v.add(0, H, 0, IRON2);
  return { name: 'barrel', voxels: v.list(), cube, palette: [WOOD_M, WOOD_D, IRON2] };
}

// VASE — clay urn with painted band
export function destrVase(seed = 0.5) {
  const v = new Vox();
  const cube = 0.055;
  const profile = [2.0, 2.6, 3.2, 3.6, 3.4, 2.6, 1.6, 1.4, 1.8, 2.0]; // base→belly→neck→lip
  for (let y = 0; y < profile.length; y++) {
    const r = profile[y];
    const n = Math.ceil(r);
    const band = y === 4 || y === 5;
    for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
      const d = Math.hypot(x, z);
      if (d <= r && (y === 0 || d > r - 1.2)) {
        let c = ((x + z + y) & 1) ? CLAY : CLAY_HI;
        if (band) c = ((x + z) & 1) ? CLAY_PAINT : shade(CLAY_PAINT, 1.25);
        if (y === profile.length - 1) c = CLAY_D;   // lip
        v.add(x, y, z, c);
      }
    }
  }
  return { name: 'vase', voxels: v.list(), cube, palette: [CLAY, CLAY_D, CLAY_PAINT] };
}

// CHEST — wooden body, curved lid, iron bands, gold lock
export function destrChest(seed = 0.5) {
  const v = new Vox();
  const cube = 0.055;
  const W = 12, D = 8, HB = 6;   // body dims
  // body shell
  for (let x = 0; x <= W; x++) for (let y = 0; y <= HB; y++) for (let z = 0; z <= D; z++) {
    const b = x === 0 || x === W || y === 0 || z === 0 || z === D;
    if (!b) continue;
    const px = x - W / 2, pz = z - D / 2;
    let c = ((x + z) & 1) ? WOOD : WOOD_M;
    if (x <= 1 || x >= W - 1) c = WOOD_D;
    v.add(px, y, pz, c);
  }
  // curved lid (half cylinder along x)
  for (let x = 0; x <= W; x++) for (let a = 0; a <= 8; a++) {
    const ang = (a / 8) * Math.PI;
    const yy = HB + Math.round(Math.sin(ang) * 4);
    const zz = Math.round(-Math.cos(ang) * (D / 2));
    const px = x - W / 2;
    let c = ((x + a) & 1) ? WOOD : WOOD_M;
    if (x <= 1 || x >= W - 1) c = WOOD_D;
    v.add(px, yy, zz, c);
  }
  // iron bands across the lid + body
  for (const bx of [-W / 2 + 2, W / 2 - 2]) {
    for (let y = 0; y <= HB; y++) v.add(bx, y, D / 2, IRON2);
    for (let a = 0; a <= 8; a++) { const ang = (a / 8) * Math.PI; v.add(bx, HB + Math.round(Math.sin(ang) * 4), Math.round(-Math.cos(ang) * (D / 2)), IRON_HI2); }
  }
  // gold lock
  v.box(-1, HB - 1, D / 2, 1, HB + 1, D / 2, GOLD2);
  v.add(0, HB, D / 2, GOLD_D);
  return { name: 'chest', voxels: v.list(), cube, palette: [WOOD_D, WOOD_M, GOLD2, IRON2] };
}

// SACK — tied cloth bag (NEW)
export function destrSack(seed = 0.5) {
  const R = rng(Math.floor(seed * 1000) + 103);
  const v = new Vox();
  const cube = 0.055;
  const H = 11;
  for (let y = 0; y <= H; y++) {
    const t = y / H;
    // fat bottom, pinched neck near top
    let r = 3.4 * (1 - Math.pow(Math.max(0, t - 0.15) / 0.85, 1.6));
    if (t > 0.72) r = 1.3;                          // neck
    r = Math.max(0.8, r);
    const n = Math.ceil(r);
    for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
      const d = Math.hypot(x, z);
      if (d <= r) {
        const fold = (Math.round(Math.atan2(z, x) / (Math.PI * 2) * 10) & 1);
        v.add(x, y, z, fold ? CLOTH : CLOTH_D);
      }
    }
  }
  // rope tie at the neck
  for (let a = 0; a < 12; a++) { const ang = a / 12 * Math.PI * 2; v.add(Math.round(Math.cos(ang) * 1.6), Math.round(H * 0.75), Math.round(Math.sin(ang) * 1.6), ROPE); }
  // frilled open top
  for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; v.add(Math.round(Math.cos(ang) * 1.4), H, Math.round(Math.sin(ang) * 1.4), CLOTH_D); }
  return { name: 'sack', voxels: v.list(), cube, palette: [CLOTH, CLOTH_D, ROPE] };
}

// URN — bone-ash urn with skull motif (NEW)
export function destrUrn(seed = 0.5) {
  const v = new Vox();
  const cube = 0.055;
  const profile = [2.2, 2.8, 3.2, 3.0, 2.4, 2.0, 2.4, 2.6];
  for (let y = 0; y < profile.length; y++) {
    const r = profile[y]; const n = Math.ceil(r);
    for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
      const d = Math.hypot(x, z);
      if (d <= r && (y === 0 || d > r - 1.2)) v.add(x, y, z, ((x + z) & 1) ? CLAY_D : shade(CLAY_D, 1.2));
    }
  }
  // skull motif on the belly (front z+)
  const fz = 3;
  v.box(-1, 2, fz, 1, 3, fz, 0xe6e0d0);
  v.add(-1, 3, fz + 1, 0x2a2620); v.add(1, 3, fz + 1, 0x2a2620);   // eye sockets
  v.add(0, 1, fz, 0xe6e0d0);
  return { name: 'urn', voxels: v.list(), cube, palette: [CLAY_D, 0xe6e0d0, 0x2a2620] };
}

export const DESTRUCTIBLE_BUILDERS = {
  crate: destrCrate,
  barrel: destrBarrel,
  vase: destrVase,
  chest: destrChest,
  sack: destrSack,
  urn: destrUrn,
};

// ══════════════════════════════════════════════════════════════
//  MONSTERS — orc / goblin / hobgoblin. Authored ONCE here as
//  per-part voxel lists + world-space pivots, so both the animated
//  in-game rig (characters.ts) and the .vox exporter share it.
//  Part names & pivots match the chibi rig contract used by
//  updateRig()/the engine (do not rename).
// ══════════════════════════════════════════════════════════════
export function orcModel(scheme, weapon) {
  const C = 0.05;
  const martial = weapon === 'sword' || weapon === 'mace' || weapon === 'club';
  const boss = (scheme.bulk ?? 1) > 1;
  const skin = scheme.skin;
  const skinD = shade(skin, 0.82), skinD2 = shade(skin, 0.66), skinHI = shade(skin, 1.14);
  const cloth = scheme.cloth, clothD = shade(cloth, 0.78);
  const accent = scheme.accent, accentD = shade(accent, 0.72), accentHI = shade(accent, 1.2);
  const hair = scheme.hair, hairHI = shade(hair, 1.5);
  const TUSKC = 0xf2ede0, TUSK_D = 0xd6ccb4, BROWC = 0x201810, NAILC = 0x241c14;
  const WAR = boss ? 0xb23636 : 0xcf3f2f;
  const eyeCol = boss ? 0xff4a2a : 0xffcf3a;
  const build = (fn) => { const v = new Vox(); fn(v); return v.list(); };

  const leg = build((v) => {
    v.col(0, 0, 0, 3, 2.0, 1.9, skin);            // thigh
    v.col(0, 0, -5, 0, 1.5, 1.5, skin);           // shin
    v.ellipsoid(0, -1, 1, 1.7, 1.2, 1.5, skinHI); // knee
    v.box(-2, -4, -2, 2, -4, 2, accent);          // ankle wrap
    v.box(-2, -6, 0, 2, -5, 3, skinD);            // foot
    v.add(1, -6, 4, NAILC); v.add(-1, -6, 4, NAILC); v.add(0, -6, 4, NAILC);
    v.ellipsoid(0, 2, 0, 2.1, 1.4, 1.9, skinD2);
  });
  const arm = build((v) => {
    v.ellipsoid(0, 2, 0, 2.0, 1.9, 1.8, skin);
    v.col(0, 0, -5, 2, 1.5, 1.5, skin);
    v.ellipsoid(0, -1, 0.5, 1.5, 1.1, 1.4, skinHI);
    v.box(-2, -5, -2, 2, -5, 2, accent);
    v.ellipsoid(0, 3, -1, 1.8, 1.4, 1.4, skinD2);
  });
  const hand = build((v) => {
    v.ellipsoid(0, 0, 0, 1.7, 1.5, 1.7, skin);
    v.add(0, 1, 2, skinD); v.add(1, 0, 2, skinHI); v.add(-1, 0, 2, skinHI);
    v.add(0, 1, 3, NAILC); v.add(1, 1, 3, NAILC); v.add(-1, 1, 3, NAILC);
    v.add(-2, 0, 0, skin);
  });
  const torso = build((v) => {
    v.ellipsoid(0, 3, 0.4, 4.6, 3.4, 3.0, skin);  // chest
    v.ellipsoid(0, -1, 0.2, 4.2, 3.2, 2.9, skin); // belly
    v.ellipsoid(0, 5, -2.4, 3.4, 2.6, 2.2, skinD);// back hump
    v.box(-1, 5, 1, 1, 6, 2, skin);               // neck
    v.box(-3, 2, 3, -1, 3, 3, skinHI); v.box(1, 2, 3, 3, 3, 3, skinHI);
    v.add(0, 1, 3, skinD2); v.add(0, -1, 3, skinD2);
    v.col(0, 0, -5, -3, 4.4, 3.2, cloth);         // loincloth
    v.box(-2, -5, 3, 2, -2, 3, clothD);
    v.box(-4, -4, -3, 4, -3, -3, clothD);
    v.box(-4, -3, -3, 4, -3, 3, accentD);         // belt
    v.add(0, -3, 4, accentHI);
    for (let i = -3; i <= 3; i++) v.add(i, 1 + i, 3, accent);
    if (boss) for (let i = -3; i <= 3; i++) v.add(-i, 1 + i, 3, accent);
    v.add(-2, 3, 4, WAR); v.add(2, 3, 4, WAR); v.add(0, 4, 4, WAR);
  });
  const head = build((v) => {
    v.ellipsoid(0, 0, 0, 4.0, 4.0, 3.8, skin);
    v.box(-3, -3, 1, 3, -1, 3, skinD);
    v.box(-3, 2, 3, 3, 2, 4, BROWC);
    v.box(-4, 1, 1, -4, 2, 2, skinD2); v.box(4, 1, 1, 4, 2, 2, skinD2);
    for (const s of [-1, 1]) { v.add(s * 4, 1, -1, skinD); v.add(s * 5, 2, -1, skinD); v.add(s * 6, 3, -2, skinHI); }
    v.add(0, 0, 4, skinD); v.add(0, -1, 4, skinD2);
    v.box(-2, -2, 4, 2, -2, 4, BROWC);
    v.add(-2, -1, 4, TUSKC); v.add(-2, 0, 4, TUSKC); v.add(-3, 1, 4, TUSK_D);
    v.add(2, -1, 4, TUSKC); v.add(2, 0, 4, TUSKC); v.add(3, 1, 4, TUSK_D);
    v.add(-2, 1, 4, skinD2); v.add(2, 1, 4, skinD2);
    v.add(-1, 1, 4, WAR); v.add(1, 1, 4, WAR);
    if (boss) {
      for (const s of [-1, 1]) { v.add(s * 3, 4, -1, TUSK_D); v.add(s * 4, 5, -1, TUSK_D); v.add(s * 4, 6, 0, TUSKC); v.add(s * 3, 7, 1, TUSKC); }
      v.box(-3, 4, 4, 3, 4, 4, WAR);
    }
  });

  const parts = {
    legL: { pivot: [-0.14, 0.25, 0], voxels: leg }, legR: { pivot: [0.14, 0.25, 0], voxels: leg },
    torso: { pivot: [0, 0.78, 0], voxels: torso },
    armL: { pivot: [-0.36, 0.8, 0], voxels: arm }, armR: { pivot: [0.36, 0.8, 0], voxels: arm },
    handL: { pivot: [-0.36, 0.52, 0.02], voxels: hand }, handR: { pivot: [0.36, 0.52, 0.02], voxels: hand },
    head: { pivot: [0, 1.28, 0], voxels: head },
  };
  if (scheme.hood) {
    parts.hood = { pivot: [0, 1.44, -0.02], voxels: build((v) => { v.ellipsoid(0, 1, -1, 4.4, 3.4, 4.0, cloth); v.box(-4, -2, 2, 4, 0, 3, clothD); }) };
    parts.hoodTip = { pivot: [0, 1.58, -0.06], voxels: build((v) => { v.box(-1, 0, -1, 1, 1, 0, cloth); v.add(0, 2, -2, clothD); }) };
  } else {
    parts.hair = { pivot: [0, 1.5, 0], voxels: build((v) => {
      for (let z = -3; z <= 3; z++) { const h = Math.round(2 - Math.abs(z) * 0.4); v.box(0, 0, z, 0, h, z, hair); v.add(0, h, z, hairHI); }
      v.addM(1, 0, 0, hair);
      if (boss) v.box(-1, 0, -3, 1, 1, -3, hair);
    }) };
  }
  if (martial) {
    const padC = boss ? TUSK_D : accent, padHI = boss ? TUSKC : accentHI;
    const pad = build((v) => {
      v.ellipsoid(0, 0, 0, 2.4, 1.6, 2.2, padC);
      v.box(-1, 1, -1, 1, 1, 1, padHI);
      if (boss) { v.add(0, 2, 0, TUSKC); v.add(-2, 1, 2, TUSK_D); v.add(2, 1, 2, TUSK_D); }
    });
    parts.padL = { pivot: [-0.36, 1.02, 0], voxels: pad };
    parts.padR = { pivot: [0.36, 1.02, 0], voxels: pad };
  }

  return { cube: C, parts, eyes: { color: eyeCol, positions: [[-0.1, 1.3, 0.2], [0.1, 1.3, 0.2]] }, weapon };
}

// ══════════════════════════════════════════════════════════════
//  BEASTS & UNDEAD — rat / bat / skeleton. Authored to match the
//  animated rigs in characters.ts (buildRatRig/buildBatRig/
//  buildSkeletonRig) so the .vox export mirrors what renders in-game.
//  Part names & pivots follow the same contract updateRig() expects.
// ══════════════════════════════════════════════════════════════
export function ratModel(scheme) {
  const C = 0.075;
  const fur = scheme.skin, furD = shade(fur, 0.78), belly = scheme.cloth, ear = scheme.accent, eye = scheme.hair;
  const NOSE = 0x2a2020;
  const build = (fn) => { const v = new Vox(); fn(v); return v.list(); };

  const torso = build((v) => {
    v.ellipsoid(0, 0, 0, 2.4, 1.9, 3.6, fur);
    v.ellipsoid(0, -1, 1, 1.8, 1.2, 2.6, belly);
    v.box(-1, 1, -3, 1, 2, -2, furD);
    let tz = -4, ty = 0;
    for (let i = 0; i < 8; i++) { v.add(0, Math.round(ty), tz, i < 3 ? furD : ear); tz -= 1; if (i > 2) ty += 0.7; }
  });
  const head = build((v) => {
    v.ellipsoid(0, 0, 0, 1.8, 1.6, 1.8, fur);
    v.box(-1, -1, 1, 1, 0, 2, furD);
    v.add(0, -1, 3, NOSE);
    for (const s of [-1, 1]) { v.add(s * 2, 2, -1, ear); v.add(s * 2, 3, -1, shade(ear, 1.2)); v.add(s * 2, 2, 0, ear); }
    v.add(-1, 1, 2, eye); v.add(1, 1, 2, eye);
  });
  const leg = build((v) => { v.add(0, 0, 0, furD); v.box(0, -1, 0, 0, -1, 1, fur); v.add(0, -2, 1, NOSE); });
  const arm = build((v) => { v.box(0, -1, 0, 0, 0, 0, fur); v.add(0, -2, 1, NOSE); });
  const hand = build((v) => { v.add(0, 0, 0, furD); });

  const parts = {
    legL: { pivot: [-0.11, 0.1, -0.14], voxels: leg }, legR: { pivot: [0.11, 0.1, -0.14], voxels: leg },
    torso: { pivot: [0, 0.16, 0], voxels: torso },
    armL: { pivot: [-0.1, 0.12, 0.2], voxels: arm }, armR: { pivot: [0.1, 0.12, 0.2], voxels: arm },
    handL: { pivot: [-0.1, 0.05, 0.24], voxels: hand }, handR: { pivot: [0.1, 0.05, 0.24], voxels: hand },
    head: { pivot: [0, 0.2, 0.34], voxels: head },
  };
  return { cube: C, parts };
}

export function batModel(scheme) {
  const C = 0.08;
  const skin = scheme.skin, skinHI = shade(skin, 1.2), wing = scheme.cloth, edge = scheme.accent, eye = scheme.hair;
  const build = (fn) => { const v = new Vox(); fn(v); return v.list(); };

  const torso = build((v) => { v.ellipsoid(0, 0, 0, 1.4, 2.0, 1.4, skin); v.box(-1, -2, 0, 1, -2, 0, shade(skin, 0.8)); });
  const head = build((v) => {
    v.ellipsoid(0, 0, 0, 1.5, 1.4, 1.5, skin);
    for (const s of [-1, 1]) { v.box(s * 1, 2, -1, s * 1, 3, -1, skin); v.add(s * 1, 4, -1, skinHI); }
    v.add(-1, 0, 2, eye); v.add(1, 0, 2, eye);
    v.add(-1, -1, 2, 0xffffff); v.add(1, -1, 2, 0xffffff);
  });
  const wingOf = (s) => build((v) => {
    for (let gx = 0; gx <= 4; gx++) {
      const span = 2 - Math.floor(gx * 0.35);
      for (let gz = -span; gz <= span; gz++) v.add(s * gx, Math.round(-gx * 0.25), gz, wing);
      v.add(s * gx, Math.round(-gx * 0.25) - span - 1, 0, edge);
    }
    for (let gz = -2; gz <= 2; gz++) v.add(s * 4, -1, gz, edge);
  });
  const hand = build((v) => { v.add(0, 0, 0, edge); });
  const leg = build((v) => { v.box(0, -1, 0, 0, 0, 0, shade(skin, 0.7)); });

  const parts = {
    torso: { pivot: [0, 0.9, 0], voxels: torso },
    head: { pivot: [0, 1.12, 0.04], voxels: head },
    armL: { pivot: [-0.12, 0.95, 0], voxels: wingOf(-1) }, armR: { pivot: [0.12, 0.95, 0], voxels: wingOf(1) },
    handL: { pivot: [-0.5, 0.95, 0], voxels: hand }, handR: { pivot: [0.5, 0.95, 0], voxels: hand },
    legL: { pivot: [-0.05, 0.78, -0.05], voxels: leg }, legR: { pivot: [0.05, 0.78, -0.05], voxels: leg },
  };
  return { cube: C, parts };
}

export function skeletonModel(scheme, weapon) {
  const C = 0.1;
  const bone = scheme.skin, boneD = shade(bone, 0.78), cloth = scheme.cloth, eye = scheme.hair;
  const SOCK = 0x101014;
  const build = (fn) => { const v = new Vox(); fn(v); return v.list(); };

  const leg = build((v) => { v.box(0, -2, 0, 0, 2, 0, bone); v.add(0, 1, 0, boneD); v.add(0, -2, 1, boneD); });
  const torso = build((v) => {
    v.box(-2, 3, -1, 2, 3, 1, bone);
    v.box(0, -2, 0, 0, 3, 0, boneD);
    for (let r = 0; r < 3; r++) { v.box(-2, r, 0, 2, r, 1, bone); v.add(0, r, 1, boneD); }
    v.box(-2, -2, -1, 2, -2, 1, boneD);
    v.box(-2, 3, 1, 2, 4, 2, cloth);
  });
  const arm = build((v) => { v.box(0, -2, 0, 0, 2, 0, bone); v.add(0, 0, 0, boneD); });
  const hand = build((v) => { v.add(0, 0, 0, bone); v.add(0, 0, 1, boneD); v.add(0, -1, 1, bone); });
  const head = build((v) => {
    v.box(-2, -1, -2, 2, 2, 2, bone);
    v.box(-1, -2, 0, 1, -2, 2, boneD);
    v.add(-1, 0, 3, SOCK); v.add(1, 0, 3, SOCK); v.add(0, -1, 3, SOCK);
  });

  const parts = {
    legL: { pivot: [-0.12, 0.25, 0], voxels: leg }, legR: { pivot: [0.12, 0.25, 0], voxels: leg },
    torso: { pivot: [0, 0.78, 0], voxels: torso },
    armL: { pivot: [-0.32, 0.8, 0], voxels: arm }, armR: { pivot: [0.32, 0.8, 0], voxels: arm },
    handL: { pivot: [-0.32, 0.52, 0.02], voxels: hand }, handR: { pivot: [0.32, 0.52, 0.02], voxels: hand },
    head: { pivot: [0, 1.28, 0], voxels: head },
  };
  return { cube: C, parts, eyes: { color: eye, positions: [[-0.1, 1.32, 0.24], [0.1, 1.32, 0.24]] }, weapon };
}

// weapon rasterised as voxels (for the static .vox export only; the game
// builds an animated Group via characters.ts buildWeapon). Coords match
// buildWeapon; pivot is the world position where it sits in the hand.
export function weaponVoxels(kind, accent) {
  const v = new Vox();
  const grip = 0x4a3421, METAL = 0xb8bfc9, METAL_DARK = 0x7a828e, DARK = 0x1a1a22;
  const WOOD = 0x6b4a2e;
  switch (kind) {
    case 'sword': v.box(0, 0, 0, 0, 1, 0, grip); v.box(-1, 2, 0, 1, 2, 0, METAL_DARK); v.box(0, 3, 0, 0, 8, 0, METAL); break;
    case 'dagger': v.add(0, 0, 0, grip); v.box(0, 1, 0, 0, 4, 0, METAL); break;
    case 'club': v.box(0, 0, 0, 0, 3, 0, grip); v.box(-1, 4, -1, 1, 5, 1, accent); break;
    case 'mace': v.box(0, 0, 0, 0, 3, 0, grip); v.box(-1, 4, -1, 1, 5, 1, METAL); v.add(2, 4, 0, METAL); v.add(-2, 4, 0, METAL); v.add(0, 4, 2, METAL); v.add(0, 4, -2, METAL); break;
    case 'staff': v.box(0, 0, 0, 0, 9, 0, WOOD); v.box(-1, 9, 0, 1, 9, 0, shade(WOOD, 0.85)); v.add(0, 10, 0, 0xa78bfa); v.add(0, 11, 0, 0xa78bfa); break;
    case 'bow': v.box(0, 0, 0, 0, 4, 0, WOOD); v.add(-1, -1, 0, WOOD); v.add(-1, 5, 0, WOOD); v.box(-1, 0, 0, -1, 4, 0, DARK); break;
    case 'torch': v.box(0, 0, 0, 0, 4, 0, WOOD); v.box(-1, 4, -1, 1, 5, 1, 0x3a2a18); v.add(0, 6, 0, 0xffb545); v.add(0, 7, 0, 0xff7a1f); break;
  }
  const pivot = kind === 'torch' ? [0.42, 0.72, 0.1] : [0.42, 0.5, 0.1];
  return { voxels: v.list(), pivot };
}
