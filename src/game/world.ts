// Voxel world: seeded heightmap terrain rendered as ONE InstancedMesh
// per material (top faces + exposed side skirts only). Props are placed
// from a LevelDef (if provided) � otherwise fall back to surface defaults.
import * as THREE from 'three';
import { getTextures } from './textures';
import type { LevelDef } from '../levels/levelTypes';

export const WORLD_SIZE = 46;
export const TILE = 1;
const MAX_H = 3;

// deterministic value-noise
function hash(x: number, z: number, seed: number): number {
  let h = seed + x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function smooth(t: number) { return t * t * (3 - 2 * t); }
function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed);
  const c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export interface Torch { pos: THREE.Vector3; light: THREE.PointLight; base: number; }

export class VoxelWorld {
  readonly group = new THREE.Group();
  readonly level: LevelDef | null;
  heights: number[][] = [];
  blocked: boolean[][] = [];
  topMat: string[][] = [];
  torches: Torch[] = [];
  water!: THREE.Mesh;
  private time = 0;

  /** Arena (combat clearing) rectangle in tile coords. */
  readonly arena = { x0: 28, z0: 6, x1: 42, z1: 20 };

  private seed: number;
  constructor(level: LevelDef | null = null, seed = 1337) {
    this.level = level;
    this.seed = seed;
    this.generate();
    this.buildMeshes();
    this.buildProps();
  }

  tileToWorld(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.set((x - WORLD_SIZE / 2 + 0.5) * TILE, this.heights[x][z], (z - WORLD_SIZE / 2 + 0.5) * TILE);
    return out;
  }
  worldToTile(wx: number, wz: number): { x: number; z: number } | null {
    const x = Math.floor(wx / TILE + WORLD_SIZE / 2);
    const z = Math.floor(wz / TILE + WORLD_SIZE / 2);
    if (x < 0 || z < 0 || x >= WORLD_SIZE || z >= WORLD_SIZE) return null;
    return { x, z };
  }
  inBounds(x: number, z: number) { return x >= 0 && z >= 0 && x < WORLD_SIZE && z < WORLD_SIZE; }
  isWalkable(x: number, z: number) { return this.inBounds(x, z) && !this.blocked[x][z]; }
  heightAt(x: number, z: number) { return this.inBounds(x, z) ? this.heights[x][z] : 0; }

