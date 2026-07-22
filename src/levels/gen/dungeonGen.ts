// ─────────────────────────────────────────────────────────────
// DUNGEON GENERATION ENGINE — configurable, reusable, seeded.
//
// Three layers, each usable on its own:
//
//   1. Carver          — organic cave/maze carving primitives
//                        (disc, blobRoom, tunnel, line, sealRoom,
//                        roughen, fill, connectivity) over a bool grid.
//   2. buildTerrain    — turns a walkability grid into a full terrain
//                        pack: terraced floor heights (±step adjacency,
//                        guaranteed walkable), carved stairs, tall
//                        per-tile wall heights and per-tile floor/wall
//                        material assignment from palettes + zones.
//   3. generateDungeon — full-auto pipeline (auto rooms + links +
//                        spurs + terrain, optional sealed final/boss
//                        room + multi-room mezzanine plateaus) for
//                        quick/expansion levels.
//
// Authored levels (like The Warlord's Warren) drive Carver by hand
// and then call buildTerrain with their own palettes/zones, so every
// level can look entirely different while sharing the one engine.
//
// Everything is deterministic: same seed ⇒ same dungeon, so logic,
// spawns and rendering always agree.
// ─────────────────────────────────────────────────────────────
import type { Rect } from '../levelTypes';
import type { GridPos } from '../../game/types';

export type Grid = boolean[][];

