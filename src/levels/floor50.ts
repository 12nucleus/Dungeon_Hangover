// ─────────────────────────────────────────────────────────────
// FLOOR 50 — THE SEWER CELLAR (hand-authored level).
//
// The bottom of everything. 25 authored rooms (see the bible:
// docs/dungeon_hangover_bible/floors/FLOOR_50_SEWER_CELLAR.md), fixed
// layout rasterized by buildAuthoredMap(); per-run variety (trap tiles,
// poison bottles, hidden treasures, roster jitter) is seeded by the run
// seed, never by the layout.
//
// All coordinates below are MAP-LOCAL; OFFSET is added to every tile so
// the 70×70 region sits inside the WORLD_SIZE=120 grid.
// ─────────────────────────────────────────────────────────────
import type { LevelDef, LevelStructures, PropPlacement, Rect } from './levelTypes';
import type { GridPos } from '../game/types';
import { WORLD_SIZE } from '../game/world';
import { buildTerrain } from './gen/dungeonGen';
import { buildAuthoredMap, validateAuthoredMap, type CorridorSpec, type RoomSpec } from './gen/authoredMap';
import { createFloor50Roster, type Floor50Spawns } from '../game/skills';
import { floor50Traps, floor50Destructibles, ROOM_NARRATION, floor50Interactables, floor50Hazards, floor50HiddenTreasures } from './floor50Content';
import { mulberry32 } from './gen/dungeonGen';

const S = WORLD_SIZE;
const OFFSET: GridPos = { x: 24, z: 24 };

// ── the 25 authored rooms (map-local top-left + size) ─────────
const ROOMS: RoomSpec[] = [
  { id: 'r1', name: "Bonfire Cell", x0: 18, z0: 35, w: 4, h: 4, floor: 'stone' },
  { id: 'r2', name: "Hermit's Cell", x0: 24, z0: 35, w: 3, h: 3, floor: 'stone' },
  { id: 'r3', name: 'Sewer Tunnel', x0: 8, z0: 36, w: 8, h: 2, floor: 'water_shallow' },
  { id: 'r4', name: 'Rat Nursery', x0: 8, z0: 44, w: 5, h: 5, floor: 'bone' },
  { id: 'r5', name: "Boss Rat's Lair", x0: 8, z0: 52, w: 6, h: 6, floor: 'bone' },
  { id: 'r6', name: 'Collapsed Wine Cellar', x0: 16, z0: 53, w: 7, h: 4, floor: 'stone' },
  { id: 'r7', name: 'Flooded Passage', x0: 25, z0: 53, w: 10, h: 2, floor: 'water_deep' },
  { id: 'r8', name: 'Pipe Junction', x0: 24, z0: 20, w: 4, h: 4, floor: 'stone' },
  { id: 'r9', name: 'Guarded Door', x0: 48, z0: 20, w: 3, h: 3, floor: 'stone' },
  { id: 'r10', name: "Guard's Antechamber", x0: 48, z0: 28, w: 4, h: 3, floor: 'dirt' },
  { id: 'r11', name: 'Upper Sewer', x0: 24, z0: 12, w: 6, h: 2, floor: 'stone' },
  { id: 'r12', name: 'Flooded Rat Den', x0: 24, z0: 4, w: 5, h: 5, floor: 'water_shallow' },
  { id: 'r13', name: 'Fungal Alcove', x0: 10, z0: 20, w: 3, h: 3, floor: 'fungal' },
  { id: 'r14', name: 'Pipe Maintenance', x0: 24, z0: 28, w: 3, h: 3, floor: 'stone' },
  { id: 'r15', name: 'Bone Pit', x0: 52, z0: 4, w: 6, h: 6, floor: 'bone' },
  { id: 'r16', name: 'Hidden Room', x0: 10, z0: 28, w: 3, h: 3, floor: 'stone' },
  { id: 'r17', name: 'Storage Vault', x0: 60, z0: 4, w: 5, h: 5, floor: 'stone' },
  { id: 'r18', name: 'Intersection', x0: 50, z0: 12, w: 5, h: 5, floor: 'stone' },
  { id: 'r19', name: 'Collapsed Tunnel', x0: 66, z0: 13, w: 4, h: 2, floor: 'dirt' },
  { id: 'r20', name: 'Old Well', x0: 66, z0: 20, w: 3, h: 3, floor: 'stone' },
  { id: 'r21', name: 'Goblin Barracks', x0: 60, z0: 28, w: 6, h: 4, floor: 'dirt' },
  { id: 'r22', name: 'Armory', x0: 60, z0: 36, w: 4, h: 4, floor: 'stone' },
  { id: 'r23', name: 'Flooded Deep', x0: 60, z0: 44, w: 6, h: 6, floor: 'water_deep' },
  { id: 'r24', name: 'Throne Antechamber', x0: 60, z0: 52, w: 5, h: 5, floor: 'marble' },
  { id: 'r25', name: 'Bath Chamber', x0: 56, z0: 60, w: 10, h: 8, floor: 'marble' },
];