  private generate() {
    const S = WORLD_SIZE;
    this.heights = Array.from({ length: S }, () => new Array(S).fill(0));
    this.blocked = Array.from({ length: S }, () => new Array(S).fill(false));
    this.topMat = Array.from({ length: S }, () => new Array(S).fill('grass'));

    // level override: outside arena = solid cave wall
    const L = this.level;
    const arena = L ? L.arena : this.arena;

    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        // outside arena = cave wall
        if (x < arena.x0 || x > arena.x1 || z < arena.z0 || z > arena.z1) {
          this.heights[x][z] = MAX_H;
          this.blocked[x][z] = true;
          this.topMat[x][z] = 'cave_wall';
          continue;
        }
        const n = vnoise(x * 0.09, z * 0.09, this.seed) * 0.7 + vnoise(x * 0.22, z * 0.22, this.seed + 9) * 0.3;
        let h = Math.floor(n * (MAX_H + 1.6));
        // river: winding band along x�10 with sine wobble
        const riverX = 10 + Math.sin(z * 0.25) * 2.5;
        const dRiver = Math.abs(x - riverX);
        if (dRiver < 1.6) h = -1;
        else if (dRiver < 2.6) h = Math.min(h, 0);
        // arena: flatten to a clearing
        if (x >= arena.x0 && x <= arena.x1 && z >= arena.z0 && z <= arena.z1) h = 1;
        // party start clearing
        if (L && L.spawn.party.length > 0) {
          for (const sp of L.spawn.party) {
            const d = Math.abs(x - sp.x) + Math.abs(z - sp.z);
            if (d < 5) h = Math.max(0, Math.min(h, 1));
          }
        }
        h = Math.max(-1, Math.min(MAX_H, h));
        this.heights[x][z] = h;
        if (h < 0) { this.blocked[x][z] = true; this.topMat[x][z] = 'sand'; continue; }
        this.topMat[x][z] = dRiver < 2.6 ? 'sand' : 'grass';
        // scatter obstacles
        const inArena = x >= arena.x0 - 1 && x <= arena.x1 + 1 && z >= arena.z0 - 1 && z <= arena.z1 + 1;
        const inStart = L && L.spawn.party.length > 0 && L.spawn.party.some((sp) => Math.abs(x - sp.x) + Math.abs(z - sp.z) < 6);
        if (!inArena && !inStart && dRiver > 2.6) {
          const r = hash(x, z, this.seed + 77);
          if (r < 0.055) this.blocked[x][z] = true;
          else if (r < 0.075) this.blocked[x][z] = true;
        }
      }
    }
  }

  private buildMeshes() {
    const S = WORLD_SIZE;
    const tex = getTextures().map;
    const geo = new THREE.BoxGeometry(TILE, TILE, TILE);
    const L = this.level;

    interface Inst { x: number; y: number; z: number; tint: number; }
    const buckets: Record<string, Inst[]> = { grass: [], dirt: [], stone: [], sand: [], cave_wall: [] };
    const push = (m: string, x: number, y: number, z: number) => {
      const tint = 0.9 + hash(x * 3 + y, z * 3, this.seed + 5) * 0.2;
      (buckets[m] ?? buckets.stone).push({ x, y, z, tint });
    };

    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const h = this.heights[x][z];
      const wx = (x - S / 2 + 0.5) * TILE, wz = (z - S / 2 + 0.5) * TILE;
      if (h < 0) { push('sand', wx, -1, wz); continue; }
      if (this.topMat[x][z] === 'cave_wall') { push('cave_wall', wx, h, wz); continue; }
      const inArena = x >= this.arena.x0 && x <= this.arena.x1 && z >= this.arena.z0 && z <= this.arena.z1;
      const top = inArena ? 'stone' : this.topMat[x][z];
      push(top, wx, h, wz);
      // side skirts
      let minN = h;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        const nh = this.inBounds(nx, nz) ? this.heights[nx][nz] : -1;
        minN = Math.min(minN, nh);
      }
      for (let y = h - 1; y > minN; y--) push(top === 'sand' ? 'sand' : 'dirt', wx, y, wz);
    }

    const matFor = (name: string) => {
      const gm = L ? L.groundMats : ['grass', 'grass', 'stone', 'sand'];
      const fm = L ? L.fillMats : ['dirt', 'dirt', 'stone', 'dirt'];
      if (name === 'cave_wall') return new THREE.MeshLambertMaterial({ map: tex.cave_stone ?? tex.stone });
      if (name === 'sand') return new THREE.MeshLambertMaterial({ map: tex[gm[3]] ?? tex.sand });
      if (name === 'grass') return new THREE.MeshLambertMaterial({ map: tex[gm[0]] ?? tex.grass });
      if (name === 'dirt') return new THREE.MeshLambertMaterial({ map: tex[fm[1]] ?? tex.dirt });
      return new THREE.MeshLambertMaterial({ map: tex[gm[2]] ?? tex.stone });
    };
    const mats: Record<string, THREE.Material> = {
      grass: matFor('grass'), dirt: matFor('dirt'), stone: matFor('stone'), sand: matFor('sand'),
      cave_wall: matFor('cave_wall'),
    };
    const c = new THREE.Color();
    for (const [name, list] of Object.entries(buckets)) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, mats[name], list.length);
      const m4 = new THREE.Matrix4();
      list.forEach((it, i) => {
        m4.makeTranslation(it.x, it.y, it.z);
        im.setMatrixAt(i, m4);
        c.setScalar(it.tint);
        im.setColorAt(i, c);
      });
      im.receiveShadow = true;
      im.castShadow = name !== 'sand';
      this.group.add(im);
    }

    // water / underground pool
    const wgeo = new THREE.PlaneGeometry(S * TILE, S * TILE, 1, 1);
    const waterMat = L
      ? new THREE.MeshLambertMaterial({ map: tex.dark_water ?? tex.water, transparent: true, opacity: 0.88, color: L.waterColor })
      : new THREE.MeshLambertMaterial({ map: tex.water.clone(), transparent: true, opacity: 0.82, color: 0x9fd4ff });
    waterMat.map!.wrapS = waterMat.map!.wrapT = THREE.RepeatWrapping;
    waterMat.map!.repeat.set(8, 8);
    waterMat.map!.needsUpdate = true;
    this.water = new THREE.Mesh(wgeo, waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = L ? L.waterY : -0.28;
    this.group.add(this.water);

    // base slab
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(S * TILE, 1, S * TILE),
      new THREE.MeshLambertMaterial({ map: tex.dirt, color: 0x777777 }),
    );
    base.position.y = -1.6;
    this.group.add(base);
  }

  private buildProps() {
    const S = WORLD_SIZE;
    const L = this.level;
    if (!L) return; // no level = default surface props (not needed for cave)

    // place props from level definition
    for (const p of L.props) {
      const wx = (p.x - S / 2 + 0.5) * TILE;
      const wz = (p.z - S / 2 + 0.5) * TILE;
      const h = this.heights[p.x][p.z] + 0.5;
      const seed = p.seed ?? 0.5;
      switch (p.kind) {
        case 'stalagmite': {
          const mat = new THREE.MeshLambertMaterial({ map: getTextures().map.stone });
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const m4 = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const sc = new THREE.Vector3();
          const e = new THREE.Euler();
          const g = new THREE.Group();
          g.position.set(wx, h, wz);
          const th = 2 + Math.floor(seed * 3);
          for (let i = 0; i < th; i++) {
            const w = 1.3 - (i / th) * 0.9;
            e.set(seed * 0.1, seed * 0.2, seed * 0.05);
            m4.compose(new THREE.Vector3((seed - 0.5) * 0.15, 0.5 + i, (seed - 0.5) * 0.15), q.setFromEuler(e), sc.set(w, 1, w));
            const im = new THREE.InstancedMesh(geo, mat, 1);
            im.setMatrixAt(0, m4);
            im.castShadow = true;
            g.add(im);
          }
          this.group.add(g);
          break;
        }
        case 'stalactite': {
          const mat = new THREE.MeshLambertMaterial({ map: getTextures().map.stone });
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const m4 = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const sc = new THREE.Vector3();
          const e = new THREE.Euler();
          const g = new THREE.Group();
          g.position.set(wx, h + 6, wz); // hang from ceiling
          const th = 2 + Math.floor(seed * 2);
          for (let i = 0; i < th; i++) {
            const w = 0.8 - (i / th) * 0.5;
            e.set(seed * 0.08, seed * 0.15, seed * 0.03);
            m4.compose(new THREE.Vector3((seed - 0.5) * 0.1, -0.5 - i, (seed - 0.5) * 0.1), q.setFromEuler(e), sc.set(w, 1, w));
            const im = new THREE.InstancedMesh(geo, mat, 1);
            im.setMatrixAt(0, m4);
            im.castShadow = true;
            g.add(im);
          }
          this.group.add(g);
          break;
        }
        case 'crystal': {
          const mat = new THREE.MeshLambertMaterial({ color: 0x7c5cbf, emissive: 0x2a0e4a, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 });
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const m4 = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const sc = new THREE.Vector3();
          const e = new THREE.Euler();
          const g = new THREE.Group();
          g.position.set(wx, h, wz);
          const th = 2 + Math.floor(seed * 2);
          for (let i = 0; i < th; i++) {
            const w = 0.6 - (i / th) * 0.35;
            e.set(seed * 0.15, seed * 0.3, seed * 0.08);
            m4.compose(new THREE.Vector3((seed - 0.5) * 0.1, 0.5 + i, (seed - 0.5) * 0.1), q.setFromEuler(e), sc.set(w, 1, w));
            const im = new THREE.InstancedMesh(geo, mat, 1);
            im.setMatrixAt(0, m4);
            im.castShadow = true;
            g.add(im);
          }
          const light = new THREE.PointLight(0x8a5cf0, 6, 7, 1.8);
          light.position.set(0, 1.2, 0);
          g.add(light);
          this.group.add(g);
          this.torches.push({ pos: new THREE.Vector3(wx, h + 1.5, wz), light, base: 6 });
          break;
        }
        case 'boulder': {
          const mat = new THREE.MeshLambertMaterial({ map: getTextures().map.stone });
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const m4 = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const sc = new THREE.Vector3();
          const e = new THREE.Euler(seed * 0.3, seed * 2.5, seed * 0.3);
          m4.compose(new THREE.Vector3(wx, h + 0.18, wz), q.setFromEuler(e), sc.set(0.85, 0.55, 0.8));
          const im = new THREE.InstancedMesh(geo, mat, 1);
          im.setMatrixAt(0, m4);
          im.castShadow = true;
          this.group.add(im);
          break;
        }
        case 'bones': {
          const mat = new THREE.MeshLambertMaterial({ color: 0xd8d2c0 });
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const m4 = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const sc = new THREE.Vector3();
          const e = new THREE.Euler();
          const g = new THREE.Group();
          g.position.set(wx, h, wz);
          for (let i = 0; i < 8; i++) {
            const bx = (seed - 0.5) * 0.5 + i * 0.08 - 0.3;
            const bz = (seed - 0.5) * 0.5 + (i % 3) * 0.12 - 0.2;
            e.set(seed * 2.5 + i * 0.4, seed * 3 + i * 0.3, seed * 0.3);
            m4.compose(new THREE.Vector3(bx, 0.06, bz), q.setFromEuler(e), sc.set(0.25, 0.12, 0.12));
            const im = new THREE.InstancedMesh(geo, mat, 1);
            im.setMatrixAt(0, m4);
            im.castShadow = true;
            g.add(im);
          }
          e.set(seed * 0.2, seed * 0.4, 0);
          m4.compose(new THREE.Vector3(0, 0.14, 0), q.setFromEuler(e), sc.set(0.32, 0.32, 0.32));
          const im = new THREE.InstancedMesh(geo, mat, 1);
          im.setMatrixAt(0, m4);
          im.castShadow = true;
          g.add(im);
          this.group.add(g);
          break;
        }
        case 'torch': {
          const poleMat = new THREE.MeshLambertMaterial({ map: getTextures().map.wood, color: 0x886644 });
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const m4 = new THREE.Matrix4();
          const g = new THREE.Group();
          g.position.set(wx, h, wz);
          m4.makeScale(0.18, 1.5, 0.18);
          m4.setPosition(0, 0.75, 0);
          const pole = new THREE.InstancedMesh(geo, poleMat, 1);
          pole.setMatrixAt(0, m4);
          pole.castShadow = true;
          g.add(pole);
          const flameMat = new THREE.MeshLambertMaterial({ color: 0xffb545, emissive: 0xff7a1f, emissiveIntensity: 0.8 });
          m4.makeScale(0.14, 0.2, 0.14);
          m4.setPosition(0.02, 1.6, 0.02);
          const flame = new THREE.InstancedMesh(geo, flameMat, 1);
          flame.setMatrixAt(0, m4);
          g.add(flame);
          const light = new THREE.PointLight(0xff9540, 14, 10, 1.7);
          light.position.set(0.02, 1.5, 0.02);
          g.add(light);
          this.group.add(g);
          this.torches.push({ pos: new THREE.Vector3(wx, h + 1.5, wz), light, base: 14 });
this.blocked[p.x][p.z] = true;
          break;
        }
        case 'bonfire': {
          const stoneMat = new THREE.MeshLambertMaterial({ map: getTextures().map.stone, color: 0x5a5560 });
          const woodMat = new THREE.MeshLambertMaterial({ map: getTextures().map.wood });
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const m4 = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const sc = new THREE.Vector3();
          const e = new THREE.Euler();
          const g = new THREE.Group();
          g.position.set(wx, h, wz);
          g.userData.isBonfire = true;
          g.userData.lit = false;
          this.group.add(g);
          // stone ring
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const sx = Math.cos(angle) * 0.55;
            const sz = Math.sin(angle) * 0.55;
            e.set(0, angle, 0);
            m4.compose(new THREE.Vector3(sx, 0.12, sz), q.setFromEuler(e), sc.set(0.3, 0.25, 0.18));
            const im = new THREE.InstancedMesh(geo, stoneMat, 1);
            im.setMatrixAt(0, m4);
            im.castShadow = true;
            g.add(im);
          }
          // wood pile (scattered chunks, not a pole)
          for (let i = 0; i < 5; i++) {
            const ax = (seed * 3 + i * 1.7) % 1 - 0.5;
            const az = (seed * 5 + i * 2.3) % 1 - 0.5;
            const ry = (seed * 7 + i) * Math.PI;
            const sx = 0.25 + Math.abs(Math.sin(i * 1.3)) * 0.2;
            const sz = 0.25 + Math.abs(Math.cos(i * 1.7)) * 0.2;
            e.set(0.1, ry, 0.05);
            m4.compose(new THREE.Vector3(ax * 0.25, 0.28, az * 0.25), q.setFromEuler(e), sc.set(sx, 0.10, sz));
            const im = new THREE.InstancedMesh(geo, woodMat, 1);
            im.setMatrixAt(0, m4);
            im.castShadow = true;
            g.add(im);
          }
          this.blocked[p.x][p.z] = true;
          break;
        }
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    const wmap = (this.water.material as THREE.MeshLambertMaterial).map;
    if (wmap) { wmap.offset.x = this.time * 0.02; wmap.offset.y = Math.sin(this.time * 0.4) * 0.02; }
    for (const t of this.torches) {
      t.light.intensity = t.base + Math.sin(this.time * 11 + t.pos.x) * 2.2 + Math.sin(this.time * 23) * 1.2;
    }
  }
}
