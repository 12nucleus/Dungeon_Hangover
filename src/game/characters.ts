// ─────────────────────────────────────────────────────────────
// Voxel character rigs — "everything is made of tiny cubes"
// Chibi style (C=0.1) for goblins/orcs, normal style (C=0.055)
// for humanoid PCs with rich detail (~600+ cubes per character).
// Parts keep exact names updateRig() animates.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterScheme, WeaponKind } from './types';

export interface Rig {
  group: THREE.Group;
  parts: Record<string, THREE.Mesh>;
  anim: {
    mode: 'idle' | 'walk' | 'dead';
    t: number;
    lunge: number;
    flinch: number;
    lungeDir: THREE.Vector3;
    bob: number;
  };
  pivots?: {
    hip: number; torso: number; head: number; eye: number;
    hair: number; arm: number; hand: number; weapon: number;
    hood?: number; hoodTip?: number; pad?: number;
  };
}

const C_CHIBI = 0.1;
const C_NORMAL = 0.055;
const C_DETAIL = 0.0285;   // high-res player model (~77 cubes ≈ 2.2 world units)
const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const orbMat = new THREE.MeshLambertMaterial({ color: 0xa78bfa, emissive: 0x7c3aed, emissiveIntensity: 0.9 });
const tmpCol = new THREE.Color();

const METAL = 0xb8bfc9, METAL_DARK = 0x7a828e, DARK = 0x1a1a22;
const TUSK = 0xf2ede0, BROW = 0x241a10, BOOT = 0x2c2620;

// tint a hex color by factor f (>1 lighten, <1 darken), clamped
function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

class Vox {
  private geos: THREE.BufferGeometry[] = [];
  private C: number;
  constructor(cubeEdge: number) { this.C = cubeEdge; }
  add(gx: number, gy: number, gz: number, color: number, jitter = 0.1) {
    const g = new THREE.BoxGeometry(this.C, this.C, this.C);
    g.translate(gx * this.C, gy * this.C, gz * this.C);
    tmpCol.setHex(color).multiplyScalar(1 - jitter / 2 + Math.random() * jitter);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, jitter?: number) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.add(x, y, z, color, jitter);
  }
  mesh(): THREE.Mesh {
    const merged = mergeGeometries(this.geos, false)!;
    this.geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, bodyMat);
    m.castShadow = true;
    return m;
  }
  count() { return this.geos.length; }
}

function buildWeapon(kind: WeaponKind, accent: number, C: number): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox(C);
  const grip = 0x4a3421;
  switch (kind) {
    case 'sword':
      v.fill(0, 0, 0, 0, 1, 0, grip);
      v.fill(-1, 2, 0, 1, 2, 0, METAL_DARK);
      v.fill(0, 3, 0, 0, 8, 0, METAL);
      break;
    case 'dagger':
      v.add(0, 0, 0, grip);
      v.fill(0, 1, 0, 0, 4, 0, METAL);
      break;
    case 'club':
      v.fill(0, 0, 0, 0, 3, 0, grip);
      v.fill(-1, 4, -1, 1, 5, 1, accent);
      break;
    case 'mace':
      v.fill(0, 0, 0, 0, 3, 0, grip);
      v.fill(-1, 4, -1, 1, 5, 1, METAL);
      v.add(2, 4, 0, METAL); v.add(-2, 4, 0, METAL);
      v.add(0, 4, 2, METAL); v.add(0, 4, -2, METAL);
      break;
    case 'staff':
      v.fill(0, 0, 0, 0, 9, 0, 0x6b4a2e);
      v.fill(-1, 9, 0, 1, 9, 0, 0x5f3e22);
      break;
    case 'bow':
      v.fill(0, 0, 0, 0, 4, 0, 0x6b4a2e);
      v.add(-1, -1, 0, 0x6b4a2e); v.add(-1, 5, 0, 0x6b4a2e);
      v.fill(-1, 0, 0, -1, 4, 0, DARK, 0.02);
      break;
    case 'torch':
      v.fill(0, 0, 0, 0, 4, 0, 0x6b4a2e);
      v.fill(-1, 4, -1, 1, 5, 1, 0x3a2a18);
      break;
  }
  g.add(v.mesh());
  if (kind === 'staff') {
    const orb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), orbMat);
    orb.position.set(0, 10.6 * C, 0);
    orb.castShadow = true;
    g.add(orb);
  }
  if (kind === 'torch') {
    const flameMat = new THREE.MeshLambertMaterial({ color: 0xffb545, emissive: 0xff7a1f, emissiveIntensity: 0.8 });
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), flameMat);
    f1.position.set(0, 5.4 * C, 0);
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), flameMat);
    f2.position.set(0, 6.3 * C, 0);
    g.add(f1, f2);
  }
  return g;
}