// ── corridors (map-local polylines; width 2 unless noted) ─────
// 15→18 / 11→18 / 18→19 / 11→8 / 18→9 / 19→20: north cluster
// 13→8 / 8→9 / 9→20 / 13→16 / 8→14 / 9→10: mid cluster + gates
// 10→21 → 21→22 → 22→23 → 23→24 → 24→25: the long east spine
// 3→1 / 1→2 / 3→4 / 4→5 / 5→6 / 6→7 / 7→24: south cluster
// 11→12: the flooded rat den dead-end
// 1↔19: the collapsed-tunnel shortcut (runs down the west/south/east
//       edges of the 70×70 region so it can't shortcut past gates)
const CORRIDORS: CorridorSpec[] = [
  { pts: [{ x: 54, z: 10 }, { x: 54, z: 11 }], width: 2 },                    // 15→18
  { pts: [{ x: 30, z: 12 }, { x: 49, z: 12 }], width: 2 },                    // 11→18
  { pts: [{ x: 55, z: 13 }, { x: 65, z: 13 }], width: 2 },                    // 18→19
  { pts: [{ x: 26, z: 14 }, { x: 26, z: 19 }], width: 2 },                    // 11→8
  { pts: [{ x: 49, z: 17 }, { x: 49, z: 19 }], width: 2 },                    // 18→9
  { pts: [{ x: 67, z: 15 }, { x: 67, z: 19 }], width: 2 },                    // 19→20
  { pts: [{ x: 26, z: 9 }, { x: 26, z: 11 }], width: 2 },                     // 11→12 (flooded rat den)
  { pts: [{ x: 58, z: 6 }, { x: 59, z: 6 }], width: 1 },                      // 15→17 (vault tunnel — both tiles are the secret door)
  { pts: [{ x: 13, z: 21 }, { x: 23, z: 21 }], width: 2 },                    // 13→8
  { pts: [{ x: 28, z: 21 }, { x: 47, z: 21 }], width: 2 },                    // 8→9
  { pts: [{ x: 51, z: 21 }, { x: 65, z: 21 }], width: 2 },                    // 9→20
  { pts: [{ x: 11, z: 23 }, { x: 11, z: 27 }], width: 1 },                    // 13→16 (secret door)
  { pts: [{ x: 25, z: 24 }, { x: 25, z: 27 }], width: 1 },                    // 8→14 (pipe climb gate — single lane so the blocker seals it)
  { pts: [{ x: 49, z: 23 }, { x: 49, z: 27 }], width: 1 },                    // 9→10 (soap gate door — single lane)
  { pts: [{ x: 52, z: 29 }, { x: 59, z: 29 }], width: 2 },                    // 10→21
  { pts: [{ x: 62, z: 32 }, { x: 62, z: 35 }], width: 2 },                    // 21→22
  { pts: [{ x: 62, z: 40 }, { x: 62, z: 43 }], width: 2 },                    // 22→23
  { pts: [{ x: 62, z: 50 }, { x: 62, z: 51 }], width: 2 },                    // 23→24
  { pts: [{ x: 60, z: 57 }, { x: 60, z: 59 }], width: 1 },                    // 24→25 (Gribnab's door — single lane so the door seals it)
  { pts: [{ x: 16, z: 36 }, { x: 17, z: 36 }], width: 2 },                    // 3→1
  { pts: [{ x: 22, z: 36 }, { x: 23, z: 36 }], width: 2 },                    // 1→2
  { pts: [{ x: 10, z: 38 }, { x: 10, z: 43 }], width: 2 },                    // 3→4
  { pts: [{ x: 10, z: 49 }, { x: 10, z: 51 }], width: 2 },                    // 4→5
  { pts: [{ x: 14, z: 54 }, { x: 15, z: 54 }], width: 1 },                    // 5→6 (debris gate — single lane so the rubble seals it)
  { pts: [{ x: 23, z: 53 }, { x: 24, z: 53 }], width: 1 },                    // 6→7 (trapdoor — single lane)
  { pts: [{ x: 35, z: 53 }, { x: 59, z: 53 }], width: 2 },                    // 7→24
  // the shortcut: room 1 → down the WEST side (x 5..6, clear of rooms 4/5
  // which span x 8..13) → across the SOUTH edge (z 69, the only row clear of
  // room 25's z 60..67) → up the EAST side (x 70) → room 19's east edge.
  // Every segment keeps a ≥1-tile gap from rooms it must NOT connect to.
  { pts: [{ x: 20, z: 39 }, { x: 20, z: 40 }], width: 1 },                    // debris tiles
  { pts: [{ x: 5, z: 41 }, { x: 20, z: 41 }], width: 2 },
  { pts: [{ x: 5, z: 43 }, { x: 5, z: 68 }], width: 2 },
  { pts: [{ x: 7, z: 69 }, { x: 69, z: 69 }], width: 1 },
  { pts: [{ x: 70, z: 14 }, { x: 70, z: 69 }], width: 1 },
];