// ── deterministic PRNG ───────────────────────────────────────
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── deterministic value noise (for terrain & material patches) ──
function hash2(x: number, z: number, seed: number): number {
  let h = seed + x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
const sm = (t: number) => t * t * (3 - 2 * t);
export function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  const u = sm(xf), v = sm(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** fractal brownian motion — richer low-frequency shapes */
export function fbm(x: number, z: number, seed: number, oct = 3): number {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += vnoise(x * f, z * f, seed + i * 101) * amp;
    norm += amp; amp *= 0.5; f *= 2.1;
  }
  return sum / norm;
}

// ═════════════════════════════════════════════════════════════
// 1. CARVER — organic cave carving over a boolean grid
// ═════════════════════════════════════════════════════════════
export class Carver {
  readonly size: number;
  readonly walk: Grid;
  readonly rng: () => number;

  constructor(seed: number, size: number) {
    this.size = size;
    this.rng = mulberry32(seed);
    this.walk = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  set(x: number, z: number, v = true) {
    const S = this.size;
    if (x >= 1 && z >= 1 && x < S - 1 && z < S - 1) this.walk[x][z] = v;
  }
  on(x: number, z: number) {
    const S = this.size;
    return x >= 0 && z >= 0 && x < S && z < S && this.walk[x][z];
  }
  clone(): Grid { return this.walk.map((c) => c.slice()); }

  /** filled disc with a wobbling radius — the base cave stamp */
  disc(cx: number, cz: number, r: number) {
    const R = Math.max(0.6, r);
    const x0 = Math.floor(cx - R - 1), x1 = Math.ceil(cx + R + 1);
    const z0 = Math.floor(cz - R - 1), z1 = Math.ceil(cz + R + 1);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d <= R + (this.rng() - 0.5) * 0.7) this.set(x, z, true);
    }
  }

  /** irregular blob room — smooth low-frequency boundary, every chamber unique */
  blobRoom(r: Rect, opts: { clampRect?: boolean; rough?: number } = {}) {
    const rng = this.rng;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const rx = (r.x1 - r.x0) / 2 + 0.7, rz = (r.z1 - r.z0) / 2 + 0.7;
    const h1 = rng() * 6.28, h2 = rng() * 6.28, h3 = rng() * 6.28;
    const rough = opts.rough ?? 1;
    const a1 = (0.10 + rng() * 0.12) * rough, a2 = (0.07 + rng() * 0.10) * rough, a3 = (0.05 + rng() * 0.08) * rough;
    const pad = 2;
    for (let x = Math.floor(cx - rx - pad); x <= Math.ceil(cx + rx + pad); x++) {
      for (let z = Math.floor(cz - rz - pad); z <= Math.ceil(cz + rz + pad); z++) {
        if (opts.clampRect && (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1)) continue;
        const nx = (x - cx) / rx, nz = (z - cz) / rz;
        const d = Math.hypot(nx, nz);
        const th = Math.atan2(nz, nx);
        const edge = 1 + a1 * Math.sin(th + h1) + a2 * Math.sin(2 * th + h2) + a3 * Math.sin(3 * th + h3);
        if (d <= edge) this.set(x, z, true);
      }
    }
  }

  /** winding tunnel: drunk-walk a→b with a wobbling bore */
  tunnel(a: GridPos, b: GridPos, bore = 1) {
    const rng = this.rng;
    const S = this.size;
    const clamp = (v: number) => (v < 2 ? 2 : v > S - 3 ? S - 3 : v);
    let x = a.x, z = a.z, guard = 0;
    while ((x !== b.x || z !== b.z) && guard++ < 800) {
      this.disc(x, z, bore + (rng() < 0.22 ? 0.8 : 0) - (rng() < 0.18 ? 0.5 : 0));
      const dx = Math.sign(b.x - x), dz = Math.sign(b.z - z), r = rng();
      if (x === b.x) z += dz;
      else if (z === b.z) x += dx;
      else if (r < 0.40) x += dx;
      else if (r < 0.80) z += dz;
      else { if (rng() < 0.5) x += rng() < 0.5 ? 1 : -1; else z += rng() < 0.5 ? 1 : -1; }
      x = clamp(x); z = clamp(z);
    }
    this.disc(b.x, b.z, bore);
  }

  /** straight L-tunnel — connectivity fallback / sealed-room connectors */
  line(x0: number, z0: number, x1: number, z1: number) {
    let x = x0, z = z0; this.set(x, z, true);
    while (x !== x1) { x += Math.sign(x1 - x); this.set(x, z, true); }
    while (z !== z1) { z += Math.sign(z1 - z); this.set(x, z, true); }
  }

  /** nibble walls outward with probability `prob` → cave roughness */
  roughen(prob: number) {
    const rng = this.rng;
    const snap = this.clone();
    const S = this.size;
    for (let x = 2; x < S - 2; x++) for (let z = 2; z < S - 2; z++) {
      if (!snap[x][z]) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (rng() < prob) this.set(x + dx, z + dz, true);
    }
  }

  /** fill isolated single-tile holes so caves read solid, keep dead-ends */
  fillPinholes() {
    const snap = this.clone();
    const S = this.size;
    for (let x = 2; x < S - 2; x++) for (let z = 2; z < S - 2; z++) {
      if (snap[x][z]) continue;
      let n = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (snap[x + dx]?.[z + dz]) n++;
      if (n >= 4) this.set(x, z, true);
    }
  }

  /** seal a room to a single entrance: wall the ring, punch the door + connector */
  sealRoom(r: Rect, door: GridPos, connectTo: GridPos, extraOpen: GridPos[] = []) {
    for (let x = r.x0 - 1; x <= r.x1 + 1; x++) { this.set(x, r.z0 - 1, false); this.set(x, r.z1 + 1, false); }
    for (let z = r.z0 - 1; z <= r.z1 + 1; z++) { this.set(r.x0 - 1, z, false); this.set(r.x1 + 1, z, false); }
    this.set(door.x, door.z, true);
    for (const e of extraOpen) this.set(e.x, e.z, true);
    this.line(connectTo.x, connectTo.z, door.x, door.z);
  }

  /** hard border ring = solid wall */
  borderRing() {
    const S = this.size;
    for (let i = 0; i < S; i++) {
      this.walk[0][i] = this.walk[S - 1][i] = this.walk[i][0] = this.walk[i][S - 1] = false;
    }
  }

  /** set of reachable tile keys from a start tile (flood fill, 4-dir) */
  reachableFrom(start: GridPos): Set<string> {
    const seen = new Set<string>([`${start.x},${start.z}`]);
    const q: GridPos[] = [start];
    while (q.length) {
      const c = q.shift()!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, nz = c.z + dz;
        if (!this.on(nx, nz)) continue;
        const k = `${nx},${nz}`;
        if (seen.has(k)) continue;
        seen.add(k); q.push({ x: nx, z: nz });
      }
    }
    return seen;
  }

  walkableList(): GridPos[] {
    const out: GridPos[] = [];
    const S = this.size;
    for (let x = 2; x < S - 2; x++) for (let z = 2; z < S - 2; z++) if (this.walk[x][z]) out.push({ x, z });
    return out;
  }
}

