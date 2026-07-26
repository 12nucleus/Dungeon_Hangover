/**
 * Animation Runtime — self-contained keyframe player for in-game use.
 *
 * Drop this file + the clip data anywhere, then in characters.ts updateRig():
 *
 *   import { playClipOnRig } from './animationEditor/AnimationRuntime';
 *   import { myWalkClip } from './myAnimationData';
 *
 *   // in updateRig(), BEFORE the pose-preset if/else chain:
 *   if (a.mode === 'myWalk') {
 *     playClipOnRig(rig, myWalkClip, a.t);
 *     return;  // skip the rest of updateRig() entirely
 *   }
 *
 * OR for a clip that runs on top of the game's position/animation scaffolding:
 *
 *   const hasKnee = !!(rig.pivots && rig.parts.shinL);
 *   if (a.mode === 'myIdle') {
 *     playClipOnRig(rig, myIdleClip, a.t);
 *     // fall through to let updateRig continue handling position/bob/weapon
 *     // but skip the pose preset section (the clip handles rotations)
 *     applyJointRotationsOnly = true; // set a flag, skip the if/else chain below
 *   }
 *
 * The function writes DIRECTLY onto rig.parts[name].rotation — exactly the
 * same part objects and euler axes that updateRig() uses.  The keyframe
 * interpolation is simple linear lerp, matching what the editor previews.
 */

import type { Rig } from '@/game/characters';
import type { AnimClip, JointEuler } from './animationTypes';
import { JOINT_NAMES } from './animationTypes';

function lerpEuler(a: JointEuler, b: JointEuler, t: number): JointEuler {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function sampleClip(clip: AnimClip, time: number): Record<string, JointEuler> {
  if (clip.keyframes.length === 0) return {};

  let t = time;
  if (clip.loop && clip.duration > 0) {
    t = ((t % clip.duration) + clip.duration) % clip.duration;
  }

  const kfs = clip.keyframes;

  if (kfs.length === 1) return { ...kfs[0].joints };

  let a = kfs[0], b = kfs[0];
  for (let i = 0; i < kfs.length; i++) {
    if (kfs[i].time >= t) {
      if (i === 0) return { ...kfs[0].joints };
      a = kfs[i - 1]; b = kfs[i];
      break;
    }
    a = kfs[i]; b = kfs[i];
  }
  if (t >= kfs[kfs.length - 1].time) return { ...kfs[kfs.length - 1].joints };

  const range = b.time - a.time;
  const frac = range > 0 ? (t - a.time) / range : 0;

  const result: Record<string, JointEuler> = {};
  for (const name of JOINT_NAMES) {
    const ae = a.joints[name] ?? { x: 0, y: 0, z: 0 };
    const be = b.joints[name] ?? { x: 0, y: 0, z: 0 };
    result[name] = lerpEuler(ae, be, frac);
  }
  return result;
}

/**
 * Apply a clip's interpolated joint rotations directly onto the rig.
 *
 * This mirrors updateRig()'s joint application at characters.ts:1322-1370.
 * Only rotations are written — position, scaling, weapon orientation,
 * and bob are left to the caller (updateRig()).
 */
export function playClipOnRig(rig: Rig, clip: AnimClip, t: number): void {
  const pose = sampleClip(clip, t);
  const p = rig.parts;

  const torsoX  = pose.torso  ? pose.torso.x  : 0;
  const headX   = pose.head   ? pose.head.x   : 0;
  const armLX   = pose.armL   ? pose.armL.x   : 0;
  const armLZ   = pose.armL   ? pose.armL.z   : 0;
  const armRX   = pose.armR   ? pose.armR.x   : 0;
  const armRZ   = pose.armR   ? pose.armR.z   : 0;
  const foreLX  = pose.foreL  ? pose.foreL.x  : 0;
  const foreLZ  = pose.foreL  ? pose.foreL.z  : 0;
  const foreRX  = pose.foreR  ? pose.foreR.x  : 0;
  const foreRZ  = pose.foreR  ? pose.foreR.z  : 0;
  const wristLX = pose.wristL ? pose.wristL.x : 0;
  const wristRX = pose.wristR ? pose.wristR.x : 0;
  const legLX   = pose.legL   ? pose.legL.x   : 0;
  const legRX   = pose.legR   ? pose.legR.x   : 0;
  const shinLX  = pose.shinL  ? pose.shinL.x  : 0;
  const shinRX  = pose.shinR  ? pose.shinR.x  : 0;

  p.legL.rotation.x = legLX;
  p.legR.rotation.x = legRX;
  p.legL.rotation.z = 0;
  p.legR.rotation.z = 0;

  if (p.shinL) {
    p.shinL.rotation.x = shinLX;
    p.shinR.rotation.x = shinRX;
  }

  p.armL.rotation.x = armLX;
  p.armR.rotation.x = armRX;
  p.armL.rotation.z = armLZ;
  p.armR.rotation.z = armRZ;

  if (p.foreL) {
    const fLO = rig.anim.forearmLOffset ?? 0;
    const fRO = rig.anim.forearmROffset ?? 0;
    p.foreL.rotation.x = foreLX + fLO;
    p.foreR.rotation.x = foreRX + fRO;
    p.foreL.rotation.z = foreLZ;
    p.foreR.rotation.z = foreRZ;

    const wizL = fLO ? -(armLX + foreLX + fLO) : 0;
    const wizR = fRO ? -(armRX + foreRX + fRO) : 0;
    if (p.wristL) p.wristL.rotation.x = wristLX + wizL;
    if (p.wristR) p.wristR.rotation.x = wristRX + wizR;
    if (p.handL) p.handL.rotation.x = 0;
    if (p.handR) p.handR.rotation.x = 0;
  } else {
    if (p.handL) p.handL.rotation.x = armLX;
    if (p.handR) p.handR.rotation.x = armRX;
  }

  p.torso.rotation.x = torsoX;
  p.head.rotation.x = headX;
}