const map = buildAuthoredMap(S, OFFSET, ROOMS, CORRIDORS);
validateAuthoredMap(map, ROOMS);

const O = (p: GridPos): GridPos => ({ x: p.x + OFFSET.x, z: p.z + OFFSET.z });
const OX = (x: number, z: number): GridPos => ({ x: x + OFFSET.x, z: z + OFFSET.z });

// ── key structural tiles (map-local → world) ─────────────────
const partySpawn = OX(19, 36);
const checkpoint = OX(20, 37);
const bossDoor = OX(60, 58);
const bossBath = OX(60, 64);
const goldenChest = OX(64, 66);
const secretChest = OX(62, 5);
const hermitChamber = OX(25, 36);
const exitStairs = OX(60, 67);

const roomList = ROOMS.map((r) => ({ id: r.id, name: r.name, rect: map.rooms[r.id] }));
const roomRectOf = (id: string): Rect | undefined => map.rooms[id];

const structures: LevelStructures = {
  partySpawn,
  checkpoint,
  bossDoor,
  bossBath,
  bossRoom: roomRectOf('r25')!,
  goldenChest,
  secretLever: secretChest, // lever puzzle not reproduced — placeholder for shape
  secretRubble: [],
  secretChest,
  hermitChamber,
  hiddenTreasures: [],
  mezzanines: [],
  stairs: [],
  arenaRect: roomRectOf('r5'),
  exitStairs,
  rooms: roomList,
  npcs: [
    { npcId: 'hermit', pos: O({ x: 25, z: 36 }) },
    { npcId: 'other_hermit', pos: O({ x: 11, z: 29 }) },
    { npcId: 'scrag', pos: O({ x: 49, z: 22 }) },
  ],
  doors: [
    { id: 'soap_gate', pos: O({ x: 49, z: 25 }), axis: 'z', openedByFlag: 'soap_gate_open' },
    { id: 'trapdoor67', pos: O({ x: 23, z: 53 }), axis: 'x', openedByFlag: 'trapdoor_open' },
  ],
  blockers: [
    { id: 'door16', tiles: [O({ x: 11, z: 24 }), O({ x: 11, z: 25 })], kind: 'secretDoor', openedByFlag: 'mushroom_door' },
    { id: 'door17', tiles: [O({ x: 58, z: 6 }), O({ x: 59, z: 6 })], kind: 'secretDoor', openedByFlag: 'vault_tunnel' },
    { id: 'debris56', tiles: [O({ x: 14, z: 54 }), O({ x: 15, z: 54 })], kind: 'rubble', openedByFlag: 'debris_56' },
    { id: 'debris19', tiles: [O({ x: 20, z: 39 }), O({ x: 20, z: 40 })], kind: 'rubble', openedByFlag: 'shortcut_open' },
    { id: 'pipeclimb', tiles: [O({ x: 25, z: 24 }), O({ x: 25, z: 25 })], kind: 'rubble', openedByFlag: 'pipe_climbed' },
  ],
  bossDoorOpenFlag: 'gribnab_door_open',
};