// ═════════════════════════════════════════════════════════════
// 2. TERRAIN — heights, stairs, wall profiles & materials
// ═════════════════════════════════════════════════════════════

/** a rectangular material zone painted over the noise/palette base */
export interface MatZone {
  rect: Rect;
  /** materials to pick from inside the zone (first = dominant) */
  mats: string[];
  /** 0..1 — probability the zone overrides the base palette per tile */
  strength?: number;
  /** also recolor the WALL ring around the rect (default: floor only) */
  wallsToo?: boolean;
}

export interface TerrainConfig {
  seed: number;
  // ── floor verticality ──
  /** base floor height in world units (default 1) */
  floorBase?: number;
  /** height of one terrace step in world units (default 0.5 — knee height) */
  stepSize?: number;
  /** max ± steps a floor may take from floorBase (default 2 → 1..2 at base 1) */
  floorSteps?: number;
  /** terrace noise frequency (default 0.075 — lower = bigger plateaus) */
  terraceScale?: number;
  /** tiles (and their 4-neighbours) forced flat to floorBase — gameplay spots */
  flatten?: GridPos[];
  /** explicit stairs: each entry carves a straight step ramp a→b (±stepSize per tile) */
  stairs?: { a: GridPos; b: GridPos }[];
  /** tiles forced to a specific height after terracing (e.g. a raised boss dais, or a mezzanine) */
  plateaus?: { rect: Rect; steps: number }[];
  // ── walls ──
  /** [min,max] wall height in world units (default [2.6, 3.8]) */
  wallHeight?: [number, number];
  /** noise frequency for wall-height variation (default 0.09) */
  wallScale?: number;
  // ── materials (any painter name from textures.ts, or a voxelTerrain palette key) ──
  /** floor palette — picked per-tile via patch noise, first = dominant */
  floorPalette: string[];
  /** wall palette — picked per-tile via patch noise, first = dominant */
  wallPalette: string[];
  /** painted material zones (boss rooms, secret chambers, …) */
  zones?: MatZone[];
}

export interface TerrainPack {
  /** per-tile floor height in world units (only meaningful on walkable tiles) */
  heights: number[][];
  /** per-tile floor material name (walkable tiles) */
  floorMats: string[][];
  /** per-tile wall material name (non-walkable tiles) */
  wallMats: string[][];
  /** per-tile wall height in world units (non-walkable tiles) */
  wallH: number[][];
  /** per-tile water flag — river tiles get translucent sheets + waterfall cascades */
  water?: Grid;
}

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Turn a carved walkability grid into a full terrain pack.
 * Guarantees: adjacent walkable tiles never differ by more than `stepSize`,
 * so every terraced floor remains traversable by the ±1-step pathfinding.
 */
