// ─────────────────────────────────────────────────────────────
// VOXEL TERRAIN — turns a dungeon TerrainPack (walk / heights / wallH /
// floorMats / wallMats) into real BG3-style voxel geometry at the SAME
// voxel size your characters/props use (VOX = 0.055), instead of the
// old textured InstancedMesh cave-block system.
//
// Three kinds of geometry, all merged into two draw calls:
//
//   1. FLAT SLABS  — one merged box per walkable tile interior. Cheap,
//      invisible as an optimisation because a flat floor has no voxel
//      detail to show anyway. (Skipped for water tiles — water gets
//      its own translucent sheet mesh.)
//   2. VOXEL DETAIL — true VOX-sized cubes, built only where the eye
//      actually sees "voxel-ness": tile edges/drop-offs (→ stepped
//      skirts, which is exactly what a ramp or mezzanine lip is),
//      and exposed wall faces (→ per (x,z)-subcell stacked voxel
//      columns with a per-cube random top profile so the silhouette
//      reads as hewn rock, not flat panels).
//   3. WATER       — a thin translucent quad sheet per water tile
//      sitting at the floor height, plus stacked voxel "cascade"
//      cubes wherever the river drops from one height step to the
//      next (waterfalls emerge naturally from terraced rivers).
//
// A hard box-count budget (`VoxelBudget.maxBoxes`) is checked before
// building; if the true 0.055 step would exceed it, the voxel step is
// doubled (0.055 → 0.11 → 0.22 …) until the level fits. This keeps a
// 50+ room level renderable regardless of size, while staying as fine
// as the budget allows.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const VOX = 0.055;   // matches character/prop voxel size (engine.ts VOX_C)
export const TILE = 1;      // world units per game tile — must match world.ts TILE

export type Grid = boolean[][];

export interface VoxelBudget {
  /** hard cap on total BoxGeometry instances before merge (perf knob) */
  maxBoxes: number;
}
export const DEFAULT_BUDGET: VoxelBudget = { maxBoxes: 600_000 };

export type PaletteFn = (mat: string) => number; // material name → hex color

export interface VoxelTerrainOptions {
  floorPalette: PaletteFn;
  wallPalette: PaletteFn;
  /** used only to seed height/color jitter deterministically */
  seed: number;
  /** water hex colour (used for water sheets + cascade cubes) */
  waterColor?: number;
}

export interface VoxelTerrainResult {
  group: THREE.Group;
  /** the voxel step actually used (== VOX unless the budget forced a coarser step) */
  voxStep: number;
  stats: { boxes: number; approxTris: number; budget: number };
}

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

function hash(x: number, z: number, seed: number): number {
  let h = seed + x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed);
  const c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Build the full voxel terrain group for a dungeon layout.
 *
 * `heights`/`wallH` are in world units (same convention as buildTerrain
 * in dungeonGen.ts: floor height is where a unit stands, wall height is
 * measured from y=0 up).
 *
 * `water` (optional, S×S boolean grid) marks river tiles: their floor
 * slab is skipped, a translucent blue water sheet is placed at the
 * floor height, and where a river tile drops to a lower neighbour we
 * emit a stacked cube "cascade" so it reads as a waterfall.
 */
