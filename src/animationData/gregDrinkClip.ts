/**
 * Clip "drink_anim" — Greg's 3-second drinking animation.
 *
 * Phases:
 *   0.00s  Resting (mug on the table, sit pose)
 *   0.85s  Mug raised to the mouth
 *   1.40s  Sipping (head tilts back)
 *   1.90s  Head returns forward, mug still at mouth
 *   3.00s  Back to rest (mug lowered to the table)
 *
 * Duration: 3s  Loop: false  Keyframes: 5
 *
 * USAGE (in src/game/characters.ts updateRig):
 *
 *   1. Import at the top:
 *        import { playClipOnRig } from '../animationEditor/AnimationRuntime';
 *        import { gregDrinkClip } from '../animationData/gregDrinkClip';
 *
 *   2. Add an early branch (after the death/getup handling, before the
 *      pose-preset chain):
 *        if (a.mode === 'drink_anim') {
 *          DROP = 0.20; legScaleY = Math.max(0.5, 1 - DROP / HIP);
 *          hipY = HIP - 0.22;
 *          playClipOnRig(rig, gregDrinkClip, a.t);
 *          // … apply sitting positions …
 *          return;
 *        }
 */

import type { AnimClip } from '@/animationEditor/animationTypes';

export const gregDrinkClip: AnimClip = {
  name: 'drink_anim',
  duration: 3,
  loop: false,
  keyframes: [
    // ── 0.00s: Resting — mug rests on the table (sit pose) ──
    { time: 0,
      joints: {
        torso: { x: 0.06, y: 0, z: 0 },
        head: { x: -0.05, y: 0, z: 0 },
        hip: { x: 0, y: 0, z: 0 },
        armL: { x: -1.35, y: 0, z: 0 },
        foreL: { x: 0.15, y: 0, z: 0 },
        wristL: { x: 0, y: 0, z: 0 },
        handL: { x: 0, y: 0, z: 0 },
        armR: { x: -0.452, y: 0, z: 0.048 },
        foreR: { x: 0.128, y: 0, z: 0.148 },
        wristR: { x: 0, y: 0, z: 0 },
        handR: { x: 0, y: 0, z: 0 },
        legL: { x: -1.492, y: 0, z: 0 },
        shinL: { x: 1.368, y: 0, z: 0 },
        legR: { x: -1.702, y: 0, z: 0 },
        shinR: { x: 1.688, y: 0, z: 0 },
      },
    },
    // ── 0.85s: Mug raised to the mouth (drink pose) ──
    { time: 0.85,
      joints: {
        torso: { x: 0.06, y: 0, z: 0 },
        head: { x: -0.05, y: 0, z: 0 },
        hip: { x: 0, y: 0, z: 0 },
        armL: { x: -1.342, y: 0, z: -0.152 },
        foreL: { x: -1.192, y: 0, z: 0.998 },
        wristL: { x: 0, y: 0, z: 0 },
        handL: { x: 0, y: 0, z: 0 },
        armR: { x: -0.452, y: 0, z: 0.048 },
        foreR: { x: 0.128, y: 0, z: 0.148 },
        wristR: { x: 0, y: 0, z: 0 },
        handR: { x: 0, y: 0, z: 0 },
        legL: { x: -1.492, y: 0, z: 0 },
        shinL: { x: 1.368, y: 0, z: 0 },
        legR: { x: -1.702, y: 0, z: 0 },
        shinR: { x: 1.688, y: 0, z: 0 },
      },
    },
    // ── 1.40s: Sipping — head tilts back to drink ──
    { time: 1.4,
      joints: {
        torso: { x: 0.06, y: 0, z: 0 },
        head: { x: 0.15, y: 0, z: 0 },
        hip: { x: 0, y: 0, z: 0 },
        armL: { x: -1.342, y: 0, z: -0.152 },
        foreL: { x: -1.192, y: 0, z: 0.998 },
        wristL: { x: 0, y: 0, z: 0 },
        handL: { x: 0, y: 0, z: 0 },
        armR: { x: -0.452, y: 0, z: 0.048 },
        foreR: { x: 0.128, y: 0, z: 0.148 },
        wristR: { x: 0, y: 0, z: 0 },
        handR: { x: 0, y: 0, z: 0 },
        legL: { x: -1.492, y: 0, z: 0 },
        shinL: { x: 1.368, y: 0, z: 0 },
        legR: { x: -1.702, y: 0, z: 0 },
        shinR: { x: 1.688, y: 0, z: 0 },
      },
    },
    // ── 1.90s: Head returns forward, mug still at mouth ──
    { time: 1.9,
      joints: {
        torso: { x: 0.06, y: 0, z: 0 },
        head: { x: -0.05, y: 0, z: 0 },
        hip: { x: 0, y: 0, z: 0 },
        armL: { x: -1.342, y: 0, z: -0.152 },
        foreL: { x: -1.192, y: 0, z: 0.998 },
        wristL: { x: 0, y: 0, z: 0 },
        handL: { x: 0, y: 0, z: 0 },
        armR: { x: -0.452, y: 0, z: 0.048 },
        foreR: { x: 0.128, y: 0, z: 0.148 },
        wristR: { x: 0, y: 0, z: 0 },
        handR: { x: 0, y: 0, z: 0 },
        legL: { x: -1.492, y: 0, z: 0 },
        shinL: { x: 1.368, y: 0, z: 0 },
        legR: { x: -1.702, y: 0, z: 0 },
        shinR: { x: 1.688, y: 0, z: 0 },
      },
    },
    // ── 3.00s: Back to rest — mug lowered to the table ──
    { time: 3.0,
      joints: {
        torso: { x: 0.06, y: 0, z: 0 },
        head: { x: -0.05, y: 0, z: 0 },
        hip: { x: 0, y: 0, z: 0 },
        armL: { x: -1.35, y: 0, z: 0 },
        foreL: { x: 0.15, y: 0, z: 0 },
        wristL: { x: 0, y: 0, z: 0 },
        handL: { x: 0, y: 0, z: 0 },
        armR: { x: -0.452, y: 0, z: 0.048 },
        foreR: { x: 0.128, y: 0, z: 0.148 },
        wristR: { x: 0, y: 0, z: 0 },
        handR: { x: 0, y: 0, z: 0 },
        legL: { x: -1.492, y: 0, z: 0 },
        shinL: { x: 1.368, y: 0, z: 0 },
        legR: { x: -1.702, y: 0, z: 0 },
        shinR: { x: 1.688, y: 0, z: 0 },
      },
    },
  ],
};