export function buildTerrain(walk: Grid, cfg: TerrainConfig): TerrainPack {
  const S = walk.length;
  const rng = mulberry32(cfg.seed ^ 0x5f3759df);
  const floorBase = cfg.floorBase ?? 1;
  const step = cfg.stepSize ?? 0.5;
  const maxSteps = cfg.floorSteps ?? 2;
  const tScale = cfg.terraceScale ?? 0.075;
  const [wMin, wMax] = cfg.wallHeight ?? [2.6, 3.8];
  const wScale = cfg.wallScale ?? 0.09;

  const heights = Array.from({ length: S }, () => new Array<number>(S).fill(floorBase));
  const floorMats = Array.from({ length: S }, () => new Array<string>(S).fill(cfg.floorPalette[0]));
  const wallMats = Array.from({ length: S }, () => new Array<string>(S).fill(cfg.wallPalette[0]));
  const wallH = Array.from({ length: S }, () => new Array<number>(S).fill(wMin));

  const noiseSeed = (cfg.seed ^ 0x9e3779b9) >>> 0;

  // ── 1) terraced floors ─────────────────────────────────────
  // low-frequency fbm, quantised to whole steps → broad readable plateaus
  for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
    if (!walk[x][z]) continue;
    const n = fbm(x * tScale, z * tScale, noiseSeed, 3);
    const s = Math.round((n - 0.5) * 2 * (maxSteps + 0.49));
    heights[x][z] = floorBase + Math.max(-maxSteps, Math.min(maxSteps, s)) * step;
  }

  // authored plateaus (boss dais, sunken pit, mezzanine shelf, …)
  for (const p of cfg.plateaus ?? []) {
    for (let x = p.rect.x0; x <= p.rect.x1; x++) for (let z = p.rect.z0; z <= p.rect.z1; z++) {
      if (walk[x]?.[z]) heights[x][z] = floorBase + p.steps * step;
    }
  }

  // ── 2) flatten gameplay tiles & pin them as anchors ──
  // (spawns, doors, chests, …) — terracing then flows AROUND them.
  const pinned = Array.from({ length: S }, () => new Array<boolean>(S).fill(false));
  for (const f of cfg.flatten ?? []) {
    if (!walk[f.x]?.[f.z]) continue;
    pinned[f.x][f.z] = true;
    heights[f.x][f.z] = floorBase;
    for (const [dx, dz] of D4) if (walk[f.x + dx]?.[f.z + dz]) heights[f.x + dx][f.z + dz] = floorBase;
  }

  // ── 3) relaxation: every walkable neighbour within ±step ──
  // pull violators toward each other (pinned tiles never move);
  // a few passes converge everywhere → traversal always possible.
  // NOTE: plateaus are intentionally left unpinned here — this is what
  // makes them read as a real BG3 mezzanine: relaxation automatically
  // grades the tiles immediately around a raised rect down toward the
  // surrounding floor in `step` increments, i.e. it generates the ramp
  // for you. voxelTerrain.ts then turns every one of those height
  // deltas into an actual stacked-voxel stair/lip.
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
      if (!walk[x][z]) continue;
      for (const [dx, dz] of D4) {
        const nx = x + dx, nz = z + dz;
        if (!walk[nx]?.[nz]) continue;
        const d = heights[nx][nz] - heights[x][z];
        if (Math.abs(d) > step + 1e-6) {
          const fix = (Math.abs(d) - step) / 2;
          const sgn = Math.sign(d);
          if (!pinned[x][z]) { heights[x][z] += fix * sgn * (pinned[nx][nz] ? 2 : 1); changed = true; }
          else if (!pinned[nx][nz]) { heights[nx][nz] -= fix * sgn * 2; changed = true; }
        }
      }
    }
    if (!changed) break;
  }
  // re-snap to the step grid (relaxation introduces fractional residue)
  for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
    if (!walk[x][z] || pinned[x][z]) continue;
    heights[x][z] = Math.round((heights[x][z] - floorBase) / step) * step + floorBase;
  }

  // ── 4) carve explicit stairs (step ramps) ──
  for (const st of cfg.stairs ?? []) {
    const len = Math.max(Math.abs(st.b.x - st.a.x), Math.abs(st.b.z - st.a.z));
    if (len === 0) continue;
    const hA = heights[st.a.x]?.[st.a.z] ?? floorBase;
    const hB = heights[st.b.x]?.[st.b.z] ?? floorBase;
    for (let i = 1; i < len; i++) {
      const x = Math.round(st.a.x + ((st.b.x - st.a.x) * i) / len);
      const z = Math.round(st.a.z + ((st.b.z - st.a.z) * i) / len);
      if (!walk[x]?.[z]) continue;
      const raw = hA + ((hB - hA) * i) / len;
      heights[x][z] = Math.round((raw - floorBase) / step) * step + floorBase;
    }
  }

  // ── 5) materials: palette patches via mid-frequency noise ──
  const pick = (palette: string[], x: number, z: number, salt: number) => {
    if (palette.length === 1) return palette[0];
    const n = fbm(x * 0.16 + salt, z * 0.16, noiseSeed + salt, 2);
    const idx = Math.min(palette.length - 1, Math.floor(n * palette.length * 1.15));
    return palette[idx];
  };
  for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
    if (walk[x][z]) floorMats[x][z] = pick(cfg.floorPalette, x, z, 31);
    else wallMats[x][z] = pick(cfg.wallPalette, x, z, 77);
  }

  // ── 6) painted zones (override with strength) ──
  for (const zone of cfg.zones ?? []) {
    const strength = zone.strength ?? 1;
    for (let x = zone.rect.x0 - 1; x <= zone.rect.x1 + 1; x++) {
      for (let z = zone.rect.z0 - 1; z <= zone.rect.z1 + 1; z++) {
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        const inside = x >= zone.rect.x0 && x <= zone.rect.x1 && z >= zone.rect.z0 && z <= zone.rect.z1;
        if (walk[x][z]) {
          if (inside && rng() < strength) floorMats[x][z] = zone.mats[Math.floor(rng() * zone.mats.length)];
        } else if (zone.wallsToo && rng() < strength) {
          wallMats[x][z] = zone.mats[Math.floor(rng() * zone.mats.length)];
        }
      }
    }
  }

  // ── 7) wall heights — chunky mesas, not uniform fences ──
  for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
    if (walk[x][z]) continue;
    const n = fbm(x * wScale, z * wScale, noiseSeed + 555, 3);
    const jit = (hash2(x, z, cfg.seed) - 0.5) * 0.5;
    wallH[x][z] = Math.max(1.2, wMin + (wMax - wMin) * n + jit);
  }

  return { heights, floorMats, wallMats, wallH };
}

