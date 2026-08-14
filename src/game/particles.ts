// ─────────────────────────────────────────────────────────────
// Pooled voxel particle system: every particle is a tiny 3D CUBE
// (art direction: "everything is made of tiny cubes"). Two pools,
// one InstancedMesh each, CPU-simulated with per-instance matrix
// (position / uniform scale / spin) + per-instance color:
//   • glow  — MeshBasicMaterial + AdditiveBlending (black = gone,
//             fades by lerping color to black; keeps bloom popping)
//   • solid — MeshLambertMaterial + NormalBlending for chunky
//             debris / dust / blood / smoke (fades by shrinking)
// Emitters are data — add new presets in FX below.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

const MAX_GLOW = 6000;
const MAX_SOLID = 3000;
const EDGE = 0.145; // sprite-size → cube edge length (world units)

interface P {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number; endScale: number;
  r: number; g: number; b: number;
  gravity: number; drag: number;
  ax: number; ay: number; az: number; // spin axis (unit)
  spin: number;                       // rad/s
  angle: number;
}

export interface BurstOpts {
  pos: THREE.Vector3;
  count: number;
  color: number | number[];
  speed?: [number, number];     // min..max initial speed
  dir?: THREE.Vector3;          // base direction (default: sphere)
  spread?: number;              // 0..1 cone randomness
  gravity?: number;
  drag?: number;
  life?: [number, number];
  size?: [number, number];
  endScale?: number;            // shrink/grow multiplier by death
  up?: number;                  // extra upward bias
  solid?: boolean;              // route to the solid (lit) pool
}

function makePool(n: number): P[] {
  const pool: P[] = [];
  for (let i = 0; i < n; i++) {
    pool.push({
      alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 1, size: 1, endScale: 0,
      r: 1, g: 1, b: 1, gravity: 0, drag: 0,
      ax: 0, ay: 1, az: 0, spin: 0, angle: 0,
    });
  }
  return pool;
}

export class ParticleSystem {
  /** Object3D added to the scene — holds both instanced pools. */
  readonly points: THREE.Group;
  readonly glowMesh: THREE.InstancedMesh;
  readonly solidMesh: THREE.InstancedMesh;
  private glowPool = makePool(MAX_GLOW);
  private solidPool = makePool(MAX_SOLID);
  private tmpColor = new THREE.Color();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);

    const glowMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glowMesh = new THREE.InstancedMesh(geo, glowMat, MAX_GLOW);
    this.glowMesh.frustumCulled = false;
    this.glowMesh.renderOrder = 10;
    this.glowMesh.castShadow = this.glowMesh.receiveShadow = false;

    const solidMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.solidMesh = new THREE.InstancedMesh(geo, solidMat, MAX_SOLID);
    this.solidMesh.frustumCulled = false;
    this.solidMesh.castShadow = this.solidMesh.receiveShadow = false;

    // start every instance dead (zero scale) and black
    this.m4.makeScale(0, 0, 0);
    this.tmpColor.setRGB(0, 0, 0);
    for (let i = 0; i < MAX_GLOW; i++) { this.glowMesh.setMatrixAt(i, this.m4); this.glowMesh.setColorAt(i, this.tmpColor); }
    for (let i = 0; i < MAX_SOLID; i++) { this.solidMesh.setMatrixAt(i, this.m4); this.solidMesh.setColorAt(i, this.tmpColor); }
    this.glowMesh.instanceMatrix.needsUpdate = true;
    this.solidMesh.instanceMatrix.needsUpdate = true;

    this.points = new THREE.Group();
    this.points.add(this.glowMesh, this.solidMesh);
  }

  burst(o: BurstOpts) {
    const pool = o.solid ? this.solidPool : this.glowPool;
    const colors = Array.isArray(o.color) ? o.color : [o.color];
    const speed = o.speed ?? [1.5, 4];
    const life = o.life ?? [0.4, 0.9];
    const size = o.size ?? [0.5, 1.1];
    const spread = o.spread ?? 1;
    let emitted = 0;
    for (const p of pool) {
      if (emitted >= o.count) break;
      if (p.alive) continue;
      emitted++;
      p.alive = true;
      p.x = o.pos.x; p.y = o.pos.y; p.z = o.pos.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      let dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th);
      if (o.dir) {
        dx = o.dir.x + dx * spread; dy = o.dir.y + dy * spread; dz = o.dir.z + dz * spread;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
      }
      const sp = speed[0] + Math.random() * (speed[1] - speed[0]);
      p.vx = dx * sp; p.vy = dy * sp + (o.up ?? 0); p.vz = dz * sp;
      p.maxLife = life[0] + Math.random() * (life[1] - life[0]);
      p.life = p.maxLife;
      p.size = size[0] + Math.random() * (size[1] - size[0]);
      p.endScale = o.endScale ?? 0.1;
      this.tmpColor.setHex(colors[Math.floor(Math.random() * colors.length)]);
      p.r = this.tmpColor.r; p.g = this.tmpColor.g; p.b = this.tmpColor.b;
      p.gravity = o.gravity ?? 3.5;
      p.drag = o.drag ?? 1.2;
      // gentle tumble around a random axis
      this.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      p.ax = this.axis.x; p.ay = this.axis.y; p.az = this.axis.z;
      p.spin = (2 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1);
      p.angle = Math.random() * Math.PI * 2;
    }
  }

  private updatePool(pool: P[], mesh: THREE.InstancedMesh, dt: number, fadeToBlack: boolean) {
    let i = 0;
    for (const p of pool) {
      if (p.alive) {
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
        else {
          const d = Math.max(0, 1 - p.drag * dt);
          p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.gravity * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.angle += p.spin * dt;
          const t = p.life / p.maxLife;
          const s = p.size * EDGE * (p.endScale + (1 - p.endScale) * t);
          this.axis.set(p.ax, p.ay, p.az);
          this.q.setFromAxisAngle(this.axis, p.angle);
          this.m4.compose(this.pos.set(p.x, p.y, p.z), this.q, this.scl.set(s, s, s));
          mesh.setMatrixAt(i, this.m4);
          const fade = fadeToBlack ? Math.min(1, t * 2.5) : 1;
          this.tmpColor.setRGB(p.r * fade, p.g * fade, p.b * fade);
          mesh.setColorAt(i, this.tmpColor);
        }
      }
      if (!p.alive) { this.m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, this.m4); }
      i++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    this.updatePool(this.glowPool, this.glowMesh, dt, true);
    this.updatePool(this.solidPool, this.solidMesh, dt, false);
  }

  dispose() {
    this.glowMesh.geometry.dispose();
    (this.glowMesh.material as THREE.Material).dispose();
    (this.solidMesh.material as THREE.Material).dispose();
  }
}

