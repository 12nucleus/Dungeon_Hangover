import type { CharacterScheme, WeaponKind } from '@/game/types';

export const JOINT_NAMES = [
  'torso', 'head', 'hip',
  'armL', 'foreL', 'wristL', 'handL',
  'armR', 'foreR', 'wristR', 'handR',
  'legL', 'shinL', 'legR', 'shinR',
] as const;

export type JointName = typeof JOINT_NAMES[number];

export const JOINT_GROUPS: { label: string; joints: JointName[] }[] = [
  { label: 'Body', joints: ['torso', 'head'] },
  { label: 'Hip', joints: ['hip'] },
  { label: 'Left arm', joints: ['armL', 'foreL', 'wristL', 'handL'] },
  { label: 'Right arm', joints: ['armR', 'foreR', 'wristR', 'handR'] },
  { label: 'Left leg', joints: ['legL', 'shinL'] },
  { label: 'Right leg', joints: ['legR', 'shinR'] },
];

export interface JointEuler { x: number; y: number; z: number; }

export type JointSnapshot = Record<JointName, JointEuler>;

export interface AnimKeyframe {
  time: number;
  joints: JointSnapshot;
}

export interface AnimClip {
  name: string;
  duration: number;
  loop: boolean;
  keyframes: AnimKeyframe[];
}

export interface AnimProject {
  name: string;
  clips: AnimClip[];
  modelType: ModelPreset['id'];
  modelConfig: CharacterScheme;
  weapon: WeaponKind | null;
}

export interface ModelPreset {
  id: string;
  label: string;
  scheme: CharacterScheme;
  weapon: WeaponKind | null;
}