// ═════════════════════════════════════════════════════════════
// 3. FULL-AUTO PIPELINE — quick/expansion levels
// ═════════════════════════════════════════════════════════════
export interface DungeonGenConfig extends TerrainConfig {
  /** grid size (square). Default 46. */
  size?: number;
  /** number of blob rooms (default 8), NOT counting the sealed final/boss room */
  rooms?: number;
  /** room rect radius range in tiles (default [3,6]) */
  roomRadius?: [number, number];
  /** tunnel bore range (default [0.8, 1.4]) */
  bore?: [number, number];
  /** extra loop links beyond the spanning tree (default 3) */
  loops?: number;
  /** dead-end spurs (default 8) */
  spurs?: number;
  /** cellular roughness probability (default 0.14) */
  roughness?: number;

  /**
   * Carve one extra, larger room far from the spawn room and seal it
   * behind a single door (walled ring, one entrance) — the boss chamber.
   * It participates in the network like any other room (so roughen/
   * fillPinholes treat it identically) but gets explicitly re-sealed
   * as the very last carving step, after roughen would otherwise have
   * nibbled its walls open. Default false.
   */
  sealFinalRoom?: boolean;
  /** boss room radius range in tiles (default [7,9] — noticeably bigger than normal rooms) */
  finalRoomRadius?: [number, number];

  /**
   * Promote this many of the generated rooms (excluding spawn & the
   * boss room) to raised mezzanine shelves — real BG3-style elevated
   * platforms, each with its surrounding ramp generated automatically
   * by buildTerrain's relaxation pass. Default 0.
   */
  mezzanines?: number;
  /** how many terrace steps a mezzanine sits above its room's base height (default 1) */
  mezzanineSteps?: number;
}

