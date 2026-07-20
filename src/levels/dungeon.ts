// ─────────────────────────────────────────────────────────────
// THE WARLORD'S WARREN — a procedurally-carved cave/maze dungeon.
//
// A recursive-backtracker maze gives winding 1-wide corridors and
// plenty of dead-ends; that lattice is then overprinted with open
// ROOMS (encounters), organically widened (cellular pass) so it
// reads as a cave rather than a grid, and finally two rooms are
// SEALED behind a single controlled entrance each:
//   • the boss room — reachable only through a locked iron door
//   • the secret room — walled off by rubble a lever collapses
//
// Everything is deterministic (seeded) so the structures/spawns
// computed here line up exactly with what the world renders.
// ─────────────────────────────────────────────────────────────
import type { LevelDef, LevelStructures, PropPlacement, Rect } from './levelTypes';
import type { GridPos } from '../game/types';
import { WORLD_SIZE } from '../game/world';
import { createDungeonRoster, type DungeonSpawns } from '../game/skills';

const S = WORLD_SIZE;
type Grid = boolean[][];

// deterministic PRNG
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clone = (g: Grid): Grid => g.map((c) => c.slice());

interface DungeonBuild {
  walk: Grid;
  structures: LevelStructures;
  spawns: DungeonSpawns;
  props: PropPlacement[];
}

