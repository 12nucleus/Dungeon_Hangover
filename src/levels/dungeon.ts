// ─────────────────────────────────────────────────────────────
// THE WARLORD'S WARREN — now a LARGE procedurally-carved cave/maze
// dungeon: ~50 explorable chambers plus one sealed final boss room,
// on a 90x90 grid (up from the old hand-authored 46x46 / 7-room map).
//
// Layout is produced by generateDungeon() (dungeonGen.ts): organic
// blob rooms + networked winding tunnels + dead-end spurs, a sealed
// boss chamber behind a single door, and several rooms promoted to
// raised mezzanine shelves (their ramps are generated automatically
// by buildTerrain's relaxation pass). Monster/prop placement below
// is done generically over whichever rooms the generator produced,
// instead of hand-picking named rects — that's what makes 50 rooms
// tractable without hand-authoring 50 rects.
//
// Everything is deterministic (seeded) so the structures/spawns
// computed here line up exactly with what the world renders.
//
// SIMPLIFICATION vs the old hand-authored file: the old "secret room
// sealed behind rubble + lever" puzzle is not reproduced procedurally
// here — the designated secret room is a normal (unsealed) chamber.
// The `secretLever` / `secretRubble` fields are still populated with
// harmless placeholder values so LevelStructures keeps the same
// shape; wire the rubble/lever puzzle back in by hand on top of
// `secretIdx` below if you want it back.
// ─────────────────────────────────────────────────────────────
import type { LevelDef, LevelStructures, PropPlacement, Rect } from './levelTypes';
import type { GridPos } from '../game/types';
import { WORLD_SIZE } from '../game/world';
import { createDungeonRoster, type DungeonSpawns } from '../game/skills';
import { generateDungeon, mulberry32, type GeneratedDungeon } from './gen/dungeonGen';
import { carveRiver } from '../game/voxelTerrain';
import type { Grid } from '../game/voxelTerrain';

// NOTE: WORLD_SIZE must match the `size` passed to generateDungeon below —
// bump the shared constant in world.ts from 46 → 90 (see integration notes).
const S = WORLD_SIZE;

function weld(walk: boolean[][], p: GridPos) {
  if (p.x < 1 || p.z < 1 || p.x >= S - 1 || p.z >= S - 1) return;
  walk[p.x][p.z] = true;
  const on = (x: number, z: number) => !!walk[x]?.[z];
  if (!on(p.x + 1, p.z) && !on(p.x - 1, p.z) && !on(p.x, p.z + 1) && !on(p.x, p.z - 1)) {
    // isolated — punch one neighbour open so it's reachable
    walk[p.x + 1][p.z] = true;
  }
}

function insideRoom(r: Rect, ox: number, oz: number): GridPos {
  const cx = (r.x0 + r.x1) >> 1, cz = (r.z0 + r.z1) >> 1;
  return {
    x: Math.max(r.x0, Math.min(r.x1, cx + ox)),
    z: Math.max(r.z0, Math.min(r.z1, cz + oz)),
  };
}

