// Level definition — a self-contained data pack describing
// terrain materials, prop placement, lighting, spawn positions
// and the monster roster for one dungeon level.
import type { GridPos, Unit } from '../game/types';

export type PropKind = 'stalagmite' | 'stalactite' | 'crystal' | 'boulder' | 'bones' | 'torch';

export interface PropPlacement {
  kind: PropKind;
  x: number;
  z: number;
  seed?: number;
}

export interface LevelDef {
  name: string;
  icon: string;
  description: string;
  /** top-face material names per height tier (index 0..3) */
  groundMats: string[];
  /** side-face material names */
  fillMats: string[];
  /** arena bounds in tile coords (walkable area) */
  arena: { x0: number; z0: number; x1: number; z1: number };
  /** party spawn + enemy spawn positions */
  spawn: { party: GridPos[]; enemies: GridPos[] };
  /** props to place */
  props: PropPlacement[];
  /** lighting overrides */
  ambient: number;
  sun: number;
  fill: number;
  fogColor: number;
  fogDensity: number;
  /** water appearance */
  waterColor: number;
  waterY: number;
  /** the full roster for this level */
  roster: Unit[];
}
