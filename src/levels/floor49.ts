// ─────────────────────────────────────────────────────────────
// FLOOR 49 — THE FUNGAL GROTTO (hand-authored level).
//
// One floor up from the sewer cellar: giant bioluminescent mushrooms,
// spore fields, underground pools and the Spore Mother's throne.
// 18 authored rooms (see the bible:
// docs/dungeon_hangover_bible/floors/FLOOR_49_FUNGAL_GROTTO.md),
// fixed layout rasterized by buildAuthoredMap(); per-run variety
// (trap tiles, hidden treasures, roster jitter) is seeded.
//
// Map (map-local, z grows south):
//   north row:  r15 graves · r14 mimic · r7 throne · r13 nursery
//               r12 picnic (just south of r15)
//   middle row: r5 circle · r6 grotto · r8 pools · r16 echo
//               r11 rot tree · r4 hermit pool
//   south row:  r3 vine · r10 farm · r2 field · r1 entry · r9 flood
//               r17 highway · r18 sleeping giant (below r6/r1/r9)
//
// All coordinates below are MAP-LOCAL; OFFSET is added to every tile
// so the ~52×28 region sits inside the WORLD_SIZE=250 grid. SCALE = 2
// doubles every room/corridor for the same grandeur as floor 50.
//
// EYE CANDY: the grotto is bioluminescent — the terrain uses the mossy
// 'fungal' floor mats, the props are glowing mushrooms of three hues
// (blue/green/purple) with real colored point lights + drifting spore
// particles, giant landmark mushrooms, hanging vines, a waterfall and
// the Spore Mother's throne. No torches in the deep rooms — the
// mushrooms are the light.
// ─────────────────────────────────────────────────────────────
import type { LevelDef, LevelStructures, PropKind, PropPlacement } from './levelTypes';
import type { GridPos } from '../game/types';import { WORLD_SIZE } from '../game/world';
import { buildTerrain } from './gen/dungeonGen';
import { buildAuthoredMap, validateAuthoredMap, type CorridorSpec, type RoomSpec } from './gen/authoredMap';
import { createFloor49Roster, type Floor49Spawns } from '../game/skills';
import { floor49Traps, floor49Destructibles, ROOM_NARRATION, floor49Interactables, floor49Hazards, floor49HiddenTreasures } from './floor49Content';
import { mulberry32 } from './gen/dungeonGen';

const S = WORLD_SIZE;
const OFFSET: GridPos = { x: 24, z: 24 };

/** grandeur scale — every authored dimension stretches by this factor */
const SCALE = 2.0;
const sc = (n: number) => Math.round(n * SCALE);

// ── the 18 authored rooms (map-local top-left + size, UNSCALED) ──
//   r13 ──────── r7 ──── r14 ──── r15       (nursery · throne · mimic · graves)
//                                              r12 (picnic, below r15)
//   r16 ── r8 ── r6 ── r5 ── r12/r11/r4     (echo · pools · grotto · circle · west)
//   r3 ── r10 ── r2 ── r1 ── r9             (vine · farm · field · entry · flood)
//                 r17 ── r18                (highway · sleeping giant)
const ROOM_SPECS: RoomSpec[] = [
  { id: 'r1', name: 'Entry Hall', x0: 20, z0: 20, w: 4, h: 4, floor: 'fungal' },
  { id: 'r2', name: 'Spore Field', x0: 12, z0: 20, w: 5, h: 5, floor: 'fungal' },
  { id: 'r3', name: 'Vine Tunnel', x0: 2, z0: 20, w: 2, h: 8, floor: 'fungal' },
  { id: 'r4', name: 'Hermit Pool', x0: 12, z0: 12, w: 4, h: 4, floor: 'water_deep' },
  { id: 'r5', name: 'Mushroom Circle', x0: 20, z0: 8, w: 5, h: 5, floor: 'fungal' },
  { id: 'r6', name: 'Central Grotto', x0: 26, z0: 8, w: 8, h: 8, floor: 'fungal' },
  { id: 'r7', name: 'Spore Throne', x0: 28, z0: 0, w: 6, h: 6, floor: 'sludge' },
  { id: 'r8', name: 'Deep Pools', x0: 38, z0: 8, w: 5, h: 5, floor: 'water_shallow' },
  { id: 'r9', name: 'Flooded Cave', x0: 34, z0: 20, w: 5, h: 4, floor: 'water_deep' },
  // ── the expansion ──
  { id: 'r10', name: 'Spore Farm', x0: 6, z0: 21, w: 5, h: 5, floor: 'fungal' },
  { id: 'r11', name: 'The Rotting Tree', x0: 2, z0: 13, w: 4, h: 5, floor: 'fungal' },
  { id: 'r12', name: 'The Picnic', x0: 2, z0: 6, w: 5, h: 5, floor: 'fungal' },
  { id: 'r13', name: 'Spore Nursery', x0: 36, z0: 0, w: 6, h: 6, floor: 'fungal' },
  { id: 'r14', name: 'The Mimic Den', x0: 20, z0: 0, w: 5, h: 5, floor: 'fungal' },
  { id: 'r15', name: 'Spore-Grounds', x0: 10, z0: 0, w: 5, h: 6, floor: 'fungal' },
  { id: 'r16', name: 'Echo Chamber', x0: 46, z0: 8, w: 5, h: 5, floor: 'fungal' },
  { id: 'r17', name: 'Mycelial Highway', x0: 27, z0: 17, w: 6, h: 3, floor: 'fungal' },
  { id: 'r18', name: 'The Sleeping Giant', x0: 27, z0: 21, w: 6, h: 4, floor: 'fungal' },
];

