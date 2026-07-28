// ─────────────────────────────────────────────────────────────
// Skeleton Rig — undead skeleton
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox, shade } from './vox';
import { buildWeapon } from './weapon';
import type { Rig } from './vox';
import type { CharacterScheme, WeaponKind } from '../types';

export function buildSkeletonRig(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  const C = 0.1;
  const SUB = 4;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const bone = scheme.skin, boneD = shade(bone, 0.78), cloth = scheme.cloth, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: (v: Vox) => void) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.12, 0.25, 0, (v) => {
    v.fill(0, -2, 0, 0, 2, 0, bone); v.add(0, 1, 0, boneD); v.add(0, -2, 1, boneD);
  });
  part('torso', 0, 0.78, 0, (v) => {
    v.fill(-2, 3, -1, 2, 3, 1, bone);
    v.fill(0, -2, 0, 0, 3, 0, boneD);
    for (let r = 0; r < 3; r++) { v.fill(-2, r, 0, 2, r, 1, bone); v.add(0, r, 1, boneD); }
    v.fill(-2, -2, -1, 2, -2, 1, boneD);
    v.fill(-1, 3, -1, 1, 4, 1, boneD);
    v.fill(-2, 3, 1, 2, 4, 2, cloth);
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.32, 0.8, 0, (v) => {
    v.fill(0, -2, 0, 0, 2, 0, bone); v.add(0, 0, 0, boneD);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.32, 0.52, 0.02, (v) => {
    v.add(0, 0, 0, bone); v.add(0, 0, 1, boneD); v.add(0, -1, 1, bone);
  });
  part('head', 0, 5.8, 0, (v) => {
    v.fill(-2, -1, -2, 2, 1, 2, bone);
    v.fill(-1, -1, 0, 1, -1, 2, boneD);
    v.add(-1, 0, 3, 0x101014); v.add(1, 0, 3, 0x101014);
    v.add(0, -1, 3, 0x101014);
  });
  const eyeMat = new THREE.MeshLambertMaterial({ color: eye, emissive: eye, emissiveIntensity: 0.9 });
  for (const [name, x] of [['eyeL', -0.1], ['eyeR', 0.1]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), eyeMat);
    m.position.set(x, 5.84, 0.24); m.castShadow = false; parts[name] = m; group.add(m);
  }
  if (weapon) {
    const wg = buildWeapon(weapon, scheme.accent, C, SUB);
    wg.position.set(0.36, 0.5, 0.08); wg.rotation.x = weapon === 'bow' ? 0 : 1.35;
    group.add(wg); parts.weapon = wg as unknown as THREE.Mesh; (wg as unknown as THREE.Object3D).userData.kind = weapon;
  }

  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.25, torso: 0.78, head: 5.8, eye: 5.84, hair: 5.8, arm: 0.8, hand: 0.52, weapon: 0.5 },
  };
}
