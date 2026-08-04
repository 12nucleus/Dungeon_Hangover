// ─────────────────────────────────────────────────────────────
// cutscenes/types — shared types for the cutscene system
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { GridPos, CombatEvent, GamePhase, LogKind } from '../types';
import type { LevelStructures } from '../../levels/levelTypes';
import type { Rig } from '../characters';
import type { Combat } from '../combat';
import type { AudioManager, SfxName } from '../audio';
import type { ParticleSystem } from '../particles';
import { FX } from '../particles';

/**
 * Structural subset of the engine's `UnitVisual` — the cutscene layer
 * only touches `rig`/`yaw`/`targetYaw`/`bar.style.display`, so we keep
 * the engine's own interface hidden and only model what we read/write.
 * The engine's full `UnitVisual` structurally satisfies this shape.
 */
export interface UnitVisual {
  rig: Rig;
  yaw: number;
  targetYaw: number;
  bar: { style: { display: string } };
}

/**
 * The narrow, stable API every cutscene is allowed to touch.
 * `GameEngine` implements this interface (privately — it only
 * exposes the host to the director).
 *
 * The `iso` camera is intentionally typed `any` here because
 * `IsoCamera` lives inside engine.ts and shouldn't be promoted to
 * a public type just for the cutscene layer. Cutscenes only ever
 * read/write a handful of well-known fields (`focus`, `desiredYaw`,
 * `desiredPitch`, `desiredDist`, `lerp`, `shake`, `box`).
 */
export interface CutsceneHost {
  // ── read-only references ───
  readonly scene: THREE.Scene;
  readonly iso: any;
  readonly combat: Combat;
  readonly audio: AudioManager;
  readonly particles: ParticleSystem;
  readonly fx: typeof FX;
  readonly structures: LevelStructures | null;
  readonly visuals: Map<string, UnitVisual>;
  /** per-frame callback list — push a closure to animate per-frame (truthy return = remove) */
  readonly propAnims: ((dt: number) => boolean)[];
  /** props root group (world detail meshes) */
  readonly propsGroup: THREE.Group;
  /** world root group (terrain) */
  readonly worldGroup: THREE.Group;
  /** dungeon dressing group (bath, weapon rack, door, chests, lever, rubble) */
  readonly dressingGroup: THREE.Group | null;
  /** trap-marker group (hidden with the dressing on menu/tavern-exterior views) */
  readonly trapGroup: THREE.Group | null;
  /** hand-authored dungeon NPC rigs (hermit, Scrag…) — hide with the dressing */
  readonly npcRigs: { rig: Rig | null }[];
  /** the underlying WebGL renderer's canvas element */
  readonly canvas: HTMLCanvasElement;
  readonly fadeEl: HTMLElement | null;
  readonly heroLight: THREE.PointLight | null;
  /** the engine's currently-built tavern interior + exterior groups */
  tavern: THREE.Group | null;
  tavernRigs: Rig[];
  tavernActors: Record<string, any>;
  /** VOX-keyed meshes the boss cutscene reaches into */
  rackClub: THREE.Object3D | null;
  weaponRack: THREE.Object3D | null;

  // ── state (mutable) ──
  bigMessage: string | null;
  cinematic: boolean;
  /** true while ANY cutscene is running — engine suppresses input/aggro */
  busy: boolean;
  phase: GamePhase;
  introActive: boolean;
  bossCineActive: boolean;
  introPlayed: boolean;
  introSkipped: boolean;
  inTavern: boolean;
  /** true while the splash backdrop is idling (slow camera orbit) — flipped
   *  off by runTitleNarration so the title camera moves take over cleanly */
  titleIdle: boolean;