// ── corridors (map-local polylines, UNSCALED; width 2) ──
const CORRIDOR_SPECS: CorridorSpec[] = [
  { pts: [{ x: 20, z: 22 }, { x: 12, z: 22 }], width: 2 },            // 1→2
  { pts: [{ x: 12, z: 24 }, { x: 4, z: 24 }], width: 2 },             // 2→3
  { pts: [{ x: 14, z: 20 }, { x: 14, z: 16 }], width: 2 },            // 2→4 (down to the hermit pool)
  { pts: [{ x: 24, z: 22 }, { x: 34, z: 22 }], width: 2 },            // 1→9
  { pts: [{ x: 24, z: 20 }, { x: 24, z: 16 }, { x: 26, z: 16 }], width: 2 }, // 1→6 (the grotto entrance)
  { pts: [{ x: 26, z: 12 }, { x: 25, z: 12 }], width: 2 },            // 6→5 (short hop to the circle)
  { pts: [{ x: 30, z: 8 }, { x: 30, z: 6 }], width: 2 },              // 6→7 (up to the throne)
  { pts: [{ x: 34, z: 12 }, { x: 38, z: 12 }], width: 2 },            // 6→8 (across the deep pools)
  { pts: [{ x: 40, z: 20 }, { x: 40, z: 13 }], width: 2 },            // 9→8 (the pool shortcut)
  // ── the expansion ──
  { pts: [{ x: 12, z: 23 }, { x: 6, z: 23 }], width: 2 },             // 2→10 (the farm)
  { pts: [{ x: 6, z: 21 }, { x: 6, z: 18 }], width: 2 },              // 10→11 (down to the rot tree)
  { pts: [{ x: 4, z: 13 }, { x: 4, z: 11 }], width: 2 },              // 11→12 (up to the picnic)
  { pts: [{ x: 6, z: 15 }, { x: 12, z: 15 }], width: 2 },             // 11→4 (the hermit's back door)
  { pts: [{ x: 14, z: 12 }, { x: 14, z: 6 }], width: 2 },             // 4→15 (up to the graves)
  { pts: [{ x: 15, z: 3 }, { x: 19, z: 3 }, { x: 19, z: 8 }, { x: 20, z: 8 }], width: 2 }, // 15→5 (graves to circle)
  { pts: [{ x: 22, z: 8 }, { x: 22, z: 5 }], width: 2 },              // 5→14 (up to the mimic den)
  { pts: [{ x: 40, z: 8 }, { x: 40, z: 6 }], width: 2 },              // 8→13 (up to the nursery)
  { pts: [{ x: 43, z: 10 }, { x: 46, z: 10 }], width: 2 },            // 8→16 (east to the echo chamber)
  { pts: [{ x: 30, z: 16 }, { x: 30, z: 17 }], width: 2 },            // 6→17 (down to the highway)
  { pts: [{ x: 30, z: 20 }, { x: 30, z: 21 }], width: 2 },            // 17→18 (down to the giant)
  { pts: [{ x: 33, z: 23 }, { x: 34, z: 23 }], width: 2 },            // 18→9 (the flood shortcut)
  { pts: [{ x: 24, z: 23 }, { x: 27, z: 23 }], width: 2 },            // 1→18 (the south loop)
];

// ── grandeur pass: scale every authored room/corridor ×2 (floor 50 pattern) ──
const ROOMS: RoomSpec[] = ROOM_SPECS.map((r) => ({
  ...r,
  x0: sc(r.x0), z0: sc(r.z0),
  w: Math.max(4, sc(r.w)), h: Math.max(3, sc(r.h)),
}));
const SCALED = (c: CorridorSpec): CorridorSpec => {
  const pts = c.pts.map((p) => ({ x: sc(p.x), z: sc(p.z) }));
  if (pts.length >= 2) {
    const d0 = { x: Math.sign(pts[1].x - pts[0].x), z: Math.sign(pts[1].z - pts[0].z) };
    pts[0] = { x: pts[0].x - d0.x, z: pts[0].z - d0.z };
    const dn = { x: Math.sign(pts[pts.length - 1].x - pts[pts.length - 2].x), z: Math.sign(pts[pts.length - 1].z - pts[pts.length - 2].z) };
    pts[pts.length - 1] = { x: pts[pts.length - 1].x + dn.x, z: pts[pts.length - 1].z + dn.z };
  }
  return { ...c, pts };
};
const CORRIDORS: CorridorSpec[] = CORRIDOR_SPECS.map(SCALED);

