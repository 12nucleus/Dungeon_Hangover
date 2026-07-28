// ─────────────────────────────────────────────────────────────
// buildCharacter — dispatch to the correct rig builder
// setWeapon — swap or remove a rig's weapon
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { C_DETAIL, C_CHIBI, C_NORMAL } from './vox';
import { buildWeapon } from './weapon';
import { buildPlayerRig } from './rigPlayer';
import { buildChibiRig } from './rigChibi';
import { buildRatRig } from './rigRat';
import { buildBatRig } from './rigBat';
import { buildSkeletonRig } from './rigSkeleton';
import { buildOrcRig } from './rigOrc';
import { buildHumanoidRig } from './rigHumanoid';
import type { Rig } from './vox';
import type { CharacterScheme, WeaponKind } from '../types';

export function buildCharacter(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  if (scheme.monster === 'rat') return buildRatRig(scheme);
  if (scheme.monster === 'bat') return buildBatRig(scheme);
  if (scheme.monster === 'skeleton') return buildSkeletonRig(scheme, weapon);
  if (scheme.kind === 'wizard') return buildHumanoidRig(scheme, weapon, { robe: true, beard: true, hat: true, stars: true, leftHand: true });
  if (scheme.kind === 'barmaid') return buildHumanoidRig(scheme, weapon, { dress: true, apron: true, bun: true, tray: true });
  if (scheme.kind === 'bouncer') return buildHumanoidRig(scheme, weapon, { bald: true, vest: true });
  if (scheme.kind === 'barkeep') return buildHumanoidRig(scheme, weapon, { apron: true, bald: true });
  if (scheme.style === 'normal') return buildPlayerRig(scheme, weapon);
  if (scheme.orc) return buildOrcRig(scheme, weapon);
  return buildChibiRig(scheme, weapon);
}

/** Swap (or remove) the weapon held in the rig's hand. Pass null to unequip. */
export function setWeapon(rig: Rig, kind: WeaponKind | null, accent: number) {
  const existing = rig.parts.weapon as unknown as THREE.Object3D | undefined;
  if (existing) {
    existing.parent?.remove(existing);
    existing.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    delete (rig.parts as { weapon?: THREE.Mesh }).weapon;
  }
  if (!kind) return;

  const detailed = !!rig.pivots;
  const C = detailed ? C_DETAIL : C_CHIBI;
  const WC = detailed ? C_NORMAL : C_CHIBI;
  const wg = buildWeapon(kind, accent, WC);
  if (detailed) {
    const handR = rig.parts.handR as THREE.Mesh | undefined;
    if (handR) {
      wg.position.set(0.03, ((rig.pivots!.weapon ?? 34 * C) / C - 31) * C, 5 * C);
      wg.rotation.x = kind === 'bow' || kind === 'torch' ? -0.12 : 1.35;
      handR.add(wg);
    } else {
      wg.position.set(10 * C + 0.03, (rig.pivots!.weapon ?? 28 * C), 5 * C);
      wg.rotation.x = kind === 'bow' || kind === 'torch' ? -0.12 : -0.6;
      rig.group.add(wg);
    }
  } else if (kind === 'torch') {
    wg.position.set(0.38, 0.72, 0.08); wg.rotation.x = -0.12;
    rig.group.add(wg);
  } else {
    wg.position.set(0.38, 0.5, 0.08); wg.rotation.x = kind === 'bow' ? 0 : 1.35;
    rig.group.add(wg);
  }
  rig.parts.weapon = wg as unknown as THREE.Mesh;
  (wg as unknown as THREE.Object3D).userData.kind = kind;
}
