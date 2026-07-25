// ─────────────────────────────────────────────────────────────
// GameEngine — presentation & orchestration layer.
//   combat.ts  → decides WHAT happens (events)
//   engine.ts  → decides HOW it looks/sounds (this file)
// React talks to the engine only through UISnapshot + method calls.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VoxelWorld, WORLD_SIZE } from './world';
import { dungeonLevel } from '../levels/dungeon';
import { buildIronDoor, buildGoldenChest, buildLever, buildRubble, buildStoneBath, buildWeaponRack } from './dungeonProps';
import { ParticleSystem, FX } from './particles';
import { buildCharacter, updateRig, setWeapon, type Rig } from './characters';
import { Combat } from './combat';
import { SKILLS, CONDITIONS, createRoster } from './skills';
import { AudioManager } from './audio';
import { DestructibleManager, type Destructible } from './destructibles';
import { makeItem, rollLootTable, type Item } from './items';
import type { LevelStructures } from '../levels/levelTypes';
import { effMaxHp } from './stats';
import { SaveManager, SettingsManager, type GameSettings, type SaveData, type SaveSlotMeta } from './save';
import { canUnlock, treeFor } from './skilltree';
import { TrapManager } from './traps';
import { rollDice } from './dice';
import { Vox, type Voxel } from './voxelModels.mjs';
import type { CombatEvent, GamePhase, GridPos, LogEntry, SkillDef, UISnapshot, Unit } from './types';
import { NPCS, type NPCDef } from './npc';
import { QuestLog, QUESTS } from './quest';
import { CutsceneDirector, setupTitleScene, runTitleNarration, type CutsceneHost } from './cutscenes';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── voxel helper: build a merged vertex-coloured mesh from voxel data ──
const VOX_C = 0.055;
const extMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const extEmissiveMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const tmpCol = new THREE.Color();
function voxelMesh(voxels: Voxel[], emissive = false): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  for (const vx of voxels) {
    const g = new THREE.BoxGeometry(VOX_C, VOX_C, VOX_C);
    g.translate(vx.x * VOX_C, vx.y * VOX_C, vx.z * VOX_C);
    tmpCol.setHex(vx.c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  const m = new THREE.Mesh(merged, emissive ? extEmissiveMat : extMat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// voxel mesh at an arbitrary cube size, BOTTOM-anchored: grid y = the voxel's
// lower face (a voxel at gy occupies world y in [gy*cube, (gy+1)*cube]). This is
// what the tavern interior uses so props sit flush on the floor (floor = gy -1,
// everything on it starts at gy 0) with zero y-clipping.
function voxelMeshC(voxels: Voxel[], cube: number, emissive = false): THREE.Mesh {
  if (!voxels.length) return new THREE.Mesh(new THREE.BufferGeometry(), emissive ? extEmissiveMat : extMat);
  const geos: THREE.BufferGeometry[] = [];
  for (const vx of voxels) {
    const g = new THREE.BoxGeometry(cube, cube, cube);
    g.translate(vx.x * cube, (vx.y + 0.5) * cube, vx.z * cube);
    tmpCol.setHex(vx.c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  const m = new THREE.Mesh(merged, emissive ? extEmissiveMat : extMat);
  m.castShadow = !emissive; m.receiveShadow = true;
  return m;
}
// additive halo texture for windows / light glows
let extHaloTex: THREE.Texture | null = null;
function extHalo(): THREE.Texture {
  if (extHaloTex) return extHaloTex;
  const s = 64;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = s;
  const ctx = cvs.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,200,120,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  extHaloTex = new THREE.CanvasTexture(cvs);
  return extHaloTex;
}
// build a voxel tree (trunk + layered foliage) into a shared Vox store
function voxTree(v: Vox, tx: number, tz: number, sc: number, trunk: number, trunkD: number, leaf: number, leafHi: number) {
  const h = Math.round(16 * sc);
  for (let y = 0; y < h; y++) {
    const r = y < 3 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
      if (dx * dx + dz * dz <= r * r + 0.5) v.add(tx + dx, y, tz + dz, (y % 3 === 0) ? trunkD : trunk);
  }
  const fy = h;
  v.ellipsoid(tx, fy + 1, tz, Math.round(5 * sc), Math.round(2 * sc), Math.round(5 * sc), leaf);
  v.ellipsoid(tx, fy + 5, tz, Math.round(4 * sc), Math.round(2 * sc), Math.round(4 * sc), leafHi);
  v.ellipsoid(tx, fy + 9, tz, Math.round(3 * sc), Math.round(2 * sc), Math.round(3 * sc), leaf);
  v.ellipsoid(tx, fy + 13, tz, Math.round(2 * sc), Math.round(2 * sc), Math.round(2 * sc), leafHi);
}
// build a voxel bush (rounded) into a shared Vox store
function voxBush(v: Vox, bx: number, bz: number, r: number, bush: number, bushHi: number) {
  v.ellipsoid(bx, 1, bz, r, Math.round(r * 0.5), r, bush);
  v.ellipsoid(bx + 1, 2, bz, Math.round(r * 0.5), Math.round(r * 0.3), Math.round(r * 0.5), bushHi);
}
// a glowing point with a soft additive sprite halo + warm light (for windows / candle)
function extGlow(g: THREE.Group, color: number, x: number, y: number, z: number, lightI = 1.0, lightDist = 7, haloScale = 0.9) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: extHalo(), color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  spr.scale.setScalar(haloScale);
  spr.position.set(x, y, z);
  g.add(spr);
  const l = new THREE.PointLight(color, lightI, lightDist, 1.6);
  l.position.set(x, y, z);
  g.add(l);
}

// ── isometric tactical camera rig ────────────────────────────
class IsoCamera {
  cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  desiredTarget = new THREE.Vector3();
  yaw = Math.PI * 0.25;
  desiredYaw = Math.PI * 0.25;
  dist = 15;
  desiredDist = 15;
  pitch = 0.96; // ~55°
  desiredPitch = 0.96;
  lerp = 7;     // easing speed — lowered during cinematics for slow, smooth moves
  shake = 0;
  // optional world-space AABB the *camera* is clamped inside (used to keep the
  // cinematic framed inside the small tavern set instead of clipping through walls)
  box: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number } | null = null;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(36, aspect, 0.1, 200);
  }
  rotate(dir: 1 | -1) { this.desiredYaw += (Math.PI / 4) * dir; }
  zoom(d: number) { this.desiredDist = THREE.MathUtils.clamp(this.desiredDist + d, 8, 30); }
  pan(dx: number, dz: number) {
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = new THREE.Vector3(f.z, 0, -f.x);
    this.desiredTarget.addScaledVector(r, dx).addScaledVector(f, dz);
    this.clampTarget();
  }
  focus(p: THREE.Vector3) { this.desiredTarget.copy(p); this.clampTarget(); }
  private clampTarget() {
    const m = WORLD_SIZE / 2 - 2;
    this.desiredTarget.x = THREE.MathUtils.clamp(this.desiredTarget.x, -m, m);
    this.desiredTarget.z = THREE.MathUtils.clamp(this.desiredTarget.z, -m, m);
  }
  update(dt: number) {
    const k = Math.min(1, dt * this.lerp);
    this.target.lerp(this.desiredTarget, k);
    this.yaw += (this.desiredYaw - this.yaw) * k;
    this.dist += (this.desiredDist - this.dist) * k;
    this.pitch += (this.desiredPitch - this.pitch) * k;
    const p = this.cam.position;
    p.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist,
    );
    if (this.shake > 0.002) {
      p.x += (Math.random() - 0.5) * this.shake;
      p.y += (Math.random() - 0.5) * this.shake;
      p.z += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.max(0, 1 - dt * 5);
    }
    if (this.box) {
      p.x = THREE.MathUtils.clamp(p.x, this.box.minX, this.box.maxX);
      p.z = THREE.MathUtils.clamp(p.z, this.box.minZ, this.box.maxZ);
      p.y = THREE.MathUtils.clamp(p.y, this.box.minY, this.box.maxY);
    }
    this.cam.lookAt(this.target);
  }
}

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
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene = new THREE.Scene();
  private iso!: IsoCamera;
  private world!: VoxelWorld;
  private props!: DestructibleManager;
  private particles = new ParticleSystem();
  private combat!: Combat;
  readonly audio = new AudioManager();

  private visuals = new Map<string, UnitVisual>();
  private droppedWeapons: DroppedWeapon[] = [];
  private pickables: THREE.Object3D[] = [];
  private unitProxies: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private hlPool: { mesh: THREE.Mesh; cat: string }[] = [];
  private hlGroup = new THREE.Group();
  private hlMats: Record<string, THREE.MeshBasicMaterial> = {};
  private ring!: THREE.Mesh;
  private clickPing!: THREE.Mesh;
  private clickPingT = 1;

  private phase: GamePhase = 'menu';
  private selectedId: string | null = null;   // explore-mode leader
  private targeting: string | null = null;    // skill id being aimed
  private moveTiles = new Map<string, GridPos[]>(); // reachable cache for active unit
  private queue: CombatEvent[] = [];
  private busy = false;
  private floaters: Floater[] = [];
  private log: LogEntry[] = [];
  private logSeq = 0;
  private loot: string[] = [];            // victory-screen recap lines
  private inventory: Item[] = [];
  private gold = 0;
  private showInventory = false;
  private showSkillTree = false;
  private questLog = new QuestLog();
  private hermitRig: Rig | null = null;
  private hermitPos: GridPos | null = null;
  private showDialogue: { npcId: string; npcName: string; text: string; caption?: string; choices?: { label: string; index: number }[] } | null = null;
  private sneaking = false;
  private crouchLerp = 0;
  private torchLit = true;
  private torchLight: THREE.PointLight | null = null;
  private bonfireGroup: THREE.Group | null = null;
  private bonfirePos: GridPos | null = null;
  private bonfireLit = false;
  private defeatedSpecialMobs = new Set<string>();
  private showBonfireUI = false;
  private restingAtBonfire = false;
  private pendingSmash: { unitId: string; propId: string } | null = null;
  private bigMessage: string | null = null;
  private cinematic = false;

  // ── save / load ──
  /** global audio settings (persisted, shared across all slots) */
  private settings: GameSettings = SettingsManager.load();
  /** the slot the current playthrough is being saved into (null until a
   *  new game is started or a save is loaded) */
  private currentSlotId: string | null = null;
  /** true while the in-game pause menu is open — simulation is frozen */
  private paused = false;

  /** show a subtitle styled for cutscenes (small, readable, lingers) */
  private showCine(text: string) { this.bigMessage = text; this.cinematic = true; this.emitSnapshot(); }
  private clearCine() { this.bigMessage = null; this.cinematic = false; this.emitSnapshot(); }

  /** play a pre-generated narrator line (edge-tts mp3) under a subtitle. Falls
   *  back to text-only if the asset is missing, so the scene always works. */
  /** skip-aware wait: resolves immediately once cutsceneSkip is set */
  private cineDelay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.cutsceneSkip) return resolve();
      const t = setTimeout(resolve, ms);
      const iv = setInterval(() => {
        if (this.cutsceneSkip) { clearTimeout(t); clearInterval(iv); resolve(); }
      }, 40);
    });
  }

  private async narrate(id: string, text: string, minMs = 4200) {
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
    } catch { /* asset missing → text only */ }
    await this.cineDelay(Math.max(minMs, dur));
  }

  /** a full-screen black fade (0..1) for scene transitions */
  private fadeTo(v: number) {
    if (!this.fadeEl) {
      this.fadeEl = document.createElement('div');
      this.fadeEl.className = 'cine-fade';
      // mount inside .game-root so it layers between canvas and HUD (captions)
      (this.container.parentElement ?? document.body).appendChild(this.fadeEl);
    }
    this.fadeEl.style.opacity = String(v);
  }
  private hoverInfo: string | null = null;
  private keys = new Set<string>();
  private enemyCones: { mesh: THREE.Mesh; yaw: number; targetYaw: number; unitId: string }[] = [];
  private playerCone!: THREE.Mesh;
  private coneGeo!: THREE.BufferGeometry;
  private playerConeGeo!: THREE.BufferGeometry;
  private detectionMeter = new Map<string, Map<string, number>>();
  private trapManager!: TrapManager;
  private disposed = false;
  private raf = 0;
  private lastT = 0;
  private chest: THREE.Group | null = null;

  // ── dungeon interactables & quest state ──
  private structures: LevelStructures | null = null;
  private heroLight: THREE.PointLight | null = null;
  private heroTorchFlame: THREE.Mesh | null = null;
  private torchT = 0;
  private ironDoor: THREE.Group | null = null;
  private goldenChest: THREE.Group | null = null;
  private secretChestMesh: THREE.Group | null = null;
  private leverMesh: THREE.Group | null = null;
  private weaponRack: THREE.Group | null = null;
  private rackClub: THREE.Object3D | null = null;
  private rubbleMeshes: { mesh: THREE.Group; tile: GridPos }[] = [];
  private propAnims: ((dt: number) => boolean)[] = [];   // returns true when finished
  private ironDoorOpen = false;
  private secretOpen = false;
  private goldenChestOpen = false;
  private secretChestOpen = false;
  private bossCutscenePlayed = false;
  private introPlayed = false;
  private introActive = false;
  private titleIdle = false;
  private introSkipped = false;
  private bossCineActive = false;
  private cutsceneSkip = false;
  private tavern: THREE.Group | null = null;
  private tavernRigs: Rig[] = [];
  private tavernActors: Record<string, Rig> = {};
  private inTavern = false;
  private fadeEl: HTMLElement | null = null;
  private hasIronKey = false;
  private hasGoldenKey = false;
  private gameWon = false;

  // ── fog of war ─────────────────────────────────────────────
  /** tiles the player has seen at least once */
  private explored: boolean[][] = [];
  /** dark overlay meshes covering unexplored tiles (indexed by "x,z") */
  private fogGroup: THREE.Group | null = null;
  private fogCubes: Map<string, THREE.Mesh> = new Map();
  /** vision radius (tiles) — torch extends it; base is a small cone */
  private visionRadius = 6;

  // ── cheat console ──────────────────────────────────────────
  /** when true the camera continuously follows the party leader */
  private followCam = false;
  /** proximity aggro is OFF by default — the player explores freely;
   *  toggle with the `noaggro` console command */
  private aggroDisabled = true;
  private showFullMap = false;
  /** console overlay open? (backtick key) */
  private consoleOpen = false;
  /** current console input line */
  private consoleInput = '';
  /** god-mode flag — party takes no damage */
  private godMode = false;

  // ── cutscene runtime extensions ───────────────────────────
  /** "skip combat glitch" grace window: after a skipped intro, suppress
   *  proximity aggro until this monotonic-time cutoff passes so Greg has
   *  a beat to step away from the dormant rats. */
  private introGraceUntil = 0;
  /** the single object that routes/dispatches every cinematic, kept in
   *  src/game/cutscenes.ts so engine.ts doesn't bloat as scenes multiply. */
  private cutsceneDirector: CutsceneDirector | null = null;
  /** stable CutsceneHost adapter — kept so the splash can drive the title
   *  sequence in two phases (setup backdrop, then run narration on enter). */
  private cutsceneHost!: CutsceneHost;
  /** the tavern-exterior group + previous background while the splash is up */
  private titleExt: THREE.Group | null = null;
  private titlePrevBg: any = null;
  /** one-time window listener that resumes audio + starts the tavern theme on
   *  the first interaction anywhere on the splash (autoplay needs a gesture) */
  private splashAudioHandler: (() => void) | null = null;

  private container: HTMLDivElement;
  private overlay: HTMLDivElement;
  private onSnapshot: (s: UISnapshot) => void;

  constructor(container: HTMLDivElement, overlay: HTMLDivElement, onSnapshot: (s: UISnapshot) => void) {
    this.container = container;
    this.overlay = overlay;
    this.onSnapshot = onSnapshot;
  }

  // ══ setup ═════════════════════════════════════════════════
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

    // lights — cave (dim ambient + no sun + crystal/torch fills)
    const hemi = new THREE.HemisphereLight(0x93a8d0, 0x3a3226, L.ambient);
    this.scene.add(hemi);
    if (L.sun > 0) {
      const sun = new THREE.DirectionalLight(0xffc890, L.sun);
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

    // world — underground cave level
    this.world = new VoxelWorld(dungeonLevel, 1337);
    this.scene.add(this.world.group);

    // ── fog of war: initialize the explored grid (all dark) + overlay group ──
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

    // destructible props (crates/barrels/vases) — mark tiles blocked
    this.props = new DestructibleManager(this.world);
    this.scene.add(this.props.group);

    // vision cones — pre-built geometry reused per frame
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

    // wire the cutscene director — every cinematic runs through this one
    // object (the engine only implements the CutsceneHost API; all scene
    // scripts live in src/game/cutscenes.ts)
    this.cutsceneHost = this.buildCutsceneHost();
    this.cutsceneDirector = new CutsceneDirector(this.cutsceneHost);

    // ── splash: build the animated tavern-exterior backdrop immediately so it
    //    sits behind the HTML splash overlay (title + "Enter the Dungeon").
    //    The narration + interior cutscene run later, on enterDungeon(), so the
    //    front-of-tavern view continues seamlessly once the title fades.
    const title = setupTitleScene(this.cutsceneHost);
    this.titleExt = title.ext;
    this.titlePrevBg = title.prevBg;

    // ── splash audio: start the tavern theme on the FIRST user interaction
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

  private spawnUnits() {
    this.combat.units = dungeonLevel.makeRoster ? dungeonLevel.makeRoster() : createRoster();
    for (const u of this.combat.units) this.addUnit(u);
  }

  /**
   * Build the `CutsceneHost` adapter — a small stable surface that
   * every cinematic script in src/game/cutscenes.ts talks to. The
   * engine implements every capability itself (its private helpers);
   * the adapter just delegates. Add new cutscenes without changing
   * the engine beyond this method.
   */
  private buildCutsceneHost(): CutsceneHost {
    const self = this;
    return {
      // ── read-only references ──
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
      get canvas() { return self.renderer.domElement; },
      get fadeEl() { return self.fadeEl; },
      get heroLight() { return self.heroLight; },

      // ── mutable engine state ──
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

      // ── audio utilities (bound) ──
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

      // ── narration + timing ──
      cineDelay: (ms) => self.cineDelay(ms),
      narrate: (id, text, minMs) => self.narrate(id, text, minMs),
      showCine: (text) => self.showCine(text),
      clearCine: () => self.clearCine(),
      markSkipped: () => { self.cutsceneSkip = true; self.introSkipped = true; },
      resetSkipState: () => { self.cutsceneSkip = false; self.introSkipped = false; },
      fadeTo: (v) => self.fadeTo(v),

      // ── math + transforms ──
      unitWorld: (pos) => self.unitWorld(pos),
      animateTo: (g, s, t, d) => self.animateTo(g, s, t, d),
      faceToward: (v, t, snap) => self.faceToward(v as unknown as UnitVisual, t, snap),
      walkRigTo: (v, tile, dur) => self.walkRigTo(v as unknown as UnitVisual, tile, dur),
      setWeapon: (rig, kind, accent) => setWeapon(rig, kind as any, accent),

      // ── fx ──
      spawnStars: (p) => self.spawnStars(p),
      splashBurst: (p, n) => self.splashBurst(p, n),
      waterPlink: (p) => self.waterPlink(p),
      launchMagicMissile: (from, to) => self.launchMagicMissile(from, to),
      passOut: (dur) => self.passOut(dur),

      // ── attachables / build helpers ──
      attachHeroTorch: (rig) => self.attachHeroTorch(rig),
      buildSheep: () => self.buildSheep(),
      buildTavern: () => self._buildTavern(),
      buildTavernExterior: () => self.buildTavernExterior(),
      barmaidServe: (bar) => self.barmaidServe(bar),

      // ── log / UI / queue ──
      pushLog: (t, k) => self.pushLog(t, k ?? 'system'),
      emitSnapshot: () => self.emitSnapshot(),
      enqueue: (events) => self.enqueue(events),

      // ── engine lifecycle hooks ──
      // record the bonfire's location as the respawn checkpoint, but leave it
      // UNLIT — the player must click it to light it (see clickExplore/lightBonfire)
      setBonfireCheckpoint: (pos) => { self.bonfirePos = { ...pos }; },
      armIntroGrace: (secs) => { self.introGraceUntil = (performance.now() / 1000) + secs; },
      onIntroComplete: () => self.onIntroComplete(),
    };
  }

  // ══ dungeon set-up & interactables ════════════════════════
  private setupDungeon(L: typeof dungeonLevel) {
    const st = L.structures;
    if (!st) return;
    this.structures = st;

    const place = (g: THREE.Group, tile: GridPos, yOff = 0) => {
      const wp = this.unitWorld(tile);
      g.position.set(wp.x, wp.y + yOff, wp.z);
      this.scene.add(g);
    };

    // iron door — seals the boss room until the iron key is looted
    const axis: 'x' | 'z' = (this.world.isWalkable(st.bossDoor.x - 1, st.bossDoor.z) || this.world.isWalkable(st.bossDoor.x + 1, st.bossDoor.z)) ? 'z' : 'x';
    this.ironDoor = buildIronDoor(axis);
    place(this.ironDoor, st.bossDoor);
    this.world.blocked[st.bossDoor.x][st.bossDoor.z] = true;

    // the warlord's bath (decor) — the boss spawns sitting in it
    place(buildStoneBath(), st.bossBath);

    // weapon rack holding Gorruk's greatclub, just east of the bath — he wades
    // over and seizes it during the cutscene. Face it toward the bath.
    this.weaponRack = buildWeaponRack();
    this.weaponRack.rotation.y = -Math.PI / 2;
    place(this.weaponRack, { x: st.bossBath.x + 2, z: st.bossBath.z });
    this.rackClub = (this.weaponRack.userData.club as THREE.Object3D) ?? null;

    // start the boss lounging & unarmed: seat him low and stow his club on the
    // rack, so the cutscene can play the rise → wade → grab beats truthfully.
    const bossU = this.combat.units.find((u) => u.bossGroup && u.dropKey === 'golden');
    const bv = bossU ? this.visuals.get(bossU.id) : null;
    if (bossU && bv) {
      setWeapon(bv.rig, null, bossU.scheme.accent);
      bv.rig.anim.crouch = 1.15;                       // sunk down in the tub
      bv.yaw = bv.targetYaw = -Math.PI / 2;            // face west (the entrance)
      bv.rig.group.rotation.y = bv.yaw;
    }

    // golden chest (boss reward) + secret-room stash chest
    this.goldenChest = buildGoldenChest();
    place(this.goldenChest, st.goldenChest, 0.02);
    this.secretChestMesh = buildGoldenChest();
    place(this.secretChestMesh, st.secretChest, 0.02);

    // lever + rubble sealing the secret room
    this.leverMesh = buildLever();
    place(this.leverMesh, st.secretLever);
    for (const t of st.secretRubble) {
      const r = buildRubble(0.3 + t.x * 0.07 + t.z * 0.03);
      place(r, t);
      this.world.blocked[t.x][t.z] = true;
      this.rubbleMeshes.push({ mesh: r, tile: t });
    }

    // ── Old Merv the hermit ──
    if (st.hermitChamber) {
      this.hermitPos = { ...st.hermitChamber };
      const hermitScheme = NPCS.hermit_merv.scheme;
      const rig = buildCharacter(hermitScheme);
      const wp = this.unitWorld(st.hermitChamber);
      rig.group.position.set(wp.x, wp.y, wp.z);
      rig.group.rotation.y = 0;
      rig.group.userData.baseY = wp.y;
      rig.anim.mode = 'idle';
      this.scene.add(rig.group);
      this.hermitRig = rig;
      const bb = new THREE.Box3().setFromObject(rig.group);
      const rigH = Math.max(0.7, isFinite(bb.max.y - bb.min.y) ? bb.max.y - bb.min.y : 1.8);
      const rigR = Math.max(0.45, Math.min(0.9, isFinite(bb.max.x - bb.min.x) ? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 0.15 : 0.5));
      const yOff = (isFinite(bb.min.y) ? bb.min.y - wp.y : 0) + rigH / 2;
      const proxy = new THREE.Mesh(
        new THREE.CylinderGeometry(rigR, rigR, rigH, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.userData.hermitNpc = true;
      proxy.position.copy(wp).y += yOff;
      this.scene.add(proxy);
      this.unitProxies.push(proxy);
    }

  }

  /** Mount a burning torch in the hero's off-hand; its point light is the
   *  warm glow that lets the lone warrior see through the dark warren. */
  private attachHeroTorch(rig: Rig) {
    const hand = rig.parts.handL ?? rig.parts.armL;
    if (!hand) return;
    const torch = new THREE.Group();
    // voxel torch stick (replaces CylinderGeometry)
    const stick = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.5, 0.04),
      new THREE.MeshLambertMaterial({ color: 0x5a3a1e }),
    );
    stick.position.y = 0.22; torch.add(stick);
    // voxel wrap (replaces CylinderGeometry)
    const wrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.13, 0.10),
      new THREE.MeshLambertMaterial({ color: 0x2a1a0e }),
    );
    wrap.position.y = 0.48; torch.add(wrap);
    // voxel flame (replaces ConeGeometry)
    const flame = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.34, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffb545 }),
    );
    flame.position.y = 0.68; flame.name = 'hero_flame'; torch.add(flame);
    // voxel flame core (replaces ConeGeometry)
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.2, 0.09),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    core.position.y = 0.7; torch.add(core);
    // NOTE: no PointLight here — Greg must never emit light (see chandelier for scene fill)
    torch.position.set(0, 0.02, 0.06);
    hand.add(torch);
    this.heroTorchFlame = flame;
  }

  private static inRect(p: GridPos, r: { x0: number; z0: number; x1: number; z1: number }) {
    return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
  }

  /** queue a per-frame tween of a numeric property; runs in updateDungeon */
  private animateTo(get: () => number, set: (v: number) => void, target: number, dur: number) {
    let t = 0; const start = get();
    this.propAnims.push((dt) => {
      t = Math.min(dur, t + dt);
      const k = dur > 0 ? t / dur : 1;
      set(start + (target - start) * k);
      return t >= dur;
    });
  }

  private updateDungeon(dt: number) {
    if (!this.structures) return;
    const st = this.structures;
    // run active prop tweens
    if (this.propAnims.length) this.propAnims = this.propAnims.filter((fn) => !fn(dt));

    // hero torch flicker — the point light lives on the hero's hand torch
    if (this.heroLight) {
      this.torchT += dt;
      this.heroLight.intensity = 12.5 + Math.sin(this.torchT * 13) * 1.6 + Math.sin(this.torchT * 27) * 0.8;
      if (this.heroTorchFlame) {
        const s = 1 + Math.sin(this.torchT * 22) * 0.14 + Math.sin(this.torchT * 41) * 0.07;
        this.heroTorchFlame.scale.set(1, s, 1);
      }
    }

    // interactables — only while freely exploring
    if (this.phase !== 'explore' || this.combat.inCombat || this.busy || this.gameWon) return;
    const party = this.combat.living('party');
    const adj = (t: GridPos) => party.some((p) => Combat.dist(p.pos, t) <= 1);

    if (this.leverMesh && !this.secretOpen && adj(st.secretLever)) this.pullLever();
    if (this.ironDoor && !this.ironDoorOpen && adj(st.bossDoor)) {
      if (this.hasIronKey) this.openIronDoor();
      else this.setHoverInfoOnce('A great iron door, locked tight. Somewhere a warden holds its key.');
    }
    if (this.goldenChest && !this.goldenChestOpen && adj(st.goldenChest)) {
      if (this.hasGoldenKey) this.openGoldenChest();
      else this.setHoverInfoOnce('An ornate golden chest. Only a golden key will open it.');
    }
    if (this.secretChestMesh && !this.secretChestOpen && adj(st.secretChest)) this.openSecretChest();
  }

  private openIronDoor() {
    if (!this.structures || !this.ironDoor) return;
    this.ironDoorOpen = true;
    const st = this.structures;
    this.world.blocked[st.bossDoor.x][st.bossDoor.z] = false;
    this.audio.unlock(); this.audio.door();
    const d = this.ironDoor;
    const y0 = d.position.y;
    this.animateTo(() => d.position.y, (v) => { d.position.y = v; }, y0 + (d.userData.openY as number), 1.5);
    this.pushLog('🔓 The iron key turns. The great door grinds down into the floor.', 'system');
    this.bigMessage = 'The Iron Door Opens...';
    this.emitSnapshot();
    setTimeout(() => { this.bigMessage = null; this.emitSnapshot(); }, 2200);
    setTimeout(() => { if (this.ironDoor) { this.scene.remove(this.ironDoor); this.ironDoor = null; } }, 1800);
  }

  private pullLever() {
    if (!this.structures || !this.leverMesh) return;
    this.secretOpen = true;
    const l = this.leverMesh;
    const handle = l.userData.handle as THREE.Group;
    this.animateTo(() => handle.rotation.x, (v) => { handle.rotation.x = v; }, l.userData.pulledAngle as number, 0.4);
    this.audio.lever();
    for (const r of this.rubbleMeshes) {
      this.world.blocked[r.tile.x][r.tile.z] = false;
      const g = r.mesh;
      FX.impactDust(this.particles, g.position.clone().setY(g.position.y + 0.1), [0x6f6a78, 0x413d47]);
      this.animateTo(() => g.scale.y, (v) => { g.scale.set(Math.max(0.01, v), Math.max(0.01, v), Math.max(0.01, v)); }, 0.01, 0.6);
    }
    this.audio.play('sword_hit', 0.4, 0.4);
    setTimeout(() => { for (const r of this.rubbleMeshes) this.scene.remove(r.mesh); this.rubbleMeshes = []; }, 900);
    this.pushLog('🪨 With a grinding crash, the rubble collapses — a hidden passage lies open!', 'system');
    this.bigMessage = 'Secret Passage Revealed!';
    this.emitSnapshot();
    setTimeout(() => { this.bigMessage = null; this.emitSnapshot(); }, 2200);
  }

  private openSecretChest() {
    if (!this.secretChestMesh) return;
    this.secretChestOpen = true;
    const lid = this.secretChestMesh.userData.lid as THREE.Group;
    this.animateTo(() => lid.rotation.x, (v) => { lid.rotation.x = v; }, this.secretChestMesh.userData.openAngle as number, 0.6);
    this.audio.chestOpen();
    const { items, gold } = rollLootTable('secret');
    FX.levelup(this.particles, this.secretChestMesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    this.grantLoot(items, gold);
    this.pushLog(`🗝️ The hidden stash holds: ${[...items.map((i) => `${i.icon} ${i.name}`), `🪙 ${gold} gold`].join(', ')}.`, 'system');
    this.emitSnapshot();
  }

  private openGoldenChest() {
    if (!this.goldenChest) return;
    this.goldenChestOpen = true;
    const lid = this.goldenChest.userData.lid as THREE.Group;
    this.animateTo(() => lid.rotation.x, (v) => { lid.rotation.x = v; }, this.goldenChest.userData.openAngle as number, 0.7);
    this.audio.chestOpen(); this.audio.bossSting();
    const { items, gold } = rollLootTable('goldenkey');
    FX.levelup(this.particles, this.goldenChest.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
    this.grantLoot(items, gold);
    this.pushLog(`👑 The golden chest bursts open: ${[...items.map((i) => `${i.icon} ${i.name}`), `🪙 ${gold} gold`].join(', ')}!`, 'system');
    this.winGame();
  }

  private winGame() {
    this.gameWon = true;
    this.phase = 'victory';
    this.audio.setDrums(false);
    this.audio.setMusicDucked(false);
    this.audio.play('victory', 0.95);
    this.bigMessage = 'VICTORY — The Warlord\'s hoard is yours!';
    this.emitSnapshot();
  }

  private grantKey(kind: 'iron' | 'golden') {
    const id = kind === 'iron' ? 'iron_key' : 'golden_key';
    const it = makeItem(id);
    this.inventory.push(it);
    if (kind === 'iron') this.hasIronKey = true; else this.hasGoldenKey = true;
    this.audio.unlock();
    this.pushLog(`🗝️ You pry the ${it.name} from the fallen.`, 'system');
    this.bigMessage = `${it.icon} ${it.name} obtained!`;
    this.emitSnapshot();
    setTimeout(() => { if (this.bigMessage?.includes(it.name)) { this.bigMessage = null; this.emitSnapshot(); } }, 2400);
  }

  // ══ dungeon aggro & boss cutscene ═════════════════════════
  private checkDungeonAggro() {
    if (!this.structures || this.phase !== 'explore' || this.combat.inCombat || this.busy || this.gameWon) return;
    // aggro is disabled by default — the player explores freely.
    // toggle with the `noaggro` console command (backtick → type noaggro).
    if (this.aggroDisabled) return;
    // intro-skip grace window: after the intro ends (whether naturally or
    // by skipping), suppress proximity aggro for a beat so Greg doesn't
    // instantly get swarmed by the dormant rats in his starter room.
    if (performance.now() / 1000 < this.introGraceUntil) return;
    const st = this.structures;
    const party = this.combat.living('party');
    if (!party.length) return;

    // entering the boss room the first time → the bathing tyrant cutscene
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

  private aggroGroup(groupId: string | undefined) {
    const grp = this.combat.units.filter((u) => u.alive && u.team === 'enemy' && u.dormant && u.groupId === groupId);
    if (!grp.length) return;
    for (const u of grp) u.dormant = false;
    const kind = grp[0].scheme.monster;
    if (kind === 'rat') this.audio.squeak();
    else if (kind === 'bat') this.audio.screech();
    else if (kind === 'skeleton') this.audio.boneRattle();
    else this.audio.roar();
    this.pushLog(`⚔ ${grp.length} ${grp[0].title}${grp.length > 1 ? 's' : ''} lurch from the dark!`, 'system');
    this.enqueue(this.combat.start());
  }

  /** TEMP DEBUG (press B): open the iron door, teleport the party just inside
   *  the boss room and fire the bathing-tyrant cutscene on demand. Remove me. */
  private debugWarpToBoss() {
    if (!this.structures || this.phase === 'menu' || this.gameWon) return;
    const st = this.structures;

    // bail out of any in-progress combat / targeting so the cutscene can run
    this.combat.inCombat = false;
    this.targeting = null;
    this.clearHighlights();
    this.busy = false;
    this.phase = 'explore';
    this.bossCutscenePlayed = true;   // prevent the update loop double-firing it

    // open the iron door (if still sealed) so the party isn't stuck afterwards
    if (this.ironDoor && !this.ironDoorOpen) this.openIronDoor();
    else this.world.blocked[st.bossDoor.x][st.bossDoor.z] = false;

    // teleport every living party member just inside the boss room
    const spots: GridPos[] = [{ x: 31, z: 37 }, { x: 31, z: 39 }, { x: 32, z: 38 }, { x: 33, z: 39 }];
    this.combat.living('party').forEach((u, i) => {
      const t = spots[i % spots.length];
      u.pos = { ...t };
      const v = this.visuals.get(u.id);
      if (v) {
        const wp = this.unitWorld(t);
        v.rig.group.position.copy(wp);
        v.rig.anim.mode = 'idle';
        v.proxy.position.copy(wp).y += (v.proxy.userData.yOff as number) ?? 0.9;
      }
    });

    this.pushLog('🐞 [debug] Warped into the boss room — playing cutscene…', 'system');
    this.selectedId = this.combat.living('party')[0]?.id ?? this.selectedId;
    this.emitSnapshot();
    void this.playBossCutscene();
  }

  // ══ cheat console — press ` to open, type a command, press Enter ══
  /** parse & execute a console command string (already lowercased + trimmed) */
  private executeCheatCommand(cmd: string) {
    if (!cmd) return;
    const parts = cmd.split(/\s+/);
    const op = parts[0];
    const arg = parts[1];
    const hero = this.combat.living('party')[0];
    const reply = (msg: string) => { this.pushLog(`> ${msg}`, 'system'); this.bigMessage = msg; };

    switch (op) {
      case 'noaggro':
        this.aggroDisabled = !this.aggroDisabled;
        reply(`Aggro ${this.aggroDisabled ? 'DISABLED' : 'ENABLED'}`);
        break;
      case 'godmode':
      case 'god':
        this.godMode = !this.godMode;
        this.combat.godMode = this.godMode;
        reply(`God mode ${this.godMode ? 'ON' : 'OFF'}`);
        break;
      case 'superhero':
        if (hero) {
          hero.maxHp = 999; hero.hp = 999; hero.ac = 30;
          hero.abilities = { str: 30, dex: 30, con: 30, int: 30, wis: 30, cha: 30 };
          hero.knownSkills = Object.keys(SKILLS);
          hero.equippedSkills = Object.keys(SKILLS).slice(0, 12);
          hero.level = 20; hero.proficiency = 6; hero.moveRange = 99;
          reply('SUPERHERO! Stats maxed, all skills unlocked.');
        }
        break;
      case 'heal':
        for (const u of this.combat.living('party')) { u.hp = u.maxHp; }
        reply('Party fully healed!');
        break;
      case 'killall':
        for (const u of this.combat.units) { if (u.team === 'enemy') { u.alive = false; u.hp = 0; } }
        reply('All enemies slain!');
        break;
      case 'boss1':
      case 'boss':
        this.debugWarpToBoss();
        reply('Warping to boss…');
        break;
      case 'gold':
        const amt = parseInt(arg ?? '1000', 10);
        this.gold += isNaN(amt) ? 1000 : amt;
        reply(`+${amt} gold (total: ${this.gold})`);
        break;
      case 'levelup':
        if (hero) {
          hero.level += 1; hero.skillPoints += 1;
          hero.maxHp += 10; hero.hp = hero.maxHp;
          reply(`Level up! Now level ${hero.level}.`);
        }
        break;
      case 'reveal':
        // reveal the full map — clear all fog of war
        for (let x = 0; x < this.explored.length; x++)
          for (let z = 0; z < this.explored[x].length; z++)
            this.explored[x][z] = true;
        // remove all fog overlay cubes immediately
        for (const [, cube] of this.fogCubes) this.fogGroup?.remove(cube);
        this.fogCubes.clear();
        reply('Map revealed — fog of war cleared!');
        break;
      case 'help':
        reply('Commands: noaggro, godmode, superhero, heal, killall, boss, gold [amt], levelup, help');
        break;
      default:
        reply(`Unknown command: "${op}". Type "help" for available commands.`);
        break;
    }
    this.emitSnapshot();
    // clear the big-message after 2.5s
    setTimeout(() => { if (this.bigMessage) { this.bigMessage = null; this.emitSnapshot(); } }, 2500);
  }

  // == tavern flashback set (intro cutscene) =====================
  //  "The Dirty Mug" - rebuilt entirely from voxels (no smooth primitives).
  //  GRID CONVENTION (see voxelMeshC): a voxel at grid-y `gy` occupies world
  //  y in [gy*CUBE, (gy+1)*CUBE].  The floor is the single layer at gy = -1, so
  //  its TOP face lands EXACTLY on world-y 0.  Every prop starts at gy >= 0 and
  //  every character stands at world-y 0 -> nothing can clip through the floor.
  private _buildTavern(): THREE.Group {
    const g = new THREE.Group();
    const CUBE = 0.11;
    const v = new Vox();     // lit voxels     (Lambert / vertex colours)
    const ev = new Vox();    // emissive voxels (flames, candles, embers)

    // -- palette (weathered, dingy - an old inn long past its prime) --
    const WOOD = 0x5a3e26, WOOD_D = 0x3a2818, WOOD_M = 0x4a3320, WOOD_L = 0x6e4e30, GRAIN = 0x2c1c10;
    const STONE = 0x4a4540, STONE_D = 0x33302c, SOOT = 0x18130f;
    const IRON = 0x26241f;
    const CLOTH_R = 0x7a2230, CLOTH_B = 0x2e5a7a;
    const BOTTLE = [0x3a6b2a, 0x6b3a2a, 0x2a4a6b, 0x6b2a55, 0x8a7a2a, 0x2a6b5a];
    const GLASS = 0xbfae8a;

    // per-voxel colour jitter -> organic wood/stone grain
    const jit = (c: number, amt = 0.14) => {
      const f = 1 - amt / 2 + Math.random() * amt;
      const r = Math.min(255, ((c >> 16) & 255) * f) | 0;
      const gg = Math.min(255, ((c >> 8) & 255) * f) | 0;
      const b = Math.min(255, (c & 255) * f) | 0;
      return (r << 16) | (gg << 8) | b;
    };

    // -- grid helpers (all coords are INTEGER voxels) --
    const box = (s: Vox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, amt = 0.14) => {
      const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
      const ay = Math.min(y0, y1), by = Math.max(y0, y1);
      const az = Math.min(z0, z1), bz = Math.max(z0, z1);
      for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) s.add(x, y, z, jit(c, amt));
    };
    const cyl = (s: Vox, cx: number, cz: number, y0: number, y1: number, r: number, c: number, amt = 0.12) => {
      for (let y = y0; y <= y1; y++)
        for (let x = Math.ceil(cx - r); x <= Math.floor(cx + r); x++)
          for (let z = Math.ceil(cz - r); z <= Math.floor(cz + r); z++) {
            const dx = (x - cx) / r, dz = (z - cz) / r;
            if (dx * dx + dz * dz <= 1.05) s.add(x, y, z, jit(c, amt));
          }
    };
    const ring = (s: Vox, cx: number, cz: number, y0: number, y1: number, r: number, c: number, thick = 1.3) => {
      const inner = (r - thick) / r;
      for (let y = y0; y <= y1; y++)
        for (let x = Math.ceil(cx - r); x <= Math.floor(cx + r); x++)
          for (let z = Math.ceil(cz - r); z <= Math.floor(cz + r); z++) {
            const dx = (x - cx) / r, dz = (z - cz) / r, d = dx * dx + dz * dz;
            if (d <= 1.05 && d >= inner * inner) s.add(x, y, z, jit(c, 0.12));
          }
    };
    // a four-legged table: top slab at gy 7-8 (world ~0.77-0.99), legs to the floor
    const mkTable = (cx: number, cz: number, hw: number, hd: number) => {
      box(v, cx - hw, 7, cz - hd, cx + hw, 8, cz + hd, WOOD);
      for (const lx of [cx - hw + 1, cx + hw - 1]) for (const lz of [cz - hd + 1, cz + hd - 1]) box(v, lx - 1, 0, lz - 1, lx, 6, lz, WOOD_D);
    };
    // a bar stool: tall seat (top ~0.77) so a seated rig's feet reach the floor;
    // seated characters sit with their group origin at ~0.8 (butt height).
    const mkStool = (cx: number, cz: number) => {
      box(v, cx - 2, 5, cz - 2, cx + 2, 6, cz + 2, WOOD_L);
      for (const lx of [cx - 2, cx + 2]) for (const lz of [cz - 2, cz + 2]) box(v, lx, 0, lz, lx, 4, lz, WOOD_D);
    };

    // room extents (grid). floor top = world 0. front (+Z) left open for the camera.
    const RX = 42;     // half-width  (~4.6 world)
    const ZB = -35;    // back wall   (~-3.85)
    const ZF = 43;     // front edge  (~4.7, open)
    const WH = 33;     // wall height (~3.6)

    // == FLOOR - planks (alternating tone per board) + trodden ale stains ==
    for (let z = ZB; z <= ZF; z++) {
      const board = Math.floor((z + 200) / 4);
      const base = (board & 1) ? WOOD_D : WOOD_M;
      for (let x = -RX; x <= RX; x++) v.add(x, -1, z, jit((z % 4 === 0) ? GRAIN : base, 0.22));
    }
    for (const [sx, sz, sw, sd] of [[-15, 11, 6, 5], [22, -6, 5, 4], [-26, -13, 5, 4], [6, 24, 5, 4]] as const)
      for (let x = sx - sw; x <= sx + sw; x++) for (let z = sz - sd; z <= sz + sd; z++)
        if (Math.random() < 0.6) v.add(x, -1, z, jit(GRAIN, 0.3));

    // == WALLS - back + two sides (single voxel layer) ==
    box(v, -RX, 0, ZB, RX, WH, ZB, STONE);           // back
    box(v, -RX, 0, ZB, -RX, WH, ZF, STONE);          // left
    box(v, RX, 0, ZB, RX, WH, ZF, STONE);            // right
    // dark wainscot / skirting band on every wall
    box(v, -RX, 0, ZB, RX, 8, ZB, WOOD_D);
    box(v, -RX, 0, ZB, -RX, 8, ZF, WOOD_D);
    box(v, RX, 0, ZB, RX, 8, ZF, WOOD_D);
    // vertical timber studs on the back wall (half-timbered feel)
    for (let sx = -RX + 4; sx <= RX - 4; sx += 10) box(v, sx, 0, ZB, sx + 1, WH, ZB, WOOD_M, 0.1);
    // corner posts
    for (const cx of [-RX, RX]) { box(v, cx, 0, ZB, cx, WH, ZB, WOOD_D); box(v, cx, 0, ZF - 2, cx, WH, ZF - 2, WOOD_D); }
    // soot streaks trailing down from the ceiling on the back wall
    for (const sx of [-30, -12, 30]) box(v, sx - 1, WH - 20, ZB, sx + 1, WH, ZB, SOOT, 0.2);
    // ceiling joists (chunky, gaps between for light spill)
    for (const bz of [-29, -14, 0, 14, 29]) box(v, -RX, WH - 2, bz, RX, WH, bz + 1, WOOD_D, 0.1);

    // == RUGS (single layer, gy 0 -> sits flush on the planks) ==
    const rug = (cx: number, cz: number, hw: number, hd: number, c: number) => {
      for (let x = cx - hw; x <= cx + hw; x++) for (let z = cz - hd; z <= cz + hd; z++) {
        const edge = x === cx - hw || x === cx + hw || z === cz - hd || z === cz + hd;
        v.add(x, 0, z, jit(edge ? ((c >> 1) & 0x7f7f7f) : c, 0.1));
      }
    };
    rug(2, 12, 15, 12, 0x5a1f2c);
    rug(-24, 24, 10, 8, 0x243a44);

 // == THE BAR - counter down the left wall, service gap for the barkeep ==
box(v, -42+7, 8, -31, -33+7, 9, 7, WOOD_L);          // continuous bar top  -> -35 .. -26
box(v, -41+7, 0, -31, -34+7, 7, -19, WOOD);          // body segment A     -> -34 .. -27
box(v, -41+7, 0, -6,  -34+7, 7, 7, WOOD);            // body segment B     -> -34 .. -27
box(v, -35+7, 1, -31, -34+7, 2, 7, IRON);           // brass foot-rail    -> -28 .. -27
box(v, -42, 14, -31, -40, 14, 7, WOOD_D);        // back shelf (upper) -> -35 .. -33
box(v, -42, 21, -31, -40, 21, 7, WOOD_D);        // back shelf (lower) -> -35 .. -33
    // bottles on the shelves (bottoms flush on the shelf tops)
    let bi = 0;
    for (const z of [-29, -26, -23, -20, 1, 4]) { cyl(v, -41, z, 15, 18, 1.0, BOTTLE[bi % BOTTLE.length]); bi++; }
    for (const z of [-28, -24, 2, 5]) { cyl(v, -41, z, 22, 25, 1.0, BOTTLE[(bi + 2) % BOTTLE.length]); bi++; }
    // clean glasses lined up on the bar top
    for (const z of [-30, -27, 3, 6]) cyl(v, -37+7, z, 9, 11, 0.9, GLASS);

    // == FIREPLACE - back wall, right of centre (hearth glow behind Greg) ==
    box(v, 14, 0, ZB, 18, 22, ZB + 2, STONE);        // left jamb
    box(v, 30, 0, ZB, 34, 22, ZB + 2, STONE);        // right jamb
    box(v, 14, 18, ZB, 34, 22, ZB + 2, STONE);       // lintel
    box(v, 18, 0, ZB, 30, 18, ZB, SOOT);             // sooty back of the hearth
    box(v, 17, 0, ZB + 1, 31, 1, ZB + 3, STONE_D);   // hearth slab
    box(v, 16, 22, ZB, 32, 30, ZB, SOOT, 0.2);       // smoke stain climbing the wall
    box(v, 20, 1, ZB + 1, 28, 3, ZB + 1, WOOD);      // burning logs
    box(v, 21, 1, ZB + 2, 27, 2, ZB + 2, WOOD_D);
    // voxel flames (emissive), tapering upward
    box(ev, 20, 1, ZB + 1, 28, 4, ZB + 1, 0xff8a2a);
    box(ev, 21, 4, ZB + 1, 27, 7, ZB + 1, 0xffb84a);
    box(ev, 23, 7, ZB + 1, 25, 9, ZB + 1, 0xffd24a);

    // == HANGING BANNERS on the back wall ==
    box(v, -34, 12, ZB, -30, 26, ZB, CLOTH_R);
    box(v, -32, 10, ZB, -32, 11, ZB, CLOTH_R);       // banner point
    box(v, -10, 12, ZB, -6, 26, ZB, CLOTH_B);
    box(v, -8, 10, ZB, -8, 11, ZB, CLOTH_B);

    // == WALL SCONCES (iron bracket + voxel flame) ==
    const sconces: [number, number][] = [[-24, -3.3], [6, -3.3]];
    for (const [gx] of sconces) {
      box(v, gx - 1, 20, ZB, gx + 1, 21, ZB + 1, IRON);
      box(ev, gx, 22, ZB, gx, 24, ZB, 0xffb545);
    }

    // == CHANDELIER above Greg's table (voxel ring + candles + chain) ==
    const chCx = 0, chCz = 10, chGy = 27;
    ring(v, chCx, chCz, chGy, chGy, 7, IRON, 1.6);
    for (let a = 0; a < 6; a++) {
      const cx = Math.round(chCx + Math.cos(a / 6 * Math.PI * 2) * 6);
      const cz = Math.round(chCz + Math.sin(a / 6 * Math.PI * 2) * 6);
      box(v, cx, chGy, cz, cx, chGy + 1, cz, 0xe8e0c8);       // candle
      box(ev, cx, chGy + 2, cz, cx, chGy + 2, cz, 0xffb545);  // flame
    }
    box(v, 0, chGy + 1, chCz, 0, WH, chCz, IRON);            // chain to the ceiling

    // == FURNITURE - Greg's big table + stool, plus two occupied side tables ==
    mkTable(0, 10, 9, 5);     // Greg's table  (world centre ~ (0, ., 1.1))
    mkStool(0, 19);           // Greg's stool  (world ~ (0, ., 1.9))  +10 Z
    mkTable(24, 15, 6, 6);    // the snoozer's table (world ~ (2.6, ., 1.6))
    mkStool(24, 25);          // the snoozer's stool  +10 Z
    // barrels tucked against the right wall
    for (const [bx, bz] of [[38, -27], [39, 27]] as const) {
      cyl(v, bx, bz, 0, 8, 2.8, WOOD);
      ring(v, bx, bz, 1, 1, 3.0, IRON); ring(v, bx, bz, 7, 7, 3.0, IRON);
      box(v, bx - 2, 8, bz - 2, bx + 2, 8, bz + 2, WOOD_M);   // lid
    }

    // -- merge the voxel stores into two meshes (lit + emissive) --
    g.add(voxelMeshC(v.list(), CUBE));
    g.add(voxelMeshC(ev.list(), CUBE, true));

    // == NPCs - every rig stands at world-y 0 (feet flush on the floor) ==
    const faceYaw = (x: number, z: number, tx = 0, tz = 1.9) => Math.atan2(tx - x, tz - z);
    const addNpc = (rig: Rig, x: number, z: number, ry: number, mode: Rig['anim']['mode'], key?: string, y = 0) => {
      rig.group.position.set(x, y, z);
      rig.group.rotation.y = ry;
      rig.group.userData.baseY = y;
      rig.anim.mode = mode;
      g.add(rig.group); this.tavernRigs.push(rig);
      if (key) this.tavernActors[key] = rig;
    };

    // barkeep behind the counter, facing out into the room
    addNpc(buildCharacter({ skin: 0xc98a5a, cloth: 0x2a2230, accent: 0x6b3a1a, hair: 0x20140c, hood: false, kind: 'barkeep' }),
      -4.1, -1.4, Math.PI / 2, 'idle', 'barkeep');
    // nudge the barkeep's head up 1 voxel (0.11 world units) — see headYOffset in characters.ts
    if (this.tavernActors['barkeep']) this.tavernActors['barkeep'].anim.headYOffset = 0.11;
    // barmaid mid-floor, ready to deliver the next round
    addNpc(buildCharacter({ skin: 0xd9a066, cloth: 0xdfe4ea, accent: 0x8b7355, hair: 0x8b3a2a, hood: false, kind: 'barmaid' }),
      -2.2, 0.2, faceYaw(-2.2, 0.2), 'idle', 'barmaid');
    // jumpy wizard in the back-right corner (staff, star hat, white beard)
    addNpc(buildCharacter({ skin: 0xf0d9b5, cloth: 0x4a2a6a, accent: 0x8a4af0, hair: 0xd0d0d0, hood: false, kind: 'wizard' }, 'staff'),
      3.4, -2.8, faceYaw(3.4, -2.8), 'idle', 'wizard');
    // wizard's hat raised 1 voxel (0.11) above its original height
    if (this.tavernActors['wizard']) this.tavernActors['wizard'].anim.hairYOffset = 0.11;
    // wizard holds his staff in the left hand; angle the left forearm 35° (0.61 rad)
    // while the wrist counter-rotates so the staff stays vertical (see updateRig).
    if (this.tavernActors['wizard']) this.tavernActors['wizard'].anim.forearmLOffset = -0.61;
    // retired-orc bouncer by the door
    addNpc(buildCharacter({ skin: 0x5f7a3a, cloth: 0x2a1f1a, accent: 0x1a0f0a, hair: 0x101010, hood: false, kind: 'bouncer', bulk: 1.4 }),
      3.4, 3.2, faceYaw(3.4, 3.2), 'idle', 'bouncer');
    // a patron nursing a drink by the fire
    addNpc(buildCharacter({ skin: 0x8a6a4a, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a, hood: false, style: 'normal' }),
      1.3, -2.5, faceYaw(1.3, -2.5), 'cross', 'patron');
    // a patron already face-down asleep at the side table (comic background)
    addNpc(buildCharacter({ skin: 0x9a7a55, cloth: 0x3a4a5a, accent: 0x2a2a2a, hair: 0x140f0f, hood: false, style: 'normal' }),
      3.1, 1.55, 3.142, 'lie', 'snoozer', 0.1);
    this.spawnDrunkStars(new THREE.Vector3(3.1, 1, 3.1));

    // == LIGHTING - hearth (flickering), chandelier, sconces, soft fill ==
    const fireLight = new THREE.PointLight(0xffa040, 11, 11, 1.8); fireLight.position.set(2.6, 1.0, -3.4); g.add(fireLight);
    const chandLight = new THREE.PointLight(0xffd9a0, 14, 16, 1.5); chandLight.position.set(0, 2.7, 1.1); g.add(chandLight);
    for (const [gx, wz] of sconces) { const l = new THREE.PointLight(0xffb060, 5, 6, 1.7); l.position.set(gx * CUBE, 2.5, wz + 0.2); g.add(l); }
    g.add(new THREE.AmbientLight(0xfff0dd, 0.5));

    // hearth flicker + rising embers (runs only while the tavern exists)
    let fireT = 0;
    this.propAnims.push((dt: number) => {
      if (!this.tavern) return true;
      fireT += dt;
      fireLight.intensity = 11 * (0.78 + Math.sin(fireT * 13) * 0.14 + Math.random() * 0.12);
      if (Math.random() < dt * 7) this.particles.burst({
        pos: new THREE.Vector3(2.6, 0.7, -3.5), count: 2,
        color: [0xff8a2a, 0xffd24a, 0xffae3a], speed: [0.3, 1.3], life: [0.4, 0.9],
        size: [0.06, 0.18], gravity: -1.4, up: 1.6, drag: 0.6, endScale: 0.1,
      });
      return false;
    });

    // points of interest for the cutscene camera (world coords)
    g.userData.poi = {
      gregSeat: new THREE.Vector3(0, 0.8, 2.0),
      gregHead: new THREE.Vector3(0, 2.05, 2.0),
      table: new THREE.Vector3(0, 0.95, 1.1),
      bar: new THREE.Vector3(-3.6, 1.2, -1.0),
      fire: new THREE.Vector3(2.6, 1.3, -3.5),
      wizard: new THREE.Vector3(3.4, 1.35, -2.8),
      bouncer: new THREE.Vector3(3.4, 1.25, 3.2),
      barmaid: new THREE.Vector3(-2.2, 1.2, 0.2),
    };
    return g;
  }

  /** a small fully-voxel sheep, swapped in for Greg during the Polymorph gag */
  private buildSheep(): THREE.Group {
    const g = new THREE.Group();
    const C = 0.11;
    const woolMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const darkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const skinMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const tmpCol = new THREE.Color();
    const addVox = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: number) => {
      const geos: THREE.BoxGeometry[] = [];
      for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
        for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++)
          for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
            const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
            if (dx * dx + dy * dy + dz * dz <= 1.05) {
              const gg = new THREE.BoxGeometry(C, C, C);
              gg.translate(x * C, y * C, z * C);
              const f = 0.92 + Math.random() * 0.12;
              tmpCol.setHex(color).multiplyScalar(f);
              const n = gg.attributes.position.count;
              const arr = new Float32Array(n * 3);
              for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
              gg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
              geos.push(gg);
            }
          }
      if (!geos.length) return;
      const merged = mergeGeometries(geos, false)!;
      geos.forEach((gg) => gg.dispose());
      const m = new THREE.Mesh(merged, color === 0xf2efe6 ? woolMat : (color === 0xc9b89a ? skinMat : darkMat));
      m.position.set(cx * C, cy * C, cz * C);
      m.castShadow = true;
      g.add(m);
    };
    // woolly body (scale 1.3, 1.0, 1.7 in voxel space → rx=11, ry=8, rz=14 approx)
    addVox(0.5, 9.5, 0, 11, 8, 14, 0xf2efe6);
    // wool tufts
    for (const [dx, dy, dz] of [[6, 13, 5], [-6, 13, -3], [3, 15, -6], [-3, 14, 6], [4, 12, -5]] as const) {
      addVox(dx, dy, dz, 3, 3, 3, 0xf2efe6);
    }
    // four legs (box voxels)
    for (const [lx, lz] of [[5, 6], [-5, 6], [5, -6], [-5, -6]] as const) {
      for (let ly = 0; ly < 9; ly++) {
        const g2 = new THREE.BoxGeometry(C, C, C);
        g2.translate(lx * C, ly * C, lz * C);
        const n = g2.attributes.position.count;
        const arr = new Float32Array(n * 3);
        tmpCol.setHex(0x2a2622);
        for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
        g2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        const merged = mergeGeometries([g2], false)!;
        const m = new THREE.Mesh(merged, darkMat);
        m.castShadow = true; g.add(m);
      }
    }
    // head
    addVox(0, 11, 12, 4, 4, 4, 0xc9b89a);
    // ears + eyes
    for (const s of [-1, 1]) {
      addVox(s * 3, 13, 12, 1, 2, 1, 0xc9b89a);
      for (let ey = 11; ey <= 12; ey++) {
        const g2 = new THREE.BoxGeometry(C * 0.8, C * 0.8, C * 0.8);
        g2.translate(s * 1.5 * C, ey * C, 15 * C);
        const n = g2.attributes.position.count;
        const arr = new Float32Array(n * 3);
        tmpCol.setHex(0x2a2622);
        for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
        g2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        const merged = mergeGeometries([g2], false)!;
        const m = new THREE.Mesh(merged, darkMat);
        g.add(m);
      }
    }
    return g;
  }