export interface GeneratedDungeon extends TerrainPack {
  walk: Grid;
  /** all rooms including the sealed boss room, if any, as the last entry */
  rooms: Rect[];
  /** suggested party spawn — centre of the first room */
  partySpawn: GridPos;
  /** room centres, handy for spawn/prop placement (same indexing as `rooms`) */
  centers: GridPos[];
  /** index into `rooms`/`centers` of the sealed boss room, if `sealFinalRoom` was set */
  bossRoomIndex?: number;
  /** the single door tile into the sealed boss room */
  bossDoor?: GridPos;
  /** the maze-side tile the boss door connects to */
  bossConnect?: GridPos;
  /** indices into `rooms`/`centers` promoted to mezzanine plateaus */
  mezzanineRoomIndices: number[];
}

function ringDoor(r: Rect, target: GridPos): GridPos {
  const dLeft = Math.abs(target.x - (r.x0 - 1));
  const dRight = Math.abs(target.x - (r.x1 + 1));
  const dTop = Math.abs(target.z - (r.z0 - 1));
  const dBottom = Math.abs(target.z - (r.z1 + 1));
  const m = Math.min(dLeft, dRight, dTop, dBottom);
  const clampX = Math.max(r.x0, Math.min(r.x1, target.x));
  const clampZ = Math.max(r.z0, Math.min(r.z1, target.z));
  if (m === dLeft) return { x: r.x0 - 1, z: clampZ };
  if (m === dRight) return { x: r.x1 + 1, z: clampZ };
  if (m === dTop) return { x: clampX, z: r.z0 - 1 };
  return { x: clampX, z: r.z1 + 1 };
}

/**
 * One-call dungeon: auto rooms + networked tunnels + spurs + terrain,
 * with optional sealed boss room and mezzanine plateaus.
 * Use for procedural floors & expansions; authored levels can instead
 * drive Carver by hand and call buildTerrain directly.
 */
