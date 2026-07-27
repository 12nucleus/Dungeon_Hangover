// ─────────────────────────────────────────────────────────────
// CUTSCENES — a self-contained module that owns every in-game
// cinematic (intro, title card, boss reveal, …) so the rest of
// the engine doesn't have to bloat. New cutscenes are added by
// dropping another `playXxxCutscene(host)` async into this
// module; the engine routes skip/input and lifecycle through
// `CutsceneDirector`, nothing else changes.
//
// The engine exposes itself as a `CutsceneHost` — a SMALL, STABLE
// interface of every capability a cutscene actually needs (camera,
// audio, particles, visuals, build helpers, narration, fade). The
// concrete `GameEngine` implements it; cutscenes never reach across
// into engine internals, only the host surface.
//
// Authoring a new cutscene:
//   export async function playMyCutscene(host: CutsceneHost) { … }
// Then register it in the director and call
//   director.play('myCutscene');
// from the engine.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { GridPos, Unit, CombatEvent, GamePhase, LogKind } from './types';
import type { LevelStructures } from '../levels/levelTypes';
import type { Rig } from './characters';
import type { Combat } from './combat';
import type { AudioManager, SfxName } from './audio';
import type { ParticleSystem } from './particles';
import { FX } from './particles';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
}

// ─────────────────────────────────────────────────────────────
// DIRECTOR — the one object the engine creates & talks to.
// Routes skip input, tracks `active` cutscene id, and dispatches.
// ─────────────────────────────────────────────────────────────
export class CutsceneDirector {
  private host: CutsceneHost;
  /** currently-running cutscene id (null = none). */
  activeId: 'intro' | 'title' | 'boss' | null = null;

  constructor(host: CutsceneHost) { this.host = host; }

  /** engine should call when space/escape is pressed during a cutscene.
   *  Sets BOTH the public skip flag (so cutscene scripts' `if (h.introSkipped)`
   *  checks trip) AND the internal `cutsceneSkip` flag (so the engine's own
   *  cineDelay/narrate awaits resolve immediately). */
  requestSkip() {
    if (!this.activeId) return;
    this.host.introSkipped = true;
    this.host.markSkipped();
  }

  /** start a cutscene by id. returns once it has finished (skipped or natural). */
  async play(id: 'intro' | 'title' | 'boss'): Promise<void> {
    if (this.activeId) return;   // never overlap cutscenes
    this.activeId = id;
    this.host.introSkipped = false;
    this.host.resetSkipState();
    try {
      if (id === 'title') await playTitleSequence(this.host);
      else if (id === 'intro') await playIntroCutscene(this.host);
      else if (id === 'boss') await playBossCutscene(this.host);
    } finally {
      this.activeId = null;
    }
  }
}