const map = buildAuthoredMap(S, OFFSET, ROOMS, CORRIDORS);
validateAuthoredMap(map, ROOMS);

const OX = (x: number, z: number): GridPos => ({ x: x + OFFSET.x, z: z + OFFSET.z });

// ── key structural tiles (map-local → world) ─────────────────
const partySpawn = OX(sc(21), sc(22));        // r1 center — wake under the mushrooms
const checkpoint = OX(sc(22), sc(23));        // r1 — the already-lit bonfire
const exitStairs = OX(sc(36), sc(23));        // r9 — behind the waterfall (the way up)

const roomList = ROOM_SPECS.map((r) => ({ id: r.id, name: r.name, rect: map.rooms[r.id] }));

// the two extra bonfire savepoints: the hermit pool (mid-way dead-end
// rest) and the central grotto (last comfort before the boss gauntlet)
const bonfireHermit = OX(sc(15), sc(13));     // r4 — pool edge, opposite the hermit
const bonfireGrotto = OX(sc(33), sc(15));     // r6 — south-east corner of the hub

const structures: LevelStructures = {
  partySpawn,
  checkpoint,
  bonfires: [bonfireHermit, bonfireGrotto],   // no bonfire in entry hall (user request) — first save is at hermit pool / grotto
  exitStairs,
  arenaRect: map.rooms.r7,                    // the Spore Throne — the mother's arena
  rooms: roomList,
  npcs: [
    { npcId: 'spore_merchant', pos: OX(sc(23), sc(21)) },   // r1 — Myke, by the entry bonfire
    { npcId: 'hermit_shroom', pos: OX(sc(14), sc(13)) },    // r4 pool edge (speaks only while hallucinating)
    { npcId: 'sporefriend', pos: OX(sc(22), sc(10)), unlessFlag: 'sporefriend' }, // r5 circle — home when dismissed
  ],
};

// ── terrain: mossy fungal floors, water pools, tall cave walls ──
const terrain = buildTerrain(map.walk, {
  seed: 20260849,
  floorBase: 1,
  floorSteps: 0,
  wallHeight: [4.0, 6.0],
  wallScale: 0.07,
  floorPalette: ['moss', 'cave_floor', 'gravel'],
  wallPalette: ['wall_moss', 'cave_stone'],
});
const floorMats = terrain.floorMats;
for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
  if (map.walk[x][z]) floorMats[x][z] = map.floorMats[x][z];
}
const water = map.water;

// ── reserved tiles: nothing blocking spawns/bonfire/exit/npcs ──
const reserved = new Set<string>();
const reserve = (p: GridPos) => reserved.add(`${p.x},${p.z}`);
[partySpawn, checkpoint, exitStairs, bonfireHermit, bonfireGrotto].forEach(reserve);
(structures.npcs ?? []).forEach((n) => reserve(n.pos));

const BLOCKING_KINDS = new Set<PropKind>(['torch', 'bonfire', 'brazier', 'tent', 'campfire', 'crate', 'stalagmite', 'boulder', 'giant_mushroom']);
const occupied = new Set<string>();
const destructiblesList = floor49Destructibles(20260849, map.rooms, map.walk, reserved);
for (const d of destructiblesList) occupied.add(`${d.x},${d.z}`);

// ── props ─────────────────────────────────────────────────────
const rng = mulberry32(20260849);
const props: PropPlacement[] = [];
const on = (x: number, z: number) => !!map.walk[x]?.[z];
const put = (kind: PropPlacement['kind'], x: number, z: number, s = rng()) => {
  const wx = x + OFFSET.x, wz = z + OFFSET.z;
  if (!on(wx, wz)) return;
  const k = `${wx},${wz}`;
  if (reserved.has(k)) return;
  if (occupied.has(k)) return;
  props.push({ kind, x: wx, z: wz, seed: s });
  if (BLOCKING_KINDS.has(kind)) occupied.add(k);
};
const putW = (kind: PropKind, wx: number, wz: number, s = 0.5) => put(kind, wx - OFFSET.x, wz - OFFSET.z, s);

