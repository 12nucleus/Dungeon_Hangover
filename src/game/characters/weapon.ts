// ─────────────────────────────────────────────────────────────
// buildWeapon — create voxel weapons (sword, club, staff, etc.)
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox, METAL, METAL_DARK, DARK, orbMat } from './vox';
import type { WeaponKind } from '../types';

export function buildWeapon(kind: WeaponKind, accent: number, C: number, SUB: number = 1): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox(C, SUB);
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
      v.fill(0, -34, 0, 0, 27, 0, 0x6b4a2e);
      v.fill(-1, 27, 0, 1, 27, 0, 0x5f3e22);
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
    const gemSize = 0.11;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(gemSize, 0), orbMat);
    orb.position.set(0, 28.5 * C, 0);
    orb.castShadow = true;
    g.add(orb);
    const gem2 = new THREE.Mesh(new THREE.OctahedronGeometry(gemSize * 0.6, 0), orbMat);
    gem2.position.set(0, 28.5 * C, 0);
    gem2.rotation.y = Math.PI / 4;
    gem2.castShadow = true;
    g.add(gem2);
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
