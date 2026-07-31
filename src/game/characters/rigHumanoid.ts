// ─────────────────────────────────────────────────────────────
// Distinguished Tavern NPCs — wizard / barmaid / bouncer
// One compact, feature-driven humanoid builder re-used for all three
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox, C_DETAIL, C_NORMAL, shade } from './vox';
import { buildLimb } from './limb';
import { buildHierarchy } from './hierarchy';
import { buildWeapon } from './weapon';
import type { Rig } from './vox';
import type { CharacterScheme, WeaponKind } from '../types';

export interface HumanoidFeat {
  robe?: boolean; dress?: boolean; beard?: boolean; hat?: boolean;
  bun?: boolean; bald?: boolean; apron?: boolean; vest?: boolean;
  stars?: boolean; tray?: boolean; leftHand?: boolean;
}

export function buildHumanoidRig(scheme: CharacterScheme, weapon: WeaponKind | undefined, feat: HumanoidFeat): Rig {
  const C = C_DETAIL;
  const WC = C_NORMAL;
  const SUB = 1;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const skin = scheme.skin, skinD = shade(skin, 0.86), skinHL = shade(skin, 1.1);
  const cloth = scheme.cloth, clothD = shade(cloth, 0.85);
  const pant = scheme.accent, pantD = shade(pant, 0.8);
  const hairC = scheme.hair;
  const STAR = 0xf3c969, WHITE = 0xf2efe6, VEST = 0x20232b;

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
  const ell = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number, inner = 0) => {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
      for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          const d = dx * dx + dy * dy + dz * dz;
          if (d <= 1.02 && d >= inner) put(x, y, z, c);
        }
  };

  // ── LEGS ──
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.legL : buckets.legR;
    const cx = s * LEG_X;
    if (feat.robe) {
      colf(cx, 0, 0, 34, 3, 3, cloth);
    } else if (feat.dress) {
      box(cx - 3, 0, -4, cx + 3, 2, 6, 0x3a2a1a);
      // Broad skirt volume follows each leg; do not add a fixed centre column,
      // which looked like a rigid pillar through the moving leg.
      colf(cx, 0.5, 2, 34, 3.8, 4.1, cloth);
    } else {
      box(cx - 3, 0, -4, cx + 3, 2, 6, 0x3a2a1a);
      colf(cx, 0.5, 2, 34, 3.2, 3.4, pant);
      for (let y = 4; y <= 33; y += 3) put(cx, y, 4, pantD);
    }
  }
  if (feat.robe) { buckets.legL.clear(); buckets.legR.clear(); }

  // ── TORSO ──
  cur = buckets.torso;
  if (feat.robe || feat.dress) {
    const top = feat.robe ? 56 : 44;
    for (let y = 0; y <= top; y++) {
      let rx: number, rz: number;
      if (feat.robe && y <= 33) {
        const s = y / 33;
        rx = 6.5 + 5.0 * (1 - s);
        rz = 6.5 + 5.7 * (1 - s);
      } else {
        rx = feat.robe ? 5.2 : (feat.dress ? 7.4 - y * 0.035 : 5.6 - y * 0.05);
        rz = feat.robe ? 4.2 : (feat.dress ? 5.6 : 4.0);
      }
      colf(0, 0, y, y, Math.max(2, rx), rz, (feat.dress || y >= 33) ? cloth : pant);
    }
  }
  for (let y = 37; y <= 55; y++) { const t = (y - 37) / 18; const hx = Math.round(7 + t * 1.8); for (let x = -hx; x <= hx; x++) for (let z = -5; z <= 5; z++) put(x, y, z, cloth); }
  box(-8, 33, 4, 8, 36, 5, 0x2a2018); put(0, 34, 5, 0xc9a94a);
  box(-11, 53, 0, 11, 56, 4, clothD);
  colf(0, -1, 55, 58, 2.2, 2.0, skin);
  if (feat.vest) for (let y = 37; y <= 54; y++) for (let x = -6; x <= 6; x++) for (let z = 3; z <= 5; z++) put(x, y, z, VEST);
  if (feat.vest) put(0, 45, 5, 0xc9a94a);
  if (feat.apron) for (let y = 37; y <= 50; y++) for (let x = -4; x <= 4; x++) for (let z = 4; z <= 5; z++) put(x, y, z, WHITE);
  if (feat.stars) for (const [sx, sy] of [[-3, 46], [3, 46], [0, 50], [-2, 52], [2, 52]] as const) { put(sx, sy, 6, STAR); put(sx, sy + 1, 6, STAR); }

  // ── ARMS ──
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.armL : buckets.armR;
    const cx = s * ARM_X;
    colf(cx, 0, 43, 55, 2.6, 2.6, feat.robe || feat.dress ? cloth : cloth);
    colf(cx, 0, 34, 42, 2.2, 2.3, skin);
    if (feat.vest) for (let y = 43; y <= 55; y++) for (let z = -2; z <= 2; z++) put(cx, y, z, VEST);
  }
  // ── HANDS ──
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.handL : buckets.handR;
    const cx = s * ARM_X;
    ell(cx, 33, 0, 2.2, 2.4, 2.2, skin);
    for (let f = -1; f <= 1; f++) box(cx + f, 31, -1, cx + f, 33, 1, skin);
  }
  // ── HEAD + face ──
  cur = buckets.head;
  ell(0, HEAD_G, 0, 6, 8, 6, skin);
  ell(0, 58, 1, 4.5, 3.5, 5, skin);
  for (const s of [-1, 1]) { const ex = s * 3; box(ex - 1, 62, 5, ex + 1, 63, 6, skinD); put(ex, 63, 6, 0xf5f2ec); put(ex, 62, 6, 0x6b4426); }
  put(0, 60, 6, skinD); box(-2, 59, 6, 2, 59, 6, 0xb05a4a);
  if (feat.beard) for (let y = 54; y <= 58; y++) {
    const w = Math.max(0, Math.round((y - 54) * 0.9));
    const z = 6 + Math.round((58 - y) * 0.25);
    for (let x = -w; x <= w; x++) put(x, y, z, y >= 57 ? WHITE : 0xcfc9bd);
  }
  // ── HAIR / HAT / BALD ──
  cur = buckets.hair;
  if (feat.bald) {
    for (let y = 70; y <= 72; y++) for (let x = -3; x <= 3; x++) {
      const dx = x / 6, dy = (y - HEAD_G) / 8, dz = 3 / 6;
      if (dx * dx + dy * dy + dz * dz <= 1.02) put(x, y, 3, skinHL);
    }
  } else if (feat.hat) {
    box(-6, 64, -6, 6, 66, 6, clothD);
    for (let y = 66; y <= 82; y++) { const r = Math.max(1, Math.round(5 - (y - 66) * 0.28)); for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (x * x + z * z <= r * r + 1) put(x, y, z, cloth); }
    put(0, 82, 0, STAR); put(0, 80, 1, STAR); putM(0, 68, 7, STAR);
  } else if (feat.bun) {
    ell(0, 78, -2, 3, 3, 3, hairC);
    for (let y = 63; y <= 76; y++) { const w = Math.round(5 - (y - 63) * 0.2); for (let x = -w; x <= w; x++) for (let z = -5; z <= 1; z++) put(x, y, z, hairC); }
  } else {
    for (let y = 63; y <= 78; y++) { const w = Math.round(5 - (y - 63) * 0.2); for (let x = -w; x <= w; x++) for (let z = -5; z <= 1; z++) put(x, y, z, hairC); }
  }

  if (feat.hat) {
    for (const k of [...buckets.head.keys()]) {
      const gy = Number(k.split(',')[1]);
      if (gy >= 70) buckets.head.delete(k);
    }
  } else {
    for (const k of [...buckets.hair.keys()]) if (buckets.head.has(k)) buckets.hair.delete(k);
  }

  for (const name of ['torso', 'head', 'hair'] as const) {
    const info = partInfo[name];
    const vo = new Vox(C, SUB);
    for (const [k, c] of buckets[name]) { const [gx, gy, gz] = k.split(',').map(Number); vo.add(gx - info.cx, gy - info.cy, gz, c, 0.035); }
    const m = vo.mesh(); m.position.set(info.cx * C, info.cy * C, 0); parts[name] = m; group.add(m);
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

  if (feat.tray) {
    const tray = new THREE.Group();
    const tm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), new THREE.MeshLambertMaterial({ color: WHITE }));
    tray.add(tm);
    const mug = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.1), new THREE.MeshLambertMaterial({ color: 0x8a5a2a }));
    mug.position.set(0.1, 0.09, 0.1); tray.add(mug);
    const handR = parts.handR as THREE.Mesh | undefined;
    if (handR) handR.add(tray); else group.add(tray);
  } else if (weapon) {
    const wg = buildWeapon(weapon, scheme.accent, WC);
    const staffOffsetZ = feat.leftHand ? 1.5 * C : 5 * C;
    wg.position.set(0.03, (34 - HAND_G) * C, staffOffsetZ);
    wg.rotation.x = weapon === 'staff' ? 0 : (weapon === 'bow' || weapon === 'torch' ? -0.12 : 1.35);
    const hand = (feat.leftHand ? parts.handL : parts.handR) as THREE.Mesh | undefined;
    if (hand) hand.add(wg); else group.add(wg);
    parts.weapon = wg as unknown as THREE.Mesh; (wg as any).userData.kind = weapon;
  }

  group.scale.setScalar(scheme.bulk ?? 1);
  const rig: Rig = {
    group, parts,
    anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: HIP_G * C, torso: TORSO_G * C, head: HEAD_G * C, eye: EYE_G * C, hair: HAIR_G * C, arm: ARM_G * C, hand: HAND_G * C, weapon: 34 * C, pad: PAD_G * C, knee: KNEE_G * C, elbow: ELBOW_G * C, wrist: HAND_G * C },
  };
  buildHierarchy(rig);
  return rig;
}
