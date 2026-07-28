// ─────────────────────────────────────────────────────────────
// Normal Player Rig — detailed high-res voxel model (~10k cubes)
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox, C_DETAIL, C_NORMAL, shade } from './vox';
import { buildLimb } from './limb';
import { buildHierarchy } from './hierarchy';
import { buildWeapon } from './weapon';
import type { Rig } from './vox';
import type { CharacterScheme, WeaponKind } from '../types';

const BOOT = 0x5c3d22, BOOTD = 0x3d2816, BOOTHI = 0x7d5230, SOLE = 0x28221d, LACE = 0xd8c48c;

export function buildPlayerRig(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  const C = C_DETAIL;
  const WC = C_NORMAL;
  const SUB = 1;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const martial = weapon === 'sword' || weapon === 'mace' || weapon === 'club';

  const skin = scheme.skin;
  const skinD = shade(skin, 0.87), skinD2 = shade(skin, 0.74), skinHL = shade(skin, 1.09), blush = shade(skin, 0.93);
  const cloth = scheme.cloth;
  const shirtD = shade(cloth, 0.9), shirtD2 = shade(cloth, 0.8), shirtHI = shade(cloth, 1.03);
  const pant = scheme.accent;
  const pantD = shade(pant, 0.82), pantD2 = shade(pant, 0.66), pantHI = shade(pant, 1.16), seam = shade(pant, 1.38);
  const hair = scheme.hair;
  const hairD = shade(hair, 0.66), hairD2 = shade(hair, 0.45), hairHI = shade(hair, 1.4), hairHL = shade(hair, 1.75);

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

  // ═══ BOOTS + JEANS ═══
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.legL : buckets.legR;
    const cx = s * LEG_X;
    rbox(cx - 3, 0, -4, cx + 3, 1, 6, 2, SOLE);
    box(cx - 3, 1, -4, cx + 3, 1, 6, BOOTD);
    rbox(cx - 3, 2, -4, cx + 3, 8, 5, 2, BOOT);
    box(cx - 2, 2, 5, cx + 2, 4, 6, BOOTHI);
    box(cx - 2, 2, -4, cx + 2, 4, -4, BOOTD);
    rbox(cx - 3, 8, -3, cx + 3, 10, 4, 2, BOOTHI);
    box(cx - 3, 9, -3, cx + 3, 9, 4, BOOTD);
    for (let ly = 4; ly <= 8; ly += 2) { put(cx - 1, ly, 6, LACE); put(cx + 1, ly, 6, LACE); }
    put(cx, 5, 6, LACE); put(cx, 7, 6, LACE);
    box(cx - 3, 5, 0, cx - 3, 6, 0, BOOTD);
    box(cx + 3, 5, 0, cx + 3, 6, 0, BOOTD);
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

  // ═══ TORSO ═══
  cur = buckets.torso;
  rbox(-8, 33, -4, 8, 36, 4, 2, pant);
  box(-1, 33, 3, 1, 36, 4, pantD);
  box(-1, 33, -4, 1, 36, -4, pantD2);
  for (const s of [-1, 1]) { box(Math.min(s * 4, s * 6), 34, 4, Math.max(s * 4, s * 6), 36, 4, pantD); put(s * 4, 33, 4, seam); put(s * 6, 33, 4, seam); }
  rbox(-8, 35, -4, 8, 37, 5, 2, 0x3a2a1a);
  box(-2, 35, 5, 2, 37, 5, 0xc9a94a);
  box(-1, 35, 5, 1, 36, 5, 0xa2842f);
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
  box(2, 46, 5, 5, 50, 5, 0x5a3d2e);
  box(2, 50, 5, 5, 50, 5, 0x4a3022);
  put(2, 46, 5, 0x4a3022); put(5, 46, 5, 0x4a3022);
  box(2, 46, 5, 2, 50, 5, 0x4a3022);
  box(5, 46, 5, 5, 50, 5, 0x4a3022);
  colf(0, -1, 55, 58, 2.2, 2.0, skin);
  put(0, 56, -2, skinD2);
  box(-2, 56, 2, 2, 57, 2, skinD);
  if (weapon === 'staff') rbox(-9, 30, -4, 9, 37, 5, 2, cloth);

  // ═══ ARMS ═══
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.armL : buckets.armR;
    const cx = s * ARM_X;
    colf(cx, 0, 43, 55, 2.6, 2.6, cloth);
    colf(cx, 0, 43, 44, 2.8, 2.8, shirtD);
    put(cx + s * 2, 52, 0, shirtHI);
    put(cx - s * 2, 51, 0, shirtD);
    colf(cx, 0, 34, 42, 2.2, 2.3, skin);
    for (let y = 35; y <= 41; y++) { put(cx, y, 2, skinHL); put(cx, y, -2, skinD); }
    put(cx + s * 2, 40, 1, skinD);
    colf(cx, -1, 42, 43, 2.0, 1.6, skinD);
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
    put(ex - 1, 63, 6, 0xf5f2ec); put(ex + 1, 63, 6, 0xf5f2ec);
    put(ex - 1, 62, 6, 0xf5f2ec); put(ex + 1, 62, 6, 0xf5f2ec);
    put(ex, 63, 6, 0x6b4426); put(ex, 62, 6, 0x15100c);
    put(ex + s, 63, 6, 0xffffff);
    box(ex - 1, 64, 6, ex + 1, 64, 6, skinD2);
    put(ex, 61, 6, skinD);
  }
  for (const s of [-1, 1]) { box(Math.min(s * 2, s * 4), 65, 6, Math.max(s * 2, s * 4), 65, 6, hairD); put(s * 3, 66, 6, hairD2); }
  box(0, 61, 6, 0, 63, 6, skin);
  put(0, 61, 7, skinHL);
  putM(1, 61, 6, skinD2);
  put(0, 60, 6, skinD);
  box(-2, 59, 6, 2, 59, 6, 0xb05a4a);
  box(-1, 59, 6, 1, 59, 6, 0x8a3a30);
  putM(2, 60, 6, 0xb05a4a);
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
    if (z > 2 && y < 68) continue;
    if (z > 4 && y < 71) continue;
    put(x, y, z, hairShade(x, y, z));
  }
  ellipsoid(0, 70, 0, 6.6, 6.0, 6.4, hair, 0.55);
  const fringe: [number, number, number][] = [[-5,70,6],[-4,69,6],[-4,68,7],[-3,70,7],[-2,68,7],[0,69,7],[2,68,7],[3,70,7],[4,68,7],[4,69,6],[5,70,6]];
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
  for (const s of [-1, 1]) { box(Math.min(s * 6, s * 7), 66, 3, Math.max(s * 6, s * 7), 68, 4, hair); put(s * 7, 67, 4, hairHI); }

  for (const k of [...buckets.hair.keys()]) if (buckets.head.has(k)) buckets.hair.delete(k);

  for (const name of ['torso', 'head', 'hair'] as const) {
    const info = partInfo[name];
    const vo = new Vox(C, SUB);
    for (const [k, c] of buckets[name]) {
      const [gx, gy, gz] = k.split(',').map(Number);
      vo.add(gx - info.cx, gy - info.cy, gz, c, 0.035);
    }
    const m = vo.mesh();
    m.position.set(info.cx * C, info.cy * C, 0);
    parts[name] = m; group.add(m);
  }
  const KNEE_G = 22, ELBOW_G = 43;
  for (const s of [-1, 1] as const) {
    const lm = buildLimb(s < 0 ? buckets.legL : buckets.legR, s * LEG_X, HIP_G, KNEE_G, C);
    parts[s < 0 ? 'legL' : 'legR'] = lm.upper; parts[s < 0 ? 'shinL' : 'shinR'] = lm.lower; group.add(lm.upper);
    const am = buildLimb(s < 0 ? buckets.armL : buckets.armR, s * ARM_X, ARM_G, ELBOW_G, C, s < 0 ? buckets.handL : buckets.handR, HAND_G);
    parts[s < 0 ? 'armL' : 'armR'] = am.upper; parts[s < 0 ? 'foreL' : 'foreR'] = am.lower;
    if (am.hand) parts[s < 0 ? 'handL' : 'handR'] = am.hand;
    if (am.wrist) parts[s < 0 ? 'wristL' : 'wristR'] = am.wrist;
    group.add(am.upper);
  }

  if (martial) {
    for (const [name, sx] of [['padL', -ARM_X], ['padR', ARM_X]] as const) {
      const vo = new Vox(C, SUB);
      vo.fill(-3, -2, -3, 3, 2, 3, 0x7a828e);
      vo.fill(-4, 0, -2, 4, 2, 2, 0xb8bfc9, 0.03);
      vo.fill(-1, 3, 0, 1, 3, 0, 0xb8bfc9, 0.02);
      const m = vo.mesh();
      m.position.set(sx * C, PAD_G * C, 0);
      parts[name] = m; group.add(m);
    }
  }

  const WEAPON_Y = 34;
  if (weapon) {
    const wg = buildWeapon(weapon, scheme.accent, WC);
    wg.position.set(0.03, (WEAPON_Y - HAND_G) * C, 5 * C);
    wg.rotation.x = weapon === 'bow' || weapon === 'torch' ? -0.12 : 1.35;
    const handR = parts.handR as THREE.Mesh | undefined;
    if (handR) handR.add(wg); else group.add(wg);
    parts.weapon = wg as unknown as THREE.Mesh;
    (wg as any).userData.kind = weapon;
  }

  group.scale.setScalar(scheme.bulk ?? 1);

  const rig: Rig = {
    group, parts,
    anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: {
      hip: HIP_G * C, torso: TORSO_G * C, head: HEAD_G * C, eye: EYE_G * C,
      hair: HAIR_G * C, arm: ARM_G * C, hand: HAND_G * C, weapon: WEAPON_Y * C,
      pad: PAD_G * C, knee: KNEE_G * C, elbow: ELBOW_G * C, wrist: HAND_G * C,
    },
  };
  buildHierarchy(rig);
  return rig;
}
