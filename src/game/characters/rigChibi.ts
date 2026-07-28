// ─────────────────────────────────────────────────────────────
// Chibi Rig — simplified character for goblins/orcs
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox, C_CHIBI, DARK, BOOT } from './vox';
import { buildWeapon } from './weapon';
import type { Rig } from './vox';
import type { CharacterScheme, WeaponKind } from '../types';

export function buildChibiRig(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  const C = C_CHIBI;
  const SUB = 4;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const orc = scheme.orc === true;
  const martial = weapon === 'sword' || weapon === 'mace' || weapon === 'club';
  const skin = scheme.skin, cloth = scheme.cloth, accent = scheme.accent, hair = scheme.hair;

  for (const [name, x] of [['legL', -0.12], ['legR', 0.12]] as const) {
    const v = new Vox(C, SUB);
    v.fill(0, -1, -1, 0, 2, 0, orc ? skin : accent);
    v.fill(0, -2, -1, 0, -2, 0, BOOT);
    const m = v.mesh();
    m.position.set(x, 0.25, 0);
    parts[name] = m; group.add(m);
  }
  {
    const v = new Vox(C, SUB);
    v.fill(-2, -1, -1, 2, 2, 1, cloth);
    v.fill(-2, -2, -1, 2, -2, 1, accent);
    if (weapon === 'staff') { v.fill(-2, -3, -1, 2, -3, 1, cloth); v.fill(-3, -4, -2, 2, -4, 1, cloth); }
    if (orc) { v.fill(-1, -3, 1, 1, -3, 1, accent); v.fill(0, -4, 1, 1, -4, 1, accent); v.fill(-2, 1, 2, 2, 1, 2, accent); }
    const torso = v.mesh(); torso.position.set(0, 0.78, 0);
    parts.torso = torso; group.add(torso);
  }
  for (const [name, x] of [['armL', -0.35], ['armR', 0.35]] as const) {
    const v = new Vox(C, SUB);
    v.fill(0, -1, -1, 0, 2, 0, orc ? skin : cloth);
    v.fill(0, -2, -1, 0, -2, 0, orc ? accent : cloth);
    const m = v.mesh(); m.position.set(x, 0.8, 0);
    parts[name] = m; group.add(m);
  }
  for (const [name, x] of [['handL', -0.35], ['handR', 0.35]] as const) {
    const v = new Vox(C, SUB); v.add(0, 0, 0, skin);
    const m = v.mesh(); m.position.set(x, 0.52, 0);
    parts[name] = m; group.add(m);
  }
  {
    const v = new Vox(C, SUB);
    v.fill(-2, -2, -2, 1, 1, 1, skin);
    if (orc) { v.fill(-2, 1, 2, 1, 1, 2, 0x241a10, 0.04); v.add(-1, -2, 2, 0xf2ede0, 0.03); v.add(0, -2, 2, 0xf2ede0, 0.03); v.fill(-4, 0, 0, -3, 0, 0, skin); v.fill(2, 0, 0, 3, 0, 0, skin); }
    else if (weapon === 'mace') { v.fill(-2, -3, 0, 1, -3, 2, hair); v.fill(-2, -2, 2, 1, -2, 2, hair); }
    const head = v.mesh(); head.position.set(0, 1.28, 0);
    parts.head = head; group.add(head);
  }
  for (const [name, x] of [['eyeL', -0.09], ['eyeR', 0.09]] as const) {
    const v = new Vox(C, SUB); v.add(0, 0, 0, orc ? 0x3d1414 : DARK, 0);
    const m = v.mesh(); m.position.set(x, 1.3, 0.16);
    parts[name] = m; group.add(m);
  }
  if (scheme.hood) {
    const hv = new Vox(C, SUB); hv.fill(-2, -1, -2, 1, 0, 1, cloth);
    const hood = hv.mesh(); hood.position.set(0, 1.44, -0.02);
    parts.hood = hood; group.add(hood);
    const tv = new Vox(C, SUB); tv.fill(-1, 0, -1, 0, 0, 0, cloth); tv.add(0, 1, -1, cloth);
    const hoodTip = tv.mesh(); hoodTip.position.set(0, 1.58, -0.06);
    parts.hoodTip = hoodTip; group.add(hoodTip);
  } else {
    const v = new Vox(C, SUB);
    if (weapon === 'sword') v.fill(-2, -1, -2, 1, 0, 1, hair);
    else { v.fill(-2, 0, -2, 1, 0, 1, hair); v.fill(-2, -1, -2, 1, -1, -2, hair); }
    const m = v.mesh(); m.position.set(0, 1.5, 0);
    parts.hair = m; group.add(m);
  }
  if (martial) {
    for (const [name, x] of [['padL', -0.35], ['padR', 0.35]] as const) {
      const v = new Vox(C, SUB); v.fill(-1, 0, -1, 1, 0, 1, 0x7a828e);
      const m = v.mesh(); m.position.set(x, 1.02, 0);
      parts[name] = m; group.add(m);
    }
  }
  if (weapon) {
    const wg = buildWeapon(weapon, accent, C, SUB);
    if (weapon === 'torch') { wg.position.set(0.38, 0.72, 0.08); wg.rotation.x = -0.12; }
    else { wg.position.set(0.38, 0.5, 0.08); wg.rotation.x = weapon === 'bow' ? 0 : 1.35; }
    group.add(wg);
    parts.weapon = wg as unknown as THREE.Mesh;
    (wg as any).userData.kind = weapon;
  }
  group.scale.setScalar(scheme.bulk ?? 1);
  return { group, parts, anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 } };
}
