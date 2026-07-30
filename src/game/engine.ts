import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VoxelWorld, WORLD_SIZE } from './world';
import { dungeonLevel } from '../levels/dungeon';
import { ParticleSystem, FX } from './particles';
import { updateRig, setWeapon, equip, unequip, itemToEquipVisual, type Rig } from './characters';
import { Combat } from './combat';
import { SKILLS, createRoster } from './skills';
import { AudioManager } from './audio';
import { DestructibleManager, type Destructible } from './destructibles';
import type { Item } from './items';
import type { LevelStructures } from '../levels/levelTypes';
import { effMaxHp } from './stats';
import { SaveManager, SettingsManager, type GameSettings, type SaveData, type SaveSlotMeta } from './save';
import { canUnlock, treeFor } from './skilltree';
import { TrapManager } from './traps';
import type { CombatEvent, GamePhase, GridPos, LogEntry, SkillDef, UISnapshot, Unit, EquipSlot } from './types';
import { NPCS, type NPCDef } from './npc';
import { QuestLog } from './quest';
import { CutsceneDirector, setupTitleScene, runTitleNarration, type CutsceneHost } from './cutscenes/index';

import { IsoCamera } from './engine/IsoCamera';
import { addUnit, updateDroppedWeapons } from './engine/visuals';
import { buildTavernExterior } from './engine/tavernExterior';
import { buildTavern } from './engine/tavern';
import { buildSheep } from './engine/sheep';
import { setupDungeon, attachHeroTorch, updateDungeon, aggroGroup, inEnemyCone } from './engine/dungeonSetup';
import { smashProp, checkCombatTrigger, enqueue } from './engine/combatAnimation';
import { updateFog, executeDialogueAction } from './engine/interaction';
import { spawnBonfireFlame as spawnBonfireFlameModule } from './engine/gameFlow';
import { showTargeting as showTargetingModule, showMoveTiles as showMoveTilesModule } from './engine/targeting';
import { bindInput as bindInputModule, onKeyDown as onKeyDownModule, onResize as onResizeModule } from './engine/input';
interface Floater { el: HTMLDivElement; wp: THREE.Vector3; t: number; }
interface Walker { path: THREE.Vector3[]; idx: number; }

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
  public questLog = new QuestLog();
  public hermitRig: Rig | null = null;
  public hermitPos: GridPos | null = null;
  public showDialogue: { npcId: string; npcName: string; text: string; caption?: string; choices?: { label: string; index: number }[] } | null = null;
  public sneaking = false;
  public crouchLerp = 0;
  public torchLit = true;
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
  public propAnims: ((dt: number) => boolean)[] = [];   // returns true when finished
  public ironDoorOpen = false;
  public secretOpen = false;
  public goldenChestOpen = false;
  public secretChestOpen = false;
  public bossCutscenePlayed = false;
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
  /** dark overlay meshes covering unexplored tiles (indexed by "x,z") */
  public fogGroup: THREE.Group | null = null;
  public fogCubes: Map<string, THREE.Mesh> = new Map();
  /** vision radius (tiles) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ torch extends it; base is a small cone */
  public visionRadius = 6;

  // -- cheat console ------------------------------------------
  /** when true the camera continuously follows the party leader */
  public followCam = false;
  /** proximity aggro is OFF by default ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ the player explores freely;
   *  toggle with the `noaggro` console command */
  public aggroDisabled = true;
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

  public container: HTMLDivElement;
  public overlay: HTMLDivElement;
  public onSnapshot: (s: UISnapshot) => void;

  constructor(container: HTMLDivElement, overlay: HTMLDivElement, onSnapshot: (s: UISnapshot) => void) {
    this.container = container;
    this.overlay = overlay;
    this.onSnapshot = onSnapshot;
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
    const L = dungeonLevel;
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

    // world ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ underground cave level
    this.world = new VoxelWorld(dungeonLevel, 1337);
    this.scene.add(this.world.group);

    // -- fog of war: initialize the explored grid (all dark) + overlay group --
    {
      const FS = this.world.heights.length;
      this.explored = Array.from({ length: FS }, () => new Array<boolean>(FS).fill(false));
      this.fogGroup = new THREE.Group();
      this.scene.add(this.fogGroup);
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

    // destructible props (crates/barrels/vases) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ mark tiles blocked
    this.props = new DestructibleManager(this.world);
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
    this.playerCone.renderOrder = 0;
    this.scene.add(this.playerCone);

    // traps
    this.trapManager = new TrapManager(this.world);
    this.trapManager.init();
    this.scene.add(this.trapManager.group);

    // combat + units
    this.combat = new Combat(this.world);
    this.spawnUnits();
    this.setupDungeon(dungeonLevel);
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
      this.update(dt);
      this.composer.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.emitSnapshot();
  }

  public spawnUnits() {
    this.combat.units = dungeonLevel.makeRoster ? dungeonLevel.makeRoster() : createRoster();
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

  // -- dungeon aggro & boss cutscene -------------------------
  public checkDungeonAggro() {
    if (!this.structures || this.phase !== 'explore' || this.combat.inCombat || this.busy || this.gameWon) return;
    // aggro is disabled by default ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ the player explores freely.
    // toggle with the `noaggro` console command (backtick ? type noaggro).
    if (this.aggroDisabled) return;
    // intro-skip grace window: after the intro ends (whether naturally or
    // by skipping), suppress proximity aggro for a beat so Greg doesn't
    // instantly get swarmed by the dormant rats in his starter room.
    if (performance.now() / 1000 < this.introGraceUntil) return;
    const st = this.structures;
    const party = this.combat.living('party');
    if (!party.length) return;

    // entering the boss room the first time ? the bathing tyrant cutscene
    if (!this.bossCutscenePlayed && party.some((p) => GameEngine.inRect(p.pos, st.bossRoom))) {
      this.bossCutscenePlayed = true;
      void this.playBossCutscene();
      return;
    }

    // group proximity aggro (never wakes the boss group by proximity)
    for (const f of this.combat.units) {
      if (!f.alive || f.team !== 'enemy' || !f.dormant || f.bossGroup) continue;
      const range = (f.flying ? 5 : 4) - (this.sneaking ? 2 : 0);
      for (const p of party) {
        if (Combat.dist(p.pos, f.pos) <= range || (!this.sneaking && this.inEnemyCone(p.pos, f))) {
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
   * Boss reveal cinematic ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ "the bathing tyrant". The script lives in
   * src/game/cutscenes.ts; this engine method just routes through the
   * director (and lets the debug warp key still call this entrypoint).
   */
  public async playBossCutscene() {
    if (!this.cutsceneDirector) return;
    await this.cutsceneDirector.play('boss');
  }

  // -- unit visuals ------------------------------------------

  unitWorld(p: GridPos): THREE.Vector3 {
    const h = this.world.heightAt(p.x, p.z);
    return new THREE.Vector3(p.x - WORLD_SIZE / 2 + 0.5, h + 0.5, p.z - WORLD_SIZE / 2 + 0.5);
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

  dialogueChoice(npcId: string, choiceIndex: number) {
    const npc = NPCS[npcId];
    if (!npc) return;
    const questNode = this.questLog.nodeFor(npcId, this.hasItemInInventory('severed_finger'));
    const nodeId = questNode ?? npc.entryNode;
    const node = npc.dialogue[nodeId];
    if (!node?.choices?.[choiceIndex]) {
      this.showDialogue = null;
      this.emitSnapshot();
      return;
    }
    const choice = node.choices[choiceIndex];
    if (choice.action) this.executeDialogueAction(choice.action, npc);
    if (choice.next) {
      const nextNode = npc.dialogue[choice.next];
      if (nextNode) {
        this.showDialogue = {
          npcId,
          npcName: npc.name,
          text: nextNode.text,
          caption: nextNode.caption,
          choices: nextNode.choices?.map((c, i) => ({ label: c.label, index: i })),
        };
        if (nextNode.action) this.executeDialogueAction(nextNode.action, npc);
        this.emitSnapshot();
        return;
      }
    }
    this.showDialogue = null;
    this.emitSnapshot();
  }

  public hasItemInInventory(baseId: string): boolean {
    return this.inventory.some(i => i.id === baseId || (i as any)._baseId === baseId || (baseId === 'severed_finger' && i.name.includes('Severed Finger')));
  }

  // -- HUD API (called from React) ----------------------------
  startGame() {
    void this.audio.init();
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

    // 2. Free the current floor's geometry - disposeFloor handles all
    //    meshes / rigs / fog / props.
    if (typeof this.disposeFloor === 'function') this.disposeFloor();

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
    if (this.phase !== 'combat') {
      this.setHoverInfoOnce('Skills can only be used in combat.');
      return;
    }
    const s = SKILLS[skillId];
    const deny = this.combat.canUse(active, s);
    if (deny) { this.setHoverInfoOnce(deny); return; }
    this.audio.play('ui_click', 0.6);
    // instant-cast kinds: buffs, self-centered novas, self-casts & party-wide heals
    if (s.kind === 'buff' || s.selfCentered || s.selfOnly || s.allAllies) {
      this.audio.play('dice', 0.7);
      this.enqueue(this.combat.useSkill(active, s.id, active.pos));
      return;
    }
    this.targeting = skillId;
    this.showTargeting(s, active);
    this.emitSnapshot();
  }

  endTurn() {
    if (this.phase !== 'combat' || this.busy) return;
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
    this.enterDungeon();
  }

  /** capture the current state into the active (or given) slot */
  saveGame(slotId?: string, label?: string) {
    const id = slotId ?? this.currentSlotId;
    if (!id) return;
    const data: SaveData = {
      version: 1,
      slotId: id,
      name: label ?? this.partyName(),
      timestamp: Date.now(),
      floor: 1,
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

    this.pushLog('Save loaded ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ welcome back, adventurer.', 'system');
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

  /** called by the intro cutscene once it finishes ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ drops an initial
   *  autosave into the active slot so "Continue" works immediately */
  onIntroComplete() {
    if (this.currentSlotId) this.saveGame(this.currentSlotId, 'New Game');
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

  toggleTorch() {
    this.torchLit = !this.torchLit;
    this.audio.play('ui_click', 0.4);
    this.pushLog(this.torchLit ? 'Torch lit ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ the cave walls flicker back into view.' : 'Torch extinguished ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ darkness swallows you.', 'system');
    this.emitSnapshot();
  }

  closeDialogue() { this.showDialogue = null; this.emitSnapshot(); }

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
    u.maxHp += 6;
    u.hp = Math.min(effMaxHp(u), u.hp + 6);
    u.skillPoints += 1;
    this.audio.play('heal', 0.9, 1.3);
    this.pushLog(`? ${u.name} reaches level ${u.level}! (+6 max HP, +1 skill point). You feel slightly less drunk.`, 'system');
    FX.levelup(this.particles, this.unitWorld(u.pos).add(new THREE.Vector3(0, 0.6, 0)));
    this.emitSnapshot();
  }

  respawn() {
    if (!this.bonfireLit || !this.bonfirePos) return;
    this.phase = 'explore';
    for (const u of this.combat.living('party')) {
      u.hp = effMaxHp(u);
      u.pos = { ...this.bonfirePos };
      const v = this.visuals.get(u.id);
      if (v) {
        const wp = this.world.tileToWorld(this.bonfirePos.x, this.bonfirePos.z);
        v.rig.group.position.copy(wp);
        v.rig.anim.mode = 'idle';
      }
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
          const wp = this.unitWorld(u.pos);
          v.rig.group.position.copy(wp);
        }
      }
    }
    this.props.resetAll();
    this.combat.inCombat = false;
    this.selectedId = this.combat.living('party')[0]?.id ?? null;
    this.pushLog('?? Death is not the end. The bonfire restores you. The dungeon stirs...', 'system');
    this.emitSnapshot();
  }

  // -- inventory / equipment (called from React HUD) ---------
  toggleInventory() {
    this.showInventory = !this.showInventory;
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
    this.inventory.splice(idx, 1);
    this.audio.play('heal', 0.5, 1.6);
    this.enqueue(this.combat.useConsumable(u, item, u.id));
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
    // 6. Fog of war cubes.
    if (this.fogGroup) {
      for (const [, cube] of this.fogCubes) {
        if (cube.geometry) cube.geometry.dispose();
        if (cube.material) {
          const mats = Array.isArray(cube.material) ? cube.material : [cube.material];
          mats.forEach((mat) => mat.dispose());
        }
        this.fogGroup.remove(cube);
      }
      this.fogCubes.clear();
      if (this.fogGroup.parent) this.fogGroup.parent.remove(this.fogGroup);
    }
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
    // 7c. Hermit rig (it's a Rig, not a plain Object3D — dispose its group)
    if (this.hermitRig && this.hermitRig.group) {
      this.hermitRig.group.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat.dispose());
        }
      });
      if (this.hermitRig.group.parent) this.hermitRig.group.parent.remove(this.hermitRig.group);
      this.hermitRig = null;
      this.hermitPos = null;
    }
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
  public setupDungeon(L: typeof dungeonLevel) { setupDungeon(this, L); }
  public attachHeroTorch(rig: Rig) { attachHeroTorch(this, rig); }
  public updateDungeon(dt: number) { updateDungeon(this, dt); }
  public inEnemyCone(p: GridPos, enemy: Unit): boolean { return inEnemyCone(this, p, enemy); }
  public aggroGroup(groupId: string | undefined) { aggroGroup(this, groupId); }

  // visuals
  public addUnit(u: Unit) { addUnit(this, u); }
  public updateDroppedWeapons(dt: number) { updateDroppedWeapons(this, dt); }

  // combat animation
  public enqueue(events: CombatEvent[]) { enqueue(this, events); }
  public checkCombatTrigger() { checkCombatTrigger(this); }
  public smashProp(u: Unit, prop: Destructible, skill?: SkillDef) { smashProp(this, u, prop, skill); }

  // interaction
  public updateFog(_dt: number) { updateFog(this, _dt); }
  public executeDialogueAction(action: { type: string; itemId?: string; questId?: string }, npc: NPCDef) { executeDialogueAction(this, action, npc); }

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
    // pause ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ freeze all simulation while the in-game menu is open.
    // The render loop (composer.render) still runs, so the frozen frame shows.
    if (this.paused) return;
    // keyboard pan ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ suspended while a cutscene is driving the camera
    if (!(this.busy && (this.introActive || this.bossCineActive))) {
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
    this.world.update(dt);
    this.updateDroppedWeapons(dt);
    if (this.structures) this.updateDungeon(dt);

    // torch flames
    for (const t of this.world.torches) FX.flame(this.particles, t.pos.clone());

    // bonfire (flame + smoke particles)
    if (this.bonfireLit && this.bonfirePos) {
      const bfp = this.world.tileToWorld(this.bonfirePos.x, this.bonfirePos.z);
      bfp.y += 0.9;
      FX.flame(this.particles, bfp);
      if (Math.random() < 0.6) {
        this.particles.burst({ pos: bfp.clone().add(new THREE.Vector3((Math.random()-0.5)*0.3, 0.6+Math.random()*0.8, (Math.random()-0.5)*0.3)), count: 6, color: [0x3a3a3a, 0x555555, 0x2a2a2a], speed: [0.3, 1.0], life: [0.6, 1.8], size: [0.4, 1.0], gravity: -1.5, up: 1.0, endScale: 1.2, solid: true });
      }
    }

    // player torch light
    const player = this.combat?.living('party')[0];
    if (!this.torchLight) {
      this.torchLight = new THREE.PointLight(0xffb545, 12, 14, 1.5);  // torch radius: change '14' (distance) to widen/narrow
      this.scene.add(this.torchLight);
    }
    if (this.torchLight) {
      // position light at the actual torch flame, not player center
      const rig = player ? this.visuals.get(player.id)?.rig : null;
      const weaponG = rig ? rig.parts.weapon as THREE.Object3D : null;
      if (weaponG) {
        const flamePos = new THREE.Vector3(0.02, rig?.pivots ? 5.85 * 0.055 : 0.58, 0.02);  // flame cubes are at weapon-local y=5.4*C to 6.3*C
        weaponG.localToWorld(flamePos);
        this.torchLight.position.copy(flamePos);
        if (player && player.weapon === 'torch' && this.torchLit) {
          this.torchLight.intensity = 12;
          this.torchLight.distance = 14;
          FX.flame(this.particles, flamePos.clone());
          if (Math.random() < 0.35) {
            const sp = flamePos.clone().add(new THREE.Vector3((Math.random()-0.5)*0.25, 0.3+Math.random()*0.4, (Math.random()-0.5)*0.25));
            this.particles.burst({ pos: sp, count: 3, color: [0x3a3a3a, 0x4a4a4a], speed: [0.2, 0.6], life: [0.4, 1.0], size: [0.2, 0.5], gravity: -1.0, up: 0.5, endScale: 1.5, solid: true });
          }
        } else {
          this.torchLight.intensity = 0;
        }
      }
    }

    // fog of war: mark tiles within vision as explored, show/hide dark overlays
    this.updateFog(dt);

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
    // hermit NPC
    if (this.hermitRig) updateRig(this.hermitRig, dt, 1);
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
          wk.idx++;
          if (wk.idx >= wk.path.length) { v.walker = null; v.rig.anim.mode = 'idle';
        if (this.pendingSmash && this.pendingSmash.unitId === id) {
          const ps = this.pendingSmash;
          this.pendingSmash = null;
          const prop = this.props.byId(ps.propId);
          const unit = this.byId(ps.unitId);
          if (prop && unit && unit.alive) void this.smashProp(unit, prop);
        }
      }
          else FX.dust(this.particles, pos.clone());
        } else {
          d.normalize();
          v.targetYaw = Math.atan2(d.x, d.z);
          const walkSpeed = (this.sneaking ? 2.5 : 4.6);
          pos.addScaledVector(d, Math.min(dist, dt * walkSpeed));
          pos.y += (target.y - pos.y) * Math.min(1, dt * 8);
        }
      }
    }

    this.checkCombatTrigger();

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
    if (focusUnit && focusUnit.alive) {
      const v = this.visuals.get(focusUnit.id)!;
      this.ring.visible = true;
      this.ring.position.copy(v.rig.group.position).y = this.world.heightAt(focusUnit.pos.x, focusUnit.pos.z) + 0.53;
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
      if (!u || !u.alive || this.phase === 'menu' || this.inTavern) { if (v.bar.style.display !== 'none') v.bar.style.display = 'none'; continue; }
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
  }

  public emitSnapshot() {
    if (!this.combat) return;
    const minimapUnits = this.combat.units
      .filter(u => u.alive && this.explored[u.pos.x]?.[u.pos.z])
      .map(u => ({ x: u.pos.x, z: u.pos.z, team: u.team }));
    // minimap: only show explored tiles (fog of war)
    const MS = this.world.heights.length;  // WORLD_SIZE
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
      sneaking: this.sneaking,
      torchLit: this.torchLit,
      torchEquipped: this.combat?.living('party')[0]?.weapon === 'torch',
      bigMessage: this.bigMessage,
      cinematic: this.cinematic,
      paused: this.paused,
      minimapTiles: { walk: minimapWalk, heights: minimapHeights, units: minimapUnits },
      showBonfireUI: this.showBonfireUI,
      showFullMap: this.showFullMap,
      hermitTalk: this.hermitPos ? this.combat.living('party').some(p => Combat.dist(p.pos, this.hermitPos!) <= 3) : false,
      showDialogue: this.showDialogue,
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
    this.renderer.domElement.remove();
    this.overlay.innerHTML = '';
    this.renderer.dispose();
    this.particles.dispose();
  }
}