// ═════════════════════════════════════════════════════════════
// 1. INTRO cutscene — "Dungeon Hangover"
// ═════════════════════════════════════════════════════════════
export async function playIntroCutscene(h: CutsceneHost) {
  const hero = h.combat.living('party')[0];
  if (!hero) return;
  const hv = h.visuals.get(hero.id);
  if (!hv) return;
  h.busy = true;
  h.introActive = true;
  h.introSkipped = false;

  // ── build the tavern flashback, drop the dungeon behind it ──
  h.inTavern = true;
  h.worldGroup.visible = false;
  h.propsGroup.visible = false;
  for (const [id, v] of h.visuals) {
    v.bar.style.display = 'none';
    if (id !== hero.id) v.rig.group.visible = false;
  }
  h.tavern = h.buildTavern();
  h.scene.add(h.tavern);
  h.scene.fog = new THREE.Fog(0x140d08, 6, 26);

  const poi = (h.tavern!.userData as { poi: Record<string, THREE.Vector3> }).poi;

  // -- seat Greg at his table: sitting, tankard in hand, facing into the room --
  // poi.gregSeat.y is 0.8 (a camera focus height), but the rig origin is at
  // the feet — drop him to the floor so he actually sits on the stool.
  const seat = poi.gregSeat.clone();
  seat.y = 0;
  hv.rig.group.position.copy(seat);
  hv.rig.group.rotation.y = Math.PI;
  hv.yaw = hv.targetYaw = Math.PI;
  hv.rig.anim.mode = 'sit'; hv.rig.anim.crouch = 0; hv.rig.anim.lunge = 0; hv.rig.anim.flinch = 0;
  hv.rig.group.scale.setScalar(1);

  // voxel tankard in Greg's left hand
  const mug = new THREE.Group();
  const mugBody = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.24, 0.20), new THREE.MeshLambertMaterial({ color: 0x8a5a2e }));
  const mugFoam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.22), new THREE.MeshLambertMaterial({ color: 0xf2ead2 }));
  mugFoam.position.y = 0.14; mug.add(mugBody, mugFoam);
  const hand = hv.rig.parts.handL ?? hv.rig.parts.armL;
  let mugHand: THREE.Object3D | null = null;
  if (hand) { mug.position.set(0, 0.18, 0.12); hand.add(mug); mugHand = hand; }
  if (mugHand) {
    // Keep the tankard level by counter-rotating it against the hand's world
    // pitch. Reading world orientation (via quaternion) is hierarchy-agnostic:
    // works for both the legacy flat rig and the unified hierarchical skeleton.
    const handObj = hand;
    const tmpQ = new THREE.Quaternion();
    const tmpE = new THREE.Euler();
    h.propAnims.push(() => {
      if (!h.tavern) return true;
      handObj.getWorldQuaternion(tmpQ);
      tmpE.setFromQuaternion(tmpQ, 'XYZ');
      mug.rotation.x = -tmpE.x;
      return false;
    });
  }
  h.setWeapon(hv.rig, null, hero.scheme.accent);

  // -- camera: kept inside the little set (box clamp) with slow cinematic easing --
  h.iso.lerp = 2.0;
  h.iso.box = { minX: -4.2, maxX: 4.2, minZ: -3.4, maxZ: 5.6, minY: 0.5, maxY: 3.2 };
  h.iso.desiredYaw = -Math.PI * 0.22; h.iso.desiredPitch = 0.44; h.iso.desiredDist = 5.4;
  h.iso.focus(poi.gregHead);
  h.fadeTo(0);
  h.audio.stopMusic(); h.audio.stopTavernMusic(); h.audio.playTavernMusic();
  await h.cineDelay(900);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 1: establishing - the warm, dingy room; Greg mid-bender ==
  await h.narrate('t_open', 'The Dirty Mug. Last call came and went two hours ago. Nobody has found the courage to tell Greg.', 5200);
  if (h.introSkipped) { finishIntro(h); return; }
  // Greg takes a long, theatrical sip: a single 3-second keyframed animation
  // (raise the mug → sip with head tilted back → lower it back to the table).
  // The clip drives the arm/head rotations; updateRig keeps the sitting hip-sink.
  hv.rig.anim.t = 0;
  hv.rig.anim.mode = 'drink_anim';
  await h.cineDelay(3000);
  hv.rig.anim.mode = 'sit';

  // == BEAT 2: Greg holds court ==
  h.iso.desiredYaw = Math.PI * 0.16; h.iso.desiredPitch = 0.36; h.iso.desiredDist = 3.6;
  h.iso.focus(poi.gregHead);
  await h.cineDelay(700);
  hv.rig.anim.lunge = 0.7;
  await h.narrate('greg_a', "Barkeep! Another! And one for me shadow - the big fella's had a hard night an' all!", 5000);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 3: slow pan across the unimpressed room ==
  h.iso.desiredYaw = -Math.PI * 0.4; h.iso.desiredPitch = 0.5; h.iso.desiredDist = 6.6;
  h.iso.focus(new THREE.Vector3(-1.0, 1.3, -1.4));
  await h.cineDelay(600);
  await h.narrate('narr_room', 'There is no shadow. There is only Greg, a table he has declared a sovereign kingdom, and a room full of people quietly praying he leaves first.', 7400);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 4: Greg picks a fight with the furniture ==
  h.iso.desiredYaw = Math.PI * 0.2; h.iso.desiredPitch = 0.34; h.iso.desiredDist = 4.2;
  h.iso.focus(poi.gregHead);
  await h.cineDelay(500);
  hv.rig.anim.lunge = 1;
  await h.narrate('greg_b', "I said the WHOLE table's mine, Norris! Every splinter of it! Come and take it, if yeh think yer hard enough!", 5600);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 5: the barmaid delivers yet another round ==
  const bar = h.tavernActors.barmaid;
  h.iso.desiredYaw = -0.6; h.iso.desiredDist = 4.8; h.iso.desiredPitch = 0.46;
  h.iso.focus(poi.barmaid.clone());
  if (bar) h.barmaidServe(bar);
  await h.narrate('narr_maid', 'The barmaid has poured this exact drink for this exact man forty-seven times. She stopped making eye contact somewhere around the thirtieth. It is safer that way.', 7600);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 6: the nervous wizard in the corner ==
  h.iso.desiredYaw = 0.5; h.iso.desiredDist = 5.0; h.iso.desiredPitch = 0.44;
  h.iso.focus(poi.wizard.clone());
  await h.cineDelay(500);
  await h.narrate('narr_wiz', 'Over in the corner, a very small wizard is doing a very large amount of nervous arithmetic. The kind you do right before you turn a problem into a farm animal.', 7400);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 7: the bouncer cracks his knuckles; Greg mounts the table ==
  const bc = h.tavernActors.bouncer;
  h.iso.desiredYaw = -0.2; h.iso.desiredDist = 5.2; h.iso.desiredPitch = 0.42;
  h.iso.focus(poi.bouncer.clone());
  if (bc) bc.anim.mode = 'crack';
  await h.narrate('narr_bounce', 'By the door, the bouncer cracks his knuckles - a retired warlord who took this job for the peace and quiet. Greg reads the room perfectly, and climbs onto the table.', 7400);
  if (bc) bc.anim.mode = 'idle';
  if (h.introSkipped) { finishIntro(h); return; }
  h.iso.desiredYaw = -Math.PI * 0.15; h.iso.desiredDist = 5.8; h.iso.desiredPitch = 0.4;
  h.iso.focus(poi.gregHead.clone().add(new THREE.Vector3(0, 0.7, 0)));
  hv.rig.anim.mode = 'idle'; hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 0;
  hv.rig.group.position.set(0, 0.99, 1.35);   // up on the tabletop (feet flush on the top)
  hv.rig.anim.lunge = 1;
  await h.cineDelay(900);

  // == CHAOS: a voxel stool flies, the wizard casts Polymorph, SHEEP ==
  const stool = new THREE.Group();
  const stoolWood = new THREE.MeshLambertMaterial({ color: 0x5a3e26 });
  const stoolWoodD = new THREE.MeshLambertMaterial({ color: 0x3a2818 });
  const stoolSeat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), stoolWood); stoolSeat.position.y = 0.2; stool.add(stoolSeat);
  for (const [lx, lz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), stoolWoodD); leg.position.set(lx, 0.08, lz); stool.add(leg);
  }
  stool.position.set(0, 0.55, 1.9); h.scene.add(stool);
  const stoolTarget = poi.wizard.clone().add(new THREE.Vector3(-0.2, 0.2, 0.3));
  h.animateTo(() => stool.position.x, (val) => { stool.position.x = val; }, stoolTarget.x, 0.5);
  h.animateTo(() => stool.position.y, (val) => { stool.position.y = val; }, stoolTarget.y, 0.5);
  h.animateTo(() => stool.position.z, (val) => { stool.position.z = val; }, stoolTarget.z, 0.5);
  const spinStart = performance.now();
  h.propAnims.push(() => { stool.rotation.x += 0.3; stool.rotation.z += 0.24; return performance.now() - spinStart > 520; });
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.15);
  await h.cineDelay(260);

  const wiz = h.tavernActors.wizard;
  const from = poi.wizard.clone().add(new THREE.Vector3(-0.2, 0.15, 0.4));
  const to2 = hv.rig.group.position.clone().add(new THREE.Vector3(0, 1.0, 0));
  h.iso.desiredYaw = 0.5; h.iso.desiredDist = 5.2; h.iso.focus(poi.wizard.clone());
  if (wiz) wiz.anim.lunge = -0.6;
  h.audio.play('magic_missile', 0.9);
  await h.cineDelay(160);
  if (wiz) wiz.anim.lunge = 1;
  h.launchMagicMissile(from, to2);
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.12);
  await h.cineDelay(220);
  h.iso.focus(hv.rig.group.position.clone().add(new THREE.Vector3(0, 0.8, 0))); h.iso.desiredDist = 5.6;
  await h.cineDelay(220);
  if (wiz) wiz.anim.lunge = 0;
  h.fx.explosion(h.particles, to2, 1.2);
  h.particles.burst({ pos: to2, count: 30, color: [0x8a4af0, 0xb06af0, 0xffffff, 0xdaa0ff], speed: [1, 4], life: [0.4, 0.9], size: [0.3, 0.8], gravity: -1.5, up: 2.5, endScale: 0.1 });
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.22);
  if (h.heroLight) h.heroLight.color.setHex(0x8a4af0);
  const sheep = h.buildSheep();
  sheep.position.copy(hv.rig.group.position); sheep.rotation.y = hv.rig.group.rotation.y;
  sheep.scale.setScalar(0.5);
  h.tavern!.add(sheep);
  hv.rig.group.visible = false;
  await h.narrate('narr_baa', "A stool takes flight. The wizard squeaks a word he'll regret. Purple light - and for four glorious seconds, Greg the Grim is the loudest sheep the Dirty Mug has ever heard.", 7400);
  hv.rig.group.visible = true;
  h.tavern!.remove(sheep);
  if (h.heroLight) h.heroLight.color.setHex(0xffb060);
  h.scene.remove(stool);
  stool.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  if (h.introSkipped) { finishIntro(h); return; }

  // -- Greg, human again and thoroughly rattled, drops back onto his stool --
  hv.rig.group.position.copy(seat);
  hv.rig.anim.mode = 'sit'; hv.rig.anim.crouch = 0.6; hv.rig.anim.flinch = 0.7;
  await h.cineDelay(600);

  // == FINALE: one last drink, then the long faint ==
  h.iso.desiredDist = 3.4; h.iso.desiredYaw = -Math.PI * 0.1; h.iso.desiredPitch = 0.34;
  h.iso.focus(poi.gregHead);
  hv.rig.anim.crouch = 0;
  hv.rig.anim.mode = 'drink'; await h.cineDelay(700); hv.rig.anim.mode = 'sit';
  hv.rig.anim.lunge = 0.7;
  h.audio.play('dice', 0.5);
  await h.cineDelay(600);
  hv.rig.anim.flinch = 1; h.iso.shake = Math.max(h.iso.shake ?? 0, 0.16);
  await h.narrate('narr_thud', 'The magic wears off. The ale, sadly, does not. Greg salutes a chair, mistakes the floor for the chair, and meets both at considerable speed.', 6800);
  if (h.introSkipped) { finishIntro(h); return; }
  h.passOut(1.6);
  h.audio.stopTavernMusic(); h.audio.playMusic('music_ambient');
  await h.cineDelay(1800);
  await h.narrate('narr_bridge', 'He drank the tavern dry, insulted a man with a sword, challenged a wizard to a fistfight, and spent four seconds as livestock. Then the floor rose up to introduce itself.', 6800);
  if (h.introSkipped) { finishIntro(h); return; }

  // ── wake at the bottom of the dungeon ──
  h.scene.remove(h.tavern); h.tavern = null; h.tavernRigs = []; h.tavernActors = {}; h.iso.box = null;
  h.worldGroup.visible = true;
  h.propsGroup.visible = true;
  h.scene.fog = new THREE.Fog(0x08080e, 4, 24);
  h.inTavern = false;
  for (const [id, v] of h.visuals) { if (id !== hero.id) v.rig.group.visible = true; }
  h.setWeapon(hv.rig, hero.weapon, hero.scheme.accent);

  const floorWp = h.unitWorld(h.combat.units[0].pos);
  hv.rig.group.position.copy(floorWp);
  hv.rig.group.rotation.set(0, Math.PI, 0);
  hv.yaw = hv.targetYaw = Math.PI;
  hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 1; hv.rig.anim.mode = 'floor';
  if (mugHand) mugHand.remove(mug);

  h.iso.desiredYaw = Math.PI * 0.25; h.iso.desiredPitch = 0.62; h.iso.desiredDist = 8;
  h.iso.focus(floorWp.clone().add(new THREE.Vector3(0, 1.2, 0)));
  h.canvas.style.filter = 'none';
  if (h.fadeEl) h.fadeEl.style.transition = '';
  h.fadeTo(0);
  await delay(700);
  await h.narrate('narr_wake', 'You wake at the bottom of a fifty floor dungeon. In your underwear. With a headache that could crush a small kingdom.', 6200);
  if (h.introSkipped) { finishIntro(h); return; }

  const starPos = floorWp.clone().add(new THREE.Vector3(0, 1.7, 0));
  h.spawnStars(starPos);
  await h.narrate('narr_premise', 'A bag of basic supplies sits by your head: a rusty dagger, a health potion, and a torch that probably won\'t last. The only way out is up.', 6600);
  if (h.introSkipped) { finishIntro(h); return; }

  hv.rig.group.rotation.x = -Math.PI / 2;
  hv.rig.anim.mode = 'getup';
  hv.rig.anim.crouch = 1.3;
  h.iso.desiredDist = 5.5; h.iso.focus(floorWp.clone().add(new THREE.Vector3(0, 1.4, 0)));
  h.animateTo(() => hv.rig.group.rotation.x, (val) => { hv.rig.group.rotation.x = val; }, 0, 0.7);
  await delay(700);
  h.animateTo(() => hv.rig.anim.crouch, (val) => { hv.rig.anim.crouch = val; }, 0, 0.8);
  for (let i = 0; i < 3; i++) { h.spawnStars(starPos); await delay(450); }
  await delay(700);
  hv.rig.anim.mode = 'idle'; hv.rig.anim.crouch = 0;
  await h.narrate('narr_small', 'Yes. Underwear. The dungeon, it seems, has a sense of humour. Try not to lose the potion before the first rat, hmm?', 6000);
  h.spawnStars(starPos);
  await delay(900);
  await h.narrate('narr_floor', 'Floor one of the Warren. The bonfire behind you is the last warm thing you\'ll see for a long, long time. Get up, Greg. We\'ve got fifty floors of regret to climb.', 6800);
  if (h.introSkipped) { finishIntro(h); return; }
  finishIntro(h);
}

