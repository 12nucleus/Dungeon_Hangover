/**
 * Game Animation Presets — extracted from characters.ts updateRig().
 *
 * Each preset is a single-keyframe clip representing the static pose
 * the game uses for that mode. Load these into the editor to inspect
 * or use them as a starting point for new animations.
 *
 * To use in the editor: click "Import Presets" in the toolbar.
 *
 * Walk is excluded — it's a procedural sinusoidal oscillation, not a
 * static pose. To create a walk cycle, build a multi-keyframe clip
 * with alternating leg swing + arm swing.
 */

import type { AnimClip, JointSnapshot } from './animationTypes';
import { blankPose, clonePose } from './animationUtils';

function pose(...overrides: [string, number, number, number][]): JointSnapshot {
  const p = blankPose();
  for (const [name, x, y, z] of overrides) {
    const key = name as keyof JointSnapshot;
    p[key] = { x, y, z };
  }
  return p;
}

function clip(name: string, duration: number, loop: boolean, overrides: [string, number, number, number][]): AnimClip {
  return {
    name,
    duration,
    loop,
    keyframes: [{ time: 0, joints: clonePose(pose(...overrides)) }],
  };
}

export const GAME_PRESETS: AnimClip[] = [
  clip('idle', 2, true, [
    ['armL', -0.175, 0, 0],
    ['armR', -0.175, 0, 0],
  ]),
  clip('sit', 1, false, [
    ['torso', 0.06, 0, 0],
    ['head', -0.05, 0, 0],
    ['armL', -1.35, 0, 0],
    ['armR', -0.452, 0, 0.048],
    ['foreL', 0.15, 0, 0],
    ['foreR', 0.128, 0, 0.148],
    ['legL', -1.492, 0, 0],
    ['legR', -1.702, 0, 0],
    ['shinL', 1.368, 0, 0],
    ['shinR', 1.688, 0, 0],
  ]),
  clip('drink', 1, false, [
    ['torso', 0.06, 0, 0],
    ['head', -0.05, 0, 0],
    ['armL', -1.342, 0, -0.152],
    ['armR', -0.452, 0, 0.048],
    ['foreL', -1.192, 0, 0.998],
    ['foreR', 0.128, 0, 0.148],
    ['legL', -1.492, 0, 0],
    ['legR', -1.702, 0, 0],
    ['shinL', 1.368, 0, 0],
    ['shinR', 1.688, 0, 0],
  ]),
  clip('crack', 1, false, [
    ['torso', 0.06, 0, 0],
    ['head', -0.05, 0, 0],
    ['armL', -0.732, 0, -0.192],
    ['armR', -1.272, 0, -0.212],
    ['foreL', -1.3, 0, 0],
    ['foreR', -1.3, 0, 0],
  ]),
  clip('cross', 1, false, [
    ['torso', -0.006, 0, 0],
    ['head', -0.02, 0, 0],
    ['armL', -1.032, 0, 0.128],
    ['armR', -1.192, 0, 0.088],
    ['foreL', -0.972, 0, 1.128],
    ['foreR', -1.162, 0, -1.682],
    ['wristL', -0.412, 0, 0],
    ['wristR', 0.198, 0, 0],
  ]),
  clip('sit_cross', 1, false, [
    ['armL', -0.282, 0, -0.152],
    ['armR', -0.692, 0, 0.148],
    ['foreL', 0.608, 0, 1.468],
    ['foreR', -0.082, 0, -1.232],
    ['legL', -1.532, 0, 0],
    ['legR', -1.442, 0, 0],
    ['shinL', 1.258, 0, 0],
    ['shinR', 0.648, 0, 0],
  ]),
  clip('sleep', 1, false, [
    ['torso', -1.602, 0, 0],
    ['head', 0.048, 0, 0],
    ['armL', -0.172, 0, -0.042],
    ['armR', 3.028, 0, -0.102],
    ['foreL', -0.242, 0, 0.328],
    ['foreR', 0.428, 0, -0.452],
    ['legL', -1.582, 0, 0],
    ['legR', -1.472, 0, 0],
    ['shinL', 0.278, 0, 0],
    ['shinR', 0.128, 0, 0],
  ]),
  clip('point', 1, false, [
    ['armR', -1.422, 0, -0.212],
    ['foreL', -0.732, 0, -0.062],
  ]),
];