const R1 = map.rooms.r1, R2 = map.rooms.r2, R3 = map.rooms.r3, R4 = map.rooms.r4, R5 = map.rooms.r5;
const R6 = map.rooms.r6, R7 = map.rooms.r7, R8 = map.rooms.r8, R9 = map.rooms.r9;
const R10 = map.rooms.r10, R11 = map.rooms.r11, R12 = map.rooms.r12, R13 = map.rooms.r13;
const R14 = map.rooms.r14, R15 = map.rooms.r15, R16 = map.rooms.r16, R17 = map.rooms.r17, R18 = map.rooms.r18;
const mid = (r: { x0: number; x1: number }) => (r.x0 + r.x1) >> 1;
const zmid = (r: { z0: number; z1: number }) => (r.z0 + r.z1) >> 1;

// ── R1 — Entry Hall: no bonfire here (per user request) — the fallen
//    traveler's skeleton is the first thing you see; the grove wakes around it.
// bonfire removed so entry hall has no save; first saves are at hermit pool / grotto
putW('skeleton', R1.x0, R1.z0, 0.5);                 // the fallen traveler (searchable)
putW('glow_mushroom_blue', R1.x0 + 3, R1.z0, 0.3);   // north wall glow
putW('glow_mushroom_green', R1.x1, R1.z0 + 1, 0.7);  // NE corner glow
putW('glow_mushroom_purple', R1.x0 + 1, R1.z1, 0.5); // the harvestable purple (south wall)
putW('mushroom_cap', R1.x0 + 2, R1.z1 - 1, 0.6);
putW('mushroom_cap', R1.x1 - 1, R1.z1, 0.8);
// focal corner: a stalagmite under the north wall, one last cap by the west door
putW('stalagmite', R1.x0 + 4, R1.z0, 0.7);
putW('glow_mushroom_purple', R1.x0 + 5, R1.z0 + 3, 0.4);
putW('mushroom_cap', R1.x0 + 1, R1.z0 + 1, 0.9);

// ── R2 — Spore Field: caps everywhere, 2 explosive spore sacs, a spore trail ──
putW('glow_mushroom_blue', R2.x0, R2.z0, 0.2);
putW('glow_mushroom_green', R2.x0 + 2, R2.z0 + 1, 0.4);
putW('glow_mushroom_purple', R2.x1, R2.z0, 0.9);
putW('mushroom_cap', R2.x0 + 1, R2.z1, 0.5);
putW('mushroom_cap', R2.x0 + 3, R2.z1 - 1, 0.7);
putW('mushroom_cap', R2.x1 - 1, R2.z1, 0.3);
putW('spore_sac', R2.x0 + 2, R2.z0 + 3, 0.6);
putW('spore_sac', R2.x1 - 1, R2.z0 + 4, 0.8);
// the spore trail toward r4 — a string of purple glow caps leading north
putW('glow_mushroom_purple', R2.x0 + 1, R2.z0 + 2, 0.5);
putW('glow_mushroom_purple', R2.x0 + 3, R2.z0 + 1, 0.7);   // trail head at the r4 corridor door
putW('mushroom_cap', mid(R2), mid(R2), 0.6);               // the harvestable center cap

// ── R3 — Vine Tunnel: hanging vines, a vine trap in the middle ──
putW('vine', mid(R3), R3.z0, 0.3);
putW('vine', R3.x0, zmid(R3), 0.7);
putW('vine', R3.x1, R3.z0 + 2, 0.5);
putW('vine', mid(R3), R3.z1, 0.9);
// the glowing fruit — a big green cap mid-tunnel
putW('glow_mushroom_green', R3.x0, R3.z1 - 1, 0.6);
// a purple cap mid-tunnel so the vines are never fully dark
putW('glow_mushroom_purple', R3.x1, R3.z0 + 10, 0.8);

// ── R4 — Hermit Pool: the pool, glow mushrooms around the edge, the hidden chest ──
putW('pool', mid(R4), mid(R4), 0.5);
putW('glow_mushroom_purple', R4.x0, R4.z0, 0.4);
putW('glow_mushroom_blue', R4.x1, R4.z0, 0.6);
putW('glow_mushroom_green', R4.x0, R4.z1, 0.8);
putW('mushroom_cap', R4.x1, R4.z1, 0.5);
// the hidden chest sits in the pool — visible only while hallucinating
putW('chest', R4.x0 + 2, R4.z0 + 1, 0.5);
// the rare Moon Cap
putW('glow_mushroom_blue', R4.x0 + 3, R4.z0 + 3, 0.9);
// the hermit's bonfire savepoint is structural (structures.bonfires) — no prop here;
// instead, offerings left at the pool's edge for the old hermit
putW('offering_bowl', R4.x0 + 5, R4.z0 + 2, 0.6);