/** finish the intro: hand control to the player, in the dungeon, torch lit. */
export function finishIntro(h: CutsceneHost) {
  h.introPlayed = true;
  h.introActive = false;
  h.introSkipped = false;
  h.inTavern = false;
  h.worldGroup.visible = true;
  h.propsGroup.visible = true;
  h.audio.stopTavernMusic(); h.audio.playMusic('music_ambient');
  const hero = h.combat.living('party')[0];
  for (const [id, v] of h.visuals) { if (!hero || id !== hero.id) v.rig.group.visible = true; }
  h.clearCine();
  h.canvas.style.filter = 'none';   // clear any lingering pass-out blur (skip safety)
  h.fadeTo(0);
  if (hero) {
    const hv = h.visuals.get(hero.id);
    if (hv) {
      hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 0; hv.rig.group.rotation.set(0, Math.PI, 0);
      hv.yaw = hv.targetYaw = Math.PI;
      if (hero.weapon) h.setWeapon(hv.rig, hero.weapon, hero.scheme.accent);
      if (!h.heroLight) h.attachHeroTorch(hv.rig);
    }
  }
  // reveal the bonfire checkpoint behind Greg as the respawn point + grace window
  h.setBonfireCheckpoint(h.structures?.checkpoint ?? { x: 5, z: 5 });
  h.armIntroGrace(2.5);
  h.iso.lerp = 7;
  h.busy = false;
  h.phase = 'explore';
  h.onIntroComplete();
  h.pushLog('Floor 1 — The Warlord\'s Warren. (B) jumps to the boss cutscene. Light the bonfire to set your respawn.', 'system');
  h.emitSnapshot();
}