// (intro cinematic removed from engine — lives in src/game/cutscenes.ts
//  and runs through CutsceneDirector. The title sequence chains into it.)


  /**
   * Title card + intro chain cinematic. The scripts live in
   * src/game/cutscenes.ts (playTitleSequence chains into playIntroCutscene
   * via endTitleSequence — both are owned by the cutscene module). The
   * director routes skip input and tracks `activeId`. The engine no longer
   * needs to know the scenes' beats.
   */
  private async playTitleSequence() {
    if (!this.cutsceneDirector) return;
    await this.cutsceneDirector.play('title');
  }

  /** a cosy tavern building, seen from the street at night — fully voxel-built */
  private buildTavernExterior(): THREE.Group {
    const g = new THREE.Group();
    const C = VOX_C;
    const v = new Vox();    // lit voxels
    const gv = new Vox();   // emissive voxels (windows, moon, accents)

    // ── palette (weathered, dingy — old tavern long past its prime) ──
    const TIMBER = 0x4a3526, TIMBER_D = 0x2e1d12;
    const PLAS = 0x9a8a66, PLAS_D = 0x7a6a4e, PLAS_STAIN = 0x5a4a36, PLAS_GRIME = 0x6a5a44;
    const ROOF = 0x5a2620, ROOF_D = 0x3a1810, ROOF_HI = 0x6e2f26, ROOF_BROKEN = 0x2a1208;
    const DOOR = 0x2e1c0e, DOOR_HI = 0x3a2614;
    const IRON = 0x23231f, IRON_RUST = 0x5a3a22;
    const WGLOW = 0xffcf7a;
    const STONE = 0x4a4550, STONE_D = 0x2e2a34, STONE_HI = 0x5a5560;
    const TRUNK = 0x3a2818, TRUNK_D = 0x221408;
    const LEAF = 0x2e4a22, LEAF_HI = 0x3a5a2a;
    const BUSH = 0x3a4a22, BUSH_HI = 0x4a5a2a, BUSH_DEAD = 0x6a5a3a;
    const MOON_C = 0xf0e8c0;
    const SIGN = 0x4a2e16, SIGN_D = 0x2e1a0a, SIGN_G = 0xb88a2a, SIGN_LETTER = 0xe8c87a;
    const FENCE = 0x3a2818, FENCE_HI = 0x4a3320, FENCE_ROT = 0x2a1a0c;
    const COB = 0x6a5a48, COB_HI = 0x7a6a58, PUDDLE = 0x2a2a30;
    const MOSS = 0x3a4a2a, MOSS_D = 0x2a3a1e;

    // ── building dims (voxels; C = 0.055) ──
    const HW = 24;   // half-width
    const WH = 36;   // wall height
    const HD = 18;   // half-depth
    const EO = 5;    // eave overhang
    const RH = 52;   // ridge height

    // ══ 1. GROUND + COBBLE PATH ══
    // stone (cobble) path from the foreground up to the porch — stops at the doorstep
    v.box(-6, 1, 11, 6, 1, 16, COB);
    for (let z = 11; z <= 16; z++)              // cobble variation along the path
      for (const sx of [-5, -3, -1, 1, 3, 5]) if ((sx + z) % 2 === 0) v.add(sx, 2, z, COB_HI);
    v.box(-3, 1, HD - 2, 3, 1, HD, COB_HI);   // doorstep

    // ══ 2. PLASTER WALLS (weathered, stained, grimy) ══
    v.box(-HW, 0, HD, HW, WH, HD, PLAS);        // front
    v.box(-HW, 0, -HD, HW, WH, -HD, PLAS_D);    // back
    v.box(-HW, 0, -HD, -HW, WH, HD, PLAS);      // left
    v.box(HW, 0, -HD, HW, WH, HD, PLAS);        // right
    // grime streaks running down from the roofline + water stains on the front wall
    for (let x = -HW + 2; x <= HW - 2; x += 3) {
      const streakLen = 6 + ((x * 7) & 7);
      for (let y = 0; y < streakLen; y++) v.add(x, WH - 1 - y, HD, (y & 1) ? PLAS_GRIME : PLAS_STAIN);
    }
    // a couple of darker damp patches low on the walls
    for (let x = -18; x <= -12; x++) for (let y = 0; y < 6; y++) v.add(x, y, HD, PLAS_STAIN);
    for (let x = 12; x <= 18; x++) for (let y = 0; y < 5; y++) v.add(x, y, HD, PLAS_GRIME);
    // moss creeping up the base of the side walls
    for (let z = -HD + 2; z < HD - 2; z += 4) { v.add(-HW, 0, z, MOSS); v.add(-HW, 1, z, MOSS_D); v.add(HW, 0, z, MOSS); v.add(HW, 1, z, MOSS_D); }

    // ══ 3. TIMBER FRAME (half-timbered) ══
    v.box(-HW, 0, HD, -HW + 1, WH, HD, TIMBER);
    v.box(HW - 1, 0, HD, HW, WH, HD, TIMBER);
    v.box(-HW, 0, -HD, -HW + 1, WH, -HD, TIMBER);
    v.box(HW - 1, 0, -HD, HW, WH, -HD, TIMBER);
    v.box(-10, 0, HD, -9, WH, HD, TIMBER);      // front mid posts
    v.box(9, 0, HD, 10, WH, HD, TIMBER);
    v.box(-HW, WH - 1, HD, HW, WH, HD, TIMBER); // top plate
    v.box(-HW, 14, HD, HW, 15, HD, TIMBER);      // mid rail
    v.box(-HW, 0, HD, HW, 1, HD, TIMBER_D);     // bottom plate
    for (let i = 0; i < 7; i++) {                // diagonal braces
      v.add(-HW + 1 + i, 1 + i, HD, TIMBER);
      v.add(HW - 1 - i, 1 + i, HD, TIMBER);
    }

    // ══ 4. GABLE ROOF + OVERHANG (weathered, with broken/missing tiles) ══
    for (let z = -(HD + EO); z <= HD + EO; z++) {
      const t = Math.abs(z) / (HD + EO);
      const h = Math.round(WH + (RH - WH) * (1 - t));
      v.box(-(HW + EO), WH - 1, z, HW + EO, h, z, (z & 1) ? ROOF : ROOF_D);
    }
    v.box(-(HW + EO), RH, -2, HW + EO, RH + 1, 2, ROOF_HI);   // ridge cap
    // broken / missing tiles — punch holes and darken edges (old, neglected roof)
    const broken = [[-14, 40], [-6, 44], [8, 38], [16, 46], [0, 50], [-18, 42], [12, 48]];
    for (const [bx, by] of broken) {
      v.add(bx, by, HD - 4, ROOF_BROKEN); v.add(bx + 1, by, HD - 4, ROOF_BROKEN);
      v.add(bx, by + 1, HD - 5, ROOF_BROKEN);
      // moss in the gaps
      if ((bx & 1) === 0) { v.add(bx, by - 1, HD - 3, MOSS); v.add(bx + 1, by - 1, HD - 3, MOSS_D); }
    }
    // sagging patch on the left side of the roof
    for (let z = -10; z <= -4; z++) v.add(-HW + 4, WH + 8, z, ROOF_BROKEN);

    // ══ 5. STONE CHIMNEY (front-right) ══
    const chimX = HW - 3;
    for (let y = WH + 4; y < RH - 2; y++)
      v.box(chimX, y, HD - 6, chimX + 4, y + 1, HD - 2, (y & 1) ? STONE : STONE_D);
    v.box(chimX - 1, RH - 3, HD - 7, chimX + 5, RH - 2, HD - 1, STONE_HI);  // cap
    v.box(chimX, RH - 2, HD - 6, chimX + 4, RH - 1, HD - 2, STONE_D);
    v.box(chimX + 1, RH - 2, HD - 5, chimX + 3, RH - 1, HD - 3, 0x0a0808);  // flue
    // expose the chimney-top world position for the smoke emitter
    g.userData.chimneyTop = new THREE.Vector3((chimX + 2) * C, (RH - 1) * C, (HD - 4) * C);

    // ══ 6. WOODEN DOOR ══
    const DW = 4, DH = 14;
    v.box(-DW, 1, HD + 1, DW, 1 + DH, HD + 1, DOOR);
    v.box(-DW - 1, 0, HD + 1, -DW - 1, 1 + DH, HD + 1, TIMBER);   // frame
    v.box(DW + 1, 0, HD + 1, DW + 1, 1 + DH, HD + 1, TIMBER);
    v.box(-DW - 1, 1 + DH, HD + 1, DW + 1, 2 + DH, HD + 1, TIMBER);
    v.box(-DW + 1, 1, HD + 1, DW - 1, 1 + DH, HD + 1, DOOR_HI);   // plank highlight
    for (const hy of [3, 8]) {                                    // iron hinges
      gv.add(-DW + 1, hy, HD + 2, IRON);
      v.add(DW - 1, hy, HD + 2, IRON);
    }
    gv.add(DW - 2, 6, HD + 2, SIGN_G);                            // gold handle

    // ══ 7. GLOWING WINDOWS ══
    for (const wx of [-15, 15]) {
      const ww = 4, wh2 = 5;
      v.box(wx - ww - 1, 18, HD + 1, wx + ww + 1, 18 + wh2 * 2 - 1, HD + 1, TIMBER);
      gv.box(wx - ww, 19, HD + 2, wx + ww, 18 + wh2 * 2 - 2, HD + 2, WGLOW);
      v.box(wx - 1, 18, HD + 2, wx + 1, 18, HD + 2, TIMBER);      // mullions
      v.box(wx, 18, HD + 2, wx, 18 + wh2 * 2 - 1, HD + 2, TIMBER);
      v.box(wx - ww, 18 + wh2 - 1, HD + 2, wx + ww, 18 + wh2 - 1, HD + 2, TIMBER);
      v.box(wx - ww - 1, 17, HD + 1, wx + ww + 1, 18, HD + 1, TIMBER_D);  // sill
    }

    // ══ 8. SWINGING SIGN above the door (board hangs from a pole, sways in the wind) ══
    // The pole is a fixed bracket jutting out from the wall above the door; the
    // board is a SEPARATE Group (built from its own voxels) parented to the pole
    // so it can rotate gently. The tavern name is painted on as emissive letters.
    const signPoleY = 1 + DH + 16;         // keeps the bracket at world y≈31 while the door is taller
    const signPoleZ = HD + 1;
    // bracket: two diagonal struts + a horizontal beam anchored to the wall (widened for the board)
    v.box(-6, signPoleY, signPoleZ, 6, signPoleY, signPoleZ, TIMBER);          // wall anchor beam
    v.box(-6, signPoleY, signPoleZ, -5, signPoleY + 3, signPoleZ + 3, TIMBER_D); // left strut
    v.box(5, signPoleY, signPoleZ, 6, signPoleY + 3, signPoleZ + 3, TIMBER_D);  // right strut
    v.box(-6, signPoleY + 3, signPoleZ + 3, 6, signPoleY + 3, signPoleZ + 4, TIMBER); // outboard beam
    // iron hooks hanging from the outboard beam (at the board's outer edges)
    v.add(-5, signPoleY + 2, signPoleZ + 3, IRON_RUST); v.add(5, signPoleY + 2, signPoleZ + 3, IRON_RUST);

    // ── the swinging board (own Vox → own mesh → own Group so it can rotate) ──
    const sv = new Vox();
    const sgv = new Vox();
    const BW = 10, BH = 5;                 // board half-extents (voxels) — sized to the half-size letters, kept above the door
    sv.box(-BW, -BH, 0, BW, BH, 1, SIGN);    // plank board (centred vertically)
    sv.box(-BW, -BH, 0, -BW, BH, 1, SIGN_D); // frame edges
    sv.box(BW, -BH, 0, BW, BH, 1, SIGN_D);
    sv.box(-BW, -BH, 0, BW, -BH, 1, SIGN_D);
    sv.box(-BW, BH, 0, BW, BH, 1, SIGN_D);
    // weathering: cracks + a dark damp patch on the board
    sv.add(-3, 1, 0, SIGN_D); sv.add(2, 3, 0, SIGN_D); sv.add(-1, -2, 0, SIGN_D);
    sv.box(-6, -1, 0, -2, 0, 1, PLAS_STAIN);
    // tavern name on TWO lines — "THE DIRTY" / "MUG". Letters are built at full
    // voxel size, then the mesh is scaled to ½ so they read smaller.
    const letter = (cx: number, cy: number, pattern: number[][]) => {
      for (let r = 0; r < pattern.length; r++) for (let c = 0; c < pattern[r].length; c++)
        if (pattern[r][c]) sgv.add(cx + c, cy + (pattern.length - 1 - r), 2, SIGN_LETTER);
    };
    // 3x5 pixel font (rows top→bottom). 1 = lit pixel. M is 5 wide.
    const F: Record<string, number[][]> = {
      T: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
      H: [[1,0,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
      E: [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
      M: [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]],
      U: [[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
      G: [[1,1,1],[1,0,0],[1,0,1],[1,0,1],[1,1,1]],
      D: [[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
      I: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
      R: [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
      Y: [[1,0,1],[1,0,1],[0,1,0],[0,1,0],[0,1,0]],
    };
    const charW = (ch: string) => (ch === 'M' ? 5 : 3);
    const wordWidth = (text: string) => {
      let w = 0;
      for (const ch of text) { if (ch === ' ') { w += 3; continue; } w += charW(ch) + 1; }
      return w - 1;   // no trailing spacing after the last letter
    };
    const drawWord = (text: string, startX: number, cy: number) => {
      let x = startX;
      for (const ch of text) {
        if (ch === ' ') { x += 3; continue; }
        if (F[ch]) letter(x, cy, F[ch]);
        x += charW(ch) + 1;
      }
    };
    drawWord('THE DIRTY', Math.round(-wordWidth('THE DIRTY') / 2), 2);   // upper line
    drawWord('MUG', Math.round(-wordWidth('MUG') / 2), -6);             // lower line

    const signBoard = new THREE.Group();
    signBoard.add(voxelMesh(sv.list()));
    if (sgv.size > 0) {
      const lettersMesh = voxelMesh(sgv.list(), true);
      lettersMesh.scale.setScalar(0.5);            // half-size letters
      lettersMesh.position.set(0, 0, 0.5 * C);     // centred on the board, just in front
      signBoard.add(lettersMesh);
    }
    // pivot at the top of the board (where the hooks attach), so it swings from there
    const boardPivotY = (signPoleY + 2) * C;
    signBoard.position.set(0, boardPivotY, (signPoleZ + 3) * C);
    // the board mesh hangs below the pivot; offset its children down by BH voxels
    signBoard.children.forEach((c) => { c.position.y -= BH * C; });
    g.add(signBoard);
    // expose the board's world position (for the camera close-up) + the group (for sway)
    g.userData.signBoardWp = new THREE.Vector3(0, (signPoleY + 2 - BH) * C, (signPoleZ + 3) * C);
    g.userData.signBoard = signBoard;
    // gentle wind sway: a slow, noisy sine on rotation.z, auto-stops when removed
    let swayT = Math.random() * 10;
    this.propAnims.push((dt: number) => {
      if (!g.parent) return true;          // stop once the exterior group leaves the scene
      swayT += dt;
      signBoard.rotation.z = Math.sin(swayT * 0.9) * 0.06 + Math.sin(swayT * 0.37) * 0.03;
      return false;
    });

    // ══ 9. TREES — a few around the inn (modest; front approach kept clear) ══
    // deterministic scatter (stable across reloads) so the treeline doesn't jump
    const treeHash = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const treeInBuilding = (x: number, z: number) =>
      x > -HW - 6 && x < HW + 6 && z > -HD - 6 && z < HD + 4;
    const treeOnRoad = (x: number, z: number) => x > -10 && x < 10 && z > 9 && z < 33;
    for (let gx = -64; gx <= 64; gx += 18) {
      for (let gz = -64; gz <= 40; gz += 18) {
        const id = gx * 131 + gz * 17;
        if (treeHash(id) > 0.55) continue;       // clearings / natural variation
        const tx = gx + Math.round((treeHash(id + 1) - 0.5) * 4);
        const tz = gz + Math.round((treeHash(id + 2) - 0.5) * 4);
        if (treeInBuilding(tx, tz) || treeOnRoad(tx, tz)) continue;
        const sc = 0.8 + treeHash(id + 3) * 0.5;  // 0.8..1.3
        voxTree(v, tx, tz, sc, TRUNK, TRUNK_D, LEAF, LEAF_HI);
      }
    }

    // ══ 10. BUSHES (some dead/straggly — the tavern's grounds are neglected) ══
    voxBush(v, -20, 22, 3, BUSH, BUSH_HI);
    voxBush(v, 22, -16, 3, BUSH_DEAD, BUSH);          // half-dead
    voxBush(v, 0, -18, 2, BUSH_DEAD, BUSH_DEAD);      // dead
    voxBush(v, -28, -12, 2, BUSH, BUSH_HI);
    voxBush(v, 28, 16, 2, BUSH_DEAD, BUSH);           // straggly
    voxBush(v, -15, -22, 2, BUSH_DEAD, BUSH_DEAD);     // dead
    // a muddy puddle on the approach (old, neglected)
    v.box(-2, 1, 13, 2, 1, 16, PUDDLE);
    v.add(0, 1, 14, COB_HI); v.add(-1, 1, 15, COB);

    // ══ 11. FENCE ALONG PATH (weathered — some posts rotten/shorter, rails missing) ══
    for (let side = -1; side <= 1; side += 2) {
      const fx = side * 8;
      for (let i = 0; i < 3; i++) {
        const fz = 11 + i * 3;
        const rotten = (i + (side > 0 ? 1 : 0)) % 3 === 0;
        v.box(fx, 0, fz, fx + 1, rotten ? 4 : 6, fz + 1, rotten ? FENCE_ROT : FENCE);
        if (i < 3 && !rotten) {
          const nx = fx + (side < 0 ? 1 : 0);
          v.box(nx, 3, fz + 1, nx, 3, fz + 3, FENCE_HI);
          if (i % 2 === 0) v.box(nx, 5, fz + 1, nx, 5, fz + 3, FENCE_HI);   // some top rails missing
        }
      }
    }

    // ══ 12. CRESCENT MOON (emissive, high in the sky — casts moonlight) ══
    // A filled crescent: the lune left where an offset "shadow" disc is
    // subtracted from the lit disc. A little z-depth keeps it readable as the
    // camera slowly orbits.
    const moonX = -46, moonY = 118;        // upper-left of the night sky (voxel units)
    const R = 9, r = 8, offX = 3.8;        // outer disc minus offset shadow disc = crescent
    for (let z = -1; z <= 1; z++) {
      for (let y = moonY - R - 1; y <= moonY + R + 1; y++) {
        for (let x = moonX - R - 1; x <= moonX + R + 1; x++) {
          const dO = Math.hypot(x - moonX, y - moonY);
          const dI = Math.hypot(x - (moonX + offX), y - moonY);
          if (dO <= R && dI > r) gv.add(x, y, z, MOON_C);
        }
      }
    }
    // soft moonlit halo (visual only — lightI 0 so no extra point light)
    extGlow(g, 0xf0e8c0, moonX * C, moonY * C, 0, 0, 10, 2.0);

    // ══ BUILD MESHES ══
    g.add(voxelMesh(v.list()));
    if (gv.size > 0) g.add(voxelMesh(gv.list(), true));

    // ══ LIGHTS ══
    for (const wx of [-15, 15]) extGlow(g, 0xffb060, wx * C, 24 * C, (HD + 2) * C, 2.5, 7, 1.0);
    // moonlight: a cool directional light shining FROM the moon's position
    const moonDir = new THREE.DirectionalLight(0x9fb4e6, 0.5); moonDir.position.set(moonX * C, moonY * C, 0); g.add(moonDir);
    g.add(new THREE.AmbientLight(0x1a1a3a, 0.35));

    return g;
  }

  /** Ease the boss's facing toward a world point (the smooth-facing lerp in the
   *  frame loop does the actual turning; we just set the target yaw). */
  private faceToward(v: UnitVisual, target: THREE.Vector3, snap = false) {
    const d = target.clone().sub(v.rig.group.position); d.y = 0;
    if (d.lengthSq() < 1e-4) return;
    v.targetYaw = Math.atan2(d.x, d.z);
    if (snap) { v.yaw = v.targetYaw; v.rig.group.rotation.y = v.yaw; }
  }

  /** Wade the boss (or any rig) across the floor to a tile over `dur` seconds,
   *  playing the walk cycle. Resolves when he arrives. Drives x/z only — the
   *  frame loop leaves an enemy's Y alone in explore, so it stays grounded. */
  private walkRigTo(v: UnitVisual, tile: GridPos, dur: number): Promise<void> {
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
  private splashBurst(p: THREE.Vector3, count = 26) {
    this.particles.burst({
      pos: p.clone(), count, color: [0x9ecbe0, 0x6fa8c4, 0xd6ecf5, 0x2f5a4a],
      speed: [2.2, 6.5], life: [0.4, 0.9], size: [0.5, 1.4], gravity: 12, up: 3.2, drag: 0.3, endScale: 0.2,
    });
  }

  /** gentle little plink of bathwater while the tyrant soaks */
  private waterPlink(p: THREE.Vector3) {
    this.particles.burst({
      pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.8)),
      count: 5, color: [0x9ecbe0, 0x6fa8c4, 0xd6ecf5], speed: [0.5, 1.8], life: [0.3, 0.7],
      size: [0.3, 0.7], gravity: 9, up: 1.3, drag: 0.4, endScale: 0.3,
    });
  }

  /** a glowing magic bolt that flies from `from` to `to`, trailing sparks */
  private launchMagicMissile(from: THREE.Vector3, to: THREE.Vector3) {
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

  /** dazed "stars" circling the head — little yellow sparkles in a slow ring */
  private spawnStars(p: THREE.Vector3) {
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
  private walkRig(rig: Rig, to: THREE.Vector3, dur: number): Promise<void> {
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
  private async barmaidServe(bar: Rig) {
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
  private passOut(dur: number) {
    const cv = this.renderer.domElement;
    if (this.fadeEl) this.fadeEl.style.transition = 'none';
    const t0 = performance.now();
    const tick = () => {
      if (this.cutsceneSkip) { cv.style.filter = 'none'; return; }  // skip → clear blur & stop
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
  private spawnDrunkStars(center: THREE.Vector3) {
    let ang = 0;
    this.propAnims.push((dt: number) => {
      if (!this.tavern) return true;                 // stop once the tavern is gone
      ang += dt * 1.6;
      if (Math.random() < dt * 6) {
        const a = ang + Math.random() * 0.6;
        const r = 0.45 + Math.random() * 0.15;
        const p = center.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 0.3, Math.sin(a) * r));
        this.particles.burst({
          pos: p, count: 1, color: [0xffe066, 0xfff3b0, 0xffd23a], speed: [0.1, 0.3],
          life: [0.9, 1.4], size: [0.25, 0.5], gravity: -0.4, up: 0, drag: 0.9, endScale: 0.1,
        });
      }
      return false;
    });
  }

  /**
   * Boss reveal cinematic — "the bathing tyrant". The script lives in
   * src/game/cutscenes.ts; this engine method just routes through the
   * director (and lets the debug warp key still call this entrypoint).
   */
  private async playBossCutscene() {
    if (!this.cutsceneDirector) return;
    await this.cutsceneDirector.play('boss');
  }


  // ══ unit visuals ══════════════════════════════════════════
  private addUnit(u: Unit) {
    const rig = buildCharacter(u.scheme, u.weapon);
    const wp = this.unitWorld(u.pos);
    rig.group.position.copy(wp);
    rig.group.userData.baseY = wp.y;
    rig.group.rotation.y = u.team === 'party' ? Math.PI : 0;
    this.scene.add(rig.group);

    // Size the (invisible) click hitbox to the rig's real bounds so that tiny
    // creatures (rats, bats, skeletons) are as clickable as tall humanoids.
    const bb = new THREE.Box3().setFromObject(rig.group);
    const rigH = Math.max(0.7, isFinite(bb.max.y - bb.min.y) ? bb.max.y - bb.min.y : 1.8);
    const rigR = Math.max(0.45, Math.min(0.9,
      isFinite(bb.max.x - bb.min.x) ? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 0.15 : 0.5));
    const yOff = (isFinite(bb.min.y) ? bb.min.y - wp.y : 0) + rigH / 2; // centre of the body above the tile
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(rigR, rigR, rigH, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.userData.unitId = u.id;
    proxy.userData.yOff = yOff;
    proxy.position.copy(wp).y += yOff;
    this.scene.add(proxy);
    this.unitProxies.push(proxy);

    const bar = document.createElement('div');
    bar.className = 'unit-bar';
    bar.innerHTML = `<div class="ub-name">${u.name}</div><div class="ub-hp ${u.team}"><i></i></div>`;
    this.overlay.appendChild(bar);
    const barFill = bar.querySelector('i') as HTMLElement;

    this.visuals.set(u.id, { rig, proxy, bar, barFill, walker: null, yaw: rig.group.rotation.y, targetYaw: rig.group.rotation.y });
  }

  unitWorld(p: GridPos): THREE.Vector3 {
    const h = this.world.heightAt(p.x, p.z);
    return new THREE.Vector3(p.x - WORLD_SIZE / 2 + 0.5, h + 0.5, p.z - WORLD_SIZE / 2 + 0.5);
  }

  // Detach a dying unit's held weapon from its rig and let it tumble to the
  // floor on its own, so it lands separately from the ragdolling corpse.
  private dropWeapon(v: UnitVisual) {
    const wpn = v.rig.parts.weapon as unknown as THREE.Object3D | undefined;
    if (!wpn || !wpn.parent) return;
    const baseY = (v.rig.group.userData.baseY as number) ?? wpn.getWorldPosition(new THREE.Vector3()).y;
    this.scene.attach(wpn);                       // reparent, preserving world transform
    const dir = Math.random() * Math.PI * 2, spd = 0.8 + Math.random() * 1.2;
    this.droppedWeapons.push({
      obj: wpn,
      vx: Math.cos(dir) * spd,
      vz: Math.sin(dir) * spd,
      vy: 1.5 + Math.random() * 1.8,
      spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
      restY: baseY + 0.04,
      settled: false,
    });
    delete (v.rig.parts as { weapon?: THREE.Mesh }).weapon;   // rig stops animating it
  }

  // Simple gravity + tumble + one small bounce, then the weapon lies flat.
  private updateDroppedWeapons(dt: number) {
    for (const d of this.droppedWeapons) {
      if (d.settled) continue;
      d.vy -= 14 * dt;
      d.obj.position.x += d.vx * dt;
      d.obj.position.z += d.vz * dt;
      d.obj.position.y += d.vy * dt;
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      if (d.obj.position.y <= d.restY) {
        d.obj.position.y = d.restY;
        if (d.vy < -1.6) {                        // bounce, shedding energy
          d.vy = -d.vy * 0.32; d.vx *= 0.45; d.vz *= 0.45; d.spin.multiplyScalar(0.4);
        } else {                                  // settle flat on the ground
          d.vy = 0; d.vx = 0; d.vz = 0;
          d.obj.rotation.set(Math.PI / 2, d.obj.rotation.y, 0);
          d.settled = true;
        }
      }
    }
  }

  // ══ input ═════════════════════════════════════════════════
  private onPointerMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.updateHover();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.paused) return;
    if (e.button === 2) { this.cancelTargeting(); return; }
    if (this.busy) return;
    this.ray.setFromCamera(this.pointer, this.iso.cam);
    const unitHit = this.ray.intersectObjects(this.unitProxies, false)[0];
    const propHit = this.ray.intersectObjects(this.props.pickboxes, false)[0];
    const tile = this.pickTile();

    if (this.phase === 'explore') this.clickExplore(unitHit?.object.userData.unitId, tile, propHit?.object.userData.propId);
    else if (this.phase === 'combat') this.clickCombat(unitHit?.object.userData.unitId, tile, propHit?.object.userData.propId);
  };

  private onWheel = (e: WheelEvent) => { e.preventDefault(); this.iso.zoom(e.deltaY * 0.012); };
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();

    // ── cheat console (backtick) — checked FIRST so no other key binding
    // fires while the console is open (fixes: typing 'b' → boss warp) ──
    if (k === '`' || k === '~') {
      e.preventDefault();
      this.consoleOpen = !this.consoleOpen;
      this.consoleInput = '';
      if (!this.consoleOpen) this.keys.clear();  // release held keys when closing
      this.emitSnapshot();
      return;
    }
    // when the console is open, route ALL keypresses to the input line
    // and block every other action (movement, torch, inventory, etc.)
    if (this.consoleOpen) {
      e.preventDefault();
      if (k === 'escape') { this.consoleOpen = false; this.consoleInput = ''; this.emitSnapshot(); return; }
      if (k === 'backspace') { this.consoleInput = this.consoleInput.slice(0, -1); this.emitSnapshot(); return; }
      if (k === 'enter') {
        const cmd = this.consoleInput.trim().toLowerCase();
        this.consoleOpen = false; this.consoleInput = '';
        this.executeCheatCommand(cmd);
        this.emitSnapshot();
        return;
      }
      // accept printable characters
      if (e.key.length === 1) {
        this.consoleInput += e.key;
        this.emitSnapshot();
      }
      return;   // ← all other keys are swallowed here, nothing below runs
    }

    // ── normal key bindings (console is closed) ──
    // while paused, swallow every key except Esc (which toggles the menu)
    if (this.paused && k !== 'escape') { e.preventDefault(); return; }
    this.keys.add(k);
    const cutscene = this.busy && (this.introActive || this.bossCineActive);
    if (k === 'q' && !cutscene) this.iso.rotate(1);
    if (k === 'e' && !cutscene) this.iso.rotate(-1);
    if (k === 'i' && this.phase !== 'menu') { this.toggleInventory(); return; }
    if (k === 'k' && this.phase !== 'menu') { this.toggleSkillTree(); return; }
    if (k === 'c' && this.phase === 'explore' && !this.combat.inCombat) { this.toggleSneak(); return; }
    if (k === 't') { this.toggleTorch(); return; }
    if (k === 'v') { this.followCam = !this.followCam; this.pushLog(`Follow camera ${this.followCam ? 'ON' : 'OFF'}`, 'system'); this.emitSnapshot(); return; }
    if (k === 'm') { this.showFullMap = !this.showFullMap; this.emitSnapshot(); return; }
    if (k === 'b') { this.debugWarpToBoss(); return; }   // TODO(debug): remove — jumps to boss cutscene
    if (k === 'escape') {
      // skip an in-progress cutscene (intro or boss). The intro is played
      // directly (not via the director), so set the skip flags ourselves to
      // guarantee the cutscene scripts bail out cleanly.
      if (this.busy && (this.introActive || this.bossCineActive)) {
        this.introSkipped = true;
        this.cutsceneSkip = true;
        this.cutsceneDirector?.requestSkip();
        return;
      }
      if (this.showInventory) { this.showInventory = false; this.emitSnapshot(); return; }
      if (this.showSkillTree) { this.showSkillTree = false; this.emitSnapshot(); return; }
      if (this.targeting) { this.cancelTargeting(); return; }
      // otherwise toggle the pause menu (only while actually playing)
      this.togglePause();
      return;
    }
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      // space-to-skip → director; never falls through to endTurn while a
      // cutscene is mid-flight (fixes the "space in tavern → combat" glitch
      // where a buffered keypress reached endTurn after busy cleared).
      if (this.busy && (this.introActive || this.bossCineActive)) { this.cutsceneDirector?.requestSkip(); return; }
      this.endTurn();
    }
    if (k === 'f') { const a = this.combat?.active ?? this.byId(this.selectedId ?? ''); if (a) this.iso.focus(this.unitWorld(a.pos)); }
    if (k === '0') this.hotkeySkill(9);
    else if (k === '-') this.hotkeySkill(10);
    else if (k === '=') this.hotkeySkill(11);
    else if (/^[1-9]$/.test(k)) this.hotkeySkill(parseInt(k, 10) - 1);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onResize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.iso.cam.aspect = w / h;
    this.iso.cam.updateProjectionMatrix();
  };

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  private byId(id: string) { return this.combat.units.find((u) => u.id === id) ?? null; }

  /**
   * Math-based tile picking: casts the ray from the camera through the
   * mouse pointer against a horizontal plane at the party leader's floor
   * height, then converts the hit point to a tile. This avoids the
   * raycaster hitting wall geometry or the water plane at the wrong height
   * — clicking always picks the floor tile the player meant, regardless of
   * how the voxel terrain is meshed.
   */
  /** fog of war: mark tiles within the party leader's vision radius as
   *  explored, and show/hide dark overlay cubes on unexplored walkable
   *  tiles so the player only sees where they've been + a bit ahead. */
  private updateFog(_dt: number) {
    if (!this.explored.length || this.phase === 'menu' || this.busy) return;
    const leader = this.byId(this.selectedId ?? '') ?? this.combat?.living('party')[0];
    if (!leader) return;

    // vision radius: base 6 tiles + extra 5 if torch is lit
    const radius = this.torchLit ? this.visionRadius + 5 : this.visionRadius;

    // mark tiles within radius (Chebyshev distance) as explored
    const px = leader.pos.x, pz = leader.pos.z;
    const S = this.explored.length;
    const x0 = Math.max(0, px - radius), x1 = Math.min(S - 1, px + radius);
    const z0 = Math.max(0, pz - radius), z1 = Math.min(S - 1, pz + radius);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const dist = Math.max(Math.abs(x - px), Math.abs(z - pz));
        if (dist <= radius && this.world.isWalkable(x, z) && !this.explored[x][z]) {
          this.explored[x][z] = true;
        }
      }
    }

    // lazily create fog overlay cubes for walkable tiles near the leader
    // that aren't explored yet. We only scan within a generous radius of the
    // leader (not the entire map) to avoid creating thousands of meshes for
    // tiles the player will never see until they walk there.
    const scanRadius = radius + 10;
    const sx0 = Math.max(0, px - scanRadius), sx1 = Math.min(S - 1, px + scanRadius);
    const sz0 = Math.max(0, pz - scanRadius), sz1 = Math.min(S - 1, pz + scanRadius);
    for (let x = sx0; x <= sx1; x++) {
      for (let z = sz0; z <= sz1; z++) {
        if (!this.world.isWalkable(x, z)) continue;
        const key = `${x},${z}`;
        if (!this.explored[x][z]) {
          // need a fog cube — create if missing
          if (!this.fogCubes.has(key) && this.fogGroup) {
            const g = new THREE.BoxGeometry(1.06, 12, 1.06);
            const m = new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false });
            const mesh = new THREE.Mesh(g, m);
            const wp = this.unitWorld({ x, z });
            mesh.position.set(wp.x, wp.y + 3, wp.z);
            mesh.renderOrder = 5;
            this.fogGroup.add(mesh);
            this.fogCubes.set(key, mesh);
          }
        } else {
          // explored — remove the cube if it exists
          const cube = this.fogCubes.get(key);
          if (cube) { this.fogGroup?.remove(cube); this.fogCubes.delete(key); }
        }
      }
    }
  }

  private pickTile(): GridPos | null {
    this.ray.setFromCamera(this.pointer, this.iso.cam);
    // use the party leader's floor height as the pick plane
    const leader = this.byId(this.selectedId ?? '') ?? this.combat?.living('party')[0];
    const pickY = leader ? this.world.heightAt(leader.pos.x, leader.pos.z) : 1;
    // ray-plane intersection: plane at y=pickY
    const origin = this.ray.ray.origin;
    const dir = this.ray.ray.direction;
    if (Math.abs(dir.y) < 1e-6) return null;  // ray parallel to plane
    const t = (pickY - origin.y) / dir.y;
    if (t < 0) return null;  // behind camera
    const hx = origin.x + dir.x * t;
    const hz = origin.z + dir.z * t;
    return this.world.worldToTile(hx, hz);
  }

  private updateHover() {
    this.ray.setFromCamera(this.pointer, this.iso.cam);
    const unitHit = this.ray.intersectObjects(this.unitProxies, false)[0];
    let info: string | null = null;
    if (unitHit) {
      const u = this.byId(unitHit.object.userData.unitId as string);
      if (u && u.alive) info = `${u.name} · ${u.title} — HP ${u.hp}/${u.maxHp} · AC ${u.ac}${u.conditions.length ? ' · ' + u.conditions.map((c) => c.name).join(', ') : ''}`;
    }
    if (!info) {
      const propHit = this.ray.intersectObjects(this.props.pickboxes, false)[0];
      const p = propHit ? this.props.byId(propHit.object.userData.propId as string) : null;
      if (p) info = `${p.def.icon} ${p.def.name} — destructible`;
    }
    // trap hover (revealed only)
    if (!info && this.phase === 'explore' && !this.combat.inCombat) {
      const tile = this.pickTile();
      if (tile) {
        const trap = this.trapManager.at(tile.x, tile.z);
        if (trap && trap.revealed) {
          const adj = this.combat.living('party').some((u) => Combat.dist(u.pos, trap.pos) <= 1.5);
          info = `⚠ ${trap.def.icon} ${trap.def.name}${adj ? ' — click to disarm' : ''}`;
        }
      }
    }
    // aoe blast preview follows the cursor
    if (this.targeting && !unitHit) {
      const tile = this.pickTile();
      const s = SKILLS[this.targeting];
      const a = this.combat.active;
      if (tile && s && s.aoeRadius > 0 && !s.selfCentered && a) this.showAoePreview(s, tile);
    }
    if (info !== this.hoverInfo) { this.hoverInfo = info; this.emitSnapshot(); }
  }

  // ══ click logic ═══════════════════════════════════════════
  private clickExplore(unitId: string | undefined, tile: GridPos | null, propId?: string) {
    if (propId) {
      const prop = this.props.byId(propId);
      if (prop) {
        // smash it if any living party member stands adjacent
        const near = this.combat.living('party').find((u) => Combat.dist(u.pos, prop.pos) <= 1);
        if (near) { void this.smashProp(near, prop); return; }
        // walk to it and auto-smash
        const leader = this.byId(this.selectedId ?? '') ?? this.combat.living('party')[0];
        if (leader) {
          const adj = this.closestWalkableAdjacent(prop.pos, leader);
          if (adj) {
            const path = this.combat.pathTo(leader, adj.x, adj.z);
            if (path && path.length) {
              this.pendingSmash = { unitId: leader.id, propId: prop.id };
              this.moveUnitAlong(leader, path);
              this.emitSnapshot();
              return;
            }
          }
        }
        this.setHoverInfoOnce(`${prop.def.icon} Can't reach the ${prop.def.name}.`);
        return;
      }
    }
    if (unitId) {
      const u = this.byId(unitId);
      if (u?.team === 'party') { this.selectedId = u.id; this.audio.play('ui_click'); this.emitSnapshot(); return; }
    }

    // NPC click (hermit)
    const hermitProxy = this.unitProxies.find(p => p.userData.hermitNpc);
    if (!unitId && hermitProxy) {
      this.ray.setFromCamera(this.pointer, this.iso.cam);
      const hit = this.ray.intersectObjects(this.unitProxies, false)[0];
      if (hit?.object === hermitProxy && this.hermitPos) {
        const leader = this.byId(this.selectedId ?? '') ?? this.combat.living('party')[0];
        if (leader && Combat.dist(leader.pos, this.hermitPos) <= 1.5) {
          this.talkToNpc('hermit_merv');
        } else {
          this.setHoverInfoOnce('Old Merv the hermit — get closer to talk.');
        }
        return;
      }
    }

    // click on a revealed trap → disarm if adjacent
    if (tile) {
      const trap = this.trapManager.at(tile.x, tile.z);
      if (trap && trap.revealed) {
        const adj = this.combat.living('party').find((u) => Combat.dist(u.pos, trap.pos) <= 1.5);
        if (adj) { void this.disarmTrap(adj, trap); return; }
      }
    }
    const leader = this.byId(this.selectedId ?? '') ?? this.combat.living('party')[0];
    if (!leader || !tile) return;

    // bonfire interaction
    if (this.bonfireGroup && this.bonfireLit && this.bonfirePos && tile && Combat.dist(leader.pos, this.bonfirePos!) <= 1.5) {
      if (tile.x === this.bonfirePos.x && tile.z === this.bonfirePos.z) {
        this.restAtBonfire();
        return;
      }
    }
    // unlit bonfire
    const cp = this.structures?.checkpoint;
    if (this.bonfireGroup && !this.bonfireLit && cp && tile && tile.x === cp.x && tile.z === cp.z) {
      if (Combat.dist(leader.pos, tile) <= 1.5) {
        this.lightBonfire();
        return;
      } else {
        this.setHoverInfoOnce('An unlit bonfire. Move closer to kindle it.');
        return;
      }
    }

    const path = this.combat.pathTo(leader, tile.x, tile.z);
    if (!path || !path.length) return;
    this.audio.play('ui_click', 0.5);
    this.pingAt(tile);
    this.moveUnitAlong(leader, path);
    // party follows to nearby free tiles
    const followers = this.combat.living('party').filter((u) => u.id !== leader.id);
    const dest = path[path.length - 1];
    const spots: GridPos[] = [
      { x: dest.x - 1, z: dest.z + 1 }, { x: dest.x + 1, z: dest.z + 1 },
      { x: dest.x - 1, z: dest.z - 1 }, { x: dest.x + 1, z: dest.z - 1 },
      { x: dest.x, z: dest.z + 2 },
    ];
    followers.forEach((f, i) => {
      const spot = spots.find((s) => this.world.isWalkable(s.x, s.z) && !this.combat.living('party').some((o) => o.id !== f.id && o.pos.x === s.x && o.pos.z === s.z)) ?? spots[i % spots.length];
      const fp = this.combat.pathTo(f, spot.x, spot.z, 60);
      if (fp && fp.length) this.moveUnitAlong(f, fp);
    });
    this.selectedId = leader.id;
    this.emitSnapshot();
  }

private moveUnitAlong(u: Unit, path: GridPos[]) {
    const v = this.visuals.get(u.id)!;
    const pts = path.map((t) => this.unitWorld(t));
    v.walker = { path: pts, idx: 0 };
    v.rig.anim.mode = 'walk';
    const dest = path[path.length - 1];
    u.pos = { ...dest };
    const trap = this.trapManager.at(dest.x, dest.z);
    if (trap && !trap.triggered) this.triggerTrap(u, trap);
    // follow-cam: when a party member is ordered to move, snap the camera
    // target back to their current position so the view re-centers on them.
    if (this.followCam && u.team === 'party') {
      const wp = this.unitWorld(u.pos);
      this.iso.desiredTarget.set(wp.x, wp.y, wp.z);
    }
  }

  private closestWalkableAdjacent(pos: GridPos, leader: Unit): GridPos | null {
    const offsets = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    let best: GridPos | null = null;
    let bestDist = Infinity;
    for (const [dx, dz] of offsets) {
      const tx = pos.x + dx, tz = pos.z + dz;
      if (this.world.isWalkable(tx, tz)) {
        const d = Math.abs(leader.pos.x - tx) + Math.abs(leader.pos.z - tz);
        if (d < bestDist) { bestDist = d; best = { x: tx, z: tz }; }
      }
    }
    return best;
  }

  private clickCombat(unitId: string | undefined, tile: GridPos | null, propId?: string) {
    const active = this.combat.active;
    if (!active || active.team !== 'party') return; // enemy turn — camera only
    if (this.targeting) {
      const s = SKILLS[this.targeting];
      if (s.aoeRadius > 0 && !s.selfCentered) {
        if (tile && Combat.dist(active.pos, tile) <= s.range) {
          this.audio.play('dice', 0.7);
          this.enqueue(this.combat.useSkill(active, s.id, tile));
          this.targeting = null;
          this.clearHighlights();
        }
        return;
      }
      if (unitId) {
        const t = this.byId(unitId);
        if (t && t.alive && Combat.dist(active.pos, t.pos) <= s.range) {
          this.audio.play('dice', 0.7);
          this.enqueue(this.combat.useSkill(active, s.id, t.id));
          this.targeting = null;
          this.clearHighlights();
          return;
        }
      }
      // aim a single-target damaging skill at a prop → smash it
      if (propId) this.trySmashInCombat(active, propId, s);
      return;
    }
    // default: move, or quick-attack a reachable enemy
    if (unitId) {
      const t = this.byId(unitId);
      if (t && t.alive && t.team === 'enemy') {
        const basic = active.equippedSkills.map((id) => SKILLS[id]).find((s) => s.damageDice && !s.targetsAllies && !s.selfCentered && s.aoeRadius === 0 && Combat.dist(active.pos, t.pos) <= Math.max(1, s.range) && !this.combat.canUse(active, s));
        if (basic) {
          this.audio.play('dice', 0.7);
          this.enqueue(this.combat.useSkill(active, basic.id, t.id));
        } else this.setHoverInfoOnce('Out of reach — move closer or pick a skill.');
        return;
      }
    }
    if (propId) { this.trySmashInCombat(active, propId); return; }
    if (tile && this.moveTiles.has(`${tile.x},${tile.z}`)) {
      this.enqueue(this.combat.moveActiveTo(tile));
    }
  }

  /** auto-hit smash against a destructible prop with a usable basic damaging skill */
  private trySmashInCombat(active: Unit, propId: string, preferred?: SkillDef) {
    const prop = this.props.byId(propId);
    if (!prop) return;
    const usable = (s: SkillDef) => s.damageDice && !s.targetsAllies && !s.selfCentered && s.aoeRadius === 0
      && Combat.dist(active.pos, prop.pos) <= Math.max(1, s.range) && !this.combat.canUse(active, s);
    const skill = (preferred && usable(preferred)) ? preferred
      : active.equippedSkills.map((id) => SKILLS[id]).find(usable);
    if (skill) {
      this.audio.play('dice', 0.7);
      this.targeting = null;
      this.clearHighlights();
      void this.smashProp(active, prop, skill);
    } else this.setHoverInfoOnce('Out of reach — move closer or pick a skill.');
  }

  private setHoverInfoOnce(s: string) { this.hoverInfo = s; this.emitSnapshot(); }

  // ══ NPC dialogue ═════════════════════════════════════════
  private talkToNpc(npcId: string) {
    const npc = NPCS[npcId];
    if (!npc) return;
    const questNode = this.questLog.nodeFor(npcId, this.hasItemInInventory('severed_finger'));
    const nodeId = questNode ?? npc.entryNode;
    const node = npc.dialogue[nodeId];
    if (!node) return;
    this.audio.play('ui_click', 0.6);
    this.showDialogue = {
      npcId,
      npcName: npc.name,
      text: node.text,
      caption: node.caption,
      choices: node.choices?.map((c, i) => ({ label: c.label, index: i })),
    };
    this.emitSnapshot();
  }

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

  private executeDialogueAction(action: { type: string; itemId?: string; questId?: string }, npc: NPCDef) {
    switch (action.type) {
      case 'giveItem': {
        if (action.itemId) {
          const it = makeItem(action.itemId);
          this.inventory.push(it);
          this.pushLog(`${npc.name} gives you ${it.icon} ${it.name}.`, 'system');
        }
        break;
      }
      case 'startQuest': {
        if (action.questId) {
          this.questLog.start(action.questId);
          this.pushLog(`📜 Quest started: ${QUESTS[action.questId]?.name ?? action.questId}`, 'system');
        }
        break;
      }
      case 'completeQuest': {
        if (action.questId) {
          const q = QUESTS[action.questId];
          if (!q) break;
          if (q.requiredItemId) {
            const idx = this.inventory.findIndex(i => i.id === q.requiredItemId || (i as any)._baseId === q.requiredItemId);
            if (idx >= 0) this.inventory.splice(idx, 1);
          }
          for (const rid of q.rewardItemIds) {
            const it = makeItem(rid);
            this.inventory.push(it);
            this.pushLog(`${npc.name} gives you ${it.icon} ${it.name}.`, 'system');
          }
          this.questLog.complete(action.questId);
          this.pushLog(`📜 Quest complete: ${q.name}!`, 'system');
          this.bigMessage = `Quest Complete: ${q.name}!`;
          this.emitSnapshot();
          setTimeout(() => { this.bigMessage = null; this.emitSnapshot(); }, 2500);
        }
        break;
      }
      case 'endConvo': {
        this.showDialogue = null;
        break;
      }
    }
  }

  private hasItemInInventory(baseId: string): boolean {
    return this.inventory.some(i => i.id === baseId || (i as any)._baseId === baseId || (baseId === 'severed_finger' && i.name.includes('Severed Finger')));
  }

  // ══ HUD API (called from React) ════════════════════════════
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
    void runTitleNarration(this.cutsceneHost, ext, prevBg);
  }

 // ══ EDITOR (cutscene / level tweaker — Tier 1) ══════════════════════════
 // Builds the tavern set WITHOUT playing the intro director, leaving the
 // IsoCamera + tavernActors idle so the React DebugPanel can drive them
 // live and emit pasteable cutscene one-liners. Activated by `?debug`.
 private editorFocusTarget: THREE.Vector3 | null = null;
 enterEditorMode() {
   void this.audio.init();
   this.applyAudioSettings();
   if (!this.cutsceneHost) return;
   // drop the title-exterior backdrop (if any) so we build a clean tavern
   if (this.titleExt) {
     this.scene.remove(this.titleExt);
     if (this.titlePrevBg) { this.scene.background = this.titlePrevBg; this.titlePrevBg = null; }
     this.titleExt = null;
     this.titleIdle = false;
   }
   // ambient tavern set — mirror the first lines of playIntroCutscene
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

  // ══ save / load (multi-slot) ═════════════════════════════
  getSettings(): GameSettings { return { ...this.settings }; }

  setSettings(s: GameSettings) {
    this.settings = { ...s };
    SettingsManager.save(this.settings);
    this.applyAudioSettings();
    this.emitSnapshot();
  }

  private applyAudioSettings() {
    this.audio.applySettings(this.settings);
  }

  // ══ pause (in-game menu) ══════════════════════════════════
  /** freeze / resume the simulation (the pause menu is rendered by React
   *  from the `paused` flag in the UISnapshot) */
  setPaused(b: boolean) {
    if (this.paused === b) return;
    this.paused = b;
    if (b) this.keys.clear();   // release any held movement keys
    this.emitSnapshot();
  }

  private togglePause() {
    if (this.phase === 'menu') return;
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
    this.pushLog('💾 Game saved.', 'system');
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

    // ── tear down the title backdrop if it's still up ──
    if (this.titleExt) { this.scene.remove(this.titleExt); this.titleExt = null; }
    if (this.titlePrevBg) { this.scene.background = this.titlePrevBg; this.titlePrevBg = null; }
    if (this.tavern) { this.scene.remove(this.tavern); this.tavern = null; }
    this.titleIdle = false;

    // ── restore state ──
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

    // ── reveal the dungeon + reposition every rig ──
    this.world.group.visible = true;
    this.props.group.visible = true;
    this.repositionAllVisuals();
    if (this.bonfireLit) this.spawnBonfireFlame();

    // ── camera / audio / flags ──
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

    // ── hero rig + camera focus ──
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

    this.pushLog('Save loaded — welcome back, adventurer.', 'system');
    this.emitSnapshot();
    return true;
  }

  /** deep-clone plain serializable data (units/items are JSON-safe) */
  private clone<T>(x: T): T {
    return JSON.parse(JSON.stringify(x)) as T;
  }

  private partyName(): string {
    const leader = this.combat.living('party')[0];
    return leader ? leader.name : 'Adventurer';
  }

  /** snap every rig to its unit's saved tile + visibility/anim state */
  private repositionAllVisuals() {
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
  private spawnBonfireFlame() {
    if (!this.bonfireGroup) return;
    if (this.bonfireGroup.getObjectByName('bf_light')) return; // already lit
    this.bonfireGroup.userData.lit = true;
    const flameMat = new THREE.MeshLambertMaterial({ color: 0xffb545, emissive: 0xff7a1f, emissiveIntensity: 0.9 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const e = new THREE.Euler();
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.3;
      const sx = Math.cos(angle) * 0.12;
      const sz = Math.sin(angle) * 0.12;
      e.set(i * 0.2, angle, 0);
      m4.compose(new THREE.Vector3(sx, 0.42, sz), q.setFromEuler(e), sc.set(0.20, 0.36, 0.10));
      const im = new THREE.InstancedMesh(geo, flameMat, 1);
      im.setMatrixAt(0, m4);
      im.name = 'bf_flame';
      this.bonfireGroup.add(im);
    }
    const light = new THREE.PointLight(0xff9540, 26, 16, 1.7);
    light.position.set(0, 0.7, 0);
    light.name = 'bf_light';
    this.bonfireGroup.add(light);
  }

  /** called by the intro cutscene once it finishes — drops an initial
   *  autosave into the active slot so "Continue" works immediately */
  onIntroComplete() {
    if (this.currentSlotId) this.saveGame(this.currentSlotId, 'New Game');
  }

  // ══ sneak (called from React HUD) ══════════════════════════
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
    this.pushLog(this.torchLit ? 'Torch lit — the cave walls flicker back into view.' : 'Torch extinguished — darkness swallows you.', 'system');
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
    this.pushLog('🔥 You rest at the bonfire. Your wounds close. The dungeon stirs...', 'system');
    this.pushLog('Spend your XP here to level up, or change your skill loadout.', 'system');
    this.bigMessage = 'Bonfire Rest';
    this.emitSnapshot();
    setTimeout(() => { this.bigMessage = null; this.emitSnapshot(); }, 2000);
    // resting re-establishes the checkpoint — keep the slot current
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
    this.pushLog(`⬆ ${u.name} reaches level ${u.level}! (+6 max HP, +1 skill point). You feel slightly less drunk.`, 'system');
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
    this.pushLog('💀 Death is not the end. The bonfire restores you. The dungeon stirs...', 'system');
    this.emitSnapshot();
  }

  // ══ inventory / equipment (called from React HUD) ═════════
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
    }
    this.audio.play('ui_click', 0.5);
    this.pushLog(`${u.name} unequips ${item.icon} ${item.name}.`, 'system');
    this.emitSnapshot();
  }

  // ══ skill tree (called from React HUD) ═══════════════
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

  /** drink a potion — self-target; in combat only on the drinker's turn (bonus action) */
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

  private hotkeySkill(i: number) {
    const a = this.combat.active ?? this.byId(this.selectedId ?? '') ?? this.combat.living('party')[0];
    if (!a || a.team !== 'party') return;
    const id = a.equippedSkills[i];
    if (id) this.selectSkill(id);
  }

  private cancelTargeting() {
    if (!this.targeting) return;
    this.targeting = null;
    this.clearHighlights();
    this.showMoveTiles();
    this.emitSnapshot();
  }

  // ══ highlights ════════════════════════════════════════════
  private clearHighlights() {
    for (const h of this.hlPool) { h.mesh.visible = false; h.cat = ''; }
  }

  private paint(tiles: GridPos[], cat: string) {
    let used = 0;
    for (const h of this.hlPool) {
      if (used >= tiles.length) break;
      if (h.mesh.visible) continue;
      const t = tiles[used++];
      h.mesh.material = this.hlMats[cat];
      h.mesh.position.copy(this.unitWorld(t)).y += 0.03;
      h.mesh.visible = true;
      h.cat = cat;
    }
  }

  private showMoveTiles() {
    const a = this.combat.active;
    if (!a || a.team !== 'party' || this.phase !== 'combat') return;
    this.moveTiles = this.combat.reachable(a, a.movementLeft);
    const tiles = [...this.moveTiles.keys()].filter((k) => k !== `${a.pos.x},${a.pos.z}`).map((k) => {
      const [x, z] = k.split(',').map(Number);
      return { x, z };
    });
    this.paint(tiles, 'move');
  }

  private showTargeting(s: SkillDef, u: Unit) {
    this.clearHighlights();
    if (s.aoeRadius > 0) {
      // paint all tiles in range faintly; blast preview follows cursor
      const tiles: GridPos[] = [];
      for (let dx = -s.range; dx <= s.range; dx++) for (let dz = -s.range; dz <= s.range; dz++) {
        const x = u.pos.x + dx, z = u.pos.z + dz;
        if (this.world.inBounds(x, z) && Combat.dist(u.pos, { x, z }) <= s.range) tiles.push({ x, z });
      }
      this.paint(tiles, 'range');
    } else {
      const cat = s.targetsAllies ? 'ally' : 'aoe';
      const tiles = this.combat.units
        .filter((t) => t.alive && (s.targetsAllies ? t.team === u.team : t.team !== u.team) && Combat.dist(u.pos, t.pos) <= s.range)
        .map((t) => t.pos);
      this.paint(tiles, cat);
    }
  }

  private showAoePreview(s: SkillDef, center: GridPos) {
    this.showTargeting(s, this.combat.active!);
    const blast: GridPos[] = [];
    for (let dx = -s.aoeRadius; dx <= s.aoeRadius; dx++) for (let dz = -s.aoeRadius; dz <= s.aoeRadius; dz++) {
      const x = center.x + dx, z = center.z + dz;
      if (this.world.inBounds(x, z)) blast.push({ x, z });
    }
    this.paint(blast, 'aoe');
  }

  private pingAt(t: GridPos) {
    this.clickPing.position.copy(this.unitWorld(t)).y += 0.05;
    this.clickPingT = 0;
  }

  // ══ event queue → animation ════════════════════════════════
  private enqueue(events: CombatEvent[]) {
    if (!events.length) { this.emitSnapshot(); return; }
    this.queue.push(...events);
    if (!this.busy) void this.pump();
  }

  private async pump() {
    this.busy = true;
    this.emitSnapshot();
    while (this.queue.length && !this.disposed) {
      const ev = this.queue.shift()!;
      await this.animate(ev);
      this.emitSnapshot();
    }
    this.busy = false;
    this.emitSnapshot();
    // hand control to AI if needed
    const a = this.combat.active;
    if (this.combat.inCombat && a && a.team === 'enemy' && !this.disposed) {
      await delay(420);
      const step = this.combat.aiStep();
      if (step) this.enqueue(step);
      else this.enqueue(this.combat.endTurn());
    } else if (this.combat.inCombat && a && a.team === 'party') {
      this.showMoveTiles();
      this.iso.focus(this.unitWorld(a.pos));
    }
    this.emitSnapshot();
  }

  private async animate(ev: CombatEvent) {
    switch (ev.type) {
      case 'log': this.pushLog(ev.text, ev.kind); await delay(40); break;
      case 'move': await this.animMove(ev.unitId, ev.path); break;
      case 'melee': await this.animMelee(ev.unitId, ev.targetId); break;
      case 'projectile': await this.animProjectile(ev); break;
      case 'skillfx': await this.animSkillFx(ev.skill, ev.at, ev.targets); break;
      case 'damage': {
        const v = this.visuals.get(ev.unitId);
        if (v) { v.rig.anim.flinch = 1; this.refreshBar(ev.unitId); }
        await delay(120);
        break;
      }
      case 'heal': {
        const u = this.byId(ev.unitId);
        if (u) { FX.heal(this.particles, this.unitWorld(u.pos).add(new THREE.Vector3(0, 0.5, 0))); this.audio.play('heal', 0.8); this.refreshBar(ev.unitId); }
        await delay(150);
        break;
      }
      case 'float': this.spawnFloater(ev.unitId, ev.text, ev.cls); await delay(90); break;
      case 'save': this.spawnFloater(ev.unitId, ev.success ? `Save ${ev.total} ✓` : `Save ${ev.total} ✗`, ev.success ? 'save-ok' : 'save-fail'); await delay(60); break;
      case 'death': {
        const v = this.visuals.get(ev.unitId);
        if (v) {
          v.rig.anim.mode = 'dead'; v.rig.anim.t = 0; v.bar.style.display = 'none';
          this.dropWeapon(v);
        }
        this.audio.play('sword_hit', 0.4, 0.6);
        const slain = this.byId(ev.unitId);
        if (slain?.dropKey) this.grantKey(slain.dropKey);
        if (slain?.bossGroup || slain?.name === 'Baron Gnaw') {
          this.defeatedSpecialMobs.add(slain.id);
        }
        if (slain?.name === 'Baron Gnaw') {
          const finger = makeItem('severed_finger');
          this.inventory.push(finger);
          this.pushLog(`🐀 Baron Gnaw drops ${finger.icon} ${finger.name}!`, 'system');
        }
        await delay(500);
        break;
      }
      case 'turn': {
        const u = this.byId(ev.unitId);
        if (u) {
          this.iso.focus(this.unitWorld(u.pos));
          this.clearHighlights();
          if (u.team === 'party' && this.phase === 'combat') this.showMoveTiles();
        }
        await delay(280);
        break;
      }
      case 'phase': {
        this.phase = ev.phase;
        if (ev.phase === 'combat') {
          this.audio.setDrums(true);
          this.audio.setMusicDucked(true);
          // snap any explore-mode walkers to their logical tiles
          for (const [id, v] of this.visuals) {
            const u = this.byId(id);
            if (!u) continue;
            v.walker = null;
            if (u.alive) { v.rig.anim.mode = 'idle'; v.rig.group.position.copy(this.unitWorld(u.pos)); }
          }
        }
        if (ev.phase === 'victory') { this.audio.setDrums(false); this.audio.play('victory', 0.9); this.audio.setMusicDucked(false); this.spawnChest(); }
        if (ev.phase === 'defeat') { this.audio.setDrums(false); this.audio.setMusicDucked(false); }
        await delay(200);
        break;
      }
      case 'loot': this.grantLoot(ev.items, ev.gold); break;
      case 'levelup': {
        const u = this.byId(ev.unitId);
        if (u) {
          FX.levelup(this.particles, this.unitWorld(u.pos).add(new THREE.Vector3(0, 0.6, 0)));
          this.audio.play('heal', 0.9, 1.3);
          this.spawnFloater(ev.unitId, '⬆ LEVEL UP!', 'levelup');
        }
        await delay(450);
        break;
      }
      case 'shake': this.iso.shake = Math.max(this.iso.shake, ev.power); break;
    }
  }

  private async animMove(unitId: string, path: GridPos[]) {
    const v = this.visuals.get(unitId);
    if (!v || !path.length) return;
    const pts = path.map((t) => this.unitWorld(t));
    v.rig.anim.mode = 'walk';
    for (const p of pts) {
      const from = v.rig.group.position.clone();
      v.targetYaw = Math.atan2(p.x - from.x, p.z - from.z);
      const dur = 130;
      const t0 = performance.now();
      while (performance.now() - t0 < dur && !this.disposed) {
        const k = (performance.now() - t0) / dur;
        v.rig.group.position.lerpVectors(from, p, k);
        v.rig.group.position.y += Math.sin(k * Math.PI) * 0.12;
        await delay(8);
      }
      v.rig.group.position.copy(p);
      if (Math.random() < 0.5) FX.dust(this.particles, p.clone());
    }
    v.rig.anim.mode = 'idle';
    v.proxy.position.copy(v.rig.group.position).y += (v.proxy.userData.yOff as number) ?? 0.9;
    // check combat trap trigger at destination
    const u = this.byId(unitId);
    if (u) {
      const dest = path[path.length - 1];
      const trap = this.trapManager.at(dest.x, dest.z);
      if (trap && !trap.triggered) void this.triggerTrap(u, trap);
    }
  }

  private async animMelee(unitId: string, targetId: string) {
    const v = this.visuals.get(unitId), tv = this.visuals.get(targetId);
    if (!v || !tv) return;
    const vp = v.rig.group.position;
    const tp = tv.rig.group.position;
    v.targetYaw = Math.atan2(tp.x - vp.x, tp.z - vp.z);
    const dir = tp.clone().sub(vp).setY(0).normalize();
    const home = vp.clone();
    v.rig.anim.lunge = 1;
    for (let k = 0; k <= 1 && !this.disposed; k += 0.12) {
      vp.copy(home).addScaledVector(dir, Math.sin(k * Math.PI) * 0.5);
      await delay(16);
    }
    vp.copy(home);
    // impact
    const impact = tp.clone().add(new THREE.Vector3(0, 0.9, 0));
    FX.slash(this.particles, impact);
    FX.blood(this.particles, impact);
    this.audio.play('sword_hit', 0.85);
    this.iso.shake = Math.max(this.iso.shake, 0.14);
  }

  /** melee-lunge smash against a destructible prop (explore & combat) */
  private async smashProp(u: Unit, prop: Destructible, skill?: SkillDef) {
    if (this.busy) return;
    this.busy = true;
    const v = this.visuals.get(u.id);
    if (v) {
      const vp = v.rig.group.position;
      const tp = this.props.worldPos(prop);
      v.targetYaw = Math.atan2(tp.x - vp.x, tp.z - vp.z);
      const dir = tp.clone().sub(vp).setY(0).normalize();
      const home = vp.clone();
      v.rig.anim.lunge = 1;
      for (let k = 0; k <= 1 && !this.disposed; k += 0.12) {
        vp.copy(home).addScaledVector(dir, Math.sin(k * Math.PI) * 0.5);
        await delay(16);
      }
      vp.copy(home);
    }
    this.pushLog(`${u.name} smashes the ${prop.def.name}!`, 'hit');
    this.destroyProp(prop);
    if (this.combat.inCombat && skill) {
      if (skill.cost === 'action') u.hasAction = false;
      else if (skill.cost === 'bonus') u.hasBonus = false;
    }
    this.busy = false;
    this.emitSnapshot();
  }

  /** shatter a prop: debris FX + crumble SFX + log + loot drops */
  private destroyProp(prop: Destructible) {
    const wp = this.props.worldPos(prop);
    const { items, gold } = this.props.destroy(prop);
    FX.debris(this.particles, wp.clone().add(new THREE.Vector3(0, 0.35, 0)), prop.def.palette, 24);
    FX.dust(this.particles, wp.clone());
    this.audio.crumble(0.9);
    this.iso.shake = Math.max(this.iso.shake, 0.18);
    this.pushLog(`${prop.def.icon} The ${prop.def.name} shatters!`, 'system');
    for (const it of items) this.pushLog(`The ${prop.def.name} drops ${it.icon} ${it.name}.`, 'system');
    if (gold) this.pushLog(`The ${prop.def.name} drops 🪙 ${gold} gold.`, 'system');
    this.grantLoot(items, gold);
    this.emitSnapshot();
  }

  // ══ traps ═══════════════════════════════════════════════════
  private async triggerTrap(u: Unit, trap: import('./traps').Trap) {
    trap.revealed = true;
    this.trapManager.trigger(trap, (dice, type, cond, condRounds) => {
      this.audio.crumble(0.7);
      this.iso.shake = Math.max(this.iso.shake, 0.2);
      const dmg = dice !== '0' ? rollDice(dice) : null;
      const amt = dmg?.total ?? 0;
      if (amt > 0) {
        u.hp = Math.max(0, u.hp - amt);
        this.spawnFloater(u.id, `⚠ -${amt}`, 'dmg');
        this.pushLog(`${u.name} triggers ${trap.def.icon} ${trap.def.name}! Takes ${amt} ${type} damage.`, 'hit');
      } else this.pushLog(`${u.name} triggers ${trap.def.icon} ${trap.def.name}!`, 'system');
      if (cond && !u.conditions.some((c) => c.id === cond)) {
        const cn = CONDITIONS[cond]?.name ?? cond;
        u.conditions.push({ id: cond, name: cn, roundsLeft: condRounds ?? 2 });
        this.spawnFloater(u.id, `❄ ${cn}`, 'debuff');
      }
      FX.debris(this.particles, this.unitWorld(u.pos).clone().add(new THREE.Vector3(0, 0.35, 0)), [0xff8c00, 0xcc6600, 0x884400], 16);
    });
    this.emitSnapshot();
    await delay(200);
  }

  private async disarmTrap(u: Unit, trap: import('./traps').Trap) {
    const dexMod = Math.floor((u.abilities.dex - 10) / 2);
    const roll = 1 + Math.floor(Math.random() * 20);
    const total = roll + dexMod + u.proficiency;
    this.pushLog(`${u.name} attempts to disarm ${trap.def.icon} ${trap.def.name}... Roll ${roll}${dexMod >= 0 ? '+' : ''}${dexMod} (DEX) +${u.proficiency} prof = ${total} vs DC 12`, 'roll');
    if (total >= 12) {
      this.pushLog(`${u.name} disarms the ${trap.def.name}!`, 'system');
      this.audio.play('ui_click', 0.7);
      const goldReward = 3 + Math.floor(Math.random() * 8);
      this.grantLoot([], goldReward);
      this.spawnFloater(u.id, '✔ Disarmed!', 'buff');
    } else {
      this.pushLog(`${u.name} fumbles the disarm!`, 'system');
      await this.triggerTrap(u, trap);
    }
    this.emitSnapshot();
  }

  /** items → inventory, gold → purse, recap lines → victory-screen loot list */
  private grantLoot(items: Item[], gold: number) {
    this.inventory.push(...items);
    this.gold += gold;
    for (const it of items) this.loot.push(`${it.icon} ${it.name}`);
    if (gold) this.loot.push(`🪙 ${gold} gold`);
  }

  private async animProjectile(ev: Extract<CombatEvent, { type: 'projectile' }>) {
    const v = this.visuals.get(ev.unitId);
    const from = this.unitWorld(ev.from).add(new THREE.Vector3(0, 1.2, 0));
    const to = this.unitWorld(ev.to).add(new THREE.Vector3(0, 0.6, 0));
    if (v) v.targetYaw = Math.atan2(to.x - v.rig.group.position.x, to.z - v.rig.group.position.z);
    const mat = new THREE.MeshBasicMaterial({ color: ev.color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mat);
    this.scene.add(mesh);
    this.audio.play(ev.fx === 'arrow' ? 'arrow' : ev.fx === 'fire' ? 'fireball' : 'magic_missile', 0.7);
    const dur = ev.fx === 'arrow' ? 240 : 430;
    const t0 = performance.now();
    while (performance.now() - t0 < dur && !this.disposed) {
      const k = (performance.now() - t0) / dur;
      mesh.position.lerpVectors(from, to, k);
      mesh.position.y += Math.sin(k * Math.PI) * (ev.fx === 'arrow' ? 0.6 : 2.2);
      FX.trail(this.particles, mesh.position.clone(), ev.color);
      await delay(12);
    }
    this.scene.remove(mesh);
    mat.dispose(); mesh.geometry.dispose();
    // impact
    if (ev.fx === 'fire') {
      FX.explosion(this.particles, to, 2);
      this.iso.shake = Math.max(this.iso.shake, 0.5);
      this.flashLight(to, 0xff7a1f);
    } else if (ev.fx === 'arcane') {
      FX.arcane(this.particles, to);
    } else {
      FX.blood(this.particles, to);
      this.audio.play('sword_hit', 0.5, 1.3);
    }
  }

  private async animSkillFx(s: SkillDef, at: GridPos, targets: string[]) {
    const p = this.unitWorld(at).add(new THREE.Vector3(0, 0.6, 0));
    switch (s.fx) {
      case 'fire': FX.explosion(this.particles, p, s.aoeRadius || 1); this.audio.play('fireball', 0.85); this.iso.shake = Math.max(this.iso.shake, 0.5); this.flashLight(p, 0xff7a1f); break;
      case 'ice': FX.ice(this.particles, p); this.audio.play('magic_missile', 0.8, 0.6); this.iso.shake = Math.max(this.iso.shake, 0.25); break;
      case 'holy': FX.holy(this.particles, p); this.audio.play('heal', 0.7, 1.4); this.flashLight(p, 0xfde68a); break;
      case 'heal': FX.heal(this.particles, p); break;
      case 'buff': for (const id of targets) { const u = this.byId(id); if (u) FX.buff(this.particles, this.unitWorld(u.pos).add(new THREE.Vector3(0, 0.6, 0))); } this.audio.play('heal', 0.7, 1.2); break;
      case 'slash': FX.slash(this.particles, p, 0xffb054); this.audio.play('sword_hit', 0.9, 0.85); this.iso.shake = Math.max(this.iso.shake, 0.2); break;
      default: FX.arcane(this.particles, p); this.audio.play('magic_missile', 0.7);
    }
    // fire/ice blasts shatter every destructible caught in the radius
    if (s.aoeRadius > 0 && (s.fx === 'fire' || s.fx === 'ice')) {
      for (const prop of this.props.inBlast(at, s.aoeRadius)) this.destroyProp(prop);
    }
    await delay(380);
  }

  private flashLight(at: THREE.Vector3, color: number) {
    const l = new THREE.PointLight(color, 60, 16, 1.6);
    l.position.copy(at).y += 1;
    this.scene.add(l);
    const t0 = performance.now();
    const fade = () => {
      const k = (performance.now() - t0) / 400;
      if (k >= 1 || this.disposed) { this.scene.remove(l); return; }
      l.intensity = 60 * (1 - k);
      requestAnimationFrame(fade);
    };
    fade();
  }

  // ══ floaters & bars ═══════════════════════════════════════
  private spawnFloater(unitId: string, text: string, cls: string) {
    const u = this.byId(unitId);
    if (!u) return;
    const el = document.createElement('div');
    el.className = `fx-float ${cls}`;
    el.textContent = text;
    this.overlay.appendChild(el);
    this.floaters.push({ el, wp: this.unitWorld(u.pos).add(new THREE.Vector3(0, 1.9, 0)), t: 0 });
  }

  private refreshBar(unitId: string) {
    const u = this.byId(unitId);
    const v = this.visuals.get(unitId);
    if (!u || !v) return;
    v.barFill.style.width = `${Math.max(0, (u.hp / effMaxHp(u)) * 100)}%`;
  }

  private spawnChest() {
    const boss = this.combat.units.find((u) => u.name === 'Boss Skar');
    const at = boss ? boss.pos : { x: 34, z: 10 };
    const g = new THREE.Group();
    const gold = new THREE.MeshLambertMaterial({ color: 0x8a5a1e });
    const trim = new THREE.MeshLambertMaterial({ color: 0xf5c542, emissive: 0x7a5a10, emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.55), gold);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.22, 0.59), trim);
    lid.position.y = 0.32;
    body.castShadow = lid.castShadow = true;
    g.add(body, lid);
    g.position.copy(this.unitWorld(at)).y += 0.25;
    this.scene.add(g);
    this.chest = g;
    this.pushLog('✨ A gilded chest appears among the ruins!', 'system');
  }

  // ══ combat trigger (explore proximity + vision cones) ═══
  private checkCombatTrigger() {
    if (this.structures) { this.checkDungeonAggro(); return; }
    if (this.phase !== 'explore' || this.combat.inCombat) return;
    const party = this.combat.living('party');
    const foes = this.combat.living('enemy');
    if (!party.length || !foes.length) return;

    // old distance trigger (6 tiles) — only when not sneaking
    if (!this.sneaking) {
      for (const p of party) for (const f of foes) {
        if (Combat.dist(p.pos, f.pos) <= 6) {
          this.pushLog('⚠ Ambush! Goblins pour from the ruins!', 'system');
          this.audio.play('fireball', 0.35, 0.5);
          this.enqueue(this.combat.start());
          return;
        }
      }
    }

    // vision cone detection
    for (const p of party) {
      for (const f of foes) {
        if (!this.inEnemyCone(p.pos, f)) continue;
        if (!this.sneaking) {
          // spotted instantly (cone alert even outside 6-tile radius)
          this.pushLog(`⚠ ${f.name} spots ${p.name}!`, 'system');
          this.audio.play('fireball', 0.35, 0.5);
          this.enqueue(this.combat.start());
          return;
        }
        // sneaking — accumulate meter
        let em = this.detectionMeter.get(f.id);
        if (!em) { em = new Map(); this.detectionMeter.set(f.id, em); }
        const dist = Combat.dist(p.pos, f.pos);
        const rate = (1 - dist / 9) * 0.12;
        const cur = (em.get(p.id) ?? 0) + rate;
        em.set(p.id, cur);
        if (cur >= 1) {
          this.pushLog(`⚠ ${f.name} detects ${p.name}!`, 'system');
          this.audio.play('fireball', 0.35, 0.5);
          this.enqueue(this.combat.startDetection(true));
          return;
        }
      }
    }

    // chest pickup
    if (this.chest) {
      const cp = this.chest.position;
      for (const p of party) {
        const wp = this.unitWorld(p.pos);
        if (wp.distanceTo(cp) < 1.6) {
          this.scene.remove(this.chest);
          this.chest = null;
          const { items, gold } = rollLootTable('chest');
          this.audio.play('victory', 0.6, 1.4);
          FX.levelup(this.particles, cp);
          this.pushLog(`You pry open the chest: ${[...items.map((i) => `${i.icon} ${i.name}`), `🪙 ${gold} gold`].join(', ')}.`, 'system');
          this.grantLoot(items, gold);
          this.emitSnapshot();
          break;
        }
      }
    }
  }

  /** check if a point is inside an enemy's vision cone */
  private inEnemyCone(p: GridPos, enemy: Unit): boolean {
    const dist = Combat.dist(p, enemy.pos);
    if (dist > 9) return false;
    if (!enemy.alive) return false;
    const cd = this.enemyCones.find((c) => c.unitId === enemy.id);
    if (!cd) return false;
    const dx = p.x - enemy.pos.x, dz = p.z - enemy.pos.z;
    const angle = Math.atan2(dx, dz);
    let diff = angle - cd.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= 35 * Math.PI / 180;
  }

  // ══ main update ═══════════════════════════════════════════
  private update(dt: number) {
    // pause — freeze all simulation while the in-game menu is open.
    // The render loop (composer.render) still runs, so the frozen frame shows.
    if (this.paused) return;
    // keyboard pan — suspended while a cutscene is driving the camera
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
    // No continuous pulling — no jerkiness, no fighting the player's panning.

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

    // sneak visual — smooth crouch
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
        v.rig.anim.crouch = c;   // rig bends the knees & hunches — feet stay planted
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

    // ── vision cones (explore only) ──
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
        // ONLY show enemy vision cones when the player is sneaking —
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

  // ══ snapshot / log ════════════════════════════════════════
  private pushLog(text: string, kind: LogEntry['kind']) {
    this.log.push({ id: this.logSeq++, text, kind });
    if (this.log.length > 90) this.log = this.log.slice(-90);
  }

  private emitSnapshot() {
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