// ── R5 — Mushroom Circle: seven giant mushrooms in a ring + the offering bowl ──
{
  const cx = mid(R5), cz = mid(R5);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = (R5.x1 - R5.x0) / 2 - 0.5;
    const x = Math.round(cx + Math.cos(a) * r);
    const z = Math.round(cz + Math.sin(a) * r);
    const kinds: PropKind[] = ['giant_mushroom', 'mushroom_cap', 'glow_mushroom_blue', 'glow_mushroom_green', 'glow_mushroom_purple', 'mushroom_cap', 'giant_mushroom'];
    putW(kinds[i], x, z, 0.3 + i * 0.09);
  }
  putW('offering_bowl', cx + 1, cz, 0.5);   // beside the ring's heart (sporefriend's spot)
}

// ── R6 — Central Grotto: the hub room. Four guardian giants at the corners,
//    the warm crystal beacon + a small cap heart at center, the rest camp in the
//    south-east, and the vine bridge north toward the throne. (r6's harvestable
//    spore sacs are spawned by floor49Destructibles, not here.)
putW('giant_mushroom', R6.x0 + 1, R6.z0 + 1, 0.3);   // NW guardian
putW('giant_mushroom', R6.x1 - 1, R6.z0 + 1, 0.7);   // NE guardian
putW('giant_mushroom', R6.x0 + 2, R6.z1 - 1, 0.5);   // SW guardian
putW('giant_mushroom', R6.x1 - 2, R6.z1 - 2, 0.9);   // SE guardian
putW('crystal_light', R6.x0 + 4, R6.z0 + 1, 0.5);    // the warm beacon (takeable)
putW('mushroom_bed', R6.x0 + 1, R6.z1 - 1, 0.5);     // rest here — but you'll be sleepy
putW('spore_sac', R6.x1 - 1, R6.z0 + 2, 0.6);        // sac against the NE wall
putW('vine_bridge', mid(R6), R6.z0, 0.5);            // the fragile crossing to r7
putW('glow_mushroom_blue', R6.x0, R6.z0 + 3, 0.4);   // west wall accent
putW('glow_mushroom_green', R6.x1, R6.z0 + 4, 0.6);  // east wall accent
putW('glow_mushroom_purple', R6.x0 + 5, R6.z1, 0.8); // south wall accent
putW('mushroom_cap', R6.x0 + 8, R6.z0 + 7, 0.5);     // the grotto's heart — a cap cluster
putW('mushroom_cap', R6.x0 + 6, R6.z0 + 8, 0.7);
// the grotto bonfire savepoint is structural (structures.bonfires) — no prop here

// ── R7 — Spore Throne: the mother's arena. The throne itself + her four corner
//    spore sacs are spawned by floor49Destructibles (smashable in the boss fight);
//    here we dress the room around them: guardian giants at the south gate, a
//    diamond of small caps around the throne, and purple/green wall glows.
putW('giant_mushroom', R7.x0 + 2, R7.z1, 0.5);       // SW gate guardian
putW('giant_mushroom', R7.x1 - 2, R7.z1, 0.8);       // SE gate guardian
putW('glow_mushroom_purple', R7.x0, R7.z0 + 2, 0.3);
putW('glow_mushroom_purple', R7.x1, R7.z0 + 3, 0.7);
putW('glow_mushroom_purple', R7.x0, R7.z0 + 8, 0.9);  // west wall accent
putW('glow_mushroom_green', R7.x1, R7.z0 + 9, 0.6);   // east wall accent
putW('offering_bowl', mid(R7), zmid(R7) + 1, 0.5);    // set before the throne
putW('mushroom_cap', mid(R7) - 2, zmid(R7) - 1, 0.4);
putW('mushroom_cap', mid(R7) + 2, zmid(R7) - 1, 0.6);
putW('mushroom_cap', mid(R7) - 1, zmid(R7) + 3, 0.5);
putW('mushroom_cap', mid(R7) + 1, zmid(R7) + 3, 0.7);

// ── R8 — Deep Pools: three pools, the submerged skeleton, a crystal ──
putW('pool', R8.x0 + 1, R8.z0 + 1, 0.4);             // the healing pool
putW('pool', R8.x0 + 3, R8.z0 + 2, 0.6);             // the poisoned pool
putW('pool', R8.x1 - 1, R8.z0 + 4, 0.8);             // the revealing pool
putW('skeleton', R8.x1, R8.z1 - 1, 0.5);             // the submerged skeleton (searchable)
putW('crystal_light', R8.x0, R8.z1, 0.5);            // the takeable crystal
putW('glow_mushroom_blue', R8.x0 + 2, R8.z0, 0.3);
putW('glow_mushroom_green', R8.x1, R8.z0, 0.7);
putW('glow_mushroom_purple', R8.x0, R8.z0 + 4, 0.9); // west wall accent
putW('mushroom_cap', R8.x0 + 6, R8.z1 - 2, 0.5);     // a cap drifting on the south pool
putW('crystal_blue', R8.x0 + 4, R8.z0 + 3, 0.8);     // a blue crystal between the pools

