import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VoxelWorld, WORLD_SIZE } from './world';
import { FLOORS, START_FLOOR, levelForFloor } from '../levels';
import { registerInteractables as registerInteractablesModule, updateInteractables as updateInteractablesModule, triggerActiveInteractable as triggerActiveInteractableModule, type Interactable } from './engine/interactables';
import { setCursedLoot } from './items';
import { ParticleSystem, FX } from './particles';
import { updateRig, setWeapon, equip, unequip, itemToEquipVisual, type Rig } from './characters';
import { Combat } from './combat';
import { SKILLS, CONDITIONS, createRoster } from './skills';
import { ALL_CLASS_SKILLS, classPoolSkillIdsForLevel, classPoolSkillIds } from './classSkills';
import { AudioManager } from './audio';
import { DestructibleManager, type Destructible } from './destructibles';
import { makeItem, type Item } from './items';
import type { LevelDef, LevelStructures } from '../levels/levelTypes';
import { effMaxHp } from './stats';
import { rollD20, abilityMod, fmtMod } from './dice';
import { SaveManager, SettingsManager, type GameSettings, type SaveData, type SaveSlotMeta, SAVE_VERSION_NUMBER } from './save';
import { canUnlock, treeFor } from './skilltree';
import { TrapManager } from './traps';
import type { CharacterBuild, CombatEvent, GamePhase, GridPos, LogEntry, SkillDef, UISnapshot, Unit, EquipSlot, Ability } from './types';
import { type NPCDef, type DialogueAction } from './npc';
import { QuestLog, QUESTS } from './quest';
import { CutsceneDirector, setupTitleScene, runTitleNarration, type CutsceneHost } from './cutscenes/index';

import { IsoCamera } from './engine/IsoCamera';
import { addUnit, updateDroppedWeapons } from './engine/visuals';
import { buildTavernExterior } from './engine/tavernExterior';
import { buildTavern } from './engine/tavern';
import { buildSheep } from './engine/sheep';
import { setupDungeon, attachHeroTorch, updateDungeon, aggroGroup, inEnemyCone, grantKey as grantKeyModule, winGame as winGameModule, grantLoot as grantLootModule } from './engine/dungeonSetup';
import { smashProp, checkCombatTrigger, enqueue, setAnimScale, triggerTrap as triggerTrapModule } from './engine/combatAnimation';
import { updateFog, updateExploredVisibility, executeDialogueAction as executeDialogueActionModule, dialogueChoice as dialogueChoiceModule, pickTile as pickTileModule, updateHover as updateHoverModule, clickExplore as clickExploreModule, clickCombat as clickCombatModule, moveUnitAlong as moveUnitAlongModule, talkToNpc as talkToNpcModule, hidePathPreview, type InteractPick } from './engine/interaction';
import { spawnBonfireFlame as spawnBonfireFlameModule } from './engine/gameFlow';
import { respawn as respawnModule } from './engine/camping';
import { offerLoot, flushLootQueue, takeAllLoot, takeLootItem, leaveLootItem, dismissLoot, clearLoot } from './engine/loot';
import { showTargeting as showTargetingModule, showMoveTiles as showMoveTilesModule } from './engine/targeting';
import { bindInput as bindInputModule, onPointerMove as onPointerMoveModule, onPointerDown as onPointerDownModule, onKeyDown as onKeyDownModule, onResize as onResizeModule } from './engine/input';
interface Floater { el: HTMLDivElement; wp: THREE.Vector3; t: number; }
interface Walker { path: THREE.Vector3[]; tiles: GridPos[]; idx: number; }

// a weapon that has detached from a dying rig and is tumbling to the floor
interface DroppedWeapon {
  obj: THREE.Object3D;
  vx: number; vy: number; vz: number;
  spin: THREE.Vector3;
  restY: number;
  settled: boolean;
}

export interface UnitVisual {
  rig: Rig;
  proxy: THREE.Mesh;
  bar: HTMLDivElement;
  barFill: HTMLElement;
  walker: Walker | null;
  yaw: number;
  targetYaw: number;
  dustDone?: boolean;   // corpse-impact dust already spawned
}

export class GameEngine {
  public renderer!: THREE.WebGLRenderer;
  public composer!: EffectComposer;
  public scene = new THREE.Scene();
  public iso!: IsoCamera;
  public world!: VoxelWorld;
  public props!: DestructibleManager;
  public particles = new ParticleSystem();
  public combat!: Combat;
  readonly audio = new AudioManager();

  public visuals = new Map<string, UnitVisual>();
  public droppedWeapons: DroppedWeapon[] = [];
  public pickables: THREE.Object3D[] = [];
  public unitProxies: THREE.Object3D[] = [];
  public ray = new THREE.Raycaster();
  public pointer = new THREE.Vector2();

  public hlPool: { mesh: THREE.Mesh; cat: string }[] = [];
  public hlGroup = new THREE.Group();
  public hlMats: Record<string, THREE.MeshBasicMaterial> = {};
  public ring!: THREE.Mesh;
  public clickPing!: THREE.Mesh;
  public clickPingT = 1;

  // ── explore hover path preview (see interaction.ts) ──
  public pathPreviewGroup: THREE.Group | null = null;
  public pathDots: THREE.Mesh[] = [];
  public pathDestRing: THREE.Mesh | null = null;
  /** tile key the current hover preview was computed for ('' = none) */
  public hoverPathKey = '';
  /** queued once the leader finishes walking: kindle/rest at the bonfire */
  public pendingBonfire: 'light' | 'rest' | null = null;
  /** queued once the leader finishes walking: talk to this npc */
  public pendingTalk: string | null = null;

  public phase: GamePhase = 'menu';
  public selectedId: string | null = null;   // explore-mode leader
  public targeting: string | null = null;    // skill id being aimed
  public moveTiles = new Map<string, GridPos[]>(); // reachable cache for active unit
  public queue: CombatEvent[] = [];
  public eventQueue: CombatEvent[] = [];   // drained by combatAnimation.pump()
  public busy = false;
  public floaters: Floater[] = [];
  public log: LogEntry[] = [];
  public logSeq = 0;
  public loot: string[] = [];            // victory-screen recap lines
  public inventory: Item[] = [];
  public gold = 0;
  public showInventory = false;
  public showSkillTree = false;
  public showStats = false;
  public showQuestLog = false;
  public questLog = new QuestLog();

  // ── floor 50 — run state ──
  /** current floor number (registry key) */
  public floorNumber = START_FLOOR;
  /** per-run seed — drives trap tiles, poison bottles, spawn jitter, … */
  public runSeed = Math.floor(Date.now() / 1000) ^ 0x5eed;
  /** string flags: quest progress, doors opened, one-shot interactables */
  public flags = new Set<string>();
  /** torch fuel in seconds (bonfire refills to 100; 0 → torch off) */
  public torchFuel = 100;
  /** hand-authored interactables (proximity prompts) */
  public interactables: Interactable[] = [];
  public activeInteractable: Interactable | null = null;
  /** environmental hazard tiles (shove targets): key = wine_press | bath */
  public hazardTiles = new Set<string>();
  public hazardKind = new Map<string, string>();
  public hazardUsed = new Set<string>();
  /** spawned NPCs (id → tile + rig + proxy) */
  public npcs: { npcId: string; pos: GridPos; rig: Rig | null; proxy: THREE.Object3D | null }[] = [];
  /** run recap for the victory screen */
  public runStats = { kills: 0, deaths: 0, questsDone: 0, secretsFound: 0, startedAt: Date.now() };
  public showDialogue: { npcId: string; npcName: string; text: string; caption?: string; choices?: { label: string; index: number }[] } | null = null;
  /** current dialogue tree node (persists across clicks; null = fresh) */
  public dialogueNodeId: string | null = null;

  // ── dice-roll visual (BG3-style) ──────────────────────
  /** last visual dice roll (HUD animates a 3D die for ~2s) */
  public diceShow: { die: string; total: number; reason: string; at: number } | null = null;
  private diceTimer: ReturnType<typeof setTimeout> | null = null;

  /** show a rolling-die overlay for a check (perception, gamble, luck…) */
  public showDiceRoll(die: string, total: number, reason: string) {
    this.diceShow = { die, total, reason, at: performance.now() };
    clearTimeout(this.diceTimer!);
    this.diceTimer = setTimeout(() => {
      if (this.diceShow && performance.now() - this.diceShow.at > 3200) {
        this.diceShow = null;
        this.emitSnapshot();
      }
    }, 3400);
    this.emitSnapshot();
  }
  public sneaking = false;
  public running = false;
  /** first-person camera mode (P key) — camera rides on the hero's head */
  public firstPerson = false;
  /** id of the unit currently hidden by first-person mode — restoring by id
   *  (not by re-resolving the leader) is what makes FP→iso transitions
   *  never lose the player model again */
  public fpHiddenId: string | null = null;
  /** first-person look direction (yaw/pitch) — mouse + Q/E drive these */
  public fpYaw = Math.PI * 0.25;
  public fpPitch = -0.12;
  /** WASD step cooldown (seconds) so holding W walks continuously */
  private fpStepAt = 0;
  /** drag-look active (pointer-lock fallback) */
  public fpDrag = false;
  /** dim warm headlamp shown only in first person (off in iso) */
  public fpLight: THREE.PointLight | null = null;
  public crouchLerp = 0;
  /** when true the player has queued a throw (uses inventory item as projectile) */
  public throwing = false;
  /** bonfire loadout editor open (only reachable while resting at a bonfire) */
  public showBonfireLoadout = false;
  public torchLit = true;
  /** the weapon kind held before the last 'T' torch-equip — restored on toggle-off */
  public heroPrevWeapon: string | null = null;
  public torchLight: THREE.PointLight | null = null;
  public bonfireGroup: THREE.Group | null = null;
  public bonfirePos: GridPos | null = null;
  public bonfireLit = false;
  public defeatedSpecialMobs = new Set<string>();
  public showBonfireUI = false;
  public restingAtBonfire = false;
  public pendingSmash: { unitId: string; propId: string } | null = null;
  public bigMessage: string | null = null;
  public cinematic = false;

  // -- save / load --
  /** global audio settings (persisted, shared across all slots) */
  public settings: GameSettings = SettingsManager.load();
  /** the slot the current playthrough is being saved into (null until a
   *  new game is started or a save is loaded) */
  public currentSlotId: string | null = null;
  /** true while the in-game pause menu is open ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ simulation is frozen */
  public paused = false;

  /** show a subtitle styled for cutscenes (small, readable, lingers) */
  public showCine(text: string) { this.bigMessage = text; this.cinematic = true; this.emitSnapshot(); }
  public clearCine() { this.bigMessage = null; this.cinematic = false; this.emitSnapshot(); }

