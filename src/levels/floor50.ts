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
// the ~170×170 region sits inside the WORLD_SIZE=250 grid.
//
// GRANDEUR PASS 2: SCALE = 2.0 stretches every room/corridor (width-2
// corridors become width 5 grand sewer mains, width-1 gate lanes stay
// width 1 so blockers can still seal them). Walls are taller and the
// terrain gets raised mezzanine shelves (r24/r25/r6) plus a sunken
// oubliette (r20).
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

/** grandeur scale — every authored dimension stretches by this factor */
const SCALE = 2.0;
const sc = (n: number) => Math.round(n * SCALE);

// ── the 25 authored rooms (map-local top-left + size, UNSCALED) ────
const ROOM_SPECS: RoomSpec[] = [
  { id: 'r1', name: "Bonfire Cell", x0: 18, z0: 35, w: 4, h: 4, floor: 'stone' },
  { id: 'r2', name: "Hermit's Cell", x0: 24, z0: 35, w: 3, h: 3, floor: 'stone' },
  { id: 'r3', name: 'Sewer Tunnel', x0: 8, z0: 36, w: 8, h: 2, floor: 'water_shallow' },
  { id: 'r4', name: 'Rat Nursery', x0: 8, z0: 44, w: 5, h: 5, floor: 'bone' },
  { id: 'r5', name: "Boss Rat's Lair", x0: 8, z0: 52, w: 6, h: 6, floor: 'sludge' },   // dark wet muck — reads as Gnaw's den, NOT the nursery (r4 stays bone)
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

// ── corridors (map-local polylines, UNSCALED; width 2 unless noted) ──
// 15→18 / 11→18 / 18→19 / 11→8 / 18→9 / 19→20: north cluster// 13→8 / 8→9 / 9→20 / 13→16 / 8→14 / 9→10: mid cluster + gates
// 10→21 → 21→22 → 22→23 → 23→24 → 24→25: the long east spine
// 3→1 / 1→2 / 3→4 / 4→5 / 5→6 / 6→7 / 7→24: south cluster
// 11→12: the flooded rat den dead-end
// 1↔19: the collapsed-tunnel shortcut (runs down the west/south/east
//       edges of the 70×70 region so it can't shortcut past gates)
const CORRIDOR_SPECS: CorridorSpec[] = [
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
  { pts: [{ x: 10, z: 49 }, { x: 10, z: 51 }], width: 1 },                    // 4→5 (single-lane door — the nursery and Gnaw's lair are separate rooms; a wide mouth read as ONE big room and let rats pour into the lair mid-fight)
  { pts: [{ x: 14, z: 54 }, { x: 15, z: 54 }], width: 1 },                    // 5→6 (debris gate — single lane so the rubble seals it)
  { pts: [{ x: 23, z: 53 }, { x: 24, z: 53 }], width: 1 },                    // 6→7 (trapdoor — single lane)
  { pts: [{ x: 35, z: 53 }, { x: 59, z: 53 }], width: 2 },                    // 7→24
  // the shortcut: room 1 → down the WEST side (x 8..9, clear of rooms 3/4/5
  // which span x 16..27) → across the SOUTH edge (z 141, below room 25's
  // z 120..135) → up the EAST side (x 140) → room 19's east edge (z 28).
  // Every segment keeps a ≥1-tile gap from rooms it must NOT connect to.
  { pts: [{ x: 39, z: 78 }, { x: 39, z: 79 }], width: 1 },                    // debris tiles below r1
  { pts: [{ x: 39, z: 80 }, { x: 39, z: 100 }], width: 1 },                   // south leg
  { pts: [{ x: 8, z: 100 }, { x: 39, z: 100 }], width: 2 },                   // west leg
  { pts: [{ x: 8, z: 101 }, { x: 8, z: 140 }], width: 2 },                    // vertical down west side
  { pts: [{ x: 8, z: 141 }, { x: 140, z: 141 }], width: 1 },                  // south run
  { pts: [{ x: 140, z: 28 }, { x: 140, z: 141 }], width: 3 },                 // east run up to r19
];

// ── scaled copies: rooms get 1.5×, corridors 1.5× (width 2→3; the
//    deliberate width-1 gate lanes stay 1 so blockers still seal them).
//    Endpoints are stretched one extra tile because rooms grow faster
//    than their connectors — otherwise scaled rooms end up a tile short
//    of the corridor mouth. The 1↔19 shortcut is hand-tuned below
//    (its corner joints break under naive scaling).
const SCALED = (c: CorridorSpec): CorridorSpec => {
  const pts = c.pts.map((p) => ({ x: sc(p.x), z: sc(p.z) }));
  if (pts.length >= 2) {
    const d0 = { x: Math.sign(pts[1].x - pts[0].x), z: Math.sign(pts[1].z - pts[0].z) };
    pts[0] = { x: pts[0].x - d0.x, z: pts[0].z - d0.z };
    const L = pts.length - 1;
    const d1 = { x: Math.sign(pts[L].x - pts[L - 1].x), z: Math.sign(pts[L].z - pts[L - 1].z) };
    pts[L] = { x: pts[L].x + d1.x, z: pts[L].z + d1.z };
  }
  return { pts, width: c.width === 1 ? 1 : 5 };
};
const SHORTCUT_SPECS: CorridorSpec[] = [
  { pts: [{ x: 39, z: 78 }, { x: 39, z: 79 }], width: 1 },    // debris tiles below r1
  { pts: [{ x: 39, z: 80 }, { x: 39, z: 100 }], width: 1 },   // south leg
  { pts: [{ x: 8, z: 100 }, { x: 39, z: 100 }], width: 2 },   // west leg
  { pts: [{ x: 8, z: 101 }, { x: 8, z: 140 }], width: 2 },    // vertical down west side
  { pts: [{ x: 8, z: 141 }, { x: 140, z: 141 }], width: 1 },  // south run
  { pts: [{ x: 140, z: 28 }, { x: 140, z: 141 }], width: 3 }, // east run up to r19
];
// hand-tuned shortcut (MAP-LOCAL — buildAuthoredMap adds OFFSET): r1 south
// edge → debris (39,78-79) → straight SOUTH at x=39 to z=100 (clear of r3,
// r4 and the 3→4 corridor at x 19..21, z 75..87) → WEST at z 100..101 to
// x=8 (clear of r5/r6 which start at z 104/106) → vertical x=8 down to
// z=140 (clear of every room, all x > 8) → south run z=141 → east run x=140
// up to r19's east edge (z 26..29). NO crossing with any room corridor; the
// only entrances are the debris (r1) and r19's east side.
const SHORTCUT: CorridorSpec[] = [
  { pts: [{ x: 39, z: 78 }, { x: 39, z: 79 }], width: 1 },    // debris lane
  { pts: [{ x: 39, z: 80 }, { x: 39, z: 100 }], width: 1 },   // south leg
  { pts: [{ x: 8, z: 100 }, { x: 39, z: 100 }], width: 2 },   // west leg
  { pts: [{ x: 8, z: 101 }, { x: 8, z: 140 }], width: 2 },    // vertical
  { pts: [{ x: 8, z: 141 }, { x: 140, z: 141 }], width: 1 },  // south run
  { pts: [{ x: 140, z: 28 }, { x: 140, z: 141 }], width: 3 }, // east run
];
// the shortcut entries live at the END of CORRIDOR_SPECS (after the 1→19
// comment block) — strip them before mapping, then push the tuned spans
const SHORTCUT_N = SHORTCUT_SPECS.length;
const ROOMS: RoomSpec[] = ROOM_SPECS.map((r) => ({
  ...r,
  x0: sc(r.x0), z0: sc(r.z0),
  w: Math.max(4, sc(r.w)), h: Math.max(3, sc(r.h)),
}));
const CORRIDORS: CorridorSpec[] = [
  ...CORRIDOR_SPECS.slice(0, CORRIDOR_SPECS.length - SHORTCUT_N).map(SCALED),
  ...SHORTCUT,
];

// the shortcut is a dark smuggler's back-pass: keep it torch-free. Its
// 1-wide lanes can't take a torch anyway (a global ring can fool torchSafe
// into thinking a blocked tile stays connected — a torch would seal the
// shortcut even after the debris is cleared).
const SHORTCUT_TILES = new Set<string>();
for (const c of SHORTCUT) {
  for (let i = 0; i + 1 < c.pts.length; i++) {
    const a = c.pts[i], b = c.pts[i + 1];
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
    const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
    for (let k = 0; k <= len; k++) {
      const x = a.x + dx * k + OFFSET.x, z = a.z + dz * k + OFFSET.z;
      SHORTCUT_TILES.add(`${x},${z}`);
      if (dz !== 0) {
        SHORTCUT_TILES.add(`${x + 1},${z}`);
        if (c.width === 3) SHORTCUT_TILES.add(`${x - 1},${z}`);
      } else {
        SHORTCUT_TILES.add(`${x},${z + 1}`);
        if (c.width === 3) SHORTCUT_TILES.add(`${x},${z - 1}`);
      }
    }
  }
}

const map = buildAuthoredMap(S, OFFSET, ROOMS, CORRIDORS);
validateAuthoredMap(map, ROOMS);

const O = (p: GridPos): GridPos => ({ x: p.x + OFFSET.x, z: p.z + OFFSET.z });
const OX = (x: number, z: number): GridPos => ({ x: x + OFFSET.x, z: z + OFFSET.z });

// ── key structural tiles (map-local → world) ─────────────────
const partySpawn = OX(sc(19), sc(36));
const checkpoint = OX(sc(20), sc(37));
const bossDoor = OX(sc(60), sc(58));
const bossBath = OX(sc(60), sc(64));
const goldenChest = OX(sc(64), sc(66));
const secretChest = OX(sc(62), sc(5));
const hermitChamber = OX(sc(25), sc(37));
const exitStairs = OX(sc(60), sc(67));

const roomList = ROOMS.map((r) => ({ id: r.id, name: r.name, rect: map.rooms[r.id] }));
const roomRectOf = (id: string): Rect | undefined => map.rooms[id];

/** every map-local tile in a rect, offset to world coords (gate lane spans) */
const lane = (x0: number, z0: number, x1: number, z1: number): GridPos[] => {
  const out: GridPos[] = [];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) out.push(O({ x, z }));
  return out;
};

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
    { npcId: 'hermit', pos: O({ x: sc(25), z: sc(37) }) },
    { npcId: 'other_hermit', pos: O({ x: sc(11), z: sc(29) }) },
    { npcId: 'scrag', pos: O({ x: sc(49), z: sc(22) }) },
  ],
  doors: [
    { id: 'soap_gate', pos: O({ x: 98, z: 50 }), axis: 'z', openedByFlag: 'soap_gate_open' },
    { id: 'trapdoor67', pos: O({ x: 47, z: 106 }), axis: 'x', openedByFlag: 'trapdoor_open' },
  ],
  // gate lanes seal only if the blocker covers the WHOLE single-lane span.
  // NOTE: the 1↔19 shortcut has NO gate — it's an open back route from room
  // 1 to the north cluster (player request: the rubble wall at spawn was
  // 'in the way').
  blockers: [
    { id: 'door16', tiles: lane(22, 44, 22, 56), kind: 'secretDoor', openedByFlag: 'mushroom_door' },
    { id: 'door17', tiles: lane(114, 12, 120, 12), kind: 'secretDoor', openedByFlag: 'vault_tunnel' },
    { id: 'debris56', tiles: lane(26, 108, 32, 108), kind: 'rubble', openedByFlag: 'debris_56' },
    { id: 'pipeclimb', tiles: lane(50, 46, 50, 56), kind: 'rubble', openedByFlag: 'pipe_climbed' },
  ],
  bossDoorOpenFlag: 'gribnab_door_open',
};