  // ── audio utilities (bound, with the engine's options baked in) ──
  setMusicDucked: (b: boolean) => void;
  setTavernMuffled: (b: boolean) => void;
  stopTavernMusic: () => void;
  stopMusic: () => void;
  playMusic: (track: string) => void;
  playTavernMusic: (opts?: { muffled?: boolean; volume?: number }) => void;
  play: (sfx: SfxName, volume?: number, pitch?: number) => void;
  splash: () => void;
  roar: (volume?: number) => void;
  sing: (volume?: number) => void;
  bossSting: () => void;

  // ── narration + timing ──
  /** skip-aware wait: resolves now if the skip flag is set, else after `ms` ms */
  cineDelay: (ms: number) => Promise<void>;
  /** narrated subtitle + voice (falls back to text-only if asset missing). */
  narrate: (id: string, text: string, minMs?: number) => Promise<void>;
  /** speak an NPC line's voice-over (audio/npc/<npcId>_<nodeId>.mp3) */
  speakDialogue: (npcId: string, nodeId: string) => void;
  /** show a small subtitle styled for cutscenes */
  showCine: (text: string) => void;
  /** dismiss the cutscene subtitle */
  clearCine: () => void;
  /** the engine sets true from the skip key handler — also flips the
   *  internal `cutsceneSkip` flag so cineDelay/narrate resolves immediately */
  markSkipped: () => void;
  /** clear all skip flags at the start of a new cutscene */
  resetSkipState: () => void;
  /** skip-aware fade. v=0 fully visible, v=1 fully black */
  fadeTo: (v: number) => void;

  // ── math + transforms ──
  unitWorld: (pos: GridPos) => THREE.Vector3;
  /** tween a numeric getter/setter */
  animateTo: (get: () => number, set: (v: number) => void, target: number, dur: number) => void;
  /** slowly turn a rig's yaw toward a world point */
  faceToward: (v: UnitVisual, target: THREE.Vector3, snap?: boolean) => void;
  /** walk a rig toward `tile`'s world position over `dur` s */
  walkRigTo: (v: UnitVisual, tile: GridPos, dur: number) => Promise<void>;
  /** swap (or remove via null) the weapon held in a rig's hand */
  setWeapon: (rig: Rig, kind: string | null, accent: number) => void;

  // ── fx ──
  spawnStars: (p: THREE.Vector3) => void;
  splashBurst: (p: THREE.Vector3, count?: number) => void;
  waterPlink: (p: THREE.Vector3) => void;
  launchMagicMissile: (from: THREE.Vector3, to: THREE.Vector3) => void;
  /** tinted full-screen blur as Greg passes out */
  passOut: (dur: number) => void;

  // ── attachables / build helpers ──
  attachHeroTorch: (rig: Rig) => void;
  buildSheep: () => THREE.Group;
  buildTavern: () => THREE.Group;
  buildTavernExterior: () => THREE.Group;
  /** barmaid delivers a drink across the tavern */
  barmaidServe: (barmaid: any) => void;

  // ── log / UI / queue ──
  pushLog: (text: string, kind?: LogKind) => void;
  emitSnapshot: () => void;
  /** enqueue a sequence of combat events onto the engine's animation queue */
  enqueue: (events: CombatEvent[]) => void;

  // ── engine lifecycle hooks ──
  /** expose the bonfire checkpoint behind Greg as the respawn point */
  setBonfireCheckpoint: (pos: GridPos) => void;
  /** signal "intro grace window" — engine suppresses proximity aggro for `secs` */
  armIntroGrace: (secs: number) => void;
  /** called once the intro cutscene fully completes (engine drops an initial autosave) */
  onIntroComplete: () => void;

  // ── character creation (the dungeon wake) ──
  /**
   * Flip the engine into `phase='creation'` so the React overlay can run the
   * stat/class/skill builder. Resolves once the player confirms (engine calls
   * `resolveCreation`). Intro stays busy/cinematic until it resolves.
   */
  requestCreation: () => Promise<void>;
  /** the engine calls this from confirmCharacterCreation() to release the intro */
  resolveCreation: () => void;
}
