// ─────────────────────────────────────────────────────────────
// buildLimb — two-bone limb builder (thigh+shin / upper+forearm)
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox } from './vox';

export interface Limb {
  upper: THREE.Group; lower: THREE.Group; hand?: THREE.Mesh; wrist?: THREE.Group;
}

/**
 * Build a two-bone limb as nested Groups so the lower segment pivots at the
 * knee/elbow and follows the upper segment's swing.
 * `splitY` is the grid height of the joint. Voxels with gy >= splitY go to the
 * upper bone, the rest to the lower bone.
 */
export function buildLimb(bucket: Map<string, number>, cx: number, cyUpper: number, splitY: number, C: number, handBucket?: Map<string, number>, handCy?: number, SUB: number = 1): Limb {
  const JIT = 0.035;
  const upper = new THREE.Group();
  const lower = new THREE.Group();
  const voU = new Vox(C, SUB), voL = new Vox(C, SUB);
  for (const [k, c] of bucket) {
    const [gx, gy, gz] = k.split(',').map(Number);
    if (gy >= splitY) voU.add(gx - cx, gy - cyUpper, gz, c, JIT);
    else voL.add(gx - cx, gy - splitY, gz, c, JIT);
  }
  upper.position.set(cx * C, cyUpper * C, 0);
  const um = voU.mesh(); upper.add(um);
  lower.position.set(0, (splitY - cyUpper) * C, 0);
  const lm = voL.mesh(); lower.add(lm);
  upper.add(lower);
  let hand: THREE.Mesh | undefined;
  let wrist: THREE.Group | undefined;
  if (handBucket && handCy !== undefined) {
    const vh = new Vox(C, SUB);
    for (const [k, c] of handBucket) {
      const [gx, gy, gz] = k.split(',').map(Number);
      vh.add(gx - cx, gy - handCy!, gz, c, JIT);
    }
    wrist = new THREE.Group();
    wrist.position.set(0, (handCy - splitY) * C, 0);
    hand = vh.mesh();
    wrist.add(hand);
    lower.add(wrist);
  }
  return { upper, lower, hand, wrist };
}