// ── terrain: flat sewer floors, TALLER walls, raised mezzanines + oubliette ─
const r24r = map.rooms.r24, r25r = map.rooms.r25, r6r = map.rooms.r6, r20r = map.rooms.r20;
const plateaus = [
  // r24 throne antechamber — mezzanine shelf along the north wall
  { rect: { x0: r24r.x0, z0: r24r.z0, x1: r24r.x1, z1: r24r.z0 + 2 }, steps: 2 },
  // r25 bath chamber — gallery shelf along the south wall overlooking the bath
  { rect: { x0: r25r.x0, z0: r25r.z1 - 2, x1: r25r.x1, z1: r25r.z1 }, steps: 2 },
  // r6 wine cellar — low raised platform (barrels stacked high)
  { rect: { x0: r6r.x0, z0: r6r.z0, x1: r6r.x0 + 1, z1: r6r.z0 + 1 }, steps: 1 },
  // r20 old well — the OUBLIETTE: a sunken stone pit (water collects at the bottom)
  { rect: { x0: r20r.x0 + 1, z0: r20r.z0 + 1, x1: r20r.x1 - 1, z1: r20r.z1 - 1 }, steps: -2 },
];
const terrain = buildTerrain(map.walk, {
  seed: 20260802,
  floorBase: 1,
  floorSteps: 0,                       // flat — sewers are not terraced
  wallHeight: [4.0, 6.0],              // grander ceilings than the old 2.6–4.0
  wallScale: 0.07,
  floorPalette: ['cave_floor', 'cave_stone', 'gravel'],
  wallPalette: ['cave_stone', 'cave_floor'],
  plateaus,
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
// the oubliette collects water — patch the pit floor to deep water
{
  const p = plateaus[3].rect;
  for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) {
    if (map.walk[x]?.[z]) {
      water[x][z] = true;
      floorMats[x][z] = 'cave_floor';
    }
  }
}

// ── reserved tiles: nothing blocking spawns/doors/chests/NPCs ──
const reserved = new Set<string>();
const reserve = (p: GridPos) => reserved.add(`${p.x},${p.z}`);
[partySpawn, checkpoint, bossDoor, bossBath, goldenChest, secretChest, hermitChamber, exitStairs].forEach(reserve);
(structures.doors ?? []).forEach((d) => reserve(d.pos));
(structures.blockers ?? []).forEach((b) => b.tiles.forEach(reserve));
(structures.npcs ?? []).forEach((n) => reserve(n.pos));

// reserve every single-lane gate tile (the width-1 corridors) from torches
// and blocking props — a torch must never seal a progression gate, and two
// opposite torches can't cut a wide corridor either.
const GATE_LANE_TILES = new Set<string>();
const BLOCKING_KINDS = new Set(['torch', 'bonfire', 'brazier', 'tent', 'campfire', 'crate', 'stalagmite', 'boulder']);
for (const c of CORRIDORS) {
  if (c.width !== 1) continue;
  for (let i = 0; i + 1 < c.pts.length; i++) {
    const a = c.pts[i], b = c.pts[i + 1];
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
    const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
    for (let k = 0; k <= len; k++) GATE_LANE_TILES.add(`${a.x + dx * k + OFFSET.x},${a.z + dz * k + OFFSET.z}`);
  }
}
for (const k of GATE_LANE_TILES) reserved.add(k);

// ── props ─────────────────────────────────────────────────────
const rng = mulberry32(20260802);
const props: PropPlacement[] = [];
const on = (x: number, z: number) => !!map.walk[x]?.[z];
// explicit props (bonfire, braziers…) always place on walkable tiles;
// the reserved set only guards the GENERIC decor loops below.
// NOTE: `put` takes MAP-LOCAL coords and adds OFFSET — the walk grid and
// prop placement are both in world coordinates.
const put = (kind: PropPlacement['kind'], x: number, z: number, s = rng()) => {
  const wx = x + OFFSET.x, wz = z + OFFSET.z;
  if (!on(wx, wz)) return;
  // blocking props must never sit on a gate lane (would seal it) or pinch a
  // corridor tile — the reserved set carries blockers/doors/NPCs already.
  // The respawn BONFIRE is the exception: it deliberately occupies the
  // reserved checkpoint tile (it IS the checkpoint), so it bypasses the guard.
  if (BLOCKING_KINDS.has(kind) && kind !== 'bonfire') {
    const k = `${wx},${wz}`;
    if (GATE_LANE_TILES.has(k) || reserved.has(k)) return;
  }
  props.push({ kind, x: wx, z: wz, seed: s });
};

// torches on corridor walls every ~6 tiles (skip water rooms)
const corridorTiles: GridPos[] = [];
for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
  if (!map.walk[x][z] || map.water[x][z]) continue;
  if (map.roomOf(x, z) !== null) continue;
  if (SHORTCUT_TILES.has(`${x},${z}`)) continue;   // the dark back-pass stays unlit
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
  // bigger map draws wider/longer corridors — space torches out further so
  // the point-light count stays roughly the same as the old 105×105 level
  if (torchN % 18 === 0 && rng() < 0.55) {
    // put() takes MAP-LOCAL coords; corridorTiles are world — convert back
    put('torch', t.x - OFFSET.x, t.z - OFFSET.z);
    torchPlaced.add(`${t.x},${t.z}`);
  }
  torchN++;
}