// ═════════════════════════════════════════════════════════════
// 2. TITLE card sequence — exterior tavern establishing shot
// ═════════════════════════════════════════════════════════════
/**
 * Builds the tavern exterior as a static, animated splash backdrop.
 * No narration or music is started here — those require a user gesture
 * (the "Enter the Dungeon" click) and are handled by runTitleNarration,
 * so the cutscene continues seamlessly from this exact framing.
 * Returns the exterior group + the previous scene background so the caller
 * can later transition into the interior tavern cutscene.
 */
export function setupTitleScene(h: CutsceneHost): { ext: THREE.Group; prevBg: any } {
  h.busy = true;
  h.introActive = true;
  h.introSkipped = false;
  h.cinematic = true;
  h.emitSnapshot();

  h.worldGroup.visible = false;
  h.propsGroup.visible = false;
  for (const [, v] of h.visuals) v.rig.group.visible = false;

  const prevBg = h.scene.background as any;
  h.scene.background = new THREE.Color(0x070713);
  h.scene.fog = new THREE.Fog(0x070713, 14, 40);

  const ext = h.buildTavernExterior();
  h.scene.add(ext);

  const chimTop = ext.userData.chimneyTop as THREE.Vector3;
  h.titleIdle = true;
  let smokeT = 0, idleT = 0;
  h.propAnims.push((dt: number) => {
    if (!ext.parent) return true;
    // gentle idle orbit while the splash is up (stopped once the title
    // narration takes over the camera)
    if (h.titleIdle) {
      idleT += dt;
      h.iso.desiredYaw = 0.24 + Math.sin(idleT * 0.16) * 0.14;
    }
    smokeT += dt;
    if (smokeT > 0.10) {
      smokeT = 0;
      h.particles.burst({
        pos: chimTop.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25)),
        count: 2,
        color: [0x9aa0aa, 0x7a808a, 0xb0b6c0],
        speed: [0.4, 1.2], life: [2.2, 4.2], size: [0.32, 0.78],
        gravity: -0.5, up: 1.7, drag: 0.92, endScale: 0.04,
      });
    }
    return false;
  });

  h.iso.lerp = 2.0;
  h.iso.box = { minX: -16, maxX: 16, minZ: -16, maxZ: 16, minY: 0, maxY: 18 };
  h.iso.desiredYaw = 0.24; h.iso.desiredPitch = 0.42; h.iso.desiredDist = 11.5;
  h.iso.focus(new THREE.Vector3(0, 3.0, 0));

  // ensure the scene is fully revealed (not black) behind the splash overlay
  h.fadeTo(0);

  return { ext, prevBg };
}

