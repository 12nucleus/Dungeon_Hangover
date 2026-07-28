// ─────────────────────────────────────────────────────────────
// Orc Rig — detailed orc enemy with tusks, glowing eyes, etc.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox } from './vox';
import { buildWeapon } from './weapon';
import { orcModel } from '../voxelModels.mjs';
import type { Rig } from './vox';
import type { CharacterScheme, WeaponKind } from '../types';

export function buildOrcRig(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  const model = orcModel(scheme, weapon ?? 'club');
  const C = model.cube;
  const SUB = 2;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};

  const meshFrom = (voxels: { x: number; y: number; z: number; c: number }[]): THREE.Mesh => {
    const v = new Vox(C, SUB);
    for (const p of voxels) v.add(p.x, p.y, p.z, p.c);
    return v.mesh();
  };

  for (const [name, part] of Object.entries(model.parts)) {
    const m = meshFrom(part.voxels);
    m.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);
    parts[name] = m;
    group.add(m);
  }

  const eyeMat = new THREE.MeshLambertMaterial({ color: model.eyes.color, emissive: model.eyes.color, emissiveIntensity: 0.9 });
  const eyeNames = ['eyeL', 'eyeR'] as const;
  model.eyes.positions.forEach((p, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.05), eyeMat);
    m.position.set(p[0], p[1], p[2]);
    m.castShadow = false;
    parts[eyeNames[i]] = m;
    group.add(m);
  });

  if (weapon) {
    const wg = buildWeapon(weapon, scheme.accent, 0.07, SUB);
    if (weapon === 'torch') { wg.position.set(0.42, 0.72, 0.1); wg.rotation.x = -0.12; }
    else { wg.position.set(0.42, 0.5, 0.1); wg.rotation.x = weapon === 'bow' ? 0 : 1.35; }
    group.add(wg);
    parts.weapon = wg as unknown as THREE.Mesh;
    (wg as unknown as THREE.Object3D).userData.kind = weapon;
  }

  group.scale.setScalar(scheme.bulk ?? 1);
  return { group, parts, anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 } };
}
