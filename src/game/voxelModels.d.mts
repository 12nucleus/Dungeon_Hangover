// Type declarations for the shared voxel-model library (voxelModels.mjs).
export interface Voxel { x: number; y: number; z: number; c: number; }

export interface Glow {
  color: number; intensity: number; dist: number; decay: number;
  y: number; flicker?: number;
}
export interface Particles {
  type: 'flame' | 'smoke' | 'sparkle' | 'spore';
  color: number; y: number; spread: number; rate: number; count: number;
}
export interface PropModel {
  name: string;
  voxels: Voxel[];
  cube: number;
  blocks?: boolean;
  hang?: boolean;
  bonfire?: boolean;
  glow?: Glow;
  particles?: Particles;
  flame?: { y: number; big?: boolean };
  anim?: 'pulse' | 'flicker' | 'sway' | 'float';
}

export function rng(seed: number): () => number;
export function shade(hex: number, f: number): number;
export function mix(a: number, b: number, t: number): number;

export class Vox {
  m: Map<string, number>;
  add(x: number, y: number, z: number, c: number): this;
  addM(x: number, y: number, z: number, c: number): this;
  has(x: number, y: number, z: number): boolean;
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number): this;
  col(cx: number, cz: number, y0: number, y1: number, rx: number, rz: number, c: number): this;
  ring(cx: number, cz: number, y0: number, y1: number, rx: number, rz: number, c: number, thick?: number): this;
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number, inner?: number): this;
  spike(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, c: number, leanX?: number, leanZ?: number, colorFn?: ((y: number, t: number) => number) | null): this;
  list(): Voxel[];
  readonly size: number;
}

export function propStalagmite(seed?: number): PropModel;
export function propStalactite(seed?: number): PropModel;
export function propCrystal(seed?: number): PropModel;
export function propCrystalBlue(seed?: number): PropModel;
export function propCrystalGreen(seed?: number): PropModel;
export function propBoulder(seed?: number): PropModel;
export function propBones(seed?: number): PropModel;
export function propTorch(seed?: number): PropModel;
export function propBrazier(seed?: number): PropModel;
export function propMushroom(seed?: number): PropModel;
export function propBonfire(seed?: number): PropModel;
export function propWebPile(seed?: number): PropModel;
export function propRubble(seed?: number): PropModel;
export function propPuddle(seed?: number): PropModel;
export function propBucket(seed?: number): PropModel;
export function propScratches(seed?: number): PropModel;

export const PROP_BUILDERS: Record<string, (seed?: number) => PropModel>;

export interface DestructibleModel {
  name: string;
  voxels: Voxel[];
  cube: number;
  palette: number[];
}
export function destrCrate(seed?: number): DestructibleModel;
export function destrBarrel(seed?: number): DestructibleModel;
export function destrVase(seed?: number): DestructibleModel;
export function destrChest(seed?: number): DestructibleModel;
export function destrSack(seed?: number): DestructibleModel;
export function destrUrn(seed?: number): DestructibleModel;
export const DESTRUCTIBLE_BUILDERS: Record<string, (seed?: number) => DestructibleModel>;

export interface OrcScheme {
  skin: number; cloth: number; accent: number; hair: number;
  hood?: boolean; orc?: boolean; bulk?: number;
}
export interface OrcPart { pivot: [number, number, number]; voxels: Voxel[]; }
export interface OrcModel {
  cube: number;
  parts: Record<string, OrcPart>;
  eyes: { color: number; positions: [number, number, number][] };
  weapon: string;
}
export function orcModel(scheme: OrcScheme, weapon: string): OrcModel;
export function weaponVoxels(kind: string, accent: number): { voxels: Voxel[]; pivot: [number, number, number] };