/**
 * Runs the title-card narration + camera moves, then transitions into the
 * interior tavern cutscene. Designed to be called after setupTitleScene so
 * the front-of-tavern view the player has been looking at continues
 * seamlessly into the "inside the tavern" act.
 */
export async function runTitleNarration(h: CutsceneHost, ext: THREE.Group, prevBg: any) {
  h.titleIdle = false;
  // Only (re)start the tavern theme if the splash gesture hasn't already
  // kicked it off — avoids a jarring restart when the player enters.
  if (!h.audio.isTavernMusicPlaying()) {
    h.audio.stopMusic();
    h.audio.playTavernMusic({ muffled: true, volume: 0.10 });
    h.audio.setMusicDucked(true);
  }
  await h.cineDelay(500);
  if (h.introSkipped) { endTitleSequence(h, ext, prevBg); return; }

  await h.narrate('title_1', 'In a tavern far, far away…', 3400);
  if (h.introSkipped) { endTitleSequence(h, ext, prevBg); return; }

  const signWp = ext.userData.signBoardWp as THREE.Vector3;
  h.iso.desiredYaw = 0.10; h.iso.desiredPitch = 0.30; h.iso.desiredDist = 4.2;
  h.iso.focus(signWp.clone().add(new THREE.Vector3(0, 0.2, 0.4)));
  await h.cineDelay(900);
  await h.narrate('title_2', 'Actually, not that far. Just around the corner from the village...', 4000);
  if (h.introSkipped) { endTitleSequence(h, ext, prevBg); return; }

  h.fadeTo(1); await h.cineDelay(700);
  endTitleSequence(h, ext, prevBg);
}