// ── terrain: flat sewer floors, lower ceilings than the Warren ─
const terrain = buildTerrain(map.walk, {
  seed: 20260802,
  floorBase: 1,
  floorSteps: 0,                       // flat — sewers are not terraced
  wallHeight: [2.6, 4.0],
  wallScale: 0.07,
  floorPalette: ['cave_floor', 'cave_stone', 'gravel'],
  wallPalette: ['cave_stone', 'cave_floor'],
  flatten: [
    partySpawn, checkpoint, bossDoor, bossBath, goldenChest, secretChest, hermitChamber, exitStairs,
    ...(structures.doors ?? []).map((d) => d.pos),
    ...(structures.blockers ?? []).flatMap((b) => b.tiles),
    ...(structures.npcs ?? []).map((n) => n.pos),
  ],
});
// post-process overlay: authored floor materials + water
const floorMats = terrain.floorMats;
for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
  if (map.walk[x][z]) floorMats[x][z] = map.floorMats[x][z];
}
const water = map.water;

// ── reserved tiles: nothing blocking spawns/doors/chests/NPCs ──
const reserved = new Set<string>();
const reserve = (p: GridPos) => reserved.add(`${p.x},${p.z}`);
[partySpawn, checkpoint, bossDoor, bossBath, goldenChest, secretChest, hermitChamber, exitStairs].forEach(reserve);
(structures.doors ?? []).forEach((d) => reserve(d.pos));
(structures.blockers ?? []).forEach((b) => b.tiles.forEach(reserve));
(structures.npcs ?? []).forEach((n) => reserve(n.pos));

// ── props ─────────────────────────────────────────────────────
const rng = mulberry32(20260802);
const props: PropPlacement[] = [];
const on = (x: number, z: number) => !!map.walk[x]?.[z];
// explicit props (bonfire, braziers…) always place on walkable tiles;
// the reserved set only guards the GENERIC decor loops below
const put = (kind: PropPlacement['kind'], x: number, z: number, s = rng()) => {
  if (!on(x, z)) return;
  props.push({ kind, x, z, seed: s });
};

// torches on corridor walls every ~6 tiles (skip water rooms)
const corridorTiles: GridPos[] = [];
for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
  if (!map.walk[x][z] || map.water[x][z]) continue;
  if (map.roomOf(x, z) !== null) continue;
  corridorTiles.push({ x, z });
}
// torches BLOCK their tile — only hang one where removing the tile still
// leaves every pair of its walkable neighbours connected, counting the
// torches already hung (two individually-safe torches can cut a corridor
// together, so the check is cumulative)
const torchPlaced = new Set<string>();
const torchSafe = (x: number, z: number): boolean => {
  const nbs: GridPos[] = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (on(x + dx, z + dz)) nbs.push({ x: x + dx, z: z + dz });
  if (nbs.length < 2) return false;
  const connected = (a: GridPos, b: GridPos): boolean => {
    const seen = new Set([`${a.x},${a.z}`]);
    const q: GridPos[] = [{ ...a }];
    while (q.length) {
      const c = q.shift()!;
      if (c.x === b.x && c.z === b.z) return true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, nz = c.z + dz;
        if (nx === x && nz === z) continue;               // the proposed torch tile
        if (torchPlaced.has(`${nx},${nz}`)) continue;     // an already-hung torch
        if (!on(nx, nz)) continue;
        const k = `${nx},${nz}`;
        if (seen.has(k)) continue;
        seen.add(k);
        q.push({ x: nx, z: nz });
      }
    }
    return false;
  };
  for (let i = 0; i < nbs.length; i++) for (let j = i + 1; j < nbs.length; j++) {
    if (!connected(nbs[i], nbs[j])) return false;
  }
  return true;
};

let torchN = 0;
for (const t of corridorTiles) {
  if (reserved.has(`${t.x},${t.z}`)) { torchN++; continue; }
  if (!torchSafe(t.x, t.z)) { torchN++; continue; }
  if (torchN % 6 === 0 && rng() < 0.7) {
    put('torch', t.x, t.z);
    torchPlaced.add(`${t.x},${t.z}`);
  }
  torchN++;
}

