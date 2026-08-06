// Level definition � a self-contained data pack describing
// terrain materials, prop placement, lighting, spawn positions
// and the monster roster for one dungeon level.
import type { GridPos, Unit } from '../game/types';
import type { Interactable } from '../game/engine/interactables';

export type PropKind = 'stalagmite' | 'stalactite' | 'crystal' | 'crystal_blue' | 'crystal_green' | 'boulder' | 'bones' | 'torch' | 'brazier' | 'mushroom' | 'bonfire' | 'webpile' | 'rubble' | 'tent' | 'campfire' | 'bedroll' | 'crate'
  | 'puddle' | 'bucket' | 'scratches' | 'skeleton' | 'body' | 'mat' | 'wine_press' | 'wine_bottle' | 'broken_bottle'
  | 'valve' | 'pipe' | 'sign' | 'bunk' | 'footlocker' | 'dice_table' | 'nest' | 'drain' | 'wrench' | 'plunger'
  | 'pipe_fitting' | 'toolbox' | 'chest' | 'mirror' | 'compass' | 'fountain' | 'well' | 'cauldron' | 'weapon_rack'
  | 'altar' | 'throne' | 'banner' | 'duck' | 'towel';

export interface PropPlacement {
  kind: PropKind;
  x: number;
  z: number;
  seed?: number;
}

export interface Rect { x0: number; z0: number; x1: number; z1: number; }

/** Runtime-generated maze walkability grid (WORLD_SIZE × WORLD_SIZE). */
export interface LevelLayout {
  walk: boolean[][];
  heights?: number[][];
  floorMats?: string[][];
  wallMats?: string[][];
  wallH?: number[][];
  /** river tiles — translucent water sheets + waterfall cascades render on these */
  water?: boolean[][];
}

/** Named interactive structures the engine wires up (doors, chests, cutscene). */


export interface LevelStructures {
  partySpawn: GridPos;
  checkpoint?: GridPos;     // starter-room bonfire — light it to set the respawn point
  /** every bonfire on the floor, checkpoint first — kindling moves the active checkpoint */
  bonfires?: GridPos[];
  bossDoor: GridPos;        // locked door tile (blocked until the iron key opens it)
  bossBath: GridPos;        // boss starts here, sitting in its bath
  bossRoom: Rect;           // entering this rect triggers the boss cutscene
  goldenChest: GridPos;     // locked chest — opened by the golden key the boss drops
  secretLever: GridPos;     // pull (when adjacent) to collapse the rubble wall
  secretRubble: GridPos[];  // tiles blocked by rubble until the lever is pulled
  secretChest: GridPos;     // free bonus chest inside the secret room
  hermitChamber?: GridPos;
  hiddenTreasures?: GridPos[];
  mezzanines?: Rect[];
  stairs?: { a: GridPos; b: GridPos }[];
  collapsedDeadEnds?: GridPos[];

  // ── floor 50 — authored sewer cellar ──
  /** hand-authored doors: tiles blocked until `openedByFlag` is set */
  doors?: { id: string; pos: GridPos; axis: 'x' | 'z'; openedByFlag: string }[];
  /** hand-authored blockers: rubble/secret-door tiles cleared by a flag */
  blockers?: { id: string; tiles: GridPos[]; kind: 'rubble' | 'secretDoor'; openedByFlag: string }[];
  /** boss-rat arena (room 5) — entering it triggers the boss-rat cutscene */
  arenaRect?: Rect;
  /** staircase to floor 49, behind Gribnab's bath — departure interactable */
  exitStairs?: GridPos;
  /** all authored rooms (id → rect), for entry narration + minimap markers */
  rooms?: { id: string; name: string; rect: Rect }[];
  /** hand-authored NPCs to spawn (id → tile) */
  npcs?: { npcId: string; pos: GridPos }[];
  /** boss-door override: open on this flag instead of the iron-key check */
  bossDoorOpenFlag?: string;
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
  /** optional maze walkability + interactive structures (dungeon levels) */
  layout?: LevelLayout;
  structures?: LevelStructures;
  /** fresh roster factory (preferred over `roster` so the level can restart);
   *  receives the run seed for per-run spawn jitter */
  makeRoster?: (seed?: number) => Unit[];

  // ── floor 50 — per-level content placements ──
  /** trap placements; a function is evaluated per-run with the run seed */
  traps?: { defId: string; x: number; z: number }[] | ((seed: number) => { defId: string; x: number; z: number }[]);
  /** destructible prop placements (added on top of any generic SPOTS) */
  destructibles?: { defId: string; x: number; z: number }[];
  /** interactable definitions; function evaluated per-run with the run seed */
  makeInteractables?: (seed: number) => Interactable[];
  /** room lookup: which authored room contains a tile (map coordinates) */
  roomOf?: (x: number, z: number) => string | null;
  /** per-room first-entry narration (bible verbatim) */
  roomNarration?: Record<string, string>;
  /** environmental hazard tiles (shove targets: wine press, bath tub) */
  hazards?: { tile: GridPos; kind: string }[];
  /** per-run hidden-treasure tiles */
  makeHiddenTreasures?: (seed: number) => GridPos[];
}
