// Voxel world: seeded heightmap terrain. Dungeon levels (anything with
// a `layout` + full terrain pack) now render as TRUE 0.055-scale voxel
// geometry via voxelTerrain.ts — flat slabs for tile interiors, real
// stacked voxel cubes for every edge/wall/ramp/mezzanine lip, budgeted
// so a 50+ room level stays performant. Levels without a full pack
// (or the open-world heightmap mode) fall back to the original
// textured-InstancedMesh cave builder, unchanged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getTextures } from './textures';
import { createProp, type BuiltProp } from './props';
import type { LevelDef } from '../levels/levelTypes';
import { buildVoxelTerrain, DEFAULT_BUDGET, paletteLookup, type Grid } from './voxelTerrain';

// decorative props that also block their tile (preserve legacy behaviour)
const BLOCKING_PROPS = new Set(['torch', 'bonfire', 'brazier']);

// NOTE: bumped from 46 → 90 to fit ~50 rooms + a boss room comfortably.
// If you still use the open-world heightmap mode (level === null), its
// hardcoded `arena` rect and river placement were tuned for 46 and will
// need re-tuning for the bigger grid.
export const WORLD_SIZE = 120;
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
  private propUpdates: NonNullable<BuiltProp['update']>[] = [];

  // populated only when the level ships a full terrain pack (see
  // dungeonGen.ts's TerrainPack) — drives the new voxel renderer.
  floorMats: string[][] = [];
  wallMats: string[][] = [];
  wallH: number[][] = [];
  // river tiles — translucent water sheets + waterfall cascades render on these
  waterTiles: boolean[][] | null = null;

  /** Arena (combat clearing) rectangle in tile coords. */
  readonly arena = { x0: 28, z0: 6, x1: 42, z1: 20 };

  private seed: number;
  constructor(level: LevelDef | null = null, seed = 1337) {
    this.level = level;
    this.seed = seed;
    this.generate();
    this.buildMeshes();
    this.buildProps();
    this.buildCaveDetail();
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

    // ── Maze/dungeon layout mode ──────────────────────────────
    // A LevelDef may ship a pre-baked walkability grid (+ optionally a
    // full terrain pack: floorMats/wallMats/wallH — see dungeonGen.ts).
    // When present we ignore the arena/river/heightmap logic entirely.
    const layout = L?.layout;
    if (layout) {
      const hmap = layout.heights;
      for (let x = 0; x < S; x++) {
        for (let z = 0; z < S; z++) {
          const walk = !!(layout.walk[x] && layout.walk[x][z]);
          if (walk) {
            this.heights[x][z] = hmap ? (hmap[x]?.[z] ?? 1) : 1;
            this.blocked[x][z] = false;
            this.topMat[x][z] = 'stone';
          } else {
            this.heights[x][z] = MAX_H;
            this.blocked[x][z] = true;
            this.topMat[x][z] = 'cave_wall';
          }
        }
      }
      // full terrain pack present → the new voxel renderer takes over
      // in buildMeshes(); otherwise it falls back to the old textured path.
      if (layout.floorMats && layout.wallMats && layout.wallH) {
        this.floorMats = layout.floorMats;
        this.wallMats = layout.wallMats;
        this.wallH = layout.wallH;
        this.waterTiles = layout.water ?? null;
      } else {
        this.waterTiles = null;
      }
      return;
    }

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
        // river: winding band along x≈10 with sine wobble
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
    const L = this.level;

    if (this.floorMats.length && this.wallMats.length && this.wallH.length) {
      // ══ NEW: true voxel terrain (BG3-style), budgeted ══════════
      const walkGrid: Grid = this.blocked.map((row) => row.map((b) => !b));
      const { group: voxGroup, voxStep, stats } = buildVoxelTerrain(
        walkGrid, this.heights, this.wallH, this.floorMats, this.wallMats,
        {
          floorPalette: paletteLookup,
          wallPalette: paletteLookup,
          seed: this.seed,
          waterColor: L ? L.waterColor : 0x2a6f8f,
        },
        DEFAULT_BUDGET,
        this.waterTiles,
      );
      this.group.add(voxGroup);
      // eslint-disable-next-line no-console
      console.log(`[VoxelWorld] voxel terrain: ${stats.boxes.toLocaleString()} boxes / ~${stats.approxTris.toLocaleString()} tris @ step ${voxStep} (budget ${stats.budget.toLocaleString()})`);
    } else {
      // ══ FALLBACK: original textured-InstancedMesh cave builder ══
      const CAVE_VOX = 0.22;   // unified fine voxel (matches monster/player detail)
      const N = Math.round(TILE / CAVE_VOX);  // ~6 sub-voxels per tile side
      const geo = new THREE.BoxGeometry(CAVE_VOX, CAVE_VOX, CAVE_VOX);

      interface Inst { x: number; y: number; z: number; tint: number; }
      const buckets: Record<string, Inst[]> = { grass: [], dirt: [], stone: [], sand: [], cave_wall: [] };
      const push = (m: string, x: number, y: number, z: number) => {
        const tint = 0.9 + hash(x * 3 + y, z * 3, this.seed + 5) * 0.2;
        (buckets[m] ?? buckets.stone).push({ x, y, z, tint });
      };

      for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
        const h = this.heights[x][z];
        const tx = (x - S / 2 + 0.5) * TILE, tz = (z - S / 2 + 0.5) * TILE;
        const cx = tx - TILE / 2 + CAVE_VOX / 2;   // sub-grid origin (corner offset)
        const cz = tz - TILE / 2 + CAVE_VOX / 2;
        if (h < 0) { push('sand', tx, -1, tz); continue; }

        if (this.topMat[x][z] === 'cave_wall') {
          // rough carved-rock wall: every sub-column gets its own height from
          // smooth fine noise, so the surface is jagged (not a flat-topped block)
          // and neighbouring tiles differ — reads as hewn cavern stone.
          let exposed = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (this.inBounds(nx, nz) && this.heights[nx][nz] < MAX_H) { exposed = true; break; }
          }
          const HSCALE = 0.16 / CAVE_VOX;   // keep wall world-height constant after voxel shrink
          const thick = exposed ? 2 : 1;   // thicker solid at the visible faces, hollow inside
          const baseH = 6 + Math.floor(hash(x, z, this.seed + 99) * 5);   // 6..10 base height
          for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
            const edgeDist = Math.min(ix, iz, N - 1 - ix, N - 1 - iz);
            if (!exposed && edgeDist >= thick) continue;      // skip interior when sealed
            // smooth per-column height (sub-tile frequency) → rolling rocky top
            const n = vnoise(x + (ix - N / 2) * 0.55, z + (iz - N / 2) * 0.55, this.seed + 77);
            const amp = (edgeDist === 0 ? 5 : 2.5) * HSCALE;            // exposed faces get more relief
            const colH = Math.max(2, Math.min(Math.round(16 * HSCALE), Math.round(baseH * HSCALE + (n - 0.5) * amp * 2)));
            for (let iy = 0; iy < colH; iy++) {
              push('cave_wall', cx + ix * CAVE_VOX, iy * CAVE_VOX, cz + iz * CAVE_VOX);
            }
          }
          continue;
        }

        // walkable floor — flat layer of sub-voxels at the surface
        for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
          push('stone', cx + ix * CAVE_VOX, h, cz + iz * CAVE_VOX);
        }
      }

      for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
        if (this.topMat[x][z] === 'cave_wall') continue;
        const h = this.heights[x][z];
        const tx = (x - S / 2 + 0.5) * TILE, tz = (z - S / 2 + 0.5) * TILE;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (!this.inBounds(nx, nz)) continue;
          if (this.topMat[nx][nz] === 'cave_wall') continue;
          const nh = this.heights[nx][nz];
          if (nh <= h) continue;
          const stepH = Math.round((nh - h) / CAVE_VOX);
          const edgeX = tx + dx * TILE / 2;
          const edgeZ = tz + dz * TILE / 2;
          for (let iy = 0; iy < stepH; iy++) {
            push('stone', edgeX, h + iy * CAVE_VOX + CAVE_VOX / 2, edgeZ);
          }
        }
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
    if (!L) return;

    for (const p of L.props) {
      const wx = (p.x - S / 2 + 0.5) * TILE;
      const wz = (p.z - S / 2 + 0.5) * TILE;
      const groundTopY = this.heights[p.x][p.z] + 0.5;
      const built = createProp(p.kind, wx, groundTopY, wz, p.seed ?? 0.5);
      if (!built) continue;
      this.group.add(built.group);
      if (built.update) this.propUpdates.push(built.update);
      if (built.blocks || BLOCKING_PROPS.has(p.kind)) this.blocked[p.x][p.z] = true;
    }
  }

  /**
   * Fine surface detail for the cave, all merged into two meshes
   * (one draw call each) so it's essentially free: scattered pebbles
   * & moss on the floor, and glowing crystal veins in exposed walls.
   */
  private buildCaveDetail() {
    const S = WORLD_SIZE;
    const L = this.level;
    if (!L) return;
    const arena = L.arena;
    const col = new THREE.Color();
    const floorGeos: THREE.BufferGeometry[] = [];
    const veinGeos: THREE.BufferGeometry[] = [];

    const cube = (list: THREE.BufferGeometry[], size: number, x: number, y: number, z: number, hex: number, jit = 0.12) => {
      const g = new THREE.BoxGeometry(size, size, size);
      g.translate(x, y, z);
      col.setHex(hex).multiplyScalar(1 - jit / 2 + Math.random() * jit);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      list.push(g);
    };

    const PEBBLE = [0x5a5560, 0x6f6a78, 0x413d47, 0x4c4a52];
    const MOSSC = [0x3d5a24, 0x4d6a2e, 0x37501f];
    const VEIN = [0x49b6ff, 0x8a5cf0, 0x49ffa0, 0x3aa0e8];

    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const wx = (x - S / 2 + 0.5) * TILE, wz = (z - S / 2 + 0.5) * TILE;
      const wall = this.topMat[x][z] === 'cave_wall';
      if (!wall && this.heights[x][z] >= 0 && !this.blocked[x][z]) {
        // floor detail
        const surf = this.heights[x][z] + 0.5;
        const r = hash(x, z, this.seed + 131);
        if (r < 0.14) {
          const nP = 1 + Math.floor(hash(x, z, this.seed + 5) * 3);
          for (let i = 0; i < nP; i++) {
            const ox = (hash(x + i, z, this.seed + i * 7) - 0.5) * 0.7;
            const oz = (hash(x, z + i, this.seed + i * 11) - 0.5) * 0.7;
            const sz = 0.06 + hash(x + i, z + i, this.seed) * 0.06;
            cube(floorGeos, sz, wx + ox, surf + sz / 2, wz + oz, PEBBLE[(x + z + i) % PEBBLE.length]);
          }
        } else if (r > 0.9) {
          // moss patch near walls
          const nM = 2 + Math.floor(hash(x, z, this.seed + 9) * 3);
          for (let i = 0; i < nM; i++) {
            const ox = (hash(x + i, z, this.seed + 3) - 0.5) * 0.8;
            const oz = (hash(x, z + i, this.seed + 4) - 0.5) * 0.8;
            cube(floorGeos, 0.09, wx + ox, surf + 0.02, wz + oz, MOSSC[(x + i) % MOSSC.length]);
          }
        }
      } else if (wall) {
        // glowing vein on faces exposed to a walkable neighbour
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, nz = z + dz;
          if (!this.inBounds(nx, nz)) continue;
          if (this.topMat[nx][nz] === 'cave_wall' || this.heights[nx][nz] < 0) continue;
          if (!L.layout && (nx < arena.x0 || nx > arena.x1 || nz < arena.z0 || nz > arena.z1)) continue;
          const r = hash(x * 3 + dx, z * 3 + dz, this.seed + 211);
          if (r < 0.14) {
            const hue = VEIN[(x + z) % VEIN.length];
            const fx = wx + dx * 0.5, fz = wz + dz * 0.5;
            const n = 2 + Math.floor(r * 20) % 3;
            let vy = 0.5 + hash(x, z, this.seed + 17) * 1.4;
            for (let i = 0; i < n; i++) {
              const jx = dx !== 0 ? 0 : (hash(x + i, z, this.seed) - 0.5) * 0.5;
              const jz = dz !== 0 ? 0 : (hash(x, z + i, this.seed) - 0.5) * 0.5;
              cube(veinGeos, 0.08, fx + jx, vy, fz + jz, hue, 0.05);
              vy += 0.18 + hash(x + i, z + i, this.seed) * 0.14;
            }
          }
          break; // one face per wall tile
        }
      }
    }

    if (floorGeos.length) {
      const merged = mergeGeometries(floorGeos, false)!;
      floorGeos.forEach((g) => g.dispose());
      const m = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
      m.receiveShadow = true;
      this.group.add(m);
    }
    if (veinGeos.length) {
      const merged = mergeGeometries(veinGeos, false)!;
      veinGeos.forEach((g) => g.dispose());
      // MeshBasicMaterial ignores lighting → the veins glow in the dark
      const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true }));
      this.group.add(m);
    }
  }

  update(dt: number) {
    this.time += dt;
    const wmap = (this.water.material as THREE.MeshLambertMaterial).map;
    if (wmap) { wmap.offset.x = this.time * 0.02; wmap.offset.y = Math.sin(this.time * 0.4) * 0.02; }
    for (const t of this.torches) {
      t.light.intensity = t.base + Math.sin(this.time * 11 + t.pos.x) * 2.2 + Math.sin(this.time * 23) * 1.2;
    }
    for (const u of this.propUpdates) u(this.time, dt);
  }
}