/**
 * Full title sequence (setup + narration) — fallback entry point used when
 * the splash overlay is bypassed. The splash flow calls setupTitleScene then
 * runTitleNarration separately so the HTML title can fade out in between.
 */
export async function playTitleSequence(h: CutsceneHost) {
  const { ext, prevBg } = setupTitleScene(h);
  h.fadeTo(1); await h.cineDelay(500); h.fadeTo(0);
  await runTitleNarration(h, ext, prevBg);
}

export function endTitleSequence(h: CutsceneHost, ext: THREE.Group, prevBg: any) {
  h.clearCine();
  h.scene.remove(ext);
  h.scene.background = prevBg as any;
  h.audio.setTavernMuffled(false);
  h.audio.setMusicDucked(false);
  const hero = h.combat.living('party')[0];
  const hv = hero ? h.visuals.get(hero.id) : null;
  if (hv) hv.rig.group.visible = true;
  // chain into the interior act
  void playIntroCutscene(h);
}

// ═════════════════════════════════════════════════════════════
// 3. BOSS reveal — "the bathing tyrant"
// ═════════════════════════════════════════════════════════════
export async function playBossCutscene(h: CutsceneHost) {
  if (!h.structures) return;
  const st = h.structures;
  h.busy = true;
  h.bossCineActive = true;
  h.introSkipped = false;

  const boss = h.combat.units.find((u) => (u as any).bossGroup && (u as any).dropKey === 'golden') as Unit | undefined;
  const v = boss ? h.visuals.get(boss.id) : null;
  const bathWp = h.unitWorld(st.bossBath);
  const bathTop = bathWp.clone().add(new THREE.Vector3(0, 0.55, 0));
  const headWp = bathWp.clone().add(new THREE.Vector3(0, 1.25, 0));
  const westWp = h.unitWorld({ x: st.bossBath.x - 3, z: st.bossBath.z });
  const rackApproach: GridPos = { x: st.bossBath.x + 1, z: st.bossBath.z };
  const rackWp = h.unitWorld({ x: st.bossBath.x + 2, z: st.bossBath.z });

  const savedDist = h.iso.desiredDist, savedYaw = h.iso.desiredYaw, savedPitch = h.iso.desiredPitch;
  h.iso.lerp = 2.1;

  if (v && boss) {
    boss.pos = { ...st.bossBath };
    v.rig.group.position.copy(bathWp);
    v.rig.anim.mode = 'idle';
    v.rig.anim.crouch = 1.2;
    v.rig.anim.lunge = 0; v.rig.anim.flinch = 0;
    h.setWeapon(v.rig, null, boss.scheme.accent);
    if (h.rackClub) h.rackClub.visible = true;
    h.faceToward(v, westWp, true);
  }

  // ── BEAT 1: push-in + pan ──
  h.iso.focus(headWp);
  h.iso.desiredDist = 7.5; h.iso.desiredPitch = 0.62; h.iso.desiredYaw = -Math.PI * 0.28;
  h.showCine('The Warlord\'s Warren — the innermost chamber…');
  h.audio.splash();
  await h.cineDelay(2200);
  h.clearCine();
  h.iso.desiredPitch = 0.95; h.iso.desiredYaw = -Math.PI * 0.45; h.iso.desiredDist = 16;
  h.iso.focus(bathWp.clone().add(new THREE.Vector3(0, 1.5, 0)));
  await h.cineDelay(1500);
  h.iso.focus(bathWp.clone().add(new THREE.Vector3(5.5, 1.2, 0)));
  await h.cineDelay(1600);
  h.iso.focus(bathWp.clone().add(new THREE.Vector3(-5.0, 1.0, 2)));
  await h.cineDelay(1500);

  // ── BEAT 2: bath-time song ──
  h.iso.desiredDist = 6.5; h.iso.desiredPitch = 0.6; h.iso.desiredYaw = -Math.PI * 0.28;
  h.iso.focus(headWp);
  h.audio.sing();
  h.showCine('♪ Rub-a-dub-dub, a warlord in his tub… ♪');
  for (let i = 0; i < 6; i++) { if (v) v.rig.anim.lunge = 0.35; h.waterPlink(bathTop); await h.cineDelay(950); }
  h.audio.sing(0.8);
  h.showCine('♪ …scrubbin\' off the blood of the fools I clubbed~ ♪');
  for (let i = 0; i < 6; i++) { if (v) v.rig.anim.lunge = 0.35; h.waterPlink(bathTop); await h.cineDelay(950); }
  h.clearCine();

  // ── BEAT 3: silence ──
  h.iso.desiredDist = 5.0; h.iso.desiredPitch = 0.54; h.iso.focus(headWp);
  await h.cineDelay(1500);
  if (v) v.rig.anim.flinch = 0.6;
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.12);
  await h.cineDelay(900);

  // ── BEAT 4: bellow ──
  if (v) h.faceToward(v, westWp);
  h.audio.roar();
  if (v) v.rig.anim.flinch = 1;
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.34);
  h.showCine('"WHO DARES DISTURB MY ROYAL BATH?!"');
  await h.cineDelay(2600);
  h.audio.roar(0.85);
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.28);
  h.showCine('"MY ONE HOUR OF PEACE — RUINED!!"');
  await h.cineDelay(2400);
  h.clearCine();

  // ── BEAT 5: erupts from the water ──
  h.iso.desiredDist = 9.0; h.iso.desiredPitch = 0.82; h.iso.focus(bathTop);
  if (v) {
    h.animateTo(() => v.rig.anim.crouch, (val) => { v.rig.anim.crouch = val; }, 0, 0.9);
    const baseY = v.rig.group.userData.baseY as number;
    h.animateTo(() => v.rig.group.position.y, (val) => { v.rig.group.position.y = val; }, baseY + 0.8, 0.45);
    setTimeout(() => { if (v) h.animateTo(() => v.rig.group.position.y, (val) => { v.rig.group.position.y = val; }, baseY, 0.5); }, 460);
  }
  h.audio.splash();
  h.splashBurst(bathTop, 34);
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.32);
  await h.cineDelay(1300);

  // ── BEAT 6: wade to the rack ──
  if (v) {
    h.iso.focus(rackWp.clone().add(new THREE.Vector3(0, 0.9, 0)));
    await h.walkRigTo(v, rackApproach, 1.4);
    h.faceToward(v, rackWp, true);
    await h.cineDelay(450);
  }

  // ── BEAT 7: seize the club ──
  if (v && boss) {
    h.iso.desiredDist = 7.0; h.iso.desiredPitch = 0.62;
    v.rig.anim.lunge = 1;
    await h.cineDelay(360);
    if (h.rackClub) h.rackClub.visible = false;
    h.setWeapon(v.rig, 'club', boss.scheme.accent);
    h.audio.play('sword_hit', 0.6, 0.6);
    h.audio.bossSting();
    h.iso.shake = Math.max(h.iso.shake ?? 0, 0.3);
    h.fx.impactDust(h.particles, rackWp.clone().setY((v.rig.group.userData.baseY as number) + 0.9), [0x5a3a1e, 0x2a1f1a]);
    await h.cineDelay(900);
  }

  // ── BEAT 8: round on the party ──
  if (v) {
    h.iso.focus(bathTop); h.iso.desiredDist = 8.0; h.iso.desiredPitch = 0.7;
    await h.walkRigTo(v, st.bossBath, 1.1);
    h.faceToward(v, westWp, true);
    v.rig.anim.lunge = 1;
  }
  h.audio.roar();
  h.audio.bossSting();
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.45);
  if (boss) boss.pos = { ...st.bossBath };
  h.showCine('"NONE LEAVE MY WARREN ALIVE!"');
  await h.cineDelay(2400);
  h.clearCine();

  // ── hand the camera back to the player ──
  h.iso.desiredDist = savedDist; h.iso.desiredYaw = savedYaw; h.iso.desiredPitch = savedPitch;
  if (v) h.iso.focus(v.rig.group.position.clone());
  await h.cineDelay(700);
  h.iso.lerp = 7;

  // ── wake his honour-guard & begin the battle ──
  for (const u of h.combat.units) if ((u as any).bossGroup) (u as any).dormant = false;
  h.pushLog('👑 Warlord Gorruk heaves his greatclub from the rack — the fight begins!', 'system');
  h.bossCineActive = false;
  h.busy = false;
  h.enqueue(h.combat.start());
}