// ── R9 — Flooded Cave: the waterfall, the floating chest, fish-leaping caps ──
putW('waterfall', R9.x0, zmid(R9), 0.5);              // the passage hides behind it
putW('chest', R9.x1 - 1, R9.z1, 0.5);                 // the floating chest
putW('glow_mushroom_blue', R9.x0 + 1, R9.z1 - 1, 0.4);
putW('glow_mushroom_green', R9.x1, R9.z0, 0.6);
putW('mushroom_cap', R9.x0 + 2, R9.z0 + 1, 0.8);      // marks the exit stairs
putW('glow_mushroom_purple', R9.x1 - 2, R9.z0 + 1, 0.9);  // east wall accent
putW('mushroom_cap', R9.x0 + 5, R9.z0 + 4, 0.5);      // a cap bobbing mid-flood
putW('crystal_blue', R9.x0 + 4, R9.z0 + 2, 0.7);      // cold light in the flood
putW('skeleton', R9.x0 + 6, R9.z1 - 1, 0.6);          // a drowned wanderer

// ── R10 — Spore Farm: neat rows of caps + the scarecrow (a skeleton in a hat) ──
putW('giant_mushroom', R10.x0, R10.z0, 0.3);          // the "farmhouse" — a very large mushroom
putW('skeleton', R10.x1 - 1, R10.z0 + 1, 0.5);        // the scarecrow (skeleton + cap on top)
putW('mushroom_cap', R10.x1 - 1, R10.z0, 0.6);        // the scarecrow's hat
putW('glow_mushroom_green', R10.x0 + 1, R10.z1, 0.4);
putW('glow_mushroom_blue', R10.x0 + 3, R10.z1 - 1, 0.7);
putW('glow_mushroom_purple', R10.x1, R10.z1, 0.5);
putW('mushroom_cap', R10.x0 + 2, R10.z0 + 2, 0.8);
putW('mushroom_cap', mid(R10), zmid(R10), 0.9);       // the harvestable center row cap
putW('bucket', R10.x0 + 6, R10.z1 - 2, 0.5);          // the farmer's bucket, waiting

// ── R11 — The Rotting Tree: a mushroom that WANTED to be a tree ──
putW('giant_mushroom', mid(R11), zmid(R11), 0.2);      // the "tree" — hollow, breathing, holding a secret
putW('vine', R11.x0, R11.z0, 0.4);
putW('vine', R11.x1, R11.z1, 0.6);
putW('glow_mushroom_green', R11.x0 + 1, R11.z0, 0.5);
putW('glow_mushroom_blue', R11.x1 - 1, R11.z1 - 1, 0.8);
putW('mushroom_cap', R11.x0, R11.z1 - 1, 0.7);
putW('glow_mushroom_purple', R11.x1, R11.z0 + 2, 0.9);  // NE corner glow
putW('mushroom_cap', R11.x0 + 4, R11.z0 + 5, 0.4);      // fallen cap at the tree's roots
putW('bones', R11.x0 + 5, R11.z0 + 7, 0.6);             // whatever the tree ate last

// ── R12 — The Picnic: a blanket, a basket, and a very old lunch ──
putW('skeleton', R12.x0 + 1, R12.z0 + 1, 0.5);        // the picnicker (he is fine. he is fertilizer)
putW('chest', mid(R12), zmid(R12), 0.6);              // the picnic basket
putW('glow_mushroom_purple', R12.x1, R12.z0, 0.3);
putW('mushroom_cap', R12.x0, R12.z1, 0.7);
putW('glow_mushroom_blue', R12.x1 - 1, R12.z1, 0.9);
putW('vine', R12.x0 + 3, R12.z0, 0.5);                // a vine "napkin"
putW('rug', mid(R12), zmid(R12) - 1, 0.5);            // the blanket (woven mycelium)
putW('broken_bottle', R12.x0 + 2, R12.z0 + 5, 0.7);   // the wine did not survive the outing
putW('glow_mushroom_green', R12.x0 + 6, R12.z0 + 1, 0.4);  // a soft light over the picnic

// ── R13 — Spore Nursery: the mother's children, dozens of tiny caps ──
putW('giant_mushroom', R13.x0, R13.z0, 0.4);          // "mother" — a big warm cap they all lean on
putW('mushroom_cap', R13.x0 + 2, R13.z0 + 1, 0.3);
putW('mushroom_cap', R13.x0 + 3, R13.z0 + 2, 0.5);
putW('mushroom_cap', R13.x1 - 1, R13.z0 + 1, 0.7);
putW('mushroom_cap', R13.x0 + 1, R13.z1 - 1, 0.6);
putW('mushroom_cap', R13.x1 - 2, R13.z1 - 1, 0.8);
putW('glow_mushroom_blue', R13.x0 + 4, R13.z0, 0.4);
putW('glow_mushroom_green', R13.x1, R13.z0 + 3, 0.6);
putW('glow_mushroom_purple', R13.x0, R13.z1, 0.9);
putW('mushroom_cap', mid(R13), zmid(R13), 0.2);
putW('mushroom_cap', R13.x0 + 6, R13.z0 + 2, 0.4);    // two more of the children
putW('mushroom_cap', R13.x0 + 8, R13.z0 + 7, 0.6);
putW('chest', R13.x1, R13.z1, 0.5);                   // the mother's private stash