function buildDungeon(seed: number) {
  const built: GeneratedDungeon = generateDungeon({
    seed,
    size: S,
    rooms: 25,                       // fewer, bigger rooms — well-separated
    roomRadius: [4, 8],               // larger rooms
    bore: [0.5, 0.7],                 // narrow carved tunnels, not blob-corridors
    loops: 3,                         // minimal loops → rooms feel isolated, connected by tunnels
    spurs: 12,                        // dead-end pockets for hidden treasure / collapsed rubble
    roughness: 0.04,                  // very low → clean edges, no voxel litter
    sealFinalRoom: true,              // → boss chamber, single door, sealed last
    finalRoomRadius: [9, 12],
    mezzanines: 4,                    // 4 rooms get a raised shelf + auto-graded ramp
    mezzanineSteps: 1,
    floorPalette: ['cave_floor', 'cave_stone', 'gravel'],
    wallPalette: ['cave_stone', 'cave_floor'],
    wallHeight: [3.6, 5.5],
  });

  const { walk, rooms, centers, bossRoomIndex, bossDoor, bossConnect, mezzanineRoomIndices } = built;
  if (bossRoomIndex === undefined || !bossDoor || !bossConnect) {
    throw new Error('dungeon generation failed to seal a boss room — check finalRoomRadius / grid size');
  }

  const partySpawn: GridPos = centers[0];
  const checkpoint: GridPos = insideRoom(rooms[0], 2, 2);
  weld(walk, checkpoint);
  // lit braziers in the opposite corners of the starter room so it's bright
  // before the player lights the bonfire checkpoint (adds light to the room).
  const starterBrazier: GridPos = insideRoom(rooms[0], -3, -3);
  weld(walk, starterBrazier);
  const starterBrazier2: GridPos = insideRoom(rooms[0], 3, 3);   // opposite corner
  weld(walk, starterBrazier2);

  const bossRect = rooms[bossRoomIndex];
  const bossBath = insideRoom(bossRect, 0, 0);
  const goldenChest = insideRoom(bossRect, 4, 4);
  const bossGuards: GridPos[] = [insideRoom(bossRect, -3, -2), insideRoom(bossRect, 3, -2)];
  const bossSpawn = insideRoom(bossRect, 0, -1);
  [bossBath, goldenChest, ...bossGuards, bossSpawn].forEach((p) => weld(walk, p));

  // ── distribute the remaining ~48 rooms across encounter categories ──
  const excluded = new Set<number>([0, bossRoomIndex]);
  const pool = centers.map((_, i) => i).filter((i) => !excluded.has(i));
  const rngPick = mulberry32(seed ^ 0xabc123);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rngPick() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const hermitIdx = pool.pop()!;
  const secretIdx = pool.pop()!;
  const bucket = (n: number) => pool.splice(0, n);
  const perBucket = Math.max(1, Math.floor((pool.length - 4) / 4)); // reserve a few for `hub` (leads to the key)
  const ratRooms = bucket(perBucket);
  const batRooms = bucket(perBucket);
  const skeletonRooms = bucket(perBucket);
  const rabidRooms = bucket(perBucket);
  const hubRooms = pool.splice(0); // whatever's left — the run-up to the boss door / iron key

  const spotsFor = (idx: number[], perRoom: number): GridPos[] => {
    const out: GridPos[] = [];
    for (const i of idx) {
      out.push(insideRoom(rooms[i], -1, 0));
      if (perRoom > 1) out.push(insideRoom(rooms[i], 1, 1));
      if (perRoom > 2) out.push(insideRoom(rooms[i], 0, -1));
    }
    out.forEach((p) => weld(walk, p));
    return out;
  };

  const rats = spotsFor(ratRooms, 2);
  const bats = spotsFor(batRooms, 2);
  const skeletons = spotsFor(skeletonRooms, 2);
  const rabid = spotsFor(rabidRooms, 2);
  const hub = spotsFor(hubRooms, 2); // last position of the last hub room carries the iron key in your existing pickup logic

  const hermitChamber = centers[hermitIdx];
  const baronGnaw = insideRoom(rooms[hermitIdx], 2, -1);
  weld(walk, baronGnaw);

  const secretChest = insideRoom(rooms[secretIdx], 0, 1);
  const secretSpawn = insideRoom(rooms[secretIdx], -1, -1);
  const secretLever = insideRoom(rooms[secretIdx], 2, 0); // placeholder — no rubble seal in the procedural version
  [secretChest, secretSpawn, secretLever].forEach((p) => weld(walk, p));

  const structures: LevelStructures = {
    partySpawn,
    checkpoint,
    bossDoor,
    bossBath,
    bossRoom: { x0: bossRect.x0, z0: bossRect.z0, x1: bossRect.x1, z1: bossRect.z1 },
    goldenChest,
    secretLever,
    secretRubble: [],
    secretChest,
    hermitChamber,
    mezzanines: mezzanineRoomIndices.map((i) => rooms[i]),
    stairs: [], // auto-graded by buildTerrain's relaxation pass — see dungeonGen.ts
  };

  const spawns: DungeonSpawns = {
    party: partySpawn,
    rats, bats, skeletons, hub, rabid,
    bossGuards,
    boss: bossSpawn,
    secret: secretSpawn,
    baronGnaw,
  };

  // ── reserved tiles (don't drop blocking props on top of these) ──
  const reserved = new Set<string>([
    `${partySpawn.x},${partySpawn.z}`, `${checkpoint.x},${checkpoint.z}`, `${starterBrazier.x},${starterBrazier.z}`, `${starterBrazier2.x},${starterBrazier2.z}`,
    `${bossDoor.x},${bossDoor.z}`,
    `${secretLever.x},${secretLever.z}`, `${bossBath.x},${bossBath.z}`, `${goldenChest.x},${goldenChest.z}`,
    `${secretChest.x},${secretChest.z}`,
    ...[bossSpawn, secretSpawn, baronGnaw, ...rats, ...bats, ...skeletons, ...hub, ...rabid, ...bossGuards]
      .map((p) => `${p.x},${p.z}`),
  ]);

  // ── atmospheric props ──
  const rng = mulberry32(seed);
  const props: PropPlacement[] = [];
  const on = (x: number, z: number) => !!walk[x]?.[z];
  const put = (kind: PropPlacement['kind'], x: number, z: number, s = rng()) => {
    if (!on(x, z)) return; props.push({ kind, x, z, seed: s });
  };
  const roomTorch = (r: Rect) => {
    for (const [ox, oz] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [1, 3], [-1, -1], [-2, 1]]) {
      const cx = r.x0 + ox, cz = r.z0 + oz;
      if (on(cx, cz) && !reserved.has(`${cx},${cz}`)) { put('torch', cx, cz); return; }
    }
  };
  rooms.forEach(roomTorch);
  put('bonfire', checkpoint.x, checkpoint.z, 0.5);
  put('brazier', starterBrazier.x, starterBrazier.z, 0.5);  // first-room corner light
  put('brazier', starterBrazier2.x, starterBrazier2.z, 0.5); // opposite corner light
  put('brazier', bossDoor.x - 1, bossDoor.z - 1, 0.5);
  put('brazier', bossDoor.x - 1, bossDoor.z + 1, 0.5);
  put('crystal_blue', centers[secretIdx].x, centers[secretIdx].z, 0.4);
  put('crystal_green', centers[hermitIdx].x + 1, centers[hermitIdx].z, 0.6);
  mezzanineRoomIndices.slice(0, 3).forEach((i) => put('crystal', centers[i].x, centers[i].z, 0.5));

  // ── dead-ends → hidden treasure / collapsed rubble ──
  const deadends: GridPos[] = [];
  for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
    if (!walk[x][z]) continue;
    let n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (on(x + dx, z + dz)) n++;
    if (n === 1) deadends.push({ x, z });
  }
  const eligibleDead = deadends.filter((d) => !reserved.has(`${d.x},${d.z}`));
  const shuffledDead = eligibleDead.sort(() => rng() - 0.5);
  const hiddenTreasures = shuffledDead.slice(0, Math.min(12, shuffledDead.length)); // scaled up for a 50-room map
  const hiddenSet = new Set(hiddenTreasures.map((p) => `${p.x},${p.z}`));
  const collapsedDeadEnds = shuffledDead
    .filter((d) => !hiddenSet.has(`${d.x},${d.z}`))
    .slice(0, Math.min(10, shuffledDead.length - hiddenTreasures.length));
  for (const d of collapsedDeadEnds) { reserved.add(`${d.x},${d.z}`); put('rubble', d.x, d.z); }
  structures.hiddenTreasures = hiddenTreasures;
  structures.collapsedDeadEnds = collapsedDeadEnds;

  const decor: PropPlacement['kind'][] = ['bones', 'webpile', 'mushroom', 'rubble', 'stalagmite'];
  for (const d of deadends) {
    if (reserved.has(`${d.x},${d.z}`)) continue;
    if (rng() < 0.55) put(decor[Math.floor(rng() * decor.length)], d.x, d.z);
  }
  for (let i = 0; i < 90; i++) { // scaled up from 40 for the bigger map
    const x = 1 + Math.floor(rng() * (S - 2)), z = 1 + Math.floor(rng() * (S - 2));
    if (!walk[x][z] || reserved.has(`${x},${z}`)) continue;
    if (rng() < 0.5) put(rng() < 0.5 ? 'mushroom' : 'bones', x, z);
  }
  for (let i = 0; i < 40; i++) { // stalactites — scaled up from 18
    const x = 2 + Math.floor(rng() * (S - 4)), z = 2 + Math.floor(rng() * (S - 4));
    if (walk[x][z]) continue;
    if (on(x + 1, z) || on(x - 1, z) || on(x, z + 1) || on(x, z - 1)) put('stalactite', x, z);
  }

  // ── underground river(s): carve water along two ends of the cave so
  // the dwarf (player) sees waterfalls where the river drops from high
  // mezzanine shelves down to the cavern floor. We pick two far-apart
  // walkable tiles; carveRiver wanders between them and mutates floor
  // heights so downstream drops produce cascades.
  const walkableTiles: GridPos[] = [];
  for (let x = 2; x < S - 2; x++) for (let z = 2; z < S - 2; z++) if (walk[x][z]) walkableTiles.push({ x, z });
  let water: Grid | null = null;
  if (walkableTiles.length > 1) {
    // sort by x so the river runs roughly across the map horizontally
    walkableTiles.sort((a, b) => a.x - b.x);
    const a = walkableTiles[Math.floor(walkableTiles.length * 0.10)];
    const b = walkableTiles[Math.floor(walkableTiles.length * 0.90)];
    water = carveRiver(walk, built.heights, a, b, 1);
  }

  return { walk, structures, spawns, props, heights: built.heights, floorMats: built.floorMats, wallMats: built.wallMats, wallH: built.wallH, water };
}