export function buildVoxelTerrain(
  walk: Grid,
  heights: number[][],
  wallH: number[][],
  floorMats: string[][],
  wallMats: string[][],
  opts: VoxelTerrainOptions,
  budget: VoxelBudget = DEFAULT_BUDGET,
  water: Grid | null = null,
): VoxelTerrainResult {
  const S = walk.length;
  const toWorld = (x: number, z: number) => ({
    wx: (x - S / 2 + 0.5) * TILE,
    wz: (z - S / 2 + 0.5) * TILE,
  });

  const waterColor = opts.waterColor ?? 0x2a6f8f;
  const flatGeos: THREE.BufferGeometry[] = [];  // cheap merged interior slabs
  const voxGeos: THREE.BufferGeometry[] = [];   // true VOX-sized detail cubes
  const waterGeos: THREE.BufferGeometry[] = []; // thin water sheets
  const col = new THREE.Color();
  let boxCount = 0;

  const pushBox = (
    list: THREE.BufferGeometry[],
    sx: number, sy: number, sz: number,
    x: number, y: number, z: number,
    hex: number, jitter = 0.08,
  ) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    col.setHex(hex);
    const j = 1 - jitter / 2 + hash(Math.round(x * 41 + z * 7), Math.round(z * 41), (opts.seed | 0) + 1) * jitter;
    col.multiplyScalar(j);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    list.push(g);
    boxCount++;
  };
  /** multiply a packed hex colour by a scalar (per-tile value jitter) */
  const scaleHex = (hex: number, f: number): number => {
    const r = Math.min(255, Math.round(((hex >> 16) & 0xff) * f));
    const g = Math.min(255, Math.round(((hex >> 8) & 0xff) * f));
    const b = Math.min(255, Math.round((hex & 0xff) * f));
    return (r << 16) | (g << 8) | b;
  };
  const pushPlane = (
    list: THREE.BufferGeometry[],
    sx: number, sz: number,
    x: number, y: number, z: number,
    hex: number,
  ) => {
    const g = new THREE.PlaneGeometry(sx, sz, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    col.setHex(hex);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    list.push(g);
    // planes are cheap — don't count them against the box budget
  };

  // ── budget guard: estimate voxel-detail box count at a given step,
  // coarsen the step until we're under budget ──
  const estimateDetailBoxes = (step: number) => {
    let floorTiles = 0;
    let edgeTiles = 0;
    let wallFaceTiles = 0;
    for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
      if (walk[x][z]) {
        floorTiles++;
        for (const [dx, dz] of D4) if (!walk[x + dx]?.[z + dz]) { edgeTiles++; break; }
      } else {
        for (const [dx, dz] of D8) if (walk[x + dx]?.[z + dz]) { wallFaceTiles++; break; }
      }
    }
    const subPerTile = Math.ceil(TILE / step);    // sub-cells per tile side (for walls/edges)
    const avgColLayers = 3;                         // rough wall cube count in Y per column
    // floor voxels use a FIXED coarse step (floorVox ≈ 0.165 → 6² = 36 per tile)
    const floorCubesPerTile = 36;
    const floorTotal = floorTiles * floorCubesPerTile;
    // edge skirts: ~subPerTile cubes stacked per exposed edge tile (rough)
    // wall columns: subPerTile across X × subPerTile along Z × ~avgColLayers stacked
    return floorTotal
      + edgeTiles * subPerTile
      + wallFaceTiles * subPerTile * subPerTile * avgColLayers;
  };
  let voxStep = VOX;
  while (estimateDetailBoxes(voxStep) > budget.maxBoxes && voxStep < 0.6) voxStep *= 2;

  // ── 1) voxellized floor — each tile is a grid of sub-voxel cubes with
  // per-voxel color jitter and micro-height noise so the floor reads as
  // textured hewn rock, not a flat panel. Uses a FIXED coarse floor-step
  // (floorVox ≈ 0.16, 6×6 per tile) instead of the detail voxStep, so a
  // 120×120 grid stays performant (~144k floor cubes) while still showing
  // texture. ──
  // (skipped on water tiles — those get a translucent sheet later)
  const floorVox = 0.165;   // 6 cubes per tile side — textured but cheap
  for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
    if (!walk[x][z]) continue;
    if (water?.[x]?.[z]) continue;
    const { wx, wz } = toWorld(x, z);
    const h = heights[x][z];
    // per-TILE value jitter (±12%): neighbouring tiles differ in brightness
    // so the 1×1 grid stays countable at game scale without drawing grid
    // lines. One hash per tile — the inner voxel loop stays allocation-free.
    const matCol = scaleHex(
      opts.floorPalette(floorMats[x][z]),
      0.88 + hash(x * 7 + 13, z * 11 + 5, (opts.seed | 0) + 21) * 0.24,
    );
    const cols = Math.max(1, Math.round(TILE / floorVox));
    for (let cx = 0; cx < cols; cx++) {
      for (let cz = 0; cz < cols; cz++) {
        const ox = wx - TILE / 2 + floorVox * (cx + 0.5);
        const oz = wz - TILE / 2 + floorVox * (cz + 0.5);
        // per-voxel micro-height: faint noise bump for surface relief
        const bump = vnoise(x * 3 + cx * 0.3, z * 3 + cz * 0.3, (opts.seed | 0) + 42) * 0.02;
        // per-voxel color jitter — some voxels darker (cracks), some lighter (pebbles)
        const jit = hash(x * 17 + cx, z * 13 + cz, (opts.seed | 0) + 88);
        const dark = jit < 0.12;   // ~12% are darker crack-voxels
        const col = dark ? (matCol & 0xfefefe) >> 1 | 0x1a1a1a : matCol;  // darken
        pushBox(flatGeos, floorVox * 0.98, 0.08, floorVox * 0.98, ox, h - 0.04 + bump, oz, col, 0.12);
      }
    }
  }

  // ── 2) voxel-detail edge skirts — this doubles as ramps/mezzanine lips:
  // any tile whose neighbour is lower (or solid rock) gets a stepped
  // stack of true VOX cubes bridging the height gap. Adjacent stair
  // tiles (which already differ by small height increments from
  // buildTerrain's stair carving) produce a real staircase for free. ──
  for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
    if (!walk[x][z]) continue;
    if (water?.[x]?.[z]) continue; // water falls handled separately
    const h = heights[x][z];
    const mat = floorMats[x][z];
    for (const [dx, dz] of D4) {
      const nx = x + dx, nz = z + dz;
      const nWalk = !!walk[nx]?.[nz];
      const nWater = nWalk && !!water?.[nx]?.[nz];
      const nH = nWalk ? heights[nx][nz] : 0;
      if (nWalk && Math.abs(h - nH) < 0.02 && !nWater) continue; // flush — no skirt needed
      const { wx, wz } = toWorld(x, z);
      const edgeX = wx + (dx * TILE) / 2, edgeZ = wz + (dz * TILE) / 2;
      const bottom = nWalk ? nH : h - 1.4; // hangs down to a short apron against solid rock
      const n = Math.max(1, Math.round((h - bottom) / voxStep));
      for (let i = 0; i < n; i++) {
        const cy = bottom + i * voxStep + voxStep / 2;
        pushBox(voxGeos, voxStep * 0.96, voxStep * 0.96, voxStep * 0.96, edgeX, cy, edgeZ, opts.floorPalette(mat), 0.18);
      }
    }
  }

  // ── 3) WALLS — exposed rock faces built as STACKED VOX-rez columns.
  // For each wall tile, only the sub-cell columns along EDGES that face
  // a walkable neighbour are emitted (NOT the whole 1×1 tile square).
  // That keeps the voxel cube count O(cols × layers × edges) per wall
  // tile instead of O(cols² × layers), well within budget for a 50-room
  // dungeon, and reads as a real continuous hewn-rock face: columns on
  // adjacent wall tiles stitch together because the edge strip of one
  // tile sits against the matching edge strip of the next.
  //
  // Each column's height jitters per sub-cell via smooth low-frequency
  // noise + a per-cell hash spike so neighbouring columns vary, and the
  // upper layers are dropped probabilistically → jagged hewn-rock top.
  const emitWallColumn = (
    ox: number, oz: number,
    baseH: number, matCol: number,
    x: number, z: number, cx: number, cz: number,
  ) => {
    const n = vnoise(x + (cx - 0.5) * 0.55, z + (cz - 0.5) * 0.55, (opts.seed | 0) + 77);
    const spike = hash(x * 23 + cx, z * 19 + cz, (opts.seed | 0) + 3);
    const colH = Math.max(voxStep * 2, baseH * (0.78 + n * 0.35 + (spike - 0.5) * 0.32));
    const layers = Math.max(1, Math.round(colH / voxStep));
    for (let cy = 0; cy < layers; cy++) {
      const layerFromTop = layers - 1 - cy;
      // top few layers may be dropped probabilistically for a jagged
      // hewn-rock top; the bottom few layers always stay (solid floor)
      if (layerFromTop > 0 && layerFromTop < 3) {
        const drop = hash(x + cx, cy + z + cz, (opts.seed | 0) + cy * 7);
        const dropProb = 0.10 + layerFromTop * 0.28;
        if (drop < dropProb) continue;
      }
      const yWorld = cy * voxStep + voxStep / 2;
      pushBox(voxGeos, voxStep * 0.96, voxStep * 0.94, voxStep * 0.96, ox, yWorld, oz, matCol, 0.16);
    }
  };

  for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
    if (walk[x][z]) continue;
    const { wx, wz } = toWorld(x, z);
    const baseH = wallH[x][z];
    const matCol = opts.wallPalette(wallMats[x][z]);
    const cols = Math.max(1, Math.round(TILE / voxStep));
    // 4-directional edges — emit a strip of sub-cell columns along each
    // exposed face of this wall tile. Diagonal-walkable corner cells get
    // a single corner column so neighbours stitch into solid corners.
    for (const [dx, dz] of D4) {
      if (!walk[x + dx]?.[z + dz]) continue;
      // strip runs perpendicular to the (dx,dz) face normal
      for (let i = 0; i < cols; i++) {
        // sub-cell index along the strip
        let cx: number, cz: number;
        if (dx !== 0) {
          // face is in the ±X direction → strip runs along Z sub-cells
          cx = dx > 0 ? cols - 1 : 0;
          cz = i;
        } else {
          // face is in the ±Z direction → strip runs along X sub-cells
          cx = i;
          cz = dz > 0 ? cols - 1 : 0;
        }
        const ox = wx - TILE / 2 + voxStep * (cx + 0.5);
        const oz = wz - TILE / 2 + voxStep * (cz + 0.5);
        // nudge the column slightly into the wall face so neighbouring
        // wall-tile strips overlap and read as a single solid surface
        const nudge = 0.5 * voxStep;
        const oxN = ox - dx * nudge;
        const ozN = oz - dz * nudge;
        emitWallColumn(oxN, ozN, baseH, matCol, x, z, cx, cz);
      }
    }
    // diagonal corners — single column at the inner corner of each
    // diagonally-adjacent walkable tile, so wall faces connect around bends
    const DIA = [[1, 1, 1, 1], [1, -1, 1, cols - 1], [-1, 1, cols - 1, 1], [-1, -1, cols - 1, cols - 1]] as const;
    for (const [sx, sz, cx, cz] of DIA) {
      // only emit a corner column when the diagonal walkable tile is
      // NOT also covered by an adjacent orthogonal face of THIS tile
      // (avoids duplicate work; the orthogonal strips already cover it)
      if (!walk[x + sx]?.[z + sz]) continue;
      // skip if either orthogonal neighbour is also walkable (already covered)
      if (walk[x + sx]?.[z] || walk[x]?.[z + sz]) continue;
      const ox = wx - TILE / 2 + voxStep * (cx + 0.5);
      const oz = wz - TILE / 2 + voxStep * (cz + 0.5);
      const nudge = 0.5 * voxStep;
      emitWallColumn(ox - sx * nudge, oz - sz * nudge, baseH * 0.85, matCol, x, z, cx, cz);
    }
  }

  // ── 4) WATER — translucent sheets on river tiles + waterfall cascades
  // wherever a river tile drops to a lower neighbour. ──
  if (water) {
    for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
      if (!walk[x][z] || !water[x][z]) continue;
      const { wx, wz } = toWorld(x, z);
      const h = heights[x][z];
      // surface sheet at floor level +0.02 (slightly above floor so it reads)
      pushPlane(waterGeos, TILE * 0.96, TILE * 0.96, wx, h + 0.03, wz, waterColor);

      // waterfall: any lower walkable neighbour (incl. out-of-river) gets
      // a stacked cube cascade down to that neighbour's height
      for (const [dx, dz] of D4) {
        const nx = x + dx, nz = z + dz;
        if (!walk[nx]?.[nz]) continue;
        const nH = heights[nx][nz];
        if (nH >= h - 0.02) continue; // only drops
        const drop = h - nH;
        const layers = Math.max(1, Math.round(drop / voxStep));
        const edgeX = wx + (dx * TILE) / 2, edgeZ = wz + (dz * TILE) / 2;
        for (let i = 0; i < layers; i++) {
          const cy = nH + i * voxStep + voxStep / 2;
          // shimmer: top cubes bright, bottom fade-out
          const t = i / Math.max(1, layers - 1);
          const shaded = waterColor;
          pushBox(voxGeos, voxStep * 0.96, voxStep * 0.96, voxStep * 0.96, edgeX, cy, edgeZ, shaded, 0.06 + t * 0.18);
        }
      }
    }
  }

  const mergeAndAdd = (geos: THREE.BufferGeometry[]) => {
    if (!geos.length) return null;
    const merged = mergeGeometries(geos, false)!;
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  };
  const mergeWater = (geos: THREE.BufferGeometry[]) => {
    if (!geos.length) return null;
    const merged = mergeGeometries(geos, false)!;
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(
      merged,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.74,
        depthWrite: false,
      }),
    );
    mesh.renderOrder = 2;
    return mesh;
  };

  const group = new THREE.Group();
  const flatMesh = mergeAndAdd(flatGeos);
  const voxMesh = mergeAndAdd(voxGeos);
  const waterMesh = mergeWater(waterGeos);
  if (flatMesh) group.add(flatMesh);
  if (voxMesh) group.add(voxMesh);
  if (waterMesh) group.add(waterMesh);

  if (voxStep !== VOX) {
    // eslint-disable-next-line no-console
    console.warn(`[voxelTerrain] budget forced voxel step ${VOX} → ${voxStep} (raise VoxelBudget.maxBoxes for finer detail)`);
  }

  return {
    group,
    voxStep,
    stats: { boxes: boxCount, approxTris: boxCount * 12, budget: budget.maxBoxes },
  };
}