put('bonfire', checkpoint.x, checkpoint.z, 0.5);
// room 1 braziers (bright corner lights before the bonfire is lit)
put('brazier', 19, 35, 0.5);
put('brazier', 21, 38, 0.5);
// braziers flanking Gribnab's door
put('brazier', 59, 57, 0.5);
put('brazier', 59, 59, 0.5);
// room 24 braziers
put('brazier', 60, 52, 0.5);
put('brazier', 64, 56, 0.5);
// mushrooms: rooms 13 + 12
put('mushroom', 10, 20, 0.3);
put('mushroom', 12, 22, 0.7);
put('mushroom', 11, 21, 0.5);
put('mushroom', 24, 5, 0.4);
put('mushroom', 28, 7, 0.6);
// bones: 4 / 5 / 15
put('bones', 8, 44, 0.2); put('bones', 12, 48, 0.8);
put('bones', 9, 53, 0.3); put('bones', 13, 56, 0.9); put('bones', 8, 57, 0.5);
put('bones', 52, 4, 0.4); put('bones', 57, 9, 0.6); put('bones', 54, 6, 0.2);
// webpiles: corridor corners of 3 / 11
put('webpile', 9, 36, 0.5); put('webpile', 15, 37, 0.9);
put('webpile', 24, 12, 0.4); put('webpile', 29, 13, 0.8);
// rubble decor: 6 / 19
put('rubble', 16, 53, 0.3); put('rubble', 22, 56, 0.7);
put('rubble', 66, 13, 0.5); put('rubble', 69, 14, 0.9);
// crystal in the hidden room (16)
put('crystal_green', 11, 28, 0.4);
put('crystal_green', 10, 30, 0.6);
// stalagmites sparse in water rooms
put('stalagmite', 12, 36, 0.5);
put('stalagmite', 28, 53, 0.7);
put('stalagmite', 32, 54, 0.3);
put('stalagmite', 25, 4, 0.6);
put('stalagmite', 27, 8, 0.2);
put('stalagmite', 63, 44, 0.5);
put('stalagmite', 65, 49, 0.8);
// stalactites on non-walk tiles bordering corridors
for (const t of corridorTiles) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = t.x + dx, nz = t.z + dz;
    if (on(nx, nz) || nx < 1 || nz < 1 || nx >= S - 1 || nz >= S - 1) continue;
    if (rng() < 0.12) put('stalactite', nx, nz);
  }
}

// ── spawns for the roster ─────────────────────────────────────
const FLOOR50_SPAWNS: Floor50Spawns = {
  party: partySpawn,
  rooms: {
    r3: map.rooms.r3, r4: map.rooms.r4, r5: map.rooms.r5, r6: map.rooms.r6, r7: map.rooms.r7,
    r8: map.rooms.r8, r11: map.rooms.r11, r12: map.rooms.r12, r15: map.rooms.r15,
    r20: map.rooms.r20, r21: map.rooms.r21, r22: map.rooms.r22, r23: map.rooms.r23,
    r24: map.rooms.r24, r25: map.rooms.r25,
  },
  bossRatLair: map.rooms.r5,
  bossBathTile: bossBath,
};

/**
 * Debug surface for scripts/preview_floor50.mjs — the raw authored
 * rooms/corridors/map/structures so the layout sanity tests can apply
 * blockers/door states to a copy of the walk grid.
 */
export const F50_DEBUG = { ROOMS, CORRIDORS, map, structures, OFFSET, reserved, FLOOR50_SPAWNS };

export const floor50Level: LevelDef = {
  name: 'The Sewer Cellar',
  icon: '🐀',
  description: "Floor 50. The bottom of everything. Sewers, mold, vermin, forgotten cellars. Somewhere down here a goblin king bathes, and a rat owes an old man a finger.",
  groundMats: ['cave_floor', 'cave_stone', 'cave_floor', 'gravel'],
  fillMats: ['cave_floor', 'cave_stone', 'cave_stone', 'cave_floor'],
  arena: { x0: OFFSET.x, z0: OFFSET.z, x1: OFFSET.x + 69, z1: OFFSET.z + 69 },
  spawn: { party: [partySpawn], enemies: [] },
  props,
  ambient: 0.25,
  sun: 0.0,
  fill: 0.15,
  fogColor: 0x0a0f0a,
  fogDensity: 0.045,
  waterColor: 0x2a4a2a,
  waterY: -3,
  layout: {
    walk: map.walk,
    heights: terrain.heights,
    floorMats,
    wallMats: terrain.wallMats,
    wallH: terrain.wallH,
    water,
  },
  structures,
  traps: (seed) => floor50Traps(seed, map.rooms, map.walk, reserved),
  destructibles: (() => floor50Destructibles(20260802, map.rooms, map.walk, reserved))(),
  makeInteractables: (seed) => floor50Interactables(seed, map.rooms),
  hazards: floor50Hazards(map.rooms),
  makeHiddenTreasures: (seed) => floor50HiddenTreasures(seed, map.rooms, map.walk, reserved),
  roomOf: (x, z) => map.roomOf(x, z),
  roomNarration: ROOM_NARRATION,
  makeRoster: (seed) => createFloor50Roster(FLOOR50_SPAWNS, seed ?? 20260802),
  roster: createFloor50Roster(FLOOR50_SPAWNS, 20260802),
};
