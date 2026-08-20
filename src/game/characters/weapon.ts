// ─────────────────────────────────────────────────────────────
// buildWeapon — create voxel weapons (sword, club, staff, etc.)
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox, METAL, METAL_DARK, orbMat } from './vox';
import type { WeaponKind } from '../types';

export function buildWeapon(kind: WeaponKind, accent: number, C: number, SUB: number = 1, enchantId?: string): THREE.Group {
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
    case 'bow': {
      // recurve bow — riser + curved limbs + string + nocked arrow
      const LIMB = 0x6b4a2e, LIMB2 = 0x5a3d24, STR = 0xe8e0c8;
      // grip riser
      v.fill(0, 0, 0, 0, 2, 0, grip);
      // upper limb recurve
      v.add(-1, 2, 0, LIMB); v.add(-1, 3, 0, LIMB); v.add(-2, 4, 0, LIMB); v.add(-2, 5, 0, LIMB2); v.add(-1, 6, 0, LIMB);
      // lower limb mirrored
      v.add(-1, -1, 0, LIMB); v.add(-2, -2, 0, LIMB); v.add(-2, -3, 0, LIMB2); v.add(-1, -2, 0, LIMB);
      // string — fine dark line just behind the bow
      for (let y = -3; y <= 6; y++) v.add(-2, y, 0, STR);
      // nocked arrow — shaft + steel head + red fletching
      v.add(1, 1, 0, LIMB); v.add(2, 1, 0, LIMB); v.add(3, 1, 0, METAL); v.add(0, 1, 0, 0x8a3a2e);
      v.add(-1, 1, 0, 0xc93a2e);
      break;
    }
    case 'torch':
      v.fill(0, 0, 0, 0, 4, 0, 0x6b4a2e);
      v.fill(-1, 4, -1, 1, 5, 1, 0x3a2a18);
      break;
    case 'unarmed':
      // no weapon — return empty group
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
  // enchant VFX — tip glow + small point light (visible when equipped)
  if (enchantId) {
    const colMap: Record<string, number> = { flaming: 0xff7a1f, frost: 0x7dd3fc, shocking: 0xfde047, vital: 0x4ade80, warding: 0x93c5fd, swift: 0xf0abfc, keen: 0xffffff };
    const col = colMap[enchantId] ?? 0xffd76b;
    const tipY = kind === 'bow' ? 6 : kind === 'staff' ? 27 : 8;
    const tipMat = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.95 });
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), tipMat);
    tip.position.set(kind === 'bow' ? -2 * C : 0, tipY * C, 0);
    g.add(tip);
    if (enchantId === 'flaming') {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), new THREE.MeshLambertMaterial({ color: 0xff3a1a, emissive: 0xff3a1a, emissiveIntensity: 1 }));
      f.position.set(kind === 'bow' ? -2 * C : 0, (tipY + 1) * C, 0);
      g.add(f);
      const light = new THREE.PointLight(col, 1.2, 3, 1.8);
      light.position.set(kind === 'bow' ? -2 * C : 0, tipY * C, 0);
      g.add(light);
      g.userData.enchant = 'flaming';
    } else if (enchantId === 'frost') {
      const ice = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.05), new THREE.MeshLambertMaterial({ color: 0xcfefff, emissive: 0x7dd3fc, emissiveIntensity: 0.9 }));
      ice.position.set(kind === 'bow' ? -2 * C : 0.06, (tipY - 0.5) * C, 0.04);
      g.add(ice);
      g.userData.enchant = 'frost';
    } else if (enchantId === 'shocking') {
      g.userData.enchant = 'shocking';
    } else if (enchantId) {
      g.userData.enchant = enchantId;
    }
  }
  return g;
}