// ── R14 — The Mimic Den: one chest. In the middle. Untouched. DREAMING. ──
putW('chest', mid(R14), mid(R14), 0.9);               // the mimic (a chest with DREAMS)
putW('glow_mushroom_green', R14.x0, R14.z0, 0.4);
putW('glow_mushroom_purple', R14.x1, R14.z0, 0.6);
putW('mushroom_cap', R14.x0, R14.z1, 0.5);
putW('mushroom_cap', R14.x1, R14.z1 - 1, 0.8);
putW('crystal_light', R14.x0 + 2, R14.z0 + 3, 0.7);   // the "spotlight" — showmanship matters
putW('bones', R14.x0 + 7, R14.z0 + 3, 0.5);           // previous patrons of the den
putW('rubble', R14.x0 + 1, R14.z0 + 6, 0.8);          // the den's lousy housekeeping
putW('glow_mushroom_blue', R14.x0 + 3, R14.z0, 0.4);  // north wall accent

// ── R15 — Spore-Grounds: a graveyard with VERY opinionated epitaphs ──
putW('mushroom_cap', R15.x0, R15.z0 + 1, 0.4);        // grave #1 (Bert)
putW('mushroom_cap', R15.x0 + 3, R15.z0 + 2, 0.6);    // grave #2 (Sandra)
putW('mushroom_cap', R15.x1, R15.z1 - 1, 0.8);        // grave #3 (Steve)
putW('mushroom_cap', R15.x0 + 1, R15.z1 - 2, 0.5);    // grave #4 (untitled — the mushrooms are still writing)
putW('mushroom_cap', R15.x0 + 5, R15.z0 + 5, 0.6);    // grave #5 (Ethel — RIP, she fell in)
putW('mushroom_cap', R15.x0 + 7, R15.z0 + 8, 0.4);    // grave #6 (…the epitaph grew legs)
putW('skeleton', R15.x0 + 2, R15.z0, 0.7);            // the groundskeeper (he trusted a mushroom)
putW('glow_mushroom_blue', R15.x1 - 1, R15.z0, 0.3);
putW('glow_mushroom_purple', R15.x0, R15.z0, 0.9);
putW('glow_mushroom_green', R15.x0 + 6, R15.z1, 0.8); // south wall light

// ── R16 — Echo Chamber: three crystals that repeat everything (the grotto's Twitter) ──
putW('crystal_light', R16.x0, zmid(R16), 0.4);
putW('crystal_light', R16.x1, zmid(R16), 0.6);
putW('crystal_light', mid(R16), R16.z0, 0.5);
putW('crystal_light', mid(R16), R16.z1, 0.8);
putW('pool', R16.x0 + 1, R16.z1 - 1, 0.7);            // a still, black pool that listens
putW('glow_mushroom_blue', R16.x0 + 2, R16.z0 + 2, 0.3);
putW('glow_mushroom_green', R16.x1 - 1, R16.z1 - 1, 0.9);
putW('crystal', R16.x0 + 2, R16.z1 - 2, 0.6);         // dull companions to the bright quartet
putW('crystal_blue', R16.x1 - 2, R16.z0 + 2, 0.8);
putW('glow_mushroom_purple', R16.x0 + 6, R16.z1 - 2, 0.9);

// ── R17 — Mycelial Highway: a glowing road that hums (and judges your pace) ──
putW('crystal_light', mid(R17), zmid(R17), 0.5);      // the road's "sun"
putW('glow_mushroom_green', R17.x0, R17.z0, 0.3);
putW('glow_mushroom_green', R17.x1, R17.z0, 0.5);
putW('glow_mushroom_purple', R17.x0, R17.z1, 0.7);
putW('glow_mushroom_purple', R17.x1, R17.z1, 0.9);
putW('mushroom_cap', R17.x0 + 2, R17.z1 - 1, 0.6);
putW('mushroom_cap', R17.x1 - 2, R17.z1 - 1, 0.8);
putW('mushroom_cap', R17.x0 + 6, R17.z0, 0.4);        // road-edge caps, north side
putW('glow_mushroom_blue', R17.x0 + 7, R17.z1, 0.7);  // road-edge glow, south side