  /** play a pre-generated narrator line (edge-tts mp3) under a subtitle. Falls
   *  back to text-only if the asset is missing, so the scene always works. */
  /** skip-aware wait: resolves immediately once cutsceneSkip is set */
  public cineDelay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.cutsceneSkip) return resolve();
      const t = setTimeout(resolve, ms);
      const iv = setInterval(() => {
        if (this.cutsceneSkip) { clearTimeout(t); clearInterval(iv); resolve(); }
      }, 40);
    });
  }

  public async narrate(id: string, text: string, minMs = 4200) {
    if (this.cutsceneSkip) return;
    this.showCine(text);
    let dur = minMs;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/narration/${id}.mp3`);
      if (res.ok) {
        const a = new Audio(`${import.meta.env.BASE_URL}audio/narration/${id}.mp3`);
        a.volume = 1;
        dur = (await new Promise<number>((resolve) => {
          a.onloadedmetadata = () => resolve((a.duration || minMs / 1000) * 1000);
          a.onerror = () => resolve(minMs);
          setTimeout(() => resolve(minMs), 400);
        }));
        try { a.play().catch(() => {}); } catch { /* ignore */ }
      }
    } catch { /* asset missing ? text only */ }
    await this.cineDelay(Math.max(minMs, dur));
    // narrate owns its own caption lifecycle — clear the line after it plays
    // (cutscene beats that clearCine() early are harmless double-clears)
    this.clearCine();
  }

  /** a full-screen black fade (0..1) for scene transitions */
  public fadeTo(v: number) {
    if (!this.fadeEl) {
      this.fadeEl = document.createElement('div');
      this.fadeEl.className = 'cine-fade';
      // mount inside .game-root so it layers between canvas and HUD (captions)
      (this.container.parentElement ?? document.body).appendChild(this.fadeEl);
    }
    this.fadeEl.style.opacity = String(v);
  }
  public hoverInfo: string | null = null;
  public keys = new Set<string>();
  public enemyCones: { mesh: THREE.Mesh; yaw: number; targetYaw: number; unitId: string }[] = [];
  public playerCone!: THREE.Mesh;
  public coneGeo!: THREE.BufferGeometry;
  public playerConeGeo!: THREE.BufferGeometry;
  public detectionMeter = new Map<string, Map<string, number>>();
  public trapManager!: TrapManager;
  public disposed = false;
  public raf = 0;
  public lastT = 0;
  public chest: THREE.Group | null = null;

  // -- dungeon interactables & quest state --
  public structures: LevelStructures | null = null;
  public heroLight: THREE.PointLight | null = null;
  public heroTorchFlame: THREE.Mesh | null = null;
  public torchT = 0;
  public ironDoor: THREE.Group | null = null;
  public goldenChest: THREE.Group | null = null;
  public secretChestMesh: THREE.Group | null = null;
  public leverMesh: THREE.Group | null = null;
  public weaponRack: THREE.Group | null = null;
  public rackClub: THREE.Object3D | null = null;
  public rubbleMeshes: { mesh: THREE.Group; tile: GridPos }[] = [];
  /** dungeon set-dressing root (bath, doors, chests, lever, rubble) — created by setupDungeon */
  public dressingGroup: THREE.Group | null = null;
  /** authored doors (floor 50): id → mesh + open flag */
  public doorMeshes: { id: string; pos: GridPos; flag: string; mesh: THREE.Group }[] = [];
  /** authored blockers (rubble / secret doors) keyed by open flag */
  public blockerMeshes: { id: string; kind: 'rubble' | 'secretDoor'; flag: string; tile: GridPos; mesh: THREE.Group }[] = [];
  /** authored room lookup + narration (floor 50) */
  public roomOf: ((x: number, z: number) => string | null) | null = null;
  public roomNarration: Record<string, string> | null = null;
  public propAnims: ((dt: number) => boolean)[] = [];   // returns true when finished
  public ironDoorOpen = false;
  public secretOpen = false;
  public goldenChestOpen = false;
  public secretChestOpen = false;
  public bossCutscenePlayed = false;
  public bossRatCutscenePlayed = false;
  public gribnabCutscenePlayed = false;
  public introPlayed = false;
  public introActive = false;
  public titleIdle = false;
  public introSkipped = false;
  public bossCineActive = false;
  public cutsceneSkip = false;
  public tavern: THREE.Group | null = null;
  public tavernRigs: Rig[] = [];
  public tavernActors: Record<string, Rig> = {};
  public inTavern = false;
  public fadeEl: HTMLElement | null = null;
  public hasIronKey = false;
  public hasGoldenKey = false;
  public gameWon = false;

  // -- fog of war ---------------------------------------------
  /** tiles the player has seen at least once */
  public explored: boolean[][] = [];
  /** parent group for the full-map fog InstancedMesh */
  public fogGroup: THREE.Group | null = null;
  /** single InstancedMesh of black columns covering every UNEXPLORED tile
   *  map-wide (not just a window near the leader) — rebuilt lazily when
   *  `fogDirty` flips, so scrolled-away areas stay completely black */
  public fogMesh: THREE.InstancedMesh | null = null;
  /** set when exploration changes → updateFog rebuilds the fog mesh */
  public fogDirty = true;
  /** vision radius (tiles) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ torch extends it; base is a small cone */
  public visionRadius = 6;

  // -- cheat console ------------------------------------------
  /** when true the camera continuously follows the party leader */
  public followCam = false;
  /** proximity aggro is ON by default — dormant enemies wake up when the
   *  party gets within range (or walks into their vision cone). The intro
   *  grace window (introGraceUntil) still protects the player right after
   *  the intro so they aren't swarmed instantly. Toggle with the `noaggro`
   *  console command. */
  public aggroDisabled = false;
  /** suppression until this wall-clock second — the intro grace plus a
   *  short window after every respawn so the party isn't re-swarmed the
   *  instant they stand up at the bonfire. */
  public aggroGraceUntil = 0;
  public showFullMap = false;
  /** console overlay open? (backtick key) */
  public consoleOpen = false;
  /** current console input line */
  public consoleInput = '';
  /** god-mode flag ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ party takes no damage */
  public godMode = false;

  // -- cutscene runtime extensions ---------------------------
  /** "skip combat glitch" grace window: after a skipped intro, suppress
   *  proximity aggro until this monotonic-time cutoff passes so Greg has
   *  a beat to step away from the dormant rats. */
  public introGraceUntil = 0;
  /** the single object that routes/dispatches every cinematic, kept in
   *  src/game/cutscenes.ts so engine.ts doesn't bloat as scenes multiply. */
  public cutsceneDirector: CutsceneDirector | null = null;
  /** stable CutsceneHost adapter ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ kept so the splash can drive the title
   *  sequence in two phases (setup backdrop, then run narration on enter). */
  public cutsceneHost!: CutsceneHost;
  /** the tavern-exterior group + previous background while the splash is up */
  public titleExt: THREE.Group | null = null;
  public titlePrevBg: any = null;
  /** one-time window listener that resumes audio + starts the tavern theme on
   *  the first interaction anywhere on the splash (autoplay needs a gesture) */
  public splashAudioHandler: (() => void) | null = null;

  // -- character creation (dungeon wake) ----------------------
  /** resolver for the pending `requestCreation()` promise (released by confirm). */
  private creationResolver: (() => void) | null = null;
  /** the confirmed build (null until creation completes). */
  public creationBuild: CharacterBuild | null = null;

  public container: HTMLDivElement;
  public overlay: HTMLDivElement;
  public onSnapshot: (s: UISnapshot) => void;
  public onReady: (() => void) | null = null;

  constructor(container: HTMLDivElement, overlay: HTMLDivElement, onSnapshot: (s: UISnapshot) => void, onReady?: () => void) {
    this.container = container;
    this.overlay = overlay;
    this.onSnapshot = onSnapshot;
    this.onReady = onReady ?? null;
  }

  // -- setup -------------------------------------------------
  init() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.container.appendChild(this.renderer.domElement);

    this.iso = new IsoCamera(w / h);
    const L = levelForFloor(this.floorNumber);
    this.scene.fog = new THREE.FogExp2(L.fogColor, L.fogDensity);
    this.scene.background = new THREE.Color(L.fogColor);

    // lights ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ cave (dim ambient + no sun + crystal/torch fills)
    const hemi = new THREE.HemisphereLight(0x93a8d0, 0x3a3226, L.ambient);
    this.scene.add(hemi);
    {
      // Always present so the dungeon (L.sun === 0) still gets a dim key light
      // and real shadows for every character/object. Bright levels keep their
      // full sun intensity; dark caves fall back to a soft minimum.
      const sun = new THREE.DirectionalLight(0xffc890, L.sun > 0 ? L.sun : 0.22);
      sun.position.set(20, 30, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
      sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
      sun.shadow.camera.far = 90;
      sun.shadow.bias = -0.0008;
      this.scene.add(sun);
      this.scene.add(sun.target);
    }
    const fill = new THREE.DirectionalLight(0x6a80b8, L.fill);
    fill.position.set(-15, 20, -18);
    this.scene.add(fill);

    // PERFORMANCE (Fix A): the heaviest single operation in init() is
    // `new VoxelWorld(...)` which builds ~150k voxel cubes synchronously
    // (~600-1000 ms blocking the main thread). We defer the entire
    // post-lights block to setTimeout(0) so the splash overlay + an empty
    // lit scene paints first (~16 ms). The RAF loop / composer / input
    // are already set up by the time the world is ready, so the game
    // simply animates over a black sky for one frame and then the world
    // pops in. No race conditions: the post-world setup (fog, props,
    // traps, units, title scene) lives INSIDE the setTimeout, so it
    // runs AFTER the world is built, in the same relative order as
    // before.
    setTimeout(() => {
      if (this.disposed) return;
      this._initWorldAndDressing();
    }, 0);
  }

  /** PERFORMANCE (Fix A): the heavy half of init() that requires
   *  this.world. Deferred via setTimeout in init() so the splash paints
   *  fast. Contains: world build, fog grid, pickables, highlight pools,
   *  selection ring, click ping, destructibles, vision cones, traps,
   *  combat + units, setupDungeon, cutscene host + director, title
   *  scene, splash audio listener, composer, input, RAF loop. */
  private _initWorldAndDressing() {
    const w = this.container.clientWidth, h = this.container.clientHeight;

    // world — the authored Floor 50 sewer cellar
    this.world = new VoxelWorld(levelForFloor(this.floorNumber), this.runSeed & 0xffff);
    this.scene.add(this.world.group);

    // -- fog of war: initialize the explored grid (all dark) + overlay group --
    // The fog InstancedMesh itself is lazy-created by updateFog (interaction.ts)
    // so any world/floor rebuild path automatically gets a fresh full-map mesh.
    {
      const FS = this.world.heights.length;
      this.explored = Array.from({ length: FS }, () => new Array<boolean>(FS).fill(false));
      this.fogGroup = new THREE.Group();
      this.scene.add(this.fogGroup);
      this.fogMesh = null;
      this.fogDirty = true;
    }

    // find bonfire prop
    for (const child of this.world.group.children) {
      if ((child as any).userData?.isBonfire) {
        this.bonfireGroup = child as THREE.Group;
        break;
      }
    }
    // pickables: for the fallback InstancedMesh cave builder (old path).
    // The new voxel terrain uses math-based tile picking (see pickTile).
    this.world.group.traverse((o) => { if (o instanceof THREE.InstancedMesh) this.pickables.push(o); });
    this.pickables.push(this.world.water);
    this.scene.add(this.particles.points);

    // highlight pools
    this.hlMats = {
      move: new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.34, depthWrite: false }),
      aoe: new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.42, depthWrite: false }),
      range: new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.16, depthWrite: false }),
      hover: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
      ally: new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.4, depthWrite: false }),
    };
    const hlGeo = new THREE.PlaneGeometry(0.94, 0.94);
    hlGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 400; i++) {
      const m = new THREE.Mesh(hlGeo, this.hlMats.move);
      m.visible = false;
      m.renderOrder = 2;
      this.hlGroup.add(m);
      this.hlPool.push({ mesh: m, cat: '' });
    }
    this.scene.add(this.hlGroup);

    // selection ring
    const ringGeo = new THREE.RingGeometry(0.42, 0.56, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd76b, transparent: true, opacity: 0.95, depthWrite: false }));
    this.ring.renderOrder = 3;
    this.scene.add(this.ring);

    // click ping
    const pingGeo = new THREE.RingGeometry(0.2, 0.3, 24);
    pingGeo.rotateX(-Math.PI / 2);
    this.clickPing = new THREE.Mesh(pingGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.clickPing.renderOrder = 3;
    this.scene.add(this.clickPing);

    // destructible props (crates/barrels/vases) — placements come from the level
    const destLevel = levelForFloor(this.floorNumber);
    const destSpots = (destLevel.destructibles ?? []).map((d) => [d.defId, d.x, d.z] as [string, number, number]);
    this.props = new DestructibleManager(this.world, destSpots);
    this.scene.add(this.props.group);

    // vision cones ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ pre-built geometry reused per frame
    const coneShape = new THREE.Shape();
    const CR = 9, CHA = 35 * Math.PI / 180, CS = 14;
    coneShape.moveTo(0, 0);
    for (let i = 0; i <= CS; i++) {
      const a = -CHA + (i / CS) * (CHA * 2);
      coneShape.lineTo(Math.sin(a) * CR, Math.cos(a) * CR);
    }
    this.coneGeo = new THREE.ShapeGeometry(coneShape);
    // player cone (shorter, narrower)
    const pcShape = new THREE.Shape();
    const PR = 5, PHA = 30 * Math.PI / 180, PS = 10;
    pcShape.moveTo(0, 0);
    for (let i = 0; i <= PS; i++) {
      const a = -PHA + (i / PS) * (PHA * 2);
      pcShape.lineTo(Math.sin(a) * PR, Math.cos(a) * PR);
    }
    this.playerConeGeo = new THREE.ShapeGeometry(pcShape);
    this.playerCone = new THREE.Mesh(this.playerConeGeo, new THREE.MeshBasicMaterial({
      color: 0x3b82f6, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.playerCone.rotation.x = Math.PI / 2;
    this.playerCone.visible = false;

    // the title scene (tavern exterior) must NOT show the dungeon beside the
    // inn — the intro cutscene reveals the world group when Greg wakes up
    // (cutscenes/intro.ts), and loadGame/returnToTitle manage it on their paths
    if (this.phase === 'menu') {
      this.world.group.visible = false;
      this.props.group.visible = false;
      if (this.fogGroup) this.fogGroup.visible = false;
      // dungeon dressing (rubble, bath, iron doors, chests) + trap markers
      // must not leak beside the tavern exterior on the title screen
      if (this.dressingGroup) this.dressingGroup.visible = false;
      if (this.trapManager?.group) this.trapManager.group.visible = false;
      // hand-authored NPC rigs (hermit, Scrag…) are added straight to the scene
      // root — hide them too or their voxel bodies read as stray cubes
      for (const n of this.npcs) if (n.rig?.group) n.rig.group.visible = false;
    }
    this.playerCone.renderOrder = 0;
    this.scene.add(this.playerCone);

    // traps — placements come from the level (per-run seed for floor 50)
    this.trapManager = new TrapManager(this.world);
    const trapLevel = levelForFloor(this.floorNumber);
    const trapSpots = typeof trapLevel.traps === 'function'
      ? trapLevel.traps(this.runSeed).map((t) => [t.defId, t.x, t.z] as [string, number, number])
      : (trapLevel.traps ?? []).map((t) => [t.defId, t.x, t.z] as [string, number, number]);
    this.trapManager.init(trapSpots);
    this.scene.add(this.trapManager.group);

    // combat + units
    this.combat = new Combat(this.world);
    this.onBossParley = (outcome) => this.handleGribnabParley(outcome);
    this.spawnUnits();
    this.setupDungeon(levelForFloor(this.floorNumber));
    this.iso.focus(this.unitWorld(this.combat.units[0].pos));

    // wire the cutscene director ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ every cinematic runs through this one
    // object (the engine only implements the CutsceneHost API; all scene
    // scripts live in src/game/cutscenes.ts)
    this.cutsceneHost = this.buildCutsceneHost();
    this.cutsceneDirector = new CutsceneDirector(this.cutsceneHost);

    // -- splash: build the animated tavern-exterior backdrop immediately so it
    //    sits behind the HTML splash overlay (title + "Enter the Dungeon").
    //    The narration + interior cutscene run later, on enterDungeon(), so the
    //    front-of-tavern view continues seamlessly once the title fades.
    const title = setupTitleScene(this.cutsceneHost);
    this.titleExt = title.ext;
    this.titlePrevBg = title.prevBg;

    // -- splash audio: start the tavern theme on the FIRST user interaction
    //    anywhere on the title screen. Browser/webview autoplay policy blocks
    //    audio until a gesture, so we wait for one (the "Enter the Dungeon"
    //    click also counts). The title narration then continues seamlessly.
    this.splashAudioHandler = () => {
      if (this.splashAudioHandler) {
        window.removeEventListener('pointerdown', this.splashAudioHandler);
        window.removeEventListener('keydown', this.splashAudioHandler);
        this.splashAudioHandler = null;
      }
      if (!this.titleExt) return;            // already entered the dungeon
      void this.audio.init();
      this.applyAudioSettings();
      this.audio.playTavernMusic({ muffled: true, volume: 0.10 });
      this.audio.setMusicDucked(true);
    };
    window.addEventListener('pointerdown', this.splashAudioHandler);
    window.addEventListener('keydown', this.splashAudioHandler);

    // composer (bloom makes fireballs & torchlight pop)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.iso.cam));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.5, 0.78);
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    this.bindInput();
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      try {
        this.update(dt);
      } catch (err) {
        // a transient error must never kill the render loop
        // eslint-disable-next-line no-console
        console.error('[engine.update]', err);
        this.pushLog(`⚠ engine error: ${err instanceof Error ? err.message : String(err)}`, 'system');
      }
      this.composer.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.emitSnapshot();
    this.onReady?.();
    // dev hook: lets scripts/browser automation drive the engine directly
    (window as unknown as Record<string, unknown>).__dh_engine = this;
  }

  public spawnUnits() {
    const L = levelForFloor(this.floorNumber);
    this.combat.units = L.makeRoster ? L.makeRoster(this.runSeed) : createRoster();
    for (const u of this.combat.units) this.addUnit(u);
  }

  /**
   * Build the `CutsceneHost` adapter ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ a small stable surface that
   * every cinematic script in src/game/cutscenes.ts talks to. The
   * engine implements every capability itself (its public helpers);
   * the adapter just delegates. Add new cutscenes without changing
   * the engine beyond this method.
   */
  public buildCutsceneHost(): CutsceneHost {
    const self = this;
    return {
      // -- read-only references --
      get scene() { return self.scene; },
      get iso() { return self.iso; },
      get combat() { return self.combat; },
      get audio() { return self.audio; },
      get particles() { return self.particles; },
      get fx() { return FX; },
      get structures() { return self.structures; },
      get visuals() { return self.visuals; },
      get propAnims() { return self.propAnims; },
      get propsGroup() { return self.props.group; },
      get worldGroup() { return self.world.group; },
      get dressingGroup() { return (self as any).dressingGroup ?? null; },
      get trapGroup() { return (self as any).trapManager?.group ?? null; },
      get npcRigs() { return self.npcs; },
      get canvas() { return self.renderer.domElement; },
      get fadeEl() { return self.fadeEl; },
      get heroLight() { return self.heroLight; },

      // -- mutable engine state --
      get tavern() { return self.tavern; }, set tavern(v: THREE.Group | null) { self.tavern = v; },
      get tavernRigs() { return self.tavernRigs; }, set tavernRigs(v: Rig[]) { self.tavernRigs = v; },
      get tavernActors() { return self.tavernActors; }, set tavernActors(v: Record<string, any>) { self.tavernActors = v as Record<string, Rig>; },
      get rackClub() { return self.rackClub; },
      get weaponRack() { return self.weaponRack; },
      get bigMessage() { return self.bigMessage; }, set bigMessage(v: string | null) { self.bigMessage = v; },
      get cinematic() { return self.cinematic; }, set cinematic(v: boolean) { self.cinematic = v; },
      get busy() { return self.busy; }, set busy(v: boolean) { self.busy = v; },
      get phase() { return self.phase; }, set phase(v: GamePhase) { self.phase = v; },
      get introActive() { return self.introActive; }, set introActive(v: boolean) { self.introActive = v; },
      get bossCineActive() { return self.bossCineActive; }, set bossCineActive(v: boolean) { self.bossCineActive = v; },
      get introPlayed() { return self.introPlayed; }, set introPlayed(v: boolean) { self.introPlayed = v; },
      get introSkipped() { return self.introSkipped; }, set introSkipped(v: boolean) { self.introSkipped = v; },
      get inTavern() { return self.inTavern; }, set inTavern(v: boolean) { self.inTavern = v; },
      get titleIdle() { return self.titleIdle; }, set titleIdle(v: boolean) { self.titleIdle = v; },

      // -- audio utilities (bound) --
      setMusicDucked: (b) => self.audio.setMusicDucked(b),
      setTavernMuffled: (b) => self.audio.setTavernMuffled(b),
      stopTavernMusic: () => self.audio.stopTavernMusic(),
      stopMusic: () => self.audio.stopMusic(),
      playMusic: (track) => self.audio.playMusic(track),
      playTavernMusic: (opts) => self.audio.playTavernMusic(opts),
      play: (sfx, v, p) => self.audio.play(sfx, v, p),
      splash: () => self.audio.splash(),
      roar: (vol) => self.audio.roar(vol),
      sing: (vol) => self.audio.sing(vol),
      bossSting: () => self.audio.bossSting(),

      // -- narration + timing --
      cineDelay: (ms) => self.cineDelay(ms),
      narrate: (id, text, minMs) => self.narrate(id, text, minMs),
      speakDialogue: (npcId, nodeId) => self.speakDialogue(npcId, nodeId),
      showCine: (text) => self.showCine(text),
      clearCine: () => self.clearCine(),
      markSkipped: () => { self.cutsceneSkip = true; self.introSkipped = true; },
      resetSkipState: () => { self.cutsceneSkip = false; self.introSkipped = false; },
      fadeTo: (v) => self.fadeTo(v),

      // -- math + transforms --
      unitWorld: (pos) => self.unitWorld(pos),
      animateTo: (g, s, t, d) => self.animateTo(g, s, t, d),
      faceToward: (v, t, snap) => self.faceToward(v as unknown as UnitVisual, t, snap),
      walkRigTo: (v, tile, dur) => self.walkRigTo(v as unknown as UnitVisual, tile, dur),
      setWeapon: (rig, kind, accent) => setWeapon(rig, kind as any, accent),

      // -- fx --
      spawnStars: (p) => self.spawnStars(p),
      splashBurst: (p, n) => self.splashBurst(p, n),
      waterPlink: (p) => self.waterPlink(p),
      launchMagicMissile: (from, to) => self.launchMagicMissile(from, to),
      passOut: (dur) => self.passOut(dur),

      // -- attachables / build helpers --
      attachHeroTorch: (rig) => self.attachHeroTorch(rig),
      buildSheep: () => self.buildSheep(),
      buildTavern: () => self._buildTavern(),
      buildTavernExterior: () => self.buildTavernExterior(),
      barmaidServe: (bar) => self.barmaidServe(bar),

      // -- log / UI / queue --
      pushLog: (t, k) => self.pushLog(t, k ?? 'system'),
      emitSnapshot: () => self.emitSnapshot(),
      enqueue: (events) => self.enqueue(events),

      // -- engine lifecycle hooks --
      // record the bonfire's location as the respawn checkpoint, but leave it
      // UNLIT ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ the player must click it to light it (see clickExplore/lightBonfire)
      setBonfireCheckpoint: (pos) => { self.bonfirePos = { ...pos }; },
      armIntroGrace: (secs) => { self.introGraceUntil = (performance.now() / 1000) + secs; },
      onIntroComplete: () => self.onIntroComplete(),

      // -- character creation --
      requestCreation: () => self.requestCreation(),
      resolveCreation: () => self.resolveCreation(),
    };
  }

  // -- dungeon set-up & interactables ------------------------

  /** Mount a burning torch in the hero's off-hand; its point light is the
   *  warm glow that lets the lone warrior see through the dark warren. */

  public static inRect(p: GridPos, r: { x0: number; z0: number; x1: number; z1: number }) {
    return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
  }

  /** queue a per-frame tween of a numeric property; runs in updateDungeon */
  public animateTo(get: () => number, set: (v: number) => void, target: number, dur: number) {
    let t = 0; const start = get();
    this.propAnims.push((dt) => {
      t = Math.min(dur, t + dt);
      const k = dur > 0 ? t / dur : 1;
      set(start + (target - start) * k);
      return t >= dur;
    });
  }

  // ── floor 50 — flags / ability checks / item hooks ────────
  public setFlag(f: string) { this.flags.add(f); }
  public hasFlag(f: string): boolean { return this.flags.has(f); }

  /** remove one inventory item with this base id (returns success) */
  public takeItem(baseId: string): boolean {
    const idx = this.inventory.findIndex((i) => (i as any)._baseId === baseId || i.id === baseId);
    if (idx < 0) return false;
    this.inventory.splice(idx, 1);
    this.emitSnapshot();
    return true;
  }

  public addGold(n: number) { this.gold += n; this.emitSnapshot(); }

  public healGreg(n: number) {
    const g = this.combat?.living('party')[0];
    if (g) g.hp = Math.min(effMaxHp(g), g.hp + n);
    this.emitSnapshot();
  }

  public damageGreg(n: number, source: string) {
    const g = this.combat?.living('party')[0];
    if (!g) return;
    g.hp = Math.max(0, g.hp - n);
    this.pushLog(`☠ ${g.name} takes ${n} damage${source ? ` (${source})` : ''}.`, 'hit');
    this.emitSnapshot();
    if (g.hp <= 0 && g.alive) {
      g.alive = false;
      this.runStats.deaths += 1;
      this.pushLog(`💀 ${g.name} has fallen!`, 'death');
    }
  }

  public applyCondition(unitId: string, condId: string, rounds: number) {
    const u = this.combat?.byId(unitId);
    if (!u) return;
    if (!u.conditions.some((c) => c.id === condId)) {
      u.conditions.push({ id: condId, name: CONDITIONS[condId]?.name ?? condId, roundsLeft: rounds });
    } else {
      u.conditions.find((c) => c.id === condId)!.roundsLeft = Math.max(u.conditions.find((c) => c.id === condId)!.roundsLeft, rounds);
    }
    this.emitSnapshot();
  }

  /** does Greg know a class pool skill of the given class? */
  public hasClassSkill(classId: string): boolean {
    const g = this.combat?.living('party')[0];
    if (!g) return false;
    return classPoolSkillIds(g.classes).includes(classId) || g.equipment.weapon?._baseId === 'wrench';
  }

  /** d20 + ability mod + proficiency vs DC (the trap-reveal math) */
  public abilityCheck(stat: string, dc: number): boolean {
    const g = this.combat?.living('party')[0];
    if (!g) return false;
    const mod = abilityMod(g.abilities[stat as Ability]);
    const r = rollD20(mod + g.proficiency);
    const total = r.total;
    this.showDiceRoll('d20', total, `${stat.toUpperCase()} check`);
    this.pushLog(`🎲 ${stat.toUpperCase()} check: ${r.roll}${fmtMod(mod)} +${g.proficiency} prof = ${total} vs DC ${dc}`, 'roll');
    return total >= dc;
  }

  public startQuest(questId: string) {
    if (!this.questLog.get(questId)) {
      this.questLog.start(questId);
      this.pushLog(`📜 Quest started: ${QUESTS[questId]?.name ?? questId}`, 'system');
    }
    this.emitSnapshot();
  }

  /** complete a quest (no item rewards — those flow through dialogue/interactables) */
  public completeQuest(questId: string) {
    const qs = this.questLog.complete(questId);
    if (qs) {
      this.runStats.questsDone += 1;
      this.pushLog(`📜 Quest complete: ${QUESTS[questId]?.name ?? questId}!`, 'system');
    }
    this.emitSnapshot();
  }

  public playSfx(name: string, vol = 0.7, pitch = 1) { this.audio.play(name as never, vol, pitch); }

  /** Gribnab parley — set once at init; the bossParley dialogue action calls it */
  public onBossParley: ((outcome: 'fight' | 'truce') => void) | null = null;

  private handleGribnabParley(outcome: 'fight' | 'truce') {
    const grib = this.combat?.units.find((u) => u.name === 'Gribnab');
    if (outcome === 'fight') {
      this.showDialogue = null;
      this.setFlag('gribnab_parley_fight');
      if (grib) this.applyCondition(grib.id, 'enraged', 99);
      this.pushLog('So be it. The bath will have its sacrifice.', 'system');
      this.busy = false;
      this.bossCineActive = false;
      this.emitSnapshot();
      return;
    }
    // truce — the bath is OURS now
    this.showDialogue = null;
    this.setFlag('gribnab_befriended');
    if (grib) {
      grib.dormant = true;
      grib.alive = true;
      this.combat.turnOrder = this.combat.turnOrder.filter((id) => id !== grib.id);
    }
    if (this.combat) this.enqueue(this.combat.endEarly());
    this.grantKey('golden');
    for (const itemId of ['drowned_majesty', 'soap_crown']) {
      const it = makeItem(itemId);
      this.inventory.push(it);
      this.pushLog(`Gribnab presses ${it.icon} ${it.name} into your hands.`, 'system');
    }
    this.addGold(50);
    this.busy = false;
    this.bossCineActive = false;
    this.pushLog('🫧 Gribnab is your partner now. The bath is OURS.', 'system');
    this.emitSnapshot();
  }

  public grantKey(kind: 'iron' | 'golden') { grantKeyModule(this, kind); }
  public grantLoot(items: unknown[], gold: number) { grantLootModule(this, items, gold); }

  // ── loot preview (see-what-dropped-then-choose) ──────────
  /** active loot offer (loot overlay) */
  public pendingLoot: { source: string; items: any[]; gold: number } | null = null;
  /** drops accumulated during combat, surfaced when the fight ends */
  public lootQueue: { source: string; items: any[]; gold: number }[] = [];

  public offerLoot(source: string, items: unknown[], gold: number) { offerLoot(this, source, items, gold); }
  public flushLootQueue() { flushLootQueue(this); }
  public takeAllLoot() { takeAllLoot(this); }
  public takeLootItem(itemId: string) { takeLootItem(this, itemId); }
  public leaveLootItem(itemId: string) { leaveLootItem(this, itemId); }
  public dismissLoot() { dismissLoot(this); }
  public clearLoot() { clearLoot(this); }

  /** the mid-fight parley: first time Gribnab drops to ≤10% HP */
  public maybeParley(unitId: string) {
    const u = this.combat?.byId(unitId);
    if (!u || u.name !== 'Gribnab' || !u.alive) return;
    if (this.flags.has('gribnab_parleyed')) return;
    if (this.flags.has('gribnab_befriended') || this.flags.has('gribnab_dead')) return;
    if (u.hp > Math.ceil(u.maxHp * 0.1)) return;
    this.setFlag('gribnab_parleyed');
    this.pushLog('Gribnab lowers his club. The bubbles settle.', 'system');
    this.talkToNpc('gribnab');
  }

  /** nearest NPC within talk range (generic registry) */
  public activeTalkTarget(): string | null {
    if (this.phase !== 'explore' || this.combat.inCombat || this.busy) return null;
    const leader = this.combat?.living('party')[0];
    if (!leader) return null;
    for (const n of this.npcs) {
      if (Combat.dist(leader.pos, n.pos) <= 1.5) return n.npcId;
    }
    return null;
  }

  // ── interactables (floor 50) ───────────────────────────────
  public registerInteractables(defs: Interactable[]) { registerInteractablesModule(this, defs); }
  public updateInteractables() { updateInteractablesModule(this); }
  public triggerActiveInteractable() { triggerActiveInteractableModule(this); }

  /** teleport the party leader (well drop, …) */
  public teleportGreg(tile: GridPos) {
    const g = this.combat?.living('party')[0];
    if (!g) return;
    g.pos = { ...tile };
    const v = this.visuals.get(g.id);
    if (v) {
      const wp = this.unitWorld(tile);
      v.rig.group.position.copy(wp);
      v.rig.group.userData.baseY = wp.y;
      v.walker = null;
    }
    this.explored[tile.x] ??= [];
    for (let x = tile.x - 1; x <= tile.x + 1; x++) for (let z = tile.z - 1; z <= tile.z + 1; z++) {
      if (x >= 0 && z >= 0 && x < WORLD_SIZE && z < WORLD_SIZE) this.explored[x][z] = true;
    }
    this.fogDirty = true;
    const wp = this.unitWorld(tile);
    this.iso.focus(wp);
    this.iso.desiredTarget?.copy(wp);
    this.emitSnapshot();
  }

  /** mark a rect explored (goblin map) */
  public exploreRect(rect: { x0: number; z0: number; x1: number; z1: number }) {
    for (let x = rect.x0; x <= rect.x1; x++) for (let z = rect.z0; z <= rect.z1; z++) {
      if (x >= 0 && z >= 0 && x < WORLD_SIZE && z < WORLD_SIZE) this.explored[x][z] = true;
    }
    this.fogDirty = true;
    this.emitSnapshot();
  }

  /** set every trap of a def id as triggered (valve/altar drain the flood) */
  public deactivateTrap(defId: string) {
    for (const t of this.trapManager?.traps ?? []) {
      if (t.def.id === defId) {
        t.triggered = true;
        if (t.mesh) {
          this.trapManager.group.remove(t.mesh);
          t.mesh.geometry.dispose();
          (t.mesh.material as THREE.Material).dispose();
          t.mesh = undefined;
        }
      }
    }
  }

  /** floor clear: departure narration → victory screen with run stats */
  public winGame() { winGameModule(this); }

  // -- dungeon aggro & boss cutscene -------------------------
  public checkDungeonAggro() {
    if (!this.structures || this.phase !== 'explore' || this.combat.inCombat || this.busy || this.gameWon) return;
    // aggro is disabled by default ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ the player explores freely.
    // toggle with the `noaggro` console command (backtick ? type noaggro).
    if (this.aggroDisabled) return;
    // grace window: after the intro ends (whether naturally or by skipping)
    // and after every respawn, suppress proximity aggro for a beat so Greg
    // doesn't instantly get swarmed by the dormant rats in his starter room
    // or at the bonfire he just respawned at.
    if (performance.now() / 1000 < Math.max(this.introGraceUntil, this.aggroGraceUntil)) return;
    const st = this.structures;
    const party = this.combat.living('party');
    if (!party.length) return;

    // entering the boss arena the first time — Baron Gnaw (room 5) or
    // Gribnab's bath chamber (room 25) each fire their own cutscene
    const arena = st.arenaRect;
    const inArena = !!arena && party.some((p) => GameEngine.inRect(p.pos, arena));
    const inBath = party.some((p) => GameEngine.inRect(p.pos, st.bossRoom));
    if (inArena && !this.flags.has('boss_pacified') && !this.bossRatCutscenePlayed) {
      this.bossRatCutscenePlayed = true;
      void this.playBossRatCutscene();
      return;
    }
    if (inBath && this.flags.has('gribnab_door_open') && !this.gribnabCutscenePlayed) {
      this.gribnabCutscenePlayed = true;
      void this.playGribnabCutscene();
      return;
    }

    // group proximity aggro (never wakes the boss group by proximity)
    for (const f of this.combat.units) {
      if (!f.alive || f.team !== 'enemy' || !f.dormant || f.bossGroup) continue;
      // goblin respect (throne room): goblins stay neutral unless provoked
      if (f.scheme?.orc === true && this.flags.has('goblin_respect') && !this.flags.has('goblins_provoked')) continue;
      const range = (f.flying ? 5 : 4) - (this.sneaking ? 2 : 0);
      for (const p of party) {
        const d = Combat.dist(p.pos, f.pos);
        if (d > Math.max(range, 9)) continue;   // skip far-away groups
        // line of sight: never aggro through walls
        if (!this.hasLineOfSight(p.pos, f.pos)) continue;
        const coneAggro = f.groupId === 'r3_rats' ? false : !this.sneaking && this.inEnemyCone(p.pos, f);
        if (d <= range || coneAggro) {
          this.aggroGroup(f.groupId);
          return;
        }
      }
    }
  }

  /** TEMP DEBUG (press B): open the iron door, teleport the party just inside
   *  the boss room and fire the bathing-tyrant cutscene on demand. Remove me. */

  // -- cheat console ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ press ` to open, type a command, press Enter --
  /** parse & execute a console command string (already lowercased + trimmed) */

  // == tavern flashback set (intro cutscene) =====================
  //  "The Dirty Mug" - rebuilt entirely from voxels (no smooth primitives).
  //  The actual construction lives in src/game/engine/tavern.ts (single
  //  source of truth); this is only the engine-side wiring.
  public _buildTavern(): THREE.Group {
    return buildTavern({
      propAnims: this.propAnims,
      particles: this.particles,
      editorMode: this.editorMode,
      register: (rig, key) => { this.tavernRigs.push(rig); if (key) this.tavernActors[key] = rig; },
      spawnDrunkStars: (rig) => this.spawnDrunkStars(rig),
    });
  }

  /** a small fully-voxel sheep, swapped in for Greg during the Polymorph gag */

// (intro cinematic removed from engine ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ lives in src/game/cutscenes.ts
//  and runs through CutsceneDirector. The title sequence chains into it.)

  /**
   * Title card + intro chain cinematic. The scripts live in
   * src/game/cutscenes.ts (playTitleSequence chains into playIntroCutscene
   * via endTitleSequence ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ both are owned by the cutscene module). The
   * director routes skip input and tracks `activeId`. The engine no longer
   * needs to know the scenes' beats.
   */
  public async playTitleSequence() {
    if (!this.cutsceneDirector) return;
    await this.cutsceneDirector.play('title');
  }

  /** a cosy tavern building, seen from the street at night ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ fully voxel-built */

  /** Ease the boss's facing toward a world point (the smooth-facing lerp in the
   *  frame loop does the actual turning; we just set the target yaw). */
  public faceToward(v: UnitVisual, target: THREE.Vector3, snap = false) {
    const d = target.clone().sub(v.rig.group.position); d.y = 0;
    if (d.lengthSq() < 1e-4) return;
    v.targetYaw = Math.atan2(d.x, d.z);
    if (snap) { v.yaw = v.targetYaw; v.rig.group.rotation.y = v.yaw; }
  }

  /** Wade the boss (or any rig) across the floor to a tile over `dur` seconds,
   *  playing the walk cycle. Resolves when he arrives. Drives x/z only ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ the
   *  frame loop leaves an enemy's Y alone in explore, so it stays grounded. */
  public walkRigTo(v: UnitVisual, tile: GridPos, dur: number): Promise<void> {
    return new Promise((resolve) => {
      const from = v.rig.group.position.clone();
      const to = this.unitWorld(tile);
      this.faceToward(v, to);
      v.rig.anim.mode = 'walk';
      let t = 0;
      this.propAnims.push((dt) => {
        t = Math.min(dur, t + dt);
        const k = dur > 0 ? t / dur : 1;
        v.rig.group.position.x = from.x + (to.x - from.x) * k;
        v.rig.group.position.z = from.z + (to.z - from.z) * k;
        if (t >= dur) { v.rig.group.position.copy(to); v.rig.anim.mode = 'idle'; resolve(); return true; }
        return false;
      });
    });
  }

  /** kick a bunch of water droplets up out of the bath for the "erupt" beat */
  public splashBurst(p: THREE.Vector3, count = 26) {
    this.particles.burst({
      pos: p.clone(), count, color: [0x9ecbe0, 0x6fa8c4, 0xd6ecf5, 0x2f5a4a],
      speed: [2.2, 6.5], life: [0.4, 0.9], size: [0.5, 1.4], gravity: 12, up: 3.2, drag: 0.3, endScale: 0.2,
    });
  }

  /** gentle little plink of bathwater while the tyrant soaks */
  public waterPlink(p: THREE.Vector3) {
    this.particles.burst({
      pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.8)),
      count: 5, color: [0x9ecbe0, 0x6fa8c4, 0xd6ecf5], speed: [0.5, 1.8], life: [0.3, 0.7],
      size: [0.3, 0.7], gravity: 9, up: 1.3, drag: 0.4, endScale: 0.3,
    });
  }

  /** a glowing magic bolt that flies from `from` to `to`, trailing sparks */
  public launchMagicMissile(from: THREE.Vector3, to: THREE.Vector3) {
    const orb = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xc89bff }),
    );
    orb.position.copy(from); this.scene.add(orb);
    const dur = 0.42; let t = 0;
    this.propAnims.push((dt: number) => {
      t = Math.min(dur, t + dt);
      const k = t / dur;
      orb.position.lerpVectors(from, to, k);
      this.particles.burst({
        pos: orb.position.clone(), count: 3,
        color: [0x8a4af0, 0xb06af0, 0xe0c0ff], speed: [0.2, 0.9], life: [0.2, 0.45],
        size: [0.14, 0.34], gravity: -0.4, up: 0, drag: 0.92, endScale: 0.1,
      });
      if (t >= dur) { this.scene.remove(orb); orb.geometry.dispose(); return true; }
      return false;
    });
  }

  /** dazed "stars" circling the head ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ little yellow sparkles in a slow ring */
  public spawnStars(p: THREE.Vector3) {
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.4;
      const r = 0.42 + Math.random() * 0.12;
      const vx = Math.cos(a) * 1.4, vz = Math.sin(a) * 1.4, vy = 0.2 + Math.random() * 0.5;
      this.particles.burst({
        pos: p.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 0.2, Math.sin(a) * r)),
        count: 1, color: [0xffe066, 0xfff3b0, 0xffd23a], speed: [0.1, 0.3],
        life: [0.9, 1.5], size: [0.25, 0.5], gravity: -0.6, up: 0, drag: 0.9, endScale: 0.1,
      });
      void vx; void vz; void vy;
    }
  }

  /** walk a loose tavern rig (not a combat UnitVisual) across the floor to `to`,
   *  playing the walk cycle and turning to face the travel direction. */
  public walkRig(rig: Rig, to: THREE.Vector3, dur: number): Promise<void> {
    return new Promise((resolve) => {
      const from = rig.group.position.clone();
      const yaw = Math.atan2(to.x - from.x, to.z - from.z);
      rig.anim.mode = 'walk';
      let t = 0;
      this.propAnims.push((dt: number) => {
        t = Math.min(dur, t + dt);
        const k = dur > 0 ? t / dur : 1;
        rig.group.position.x = from.x + (to.x - from.x) * k;
        rig.group.position.z = from.z + (to.z - from.z) * k;
        let d = yaw - rig.group.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        rig.group.rotation.y += d * Math.min(1, dt * 6);
        if (t >= dur) { rig.group.position.copy(to); rig.anim.mode = 'idle'; resolve(); return true; }
        return false;
      });
    });
  }

  /** barmaid's "another round" bit: step up to Greg's table from the side (never
   *  through it), pause with the tray, then stroll back to her post. */
  public async barmaidServe(bar: Rig) {
    if (this.introSkipped) return;
    this.walkRig(bar, new THREE.Vector3(-1.5, 0, 1.35), 1.5);  // step to the left of Greg's table, clear of it
    await this.cineDelay(1500);
    if (this.introSkipped) return;
    await this.cineDelay(1300);                                // present the tray at the table
    if (this.introSkipped) return;
    this.walkRig(bar, new THREE.Vector3(-2.2, 0, 0.2), 1.5);   // stroll back to her post
    await this.cineDelay(1500);
  }

  /** "passing out" transition: slowly blur the rendered frame and fade to black,
   *  instead of an instant cut. Aborts immediately if the cutscene is skipped,
   *  so the blur doesn't persist into the dungeon after a skip. */
  public passOut(dur: number) {
    const cv = this.renderer.domElement;
    if (this.fadeEl) this.fadeEl.style.transition = 'none';
    const t0 = performance.now();
    const tick = () => {
      if (this.cutsceneSkip) { cv.style.filter = 'none'; return; }  // skip ? clear blur & stop
      const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
      const e = 1 - (1 - k) * (1 - k);                // ease-out
      cv.style.filter = `blur(${(e * 9).toFixed(2)}px)`;
      if (this.fadeEl) this.fadeEl.style.opacity = String(e);
      else this.fadeTo(e);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** persistent ring of "drunk" stars orbiting a passed-out patron's head */
  public spawnDrunkStars(rig: { parts: Record<string, THREE.Object3D>, group: THREE.Object3D }) {
    let ang = 0;
    const tmp = new THREE.Vector3();
    this.propAnims.push((dt: number) => {
      if (!this.tavern) return true;
      ang += dt * 1.6;
      rig.parts.head.getWorldPosition(tmp);
      if (Math.random() < dt * 6) {
        const a = ang + Math.random() * 0.6;
        const r = 0.45 + Math.random() * 0.15;
        const p = tmp.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 0.3, Math.sin(a) * r));
        this.particles.burst({
          pos: p, count: 1, color: [0xffe066, 0xfff3b0, 0xffd23a], speed: [0.1, 0.3],
          life: [0.9, 1.4], size: [0.25, 0.5], gravity: -0.4, up: 0, drag: 0.9, endScale: 0.1,
        });
      }
      return false;
    });
  }

  /**
   * Boss reveal cinematics — Baron Gnaw (Room 5) and Gribnab (Room 25).
   * The scripts live in cutscenes/; these engine methods just route
   * through the director (and let the debug warp key call in).
   */
  public async playBossCutscene() {
    if (!this.cutsceneDirector) return;
    await this.cutsceneDirector.play('gribnab');
  }
  public async playBossRatCutscene() {
    if (!this.cutsceneDirector) return;
    await this.cutsceneDirector.play('boss_rat');
  }
  public async playGribnabCutscene() {
    if (!this.cutsceneDirector) return;
    await this.cutsceneDirector.play('gribnab');
  }

  // -- unit visuals ------------------------------------------

  /** canonical tile→world already used by the world meshes/props (see
   *  VoxelWorld.tileToWorld); every other converter (visuals.unitWorld,
   *  traps tileWorld) must delegate here so they can't drift into a
   *  different offset (the old hardcoded `-60`/`-23` sent Greg running
   *  15 tiles up-right on the first floor click). */
  unitWorld(p: GridPos): THREE.Vector3 {
    const wp = this.world.tileToWorld(p.x, p.z, new THREE.Vector3());
    wp.y += 0.5;
    return wp;
  }

  // Detach a dying unit's held weapon from its rig and let it tumble to the
  // floor on its own, so it lands separately from the ragdolling corpse.

  // Simple gravity + tumble + one small bounce, then the weapon lies flat.

  // -- input -------------------------------------------------

  public onWheel = (e: WheelEvent) => { e.preventDefault(); this.iso.zoom(e.deltaY * 0.012); };
  public onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());

  public byId(id: string) { return this.combat.units.find((u) => u.id === id) ?? null; }

  /**
   * Math-based tile picking: casts the ray from the camera through the
   * mouse pointer against a horizontal plane at the party leader's floor
   * height, then converts the hit point to a tile. This avoids the
   * raycaster hitting wall geometry or the water plane at the wrong height
   * ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ clicking always picks the floor tile the player meant, regardless of
   * how the voxel terrain is meshed.
   */
  /** fog of war: mark tiles within the party leader's vision radius as
   *  explored, and show/hide dark overlay cubes on unexplored walkable
   *  tiles so the player only sees where they've been + a bit ahead. */

  // -- click logic -------------------------------------------

  /** auto-hit smash against a destructible prop with a usable basic damaging skill */

  public setHoverInfoOnce(s: string) { this.hoverInfo = s; this.emitSnapshot(); }

  // -- NPC dialogue -----------------------------------------

  public dialogueChoice(npcId: string, choiceIndex: number) { dialogueChoiceModule(this, npcId, choiceIndex); }

  public hasItemInInventory(baseId: string): boolean {
    return this.inventory.some(i => i.id === baseId || (i as any)._baseId === baseId || (baseId === 'severed_finger' && i.name.includes('Severed Finger')));
  }

  // -- quest log (J key) --------------------------------------
  public toggleQuestLog() {
    if (this.phase === 'menu' || this.showBonfireUI) return;
    this.showQuestLog = !this.showQuestLog;
    this.audio.play('ui_click', 0.5);
    this.emitSnapshot();
  }
  public closeQuestLog() { this.showQuestLog = false; this.emitSnapshot(); }

  // -- HUD API (called from React) ----------------------------
  startGame() {
    void this.audio.init();
    this.audio.resume();
    this.applyAudioSettings();
  if (!this.introPlayed) {
      this.phase = 'menu';     // gated while the intro plays
      this.busy = true;
      void this.playTitleSequence();
      return;
    }
    this.phase = 'explore';
    this.selectedId = this.combat.living('party')[0]?.id ?? null;
    this.pushLog('You descend into the Warlord\'s Warren, torch in hand... (click to move, Q/E rotate, wheel zoom)', 'system');
    this.emitSnapshot();
  }

  /** Called by the HTML splash overlay's "Enter the Dungeon" button.
   *  Resumes audio on the user gesture, then runs the title narration which
   *  continues seamlessly from the tavern-exterior splash into the interior
   *  tavern cutscene. The React splash fades out at the same time. */
  enterDungeon() {
    void this.audio.init();
    this.audio.resume();
    this.applyAudioSettings();
    if (!this.titleExt || !this.cutsceneHost) return;
    const ext = this.titleExt;
    const prevBg = this.titlePrevBg;
    this.titleExt = null;
    this.titlePrevBg = null;
    // FIX 8 (corrected): the React <SplashScreen> overlay is what briefly
    // flashed in front of the cutscene. React removes that overlay from the
    // DOM via `splashVisible=false` in GameCanvas.handleNewGame; the engine
    // cine-fade must be TRANSPARENT here so the exterior tavern scene — the
    // "In a tavern far, far away..." opener — is visible behind it. The
    // previous attempt called fadeTo(1) which blacked the entire exterior
    // and hid it for ~8s until the interior cutscene began.
    this.fadeTo(0);
    void runTitleNarration(this.cutsceneHost, ext, prevBg);
  }

  /** PERFORMANCE (Fix B): full-screen "Quit to Title" path WITHOUT reloading.
   *
   *  Replaces the old window.location.reload() trick in GameCanvas.
   *  Tears down the current floor + dungeon state, then rebuilds the
   *  title scene so the React splash can fade back in over it.
   *
   *  Avoids the ~3-5 s cost of re-parsing the 1.16 MB JS bundle and
   *  re-running the synchronous engine init().
   */
  returnToTitle() {
    // 1. Drop the title-ext if it's still around (rare).
    if (this.titleExt) {
      this.scene.remove(this.titleExt);
      this.titleExt = null;
    }
    if (this.titlePrevBg) {
      this.scene.background = this.titlePrevBg;
      this.titlePrevBg = null;
    }

    // 2. Hide the current floor instead of disposing it — the world is
    //    rebuilt ONLY once at init(); destroying it here would leave the
    //    next New Run without a voxel world (disposeFloor was the culprit:
    //    update()/emitSnapshot read this.world.heights and crashed, and a
    //    fresh run never rebuilt it). Hiding mirrors enterTavern's pattern.
    if (this.world) this.world.group.visible = false;
    if (this.props) this.props.group.visible = false;
    if (this.fogGroup) this.fogGroup.visible = false;
    // dungeon dressing + trap markers stay out of the tavern-exterior view
    if (this.dressingGroup) this.dressingGroup.visible = false;
    if (this.trapManager?.group) this.trapManager.group.visible = false;
    for (const n of this.npcs) if (n.rig?.group) n.rig.group.visible = false;
    for (const [, v] of this.visuals) {
      if (v.rig?.group) v.rig.group.visible = false;
      if (v.proxy) v.proxy.visible = false;
    }
    for (const c of this.enemyCones) c.mesh.visible = false;

    // 3. Reset combat / phase state.
    this.inTavern = false;
    this.introActive = false;
    this.introPlayed = false;
    this.bossCineActive = false;
    this.editorMode = false;
    this.phase = 'menu';
    this.keys.clear();
    this.paused = false;
    if (this.combat) this.combat.inCombat = false;
    this.queue = [];
    this.eventQueue = [];

    // 4. Rebuild the title-exterior backdrop so the splash overlay has
    //    something to fade out over (it expects the same tavern view).
    if (this.cutsceneHost) {
      const title = setupTitleScene(this.cutsceneHost);
      this.titleExt = title.ext;
      this.titlePrevBg = title.prevBg;
      this.titleIdle = true;
    }

    // 5. Notify React so it can show the splash overlay again.
    this.emitSnapshot();
  }

 // -- EDITOR (cutscene / level tweaker ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ Tier 1) --------------------------
 // Builds the tavern set WITHOUT playing the intro director, leaving the
 // IsoCamera + tavernActors idle so the React DebugPanel can drive them
 // live and emit pasteable cutscene one-liners. Activated by `?debug`.
 public editorFocusTarget: THREE.Vector3 | null = null;
 /** true while the cutscene/level editor is active (?debug). The tavern
  *  builder uses this to drop a dummy "Greg" at his intro seat so the
  *  starting position is visible & tunable without playing the intro. */
 public editorMode = false;
 enterEditorMode() {
   void this.audio.init();
   this.applyAudioSettings();
   if (!this.cutsceneHost) return;
   this.editorMode = true;
   // drop the title-exterior backdrop (if any) so we build a clean tavern
   if (this.titleExt) {
     this.scene.remove(this.titleExt);
     if (this.titlePrevBg) { this.scene.background = this.titlePrevBg; this.titlePrevBg = null; }
     this.titleExt = null;
     this.titleIdle = false;
   }
   // ambient tavern set ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ mirror the first lines of playIntroCutscene
   this.inTavern = true;
   this.world.group.visible = false;
   this.props.group.visible = false;
   if (this.dressingGroup) this.dressingGroup.visible = false;
   if (this.trapManager?.group) this.trapManager.group.visible = false;
   for (const n of this.npcs) if (n.rig?.group) n.rig.group.visible = false;
   for (const [, v] of this.visuals) v.rig.group.visible = false;
   this.tavern = this._buildTavern();
   this.scene.add(this.tavern);
   this.scene.fog = new THREE.Fog(0x140d08, 6, 26);
   // idle framing over Greg's table (poi is attached by _buildTavern)
   const poi = (this.tavern.userData as { poi?: Record<string, THREE.Vector3> }).poi;
   if (poi?.gregHead) {
     this.iso.lerp = 2.0;
     this.iso.desiredYaw = -Math.PI * 0.22;
     this.iso.desiredPitch = 0.44;
     this.iso.desiredDist = 5.4;
     this.iso.focus(poi.gregHead);
   } else {
     // fallback framing if the tavern didn't expose a poi map
     this.iso.lerp = 2.0;
     this.iso.desiredYaw = -Math.PI * 0.22;
     this.iso.desiredPitch = 0.44;
     this.iso.desiredDist = 5.4;
     this.iso.focus(new THREE.Vector3(0, 1, 1.1));
   }
   this.busy = false;             // never block input/aggro in editor mode
   this.introActive = false;
   this.emitSnapshot();
 }

 /** hand the React DebugPanel live references it can read/write. */
 getEditorHandles() {
   if (!this.editorFocusTarget) this.editorFocusTarget = new THREE.Vector3(0, 1, 0);
   return {
     iso: this.iso,
     tavern: this.tavern,
     tavernActors: this.tavernActors,
     tavernRigs: this.tavernRigs,
     focusTarget: this.editorFocusTarget,
     buildTavern: () => this._buildTavern(),
     swapTavern: (g: THREE.Group) => {
       if (this.tavern) this.scene.remove(this.tavern);
       this.tavern = g;
       this.scene.add(g);
       this.tavernRigs = (g.userData as { rigs?: Rig[] }).rigs ?? [];
     },
   };
 }

 selectSkill(skillId: string | null) {
    const active = this.combat.active;
    if (!active || active.team !== 'party' || this.busy) return;
    if (!skillId) { this.cancelTargeting(); return; }
    if (!this.combat?.inCombat) {
      this.setHoverInfoOnce('Skills can only be used in combat.');
      return;
    }
    const s = SKILLS[skillId] ?? ALL_CLASS_SKILLS[skillId];
    if (!s) { this.setHoverInfoOnce('Unknown skill.'); return; }
    const deny = this.combat.canUse(active, s);
    if (deny) { this.setHoverInfoOnce(deny); return; }
    this.audio.play('ui_click', 0.6);
    // instant-cast kinds: self-centered novas, self-casts, party-wide buffs/heals.
    // Ally-targeted buffs (encore, rehearsal, vow, refill) need aiming mode
    // so they refuse to cast on the caster's own tile.
    if ((s.kind === 'buff' && !s.targetsAllies) || s.selfCentered || s.selfOnly || s.allAllies) {
      this.audio.play('dice', 0.7);
      this.enqueue(this.combat.useSkill(active, s.id, active.pos));
      return;
    }
    this.targeting = skillId;
    this.showTargeting(s, active);
    this.emitSnapshot();
  }

  endTurn() {
    // trust combat.inCombat (authoritative) over engine.phase — a stray
    // phase mirror can desync while a fight is live (intro tail, endEarly)
    if (!this.combat?.inCombat || this.busy) return;
    const a = this.combat.active;
    if (!a || a.team !== 'party') return;
    this.audio.play('ui_click', 0.7);
    this.targeting = null;
    this.clearHighlights();
    this.enqueue(this.combat.endTurn());
  }

  continueAfterVictory() {
    this.phase = 'explore';
    this.pushLog('The shrine falls quiet. The realm is yours to wander.', 'system');
    this.emitSnapshot();
  }

  toggleMute() {
    const m = this.audio.toggleMute();
    this.settings.muted = m;
    SettingsManager.save(this.settings);
    this.emitSnapshot();
    return m;
  }

  // -- save / load (multi-slot) -----------------------------
  getSettings(): GameSettings { return { ...this.settings }; }

  setSettings(s: GameSettings) {
    this.settings = { ...s };
    SettingsManager.save(this.settings);
    this.applyAudioSettings();
    this.emitSnapshot();
  }

  public applyAudioSettings() {
    this.audio.applySettings(this.settings);
  }

  // -- pause (in-game menu) ----------------------------------
  /** freeze / resume the simulation (the pause menu is rendered by React
   *  from the `paused` flag in the UISnapshot) */
  setPaused(b: boolean) {
    if (this.paused === b) return;
    this.paused = b;
    if (b) this.keys.clear();   // release any held movement keys
    this.emitSnapshot();
  }

  /** flip the pause flag (Esc key / pause menu) */
  togglePause() {
    this.setPaused(!this.paused);
  }

  /** list occupied slots (newest first) for the Load / New-Game UI */
  listSlots(): SaveSlotMeta[] { return SaveManager.listSlots(); }

  /** metadata for a specific slot (or null if empty) */
  getSlotMeta(slotId: string): SaveSlotMeta | null { return SaveManager.getMeta(slotId); }

  /** number of independent save slots */
  get maxSlots(): number { return SaveManager.MAX_SLOTS; }

  hasSave(slotId: string): boolean { return SaveManager.has(slotId); }

  deleteSlot(slotId: string) {
    SaveManager.delete(slotId);
    if (this.currentSlotId === slotId) this.currentSlotId = null;
  }

  /** start a brand-new playthrough in the given slot, then play the intro */
  startNewGame(slotId: string) {
    this.currentSlotId = slotId;
    // fresh run seed → fresh trap tiles / poison bottles / spawn jitter
    this.runSeed = (Math.floor(Date.now() / 1000) ^ 0x5eed ^ Math.floor(Math.random() * 0xffff)) >>> 0;
    this.flags = new Set();
    this.torchFuel = 100;
    this.gold = 0;
    this.inventory = [];
    this.questLog = new QuestLog();
    this.defeatedSpecialMobs = new Set();
    this.gameWon = false;
    this.runStats = { kills: 0, deaths: 0, questsDone: 0, secretsFound: 0, startedAt: Date.now() };
    this.explored = this.explored.map((row) => row.map(() => false));
    this.fogDirty = true;
    this.hazardUsed = new Set();

    // clear dressing from the previous run (doors, blockers, rubble, NPCs)
    for (const d of this.doorMeshes) if (d.mesh.parent) d.mesh.parent.remove(d.mesh);
    for (const b of this.blockerMeshes) if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
    for (const r of this.rubbleMeshes) if (r.mesh.parent) r.mesh.parent.remove(r.mesh);
    for (const n of this.npcs) {
      if (n.rig?.group?.parent) n.rig.group.parent.remove(n.rig.group);
      if (n.proxy?.parent) n.proxy.parent.remove(n.proxy);
    }
    this.doorMeshes = [];
    this.blockerMeshes = [];
    this.rubbleMeshes = [];
    this.npcs = [];
    this.ironDoor = null;
    this.ironDoorOpen = false;
    this.secretOpen = false;
    this.secretChestOpen = false;
    this.goldenChestOpen = false;
    this.bossCutscenePlayed = false;
    this.bossRatCutscenePlayed = false;
    this.gribnabCutscenePlayed = false;
    // rebuild seed-dependent state on the SAME world
    this.clearUnitVisuals();
    this.combat.units = [];
    // drop any starting bags from the previous run (setupDungeon re-places one)
    for (const p of [...this.props.list]) if (p.def.id === 'starting') this.props.destroy(p);
    this.spawnUnits();
    const L = levelForFloor(this.floorNumber);
    const trapSpots = typeof L.traps === 'function'
      ? L.traps(this.runSeed).map((t) => [t.defId, t.x, t.z] as [string, number, number])
      : (L.traps ?? []).map((t) => [t.defId, t.x, t.z] as [string, number, number]);
    this.trapManager.init(trapSpots);
    this.setupDungeon(L);

    // in-session restart: the tavern/title backdrop was consumed on the first
    // run — rebuild it so the wake intro can play again, then drop into it
    if (this.titleExt) { this.scene.remove(this.titleExt); this.titleExt = null; }
    if (this.titlePrevBg) { this.scene.background = this.titlePrevBg; this.titlePrevBg = null; }
    this.inTavern = false;
    this.introActive = false;
    this.introPlayed = false;
    this.introSkipped = false;
    this.bossCineActive = false;
    this.phase = 'menu';
    this.keys.clear();
    this.paused = false;
    this.combat.inCombat = false;
    this.queue = [];
    this.eventQueue = [];
    // NOTE: the dungeon world stays HIDDEN here (it was hidden by
    // returnToTitle) — the intro cutscene reveals it when Greg wakes up
    // (cutscenes/intro.ts). Showing it now would put the gray walls next
    // to the tavern during the title narration.
    if (this.cutsceneHost) {
      const title = setupTitleScene(this.cutsceneHost);
      this.titleExt = title.ext;
      this.titlePrevBg = title.prevBg;
      this.titleIdle = true;
    }
    this.enterDungeon();
  }

  /** remove every unit rig/proxy/bar from the scene (fresh-run reset) */
  private clearUnitVisuals() {
    for (const [, v] of this.visuals) {
      if (v.rig.group.parent) v.rig.group.parent.remove(v.rig.group);
      if (v.proxy.parent) v.proxy.parent.remove(v.proxy);
      if (v.bar.parentElement) v.bar.parentElement.removeChild(v.bar);
    }
    this.visuals.clear();
    this.unitProxies = [];
    this.droppedWeapons = [];
  }

  /** capture the current state into the active (or given) slot */
  saveGame(slotId?: string, label?: string) {
    const id = slotId ?? this.currentSlotId;
    if (!id) return;
    const data: SaveData = {
      version: SAVE_VERSION_NUMBER,
      slotId: id,
      name: label ?? this.partyName(),
      timestamp: Date.now(),
      floor: this.floorNumber,
      floorName: FLOORS[this.floorNumber]?.name ?? 'Unknown',
      units: this.combat.units.map((u) => this.clone(u)),
      gold: this.gold,
      inventory: this.inventory.map((i) => this.clone(i)),
      questStates: this.questLog.statesEntries(),
      bonfirePos: this.bonfirePos ? { ...this.bonfirePos } : null,
      bonfireLit: this.bonfireLit,
      defeatedSpecialMobs: [...this.defeatedSpecialMobs],
      explored: this.explored.map((r) => [...r]),
      combat: {
        turnOrder: [...this.combat.turnOrder],
        activeIdx: this.combat.activeIdx,
        round: this.combat.round,
        inCombat: this.combat.inCombat,
        phase: this.combat.phase,
      },
      selectedId: this.selectedId,
      phase: this.phase,
      // floor-50 run state
      flags: [...this.flags],
      torchFuel: this.torchFuel,
      runSeed: this.runSeed,
      runStats: { ...this.runStats },
    };
    SaveManager.save(id, data);
    this.pushLog('?? Game saved.', 'system');
    this.bigMessage = 'Game Saved';
    this.emitSnapshot();
    setTimeout(() => {
      if (this.bigMessage === 'Game Saved') { this.bigMessage = null; this.emitSnapshot(); }
    }, 1500);
  }

  /** restore a playthrough from a slot and drop straight into explore */
  loadGame(slotId: string): boolean {
    const data = SaveManager.load(slotId);
    if (!data) return false;
    this.currentSlotId = slotId;

    // -- tear down the title backdrop if it's still up --
    if (this.titleExt) { this.scene.remove(this.titleExt); this.titleExt = null; }
    if (this.titlePrevBg) { this.scene.background = this.titlePrevBg; this.titlePrevBg = null; }
    if (this.tavern) { this.scene.remove(this.tavern); this.tavern = null; }
    this.titleIdle = false;

    // -- restore state --
    this.combat.units = data.units.map((u) => this.clone(u));
    this.gold = data.gold;
    this.inventory = data.inventory.map((i) => this.clone(i));
    this.questLog.load(data.questStates);
    this.bonfirePos = data.bonfirePos ? { ...data.bonfirePos } : null;
    this.bonfireLit = data.bonfireLit;
    this.defeatedSpecialMobs = new Set(data.defeatedSpecialMobs);
    // floor-50 run state
    if (data.flags) this.flags = new Set(data.flags);
    if (typeof data.torchFuel === 'number') this.torchFuel = data.torchFuel;
    if (data.runSeed) this.runSeed = data.runSeed;
    if (data.runStats) this.runStats = { ...this.runStats, ...data.runStats };
    this.floorNumber = data.floor ?? START_FLOOR;
    // hazard state is per-fight — reset on load
    this.hazardUsed = new Set();
    this.hazardTiles = new Set();
    this.hazardKind = new Map();
    this.explored = data.explored.map((r) => [...r]);
    this.combat.turnOrder = [...data.combat.turnOrder];
    this.combat.activeIdx = data.combat.activeIdx;
    this.combat.round = data.combat.round;
    this.combat.inCombat = data.combat.inCombat;
    this.combat.phase = data.combat.phase;
    this.selectedId = data.selectedId;
    this.phase = data.phase;

    // -- reveal the dungeon + reposition every rig --
    this.world.group.visible = true;
    this.props.group.visible = true;
    if (this.dressingGroup) this.dressingGroup.visible = true;
    if (this.trapManager?.group) this.trapManager.group.visible = true;
    for (const n of this.npcs) if (n.rig?.group) n.rig.group.visible = true;
    this.repositionAllVisuals();
    if (this.bonfireLit) this.spawnBonfireFlame();

    // -- camera / audio / flags --
    this.introPlayed = true;
    this.introActive = false;
    this.introSkipped = false;
    this.inTavern = false;
    this.busy = false;
    this.cinematic = false;
    this.clearCine();
    this.fadeTo(0);
    this.iso.lerp = 7;
    void this.audio.init();
    this.audio.resume();
    this.applyAudioSettings();
    this.audio.stopTavernMusic();
    this.audio.playMusic('music_ambient');

    // -- hero rig + camera focus --
    const hero = this.combat.living('party')[0];
    if (hero) {
      const hv = this.visuals.get(hero.id);
      if (hv) {
        hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 0;
        hv.rig.group.rotation.set(0, Math.PI, 0);
        hv.yaw = hv.targetYaw = Math.PI;
        if (hero.weapon) setWeapon(hv.rig, hero.weapon, hero.scheme.accent);
        if (!this.heroLight) this.attachHeroTorch(hv.rig);
      }
      // clear the title-scene camera clamp (iso.box) and snap straight to the
      // hero so the camera follows the player instead of sitting clamped in the
      // tiny tavern region
      this.iso.box = null;
      const hp = this.unitWorld(hero.pos);
      this.iso.focus(hp);
      this.iso.target.copy(hp);
    }
    this.selectedId = this.selectedId ?? hero?.id ?? null;

    this.pushLog('🎉 Save loaded — welcome back, adventurer.', 'system');
    this.emitSnapshot();
    return true;
  }

  /** deep-clone plain serializable data (units/items are JSON-safe) */
  public clone<T>(x: T): T {
    return JSON.parse(JSON.stringify(x)) as T;
  }

  public partyName(): string {
    const leader = this.combat.living('party')[0];
    return leader ? leader.name : 'Adventurer';
  }

  /** snap every rig to its unit's saved tile + visibility/anim state */
  public repositionAllVisuals() {
    for (const [id, v] of this.visuals) {
      const u = this.byId(id);
      if (!u) continue;
      const wp = this.unitWorld(u.pos);
      v.rig.group.position.copy(wp);
      v.rig.group.userData.baseY = wp.y;
      v.rig.group.visible = true;
      v.rig.anim.mode = u.alive ? 'idle' : 'dead';
      v.rig.anim.t = 0;
      v.yaw = v.targetYaw = u.team === 'party' ? Math.PI : 0;
      v.rig.group.rotation.y = v.yaw;
      v.bar.style.display = u.alive ? 'block' : 'none';
    }
  }

  /** (re)create the bonfire flame + glow light (idempotent) */

  /** called by the intro cutscene once it finishes. NO save happens here — the
   *  first save is written only when the player interacts with the bonfire
   *  (lightBonfire / restAtBonfire). */
  onIntroComplete() {
    // intentionally no save on spawn
  }

  // -- character creation -------------------------------------
  /** flip into the creation phase and return a promise released on confirm. */
  requestCreation(): Promise<void> {
    this.phase = 'creation';
    this.busy = true;
    this.cinematic = true;
    this.emitSnapshot();
    return new Promise<void>((resolve) => {
      this.creationResolver = resolve;
    });
  }

  /** release the pending creation promise (called internally by confirm). */
  resolveCreation() {
    if (this.creationResolver) {
      this.creationResolver();
      this.creationResolver = null;
    }
  }

  /** apply the confirmed character build to Greg (called by the React overlay). */
  confirmCharacterCreation(build: CharacterBuild) {
    const hero = this.combat.units.find((u) => u.team === 'party');
    if (hero) {
      hero.classes = [...build.classes];
      hero.abilities = { ...build.abilities };
      hero.allocatedStats = {};
      // Fresh start: the hero begins at level 1 with zero XP. The roster
      // template ships a higher level/maxHp (meant for the old instant-dungeon
      // path) — creation resets all progression so the stats window shows
      // Lv1 / 0 XP and leveling happens through combat + the bonfire.
      hero.level = 1;
      hero.xp = 0;
      hero.skillPoints = 0;
      hero.maxHp = 24;
      hero.hp = 24;
      // Level-gated knowledge: at Lv1 the hero only knows the 2 skills they
      // picked during creation. The rest of the class pool is hydrated into
      // knownSkills by levelUpAtBonfire / awardXP (tier-1 at Lv2, tier-2 at
      // Lv3, tier-3+ at Lv4) — that membership is what gates the loadout.
      // Skill-tree unlocks add more as the hero spends points.
      hero.knownSkills = [...build.skills];
      hero.equippedSkills = [...build.skills];
      hero.hotbarLoadout = [...build.hotbarLoadout];
    }
    this.creationBuild = build;
    this.audio.play('dice', 0.7);
    // Drop out of the 'creation' phase immediately so the React creation overlay
    // unmounts and the intro's get-up animation is visible. `busy` stays true
    // (set in requestCreation) so floor clicks / input remain blocked until
    // finishIntro releases them — the player watches Greg stand up, then gets
    // control.
    this.phase = 'explore';
    this.resolveCreation();
    this.emitSnapshot();
  }

  /**
   * Play a class's narrator summary (class_<id>.mp3) during character creation.
   * Fire-and-forget audio — no subtitle, no blocking. Used when the player
   * clicks a class card in the creation browser.
   */
  playClassNarration(classId: string) {
    try {
      const a = new Audio(`${import.meta.env.BASE_URL}audio/narration/class_${classId}.mp3`);
      a.volume = 1;
      a.play().catch(() => {});
    } catch { /* asset missing → silently ignore */ }
  }

  // -- sneak (called from React HUD) --------------------------
  toggleSneak() {
    if (this.phase !== 'explore' || this.combat.inCombat) return;
    this.sneaking = !this.sneaking;
    this.audio.play('ui_click', 0.5);
    if (this.sneaking) this.pushLog('The party spreads out and moves silently...', 'system');
    else this.pushLog('The party resumes a normal pace.', 'system');
    this.emitSnapshot();
  }

  /** jump-mode: the next tile click is a hop (budget-2 move, costs movement) */
  public jumpMode = false;

  /** BG3-style turn phase ring (walk → action → bonus → end turn) */
  setTurnMode(m: 'walk' | 'action' | 'bonus') {
    if (this.combat.turnMode !== m) {
      this.combat.turnMode = m;
      this.audio.play('ui_click', 0.5);
    }
    this.emitSnapshot();
  }

  /** snap the tactical camera back onto the player (active combat unit, else
   *  the selected/leader party member). The camera otherwise only re-centers
   *  on movement clicks, so this is the explicit "find me" button. */
  recenterCamera() {
    const u = this.combat.inCombat
      ? this.combat.active
      : (this.byId(this.selectedId ?? '') ?? this.combat.living('party')[0]);
    if (!u) return;
    const wp = this.unitWorld(u.pos);
    this.iso.focus(wp);
    this.iso.desiredTarget?.copy(wp);
    this.iso.target.copy(wp);
    this.audio.play('ui_click', 0.5);
    this.emitSnapshot();
  }

  /** true while the overhead tactical view is active (top-down on the field) */
  public tacticalView = false;
  private tacticalRestore: { pitch: number; dist: number } | null = null;

  /** the midpoint of the CURRENT fight (aggroed enemies + party), else the
   *  leader. Scoped so dormant enemies elsewhere in the dungeon don't drag the
   *  top-down view away from the actual battlefield. */
  private battleCenter(): GridPos {
    const party = this.combat.living('party');
    const foes = this.combat.inCombat ? this.combat.activeEnemies() : [];
    const living = [...party, ...foes].filter((u) => u.alive);
    if (living.length >= 2) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const u of living) {
        minX = Math.min(minX, u.pos.x); maxX = Math.max(maxX, u.pos.x);
        minZ = Math.min(minZ, u.pos.z); maxZ = Math.max(maxZ, u.pos.z);
      }
      return { x: (minX + maxX) >> 1, z: (minZ + maxZ) >> 1 };
    }
    const u = this.combat.inCombat ? this.combat.active : (this.byId(this.selectedId ?? '') ?? party[0]);
    return u ? { ...u.pos } : { x: 0, z: 0 };
  }

  /** toggle the overhead "tactical view": straight down on the battlefield.
   *  Restores the previous pitch/distance when toggled off. */
  toggleTacticalView() {
    this.tacticalView = !this.tacticalView;
    this.audio.play('ui_click', 0.5);
    const wp = this.unitWorld(this.battleCenter());
    if (this.tacticalView) {
      this.tacticalRestore = { pitch: this.iso.desiredPitch, dist: this.iso.desiredDist };
      this.iso.desiredYaw = this.iso.yaw;      // keep facing — the pitch does the drop
      this.iso.desiredPitch = Math.PI / 2;     // 90° — straight down
      this.iso.desiredDist = 30;               // pull back so the whole field fits
    } else {
      if (this.tacticalRestore) {
        this.iso.desiredPitch = this.tacticalRestore.pitch;
        this.iso.desiredDist = this.tacticalRestore.dist;
      }
      this.tacticalRestore = null;
      this.recenterCamera();
      return;
    }
    this.iso.focus(wp);
    this.iso.desiredTarget?.copy(wp);
    this.iso.target.copy(wp);
    this.pushLog(this.tacticalView ? '🗺 Tactical view — overhead on the field.' : 'Camera restored.', 'system');
    this.emitSnapshot();
  }

  /** toggle the first-person camera (P) — rides on the hero's head */
  toggleFirstPerson() {
    this.firstPerson = !this.firstPerson;
    if (this.firstPerson) {
      this.fpYaw = this.pickFpEntryYaw();
      this.fpPitch = -0.08;
      this.fpStepAt = 0;
      hidePathPreview(this);
      this.hoverPathKey = '';
      // grab the mouse immediately — clicking first is a needless extra step
      try {
        const el = this.renderer.domElement as HTMLCanvasElement;
        if (document.pointerLockElement !== el) {
          const p = el.requestPointerLock?.() as unknown as Promise<void> | undefined;
          p?.catch?.(() => { /* drag-look fallback still works */ });
        }
      } catch { /* pointer lock unavailable */ }
    } else {
      this.exitFirstPerson();
    }
    this.audio.play('ui_click', 0.5);
    this.pushLog(this.firstPerson ? '🎥 First person. Mouse looks · W/S walk · A/D strafe · Q/E turn · P/Esc exits.' : '🎥 Back to the isometric view.', 'system');
    this.emitSnapshot();
  }

  /** leave first person: release the mouse, restore the hero model BY ID,
   *  and glide the iso camera back to the party — never lose the model. */
  public exitFirstPerson() {
    if (document.pointerLockElement === this.renderer.domElement) {
      try { document.exitPointerLock?.(); } catch { /* noop */ }
    }
    this.fpDrag = false;
    if (this.fpHiddenId) {
      const fv = this.visuals.get(this.fpHiddenId);
      if (fv) { fv.rig.group.visible = true; fv.proxy.visible = true; }
      this.fpHiddenId = null;
    }
    const hero = this.combat?.living('party')[0];
    if (hero) {
      this.iso.focus(this.unitWorld(hero.pos));
      // face the iso camera roughly where the player was looking (45° steps)
      this.iso.desiredYaw = Math.round(this.fpYaw / (Math.PI / 4)) * (Math.PI / 4);
      // restore the FULL tactical orbit and snap instantly — FP (and any
      // cinematic before it) may have left pitch/dist anywhere; even the
      // first rendered frame after the toggle must show a sane 55° orbit
      this.iso.desiredPitch = 0.96;
      this.iso.pitch = 0.96;
      this.iso.desiredDist = THREE.MathUtils.clamp(this.iso.desiredDist, 8, 30);
      this.iso.dist = this.iso.desiredDist;
      this.iso.target.copy(this.iso.desiredTarget);
      this.iso.yaw = this.iso.desiredYaw;
    }
    if (this.fpLight) this.fpLight.visible = false;
  }

  /** pick the FP entry facing: the direction with the most open floor, so
   *  the player never toggles into FP staring into a wall (ties → the
   *  direction closest to the current iso camera yaw). */
  private pickFpEntryYaw(): number {
    const hero = this.combat?.living('party')[0];
    if (!hero) return this.iso.yaw;
    let bestYaw = this.iso.yaw;
    let bestScore = -1;
    for (let i = 0; i < 16; i++) {
      const yaw = (i / 16) * Math.PI * 2;
      const dx = Math.round(Math.sin(yaw)), dz = Math.round(Math.cos(yaw));
      if (!dx && !dz) continue;
      let open = 0;
      for (let s = 1; s <= 6; s++) {
        const tx = hero.pos.x + dx * s, tz = hero.pos.z + dz * s;
        if (!this.world.isWalkable(tx, tz)) break;
        open++;
      }
      const alignment = 1 - Math.abs(((yaw - this.iso.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / Math.PI;
      const score = open * 2 + alignment;
      if (score > bestScore) { bestScore = score; bestYaw = yaw; }
    }
    return bestYaw;
  }

  /** 'T' — equip a torch into the hero's hand, or switch back to the weapon
   *  he held before. The torch never burns out (no fuel timer). */
  toggleTorch() {
    const hero = this.combat?.living('party')[0];
    const rig = hero ? this.visuals.get(hero.id)?.rig : null;
    if (!hero) return;
    if (hero.weapon === 'torch') {
      const prev = this.heroPrevWeapon ?? 'unarmed';
      hero.weapon = prev as typeof hero.weapon;
      this.torchLit = false;
      if (rig) setWeapon(rig, prev as any, hero.scheme.accent);
      this.pushLog('🔦 You stow the torch and take up what you held before.', 'system');
    } else {
      this.heroPrevWeapon = hero.weapon ?? null;
      hero.weapon = 'torch' as typeof hero.weapon;
      this.torchLit = true;
      if (rig) setWeapon(rig, 'torch', hero.scheme.accent);
      this.pushLog('🔦 You raise a torch — the flame never gutters out.', 'system');
    }
    this.audio.play('ui_click', 0.4);
    this.emitSnapshot();
  }

  /** BG3-style default hotbar actions: walk/run/jump/throw/attack + bonus attack. */
  defaultAction(action: 'walk' | 'run' | 'jump' | 'throw' | 'attack' | 'bonusAttack') {
    this.audio.play('ui_click', 0.5);
    switch (action) {
      case 'walk':
        this.sneaking = false;
        this.running = false;
        this.pushLog('Walking pace.', 'system');
        break;
      case 'run':
        this.running = !this.running;
        this.sneaking = false;
        this.pushLog(this.running ? 'Running!' : 'Walking.', 'system');
        break;
      case 'jump': {
        // jump-mode: the next tile click is a hop (2 tiles max, costs movement
        // in combat). In explore it's a free little hop.
        this.jumpMode = !this.jumpMode;
        this.pushLog(this.jumpMode ? 'Select a tile to jump to (2 tiles max).' : 'Jump cancelled.', 'system');
        this.emitSnapshot();
        break;
      }
      case 'throw':
        if (this.phase !== 'explore') { this.setHoverInfoOnce('Throwing is an exploration action.'); return; }
        this.throwing = !this.throwing;
        this.pushLog(this.throwing ? 'Select a tile to throw something at it.' : 'Throwing cancelled.', 'system');
        break;
      case 'attack': {
        const a = this.combat.active;
        if (a && a.team === 'party' && this.phase === 'combat') {
          // backstab / surprise attack: attacking while sneaking (C mode)
          // is a guaranteed critical — see the sneakCrit path in combat.ts
          if (this.sneaking) {
            a.sneak = true;
            this.setHoverInfoOnce('Backstab! Striking from the shadows — guaranteed critical!');
          }
          // the universal 'attack' is always an option — utility-only builds
          // can still swing their weapon
          const first = [...a.equippedSkills, 'attack'].find((id) => {
            const s = SKILLS[id]; return s && s.damageDice && !s.targetsAllies && !s.selfCentered && s.aoeRadius === 0;
          });
          if (first) { this.selectSkill(first); return; }
        }
        this.setHoverInfoOnce('No basic attack available.');
        return;
      }
      case 'bonusAttack': {
        // 2nd attack per round: a quick BONUS-action weapon strike — every
        // hero gets one basic attack (action) plus this bonus attack per turn.
        const a = this.combat.active;
        if (a && a.team === 'party' && this.phase === 'combat' && a.hasBonus) {
          if (!a.knownSkills.includes('quick_strike')) a.knownSkills.push('quick_strike');
          if (!a.equippedSkills.includes('quick_strike')) a.equippedSkills.push('quick_strike');
          this.selectSkill('quick_strike');
          return;
        }
        this.setHoverInfoOnce('Bonus attack unavailable — needs a bonus action in combat.');
        return;
      }
    }
    this.emitSnapshot();
  }

  closeDialogue() { this.showDialogue = null; this.stopDialogueVo(); this.emitSnapshot(); }

  private dialogueVoToken = 0;

  /** Speak an NPC node's voice-over — `audio/npc/<npcId>_<nodeId>.mp3`, with
   *  an optional `<nodeId>_cap.mp3` intro-flavor line first (missing assets
   *  degrade to text-only dialogue). A newer call supersedes an older one,
   *  so clicking through a conversation never stacks voices. */
  public speakDialogue(npcId: string, nodeId: string) {
    const token = ++this.dialogueVoToken;
    const base = `${import.meta.env.BASE_URL}audio/npc/${npcId}_${nodeId}`;
    void (async () => {
      for (const url of [`${base}_cap.mp3`, `${base}.mp3`]) {
        if (token !== this.dialogueVoToken) return;
        let a: HTMLAudioElement;
        try { a = new Audio(url); } catch { return; }
        const dur = await new Promise<number>((resolve) => {
          a.onloadedmetadata = () => resolve((a.duration ?? 0) * 1000);
          a.onerror = () => resolve(0);
          setTimeout(() => resolve((a.duration ?? 0) * 1000), 1500);
        });
        if (dur <= 0) continue;
        try { await a.play().catch(() => {}); } catch { continue; }
        await new Promise<void>((r) => setTimeout(r, Math.min(dur + 150, 30000)));
      }
    })();
  }

  /** Cancel any in-flight dialogue voice-over (conversation closed/skipped). */
  public stopDialogueVo() {
    this.dialogueVoToken++;
  }

  // -- hotbar loadout (bonfire-only) --------------------------
  /** toggle the bonfire loadout editor (only usable while resting). */
  toggleBonfireLoadout() {
    if (!this.restingAtBonfire) { this.setHoverInfoOnce('You can only rearrange your skills while resting at a bonfire.'); return; }
    this.showBonfireLoadout = !this.showBonfireLoadout;
    this.audio.play('ui_click', 0.5);
    this.emitSnapshot();
  }
  /** replace the party leader's 12-slot hotbar loadout. */
  setHotbarLoadout(loadout: (string | null)[]) {
    const hero = this.combat.units.find((u) => u.team === 'party');
    if (!hero) return;
    // Defense in depth: only skills the hero actually knows may be slotted.
    // knownSkills is the level gate — creation picks enter at Lv1, the class
    // pool hydrates on level-up (tier-1 → Lv2, tier-2 → Lv3, tier-3+ → Lv4),
    // and the skill tree adds more. A skill can never be equipped before it
    // is known (item 2).
    const cleaned = loadout.slice(0, 12).map((id) => {
      if (!id) return null;
      if (!hero.knownSkills.includes(id)) return null;
      return id;
    });
    hero.hotbarLoadout = cleaned;
    hero.equippedSkills = cleaned.filter((x): x is string => !!x);
    this.audio.play('ui_click', 0.5);
    this.emitSnapshot();
  }

  lightBonfire() {
    if (!this.bonfireGroup || this.bonfireLit) return;
    this.bonfireLit = true;
    this.bonfirePos = this.structures?.checkpoint ? { ...this.structures.checkpoint } : { x: 10, z: 10 };
    this.spawnBonfireFlame();
    this.pushLog('The bonfire roars to life. This place feels safer now...', 'system');
    this.audio.play('ui_click', 0.6);
    this.audio.play('bonfire_lit', 1.0); // placeholder: add lit_bonfire.wav to public/audio/
    this.bigMessage = 'Bonfire Lit!';
    this.emitSnapshot();
    setTimeout(() => { this.bigMessage = null; this.emitSnapshot(); }, 2500);
    // auto-save to the active slot the moment a checkpoint is established
    this.saveGame(this.currentSlotId ?? undefined, 'Bonfire Lit');
  }

  restAtBonfire() {
    if (!this.bonfireLit || !this.bonfirePos) return;
    this.audio.play('heal', 0.9);
    this.restingAtBonfire = true;

    for (const u of this.combat.living('party')) {
      u.hp = effMaxHp(u);
      u.conditions = [];
      (u as any).restedAtBonfire = true;
    }

    for (const u of this.combat.units) {
      if (!u.alive && u.team === 'enemy' && !u.bossGroup && u.name !== 'Baron Gnaw') {
        if (this.defeatedSpecialMobs.has(u.id)) continue;
        u.alive = true;
        u.hp = u.maxHp;
        (u as any).dormant = true;
        u.conditions = [];
        const v = this.visuals.get(u.id);
        if (v) {
          v.rig.anim.mode = 'idle';
          v.rig.anim.t = 0;
          v.bar.style.display = '';
          (v as any).dustDone = false;
        }
      }
    }

    this.props.resetAll();

    this.showBonfireUI = true;
    this.pushLog('?? You rest at the bonfire. Your wounds close. The dungeon stirs...', 'system');
    this.pushLog('Spend your XP here to level up, or change your skill loadout.', 'system');
    this.bigMessage = 'Bonfire Rest';
    this.emitSnapshot();
    setTimeout(() => { this.bigMessage = null; this.emitSnapshot(); }, 2000);
    // resting re-establishes the checkpoint ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ keep the slot current
    this.saveGame(this.currentSlotId ?? undefined, 'Rested');
  }

  closeBonfireUI() {
    this.showBonfireUI = false;
    this.restingAtBonfire = false;
    this.emitSnapshot();
  }

  levelUpAtBonfire(unitId: string) {
    const u = this.byId(unitId);
    if (!u || u.team !== 'party' || !this.restingAtBonfire) return;
    if (u.level >= 5) { this.setHoverInfoOnce('Already at maximum level.'); return; }
    const threshold = u.level === 3 ? 300 : u.level === 4 ? 650 : 9999;
    if (u.xp < threshold) { this.setHoverInfoOnce(`Need ${threshold} XP to level up (have ${u.xp}).`); return; }
    u.xp -= threshold;
    u.level++;
    // hydrate the class pool: skills the hero has now reached the level for
    // become known (tier-1 at Lv2, tier-2 at Lv3, tier-3+ at Lv4)
    for (const sid of classPoolSkillIdsForLevel(u.classes ?? [], u.level)) {
      if (!u.knownSkills.includes(sid)) u.knownSkills.push(sid);
    }
    u.maxHp += 6;
    u.hp = Math.min(effMaxHp(u), u.hp + 6);
    u.skillPoints += 1;
    this.audio.play('heal', 0.9, 1.3);
    this.pushLog(`? ${u.name} reaches level ${u.level}! (+6 max HP, +1 skill point). You feel slightly less drunk.`, 'system');
    FX.levelup(this.particles, this.unitWorld(u.pos).add(new THREE.Vector3(0, 0.6, 0)));
    this.emitSnapshot();
  }

  respawn() {
    respawnModule(this);
    // camping.respawn handles the full logic (including reviving dead party).
    // This engine method delegates so both the inline and module paths agree.
  }

  // -- inventory / equipment (called from React HUD) ---------
  toggleInventory() {
    this.showInventory = !this.showInventory;
    if (this.showInventory) this.showStats = false;   // only one overlay at a time
    this.audio.play('ui_click', 0.6);
    this.emitSnapshot();
  }

  /** toggle the detailed character-stats panel. */
  toggleStats() {
    this.showStats = !this.showStats;
    if (this.showStats) this.showInventory = false;   // only one overlay at a time
    this.audio.play('ui_click', 0.6);
    this.emitSnapshot();
  }

  equipItem(unitId: string, itemId: string) {
    const u = this.byId(unitId);
    const idx = this.inventory.findIndex((i) => i.id === itemId);
    if (!u || u.team !== 'party' || idx < 0) return;
    const item = this.inventory[idx];
    if (item.kind === 'consumable') { this.setHoverInfoOnce('Consumables are used, not equipped.'); return; }
    let slot: string | null = item.slot ?? (item.kind === 'weapon' ? 'weapon' : item.kind === 'armor' ? 'chest' : null);
    if (!slot) { this.setHoverInfoOnce('No valid slot for this item.'); return; }
    let actualSlot: string = slot;
    if (slot === 'ring') {
      if (!u.equipment.ring1) actualSlot = 'ring1';
      else if (!u.equipment.ring2) actualSlot = 'ring2';
      else { this.setHoverInfoOnce('Both ring slots are full. Unequip a ring first.'); return; }
    }
    this.inventory.splice(idx, 1);
    const old = (u.equipment as Record<string, Item | undefined>)[actualSlot];
    if (old) this.inventory.push(old);
    (u.equipment as Record<string, Item | undefined>)[actualSlot] = item;
    if (actualSlot === 'weapon' && item.weaponKind) {
      u.weapon = item.weaponKind;
      const rig = this.visuals.get(u.id)?.rig;
      if (rig) setWeapon(rig, item.weaponKind, u.scheme.accent);
    } else if (actualSlot !== 'weapon') {
      // layer the worn piece onto the voxel rig (clothes/armor/hats/…)
      const rig = this.visuals.get(u.id)?.rig;
      if (rig) {
        const vis = itemToEquipVisual(item, actualSlot);
        if (vis) equip(rig, vis);
      }
    }
    this.audio.play('ui_click', 0.7);
    this.pushLog(`${u.name} equips ${item.icon} ${item.name}.`, 'system');
    this.emitSnapshot();
  }

  /** discard an item from the party bag entirely (inventory drop button). */
  dropItem(itemId: string) {
    const idx = this.inventory.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const [item] = this.inventory.splice(idx, 1);
    this.audio.play('ui_click', 0.5);
    this.pushLog(`You drop ${item.icon} ${item.name}.`, 'system');
    this.emitSnapshot();
  }

  unequipItem(unitId: string, slot: string) {
    const u = this.byId(unitId);
    if (!u || u.team !== 'party') return;
    const item = (u.equipment as Record<string, Item | undefined>)[slot];
    if (!item) return;
    (u.equipment as Record<string, Item | undefined>)[slot] = undefined;
    this.inventory.push(item);
    if (slot === 'weapon') {
      const rig = this.visuals.get(u.id)?.rig;
      if (rig) setWeapon(rig, null, u.scheme.accent);
    } else {
      // remove the worn piece from the voxel rig
      const rig = this.visuals.get(u.id)?.rig;
      if (rig) unequip(rig, (slot.startsWith('ring') ? 'ring' : slot) as EquipSlot);
    }
    this.audio.play('ui_click', 0.5);
    this.pushLog(`${u.name} unequips ${item.icon} ${item.name}.`, 'system');
    this.emitSnapshot();
  }

  // -- skill tree (called from React HUD) ---------------
  toggleSkillTree() {
    if (!this.showBonfireUI && !this.gameWon) {
      this.setHoverInfoOnce('You can only access the skill tree while resting at a bonfire.');
      return;
    }
    this.showSkillTree = !this.showSkillTree;
    this.audio.play('ui_click', 0.6);
    this.emitSnapshot();
  }

  unlockNode(unitId: string, nodeId: string) {
    const u = this.byId(unitId);
    if (!u || u.team !== 'party') return;
    const tree = treeFor(u);
    const node = tree.find((n) => n.id === nodeId);
    if (!node) return;
    const reason = canUnlock(u, node);
    if (reason) { this.setHoverInfoOnce(reason); return; }
    u.skillPoints -= node.cost;
    u.unlockedNodes.push(node.id);
    if (node.unlockSkill && !u.knownSkills.includes(node.unlockSkill)) {
      u.knownSkills.push(node.unlockSkill);
      if (u.equippedSkills.length < 12 && !u.equippedSkills.includes(node.unlockSkill)) {
        u.equippedSkills.push(node.unlockSkill);
      }
    }
    if (node.passive) {
      const p = node.passive;
      if (p.stat === 'str' || p.stat === 'dex' || p.stat === 'con' || p.stat === 'int' || p.stat === 'wis' || p.stat === 'cha') {
        u.abilities[p.stat] += p.amount;
      } else if (p.stat === 'maxHp') {
        u.maxHp += p.amount;
        u.hp = Math.min(u.hp + p.amount, u.maxHp);
      } else if (p.stat === 'ac') {
        u.bonusAC += p.amount;
      } else if (p.stat === 'move') {
        u.bonusMove += p.amount;
      }
    }
    this.pushLog(`${u.name} learns ${node.name} from the ${node.branch} branch!`, 'system');
    this.audio.play('heal', 0.9, 1.3);
    this.emitSnapshot();
  }

  equipSkill(unitId: string, skillId: string) {
    if (this.combat.inCombat) return;
    const u = this.byId(unitId);
    if (!u || !u.knownSkills.includes(skillId) || u.equippedSkills.includes(skillId) || u.equippedSkills.length >= 12) return;
    u.equippedSkills.push(skillId);
    this.audio.play('ui_click', 0.5);
    this.emitSnapshot();
  }

  unequipSkill(unitId: string, skillId: string) {
    if (this.combat.inCombat) return;
    const u = this.byId(unitId);
    if (!u || !u.equippedSkills.includes(skillId) || u.equippedSkills.length <= 1) return;
    u.equippedSkills = u.equippedSkills.filter((s) => s !== skillId);
    this.audio.play('ui_click', 0.5);
    this.emitSnapshot();
  }

  /** drink a potion ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ self-target; in combat only on the drinker's turn (bonus action) */
  useConsumable(itemId: string, unitId: string) {
    const idx = this.inventory.findIndex((i) => i.id === itemId);
    const u = this.byId(unitId);
    if (idx < 0 || !u || !u.alive) return;
    const item = this.inventory[idx];
    if (item.kind !== 'consumable') return;
    if (this.combat.inCombat && this.combat.active?.id !== u.id) {
      this.setHoverInfoOnce(`${u.name} must wait for their turn.`);
      return;
    }
    if (this.combat.inCombat && !u.hasBonus) {
      this.setHoverInfoOnce('No bonus action left.');
      return;
    }
    const wasCursed = u.conditions.some((c) => c.id === 'cursed');
    this.inventory.splice(idx, 1);
    this.audio.play('heal', 0.5, 1.6);
    this.enqueue(this.combat.useConsumable(u, item, u.id));
    // holy water breaks the vault curse — the cursed-gold quest resolves.
    // (was only in the module-level camping version, which nothing calls)
    if (item._baseId === 'holy_water' && wasCursed) {
      this.flags?.add('curse_broken');
      if (!this.questLog?.get('cursed_gold')) this.questLog?.start('cursed_gold');
      if (this.questLog?.get('cursed_gold')?.stage !== 'completed') {
        this.grantLoot?.([makeItem('blessed_penny')], 0);
        this.completeQuest?.('cursed_gold');
        this.pushLog("🪙 The curse lifts. The vault's saint pays you back with a Blessed Penny.", 'system');
      }
    }
  }

  /** combat bonus action — arm a throw: the next tile/unit click hurls the
   *  given consumable (range 6). Toggle off by clicking the 🎯 again. */
  startThrow(itemId: string) {
    const it = this.inventory.find((i) => i.id === itemId);
    if (!it || it.kind !== 'consumable') return;
    if (this.targeting === `THROW:${itemId}`) { this.cancelTargeting(); return; }
    this.targeting = `THROW:${itemId}`;
    this.audio.play('ui_click', 0.6);
    this.emitSnapshot();
  }

  /** resolve a thrown consumable — gate the range/bonus here, the effect in
   *  combat.throwItem (allies take the item's effect at range, enemies take
   *  glass + condition). Costs the active hero's bonus action. */
  public throwConsumable(itemId: string, tx: number, tz: number) {
    const idx = this.inventory.findIndex((i) => i.id === itemId);
    const u = this.combat.active;
    if (idx < 0 || !u || u.team !== 'party') return;
    const item = this.inventory[idx];
    if (item.kind !== 'consumable') return;
    if (!this.combat.inCombat) { this.setHoverInfoOnce('Throwing is a combat bonus action.'); return; }
    if (!u.hasBonus) { this.setHoverInfoOnce('No bonus action left.'); return; }
    if (Combat.dist(u.pos, { x: tx, z: tz }) > 6) { this.setHoverInfoOnce('Too far to throw (6 tiles).'); return; }
    this.inventory.splice(idx, 1);
    this.audio.play('sword_hit', 0.6, 1.2);
    this.enqueue(this.combat.throwItem(u, item, tx, tz));
  }

  public hotkeySkill(i: number) {
    const a = this.combat.active ?? this.byId(this.selectedId ?? '') ?? this.combat.living('party')[0];
    if (!a || a.team !== 'party') return;
    const id = a.equippedSkills[i];
    if (id) this.selectSkill(id);
  }

  public cancelTargeting() {
    if (!this.targeting) return;
    this.targeting = null;
    this.clearHighlights();
    this.showMoveTiles();
    this.emitSnapshot();
  }

  // -- highlights --------------------------------------------
  public clearHighlights() {
    for (const h of this.hlPool) { h.mesh.visible = false; h.cat = ''; }
  }

  // -- event queue ? animation --------------------------------

  /** melee-lunge smash against a destructible prop (explore & combat) */

  /** shatter a prop: debris FX + crumble SFX + log + loot drops */

  // -- traps ---------------------------------------------------

  /** items ? inventory, gold ? purse, recap lines ? victory-screen loot list */

  // -- floaters & bars ---------------------------------------

  // -- combat trigger (explore proximity + vision cones) ---

  /** check if a point is inside an enemy's vision cone */

  // -- main update -------------------------------------------

  // -- thin wrappers delegating to engine sub-modules ----------

  // ──────────────────────────────────────────────────────────────
  // PERFORMANCE: disposeFloor()
  //
  // Called automatically by setupDungeon() in dungeonSetup.ts BEFORE
  // the new floor is built. Frees every GPU resource owned by the
  // *previous* floor so 50+ floors don't accumulate stale geometry
  // in the scene graph or the WebGL buffer pool.
  //
  // Without this, going floor → floor leaks:
  //   • the merged voxel terrain mesh (~150k cubes, ~5 MB GPU)
  //   • every destructible prop's InstancedMesh + pickbox
  //   • every NPC / chest / lever / iron door prop mesh
  //   • the fog-of-war cubes
  //   • the party + enemy rig geometries
  // After ~20 floors the heap would climb past 500 MB and the tab
  // would crash. After this fix, memory stays flat at ~150 MB.
  // ──────────────────────────────────────────────────────────────
  public disposeFloor() {
    // 1. Voxel terrain — the biggest contributor.
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.world = undefined as unknown as VoxelWorld;
    }
    // 2. Destructible props.
    if (this.props) {
      this.scene.remove(this.props.group);
      this.props.dispose();
      this.props = undefined as unknown as DestructibleManager;
    }
    // 3. Party + enemy rigs — they're in `this.visuals` (a Map).
    for (const [, v] of this.visuals) {
      const rig = v.rig;
      if (rig && rig.group) {
        rig.group.traverse((o: THREE.Object3D) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          if (m.material) {
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => mat.dispose());
          }
        });
        if (rig.group.parent) rig.group.parent.remove(rig.group);
      }
    }
    this.visuals.clear();
    // 4. Standalone dropped weapons array.
    for (const d of this.droppedWeapons) {
      if (d.obj) {
        d.obj.traverse((o: THREE.Object3D) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          if (m.material) {
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => mat.dispose());
          }
        });
        if (d.obj.parent) d.obj.parent.remove(d.obj);
      }
    }
    this.droppedWeapons = [];
    // 5. Trap manager — each trap has its own mesh.
    if (this.trapManager) {
      this.trapManager.dispose();
      // The traps.ts dispose() empties the internal lists; we just
      // need to detach the group from the scene.
      if (this.trapManager.group && this.trapManager.group.parent) {
        this.trapManager.group.parent.remove(this.trapManager.group);
      }
    }
    // 6. Fog of war — dispose the full-map InstancedMesh + overlay group.
    if (this.fogMesh) {
      if (this.fogMesh.geometry) this.fogMesh.geometry.dispose();
      if (this.fogMesh.material) {
        const mats = Array.isArray(this.fogMesh.material) ? this.fogMesh.material : [this.fogMesh.material];
        mats.forEach((mat) => mat.dispose());
      }
      this.fogGroup?.remove(this.fogMesh);
      this.fogMesh = null;
    }
    if (this.fogGroup) {
      this.fogGroup.clear();
      if (this.fogGroup.parent) this.fogGroup.parent.remove(this.fogGroup);
      this.fogGroup = null;
    }
    this.fogDirty = true;
    // 7. Dungeon dressing — iron door, golden chest, secret chest,
    //    lever mesh, weapon rack, boss prop, rubble. These are tracked
    //    as references on the engine; tear them down so they don't
    //    leak between floors.
    const dressingDisposers: (THREE.Object3D | null | undefined)[] = [
      this.ironDoor, this.chest, this.goldenChest, this.secretChestMesh,
      this.leverMesh, this.weaponRack, this.rackClub,
    ];
    for (const obj of dressingDisposers) {
      if (!obj) continue;
      obj.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat.dispose());
        }
      });
      if (obj.parent) obj.parent.remove(obj);
    }
    // 7b. Rubble meshes (array of {mesh, tile})
    for (const r of this.rubbleMeshes) {
      r.mesh.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat.dispose());
        }
      });
      if (r.mesh.parent) r.mesh.parent.remove(r.mesh);
    }
    this.rubbleMeshes = [];
    // 7d. Pickable meshes (loot on the ground before pickup)
    for (const p of this.pickables) {
      p.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat.dispose());
        }
      });
      if (p.parent) p.parent.remove(p);
    }
    this.pickables = [];
    // 7e. Clear the dressing refs so the next floor can re-create them.
    this.ironDoor = null;
    this.chest = null;
    this.goldenChest = null;
    this.secretChestMesh = null;
    this.leverMesh = null;
    this.weaponRack = null;
    this.rackClub = null;
    this.ironDoorOpen = false;
    this.secretOpen = false;
    this.secretChestOpen = false;
    // 8. Combat state caches that hold position info.
    this.detectionMeter.clear();
    this.moveTiles.clear();
    this.queue = [];
    this.eventQueue = [];
    // 9. Reset the tile grid (heights, blocked) by giving world a fresh
    //    empty group ready to be populated by the next VoxelWorld.
    // (Done lazily in the next setupDungeon call.)
  }

  // dungeon setup
  public setupDungeon(L: LevelDef) { setupDungeon(this, L); }
  public attachHeroTorch(rig: Rig) { attachHeroTorch(this, rig); }
  public updateDungeon(dt: number) { updateDungeon(this, dt); }
  public setAnimScale(s: number) { setAnimScale(s); }

  public inEnemyCone(p: GridPos, enemy: Unit): boolean { return inEnemyCone(this, p, enemy); }
  public aggroGroup(groupId: string | undefined) { aggroGroup(this, groupId); }

  /** Bresenham line check: true if no wall blocks a straight line from
   *  `a` to `b` on the walk grid. Used by aggro so dormant enemies can't
   *  attack through unexplored walls. */
  public hasLineOfSight(a: GridPos, b: GridPos): boolean {
    let x0 = a.x, z0 = a.z, x1 = b.x, z1 = b.z;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    for (let guard = 0; guard < 200; guard++) {
      if (x0 === x1 && z0 === z1) return true;
      if (!(x0 === a.x && z0 === a.z) && !(x0 === b.x && z0 === b.z) && !this.world.isWalkable(x0, z0)) return false;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
    return true;
  }

  // visuals
  public addUnit(u: Unit) { addUnit(this, u); }
  public updateDroppedWeapons(dt: number) { updateDroppedWeapons(this, dt); }

  // combat animation
  public enqueue(events: CombatEvent[]) { enqueue(this, events); }
  public checkCombatTrigger() { checkCombatTrigger(this); }
  public smashProp(u: Unit, prop: Destructible, skill?: SkillDef) { smashProp(this, u, prop, skill); }
  public triggerTrap(u: Unit, trap: any) { triggerTrapModule(this, u, trap); }

  // interaction
  public updateFog(_dt: number) { updateFog(this, _dt); }
  public executeDialogueAction(action: DialogueAction, npc: NPCDef) { executeDialogueActionModule(this, action, npc); }
  public pickTile(): GridPos | null { return pickTileModule(this); }
  public updateHover() { updateHoverModule(this); }
  public clickExplore(pick: InteractPick | null, tile: GridPos | null) { clickExploreModule(this, pick, tile); }
  public clickCombat(pick: InteractPick | null, tile: GridPos | null) { clickCombatModule(this, pick, tile); }
  public moveUnitAlong(u: Unit, path: GridPos[]) { moveUnitAlongModule(this, u, path); }
  public talkToNpc(npcId: string) { talkToNpcModule(this, npcId); }
  public onPointerMove = (e: PointerEvent) => { onPointerMoveModule(this, e); };
  public onPointerDown = (e: PointerEvent) => { onPointerDownModule(this, e); };

  // targeting
  public showTargeting(s: SkillDef, u: Unit) { showTargetingModule(this, s, u); }
  public showMoveTiles() { showMoveTilesModule(this); }

  // game flow
  public spawnBonfireFlame() { spawnBonfireFlameModule(this); }

  // input
  public bindInput() { bindInputModule(this); }
  public onKeyDown = (e: KeyboardEvent) => { onKeyDownModule(this, e); };
  public onResize = () => { onResizeModule(this); };

  // tavern / sheep
  public buildTavernExterior(): THREE.Group { return buildTavernExterior(this.propAnims); }
  public buildSheep(): THREE.Group { return buildSheep(); }

  public update(dt: number) {
    // pause — freeze all simulation while the in-game menu is open.
    // The render loop (composer.render) still runs, so the frozen frame shows.
    if (this.paused) return;

    // (torch fuel timer removed — the torch never burns out)
    // cursed gold: loot quality downgraded while the leader is cursed
    const leader = this.combat?.living('party')[0];
    setCursedLoot(!!leader?.conditions.some((c) => c.id === 'cursed'));
    // keyboard pan — suspended while a cutscene is driving the camera, and
    // replaced by look-turn + WASD stepping in first-person mode
    if (!this.firstPerson && !(this.busy && (this.introActive || this.bossCineActive))) {
      const pan = dt * 9;
      if (this.keys.has('w') || this.keys.has('arrowup')) this.iso.pan(0, -pan);
      if (this.keys.has('s') || this.keys.has('arrowdown')) this.iso.pan(0, pan);
      if (this.keys.has('a') || this.keys.has('arrowleft')) this.iso.pan(-pan, 0);
      if (this.keys.has('d') || this.keys.has('arrowright')) this.iso.pan(pan, 0);
    }

    // follow camera: the camera stays where the player left it (WASD pan
    // works freely). It only re-centers on the leader when the player
    // clicks to move (handled in clickExplore via this.snapFollowCam()).
    // No continuous pulling ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ no jerkiness, no fighting the player's panning.

    this.iso.update(dt);
    // title mode (after returnToTitle) has no voxel world — skip the floor
    // update paths so the rebuild doesn't wedge the render loop
    if (!this.world) return;
    // ── first-person view: camera rides on the hero's head, looking along
    //    the fpYaw/fpPitch look direction (mouse, Q/E and A/D rotate it).
    //    W/S step forward/back along the view; movement is tile-stepped so
    //    pathfinding, traps and fog all behave normally. ──
    const fpHero = this.combat?.living('party')[0];
    if (this.firstPerson && fpHero && fpHero.alive) {
      // hide the hero's own model so the camera isn't inside the voxels —
      // tracked by id so a mid-FP roster change can never strand a hidden rig
      if (this.fpHiddenId && this.fpHiddenId !== fpHero.id) {
        const old = this.visuals.get(this.fpHiddenId);
        if (old) { old.rig.group.visible = true; old.proxy.visible = true; }
      }
      const fv = this.visuals.get(fpHero.id);
      if (fv) { fv.rig.group.visible = false; fv.proxy.visible = false; this.fpHiddenId = fpHero.id; }
      this.ring.visible = false;
      // the eye rides the RIG's smoothed position (not the tile-snapped
      // logical one) so walking feels continuous instead of hopping
      const base = fv?.rig.group.position ?? this.unitWorld(fpHero.pos);
      const eye = new THREE.Vector3(base.x, base.y + 1.7, base.z);
      const cp = Math.cos(this.fpPitch);
      const dir = new THREE.Vector3(cp * Math.sin(this.fpYaw), Math.sin(this.fpPitch), cp * Math.cos(this.fpYaw));
      this.iso.cam.position.copy(eye);
      this.iso.cam.lookAt(eye.clone().addScaledVector(dir, 4));
      this.iso.cam.up.set(0, 1, 0);
      // headlamp — FP without a lit torch must still read (dim warm glow)
      if (!this.fpLight) {
        this.fpLight = new THREE.PointLight(0xffd9a0, 5, 10, 1.6);
        this.scene.add(this.fpLight);
      }
      this.fpLight.visible = true;
      this.fpLight.position.copy(eye).addScaledVector(dir, 0.6);
      // Q/E smooth-turn (hold)
      const turn = dt * 2.6;
      if (this.keys.has('q')) this.fpYaw += turn;
      if (this.keys.has('e')) this.fpYaw -= turn;
      // WASD: W/S step forward/back along the view, A/D strafe. One tile
      // per step keeps traps, fog and aggro honest; the short cooldown +
      // smoothed rig makes holding a key feel like continuous walking.
      const now = performance.now() / 1000;
      if (now - this.fpStepAt > 0.19 && !this.busy && !this.combat.inCombat) {
        const fwd = (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0);
        const side = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
        if (fwd || side) {
          const s = Math.sin(this.fpYaw), c = Math.cos(this.fpYaw);
          // forward = (s, c); right = (−c, s)
          const dx = Math.round(s * fwd + (-c) * side);
          const dz = Math.round(c * fwd + s * side);
          let step: GridPos | null = null;
          for (const [ox, oz] of [[dx, dz], [dx, 0], [0, dz]]) {
            if (!ox && !oz) continue;
            const tx = fpHero.pos.x + ox, tz = fpHero.pos.z + oz;
            if (this.world.isWalkable(tx, tz) && !this.trapManager?.at(tx, tz)?.revealed) {
              step = { x: tx, z: tz }; break;
            }
          }
          if (step) {
            const path = this.combat.pathTo(fpHero, step.x, step.z);
            if (path && path.length) {
              this.moveUnitAlong(fpHero, path);
              this.fpStepAt = now;
              // step audio + dust for feel
              this.audio.play('ui_click', 0.25, 1.6);
            }
          }
        }
      }
    } else if (this.fpHiddenId) {
      // FP ended (or the hero is gone) — restore the hidden rig by id
      const fv = this.visuals.get(this.fpHiddenId);
      if (fv) { fv.rig.group.visible = true; fv.proxy.visible = true; }
      this.fpHiddenId = null;
    }
    this.world.update(dt);
    this.updateDroppedWeapons(dt);
    if (this.structures) this.updateDungeon(dt);

    // torch flames only exist in explored rooms; otherwise particles leak light
    for (const t of this.world.torches) {
      const tile = this.world.worldToTile(t.pos.x, t.pos.z);
      if (tile && this.explored?.[tile.x]?.[tile.z]) FX.flame(this.particles, t.pos.clone());
    }

    // bonfire (flame + smoke particles)
    if (this.bonfireLit && this.bonfirePos) {
      const bfp = this.world.tileToWorld(this.bonfirePos.x, this.bonfirePos.z);
      bfp.y += 0.9;
      FX.flame(this.particles, bfp);
      if (Math.random() < 0.6) {
        this.particles.burst({ pos: bfp.clone().add(new THREE.Vector3((Math.random()-0.5)*0.3, 0.6+Math.random()*0.8, (Math.random()-0.5)*0.3)), count: 6, color: [0x3a3a3a, 0x555555, 0x2a2a2a], speed: [0.3, 1.0], life: [0.6, 1.8], size: [0.4, 1.0], gravity: -1.5, up: 1.0, endScale: 1.2, solid: true });
      }
    }

    // ever-present ambient light around the player. A modest pool of light
    // follows the hero everywhere; holding a lit torch widens the pool into a
    // bright, large radius centred right on the flame.
    const player = this.combat?.living('party')[0];
    if (!this.torchLight) {
      this.torchLight = new THREE.PointLight(0xffcf9a, 1.6, 10, 1.5);
      this.scene.add(this.torchLight);
    }
    if (this.torchLight) {
      const rig = player ? this.visuals.get(player.id)?.rig : null;
      const weaponG = rig ? rig.parts.weapon as THREE.Object3D : null;
      if (player && player.weapon === 'torch' && this.torchLit) {
        // torch held: wide bright flame light + flame FX
        this.torchLight.color.setHex(0xffb545);
        this.torchLight.intensity = 12;
        this.torchLight.distance = 18;
        const flamePos = new THREE.Vector3(0.02, rig?.pivots ? 5.85 * 0.055 : 0.58, 0.02);
        if (weaponG) weaponG.localToWorld(flamePos);
        else flamePos.set(flamePos.x, 2.2, flamePos.z);
        this.torchLight.position.copy(flamePos);
        if (this.explored?.[player.pos.x]?.[player.pos.z]) {
          FX.flame(this.particles, flamePos.clone());
          if (Math.random() < 0.35) {
            const sp = flamePos.clone().add(new THREE.Vector3((Math.random()-0.5)*0.25, 0.3+Math.random()*0.4, (Math.random()-0.5)*0.25));
            this.particles.burst({ pos: sp, count: 3, color: [0x3a3a3a, 0x4a4a4a], speed: [0.2, 0.6], life: [0.4, 1.0], size: [0.2, 0.5], gravity: -1.0, up: 0.5, endScale: 1.5, solid: true });
          }
        }
      } else {
        // no torch: soft always-on pool centred over the hero's head
        this.torchLight.color.setHex(0xd7deef);
        this.torchLight.intensity = 1.6;
        this.torchLight.distance = 10;
        if (player) {
          const wp = this.unitWorld(player.pos);
          this.torchLight.position.set(wp.x, wp.y + 2.1, wp.z);
        }
      }
    }

    // fog of war: mark tiles within vision as explored, show/hide dark overlays
    this.updateFog(dt);
    updateExploredVisibility(this);

    // sneak visual ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ smooth crouch
    this.crouchLerp += (this.sneaking ? 1 : 0) * Math.min(1, dt * 6) - this.crouchLerp * Math.min(1, dt * 6);

    // ambient tavern NPCs (animated only during the intro flashback)
    if (this.inTavern || this.introActive) {
      for (const r of this.tavernRigs) updateRig(r, dt, 1);
      for (const [id, v] of this.visuals) {
        const u = this.byId(id);
        if (u && v.rig.anim.mode !== 'dead') updateRig(v.rig, dt, 1);
      }
    }
    // units
    for (const [id, v] of this.visuals) {
      const u = this.byId(id);
      if (!u) continue;
      // sneak crouch visual (party only in explore, all in combat)
      // dead units are left entirely to the ragdoll collapse in updateRig
      if (v.rig.anim.mode !== 'dead' && ((this.phase === 'explore' && u.team === 'party') || this.phase === 'combat')) {
        // crouchLerp eases toward 0 when not sneaking, so standing up plays the crouch in reverse
        const c = u.team === 'party' ? this.crouchLerp : 0;
        v.rig.anim.crouch = c;   // rig bends the knees & hunches ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ feet stay planted
        v.rig.group.scale.y = (u.scheme.bulk ?? 1);
        v.rig.group.position.y = (v.rig.group.userData.baseY as number) + (v.walker ? Math.sin(performance.now() * 0.02) * 0.02 : 0);
      }
      // smooth facing
      let dy = v.targetYaw - v.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      v.yaw += dy * Math.min(1, dt * 10);
      if (v.rig.anim.mode !== 'dead') v.rig.group.rotation.y = v.yaw;
      updateRig(v.rig, dt, u.conditions.some((c) => c.id === 'slowed') ? 0.6 : 1);
      // dust plume the moment the ragdoll body slaps the ground
      if (v.rig.anim.mode === 'dead' && v.rig.anim.death?.impacted && !v.dustDone) {
        v.dustDone = true;
        FX.impactDust(this.particles, v.rig.group.position.clone().setY((v.rig.group.userData.baseY as number) + 0.08), [u.scheme.skin, u.scheme.cloth]);
        this.audio.play('sword_hit', 0.25, 0.5);
      }
      v.proxy.position.copy(v.rig.group.position).y += (v.proxy.userData.yOff as number) ?? 0.9;
      // explore-mode walkers (non-combat movement)
      if (v.walker && v.rig.anim.mode === 'walk') {
        const wk = v.walker;
        const target = wk.path[wk.idx];
        const pos = v.rig.group.position;
        const d = target.clone().sub(pos); d.y = 0;
        const dist = d.length();
        if (dist < 0.06) {
          pos.copy(target);
          // update baseY to the new tile's height so stairs/mezzanines
          // don't snap the rig back to the old floor on the next frame
          v.rig.group.userData.baseY = target.y;
          // the unit's LOGICAL position follows the rig — mid-walk clicks,
          // bonfire/NPC proximity and aggro all read u.pos
          const arrived = wk.tiles?.[wk.idx];
          if (arrived) u.pos = { ...arrived };
          // traps trigger when a unit ACTUALLY steps on the tile — and
          // never for the dungeon's own rats/mobs
          if (arrived && u.team !== 'enemy') {
            const trap = this.trapManager.at(arrived.x, arrived.z);
            if (trap && !trap.triggered) void this.triggerTrap(u, trap);
          }
          wk.idx++;
          if (wk.idx >= wk.path.length) { v.walker = null; v.rig.anim.mode = 'idle';
        if (this.pendingSmash && this.pendingSmash.unitId === id) {
          const ps = this.pendingSmash;
          this.pendingSmash = null;
          const prop = this.props.byId(ps.propId);
          const unit = this.byId(ps.unitId);
          if (prop && unit && unit.alive) void this.smashProp(unit, prop);
        }
        // bonfire click from afar — kindle/rest once the leader arrives
        if (this.pendingBonfire && u.team === 'party') {
          const act = this.pendingBonfire;
          this.pendingBonfire = null;
          if (this.bonfirePos && Combat.dist(u.pos, this.bonfirePos) <= 1.5) {
            if (act === 'rest') this.restAtBonfire(); else this.lightBonfire();
          }
        }
        // NPC click from afar — open the dialogue once the leader arrives
        if (this.pendingTalk && u.team === 'party') {
          const npcId = this.pendingTalk;
          this.pendingTalk = null;
          const entry = this.npcs.find((n) => n.npcId === npcId);
          if (entry && Combat.dist(u.pos, entry.pos) <= 1.5) this.talkToNpc(npcId);
        }
      }
          else FX.dust(this.particles, pos.clone());
        } else {
          d.normalize();
          v.targetYaw = Math.atan2(d.x, d.z);
          const walkSpeed = this.sneaking ? 2.5 : (this.running ? 7.0 : 4.6);
          pos.addScaledVector(d, Math.min(dist, dt * walkSpeed));
          pos.y += (target.y - pos.y) * Math.min(1, dt * 8);
        }
      }
    }

    this.checkCombatTrigger();

    // combat (or leaving explore) kills the hover path preview
    if ((this.combat?.inCombat || this.phase !== 'explore') && this.hoverPathKey) {
      this.hoverPathKey = '';
      hidePathPreview(this);
    }

    // -- vision cones (explore only) --
    if (this.phase === 'explore' && !this.combat.inCombat) {
      // enemy cones: create or update
      const foes = this.combat.living('enemy');
      // remove cones for dead enemies
      for (let i = this.enemyCones.length - 1; i >= 0; i--) {
        if (!this.byId(this.enemyCones[i].unitId)?.alive) {
          this.scene.remove(this.enemyCones[i].mesh);
          this.enemyCones.splice(i, 1);
        }
      }
      for (const f of foes) {
        // ONLY show enemy vision cones when the player is sneaking ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½
        // otherwise the cones are hidden so the dungeon reads clean.
        const nearParty = !this.structures || this.combat.living('party').some((p) => Combat.dist(p.pos, f.pos) <= 11);
        let cd = this.enemyCones.find((c) => c.unitId === f.id);
        if (!nearParty || !this.sneaking) { if (cd) cd.mesh.visible = false; continue; }
        if (!cd) {
          const mesh = new THREE.Mesh(this.coneGeo, new THREE.MeshBasicMaterial({
            color: 0xef4444, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide,
          }));
          mesh.rotation.x = Math.PI / 2;
          mesh.renderOrder = 0;
          this.scene.add(mesh);
          cd = { mesh, yaw: 0, targetYaw: 0, unitId: f.id };
          this.enemyCones.push(cd);
        }
        // animate yaw with slight sine sway
        cd.targetYaw = Math.sin(performance.now() * 0.0006 + f.pos.x) * 0.15;
        let dy = cd.targetYaw - cd.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        cd.yaw += dy * Math.min(1, dt * 3);
        const wp = this.unitWorld(f.pos);
        cd.mesh.position.set(wp.x, wp.y + 0.04, wp.z);
        cd.mesh.rotation.y = cd.yaw;
        cd.mesh.visible = true;
      }
      // player cone (only when sneaking)
      if (this.sneaking) {
        const leader = this.byId(this.selectedId ?? '') ?? this.combat.living('party')[0];
        if (leader) {
          const v = this.visuals.get(leader.id);
          if (v) {
            const yaw = v.yaw;
            this.playerCone.visible = true;
            const pwp = this.unitWorld(leader.pos);
            this.playerCone.position.set(pwp.x, pwp.y + 0.04, pwp.z);
            this.playerCone.rotation.y = yaw;
          }
        }
      } else this.playerCone.visible = false;

      // detection meter decay for units not in any cone
      const party = this.combat.living('party');
      for (const [eId, em] of this.detectionMeter) {
        const enemy = this.byId(eId);
        if (!enemy?.alive) { this.detectionMeter.delete(eId); continue; }
        for (const p of party) {
          if (!this.inEnemyCone(p.pos, enemy)) {
            const cur = em.get(p.id);
            if (cur !== undefined) {
              const nv = cur - dt * 0.05;
              if (nv <= 0) em.delete(p.id);
              else em.set(p.id, nv);
            }
          }
        }
        if (em.size === 0) this.detectionMeter.delete(eId);
      }

      // trap passive reveal
      for (const p of party) {
        const wisMod = Math.floor((p.abilities.wis - 10) / 2);
        this.trapManager.revealCheck(p.pos, 5, wisMod, p.proficiency);
      }
      // update trap floater positions
      const w = this.container.clientWidth, h = this.container.clientHeight;
      this.trapManager.update(this.overlay, this.iso.cam, w, h);
    } else {
      // hide cones when not in explore (or combat started)
      for (const c of this.enemyCones) { c.mesh.visible = false; }
      this.playerCone.visible = false;
    }

    // selection ring follows active/selected unit
    const focusUnit = this.combat.inCombat ? this.combat.active : this.byId(this.selectedId ?? '');
    const ringV = focusUnit && focusUnit.alive ? this.visuals.get(focusUnit.id) : undefined;
    if (focusUnit && focusUnit.alive && ringV && ringV.rig) {
      this.ring.visible = true;
      this.ring.position.copy(ringV.rig.group.position).y = this.world.heightAt(focusUnit.pos.x, focusUnit.pos.z) + 0.53;
      (this.ring.material as THREE.MeshBasicMaterial).color.setHex(
        this.combat.inCombat ? (focusUnit.team === 'party' ? 0xffd76b : 0xef4444) : 0x7cc4ff,
      );
      const s = 1 + Math.sin(performance.now() * 0.005) * 0.07;
      this.ring.scale.set(s, 1, s);
    } else this.ring.visible = false;

    // click ping
    if (this.clickPingT < 1) {
      this.clickPingT = Math.min(1, this.clickPingT + dt * 2.4);
      const s = 0.5 + this.clickPingT * 1.4;
      this.clickPing.scale.set(s, 1, s);
      (this.clickPing.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - this.clickPingT);
    }

    // highlight pulse
    const pulse = 0.75 + Math.sin(performance.now() * 0.006) * 0.25;
    this.hlMats.aoe.opacity = 0.42 * pulse;
    this.hlMats.hover.opacity = 0.35 * pulse;

    // floaters
    const w = this.container.clientWidth, h = this.container.clientHeight;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t > 1.25) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      const sp = f.wp.clone(); sp.y += f.t * 0.9;
      sp.project(this.iso.cam);
      f.el.style.transform = `translate(${(sp.x * 0.5 + 0.5) * w}px, ${(-sp.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`;
      f.el.style.opacity = `${Math.min(1, (1.25 - f.t) * 3)}`;
    }

    // unit bars
    for (const [id, v] of this.visuals) {
      const u = this.byId(id);
      const explored = !!u && (u.team === 'party' || !!this.explored?.[u.pos.x]?.[u.pos.z]);
      if (!u || !u.alive || !explored || this.phase === 'menu' || this.inTavern) { if (v.bar.style.display !== 'none') v.bar.style.display = 'none'; continue; }
      v.bar.style.display = 'block';
      const sp = v.rig.group.position.clone(); sp.y += v.rig.pivots ? 2.8 : 2.05;
      sp.project(this.iso.cam);
      if (sp.z > 1) { v.bar.style.display = 'none'; continue; }
      v.bar.style.transform = `translate(${(sp.x * 0.5 + 0.5) * w}px, ${(-sp.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`;
    }

    this.particles.update(dt);
  }

  // -- snapshot / log ----------------------------------------
  public pushLog(text: string, kind: LogEntry['kind']) {
    this.log.push({ id: this.logSeq++, text, kind });
    if (this.log.length > 90) this.log = this.log.slice(-90);
    // live spectator feed: any open /spectate.html tab receives every line
    try {
      (this.bc ?? (this.bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dh-live-feed') : null))?.postMessage({ text, kind });
    } catch { /* spectator is best-effort */ }
  }

  /** broadcast channel for the /spectate.html live feed (lazy) */
  private bc: BroadcastChannel | null = null;

  public emitSnapshot() {
    if (!this.combat) return;
    const minimapUnits = this.combat.units
      .filter(u => u.alive && this.explored[u.pos.x]?.[u.pos.z])
      .map(u => ({ x: u.pos.x, z: u.pos.z, team: u.team }));
    // minimap: only show explored tiles (fog of war) — empty in title mode
    const MS = this.world?.heights?.length ?? 0;  // WORLD_SIZE
    const minimapWalk: boolean[][] = [];
    const minimapHeights: number[][] = [];
    for (let x = 0; x < MS; x++) {
      minimapWalk[x] = [];
      minimapHeights[x] = [];
      for (let z = 0; z < MS; z++) {
        // only show tiles that have been explored OR are within current vision
        const seen = this.explored.length > x && this.explored[x]?.[z] === true;
        minimapWalk[x][z] = seen && this.world.isWalkable(x, z);
        minimapHeights[x][z] = this.world.heightAt(x, z);
      }
    }
    this.onSnapshot({
      phase: this.phase,
      floor: this.floorNumber,
      floorName: FLOORS[this.floorNumber]?.name ?? 'The Sewer Cellar',
      units: this.combat.units.map((u) => ({ ...u, conditions: [...u.conditions], abilities: { ...u.abilities }, cooldowns: { ...u.cooldowns }, pos: { ...u.pos }, equipment: { ...u.equipment }, knownSkills: [...u.knownSkills], equippedSkills: [...u.equippedSkills], unlockedNodes: [...u.unlockedNodes] })),
      activeId: this.combat.inCombat ? this.combat.active?.id ?? null : null,
      turnOrder: this.combat.inCombat ? this.combat.turnOrder.filter((id) => this.byId(id)?.alive) : [],
      selectedSkill: this.targeting,
      targeting: !!this.targeting,
      log: [...this.log],
      round: this.combat.round,
      muted: this.audio.muted,
      hoverInfo: this.hoverInfo,
      loot: [...this.loot],
      inventory: [...this.inventory],
      gold: this.gold,
      showInventory: this.showInventory,
      showSkillTree: this.showSkillTree,
      showStats: this.showStats,
      sneaking: this.sneaking,
      running: this.running,
      throwing: this.throwing,
      tacticalView: this.tacticalView,
      torchLit: this.torchLit,
      torchEquipped: this.combat?.living('party')[0]?.weapon === 'torch',
      bigMessage: this.bigMessage,
      cinematic: this.cinematic,
      busy: this.busy,
      paused: this.paused,
      minimapTiles: { walk: minimapWalk, heights: minimapHeights, units: minimapUnits },
      showBonfireUI: this.showBonfireUI,
      showBonfireLoadout: this.showBonfireLoadout,
      showFullMap: this.showFullMap,
      talkTarget: this.activeTalkTarget(),
      interactPrompt: this.activeInteractable?.label ?? null,
      torchFuel: this.torchFuel,
      showQuestLog: this.showQuestLog,
      quests: this.questLog.all().map((q) => ({
        id: q.id,
        name: q.name,
        stage: q.stage,
        desc: q.desc,
      })),
      runStats: { ...this.runStats },
      showDialogue: this.showDialogue,
      diceShow: this.diceShow ? { ...this.diceShow } : null,
      pendingLoot: this.pendingLoot ? { source: this.pendingLoot.source, items: [...this.pendingLoot.items], gold: this.pendingLoot.gold } : null,
      turnMode: this.combat.turnMode,
      jumpMode: this.jumpMode,
      showConsole: this.consoleOpen,
      consoleInput: this.consoleInput,
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.splashAudioHandler) {
      window.removeEventListener('pointerdown', this.splashAudioHandler);
      window.removeEventListener('keydown', this.splashAudioHandler);
      this.splashAudioHandler = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    for (const c of this.enemyCones) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); (c.mesh.material as THREE.Material).dispose(); }
    this.enemyCones = [];
    for (const d of this.droppedWeapons) { this.scene.remove(d.obj); d.obj.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
    this.droppedWeapons = [];
    if (this.playerCone) { this.scene.remove(this.playerCone); }
    if (this.heroLight) { this.scene.remove(this.heroLight); this.heroLight = null; }
    if (this.playerConeGeo) this.playerConeGeo.dispose();
    if (this.coneGeo) this.coneGeo.dispose();
    this.trapManager?.dispose();
    this.audio?.stopDungeonAmbience();
    this.renderer.domElement.remove();
    this.overlay.innerHTML = '';
    this.renderer.dispose();
    this.particles.dispose();
  }
}
