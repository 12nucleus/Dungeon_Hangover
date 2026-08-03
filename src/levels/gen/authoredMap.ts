// ─────────────────────────────────────────────────────────────
// Authored map builder — hand-authored Floor 50 (The Sewer Cellar).
//
// Unlike generateDungeon (procedural blobs + tunnels), this rasterizes
// a fixed room/corridor spec into a WORLD_SIZE² walk grid. The macro-map
// is deterministic; per-run variety comes from seeded content placement
// (loot, traps, poison bottles) by the engine, never from the layout.
//
// All coordinates passed in are MAP-LOCAL; the returned AuthoredMap
// rects are inset by `offset` so the caller can use them directly in
// world coordinates.
// ─────────────────────────────────────────────────────────────
import type { GridPos } from '../../game/types';
import type { Rect } from '../levelTypes';

export type FloorMat = 'stone' | 'dirt' | 'water_shallow' | 'water_deep' | 'marble' | 'bone' | 'fungal';

export interface RoomSpec {
  id: string;
  name: string;
  /** map-local top-left corner */
  x0: number;
  z0: number;
  w: number;
  h: number;
  floor: FloorMat;
}

export interface CorridorSpec {
  /** polyline through map-local tiles; consecutive points are rasterized */
  pts: GridPos[];
  width: 1 | 2 | 3;
}

export interface AuthoredMap {
  walk: boolean[][];
  water: boolean[][];
  floorMats: string[][];
  /** room id → world rect (inset by offset) */
  rooms: Record<string, Rect>;
  roomOf(x: number, z: number): string | null;
}

/** Floor-material → voxel palette name (see voxelTerrain DEFAULT_PALETTE). */
const FLOOR_TO_MAT: Record<FloorMat, string> = {
  stone: 'cave_floor',
  dirt: 'gravel',
  bone: 'cave_stone',
  fungal: 'moss',
  water_shallow: 'cave_floor',
  water_deep: 'cave_floor',
  marble: 'marble',
};

export function buildAuthoredMap(
  size: number,
  offset: GridPos,
  rooms: RoomSpec[],
  corridors: CorridorSpec[],
): AuthoredMap {
  const walk = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const water = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const floorMats = Array.from({ length: size }, () => new Array<string>(size).fill('cave_floor'));
  const rects: Record<string, Rect> = {};
  const idByTile = new Map<string, string>();

  const setWalk = (x: number, z: number, mat: string, watery = false) => {
    if (x < 0 || z < 0 || x >= size || z >= size) return;
    walk[x][z] = true;
    floorMats[x][z] = mat;
    if (watery) water[x][z] = true;
  };

  // ── rooms ──
  for (const r of rooms) {
    const watery = r.floor === 'water_shallow' || r.floor === 'water_deep';
    const mat = FLOOR_TO_MAT[r.floor];
    for (let x = r.x0; x < r.x0 + r.w; x++) {
      for (let z = r.z0; z < r.z0 + r.h; z++) {
        setWalk(x + offset.x, z + offset.z, mat, watery);
        idByTile.set(`${x + offset.x},${z + offset.z}`, r.id);
      }
    }
    rects[r.id] = { x0: r.x0 + offset.x, z0: r.z0 + offset.z, x1: r.x0 + offset.x + r.w - 1, z1: r.z0 + offset.z + r.h - 1 };
  }

  // ── corridors (thick polylines) ──
  const rasterSegment = (a: GridPos, b: GridPos, width: 1 | 2 | 3) => {
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
    const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
    for (let i = 0; i <= len; i++) {
      const x = a.x + dx * i, z = a.z + dz * i;
      setWalk(x + offset.x, z + offset.z, 'cave_floor');
      if (width === 2) {
        // perpendicular neighbour — horizontal segments widen in z, vertical in x
        if (dz !== 0) setWalk(x + offset.x + 1, z + offset.z, 'cave_floor');
        else setWalk(x + offset.x, z + offset.z + 1, 'cave_floor');
      } else if (width === 3) {
        // grander corridors: the lane plus both perpendicular neighbours
        if (dz !== 0) {
          setWalk(x + offset.x + 1, z + offset.z, 'cave_floor');
          setWalk(x + offset.x - 1, z + offset.z, 'cave_floor');
        } else {
          setWalk(x + offset.x, z + offset.z + 1, 'cave_floor');
          setWalk(x + offset.x, z + offset.z - 1, 'cave_floor');
        }
      }
    }
  };
  for (const c of corridors) {
    for (let i = 0; i + 1 < c.pts.length; i++) rasterSegment(c.pts[i], c.pts[i + 1], c.width);
  }

  return {
    walk,
    water,
    floorMats,
    rooms: rects,
    roomOf(x: number, z: number): string | null {
      return idByTile.get(`${x},${z}`) ?? null;
    },
  };
}

/**
 * Fail-fast layout sanity: every room is a non-empty rect, no two rooms
 * overlap, and every room center is reachable from the first room by BFS
 * over the walk grid. Throws on violation — floor 50 is hand-authored, so
 * a broken map must break at import time, not mid-run.
 */
export function validateAuthoredMap(map: AuthoredMap, rooms: RoomSpec[]): void {
  const S = map.walk.length;
  const inBounds = (x: number, z: number) => x >= 0 && z >= 0 && x < S && z < S;
  const center = (r: Rect): GridPos => ({ x: (r.x0 + r.x1) >> 1, z: (r.z0 + r.z1) >> 1 });

  // no overlap
  const list = rooms.map((r) => map.rooms[r.id]);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const overlap = a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
      if (overlap) throw new Error(`authored map: rooms ${rooms[i].id} and ${rooms[j].id} overlap`);
    }
  }

  // connectivity: BFS from room 1 (spawn room)
  const start = center(map.rooms[rooms[0].id]);
  const seen = new Set<string>([`${start.x},${start.z}`]);
  const q: GridPos[] = [start];
  while (q.length) {
    const c = q.shift()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, nz = c.z + dz;
      if (!inBounds(nx, nz) || !map.walk[nx][nz]) continue;
      const k = `${nx},${nz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, z: nz });
    }
  }
  for (const r of rooms) {
    const c = center(map.rooms[r.id]);
    if (!map.walk[c.x]?.[c.z]) throw new Error(`authored map: room ${r.id} center not walkable`);
    if (!seen.has(`${c.x},${c.z}`)) throw new Error(`authored map: room ${r.id} unreachable from spawn`);
  }
}