// ── R18 — The Sleeping Giant: a mushroom the size of a house. Do not wake it. Wake it. ──
putW('giant_mushroom', mid(R18), zmid(R18), 0.1);     // the Giant (it is snoring)
putW('glow_mushroom_blue', R18.x0, R18.z0, 0.4);
putW('glow_mushroom_green', R18.x1, R18.z0, 0.6);
putW('glow_mushroom_purple', R18.x0, R18.z1, 0.8);
putW('mushroom_cap', R18.x0 + 1, R18.z1 - 1, 0.5);
putW('mushroom_cap', R18.x1 - 1, R18.z1 - 1, 0.7);
putW('chest', R18.x0 + 4, R18.z0 + 1, 0.9);           // what the giant was dreaming of (it is gold)
putW('rubble', R18.x0 + 9, R18.z0 + 3, 0.6);          // rubble kicked loose by the snoring
putW('glow_mushroom_blue', R18.x0 + 7, R18.z1 - 1, 0.8);
putW('mushroom_cap', R18.x0 + 2, R18.z0 + 1, 0.5);    // a cap sprouting by the treasure

// sparse glow mushrooms along the corridors — the grotto's ambient light
const corridorTiles: GridPos[] = [];
for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
  if (!map.walk[x][z] || water[x][z]) continue;
  if (map.roomOf(x, z) !== null) continue;
  corridorTiles.push({ x, z });
}
const glowKinds: PropKind[] = ['glow_mushroom_blue', 'glow_mushroom_green', 'glow_mushroom_purple', 'mushroom_cap'];
let glowN = 0;
for (const t of corridorTiles) {
  if (reserved.has(`${t.x},${t.z}`)) { glowN++; continue; }
  if (glowN % 7 === 0 && rng() < 0.5) {
    put(glowKinds[Math.floor(rng() * glowKinds.length)], t.x - OFFSET.x, t.z - OFFSET.z);
  }
  glowN++;
}
// a few hanging vines in the corridors
let vineN = 0;
for (const t of corridorTiles) {
  if (vineN % 11 === 0 && rng() < 0.6) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = t.x + dx, nz = t.z + dz;
      if (on(nx, nz)) continue;
      putW('vine', nx, nz, rng());
      break;
    }
  }
  vineN++;
}

// ── spawns for the roster ─────────────────────────────────────
const FLOOR49_SPAWNS: Floor49Spawns = {
  party: partySpawn,
  rooms: {
    r3: map.rooms.r3, r6: map.rooms.r6, r7: map.rooms.r7, r8: map.rooms.r8, r9: map.rooms.r9,
    r11: map.rooms.r11, r14: map.rooms.r14, r15: map.rooms.r15, r17: map.rooms.r17, r18: map.rooms.r18,
  },
  sporeThrone: map.rooms.r7,
  bossPos: OX(sc(31), sc(3)),        // the mother sits on her throne
};

/**
 * Debug surface for scripts/preview_floor49.mjs — raw layout data.
 */
export const F49_DEBUG = { ROOMS: ROOM_SPECS, CORRIDORS: CORRIDOR_SPECS, map, structures, OFFSET, reserved, FLOOR49_SPAWNS };

export const floor49Level: LevelDef = {
  name: 'The Fungal Grotto',
  icon: '🍄',
  description: "Floor 49. The Fungal Grotto. A glowing garden of giant mushrooms, drifting spores and still underground pools. It is beautiful. It is alive. It is a landlord, and you are behind on rent. The Spore Mother dreamed it into being, and she did not budget for you.",
  groundMats: ['moss', 'cave_floor', 'moss', 'gravel'],
  fillMats: ['wall_moss', 'cave_stone', 'wall_moss', 'cave_floor'],
  arena: { x0: OFFSET.x, z0: OFFSET.z, x1: OFFSET.x + 104, z1: OFFSET.z + 52 },
  spawn: { party: [partySpawn], enemies: [] },
  props,
  // bioluminescent grotto lighting: soft ambient, cool violet-green fog, the
  // mushrooms carry the color with their own point lights
  ambient: 0.42,
  sun: 0.06,
  fill: 0.22,
  fogColor: 0x1a1f2e,
  fogDensity: 0.02,
  waterColor: 0x3a86c8,
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
  traps: (seed) => floor49Traps(seed, map.rooms, map.walk, reserved),
  destructibles: destructiblesList,
  makeInteractables: (seed) => floor49Interactables(seed, map.rooms),
  hazards: floor49Hazards(map.rooms),
  makeHiddenTreasures: (seed) => floor49HiddenTreasures(seed, map.rooms, map.walk, reserved),
  roomOf: (x, z) => map.roomOf(x, z),
  roomNarration: ROOM_NARRATION,
  makeRoster: (seed) => createFloor49Roster(FLOOR49_SPAWNS, seed ?? 20260849),
  roster: createFloor49Roster(FLOOR49_SPAWNS, 20260849),
};
