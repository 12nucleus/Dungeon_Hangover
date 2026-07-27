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
  const hier = !!rig.group.userData.hierarchyBuilt;

  // helper: read a joint's xyz from the sampled pose (default 0)
  const j = (name: string) => pose[name] ?? { x: 0, y: 0, z: 0 };

  // Set the torso first so its rotation is available for flat→local conversion
  // of head/arms on hierarchical rigs.
  const tj = j('torso');
  if (p.torso) p.torso.rotation.set(tj.x, tj.y, tj.z);

  // hip: rotates both legs together (child of group, no conversion needed)
  const hj = j('hip');
  if (p.hip) p.hip.rotation.set(hj.x, hj.y, hj.z);

  // legs (full 3-axis)
  const ll = j('legL'), lr = j('legR');
  if (p.legL) p.legL.rotation.set(ll.x, ll.y, ll.z);
  if (p.legR) p.legR.rotation.set(lr.x, lr.y, lr.z);

  // shins / knees (full 3-axis)
  const sl = j('shinL'), sr = j('shinR');
  if (p.shinL) p.shinL.rotation.set(sl.x, sl.y, sl.z);
  if (p.shinR) p.shinR.rotation.set(sr.x, sr.y, sr.z);

  // arms (full 3-axis, flat→local on hierarchical rigs)
  const al = j('armL'), ar = j('armR');
  if (p.armL) p.armL.rotation.set(hier ? al.x - tj.x : al.x, hier ? al.y - tj.y : al.y, hier ? al.z - tj.z : al.z);
  if (p.armR) p.armR.rotation.set(hier ? ar.x - tj.x : ar.x, hier ? ar.y - tj.y : ar.y, hier ? ar.z - tj.z : ar.z);

  // forearms / elbows (full 3-axis)
  const fl = j('foreL'), fr = j('foreR');
  const fLO = rig.anim.forearmLOffset ?? 0;
  const fRO = rig.anim.forearmROffset ?? 0;
  if (p.foreL) p.foreL.rotation.set(fl.x + fLO, fl.y, fl.z);
  if (p.foreR) p.foreR.rotation.set(fr.x + fRO, fr.y, fr.z);

  // wrists (full 3-axis) + wizard staff counter-rotation
  const wl = j('wristL'), wr = j('wristR');
  const wizL = fLO ? -(al.x + fl.x + fLO) : 0;
  const wizR = fRO ? -(ar.x + fr.x + fRO) : 0;
  if (p.wristL) p.wristL.rotation.set(wl.x + wizL, wl.y, wl.z);
  if (p.wristR) p.wristR.rotation.set(wr.x + wizR, wr.y, wr.z);
  if (p.handL) p.handL.rotation.set(0, 0, 0);
  if (p.handR) p.handR.rotation.set(0, 0, 0);

  // head (full 3-axis, flat→local on hierarchical rigs)
  const hd = j('head');
  if (p.head) p.head.rotation.set(hier ? hd.x - tj.x : hd.x, hier ? hd.y - tj.y : hd.y, hier ? hd.z - tj.z : hd.z);
  // hair/hood follow the head (local 0 on hierarchical rigs)
  if (p.hair) p.hair.rotation.set(hier ? 0 : hd.x, hier ? 0 : hd.y, hier ? 0 : hd.z);
  if (p.hood) p.hood.rotation.set(hier ? 0 : hd.x, hier ? 0 : hd.y, hier ? 0 : hd.z);
  if (p.hoodTip) p.hoodTip.rotation.set(hier ? 0 : hd.x, hier ? 0 : hd.y, hier ? 0 : hd.z);
}