// ════════════════════════════════════════════════════════════════
//  NORMAL PLAYER — detailed high-res voxel model (~10k cubes)
//  Ported from scripts/gen_vox.mjs, split into animated parts.
//  Grid (77 cubes ≈ 2.2 world units at C_DETAIL):
//    0..10 boots   10..34 jeans   33..37 hip/belt
//   37..56 shirt   56..72 head    49..77 hair (curtain→crown)
//   arms 34..55 (forearm+sleeve)  hands 28..34
// ════════════════════════════════════════════════════════════════
function buildPlayerRig(scheme: CharacterScheme, weapon: WeaponKind): Rig {
  const C = C_DETAIL;
  const WC = C_NORMAL;   // weapon scale (keeps torch-flame light offset valid)
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const martial = weapon === 'sword' || weapon === 'mace' || weapon === 'club';

  // ── palette derived from scheme (+ fixed accents) ──
  const skin = scheme.skin;
  const skinD = shade(skin, 0.87), skinD2 = shade(skin, 0.74), skinHL = shade(skin, 1.09), blush = shade(skin, 0.93);
  const cloth = scheme.cloth;
  const shirtD = shade(cloth, 0.9), shirtD2 = shade(cloth, 0.8), shirtHI = shade(cloth, 1.03);
  const pant = scheme.accent;
  const pantD = shade(pant, 0.82), pantD2 = shade(pant, 0.66), pantHI = shade(pant, 1.16), seam = shade(pant, 1.38);
  const hair = scheme.hair;
  const hairD = shade(hair, 0.66), hairD2 = shade(hair, 0.45), hairHI = shade(hair, 1.4), hairHL = shade(hair, 1.75);
  const B_BOOT = 0x5c3d22, B_BOOTD = 0x3d2816, B_BOOTHI = 0x7d5230, B_SOLE = 0x28221d, LACE = 0xd8c48c;
  const C_BELT = 0x3a2a1a, BUCKLE = 0xc9a94a, BUCKLE_D = 0xa2842f;
  const EYE_W = 0xf5f2ec, IRIS = 0x6b4426, PUPIL = 0x15100c, EYE_HI = 0xffffff;
  const M_MOUTH = 0xb05a4a, M_MOUTHD = 0x8a3a30;
  const PR_Y = 0xf5c022, PR_YD = 0xd49a0c, PR_B = 0x2f66c4, PR_OUT = 0x1a1a1a;
  const POCK = shade(cloth, 0.97), POCK_ST = shade(cloth, 0.78);

  // ── grid pivots ──
  const LEG_X = 4, ARM_X = 10;
  const HIP_G = 34, TORSO_G = 45, ARM_G = 55, HAND_G = 31, HEAD_G = 64, HAIR_G = 66, EYE_G = 63, PAD_G = 56;
  const partInfo: Record<string, { cx: number; cy: number }> = {
    legL: { cx: -LEG_X, cy: HIP_G }, legR: { cx: LEG_X, cy: HIP_G },
    torso: { cx: 0, cy: TORSO_G },
    armL: { cx: -ARM_X, cy: ARM_G }, armR: { cx: ARM_X, cy: ARM_G },
    handL: { cx: -ARM_X, cy: HAND_G }, handR: { cx: ARM_X, cy: HAND_G },
    head: { cx: 0, cy: HEAD_G }, hair: { cx: 0, cy: HAIR_G },
  };
  const buckets: Record<string, Map<string, number>> = {};
  for (const k of Object.keys(partInfo)) buckets[k] = new Map();

  // ── voxel helpers writing into the current target bucket (last write wins) ──
  let cur: Map<string, number> = buckets.torso;
  const put = (x: number, y: number, z: number, c: number) =>
    cur.set(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`, c);
  const putM = (x: number, y: number, z: number, c: number) => { put(x, y, z, c); put(-x, y, z, c); };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, c);
  };
  const colf = (cx: number, cz: number, y0: number, y1: number, rx: number, rz: number, c: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dz = (z - cz) / rz;
          if (dx * dx + dz * dz <= 1.02) put(x, y, z, c);
        }
  };
  const rbox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, c: number) => {
    const cx0 = x0 + r, cx1 = x1 - r, cz0 = z0 + r, cz1 = z1 - r;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      let dx = 0, dz = 0;
      if (x < cx0) dx = x - cx0; else if (x > cx1) dx = x - cx1;
      if (z < cz0) dz = z - cz0; else if (z > cz1) dz = z - cz1;
      if (dx * dx + dz * dz <= r * r + 0.3) put(x, y, z, c);
    }
  };
  const ellipsoid = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number, inner = 0) => {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
      for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          const d = dx * dx + dy * dy + dz * dz;
          if (d <= 1.02 && d >= inner) put(x, y, z, c);
        }
  };

  // ═══ BOOTS + JEANS (per side) ═══
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.legL : buckets.legR;
    const cx = s * LEG_X;
    rbox(cx - 3, 0, -4, cx + 3, 1, 6, 2, B_SOLE);
    box(cx - 3, 1, -4, cx + 3, 1, 6, B_BOOTD);
    rbox(cx - 3, 2, -4, cx + 3, 8, 5, 2, B_BOOT);
    box(cx - 2, 2, 5, cx + 2, 4, 6, B_BOOTHI);
    box(cx - 2, 2, -4, cx + 2, 4, -4, B_BOOTD);
    rbox(cx - 3, 8, -3, cx + 3, 10, 4, 2, B_BOOTHI);
    box(cx - 3, 9, -3, cx + 3, 9, 4, B_BOOTD);
    for (let ly = 4; ly <= 8; ly += 2) { put(cx - 1, ly, 6, LACE); put(cx + 1, ly, 6, LACE); }
    put(cx, 5, 6, LACE); put(cx, 7, 6, LACE);
    box(cx - 3, 5, 0, cx - 3, 6, 0, B_BOOTD);
    box(cx + 3, 5, 0, cx + 3, 6, 0, B_BOOTD);
    colf(cx, 0.5, 10, 34, 3.2, 3.4, pant);
    colf(cx, 0.5, 10, 11, 3.4, 3.6, pantD);
    for (let y = 11; y <= 33; y++) {
      put(cx + s * 3, y, 0, seam);
      put(cx - s * 3, y, 0, pantD2);
      put(cx, y, 3, pantHI);
      put(cx, y, -3, pantD);
    }
    box(cx - 2, 20, 3, cx + 2, 20, 4, pantD);
    box(cx - 2, 22, 3, cx + 2, 22, 4, pantHI);
    box(cx - 1, 18, 3, cx + 1, 18, 4, pantD);
    box(cx - 3, 12, 3, cx + 3, 12, 3, seam);
    colf(cx, 3, 19, 23, 1.6, 1.2, pantHI);
  }

  // ═══ TORSO (hip, belt, shirt, folds, collar, pocket, print, neck) ═══
  cur = buckets.torso;
  rbox(-8, 33, -4, 8, 36, 4, 2, pant);
  box(-1, 33, 3, 1, 36, 4, pantD);
  box(-1, 33, -4, 1, 36, -4, pantD2);
  for (const s of [-1, 1]) { box(s * 4, 34, 4, s * 6, 36, 4, pantD); put(s * 4, 33, 4, seam); put(s * 6, 33, 4, seam); }
  rbox(-8, 35, -4, 8, 37, 5, 2, C_BELT);
  box(-2, 35, 5, 2, 37, 5, BUCKLE);
  box(-1, 35, 5, 1, 36, 5, BUCKLE_D);
  for (const bx of [-6, -2, 2, 6]) box(bx, 35, 5, bx, 37, 5, pantD);
  for (let y = 37; y <= 55; y++) { const t = (y - 37) / 18; const hx = Math.round(7 + t * 1.8); rbox(-hx, y, -5, hx, y, 5, 2, cloth); }
  box(-8, 37, -4, 8, 37, 5, shirtD);
  rbox(-11, 53, -4, 11, 56, 4, 2, cloth);
  box(-11, 53, 0, -9, 55, 0, shirtD);
  box(9, 53, 0, 11, 55, 0, shirtD);
  for (let y = 38; y <= 53; y++) { put(-5, y, 5, shirtD); put(5, y, 5, shirtHI); put(0, y, -5, shirtD); }
  for (let i = 0; i < 5; i++) { put(-6 + i, 39 + i, 5, shirtD2); put(6 - i, 39 + i, 5, shirtD2); }
  box(-8, 48, 4, -6, 51, 5, shirtD);
  box(6, 48, 4, 8, 51, 5, shirtD);
  rbox(-3, 55, 2, 3, 57, 5, 1, cloth);
  box(-2, 56, 5, 2, 56, 5, shirtD);
  box(-2, 57, 4, 2, 57, 5, skinD2);
  box(2, 46, 5, 5, 50, 5, POCK);
  box(2, 50, 5, 5, 50, 5, POCK_ST);
  put(2, 46, 5, POCK_ST); put(5, 46, 5, POCK_ST);
  box(2, 46, 5, 2, 50, 5, POCK_ST);
  box(5, 46, 5, 5, 50, 5, POCK_ST);
  for (let y = 40; y <= 50; y++) for (let x = -6; x <= 0; x++) { const dx = (x + 3) / 3.2, dy = (y - 45) / 5.2; if (dx * dx + dy * dy <= 1.0) put(x, y, 5, PR_B); }
  for (let a = 0; a < 32; a++) { const ang = a / 32 * Math.PI * 2; put(Math.round(-3 + Math.cos(ang) * 3.2), Math.round(45 + Math.sin(ang) * 5.2), 5, PR_OUT); }
  const bolt: [number, number][] = [[-2, 49], [-2, 48], [-3, 47], [-3, 46], [-2, 46], [-3, 45], [-3, 44], [-2, 44], [-4, 43], [-4, 42], [-3, 42], [-3, 41]];
  for (const [bx, by] of bolt) put(bx, by, 5, PR_Y);
  put(-3, 46, 5, PR_YD); put(-3, 44, 5, PR_YD);
  colf(0, -1, 55, 58, 2.2, 2.0, skin);
  put(0, 56, -2, skinD2);
  box(-2, 56, 2, 2, 57, 2, skinD);
  if (weapon === 'staff') rbox(-9, 30, -4, 9, 37, 5, 2, cloth);   // caster robe skirt

  // ═══ ARMS (sleeve + bare forearm + elbow) ═══
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.armL : buckets.armR;
    const cx = s * ARM_X;
    colf(cx, 0, 48, 55, 2.6, 2.6, cloth);
    colf(cx, 0, 48, 49, 2.8, 2.8, shirtD);
    put(cx + s * 2, 52, 0, shirtHI);
    put(cx - s * 2, 51, 0, shirtD);
    colf(cx, 0, 34, 47, 2.2, 2.3, skin);
    for (let y = 35; y <= 46; y++) { put(cx, y, 2, skinHL); put(cx, y, -2, skinD); }
    put(cx + s * 2, 40, 1, skinD);
    colf(cx, -1, 47, 48, 2.0, 1.6, skinD);
  }

  // ═══ HANDS ═══
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.handL : buckets.handR;
    const cx = s * ARM_X;
    rbox(cx - 2, 30, -2, cx + 2, 34, 2, 1, skin);
    put(cx, 32, 2, skinHL); put(cx, 31, -2, skinD);
    for (let f = -1; f <= 2; f++) { const fx = cx + f; box(fx, 28, -1, fx, 30, 1, skin); put(fx, 28, 0, skinD); put(fx, 29, 1, skinHL); }
    box(cx + s * 2, 31, 1, cx + s * 3, 32, 2, skin);
    put(cx + s * 3, 31, 2, skinD);
  }

  // ═══ HEAD + face ═══
  cur = buckets.head;
  ellipsoid(0, HEAD_G, 0, 6, 8, 6, skin);
  ellipsoid(0, 58, 1, 4.5, 3.5, 5, skin);
  put(0, 56, 3, skinD);
  for (const s of [-1, 1]) { put(s * 4, 61, 5, blush); put(s * 4, 62, 4, skinHL); put(s * 5, 63, 2, skinD); }
  box(-2, 68, 5, 2, 69, 6, skinHL);
  for (const s of [-1, 1]) { box(s * 6, 62, -1, s * 6, 64, 1, skin); put(s * 6, 63, 0, skinD); put(s * 7, 63, 0, skin); put(s * 6, 61, 0, skinD2); }
  for (const s of [-1, 1]) {
    const ex = s * 3;
    box(ex - 1, 62, 5, ex + 1, 63, 6, skinD);
    put(ex - 1, 63, 6, EYE_W); put(ex + 1, 63, 6, EYE_W);
    put(ex - 1, 62, 6, EYE_W); put(ex + 1, 62, 6, EYE_W);
    put(ex, 63, 6, IRIS); put(ex, 62, 6, PUPIL);
    put(ex, 63, 7, IRIS);
    put(ex + s, 63, 7, EYE_HI);
    box(ex - 1, 64, 6, ex + 1, 64, 6, skinD2);
    put(ex, 61, 6, skinD);
  }
  for (const s of [-1, 1]) { box(s * 2, 65, 6, s * 4, 65, 6, hairD); put(s * 3, 66, 6, hairD2); }
  box(0, 61, 6, 0, 63, 6, skin);
  put(0, 61, 7, skinHL);
  putM(1, 61, 6, skinD2);
  put(0, 60, 6, skinD);
  box(-2, 59, 6, 2, 59, 6, M_MOUTH);
  box(-1, 59, 6, 1, 59, 6, M_MOUTHD);
  putM(2, 60, 6, M_MOUTH);
  put(0, 58, 6, skinD);

  // ═══ HAIR ═══
  cur = buckets.hair;
  const hairShade = (x: number, y: number, z: number): number => {
    const h = (((x + 40) * 73856093) ^ ((y + 40) * 19349663) ^ ((z + 40) * 83492791)) >>> 0;
    const r = h % 100;
    if (r < 10) return hairHI;
    if (r < 16) return hairHL;
    if (r < 24) return hairD;
    return hair;
  };
  const HR_CY = 66;
  for (let x = -8; x <= 8; x++) for (let y = 63; y <= 82; y++) for (let z = -8; z <= 8; z++) {
    const dx = x / 7.2, dy = (y - HR_CY) / 9.0, dz = z / 7.0;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > 1.05 || d < 0.62) continue;
    if (z > 2 && y < 66) continue;
    if (z > 4 && y < 69) continue;
    put(x, y, z, hairShade(x, y, z));
  }
  ellipsoid(0, 70, 0, 6.6, 6.0, 6.4, hair, 0.55);
  const fringe: [number, number, number][] = [[-5,70,6],[-4,69,6],[-4,68,7],[-3,67,7],[-3,70,7],[-2,68,7],[-1,67,7],[0,66,7],[0,69,7],[1,67,7],[2,68,7],[3,67,7],[3,70,7],[4,68,7],[4,69,6],[5,70,6],[-2,66,6],[2,66,6],[1,66,7],[-1,66,7]];
  for (const [x, y, z] of fringe) put(x, y, z, hair);
  const sHI: [number, number, number][] = [[-6,72,3],[-4,74,4],[-2,75,3],[0,76,2],[2,75,4],[4,74,3],[6,72,2],[-5,72,5],[-3,71,6],[3,71,6],[5,72,5],[-1,74,5],[1,74,5],[-6,70,1],[6,70,1],[-3,75,1],[3,75,1]];
  for (const [x, y, z] of sHI) put(x, y, z, hairHI);
  const sHL: [number, number, number][] = [[-2,76,2],[2,76,2],[0,75,3],[-4,74,3],[4,74,3],[-1,75,4],[1,75,4]];
  for (const [x, y, z] of sHL) put(x, y, z, hairHL);
  const sD: [number, number, number][] = [[-7,68,-2],[7,68,-2],[-6,66,-3],[6,66,-3],[-5,71,-5],[5,71,-5],[-4,73,-6],[4,73,-6],[0,74,-6]];
  for (const [x, y, z] of sD) put(x, y, z, hairD);
  const tufts: [number, number, number][] = [[-2,76,1],[2,76,1],[-1,76,-1],[1,76,-2],[3,75,0],[-3,75,0],[0,76,0]];
  for (const [x, y, z] of tufts) put(x, y, z, hair);
  put(0, 77, 0, hairHI);
  for (let y = 49; y <= 62; y++) {
    const t = (y - 49) / 13;
    const halfW = Math.round(3 + t * 3);
    for (let x = -halfW; x <= halfW; x++) {
      const edge = 1 - Math.abs(x) / (halfW + 0.6);
      const back = -5 - Math.round(edge * 2);
      put(x, y, back, hairShade(x, y, back));
      put(x, y, back + 1, hairShade(x, y, back + 1));
      put(x, y, back + 2, hairShade(x, y, back + 2));
    }
    put(0, y, -5, y % 3 === 0 ? hairHI : hair);
  }
  const tips: [number, number, number][] = [[-3,48,-6],[0,47,-6],[3,48,-6],[-2,48,-5],[2,47,-5],[-4,49,-6],[4,49,-6]];
  for (const [x, y, z] of tips) { put(x, y, z, hairShade(x, y, z)); put(x, y, z - 1, hairShade(x, y, z - 1)); }
  for (const s of [-1, 1]) {
    for (let y = 53; y <= 67; y++) { put(s * 6, y, -2, hair); put(s * 6, y, -4, hair); put(s * 7, y, -3, hairD); put(s * 5, y, -5, hair); }
    put(s * 6, 52, -3, hair); put(s * 5, 51, -4, hairD); put(s * 6, 66, 3, hairHI);
  }
  for (const s of [-1, 1]) { box(s * 6, 64, 3, s * 7, 68, 5, hair); put(s * 7, 66, 5, hairHI); put(s * 6, 63, 4, hairD); }

  // ═══ BUILD PART MESHES ═══
  const JIT = 0.035;
  for (const [name, info] of Object.entries(partInfo)) {
    const vo = new Vox(C);
    for (const [k, c] of buckets[name]) {
      const [gx, gy, gz] = k.split(',').map(Number);
      vo.add(gx - info.cx, gy - info.cy, gz, c, JIT);
    }
    const m = vo.mesh();
    m.position.set(info.cx * C, info.cy * C, 0);
    parts[name] = m; group.add(m);
  }

  // ═══ SHOULDER PADS (martial only) ═══
  if (martial) {
    for (const [name, sx] of [['padL', -ARM_X], ['padR', ARM_X]] as const) {
      const vo = new Vox(C);
      vo.fill(-3, -2, -3, 3, 2, 3, METAL_DARK);
      vo.fill(-4, 0, -2, 4, 2, 2, METAL, 0.03);
      vo.fill(-1, 3, 0, 1, 3, 0, METAL, 0.02);
      const m = vo.mesh();
      m.position.set(sx * C, PAD_G * C, 0);
      parts[name] = m; group.add(m);
    }
  }

  // ═══ WEAPON (kept at C_NORMAL so torch-flame light offset holds) ═══
  const wg = buildWeapon(weapon, scheme.accent, WC);
  wg.position.set(ARM_X * C + 0.03, 20 * C, 5 * C);
  wg.rotation.x = weapon === 'bow' || weapon === 'torch' ? -0.12 : -0.6;
  group.add(wg);
  parts.weapon = wg as unknown as THREE.Mesh;
  (wg as any).userData.kind = weapon;

  group.scale.setScalar(scheme.bulk ?? 1);

  return {
    group, parts,
    anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0 },
    pivots: {
      hip: HIP_G * C, torso: TORSO_G * C, head: HEAD_G * C, eye: EYE_G * C,
      hair: HAIR_G * C, arm: ARM_G * C, hand: HAND_G * C, weapon: 20 * C,
      pad: PAD_G * C,
    },
  };
}

// ────── CHIBI RIG (unchanged) ──────
function buildChibiRig(scheme: CharacterScheme, weapon: WeaponKind): Rig {
  const C = C_CHIBI;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const orc = scheme.orc === true;
  const martial = weapon === 'sword' || weapon === 'mace' || weapon === 'club';
  const skin = scheme.skin, cloth = scheme.cloth, accent = scheme.accent, hair = scheme.hair;

  for (const [name, x] of [['legL', -0.12], ['legR', 0.12]] as const) {
    const v = new Vox(C);
    v.fill(0, -1, -1, 0, 2, 0, orc ? skin : accent);
    v.fill(0, -2, -1, 0, -2, 0, BOOT);
    const m = v.mesh();
    m.position.set(x, 0.25, 0);
    parts[name] = m; group.add(m);
  }
  {
    const v = new Vox(C);
    v.fill(-2, -1, -1, 2, 2, 1, cloth);
    v.fill(-2, -2, -1, 2, -2, 1, accent);
    if (weapon === 'staff') { v.fill(-2, -3, -1, 2, -3, 1, cloth); v.fill(-3, -4, -2, 2, -4, 1, cloth); }
    if (orc) { v.fill(-1, -3, 1, 1, -3, 1, accent); v.fill(0, -4, 1, 1, -4, 1, accent); v.fill(-2, 1, 2, 2, 1, 2, accent); }
    const torso = v.mesh(); torso.position.set(0, 0.78, 0);
    parts.torso = torso; group.add(torso);
  }
  for (const [name, x] of [['armL', -0.35], ['armR', 0.35]] as const) {
    const v = new Vox(C);
    v.fill(0, -1, -1, 0, 2, 0, orc ? skin : cloth);
    v.fill(0, -2, -1, 0, -2, 0, orc ? accent : cloth);
    const m = v.mesh(); m.position.set(x, 0.8, 0);
    parts[name] = m; group.add(m);
  }
  for (const [name, x] of [['handL', -0.35], ['handR', 0.35]] as const) {
    const v = new Vox(C); v.add(0, 0, 0, skin);
    const m = v.mesh(); m.position.set(x, 0.52, 0);
    parts[name] = m; group.add(m);
  }
  {
    const v = new Vox(C);
    v.fill(-2, -2, -2, 1, 1, 1, skin);
    if (orc) { v.fill(-2, 1, 2, 1, 1, 2, BROW, 0.04); v.add(-1, -2, 2, TUSK, 0.03); v.add(0, -2, 2, TUSK, 0.03); v.fill(-4, 0, 0, -3, 0, 0, skin); v.fill(2, 0, 0, 3, 0, 0, skin); }
    else if (weapon === 'mace') { v.fill(-2, -3, 0, 1, -3, 2, hair); v.fill(-2, -2, 2, 1, -2, 2, hair); }
    const head = v.mesh(); head.position.set(0, 1.28, 0);
    parts.head = head; group.add(head);
  }
  for (const [name, x] of [['eyeL', -0.09], ['eyeR', 0.09]] as const) {
    const v = new Vox(C); v.add(0, 0, 0, orc ? 0x3d1414 : DARK, 0);
    const m = v.mesh(); m.position.set(x, 1.3, 0.16);
    parts[name] = m; group.add(m);
  }
  if (scheme.hood) {
    const hv = new Vox(C); hv.fill(-2, -1, -2, 1, 0, 1, cloth);
    const hood = hv.mesh(); hood.position.set(0, 1.44, -0.02);
    parts.hood = hood; group.add(hood);
    const tv = new Vox(C); tv.fill(-1, 0, -1, 0, 0, 0, cloth); tv.add(0, 1, -1, cloth);
    const hoodTip = tv.mesh(); hoodTip.position.set(0, 1.58, -0.06);
    parts.hoodTip = hoodTip; group.add(hoodTip);
  } else {
    const v = new Vox(C);
    if (weapon === 'sword') v.fill(-2, -1, -2, 1, 0, 1, hair);
    else { v.fill(-2, 0, -2, 1, 0, 1, hair); v.fill(-2, -1, -2, 1, -1, -2, hair); }
    const m = v.mesh(); m.position.set(0, 1.5, 0);
    parts.hair = m; group.add(m);
  }
  if (martial) {
    for (const [name, x] of [['padL', -0.35], ['padR', 0.35]] as const) {
      const v = new Vox(C); v.fill(-1, 0, -1, 1, 0, 1, METAL_DARK);
      const m = v.mesh(); m.position.set(x, 1.02, 0);
      parts[name] = m; group.add(m);
    }
  }
  const wg = buildWeapon(weapon, accent, C);
  if (weapon === 'torch') { wg.position.set(0.38, 0.72, 0.08); wg.rotation.x = -0.12; }
  else { wg.position.set(0.38, 0.5, 0.08); wg.rotation.x = weapon === 'bow' ? 0 : -0.5; }
  group.add(wg);
  parts.weapon = wg as unknown as THREE.Mesh;
  (wg as any).userData.kind = weapon;
  group.scale.setScalar(scheme.bulk ?? 1);
  return { group, parts, anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0 } };
}

export function buildCharacter(scheme: CharacterScheme, weapon: WeaponKind): Rig {
  return scheme.style === 'normal' ? buildPlayerRig(scheme, weapon) : buildChibiRig(scheme, weapon);
}

// ────── ANIMATION ──────
export function updateRig(rig: Rig, dt: number, speed = 1) {
  const a = rig.anim;
  a.t += dt * speed;
  const p = rig.parts;
  const P = rig.pivots;

  if (a.mode === 'dead') {
    const k = Math.min(1, a.t * 2.2);
    rig.group.rotation.x = -k * Math.PI / 2 * 0.9;
    rig.group.position.y = rig.group.userData.baseY - k * 0.15;
    return;
  }

  rig.group.rotation.x = 0;
  const walking = a.mode === 'walk';
  const w = walking ? Math.sin(a.t * 11) : 0;
  const idle = Math.sin(a.t * 2.2);

  const HIP = P?.hip ?? 0.25;
  p.legL.rotation.x = w * 0.75;
  p.legR.rotation.x = -w * 0.75;
  p.legL.position.y = HIP + Math.max(0, w) * 0.06;
  p.legR.position.y = HIP + Math.max(0, -w) * 0.06;

  p.armL.rotation.x = -w * 0.6 + idle * 0.05;
  p.armR.rotation.x = w * 0.6 + idle * 0.05 + (a.lunge > 0 ? -Math.sin(a.lunge * Math.PI) * 2.2 : 0);
  p.handL.rotation.x = p.armL.rotation.x;
  p.handR.rotation.x = p.armR.rotation.x;

  const weapon = rig.group.children.find((c) => c.type === 'Group')!;
  const weaponBase = (weapon as any).userData?.kind === 'torch' ? 0.4 : -0.5;
  weapon.rotation.x = weaponBase + p.armR.rotation.x * 0.9;

  const bob = walking ? Math.abs(Math.sin(a.t * 11)) * 0.07 : idle * 0.02;
  a.bob = bob;

  const TO = P?.torso ?? 0.78;
  const HO = P?.head ?? 1.28;
  const EO = P?.eye ?? 1.3;
  const HRO = P?.hair ?? 1.5;
  const HUD = P?.hood ?? 1.44;
  const HT = P?.hoodTip ?? 1.58;
  const AR = P?.arm ?? 0.8;
  const HA = P?.hand ?? 0.52;
  const WO = P?.weapon ?? 0.5;
  const PA = P?.pad ?? 1.02;
  const bb = bob * 1.2;

  p.torso.position.y = TO + bob;
  p.torso.scale.y = 1 + idle * 0.02;
  p.head.position.y = HO + bb;
  if (p.eyeL) { p.eyeL.position.y = EO + bb; p.eyeR.position.y = EO + bb; }
  if (p.hood) { p.hood.position.y = HUD + bb; p.hoodTip!.position.y = HT + bb; }
  if (p.hair) p.hair.position.y = HRO + bb;
  p.armL.position.y = AR + bob; p.armR.position.y = AR + bob;
  p.handL.position.y = HA + bob; p.handR.position.y = HA + bob;
  weapon.position.y = WO + bob;
  if (p.padL) { p.padL.position.y = PA + bob; p.padR!.position.y = PA + bob; }

  if (a.lunge > 0) a.lunge = Math.max(0, a.lunge - dt * 3.2);
  if (a.flinch > 0) {
    a.flinch = Math.max(0, a.flinch - dt * 4);
    rig.group.rotation.x = -Math.sin(a.flinch * Math.PI) * 0.25;
  }
}