/**
 * Walk a wandering river through the maze. Marks `water` true for every
 * walkable tile the river centres passes over (with a small bore), and
 * ensures the river tile heights form a downward slope toward `a → b`.
 *
 * Returns the boolean grid; mutates the `heights` array in place so the
 * downstream waterfall cascade logic finds real height drops.
 */
export function carveRiver(
  walk: Grid,
  heights: number[][],
  a: { x: number; z: number },
  b: { x: number; z: number },
  bore = 1,
): Grid {
  const S = walk.length;
  const water: Grid = Array.from({ length: S }, () => new Array<boolean>(S).fill(false));
  // drunk-walk the centre line a → b (same idea as Carver.tunnel) and
  // collect the centre path so we can slope floor heights downward after.
  const path: { x: number; z: number }[] = [];
  let x = a.x, z = a.z, guard = 0;
  const mark = (cx: number, cz: number) => {
    for (let dx = -bore; dx <= bore; dx++) for (let dz = -bore; dz <= bore; dz++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      if (!walk[nx][nz]) continue;
      if (!water[nx][nz]) path.push({ x: nx, z: nz });
      water[nx][nz] = true;
    }
  };
  while ((x !== b.x || z !== b.z) && guard++ < 2000) {
    mark(x, z);
    const dx = Math.sign(b.x - x), dz = Math.sign(b.z - z);
    if (x === b.x) z += dz;
    else if (z === b.z) x += dx;
    else if (Math.random() < 0.5) x += dx; else z += dz;
    // clamp to bounds
    x = Math.max(1, Math.min(S - 2, x));
    z = Math.max(1, Math.min(S - 2, z));
  }
  mark(b.x, b.z);

  // ── slope the river surface downward from a to b so cascading voxels
  // appear wherever the river drops across the terraced floor. Quantise
  // to 0.5-unit plateau levels so each plateau boundary yields a real
  // waterfall in buildVoxelTerrain step 4. Only ever LOWER heights — never
  // raise — so the river actually flows downstream toward b.
  if (heights && path.length > 1) {
    const hA = heights[a.x]?.[a.z] ?? 1;
    const hB = heights[b.x]?.[b.z] ?? 1;
    const hHi = Math.max(hA, hB);
    const hLo = Math.min(hA, hB);
    const span = path.length - 1;
    const steps = Math.max(1, Math.round(span / 7));  // ~7 tiles per fall
    for (let i = 0; i < path.length; i++) {
      const t = i / span;
      // quantise to one of `steps` plateaus; height falls in 0.5-unit drops
      const plateau = Math.round((1 - t) * steps) / steps;
      const slopeH = hLo + plateau * (hHi - hLo);
      heights[path[i].x][path[i].z] = Math.min(heights[path[i].x][path[i].z], slopeH);
    }
  }
  return water;
}