put('bonfire', sc(20), sc(37), 0.5);   // the respawn checkpoint fire
// room 1 braziers (bright corner lights before the bonfire is lit) —
// keep them in the far corners so Greg doesn't spawn inside one
put('brazier', sc(18), sc(35), 0.5);
put('brazier', sc(21), sc(38), 0.5);
// ── room 2 (Hermit's Cell) — his camp: a tent, a crackling campfire,
//    braziers, a bedroll and a crate. The hermit sits by the fire (his NPC
//    pos is set next to the campfire in `structures.npcs`). Furniture stays
//    clear of the corridor mouth (world 56..60,78) so the room reads OPEN.
put('tent', sc(26), sc(36), 0.3);     // (52,72) r2 back wall
put('campfire', sc(26), sc(37), 0.5); // (52,74) — the hermit's hearth
put('brazier', sc(24), sc(37), 0.5);  // (48,74) r2 west wall
put('brazier', 48, 71, 0.5);          // (48,71) r2 top-left corner (clear of the 1→2 mouth at z=72)
put('bedroll', sc(25), sc(35), 0.4);  // (50,70) r2 top-right
put('crate', 53, 75, 0.5);            // (53,75) r2 bottom-right corner
// braziers flanking Gribnab's door — inside r24 on either side of the gate
// lane (120,113..119) so neither blocks the approach
put('brazier', 121, 113, 0.5);
put('brazier', 127, 113, 0.5);
// room 24 braziers
put('brazier', sc(60), sc(52), 0.5);
put('brazier', sc(64), sc(56), 0.5);
// mushrooms: rooms 13 + 12
put('mushroom', sc(10), sc(20), 0.3);
put('mushroom', sc(12), sc(22), 0.7);
put('mushroom', sc(11), sc(21), 0.5);
put('mushroom', sc(24), sc(5), 0.4);
put('mushroom', sc(28), sc(7), 0.6);
// bones: 4 / 5 / 15
put('bones', sc(8), sc(44), 0.2); put('bones', sc(12), sc(48), 0.8);
put('bones', sc(9), sc(53), 0.3); put('bones', sc(13), sc(56), 0.9); put('bones', sc(8), sc(57), 0.5);
put('bones', sc(52), sc(4), 0.4); put('bones', sc(57), sc(9), 0.6); put('bones', sc(54), sc(6), 0.2);
// r4 rat nursery nests — the rats raise their young here: bedrolls repurposed
// as shredded bedding, a crate of stolen scraps, gnawed bones in the corners
put('bedroll', sc(9), sc(45), 0.4); put('bedroll', sc(12), sc(47), 0.7); put('bedroll', sc(9), sc(48), 0.6);
put('crate', sc(10), sc(46), 0.5); put('bones', sc(12), sc(44), 0.3); put('bones', sc(12), sc(45), 0.8);
// r5 Gnaw's lair — a filthy den: gnawed bones piled mid-room (the "bone
// pedestal" the narrator mentions), webs in the corners, no nesting
put('bones', sc(10), sc(55), 0.4); put('bones', sc(11), sc(54), 0.8); put('bones', sc(11), sc(56), 0.6);
put('webpile', sc(9), sc(56), 0.5); put('webpile', sc(13), sc(56), 0.9); put('bones', sc(12), sc(53), 0.2);
// webpiles: corridor corners of 3 / 11
put('webpile', sc(9), sc(36), 0.5); put('webpile', sc(15), sc(37), 0.9);
put('webpile', sc(24), sc(12), 0.4); put('webpile', sc(29), sc(13), 0.8);
// rubble decor: 6 / 19
put('rubble', sc(16), sc(53), 0.3); put('rubble', sc(22), sc(56), 0.7);
put('rubble', sc(66), sc(13), 0.5); put('rubble', sc(69), sc(14), 0.9);
// crystal in the hidden room (16)
put('crystal_green', sc(11), sc(28), 0.4);
put('crystal_green', sc(10), sc(30), 0.6);
// stalagmites sparse in water rooms
put('stalagmite', sc(12), sc(36), 0.5);
put('stalagmite', sc(28), sc(53), 0.7);
put('stalagmite', sc(32), sc(54), 0.3);
put('stalagmite', sc(25), sc(4), 0.6);
put('stalagmite', sc(27), sc(8), 0.2);
put('stalagmite', sc(63), sc(44), 0.5);
put('stalagmite', sc(65), sc(49), 0.8);
// stalactites on non-walk tiles bordering corridors
for (const t of corridorTiles) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = t.x + dx, nz = t.z + dz;
    if (on(nx, nz) || nx < 1 || nz < 1 || nx >= S - 1 || nz >= S - 1) continue;
    if (rng() < 0.12) put('stalactite', nx - OFFSET.x, nz - OFFSET.z);
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
  arena: { x0: OFFSET.x, z0: OFFSET.z, x1: OFFSET.x + 141, z1: OFFSET.z + 141 },
  spawn: { party: [partySpawn], enemies: [] },
  props,
  // grander-scale lighting: a touch more ambient so the bigger rooms + wall
  // detail read, and much lighter fog so the space doesn't close in on the
  // player — the whole point of the scale-up is that you can see it.
  ambient: 0.3,
  sun: 0.03,
  fill: 0.18,
  fogColor: 0x0a0f0a,
  fogDensity: 0.028,
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
