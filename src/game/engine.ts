// ─────────────────────────────────────────────────────────────
// GameEngine — presentation & orchestration layer.
//   combat.ts  → decides WHAT happens (events)
//   engine.ts  → decides HOW it looks/sounds (this file)
// React talks to the engine only through UISnapshot + method calls.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
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
import { canUnlock, treeFor } from './skilltree';
import { TrapManager } from './traps';
import { rollDice } from './dice';
import type { CombatEvent, GamePhase, GridPos, LogEntry, SkillDef, UISnapshot, Unit } from './types';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

interface UnitVisual {
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
  private sneaking = false;
  private crouchLerp = 0;
  private torchLit = true;
  private torchLight: THREE.PointLight | null = null;
  private bonfireGroup: THREE.Group | null = null;
  private bonfirePos: GridPos | null = null;
  private bonfireLit = false;
  private pendingSmash: { unitId: string; propId: string } | null = null;
  private bigMessage: string | null = null;
  private cinematic = false;

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
      document.body.appendChild(this.fadeEl);
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
    // find bonfire prop
    for (const child of this.world.group.children) {
      if ((child as any).userData?.isBonfire) {
        this.bonfireGroup = child as THREE.Group;
        break;
      }
    }
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

    // give the lone warrior a lit hand-torch — but only once he's in the
    // dungeon (not during the tavern flashback of the intro cutscene)
    const hero = this.combat.living('party')[0];
    const hv = hero ? this.visuals.get(hero.id) : null;
    if (hv && !this.inTavern) this.attachHeroTorch(hv.rig);
  }

  /** Mount a burning torch in the hero's off-hand; its point light is the
   *  warm glow that lets the lone warrior see through the dark warren. */
  private attachHeroTorch(rig: Rig) {
    const hand = rig.parts.handL ?? rig.parts.armL;
    if (!hand) return;
    const torch = new THREE.Group();
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.045, 0.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x5a3a1e }),
    );
    stick.position.y = 0.22; torch.add(stick);
    const wrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.06, 0.13, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a1a0e }),
    );
    wrap.position.y = 0.48; torch.add(wrap);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.34, 7),
      new THREE.MeshBasicMaterial({ color: 0xffb545 }),
    );
    flame.position.y = 0.68; flame.name = 'hero_flame'; torch.add(flame);
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, 0.2, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    core.position.y = 0.7; torch.add(core);
    const light = new THREE.PointLight(0xffb060, 13, 15, 1.5);
    light.position.set(0, 0.66, 0);
    torch.add(light);
    torch.position.set(0, 0.02, 0.06);
    hand.add(torch);
    this.heroTorchFlame = flame;
    this.heroLight = light;
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

  // ══ tavern flashback set (intro cutscene) ═════════════════════
  private buildTavern(): THREE.Group {
    const g = new THREE.Group();
    const wood = 0x6b4a2e, woodD = 0x4a3320, stone = 0x55504a, iron = 0x2a2622;
    const box = (w: number, h: number, d: number, c: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
      m.castShadow = m.receiveShadow = true; return m;
    };
    // floor (wooden planks)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 11), new THREE.MeshLambertMaterial({ color: woodD }));
    floor.position.y = -0.15; g.add(floor);
    // back + side walls
    const back = box(13, 4, 0.3, stone); back.position.set(0, 2, -5.2); g.add(back);
    const left = box(0.3, 4, 11, stone); left.position.set(-6.2, 2, 0); g.add(left);
    const right = box(0.3, 4, 11, stone); right.position.set(6.2, 2, 0); g.add(right);
    // a couple of warm wall torches
    for (const x of [-4.5, 4.5]) {
      const bracket = box(0.2, 0.5, 0.2, iron); bracket.position.set(x, 2.6, -5); g.add(bracket);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 7), new THREE.MeshBasicMaterial({ color: 0xffb545 }));
      flame.position.set(x, 3.0, -4.95); g.add(flame);
      const l = new THREE.PointLight(0xffb060, 9, 11, 1.6); l.position.set(x, 3.0, -4.6); g.add(l);
    }
    // the hero's table
    const table = new THREE.Group();
    const top = box(2.4, 0.18, 1.4, wood); top.position.y = 1.0; table.add(top);
    for (const [sx, sz] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]] as const) {
      const leg = box(0.18, 1.0, 0.18, woodD); leg.position.set(sx, 0.5, sz); table.add(leg);
    }
    table.position.set(0, 0, 0.4); g.add(table);
    // a stool for Greg
    const stool = box(0.7, 0.7, 0.7, woodD); stool.position.set(0, 0.35, 1.9); g.add(stool);
    // a barrel in the corner
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.3, 12), new THREE.MeshLambertMaterial({ color: wood }));
    barrel.position.set(4.6, 0.65, -3.8); g.add(barrel);
    // a snoozing patron slumped at a far table — comic background detail (asleep)
    const snoozer = buildCharacter(
      { skin: 0x9a7a55, cloth: 0x3a4a5a, accent: 0x2a2a2a, hair: 0x140f0f, hood: false, style: 'normal' }, 'mug' as any,
    );
    snoozer.group.position.set(-3.6, 0, -3.2);
    snoozer.group.rotation.y = Math.PI * 0.9;
    (snoozer.group.children.find((c) => c.type === 'Group') as THREE.Object3D | undefined)?.traverse((o) => { (o as THREE.Mesh).visible = true; });
    snoozer.anim.mode = 'lie';
    g.add(snoozer.group); this.tavernRigs.push(snoozer);
    // barmaid behind the counter (left) — short dress, apron, tray
    const barmaid = buildCharacter(
      { skin: 0xd9a066, cloth: 0xdfe4ea, accent: 0x8b7355, hair: 0xc48a44, hood: false, kind: 'barmaid' }, 'staff' as any,
    );
    barmaid.group.position.set(-3.8, 0, -1.5);
    barmaid.group.rotation.y = 0.7;
    barmaid.anim.crouch = 0;
    g.add(barmaid.group); this.tavernRigs.push(barmaid); this.tavernActors.barmaid = barmaid;
    // jumpy wizard in the right corner — long robe, star hat, white beard, staff
    const wizard = buildCharacter(
      { skin: 0xf0d9b5, cloth: 0x4a2a6a, accent: 0x8a4af0, hair: 0xd0d0d0, hood: false, kind: 'wizard' }, 'staff',
    );
    wizard.group.position.set(4.5, 0, -3.3);
    wizard.group.rotation.y = -1.3;
    g.add(wizard.group); this.tavernRigs.push(wizard); this.tavernActors.wizard = wizard;
    // retired-orc bouncer near the entrance — bald, black vest, bulky, club
    const bouncer = buildCharacter(
      { skin: 0x5f7a3a, cloth: 0x2a1f1a, accent: 0x1a0f0a, hair: 0x101010, hood: false, kind: 'bouncer', bulk: 1.45 }, 'club',
    );
    bouncer.group.position.set(3.4, 0, -4.0);
    bouncer.group.rotation.y = -0.5;
    g.add(bouncer.group); this.tavernRigs.push(bouncer); this.tavernActors.bouncer = bouncer;
    return g;
  }

  /** a small voxel-ish sheep, swapped in for Greg during the Polymorph gag */
  private buildSheep(): THREE.Group {
    const g = new THREE.Group();
    const wool = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2622 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc9b89a });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 12), wool);
    body.scale.set(1.3, 1.0, 1.7); body.position.y = 1.05; body.castShadow = true; g.add(body);
    for (const [x, y, z] of [[0.7, 1.5, 0.6], [-0.7, 1.5, -0.4], [0.3, 1.7, -0.7], [-0.4, 1.6, 0.7], [0.5, 1.4, -0.6]] as const) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), wool); b.position.set(x, y, z); g.add(b);
    }
    for (const [x, z] of [[0.6, 0.75], [-0.6, 0.75], [0.6, -0.75], [-0.6, -0.75]] as const) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), dark); l.position.set(x, 0.5, z); g.add(l);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin); head.position.set(0, 1.25, 1.35); g.add(head);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.18), skin); e.position.set(s * 0.3, 1.5, 1.4); g.add(e);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), dark); eye.position.set(s * 0.15, 1.3, 1.6); g.add(eye);
    }
    return g;
  }

  /** Intro cutscene — "Dungeon Hangover": Greg the Grim drinks himself
   *  belligerent in a tavern, passes out, and wakes at the bottom of a
   *  50-floor dungeon in his smallclothes with a migraine. Narrated, with
   *  edge-tts voice (falls back to text-only if assets are missing). */
  private async playIntroCutscene() {
    const hero = this.combat.living('party')[0];
    if (!hero) return;
    const hv = this.visuals.get(hero.id);
    if (!hv) return;
    this.busy = true;
    this.introActive = true;
    this.cutsceneSkip = false;

    // ── build the tavern flashback, drop the dungeon behind it ──
    this.inTavern = true;
    this.world.group.visible = false;
    this.props.group.visible = false;
    this.tavern = this.buildTavern();
    this.scene.add(this.tavern);
    this.scene.fog = new THREE.Fog(0x140d08, 6, 26);

    // seat Greg at the table with a tankard (facing the table, not the wall)
    const seat = new THREE.Vector3(0, 0, 1.9);
    hv.rig.group.position.copy(seat);
    hv.rig.group.rotation.y = Math.PI;
    hv.yaw = hv.targetYaw = Math.PI;
    hv.rig.anim.mode = 'sit'; hv.rig.anim.crouch = 0; hv.rig.anim.lunge = 0; hv.rig.anim.flinch = 0;
    const mug = new THREE.Group();
    const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.24, 8), new THREE.MeshLambertMaterial({ color: 0x8a5a2e }));
    const mugFoam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8), new THREE.MeshLambertMaterial({ color: 0xf2ead2 }));
    mugFoam.position.y = 0.14; mug.add(mugBody, mugFoam);
    (mugBody.geometry as THREE.BufferGeometry).computeBoundingSphere();
    const hand = hv.rig.parts.handR ?? hv.rig.parts.armR;
    let mugHand: THREE.Object3D | null = null;
    if (hand) { mug.position.set(0, 0.18, 0.12); hand.add(mug); mugHand = hand; }
    hv.rig.group.scale.setScalar(1);

    // camera: cinematic slow ease, keep the lens *inside* the tavern set
    this.iso.lerp = 2.0;
    this.iso.box = { minX: -6, maxX: 6, minZ: -5, maxZ: 5, minY: 1, maxY: 14 };
    const head = seat.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.iso.desiredYaw = -Math.PI * 0.22; this.iso.desiredPitch = 0.5; this.iso.desiredDist = 5.2;
    this.iso.focus(head);
    this.fadeTo(0);          // fade in from black
    await this.cineDelay(900);
    if (this.introSkipped) { this.finishIntro(); return; }

    // ── ACT 1: the belligerent drunk ──
    for (let i = 0; i < 5; i++) { hv.rig.anim.mode = 'drink'; await this.cineDelay(280); hv.rig.anim.mode = 'sit'; await this.cineDelay(220); }  // sloshing the mug
    await this.narrate('greg_1', 'Last call! Last call! And if any o\' you lily-livered cowards got a problem with Greg the Grim, you best bring it to my face!', 5200);
    if (this.introSkipped) { this.finishIntro(); return; }
    this.iso.desiredYaw = Math.PI * 0.5; this.iso.desiredDist = 7; this.iso.focus(new THREE.Vector3(0, 2, 1));  // pan across the room
    await this.cineDelay(1400);
    await this.narrate('greg_2', 'Piss off, Norris, I paid for the whole table! The whole table is MINE! Bartender, another! The good stuff! The EXPENSIVE stuff!', 5800);
    if (this.introSkipped) { this.finishIntro(); return; }

    // ── the room reacts — camera pushes in on each NPC as they're mentioned ──
    const bc = this.tavernActors.bouncer;
    this.iso.desiredYaw = -1.2; this.iso.desiredDist = 4.6; this.iso.focus(new THREE.Vector3(-3.8, 1.2, -1.5));
    await this.cineDelay(600);
    await this.narrate('narr_tavern', 'The barmaid has seen this routine forty-seven times. She pours another. Greg takes it as encouragement. Nobody else in the room moves.', 7200);
    if (this.introSkipped) { this.finishIntro(); return; }

    this.iso.desiredYaw = 0.4; this.iso.desiredDist = 4.6; this.iso.focus(new THREE.Vector3(4.5, 1.3, -3.3));
    await this.cineDelay(500);
    await this.narrate('narr_wizard', 'In the corner, a jumpy little wizard is scribbling something on a napkin. The kind of notes you take before casting Polymorph. He looks very, very ready to use them.', 7600);
    if (this.introSkipped) { this.finishIntro(); return; }

    // ── the bouncer cracks his knuckles (animated) as the narrator names him ──
    this.iso.desiredYaw = 0.5; this.iso.desiredDist = 5.0;
    this.iso.focus(new THREE.Vector3(3.4, 1.0, -4.0));
    if (bc) bc.anim.mode = 'crack';
    await this.cineDelay(400);
    this.iso.focus(head); this.iso.desiredDist = 5.5;
    await this.narrate('narr_bouncer', 'The bouncer — a retired orc warlord who traded raiding for the quiet life — cracks his knuckles. Greg mistakes this for applause and stands on the table.', 7600);
    if (bc) bc.anim.mode = 'idle';
    if (this.introSkipped) { this.finishIntro(); return; }
    // Greg clambers onto the table
    hv.rig.group.position.y = 1.3;     // on top of the table
    hv.rig.anim.crouch = 0; hv.rig.anim.lunge = 1;
    await this.cineDelay(900);

    // ── CHAOS: barstool flies, wizard casts Polymorph, SHEEP! ──
    const stoolWp = new THREE.Vector3(0, 0.35, 1.9);
    const stoolMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x4a3320 }));
    stoolMesh.position.copy(stoolWp); this.scene.add(stoolMesh);
    const stoolTarget = new THREE.Vector3(4.2, 1.0, -3.5);
    this.animateTo(() => stoolMesh.position.x, (v) => { stoolMesh.position.x = v; }, stoolTarget.x, 0.5);
    this.animateTo(() => stoolMesh.position.z, (v) => { stoolMesh.position.z = v; }, stoolTarget.z, 0.5);
    this.animateTo(() => stoolMesh.position.y, (v) => { stoolMesh.position.y = v; }, stoolTarget.y, 0.5);
    this.iso.shake = Math.max(this.iso.shake, 0.15);
    await this.cineDelay(250);
    // PURPLE FLASH — polymorph!
    FX.explosion(this.particles, stoolTarget, 1.2);
    this.particles.burst({ pos: stoolTarget, count: 30, color: [0x8a4af0, 0xb06af0, 0xffffff, 0xdaa0ff], speed: [1, 4], life: [0.4, 0.9], size: [0.3, 0.8], gravity: -1.5, up: 2.5, endScale: 0.1 });
    this.iso.shake = Math.max(this.iso.shake, 0.22);
    if (this.heroLight) this.heroLight.color.setHex(0x8a4af0);  // purple flash
    // swap Greg's rig for an actual sheep for ~3 seconds
    const gregWp = hv.rig.group.position.clone();
    const sheep = this.buildSheep();
    sheep.position.copy(gregWp); sheep.scale.setScalar(hv.rig.group.scale.x);
    this.tavern!.add(sheep);
    hv.rig.group.visible = false;
    await this.cineDelay(3000);
    hv.rig.group.visible = true;
    this.tavern!.remove(sheep);
    if (this.heroLight) this.heroLight.color.setHex(0xffb060);  // restore
    await this.narrate('narr_sheep', 'A barstool flies. The wizard shrieks. There is a flash of purple light. And for approximately three seconds, Greg the Grim is a very, very loud sheep.', 7600);
    this.scene.remove(stoolMesh); stoolMesh.geometry.dispose();
    if (this.introSkipped) { this.finishIntro(); return; }
    // Greg stumbles off the table, dizzy
    hv.rig.group.position.y = 0;
    hv.rig.anim.crouch = 0.8; hv.rig.anim.flinch = 0.7;
    await this.cineDelay(600);

    // ── ACT 3: one last drink, then the long faint ──
    hv.rig.anim.lunge = 0.7; await this.cineDelay(500); hv.rig.anim.lunge = 0;
    this.audio.play('dice', 0.5);     // a final gulp / clunk
    this.iso.desiredDist = 3.6; this.iso.focus(head);   // tight on his face
    await this.cineDelay(900);
    hv.rig.anim.flinch = 1; this.iso.shake = Math.max(this.iso.shake, 0.18);   // he wilts
    hv.rig.group.rotation.x = -0.5;   // face plants toward the table
    await this.cineDelay(1100);
    this.clearCine();
    this.fadeTo(1);                    // to black
    await this.cineDelay(800);
    await this.narrate('narr_bridge', 'Greg the Grim drank the tavern dry, insulted a man with a sword, challenged a polymorph wizard to a fistfight, and briefly became livestock. None of those ended well.', 6800);
    if (this.introSkipped) { this.finishIntro(); return; }

    // ── ACT 3: wake at the bottom of the dungeon ──
    this.scene.remove(this.tavern); this.tavern = null; this.tavernRigs = []; this.tavernActors = {}; this.iso.box = null;
    this.world.group.visible = true;
    this.props.group.visible = true;
    this.scene.fog = new THREE.Fog(0x08080e, 4, 24);
    this.inTavern = false;

    // Greg lies on the floor of the starter room, groggy
    const floorWp = this.unitWorld(this.combat.units[0].pos);
    hv.rig.group.position.copy(floorWp);
    hv.rig.group.rotation.set(0, Math.PI, 0);
    hv.yaw = hv.targetYaw = Math.PI;
    hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 1; hv.rig.anim.mode = 'floor';
    if (mugHand) mugHand.remove(mug);   // no mug in the dungeon

    this.iso.desiredYaw = Math.PI * 0.25; this.iso.desiredPitch = 0.62; this.iso.desiredDist = 8;
    this.iso.focus(floorWp.clone().add(new THREE.Vector3(0, 1.2, 0)));
    this.fadeTo(0);
    await delay(700);
    await this.narrate('narr_wake', 'You wake at the bottom of a fifty floor dungeon. In your underwear. With a headache that could crush a small kingdom.', 6200);
    if (this.introSkipped) { this.finishIntro(); return; }

    // migraine — star-spangles circling his head
    const starPos = floorWp.clone().add(new THREE.Vector3(0, 1.7, 0));
    this.spawnStars(starPos);
    await this.narrate('narr_premise', 'A bag of basic supplies sits by your head: a rusty dagger, a health potion, and a torch that probably won\'t last. The only way out is up.', 6600);
    if (this.introSkipped) { this.finishIntro(); return; }

    // he hauls himself to his feet (crouch → stand) while the stars spin off
    hv.rig.anim.mode = 'idle'; hv.rig.anim.crouch = 1.2;
    this.animateTo(() => hv.rig.anim.crouch, (val) => { hv.rig.anim.crouch = val; }, 0, 1.3);
    this.iso.desiredDist = 5.5; this.iso.focus(floorWp.clone().add(new THREE.Vector3(0, 1.4, 0)));
    for (let i = 0; i < 3; i++) { this.spawnStars(starPos); await delay(450); }
    await delay(700);
    await this.narrate('narr_small', 'Yes. Underwear. The dungeon, it seems, has a sense of humour. Try not to lose the potion before the first rat, hmm?', 6000);
    this.spawnStars(starPos);
    await delay(900);
    await this.narrate('narr_floor', 'Floor one of the Warren. The bonfire behind you is the last warm thing you\'ll see for a long, long time. Get up, Greg. We\'ve got fifty floors of regret to climb.', 6800);
    if (this.introSkipped) { this.finishIntro(); return; }

    this.finishIntro();
  }

  /** finish the intro: hand control to the player, in the dungeon, torch lit */
  private finishIntro() {
    this.introPlayed = true;
    this.introActive = false;
    this.introSkipped = false;
    this.clearCine();
    this.fadeTo(0);
    const hero = this.combat.living('party')[0];
    if (hero) {
      const hv = this.visuals.get(hero.id);
      if (hv) {
        hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 0; hv.rig.group.rotation.set(0, Math.PI, 0);
        hv.yaw = hv.targetYaw = Math.PI;
        if (!this.heroLight) this.attachHeroTorch(hv.rig);   // give him the torch now
      }
    }
    // reveal the bonfire checkpoint behind him as a respawn point
    this.bonfireLit = true; this.bonfirePos = { ...(this.structures?.checkpoint ?? { x: 5, z: 5 }) };
    this.iso.lerp = 7;
    this.busy = false;
    this.phase = 'explore';
    this.pushLog('Floor 1 — The Warlord\'s Warren. (B) jumps to the boss cutscene. Light the bonfire to set your respawn.', 'system');
    this.emitSnapshot();
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

  private async playBossCutscene() {
    if (!this.structures) return;
    const st = this.structures;
    this.busy = true;
    this.bossCineActive = true; this.cutsceneSkip = false;

    const boss = this.combat.units.find((u) => u.bossGroup && u.dropKey === 'golden');
    const v = boss ? this.visuals.get(boss.id) : null;
    const bathWp = this.unitWorld(st.bossBath);
    const bathTop = bathWp.clone().add(new THREE.Vector3(0, 0.55, 0));
    const headWp = bathWp.clone().add(new THREE.Vector3(0, 1.25, 0));           // his upper body / face
    const westWp = this.unitWorld({ x: st.bossBath.x - 3, z: st.bossBath.z });   // toward the party
    const rackApproach: GridPos = { x: st.bossBath.x + 1, z: st.bossBath.z };
    const rackWp = this.unitWorld({ x: st.bossBath.x + 2, z: st.bossBath.z });

    // remember the player's camera so we can hand it back after the show
    const savedDist = this.iso.desiredDist, savedYaw = this.iso.desiredYaw, savedPitch = this.iso.desiredPitch;
    this.iso.lerp = 2.1;   // slow, filmic easing for every camera move below

    // reset the boss to his seated, unarmed opening pose (also makes replays work)
    if (v && boss) {
      boss.pos = { ...st.bossBath };
      v.rig.group.position.copy(bathWp);
      v.rig.anim.mode = 'idle';
      v.rig.anim.crouch = 1.2;
      v.rig.anim.lunge = 0; v.rig.anim.flinch = 0;
      setWeapon(v.rig, null, boss.scheme.accent);
      if (this.rackClub) this.rackClub.visible = true;
      this.faceToward(v, westWp, true);
    }

    // ── BEAT 1: slow cinematic push-in onto the oblivious, bathing tyrant,
    //    then a slow pan across the chamber to set the scene ──
    this.iso.focus(headWp);
    this.iso.desiredDist = 7.5; this.iso.desiredPitch = 0.62; this.iso.desiredYaw = -Math.PI * 0.28;
    this.showCine('The Warlord\'s Warren — the innermost chamber…');
    this.audio.splash();
    await this.cineDelay(2200);
    this.clearCine();
    // slow orbit across the room (rise toward the ceiling, sweep the yaw, drift the target)
    this.iso.desiredPitch = 0.95; this.iso.desiredYaw = -Math.PI * 0.45; this.iso.desiredDist = 16;
    this.iso.focus(bathWp.clone().add(new THREE.Vector3(0, 1.5, 0)));
    await this.cineDelay(1500);
    this.iso.focus(bathWp.clone().add(new THREE.Vector3(5.5, 1.2, 0)));
    await this.cineDelay(1600);
    this.iso.focus(bathWp.clone().add(new THREE.Vector3(-5.0, 1.0, 2)));   // sweep toward the rack
    await this.cineDelay(1500);

    // ── BEAT 2: he soaks and sings a jaunty little bath-time tune ──
    this.iso.desiredDist = 6.5; this.iso.desiredPitch = 0.6; this.iso.desiredYaw = -Math.PI * 0.28;
    this.iso.focus(headWp);
    this.audio.sing();
    this.showCine('♪ Rub-a-dub-dub, a warlord in his tub… ♪');
    for (let i = 0; i < 6; i++) { if (v) v.rig.anim.lunge = 0.35; this.waterPlink(bathTop); await this.cineDelay(950); }   // gentle scrubbing
    this.audio.sing(0.8);
    this.showCine('♪ …scrubbin\' off the blood of the fools I clubbed~ ♪');
    for (let i = 0; i < 6; i++) { if (v) v.rig.anim.lunge = 0.35; this.waterPlink(bathTop); await this.cineDelay(950); }
    this.clearCine();

    // ── BEAT 3: he senses intruders — the singing dies, everything stills ──
    this.iso.desiredDist = 5.0; this.iso.desiredPitch = 0.54; this.iso.focus(headWp);
    await this.cineDelay(1500);                       // taut, silent close-up
    if (v) { v.rig.anim.flinch = 0.6; }
    this.iso.shake = Math.max(this.iso.shake, 0.12);
    await this.cineDelay(900);

    // ── BEAT 4: he BELLOWS — two-part outrage ──
    if (v) this.faceToward(v, westWp);
    this.audio.roar();
    if (v) v.rig.anim.flinch = 1;
    this.iso.shake = Math.max(this.iso.shake, 0.34);
    this.showCine('"WHO DARES DISTURB MY ROYAL BATH?!"');
    await this.cineDelay(2600);
    this.audio.roar(0.85);
    this.iso.shake = Math.max(this.iso.shake, 0.28);
    this.showCine('"MY ONE HOUR OF PEACE — RUINED!!"');
    await this.cineDelay(2400);
    this.clearCine();

    // ── BEAT 5: he ERUPTS from the water — rises to full height ──
    this.iso.desiredDist = 9.0; this.iso.desiredPitch = 0.82; this.iso.focus(bathTop);
    if (v) {
      this.animateTo(() => v.rig.anim.crouch, (val) => { v.rig.anim.crouch = val; }, 0, 0.9);
      const baseY = v.rig.group.userData.baseY as number;
      this.animateTo(() => v.rig.group.position.y, (val) => { v.rig.group.position.y = val; }, baseY + 0.8, 0.45);
      setTimeout(() => { if (v) this.animateTo(() => v.rig.group.position.y, (val) => { v.rig.group.position.y = val; }, baseY, 0.5); }, 460);
    }
    this.audio.splash();
    this.splashBurst(bathTop, 34);
    this.iso.shake = Math.max(this.iso.shake, 0.32);
    await this.cineDelay(1300);

    // ── BEAT 6: he wades to the rack for his greatclub ──
    if (v) {
      this.iso.focus(rackWp.clone().add(new THREE.Vector3(0, 0.9, 0)));
      await this.walkRigTo(v, rackApproach, 1.4);
      this.faceToward(v, rackWp, true);
      await this.cineDelay(450);
    }

    // ── BEAT 7: he SEIZES the club off the rack ──
    if (v && boss) {
      this.iso.desiredDist = 7.0; this.iso.desiredPitch = 0.62;
      v.rig.anim.lunge = 1;                       // reach out
      await this.cineDelay(360);
      if (this.rackClub) this.rackClub.visible = false;   // pluck it from the cradle
      setWeapon(v.rig, 'club', boss.scheme.accent);        // now armed
      this.audio.play('sword_hit', 0.6, 0.6);
      this.audio.bossSting();
      this.iso.shake = Math.max(this.iso.shake, 0.3);
      FX.impactDust(this.particles, rackWp.clone().setY((v.rig.group.userData.baseY as number) + 0.9), [0x5a3a1e, 0x2a1f1a]);
      await this.cineDelay(900);
    }

    // ── BEAT 8: he rounds on the party, hefts the club, and roars ──
    if (v) {
      this.iso.focus(bathTop); this.iso.desiredDist = 8.0; this.iso.desiredPitch = 0.7;
      await this.walkRigTo(v, st.bossBath, 1.1);   // stride back out front
      this.faceToward(v, westWp, true);
      v.rig.anim.lunge = 1;
    }
    this.audio.roar();
    this.audio.bossSting();
    this.iso.shake = Math.max(this.iso.shake, 0.45);
    if (boss) boss.pos = { ...st.bossBath };         // combat grid position
    this.showCine('"NONE LEAVE MY WARREN ALIVE!"');
    await this.cineDelay(2400);
    this.clearCine();

    // hand the camera back to the player, smoothly, then speed easing up again
    this.iso.desiredDist = savedDist; this.iso.desiredYaw = savedYaw; this.iso.desiredPitch = savedPitch;
    if (v) this.iso.focus(v.rig.group.position.clone());
    await this.cineDelay(700);
    this.iso.lerp = 7;

    // ── wake his honour-guard & begin the battle ──
    for (const u of this.combat.units) if (u.bossGroup) u.dormant = false;
    this.pushLog('👑 Warlord Gorruk heaves his greatclub from the rack — the fight begins!', 'system');
    this.bossCineActive = false; this.cutsceneSkip = false;
    this.busy = false;
    this.enqueue(this.combat.start());
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
    if (e.button === 2) { this.cancelTargeting(); return; }
    if (this.busy) return;
    this.ray.setFromCamera(this.pointer, this.iso.cam);
    const unitHit = this.ray.intersectObjects(this.unitProxies, false)[0];
    const propHit = this.ray.intersectObjects(this.props.pickboxes, false)[0];
    const groundHit = this.ray.intersectObjects(this.pickables, false)[0];
    const tile = groundHit ? this.world.worldToTile(groundHit.point.x, groundHit.point.z) : null;

    if (this.phase === 'explore') this.clickExplore(unitHit?.object.userData.unitId, tile, propHit?.object.userData.propId);
    else if (this.phase === 'combat') this.clickCombat(unitHit?.object.userData.unitId, tile, propHit?.object.userData.propId);
  };

  private onWheel = (e: WheelEvent) => { e.preventDefault(); this.iso.zoom(e.deltaY * 0.012); };
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === 'q') this.iso.rotate(1);
    if (k === 'e') this.iso.rotate(-1);
    if (k === 'i' && this.phase !== 'menu') { this.toggleInventory(); return; }
    if (k === 'k' && this.phase !== 'menu') { this.toggleSkillTree(); return; }
    if (k === 'c' && this.phase === 'explore' && !this.combat.inCombat) { this.toggleSneak(); return; }
    if (k === 't') { this.toggleTorch(); return; }
    if (k === 'b') { this.debugWarpToBoss(); return; }   // TODO(debug): remove — jumps to boss cutscene
    if (k === 'escape') {
      // skip an in-progress cutscene (intro or boss)
      if (this.busy && (this.introActive || this.bossCineActive)) { this.cutsceneSkip = true; this.introSkipped = true; return; }
      if (this.showInventory) { this.showInventory = false; this.emitSnapshot(); }
      else if (this.showSkillTree) { this.showSkillTree = false; this.emitSnapshot(); }
      else this.cancelTargeting();
      return;
    }
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      if (this.busy && (this.introActive || this.bossCineActive)) { this.cutsceneSkip = true; this.introSkipped = true; return; }
      this.endTurn();
    }
    if (k === 'f') { const a = this.combat?.active ?? this.byId(this.selectedId ?? ''); if (a) this.iso.focus(this.unitWorld(a.pos)); }
    if (/^[1-9]$/.test(k)) this.hotkeySkill(parseInt(k, 10) - 1);
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
      const groundHit = this.ray.intersectObjects(this.pickables, false)[0];
      const tile = groundHit ? this.world.worldToTile(groundHit.point.x, groundHit.point.z) : null;
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
      const groundHit = this.ray.intersectObjects(this.pickables, false)[0];
      const tile = groundHit ? this.world.worldToTile(groundHit.point.x, groundHit.point.z) : null;
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

    // bonfire interaction (starter-room checkpoint)
    const cp = this.structures?.checkpoint;
    if (this.bonfireGroup && !this.bonfireLit && cp && tile.x === cp.x && tile.z === cp.z) {
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

  // ══ HUD API (called from React) ════════════════════════════
  startGame() {
    void this.audio.init();
    if (!this.introPlayed) {
      this.phase = 'menu';     // gated while the intro plays
      this.busy = true;
      void this.playIntroCutscene();
      return;
    }
    this.phase = 'explore';
    this.selectedId = this.combat.living('party')[0]?.id ?? null;
    this.pushLog('You descend into the Warlord\'s Warren, torch in hand... (click to move, Q/E rotate, wheel zoom)', 'system');
    this.emitSnapshot();
  }

  selectSkill(skillId: string | null) {
    const active = this.combat.active;
    if (!active || active.team !== 'party' || this.busy) return;
    if (!skillId) { this.cancelTargeting(); return; }
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

  toggleMute() { const m = this.audio.toggleMute(); this.emitSnapshot(); return m; }

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

  lightBonfire() {
    if (!this.bonfireGroup || this.bonfireLit) return;
    this.bonfireLit = true;
    this.bonfireGroup.userData.lit = true;
    this.bonfirePos = this.structures?.checkpoint ? { ...this.structures.checkpoint } : { x: 10, z: 10 };
    // flame cubes
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
    // glow light (relative to bonfire group position)
    const light = new THREE.PointLight(0xff9540, 26, 16, 1.7);
    light.position.set(0, 0.7, 0);
    light.name = 'bf_light';
    this.bonfireGroup.add(light);
    this.pushLog('The bonfire roars to life. This place feels safer now...', 'system');
    this.audio.play('ui_click', 0.6);
    this.audio.play('bonfire_lit', 1.0); // placeholder: add lit_bonfire.wav to public/audio/
    this.bigMessage = 'Bonfire Lit!';
    this.emitSnapshot();
    setTimeout(() => { this.bigMessage = null; this.emitSnapshot(); }, 2500);
  }

  respawn() {
    if (!this.bonfireLit || !this.bonfirePos) return;
    this.phase = 'explore';
    for (const u of this.combat.living('party')) {
      u.hp = effMaxHp(u);
      u.pos = { ...this.bonfirePos };
      const v = this.visuals.get(u.id);
      if (v) { v.rig.group.position.copy(this.world.tileToWorld(this.bonfirePos.x, this.bonfirePos.z)); v.rig.anim.mode = 'idle'; }
    }
    this.combat.inCombat = false;
    this.selectedId = this.combat.living('party')[0]?.id ?? null;
    this.pushLog('The bonfire restores you. The Underdrek still awaits.', 'system');
    this.emitSnapshot();
  }

  // ══ inventory / equipment (called from React HUD) ═════════
  toggleInventory() {
    this.showInventory = !this.showInventory;
    this.audio.play('ui_click', 0.6);
    this.emitSnapshot();
  }

  /** equip an inventory item on a party member; the old item returns to the bag */
  equipItem(unitId: string, itemId: string) {
    const u = this.byId(unitId);
    const idx = this.inventory.findIndex((i) => i.id === itemId);
    if (!u || u.team !== 'party' || idx < 0) return;
    const item = this.inventory[idx];
    const slot = item.kind === 'weapon' ? 'weapon' : item.kind === 'armor' ? 'armor' : item.kind === 'trinket' ? 'trinket' : null;
    if (!slot) { this.setHoverInfoOnce('Consumables are used, not equipped.'); return; }
    this.inventory.splice(idx, 1);
    const old = u.equipment[slot];
    if (old) this.inventory.push(old);
    u.equipment[slot] = item;
    // reflect a newly-equipped weapon on the character's hand
    if (slot === 'weapon' && item.weaponKind) {
      u.weapon = item.weaponKind;
      const rig = this.visuals.get(u.id)?.rig;
      if (rig) setWeapon(rig, item.weaponKind, u.scheme.accent);
    }
    this.audio.play('ui_click', 0.7);
    this.pushLog(`${u.name} equips ${item.icon} ${item.name}.`, 'system');
    this.emitSnapshot();
  }

  unequipItem(unitId: string, slot: 'weapon' | 'armor' | 'trinket') {
    const u = this.byId(unitId);
    if (!u || u.team !== 'party') return;
    const item = u.equipment[slot];
    if (!item) return;
    u.equipment[slot] = undefined;
    this.inventory.push(item);
    // remove the weapon from the character's hand so it's no longer visible
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
      if (u.equippedSkills.length < 4 && !u.equippedSkills.includes(node.unlockSkill)) {
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
    if (!u || !u.knownSkills.includes(skillId) || u.equippedSkills.includes(skillId) || u.equippedSkills.length >= 4) return;
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
    if (this.phase !== 'combat') return;
    const a = this.combat.active;
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
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), mat);
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
    // keyboard pan
    const pan = dt * 9;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.iso.pan(0, pan);
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.iso.pan(0, -pan);
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.iso.pan(-pan, 0);
    if (this.keys.has('d') || this.keys.has('arrowright')) this.iso.pan(pan, 0);

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
        // in the dungeon, only reveal cones for foes near the party (avoids
        // lighting up every lurking monster in the maze at once)
        const nearParty = !this.structures || this.combat.living('party').some((p) => Combat.dist(p.pos, f.pos) <= 11);
        let cd = this.enemyCones.find((c) => c.unitId === f.id);
        if (!nearParty) { if (cd) cd.mesh.visible = false; continue; }
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
      if (!u || !u.alive || this.phase === 'menu') { if (v.bar.style.display !== 'none') v.bar.style.display = 'none'; continue; }
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
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
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
