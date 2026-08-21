// ─────────────────────────────────────────────────────────────
//  Prop factory — turns shared voxel-model data (voxelModels.mjs)
//  into THREE meshes with glow lights, halos and particle FX.
//  Used by world.ts. Purely visual; no game-logic dependency.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PROP_BUILDERS, type PropModel, type Particles } from './voxelModels.mjs';

const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const tmpCol = new THREE.Color();

// ── shared radial glow sprite texture ──
let haloTex: THREE.Texture | null = null;
export function getHalo(): THREE.Texture {
  if (haloTex) return haloTex;
  const s = 64;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = s;
  const ctx = cvs.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  haloTex = new THREE.CanvasTexture(cvs);
  haloTex.minFilter = THREE.LinearFilter;
  haloTex.magFilter = THREE.LinearFilter;
  haloTex.generateMipmaps = false;
  // @ts-ignore - CanvasTexture colorSpace
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

// ── build a merged, vertex-coloured mesh from voxel data ──
function voxMesh(model: PropModel): THREE.Mesh {
  const C = model.cube;
  const geos: THREE.BufferGeometry[] = [];
  for (const vx of model.voxels) {
    const g = new THREE.BoxGeometry(C, C, C);
    g.translate(vx.x * C, vx.y * C, vx.z * C);
    const j = 0.92 + Math.random() * 0.12;
    tmpCol.setHex(vx.c).multiplyScalar(j);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  const m = new THREE.Mesh(merged, propMat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ── lightweight particle emitter (rising motes / flame licks) ──
class ParticleField {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private ttl: Float32Array;
  private spec: Particles;
  private base: THREE.Vector3;

  constructor(spec: Particles, baseY: number) {
    this.spec = spec;
    this.n = spec.count;
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n);
    this.ttl = new Float32Array(this.n);
    this.base = new THREE.Vector3(0, baseY, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const sizeMap: Record<string, number> = { flame: 0.14, smoke: 0.16, sparkle: 0.07, spore: 0.06 };
    const mat = new THREE.PointsMaterial({
      color: spec.color,
      size: sizeMap[spec.type] ?? 0.1,
      map: getHalo(),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: spec.type === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < this.n; i++) this.respawn(i, Math.random());
  }

  private respawn(i: number, life0 = 0) {
    const s = this.spec;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * s.spread;
    this.pos[i * 3] = this.base.x + Math.cos(a) * r;
    this.pos[i * 3 + 1] = this.base.y + (Math.random() - 0.5) * 0.05;
    this.pos[i * 3 + 2] = this.base.z + Math.sin(a) * r;
    const up = s.type === 'flame' ? 0.5 : s.type === 'smoke' ? 0.35 : 0.18;
    this.vel[i * 3] = (Math.random() - 0.5) * 0.06;
    this.vel[i * 3 + 1] = up * (0.6 + Math.random() * 0.8);
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.06;
    this.ttl[i] = 0.7 + Math.random() * 0.9;
    this.life[i] = life0 * this.ttl[i];
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.ttl[i]) { this.respawn(i); continue; }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

export interface BuiltProp {
  group: THREE.Group;
  update?: (t: number, dt: number) => void;
  isBonfire?: boolean;
  blocks?: boolean;
}

/**
 * Build a decorative prop at a world position.
 * @param groundTopY world Y of the tile's top surface
 */
export function createProp(kind: string, wx: number, groundTopY: number, wz: number, seed = 0.5): BuiltProp | null {
  const builder = PROP_BUILDERS[kind];
  if (!builder) return null;
  const model = builder(seed);
  const R = rngFromSeed(seed + kind.length);

  const group = new THREE.Group();
  const mesh = voxMesh(model);
  group.add(mesh);

  // placement
  const yaw = model.hang ? 0 : R() * Math.PI * 2;
  group.rotation.y = yaw;
  if (model.hang) {
    group.position.set(wx, groundTopY + 6, wz);   // hang from ceiling
  } else {
    // Voxel models use a centered cube origin. Lift by half the model's
    // lowest voxel so the lowest cube rests exactly on the terrain surface.
    const minVoxelY = model.voxels.reduce((min, v) => Math.min(min, v.y), Infinity);
    const baseOffset = Number.isFinite(minVoxelY) ? -minVoxelY * model.cube + model.cube * 0.5 : 0;
    group.position.set(wx, groundTopY + baseOffset, wz);
  }

  let light: THREE.PointLight | null = null;
  let halo: THREE.Sprite | null = null;
  let field: ParticleField | null = null;
  const flickerAmt = model.glow?.flicker ?? 0;

  if (model.glow) {
    const g = model.glow;
    light = new THREE.PointLight(g.color, g.intensity, g.dist, g.decay);
    light.position.set(0, g.y, 0);
    group.add(light);
    // additive halo
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getHalo(), color: g.color, transparent: true, opacity: 0.52,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      fog: false, alphaTest: 0.01,
    }));
    const hs = model.flame ? 1.1 : 0.9;
    spr.scale.setScalar(hs);
    spr.position.set(0, g.y, 0);
    group.add(spr);
    halo = spr;
  }

  if (model.particles) {
    field = new ParticleField(model.particles, model.particles.y);
    group.add(field.points);
  }

  const anim = model.anim;
  const baseInt = model.glow?.intensity ?? 0;
  let update: BuiltProp['update'] | undefined;
  if (light || field || anim) {
    const phase = R() * Math.PI * 2;
    update = (t, dt) => {
      if (field) field.update(dt);
      if (light) {
        if (flickerAmt) {
          light.intensity = baseInt + Math.sin(t * 11 + phase) * flickerAmt + Math.sin(t * 23 + phase) * flickerAmt * 0.5;
        } else if (anim === 'pulse') {
          light.intensity = baseInt * (0.75 + Math.sin(t * 2.2 + phase) * 0.25);
        }
      }
      if (halo) {
        if (anim === 'pulse') halo.material.opacity = 0.35 + Math.sin(t * 2.2 + phase) * 0.18;
        else if (flickerAmt) halo.material.opacity = 0.42 + Math.sin(t * 13 + phase) * 0.14;
      }
      if (anim === 'sway') mesh.rotation.z = Math.sin(t * 1.4 + phase) * 0.05;
    };
  }

  const built: BuiltProp = { group, update };
  if (model.bonfire) { group.userData.isBonfire = true; group.userData.lit = false; built.isBonfire = true; }
  built.blocks = !!model.blocks;
  return built;
}

// tiny local RNG so placement jitter is deterministic per seed
function rngFromSeed(seed: number): () => number {
  let a = (Math.floor(seed * 10000) * 0x9e3779b1) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