// build once — deterministic so renderer + logic agree
const DUNGEON_SEED = 20260420;
const built = buildDungeon(DUNGEON_SEED);

export const dungeonLevel: LevelDef = {
  name: "The Warlord's Warren",
  icon: '🗝️',
  description: 'A sprawling warren of caves, fifty chambers deep. Somewhere in the dark a tyrant bathes, and a golden key waits behind an iron door.',
  groundMats: ['cave_floor', 'cave_stone', 'cave_floor', 'gravel'],
  fillMats: ['cave_floor', 'cave_stone', 'cave_stone', 'cave_floor'],
  arena: { x0: 1, z0: 1, x1: S - 2, z1: S - 2 },
  spawn: {
    party: [built.structures.partySpawn],
    enemies: built.spawns.rats.concat(
      built.spawns.bats, built.spawns.skeletons, built.spawns.hub,
      built.spawns.rabid, built.spawns.bossGuards, [built.spawns.boss],
      built.spawns.secret ? [built.spawns.secret] : [],
    ),
  },
  props: built.props,
  ambient: 0.16,
  sun: 0.0,
  fill: 0.12,
  fogColor: 0x08080e,
  fogDensity: 0.05,
  waterColor: 0x2a6f8f,
  waterY: -3,
  layout: {
    walk: built.walk,
    heights: built.heights,
    floorMats: built.floorMats,
    wallMats: built.wallMats,
    wallH: built.wallH,
    ...(built.water ? { water: built.water } : {}),
  },
  structures: built.structures,
  makeRoster: () => createDungeonRoster(built.spawns),
  roster: createDungeonRoster(built.spawns),
};