// ── FX presets (data-driven: add your own here) ──────────────
// ── shared scratch state for the per-frame ambient emitter ──
// (module scope so FX.ambient never allocates inside the render loop)
const _amb = new THREE.Vector3();
/** 8 pre-baked outward XZ directions — the crit shockwave ring (no allocation) */
const RING_DIRS: THREE.Vector3[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a), 0.06, Math.sin(a));
});
const WHITE = new THREE.Color(0xffffff);
const _mix = new THREE.Color();
/** pale companion tint for a mote colour — called on emit only, no per-frame cost */
function mixToWhite(hex: number): number {
  _mix.setHex(hex).lerp(WHITE, 0.55);
  return _mix.getHex();
}

export const FX = {
  explosion(ps: ParticleSystem, p: THREE.Vector3, radius = 2) {
    ps.burst({ pos: p, count: 90, color: [0xffd76b, 0xff9a3d, 0xff5a1f, 0xfff3c4], speed: [2, 7 * radius * 0.6], life: [0.4, 1.1], size: [0.9, 2.2], gravity: 2, up: 2.5, endScale: 0.25 });
    // grey voxel smoke chunks — solid so they read as debris, not glow
    ps.burst({ pos: p, count: 40, color: [0x3a3a3a, 0x555555], speed: [1, 3], life: [0.8, 1.6], size: [1.2, 2.6], gravity: -0.6, up: 2, endScale: 1.6, solid: true });
  },
  heal(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 42, color: [0x9dffa8, 0xd6ffd9, 0x5ee87a], speed: [0.4, 1.2], life: [0.8, 1.6], size: [0.4, 0.9], gravity: -2.2, drag: 0.6, endScale: 0.3 });
  },
  slash(ps: ParticleSystem, p: THREE.Vector3, color = 0xffe08a) {
    ps.burst({ pos: p, count: 26, color: [color, 0xffffff], speed: [2, 5], life: [0.15, 0.4], size: [0.35, 0.8], gravity: 5, endScale: 0.2 });
  },
  blood(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 22, color: [0xc0272d, 0x8c1c20], speed: [1.5, 4], life: [0.3, 0.7], size: [0.35, 0.75], gravity: 9, endScale: 0.4, solid: true });
  },
  arcane(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 34, color: [0xc084fc, 0x8b5cf6, 0xe9d5ff], speed: [1, 3.4], life: [0.3, 0.8], size: [0.4, 1], gravity: 1, endScale: 0.2 });
  },
  /**
   * Polymorph spell — the wizard's signature big-bang: a purple-pink
   * sparkle burst with golden accent particles and a high density so
   * it reads as a TRANSFORMATION rather than an explosion. Reusable for
   * any future polymorph / shapeshift spell effect (e.g. boss chambers).
   */
  polymorph(ps: ParticleSystem, p: THREE.Vector3) {
    // main purple-pink burst — fast-moving, short-lived, lots of sparks
    ps.burst({ pos: p, count: 60, color: [0xc084fc, 0xe879f9, 0xf0abfc, 0xfdf4ff], speed: [2, 5], life: [0.4, 1.0], size: [0.5, 1.3], gravity: -0.5, up: 1.2, endScale: 0.15 });
    // golden transformation motes — slower, longer-lived, drift upward
    ps.burst({ pos: p, count: 20, color: [0xfde047, 0xfacc15, 0xffffff], speed: [0.5, 1.6], life: [0.6, 1.4], size: [0.3, 0.8], gravity: -2.2, drag: 0.4, endScale: 0.2 });
    // a few chunky solid flecks — reads as physical transformation debris
    ps.burst({ pos: p, count: 6, color: [0x4a3a8c, 0x6b5cf0], speed: [0.8, 2.4], life: [0.3, 0.7], size: [0.4, 0.9], gravity: 6, endScale: 0.4, solid: true });
  },
  ice(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 60, color: [0xbae6fd, 0x7dd3fc, 0xe0f2fe], speed: [2, 5.5], life: [0.4, 0.9], size: [0.5, 1.2], gravity: 4, endScale: 0.3 });
  },
  holy(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 40, color: [0xfde68a, 0xfbbf24, 0xfffbeb], speed: [1, 3], life: [0.5, 1], size: [0.5, 1.1], gravity: -0.8, endScale: 0.25 });
  },
  buff(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 30, color: [0x93c5fd, 0xbfdbfe], speed: [0.5, 1.4], life: [0.8, 1.4], size: [0.4, 0.8], gravity: -1.6, endScale: 0.4 });
  },
  dust(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 4, color: [0xb7a98c, 0x9c8f74], speed: [0.3, 0.9], life: [0.25, 0.55], size: [0.35, 0.7], gravity: -0.4, endScale: 1.4, solid: true });
  },
  flame(ps: ParticleSystem, p: THREE.Vector3) { // continuous torch flame — call every frame
    ps.burst({ pos: p, count: 2, color: [0xffb545, 0xff7a1f, 0xffe08a], speed: [0.1, 0.5], life: [0.3, 0.7], size: [0.35, 0.7], gravity: -1.8, drag: 0.4, endScale: 0.15 });
  },
  trail(ps: ParticleSystem, p: THREE.Vector3, color: number) {
    ps.burst({ pos: p, count: 3, color: [color, 0xffffff], speed: [0.05, 0.3], life: [0.25, 0.5], size: [0.35, 0.7], gravity: 0, endScale: 0.2 });
  },
  levelup(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 70, color: [0xfde047, 0xfacc15, 0xffffff], speed: [1, 3], life: [0.8, 1.6], size: [0.4, 0.9], gravity: -2.5, endScale: 0.3 });
  },
  /** solid voxel shrapnel in the given palette — for destructible props */
  debris(ps: ParticleSystem, p: THREE.Vector3, colors: number[], count = 24) {
    ps.burst({ pos: p, count, color: colors, speed: [1.5, 4.5], life: [0.5, 1.1], size: [0.5, 1.1], gravity: 12, drag: 0.5, up: 3.2, endScale: 0.75, solid: true });
    ps.burst({ pos: p, count: 6, color: [0x9c8f74, 0xb7a98c], speed: [0.4, 1.2], life: [0.4, 0.8], size: [0.6, 1.2], gravity: -0.5, up: 1, endScale: 1.5, solid: true });
  },
  /**
   * CRIT — the money shot: a gold-white star burst plus a flat shockwave
   * ring that races outward along the ground. ~24 particles total so it can
   * fire on every crit without touching the frame budget.
   */
  critBurst(ps: ParticleSystem, p: THREE.Vector3) {
    // 16 hot spikes: white core → gold → amber, fast out, very short life
    ps.burst({ pos: p, count: 16, color: [0xffffff, 0xffe9a8, 0xffc233, 0xff9c1f], speed: [4.5, 9], life: [0.18, 0.42], size: [0.6, 1.5], gravity: 1.2, drag: 2.4, up: 0.8, endScale: 0.1 });
    // 8-cube shockwave ring: one cube per pre-baked XZ direction, flat and
    // gravity-free so it reads as a wave racing out along the ground
    for (const d of RING_DIRS) {
      ps.burst({ pos: p, count: 1, color: [0xfff3c4, 0xffd76b], dir: d, spread: 0.12, speed: [6, 8], life: [0.16, 0.26], size: [1.1, 1.8], gravity: 0, drag: 3.2, endScale: 0.05 });
    }
  },
  /**
   * BUBBLES — gentle pink-white rise, for Gribnab's bath chamber (r25).
   * Negative gravity + heavy drag = slow lazy float; call sparsely.
   */
  bubbles(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 5, color: [0xffe4f2, 0xffc0dc, 0xffffff], speed: [0.1, 0.5], life: [1.1, 2.2], size: [0.5, 1.2], gravity: -1.3, drag: 1.6, endScale: 1.15 });
  },
  /**
   * MOTES — slow drifting dust / spore specks in any tint. Ambient filler:
   * tiny count, long life, almost no motion, so a few dozen alive at once
   * still cost nothing.
   */
  motes(ps: ParticleSystem, p: THREE.Vector3, color: number) {
    ps.burst({ pos: p, count: 3, color: [color, mixToWhite(color)], speed: [0.05, 0.35], life: [1.6, 3.2], size: [0.25, 0.6], gravity: -0.12, drag: 0.9, endScale: 0.6 });
  },
  /**
   * AMBIENT — called ONCE PER FRAME by the engine with the hero's position.
   * A cheap probabilistic emitter: most frames it does nothing, occasionally
   * it seeds dust motes near the hero or a ceiling drip streak just off to
   * the side. Reuses the existing burst pools, allocates nothing per frame
   * (one module-scope scratch Vector3) and scales by `dt`, so the rate is
   * frame-rate independent.
   */
  ambient(ps: ParticleSystem, center: THREE.Vector3, dt: number) {
    // ~1.6 mote puffs/sec: sewer air always has something floating in it
    if (Math.random() < dt * 1.6) {
      _amb.set(
        center.x + (Math.random() - 0.5) * 7,
        center.y + 0.6 + Math.random() * 2.4,
        center.z + (Math.random() - 0.5) * 7,
      );
      FX.motes(ps, _amb, Math.random() < 0.25 ? 0x9fd8c8 : 0x8a8574);
    }
    // ~0.5 drips/sec: a short cold streak falling out of the ceiling
    if (Math.random() < dt * 0.5) {
      _amb.set(
        center.x + (Math.random() - 0.5) * 9,
        center.y + 3.4 + Math.random() * 1.6,
        center.z + (Math.random() - 0.5) * 9,
      );
      ps.burst({ pos: _amb, count: 2, color: [0x9fd8e4, 0xd8f2f0], speed: [0.02, 0.14], life: [0.5, 0.9], size: [0.3, 0.55], gravity: 9, drag: 0, endScale: 0.5 });
    }
  },
  impactDust(ps: ParticleSystem, p: THREE.Vector3, flecks: number[] = []) {
    ps.burst({ pos: p, count: 22, color: [0x6b5a44, 0x8a7659, 0x9c8f74, 0x5a4d3a], speed: [0.7, 2.6], life: [0.5, 1.2], size: [0.7, 1.6], gravity: -0.6, up: 0.5, drag: 0.6, endScale: 2.1, solid: true });
    if (flecks.length) ps.burst({ pos: p, count: 8, color: flecks, speed: [1, 3], life: [0.4, 0.9], size: [0.4, 0.9], gravity: 9, up: 1.4, drag: 0.4, endScale: 0.5, solid: true });
  },
  waterSplash(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 14, color: [0x7ec8c0, 0xc8f0ea, 0x2e8a80], speed: [0.8, 2.4], life: [0.25, 0.55], size: [0.3, 0.7], gravity: 8, up: 2.2, drag: 0.4, endScale: 0.2 });
  },
  scareFlash(ps: ParticleSystem, p: THREE.Vector3) {
    ps.burst({ pos: p, count: 28, color: [0xffffff, 0xd8e8ff, 0x8aa0c8], speed: [3, 8], life: [0.12, 0.28], size: [0.5, 1.4], gravity: 0, drag: 2.8, up: 0.4, endScale: 0.05 });
  },
};