export function generateDungeon(cfg: DungeonGenConfig): GeneratedDungeon {
  const S = cfg.size ?? 46;
  const cav = new Carver(cfg.seed, S);
  const rng = cav.rng;
  const nRooms = cfg.rooms ?? 8;
  const [rMin, rMax] = cfg.roomRadius ?? [3, 6];
  const [bMin, bMax] = cfg.bore ?? [0.8, 1.4];
  const loops = cfg.loops ?? 3;
  const spurs = cfg.spurs ?? 8;

  // ── carve the optional sealed boss room FIRST, on an empty grid.
  // First placement never needs rejection sampling — the grid is empty —
  // so it can never fail to fit. Spawning-path rooms later just avoid it.
  let bossIdx = -1;
  let bossRect: Rect | null = null;
  let bossCenter: GridPos | null = null;
  if (cfg.sealFinalRoom) {
    const [frMin, frMax] = cfg.finalRoomRadius ?? [7, 9];
    const rx = frMin + rng() * (frMax - frMin);
    const rz = frMin + rng() * (frMax - frMin);
    const cx = 6 + rx + rng() * (S - 12 - rx * 2);
    const cz = 6 + rz + rng() * (S - 12 - rz * 2);
    bossRect = {
      x0: Math.round(cx - rx), z0: Math.round(cz - rz),
      x1: Math.round(cx + rx), z1: Math.round(cz + rz),
    };
    bossCenter = { x: Math.round(cx), z: Math.round(cz) };
    cav.blobRoom(bossRect, { clampRect: true, rough: 0.55 });
  }

  // ── rooms, spread with light rejection sampling — always avoid the boss area ──
  const rooms: Rect[] = [];
  let guard = 0;
  while (rooms.length < nRooms && guard++ < 3000) {
    const rx = rMin + rng() * (rMax - rMin);
    const rz = rMin + rng() * (rMax - rMin);
    const cx = 4 + rx + rng() * (S - 8 - rx * 2);
    const cz = 4 + rz + rng() * (S - 8 - rz * 2);
    const rect: Rect = {
      x0: Math.round(cx - rx), z0: Math.round(cz - rz),
      x1: Math.round(cx + rx), z1: Math.round(cz + rz),
    };
    // keep a 2-tile gap between rooms so walls exist between them
    if (rooms.some((r) => rect.x0 < r.x1 + 2 && rect.x1 > r.x0 - 2 && rect.z0 < r.z1 + 2 && rect.z1 > r.z0 - 2)) continue;
    // never overlap the boss area (3-tile wall band around it)
    if (bossRect && rect.x0 < bossRect.x1 + 3 && rect.x1 > bossRect.x0 - 3 && rect.z0 < bossRect.z1 + 3 && rect.z1 > bossRect.z0 - 3) continue;
    rooms.push(rect);
    cav.blobRoom(rect);
  }
  const centers = rooms.map((r) => ({ x: (r.x0 + r.x1) >> 1, z: (r.z0 + r.z1) >> 1 }));

  // ── THE PARTY SPAWN is the generated room whose centre is FARTHEST
  // from the boss. With the boss carved first and the player's start at
  // the opposite end of the map, the maze naturally funnels toward the boss.
  const spawnIdx = bossCenter
    ? rooms.reduce((best, r, i) => {
        const d = Math.hypot((r.x0 + r.x1) / 2 - bossCenter!.x, (r.z0 + r.z1) / 2 - bossCenter!.z);
        return d > best.d ? { i, d } : best;
      }, { i: 0, d: -1 }).i
    : 0;

  // ── spanning-tree links + loops ──
  const linked = new Set<number>([spawnIdx]);
  while (linked.size < rooms.length) {
    let best: [number, number, number] | null = null; // [from, to, dist]
    for (const i of linked) for (let j = 0; j < rooms.length; j++) {
      if (linked.has(j)) continue;
      const d = Math.hypot(centers[i].x - centers[j].x, centers[i].z - centers[j].z);
      if (!best || d < best[2]) best = [i, j, d];
    }
    if (!best) break;
    cav.tunnel(centers[best[0]], centers[best[1]], bMin + rng() * (bMax - bMin));
    linked.add(best[1]);
  }
  for (let i = 0; i < loops; i++) {
    const a = Math.floor(rng() * rooms.length), b = Math.floor(rng() * rooms.length);
    if (a !== b) cav.tunnel(centers[a], centers[b], bMin + rng() * (bMax - bMin));
  }

  // ── dead-end spurs & pocket caverns ──
  for (let i = 0; i < spurs; i++) {
    const src = cav.walkableList();
    if (!src.length) break;
    const s = src[Math.floor(rng() * src.length)];
    const len = 3 + Math.floor(rng() * 6);
    const clamp = (v: number) => Math.max(2, Math.min(S - 3, v));
    const dst = { x: clamp(s.x + Math.round((rng() - 0.5) * len * 2)), z: clamp(s.z + Math.round((rng() - 0.5) * len * 2)) };
    cav.tunnel(s, dst, rng() < 0.4 ? 1.2 : 0.6);
  }

  cav.roughen(cfg.roughness ?? 0.14);
  cav.fillPinholes();
  cav.borderRing();

  // ── register the boss room as the LAST entry in `rooms` for downstream
  // indexing consistency (bossRoomIndex points at it) ──
  if (bossRect && bossCenter) {
    rooms.push(bossRect);
    centers.push(bossCenter);
    bossIdx = rooms.length - 1;
  }

  // ── seal the boss room LAST. Draw a connector tunnel from the nearest
  // non-boss room toward the boss centre, so the boss ring's neighbourhood
  // gets reachable corridor tiles. Then flood-fill from the spawn's
  // component, find the nearest ALREADY-CONNECTED walkable tile in a band
  // around the (now walled) boss ring, punch the door facing it, and
  // guarantee the link via sealRoom's straight-line connector. Robust to
  // however the rest of the carved maze happened to route. ──
  let bossDoor: GridPos | undefined;
  let bossConnect: GridPos | undefined;
  if (bossRect && bossCenter && rooms.length > 1) {
    // (1) carve a tentative corridor: nearest non-boss room → boss centre
    let nearestI = 0, nearestD = Infinity;
    for (let i = 0; i < rooms.length; i++) {
      if (i === bossIdx) continue;
      const d = Math.hypot(centers[i].x - bossCenter.x, centers[i].z - bossCenter.z);
      if (d < nearestD) { nearestD = d; nearestI = i; }
    }
    cav.tunnel(centers[nearestI], bossCenter, bMin + rng() * (bMax - bMin));

    // (2) wall the boss ring solid + punch one door — temporarily, so the
    // flood-fill below sees the boss as a sealed island. We'll re-seal at
    // the end against the real nearest reachable corridor tile.
    cav.sealRoom(bossRect, ringDoor(bossRect, centers[nearestI]), centers[nearestI]);

    // (3) flood-fill the spawn's connected component; find the nearest
    // reachable corridor tile in a band just outside the boss ring.
    const reach = cav.reachableFrom(centers[spawnIdx]);
    let closest: GridPos | null = null;
    let closestD = Infinity;
    const band = 2;
    for (let x = bossRect.x0 - band - 1; x <= bossRect.x1 + band + 1; x++) {
      for (let z = bossRect.z0 - band - 1; z <= bossRect.z1 + band + 1; z++) {
        if (!cav.on(x, z)) continue;
        // skip the boss room interior (it's part of a sealed island)
        if (x >= bossRect.x0 && x <= bossRect.x1 && z >= bossRect.z0 && z <= bossRect.z1) continue;
        if (reach && !reach.has(`${x},${z}`)) continue;
        const d = Math.hypot(x - bossCenter.x, z - bossCenter.z);
        if (d < closestD) { closestD = d; closest = { x, z }; }
      }
    }

    if (closest) {
      // (4) final re-seal with the door facing the real nearest reachable tile
      bossConnect = closest;
      bossDoor = ringDoor(bossRect, closest);
      cav.sealRoom(bossRect, bossDoor, closest);
    } else {
      // (4-fallback) keep the tentative seal from step (2); the corridor
      // from the nearest room still guarantees a connection.
      bossConnect = centers[nearestI];
      bossDoor = ringDoor(bossRect, centers[nearestI]);
      cav.sealRoom(bossRect, bossDoor, centers[nearestI]);
    }
  }

  // ── mezzanine plateaus: pick N rooms (never spawn or the boss room)
  // and raise them; buildTerrain's relaxation auto-grades the ramp ──
  const mezzCount = Math.max(0, cfg.mezzanines ?? 0);
  const mezzanineRoomIndices: number[] = [];
  if (mezzCount > 0) {
    const candidates: number[] = [];
    for (let i = 0; i < rooms.length; i++) if (i !== spawnIdx && i !== bossIdx) candidates.push(i);
    // shuffle deterministically, then take the first N
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    mezzanineRoomIndices.push(...candidates.slice(0, Math.min(mezzCount, candidates.length)));
  }
  const mezzSteps = cfg.mezzanineSteps ?? 1;
  const autoPlateaus = mezzanineRoomIndices.map((i) => ({
    rect: { x0: rooms[i].x0 + 1, z0: rooms[i].z0 + 1, x1: rooms[i].x1 - 1, z1: rooms[i].z1 - 1 },
    steps: mezzSteps,
  })).filter((p) => p.rect.x0 <= p.rect.x1 && p.rect.z0 <= p.rect.z1);

  const terrainCfg: TerrainConfig = {
    ...cfg,
    plateaus: [...(cfg.plateaus ?? []), ...autoPlateaus],
  };
  const terrain = buildTerrain(cav.walk, terrainCfg);
  const partySpawn = centers[spawnIdx] ?? centers[0] ?? { x: S >> 1, z: S >> 1 };
  return {
    walk: cav.walk, rooms, centers, partySpawn, ...terrain,
    bossRoomIndex: bossIdx >= 0 ? bossIdx : undefined,
    bossDoor, bossConnect,
    mezzanineRoomIndices,
  };
}
