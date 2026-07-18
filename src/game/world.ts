// ─────────────────────────────────────────────────────────────
// Voxel world: seeded heightmap terrain rendered as ONE InstancedMesh
// per material (top faces + exposed side skirts only). Props are
// merged into static geometry. The grid doubles as the tactical
// layer: heights[] feed pathfinding & line of movement.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { getTextures } from './textures';

export const WORLD_SIZE = 46;
export const TILE = 1;
const MAX_H = 3;

// tiny deterministic value-noise
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
  heights: number[][] = [];
  blocked: boolean[][] = [];
  topMat: string[][] = [];
  torches: Torch[] = [];
  water!: THREE.Mesh;
  private time = 0;

  /** Arena (combat clearing) rectangle in tile coords. */
  readonly arena = { x0: 28, z0: 6, x1: 42, z1: 20 };

  private seed: number;
  constructor(seed = 1337) {
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

    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        const n = vnoise(x * 0.09, z * 0.09, this.seed) * 0.7 + vnoise(x * 0.22, z * 0.22, this.seed + 9) * 0.3;
        let h = Math.floor(n * (MAX_H + 1.6));
        // river: winding band along x≈10 with sine wobble
        const riverX = 10 + Math.sin(z * 0.25) * 2.5;
        const dRiver = Math.abs(x - riverX);
        if (dRiver < 1.6) h = -1;             // water bed
        else if (dRiver < 2.6) h = Math.min(h, 0); // sandy bank
        // arena: flatten to a clearing
        if (x >= this.arena.x0 && x <= this.arena.x1 && z >= this.arena.z0 && z <= this.arena.z1) h = 1;
        // party start clearing
        if (x > 26 && x < 40 && z > 32 && z < 43) h = Math.max(0, Math.min(h, 1));
        h = Math.max(-1, Math.min(MAX_H, h));
        this.heights[x][z] = h;
        if (h < 0) { this.blocked[x][z] = true; this.topMat[x][z] = 'sand'; continue; }
        this.topMat[x][z] = dRiver < 2.6 ? 'sand' : 'grass';
        // scatter obstacles (not in arena/start/river)
        const inArena = x >= this.arena.x0 - 1 && x <= this.arena.x1 + 1 && z >= this.arena.z0 - 1 && z <= this.arena.z1 + 1;
        const inStart = x > 25 && x < 41 && z > 31 && z < 44;
        if (!inArena && !inStart && dRiver > 2.6) {
          const r = hash(x, z, this.seed + 77);
          if (r < 0.055) this.blocked[x][z] = true; // trees
          else if (r < 0.075) this.blocked[x][z] = true; // rocks
        }
      }
    }
  }

  private buildMeshes() {
    const S = WORLD_SIZE;
    const tex = getTextures().map;
    const geo = new THREE.BoxGeometry(TILE, TILE, TILE);

    // count instances per material
    interface Inst { x: number; y: number; z: number; tint: number; }
    const buckets: Record<string, Inst[]> = { grass: [], dirt: [], stone: [], sand: [] };
    const push = (m: string, x: number, y: number, z: number) => {
      const tint = 0.9 + hash(x * 3 + y, z * 3, this.seed + 5) * 0.2;
      (buckets[m] ?? buckets.stone).push({ x, y, z, tint });
    };

    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const h = this.heights[x][z];
      const wx = (x - S / 2 + 0.5) * TILE, wz = (z - S / 2 + 0.5) * TILE;
      if (h < 0) { // river bed: sand at -1
        push('sand', wx, -1, wz);
        continue;
      }
      const inArena = x >= this.arena.x0 && x <= this.arena.x1 && z >= this.arena.z0 && z <= this.arena.z1;
      const top = inArena ? 'stone' : this.topMat[x][z];
      push(top, wx, h, wz);
      // side skirts down to lowest neighbor
      let minN = h;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        const nh = this.inBounds(nx, nz) ? this.heights[nx][nz] : -1;
        minN = Math.min(minN, nh);
      }
      for (let y = h - 1; y > minN; y--) push(top === 'sand' ? 'sand' : 'dirt', wx, y, wz);
    }

    const mats: Record<string, THREE.Material> = {
      grass: new THREE.MeshLambertMaterial({ map: tex.grass_top }),
      dirt: new THREE.MeshLambertMaterial({ map: tex.dirt }),
      stone: new THREE.MeshLambertMaterial({ map: tex.stone }),
      sand: new THREE.MeshLambertMaterial({ map: tex.sand }),
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

    // water: one translucent plane, texture scrolled in update()
    const wgeo = new THREE.PlaneGeometry(S * TILE, S * TILE, 1, 1);
    const wmat = new THREE.MeshLambertMaterial({
      map: tex.water.clone(), transparent: true, opacity: 0.82, color: 0x9fd4ff,
    });
    wmat.map!.wrapS = wmat.map!.wrapT = THREE.RepeatWrapping;
    wmat.map!.repeat.set(8, 8);
    wmat.map!.needsUpdate = true;
    this.water = new THREE.Mesh(wgeo, wmat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.28;
    this.group.add(this.water);

    // underside base slab so cliffs don't float
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(S * TILE, 1, S * TILE),
      new THREE.MeshLambertMaterial({ map: tex.dirt, color: 0x777777 }),
    );
    base.position.y = -1.6;
    this.group.add(base);
  }

  private buildProps() {
    const S = WORLD_SIZE;
    const tex = getTextures().map;
    const trunkMat = new THREE.MeshLambertMaterial({ map: tex.wood });
    const leafMat = new THREE.MeshLambertMaterial({ map: tex.leaves });
    const stoneMat = new THREE.MeshLambertMaterial({ map: tex.stone });
    const brickMat = new THREE.MeshLambertMaterial({ map: tex.brick });

    const treeTrunks: THREE.Matrix4[] = [];
    const treeLeaves: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3(1, 1, 1);
    const e = new THREE.Euler();

    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      if (!this.blocked[x][z] || this.heights[x][z] < 0) continue;
      const wx = (x - S / 2 + 0.5) * TILE, wz = (z - S / 2 + 0.5) * TILE;
      const h = this.heights[x][z] + 0.5;
      const r = hash(x, z, this.seed + 77);
      if (r < 0.055) {
        // tree: trunk 2-3 high + 2 leaf blobs
        const th = 2 + Math.floor(hash(x, z, 1) * 2);
        for (let i = 0; i < th; i++) {
          m4.compose(new THREE.Vector3(wx, h + 0.5 + i, wz), q.identity(), sc.set(0.42, 1, 0.42));
          treeTrunks.push(m4.clone());
        }
        const ly = h + th + 0.4;
        m4.compose(new THREE.Vector3(wx, ly, wz), q.identity(), sc.set(2.1, 1.6, 2.1));
        treeLeaves.push(m4.clone());
        m4.compose(new THREE.Vector3(wx, ly + 1.05, wz), q.identity(), sc.set(1.3, 0.9, 1.3));
        treeLeaves.push(m4.clone());
      } else {
        // rock
        e.set(hash(x, z, 2) * 0.4, hash(x, z, 3) * Math.PI, hash(x, z, 4) * 0.4);
        m4.compose(new THREE.Vector3(wx, h + 0.18, wz), q.setFromEuler(e), sc.set(0.85, 0.55, 0.8));
        rocks.push(m4.clone());
      }
    }

    const cube = new THREE.BoxGeometry(1, 1, 1);
    const mkInst = (list: THREE.Matrix4[], mat: THREE.Material, shadow = true) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(cube, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadow; im.receiveShadow = true;
      this.group.add(im);
    };
    mkInst(treeTrunks, trunkMat);
    mkInst(treeLeaves, leafMat);
    mkInst(rocks, stoneMat);

    // ── ruins arena: broken pillars + low walls + torches ──
    const a = this.arena;
    const pillarSpots: [number, number, number][] = [
      [a.x0 + 1, a.z0 + 1, 3], [a.x1 - 1, a.z0 + 1, 2], [a.x0 + 1, a.z1 - 1, 2], [a.x1 - 1, a.z1 - 1, 3],
      [Math.floor((a.x0 + a.x1) / 2), a.z0 + 1, 2],
    ];
    const wallMat: THREE.Matrix4[] = [];
    for (const [px, pz, ph] of pillarSpots) {
      const h = this.heights[px][pz] + 0.5;
      const wx = (px - S / 2 + 0.5) * TILE, wz = (pz - S / 2 + 0.5) * TILE;
      for (let i = 0; i < ph; i++) {
        e.set(0, 0, (hash(px, pz + i, 8) - 0.5) * 0.08);
        m4.compose(new THREE.Vector3(wx, h + 0.5 + i, wz), q.setFromEuler(e), sc.set(0.9, 1, 0.9));
        wallMat.push(m4.clone());
      }
      // rubble cap
      m4.compose(new THREE.Vector3(wx, h + ph + 0.35, wz), q.setFromEuler(e.set(0.2, 0.5, 0.15)), sc.set(0.7, 0.4, 0.7));
      wallMat.push(m4.clone());
      this.blocked[px][pz] = true;
    }
    // broken wall along north edge
    for (let x = a.x0 + 3; x <= a.x1 - 3; x++) {
      if (hash(x, a.z0, 11) < 0.3) continue;
      const h = this.heights[x][a.z0] + 0.5;
      const wx = (x - S / 2 + 0.5) * TILE, wz = (a.z0 - S / 2 + 0.5) * TILE;
      m4.compose(new THREE.Vector3(wx, h + 0.35, wz), q.identity(), sc.set(1, 0.7, 0.6));
      wallMat.push(m4.clone());
      if (hash(x, a.z0, 12) < 0.4) {
        m4.compose(new THREE.Vector3(wx, h + 1.05, wz), q.identity(), sc.set(1, 0.65, 0.6));
        wallMat.push(m4.clone());
      }
      this.blocked[x][a.z0] = true;
    }
    mkInst(wallMat, brickMat);

    // torches at arena corners (flames emitted per-frame by engine)
    const torchSpots: [number, number][] = [
      [a.x0 + 2, a.z0 + 3], [a.x1 - 2, a.z0 + 3], [a.x0 + 2, a.z1 - 3], [a.x1 - 2, a.z1 - 3],
    ];
    const poleMat = new THREE.MeshLambertMaterial({ map: tex.wood, color: 0x886644 });
    for (const [tx, tz] of torchSpots) {
      const base = this.tileToWorld(tx, tz);
      const pole = new THREE.Mesh(cube, poleMat);
      pole.scale.set(0.18, 1.5, 0.18);
      pole.position.set(base.x, base.y + 0.75, base.z);
      pole.castShadow = true;
      this.group.add(pole);
      const light = new THREE.PointLight(0xff9540, 14, 9, 1.8);
      light.position.set(base.x, base.y + 1.75, base.z);
      this.group.add(light);
      this.torches.push({ pos: new THREE.Vector3(base.x, base.y + 1.62, base.z), light, base: 14 });
      this.blocked[tx][tz] = true;
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