function buildDungeon(seed: number): DungeonBuild {
  const rng = mulberry32(seed);
  const walk: Grid = Array.from({ length: S }, () => new Array<boolean>(S).fill(false));
  const set = (x: number, z: number, v = true) => {
    if (x >= 1 && z >= 1 && x < S - 1 && z < S - 1) walk[x][z] = v;
  };
  const on = (x: number, z: number) => x >= 0 && z >= 0 && x < S && z < S && walk[x][z];
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

  // ══ organic carving primitives ═══════════════════════════════
  // A filled disc — the building block of caves; radius wobbles a touch so
  // even single stamps read as rough rock rather than perfect circles.
  const disc = (cx: number, cz: number, r: number) => {
    const R = Math.max(0.6, r);
    const x0 = Math.floor(cx - R - 1), x1 = Math.ceil(cx + R + 1);
    const z0 = Math.floor(cz - R - 1), z1 = Math.ceil(cz + R + 1);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d <= R + (rng() - 0.5) * 0.7) set(x, z, true);
    }
  };

  // An irregular blob "room": a smooth low-frequency boundary (a few sine
  // harmonics) instead of a rectangle, so every chamber has its own shape.
  const blobRoom = (r: Rect, opts: { clampRect?: boolean; rough?: number } = {}) => {
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
        if (d <= edge) set(x, z, true);
      }
    }
  };

  // A winding tunnel: drunk-walk from a→b, biased toward the target but with
  // frequent perpendicular wander and a wobbling bore, so passages snake and
  // pinch like real cave veins instead of straight grid corridors.
  const tunnel = (a: GridPos, b: GridPos, bore = 1) => {
    let x = a.x, z = a.z, guard = 0;
    while ((x !== b.x || z !== b.z) && guard++ < 800) {
      disc(x, z, bore + (rng() < 0.22 ? 0.8 : 0) - (rng() < 0.18 ? 0.5 : 0));
      const dx = Math.sign(b.x - x), dz = Math.sign(b.z - z), r = rng();
      if (x === b.x) z += dz;
      else if (z === b.z) x += dx;
      else if (r < 0.40) x += dx;
      else if (r < 0.80) z += dz;
      else { if (rng() < 0.5) x += rng() < 0.5 ? 1 : -1; else z += rng() < 0.5 ? 1 : -1; }
      x = clamp(x, 2, S - 3); z = clamp(z, 2, S - 3);
    }
    disc(b.x, b.z, bore);
  };

  // straight L-tunnel carver — connectivity fallback / sealed-room connectors
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    let x = x0, z = z0; set(x, z, true);
    while (x !== x1) { x += Math.sign(x1 - x); set(x, z, true); }
    while (z !== z1) { z += Math.sign(z1 - z); set(x, z, true); }
  };

  // ── 1) chambers (organic blobs), each its own size & shape ──
  const START: Rect = { x0: 2, z0: 2, x1: 8, z1: 8 };
  const ROOM_A: Rect = { x0: 13, z0: 2, x1: 19, z1: 8 };   // rats
  const ROOM_B: Rect = { x0: 33, z0: 2, x1: 41, z1: 9 };   // bats
  const ROOM_C: Rect = { x0: 2, z0: 14, x1: 9, z1: 20 };   // skeletons
  const ROOM_D: Rect = { x0: 18, z0: 17, x1: 25, z1: 24 }; // hub (iron key)
  const ROOM_E: Rect = { x0: 33, z0: 19, x1: 41, z1: 26 }; // rabid rats
  const ROOM_SECRET: Rect = { x0: 2, z0: 30, x1: 9, z1: 37 };
  const ROOM_BOSS: Rect = { x0: 30, z0: 31, x1: 43, z1: 43 };
  const OPEN_ROOMS = [START, ROOM_A, ROOM_B, ROOM_C, ROOM_D, ROOM_E];
  const ALL_ROOMS = [...OPEN_ROOMS, ROOM_SECRET, ROOM_BOSS];
  OPEN_ROOMS.forEach((r) => blobRoom(r));
  // sealed rooms stay strictly inside their rects so the wall-ring fully encloses them
  blobRoom(ROOM_SECRET, { clampRect: true, rough: 0.5 });
  blobRoom(ROOM_BOSS, { clampRect: true, rough: 0.6 });

  const centerOf = (r: Rect): GridPos => ({ x: (r.x0 + r.x1) >> 1, z: (r.z0 + r.z1) >> 1 });

  // ── 2) a networked vein of winding tunnels (with loops, not a line) ──
  const cA = centerOf(ROOM_A), cB = centerOf(ROOM_B), cC = centerOf(ROOM_C);
  const cD = centerOf(ROOM_D), cE = centerOf(ROOM_E), cS = centerOf(START);
  const bossConnect: GridPos = { x: 25, z: 37 };
  const secretConnect: GridPos = { x: 5, z: 25 };
  const LINKS: [GridPos, GridPos, number][] = [
    [cS, cA, 1.3], [cA, cB, 1.1], [cS, cC, 1.2], [cA, cD, 1.0],
    [cC, cD, 0.9], [cD, cE, 1.1], [cE, cB, 0.8], [cD, bossConnect, 1.2],
    [cC, secretConnect, 0.9], [cS, cD, 0.8],
  ];
  for (const [a, b, bore] of LINKS) tunnel(a, b, bore);

  // ── 3) branching dead-end spurs + pocket caverns for exploration ──
  const walkableList = (): GridPos[] => {
    const out: GridPos[] = [];
    for (let x = 2; x < S - 2; x++) for (let z = 2; z < S - 2; z++) if (walk[x][z]) out.push({ x, z });
    return out;
  };
  for (let i = 0; i < 10; i++) {
    const src = walkableList();
    const s = src[Math.floor(rng() * src.length)];
    const len = 3 + Math.floor(rng() * 6);
    const dst: GridPos = { x: clamp(s.x + Math.round((rng() - 0.5) * len * 2), 2, S - 3), z: clamp(s.z + Math.round((rng() - 0.5) * len * 2), 2, S - 3) };
    tunnel(s, dst, rng() < 0.4 ? 1.2 : 0.6);   // some spurs open into little pockets
  }

  // ── 4) roughen + smooth: nibble walls then fill pinholes → cave texture ──
  const roughen = (prob: number) => {
    const snap = clone(walk);
    for (let x = 2; x < S - 2; x++) for (let z = 2; z < S - 2; z++) {
      if (!snap[x][z]) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (rng() < prob) set(x + dx, z + dz, true);
    }
  };
  roughen(0.14);
  // fill isolated single-tile holes so caves read solid, keep dead-ends
  {
    const snap = clone(walk);
    for (let x = 2; x < S - 2; x++) for (let z = 2; z < S - 2; z++) {
      if (snap[x][z]) continue;
      let n = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (snap[x + dx]?.[z + dz]) n++;
      if (n >= 4) set(x, z, true);
    }
  }

  // ── 5) seal a room to a single entrance ──
  // wall the surrounding ring, then punch the door + a connector out.
  const sealRoom = (r: Rect, door: GridPos, connectTo: GridPos, extraOpen: GridPos[] = []) => {
    for (let x = r.x0 - 1; x <= r.x1 + 1; x++) { set(x, r.z0 - 1, false); set(x, r.z1 + 1, false); }
    for (let z = r.z0 - 1; z <= r.z1 + 1; z++) { set(r.x0 - 1, z, false); set(r.x1 + 1, z, false); }
    set(door.x, door.z, true);
    for (const e of extraOpen) set(e.x, e.z, true);
    line(connectTo.x, connectTo.z, door.x, door.z);
  };

  // boss room: door on the LEFT edge, connector west into the maze
  const bossDoor: GridPos = { x: ROOM_BOSS.x0 - 1, z: 37 };
  sealRoom(ROOM_BOSS, bossDoor, bossConnect);
  // wire the boss chamber's interior so the (organic) door reaches every post
  line(bossDoor.x, bossDoor.z, 36, 37);   // door → centre/bath
  line(36, 37, 40, 41);                    // → golden chest
  line(36, 37, 33, 35); line(36, 37, 39, 35); // → honour-guard posts

  // secret room: door on the TOP edge, blocked by rubble; connector north to the maze
  const secretDoor: GridPos = { x: 5, z: ROOM_SECRET.z0 - 1 };   // (5,29)
  const secretRubble: GridPos[] = [secretDoor, { x: 5, z: 28 }];
  sealRoom(ROOM_SECRET, secretDoor, secretConnect, [{ x: 5, z: 28 }, { x: 5, z: 27 }, { x: 5, z: 26 }]);
  line(secretDoor.x, secretDoor.z, 5, 33); // door → guardian
  line(5, 33, 5, 35);                       // → secret chest
  const secretLever: GridPos = { x: 5, z: 26 };                  // on the maze side of the rubble

  // ── 6) hard border ring = solid wall ──
  for (let i = 0; i < S; i++) { walk[0][i] = walk[S - 1][i] = walk[i][0] = walk[i][S - 1] = false; }

  // ── 7) connectivity guarantee for the open rooms ──
  const partySpawn: GridPos = { x: 5, z: 5 };
  const reachableFrom = (start: GridPos): Set<string> => {
    const seen = new Set<string>([`${start.x},${start.z}`]);
    const q: GridPos[] = [start];
    while (q.length) {
      const c = q.shift()!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, nz = c.z + dz;
        if (!on(nx, nz)) continue;
        const k = `${nx},${nz}`;
        if (seen.has(k)) continue;
        seen.add(k); q.push({ x: nx, z: nz });
      }
    }
    return seen;
  };
  const centerOf2 = centerOf;
  {
    const reach = reachableFrom(partySpawn);
    // open rooms must be reachable; if not, drive a tunnel from spawn.
    for (const r of [ROOM_A, ROOM_B, ROOM_C, ROOM_D, ROOM_E]) {
      const c = centerOf2(r);      if (!reach.has(`${c.x},${c.z}`)) line(partySpawn.x, partySpawn.z, c.x, c.z);
    }
  }

  // guarantee every spawn / interactable tile is itself floor and welded to
  // its chamber (organic edges must never strand a monster inside rock).
  const weld = (p: GridPos) => {
    set(p.x, p.z, true);
    // open at least one orthogonal neighbour toward the room's interior
    if (!on(p.x + 1, p.z) && !on(p.x - 1, p.z) && !on(p.x, p.z + 1) && !on(p.x, p.z - 1)) disc(p.x, p.z, 1);
  };

  // ── 7) structures & spawns ──
  const checkpoint: GridPos = { x: 7, z: 7 };   // starter-room bonfire (respawn point)
  const structures: LevelStructures = {
    partySpawn,
    checkpoint,
    bossDoor,
    bossBath: { x: 36, z: 37 },
    bossRoom: { x0: ROOM_BOSS.x0, z0: ROOM_BOSS.z0, x1: ROOM_BOSS.x1, z1: ROOM_BOSS.z1 },
    goldenChest: { x: 40, z: 41 },
    secretLever,
    secretRubble,
    secretChest: { x: 5, z: 35 },
  };

  const spawns: DungeonSpawns = {
    party: partySpawn,
    rats: [{ x: 15, z: 4 }, { x: 17, z: 6 }, { x: 14, z: 7 }],
    bats: [{ x: 35, z: 4 }, { x: 38, z: 6 }, { x: 40, z: 8 }],
    skeletons: [{ x: 4, z: 16 }, { x: 7, z: 18 }],
    hub: [{ x: 20, z: 19 }, { x: 23, z: 20 }, { x: 24, z: 22 }],   // last → iron key
    rabid: [{ x: 35, z: 21 }, { x: 39, z: 23 }, { x: 36, z: 25 }],
    secret: { x: 5, z: 33 },
    boss: { x: 36, z: 37 },
    bossGuards: [{ x: 33, z: 35 }, { x: 39, z: 35 }],
  };

  // weld every gameplay tile to solid floor + keep it connected to its chamber
  [partySpawn, checkpoint, structures.goldenChest, structures.secretChest, structures.bossBath,
    spawns.boss, spawns.secret!, ...spawns.rats, ...spawns.bats, ...spawns.skeletons,
    ...spawns.hub, ...spawns.rabid, ...spawns.bossGuards].forEach(weld);

  // reserved tiles (don't drop blocking props on top of these)
  const reserved = new Set<string>([
    `${partySpawn.x},${partySpawn.z}`, `${checkpoint.x},${checkpoint.z}`, `${bossDoor.x},${bossDoor.z}`,
    `${secretLever.x},${secretLever.z}`, `${structures.bossBath.x},${structures.bossBath.z}`,
    `${structures.goldenChest.x},${structures.goldenChest.z}`, `${structures.secretChest.x},${structures.secretChest.z}`,
    ...secretRubble.map((p) => `${p.x},${p.z}`),
    ...[spawns.boss, spawns.secret!, ...spawns.rats, ...spawns.bats, ...spawns.skeletons,
      ...spawns.hub, ...spawns.rabid, ...spawns.bossGuards].map((p) => `${p.x},${p.z}`),
  ]);

  // ── 8) atmospheric props ──
  const props: PropPlacement[] = [];
  const put = (kind: PropPlacement['kind'], x: number, z: number, s = rng()) => {
    if (!on(x, z)) return; props.push({ kind, x, z, seed: s });
  };
  // a torch on a walkable tile near each room's edge (lights the space);
  // organic walls mean the exact corner may be rock, so search outward for floor.
  const roomTorch = (r: Rect) => {
    for (const [ox, oz] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [1, 3]]) {
      const cx = r.x0 + ox, cz = r.z0 + oz;
      if (on(cx, cz) && !reserved.has(`${cx},${cz}`)) { put('torch', cx, cz); return; }
    }
  };
  ALL_ROOMS.forEach(roomTorch);
  // the starter bonfire (respawn checkpoint) + braziers flanking the boss door
  put('bonfire', checkpoint.x, checkpoint.z, 0.5);
  put('brazier', bossDoor.x - 1, bossDoor.z - 1, 0.5);
  put('brazier', bossDoor.x - 1, bossDoor.z + 1, 0.5);
  put('brazier', 33, 41, 0.5);
  // crystals glimmer in the deeper rooms
  put('crystal_blue', centerOf(ROOM_C).x, centerOf(ROOM_C).z, 0.4);
  put('crystal_green', centerOf(ROOM_E).x, centerOf(ROOM_E).z + 1, 0.6);
  put('crystal', centerOf(ROOM_SECRET).x + 1, centerOf(ROOM_SECRET).z, 0.7);
  put('crystal_blue', 41, 33, 0.5);

  // scatter non-blocking détritus on random walkable tiles + dead-ends
  const deadends: GridPos[] = [];
  for (let x = 1; x < S - 1; x++) for (let z = 1; z < S - 1; z++) {
    if (!walk[x][z]) continue;
    let n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (on(x + dx, z + dz)) n++;
    if (n === 1) deadends.push({ x, z });
  }
  const decor: PropPlacement['kind'][] = ['bones', 'webpile', 'mushroom', 'rubble', 'stalagmite'];
  for (const d of deadends) {
    if (reserved.has(`${d.x},${d.z}`)) continue;
    if (rng() < 0.6) put(decor[Math.floor(rng() * decor.length)], d.x, d.z);
  }
  // sprinkle a few more mushrooms/bones through open corridors
  for (let i = 0; i < 40; i++) {
    const x = 1 + Math.floor(rng() * (S - 2)), z = 1 + Math.floor(rng() * (S - 2));
    if (!walk[x][z] || reserved.has(`${x},${z}`)) continue;
    if (rng() < 0.5) put(rng() < 0.5 ? 'mushroom' : 'bones', x, z);
  }
  // stalactites hang over walls near walkable tiles (decorative only)
  for (let i = 0; i < 18; i++) {
    const x = 2 + Math.floor(rng() * (S - 4)), z = 2 + Math.floor(rng() * (S - 4));
    if (walk[x][z]) continue;
    if (on(x + 1, z) || on(x - 1, z) || on(x, z + 1) || on(x, z - 1)) put('stalactite', x, z);
  }

  return { walk, structures, spawns, props };
}

// build once — deterministic so renderer + logic agree
const DUNGEON_SEED = 20260420;
const built = buildDungeon(DUNGEON_SEED);

export const dungeonLevel: LevelDef = {
  name: "The Warlord's Warren",
  icon: '🗝️',
  description: 'A twisting warren of caves. Somewhere in the dark a tyrant bathes, and a golden key waits behind an iron door.',
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
  waterColor: 0x0a1420,
  waterY: -3,
  layout: { walk: built.walk },
  structures: built.structures,
  makeRoster: () => createDungeonRoster(built.spawns),
  roster: createDungeonRoster(built.spawns),
};
