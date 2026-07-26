import * as THREE from 'three';
import { buildCharacter } from '@/game/characters';
import type { Rig } from '@/game/characters';
import type { CharacterScheme, WeaponKind } from '@/game/types';
import type { AnimClip, JointEuler } from './animationTypes';
import { JOINT_NAMES } from './animationTypes';
import { getPoseAtTime } from './animationUtils';

export type ChangeListener = () => void;

export class AnimationScene {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  rig: Rig | null = null;

  private _yaw = -Math.PI * 0.25;
  private _pitch = 0.55;
  private _dist = 4.2;
  private _target = new THREE.Vector3(0, 0.95, 0);
  private _keys = new Set<string>();
  private _disposed = false;
  private _raf = 0;
  private _clock = new THREE.Clock();
  private _onChange = new Set<ChangeListener>();
  private _ro: ResizeObserver;

  private _clip: AnimClip | null = null;
  private _playTime = 0;
  private _playing = false;
  private _speed = 1;

  constructor(host: HTMLDivElement) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14110d);
    scene.fog = new THREE.Fog(0x14110d, 9, 28);
    this.scene = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    const camera = new THREE.PerspectiveCamera(36, host.clientWidth / host.clientHeight, 0.1, 100);
    this.camera = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xfff2e0, 1.15);
    key.position.set(3, 6, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6688aa, 0.55);
    rim.position.set(-4, 3, -3);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshLambertMaterial({ color: 0x261f18 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if (['a', 'd', 'w', 's', 'q', 'e', 'r', 'f'].includes(k)) {
        if (down) this._keys.add(k); else this._keys.delete(k);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey(true));
    window.addEventListener('keyup', onKey(false));

    this._ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (w < 1 || h < 1) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    this._ro.observe(host);

    const tick = () => {
      if (this._disposed) return;
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(this._clock.getDelta(), 0.05);

      if (this._playing && this._clip) {
        this._playTime += dt * this._speed;
        this._applyKeyframePose();
        this._notifyChange();
      }

      if (this.rig) {
        const breathe = Math.sin(performance.now() * 0.0015) * 0.008;
        const torsoPivot = this.rig.parts.torso;
        if (torsoPivot && torsoPivot.children[0]) {
          (torsoPivot.children[0] as THREE.Mesh).scale.y = 1 + breathe;
        }
      }

      const orbit = 1.6 * dt, zoom = 4.0 * dt;
      if (this._keys.has('a')) { this._yaw += orbit; this._notifyChange(); }
      if (this._keys.has('d')) { this._yaw -= orbit; this._notifyChange(); }
      if (this._keys.has('w')) { this._pitch = THREE.MathUtils.clamp(this._pitch + orbit, 0.05, 1.45); this._notifyChange(); }
      if (this._keys.has('s')) { this._pitch = THREE.MathUtils.clamp(this._pitch - orbit, 0.05, 1.45); this._notifyChange(); }
      if (this._keys.has('q') || this._keys.has('r')) { this._dist = THREE.MathUtils.clamp(this._dist - zoom, 1.5, 12); this._notifyChange(); }
      if (this._keys.has('e') || this._keys.has('f')) { this._dist = THREE.MathUtils.clamp(this._dist + zoom, 1.5, 12); this._notifyChange(); }

      const p = camera.position;
      p.set(
        this._target.x + Math.sin(this._yaw) * Math.cos(this._pitch) * this._dist,
        this._target.y + Math.sin(this._pitch) * this._dist,
        this._target.z + Math.cos(this._yaw) * Math.cos(this._pitch) * this._dist,
      );
      camera.lookAt(this._target);
      renderer.render(scene, camera);
    };
    tick();
  }

  buildCharacter(scheme: CharacterScheme, weapon: WeaponKind | null): void {
    if (this.rig) {
      this.scene.remove(this.rig.group);
      this._disposeRig(this.rig);
    }
    const rig = buildCharacter(scheme, weapon ?? undefined);
    rig.group.rotation.y = Math.PI * 0.18;
    this.scene.add(rig.group);
    this.rig = rig;
    this._applyKeyframePose();
  }

  setClip(clip: AnimClip | null): void {
    this._clip = clip;
    this._playTime = 0;
    this._applyKeyframePose();
  }

  getClip(): AnimClip | null { return this._clip; }

  play(): void { this._playing = true; }
  pause(): void { this._playing = false; }
  stop(): void { this._playing = false; this._playTime = 0; this._applyKeyframePose(); }
  get isPlaying(): boolean { return this._playing; }
  get playTime(): number { return this._playTime; }
  set playTime(t: number) { this._playTime = t; this._applyKeyframePose(); }
  get speed(): number { return this._speed; }
  set speed(s: number) { this._speed = s; }

  get camYaw(): number { return this._yaw; }
  get camPitch(): number { return this._pitch; }
  get camDist(): number { return this._dist; }
  setCam(yaw: number, pitch: number, dist: number): void {
    this._yaw = yaw;
    this._pitch = THREE.MathUtils.clamp(pitch, 0.05, 1.45);
    this._dist = THREE.MathUtils.clamp(dist, 1.5, 12);
  }

  onTick(cb: ChangeListener): () => void { this._onChange.add(cb); return () => this._onChange.delete(cb); }

  // Joints that are children of the torso on hierarchical rigs. Their stored
  // rotation is local to the torso, but the editor contract is flat (world)
  // values — matching playClipOnRig and the pose presets. Convert on read/write.
  private static TORSO_CHILDREN = new Set(['head', 'hair', 'hood', 'hoodTip', 'armL', 'armR']);

  get jointValues(): Record<string, JointEuler> {
    if (!this.rig) return {};
    const hier = !!this.rig.group.userData.hierarchyBuilt;
    const torsoX = hier && this.rig.parts.torso ? this.rig.parts.torso.rotation.x : 0;
    const out: Record<string, JointEuler> = {};
    for (const n of JOINT_NAMES) {
      const o = this.rig.parts[n];
      if (!o) continue;
      // local → flat: add the torso pitch back for torso-children
      const x = hier && AnimationScene.TORSO_CHILDREN.has(n) ? o.rotation.x + torsoX : o.rotation.x;
      out[n] = { x, y: o.rotation.y, z: o.rotation.z };
    }
    return out;
  }

  setJointEuler(joint: string, euler: JointEuler): void {
    if (!this.rig) return;
    const o = this.rig.parts[joint];
    if (!o) return;
    const hier = !!this.rig.group.userData.hierarchyBuilt;
    // flat → local: subtract the torso pitch for torso-children
    const torsoX = hier && this.rig.parts.torso ? this.rig.parts.torso.rotation.x : 0;
    const x = hier && AnimationScene.TORSO_CHILDREN.has(joint) ? euler.x - torsoX : euler.x;
    o.rotation.set(x, euler.y, euler.z);
  }

  applyPose(joints: Record<string, JointEuler>): void {
    if (!this.rig) return;
    for (const [name, euler] of Object.entries(joints)) {
      const obj = this.rig.parts[name];
      if (obj) obj.rotation.set(euler.x, euler.y, euler.z);
    }
  }

  private _applyKeyframePose(): void {
    if (!this._clip || !this.rig) return;
    const pose = getPoseAtTime(this._clip, this._playTime);
    this.applyPose(pose);
  }

  private _notifyChange(): void {
    for (const cb of this._onChange) cb();
  }

  private _disposeRig(rig: Rig): void {
    rig.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  }

  dispose(): void {
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    if (this.rig) {
      this.scene.remove(this.rig.group);
      this._disposeRig(this.rig);
      this.rig = null;
    }
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentElement) el.parentElement.removeChild(el);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  }
}