/**
 * Default material→color palette — a gray hewn-rock cavern.
 *
 * CONTRAST PASS: every floor tone was lifted ~25% (the dungeon's ambient is
 * deliberately low, so the palette has to carry the readability) and each
 * floor-50 room material was pushed onto its OWN hue so a room's identity is
 * legible from the floor alone at BG3 camera distance:
 *   bone   → warm ivory (brightest warm)     marble → cool blue-grey (brightest cool)
 *   sludge → green wet muck (darkest)        moss   → spore-lit violet-grey
 * Walls stay a full value-step below every floor tone so they read as
 * recessed rock instead of merging with the ground.
 */
export const DEFAULT_PALETTE: Record<string, number> = {
  // floors — neutral gray rock, slightly warmer in patches, never red/brown
  cave_floor: 0x8a8075,
  cave_stone: 0x94897a,
  gravel:     0x7a7468,
  stone:      0x7e8490,
  dirt:       0x6e5c4a,
  sand:       0xb0a078,
  grass:      0x5f8f3e,
  // floor 50 — sewer cellar: vivid spore-green fungal floors + pale cool
  // marble, warm honey-ivory nurseries/bone pits + the boss lair's wet green
  // muck. VIVID-COLOR PASS: hues are real and saturated so the lit render
  // keeps its color instead of washing out to gray (ACES tonemapping + cool
  // ambient light both eat saturation, so the palette has to over-deliver).
  moss:       0x558a3e,
  marble:     0x9fb8c8,
  bone:       0xc0a878,
  sludge:     0x4a7c3e,
  // walls — darker gray so they read as recessed rock from the lighter floor
  wall_dark:   0x48464e,
  wall_light:  0x5e5a62,
  wall_moss:   0x4a6a48,
};
/**
 * Default palette lookup. Walls are mapped to the darker "wall_*" tones
 * so they recede visually against the lighter floor.
 */
export const paletteLookup = (name: string): number => {
  if (name in DEFAULT_PALETTE) return DEFAULT_PALETTE[name];
  // wall-prefixed material names fall through to wall_dark
  if (name.startsWith('wall')) return DEFAULT_PALETTE.wall_dark;
  return 0x6a6a6d;
};
