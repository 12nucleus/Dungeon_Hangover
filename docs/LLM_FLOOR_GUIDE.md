# LLM Floor Guide — Dungeon Hangover

**The authoritative guide for adding floors, props, rigs and TTS lines.** Read this
before touching anything under `src/levels/`, `src/game/voxelModels.mjs`,
`src/game/rigModels.mjs`, `src/game/props.ts`, `src/game/characters.ts` or the
narration audio folders. It describes the system as it exists TODAY (shipped
installer v0.1.0, commit `82b43c5`).

Companion docs:
- `docs/FLOOR_TRANSITIONS.md` — the floor-transition machinery in detail
- `docs/EXPANSION_GUIDE.md` — general "add content, not code" recipes (skills, items, NPCs, quests)
- `docs/QWEN3_TTS_USAGE.md` — how the TTS models generate the narration mp3s
- `docs/dungeon_hangover_bible/` — the 50-floor design bible (floors 1–49 are DESIGN only)

---

## 1. The floor system at a glance

```
src/levels/
  index.ts            FLOORS registry (floor number → LevelDef) + levelForFloor()
  levelTypes.ts       LevelDef, LevelStructures, PropKind, PropPlacement, Rect, LevelLayout
  floor50.ts          THE shipped floor (authored sewer cellar) — the template to copy
  floor50Content.ts   per-floor interactables + NPC wiring for floor 50
  dungeon.ts          LEGACY procedural level ("Warlord's Warren") — unused by the live
                      engine (only engine.ts.backup imports it). Keep for generator reference.
  gen/
    authoredMap.ts    buildAuthoredMap(): rooms+corridors → walkability grid
    dungeonGen.ts     buildTerrain(): heights/materials; generateDungeon(): blob-carver
```

A **floor** is a `LevelDef` (pure data) registered in `FLOORS`. The engine builds
everything from it: `VoxelWorld` terrain, props, destructibles, traps, roster,
interactables, lighting, narration. **Adding a floor = adding one `LevelDef` +
one registry entry + (for authored floors) a `buildAuthoredMap` layout.** No
engine code changes required for content floors.

```ts
// src/levels/index.ts
export const START_FLOOR = 50;
export const FLOORS: Record<number, LevelDef> = {
  [START_FLOOR]: floor50Level,
  // 49: floor49Level,   ← append here
};
export function levelForFloor(n: number): LevelDef {
  return FLOORS[n] ?? floor50Level;   // ⚠ fallback replays floor 50 for missing floors
}
```

The engine holds `engine.floorNumber` (default `START_FLOOR`) and calls
`levelForFloor(this.floorNumber)` everywhere it needs the level: fog/background,
`VoxelWorld` construction, destructible spots, trap spots, `spawnUnits()`,
`setupDungeon()`. `floorNumber` is persisted in save data (`data.floor`).

---

## 2. LevelDef — every field

`src/levels/levelTypes.ts`

| Field | Type | Purpose |
|---|---|---|
| `name` / `icon` / `description` | string | save-slot + UI strings |
| `groundMats` | string[] | top-face material names per height tier (index 0..3) |
| `fillMats` | string[] | wall/block side-face materials |
| `arena` | rect | walkable bounds (used by camera/combat range logic) |
| `spawn` | `{ party: GridPos[]; enemies: GridPos[] }` | legacy spawn fields |
| `props` | `PropPlacement[]` | decor props → `world.buildProps()` via `createProp()` |
| `ambient` / `sun` / `fill` | number | light intensities |
| `fogColor` / `fogDensity` | number | scene fog (also drives background) |
| `waterColor` / `waterY` | number | water sheet appearance |
| `roster` / `makeRoster?` | `Unit[]` / `(seed) => Unit[]` | monster+companion roster; **prefer `makeRoster`** (fresh per run, seed-jittered spawns) |
| `layout?` | `LevelLayout` | `walk[][]`, optional `heights[][]`, `floorMats[][]`, `wallMats[][]`, `wallH[][]`, `water[][]` |
| `structures?` | `LevelStructures` | doors, bonfires, boss room, chests, NPCs, exit stairs, rooms… (below) |
| `traps?` | array or `(seed) => array` | `{ defId, x, z }` placements |
| `destructibles?` | array | `{ defId, x, z }` crate/barrel/chest spots |
| `makeInteractables?` | `(seed) => Interactable[]` | per-run interactable defs (E-key prompts) |
| `roomOf?` | `(x, z) => string \| null` | which authored room a world tile is in |
| `roomNarration?` | `Record<string, string>` | first-entry narrator text per room id |
| `hazards?` | `{ tile, kind }[]` | shove targets (wine press, bath tub) |
| `makeHiddenTreasures?` | `(seed) => GridPos[]` | per-run hidden treasure tiles |

### LevelStructures (interactive bones of the floor)

| Field | Purpose |
|---|---|
| `partySpawn` | where Greg wakes |
| `checkpoint?` | starter bonfire tile (spawn-respawn point) |
| `bonfires?` | `GridPos[]` — **all** bonfires, checkpoint first; kindling/resting at any fire MOVES the active checkpoint (respawn + save follow it) |
| `bossDoor` / `bossBath` / `bossRoom` | iron door tile, boss seat, cutscene trigger rect |
| `goldenChest` | locked chest opened by the boss's golden key |
| `secretLever` / `secretRubble[]` / `secretChest` | hidden-room machinery |
| `hermitChamber?` / `hiddenTreasures?` / `mezzanines?` / `stairs?` / `collapsedDeadEnds?` | misc structure helpers |
| `doors?` | authored doors `{ id, pos, axis: 'x'\|'z', openedByFlag }` — blocked until flag |
| `blockers?` | authored rubble/secret-door tile groups cleared by a flag |
| `arenaRect?` | boss-rat arena trigger rect (floor 50) |
| `exitStairs?` | the departure interactable tile (floor 50 → 49) |
| `rooms?` | `{ id, name, rect }[]` — room list for entry narration + minimap markers |
| `npcs?` | `{ npcId, pos }[]` — hand-authored NPC spawns (looked up in `NPCS`) |
| `bossDoorOpenFlag?` | override for what opens the boss door |

---

## 3. The floor-50 recipe (template for a new authored floor)

`src/levels/floor50.ts` is a fully working template — copy its structure for floor 49.

### 3.1 Constants

```ts
const S = WORLD_SIZE;                       // 250 (src/game/world.ts)
const OFFSET: GridPos = { x: 24, z: 24 };   // map-local → world offset
const SCALE = 2.0;                          // grandeur scale, every authored dim ×2
const sc = (n: number) => Math.round(n * SCALE);
```

The authored content (rooms/corridors) is written **map-local, unscaled**, then
scaled and offset into the 250×250 world grid. All world-coordinate helpers:

```ts
const O  = (p: GridPos): GridPos => ({ x: p.x + OFFSET.x, z: p.z + OFFSET.z });  // map→world
const OX = (x: number, z: number): GridPos => ({ x: x + OFFSET.x, z: z + OFFSET.z });
```

### 3.2 Rooms + corridors → walkability

```ts
const ROOM_SPECS: RoomSpec[] = [
  { id: 'r1', name: "Bonfire Cell", x0: 18, z0: 35, w: 4, h: 4, floor: 'stone' },
  // ... 25 rooms: r1..r25
];
const CORRIDOR_SPECS: CorridorSpec[] = [
  { pts: [{ x: 54, z: 10 }, { x: 54, z: 11 }], width: 2 },  // polyline; width 1 = gate/seal lane
  // ...
];
const map = buildAuthoredMap(S, OFFSET, ROOMS, CORRIDORS);  // gen/authoredMap.ts
validateAuthoredMap(map, ROOMS);                            // dev-time sanity asserts
```

`buildAuthoredMap(size, offset, rooms, corridors)` returns an `AuthoredMap`:
`walk[][]`, `water[][]`, `floorMats[][]`, `roomOf(x,z)`, and `rooms` (record of
`{ id, rect }` **in world coordinates** — rects are scaled+offset). `width: 1`
corridors are seal/gate lanes (see §3.4).

### 3.3 Terrain

```ts
const terrain = buildTerrain(map.walk, {
  seed: 20260802,        // fixed per floor → deterministic
  floorBase: 1,
  floorSteps: 0,         // flat sewers; >0 terraces the floor
  // ... wallH, materials, water config (see TerrainConfig in gen/dungeonGen.ts)
});
// post-process: overlay authored floor materials on walkable tiles
const floorMats = terrain.floorMats;
for (let x = 0; x < S; x++) for (let z = 0; z < S; z++)
  if (map.walk[x][z]) floorMats[x][z] = map.floorMats[x][z];
```

`buildTerrain(walk, cfg)` produces `heights[][]`, `floorMats[][]`, `wallMats[][]`,
`wallH[][]` — the actual block geometry is instanced by `VoxelWorld`. Mezzanine
plateaus are done in floor50 via `plateaus[]` + post-terrain height patches
(see `r24r`/`r25r` mezzanine code).

### 3.4 Safety: reserved tiles & gate lanes

```ts
const reserved = new Set<string>();          // nothing (decor) may occupy these
const reserve = (p: GridPos) => reserved.add(`${p.x},${p.z}`);
[partySpawn, checkpoint, bossDoor, bossBath, goldenChest, secretChest, hermitChamber, exitStairs]
  .forEach(reserve);
// doors, blockers, NPCs are reserved too

const BLOCKING_KINDS = new Set(['torch', 'bonfire', 'brazier', 'tent', 'campfire', 'crate', 'stalagmite', 'boulder']);
// blocking props may NEVER sit on a width-1 gate lane (they would seal it)
```

The `put()` helper enforces all of this:

```ts
const put = (kind: PropPlacement['kind'], x: number, z: number, s = rng()) => {
  const wx = x + OFFSET.x, wz = z + OFFSET.z;
  if (!on(wx, wz)) return;                    // must be walkable
  // reserved-check + gate-lane check + blocking-prop pinch check
  props.push({ kind, x: wx, z: wz, seed: s });
};
// world-coord convenience (prop placement code prefers it):
const putW = (kind: PropKind, wx: number, wz: number, s = 0.5) =>
  put(kind, wx - OFFSET.x, wz - OFFSET.z, s);
```

⚠ **`put()` takes MAP-LOCAL coords and adds OFFSET; `putW()` takes WORLD coords.**
`map.rooms.<id>` rects are world coords — use `putW` with them.

### 3.5 Spawns, rooms, narration, interactables

```ts
const FLOOR50_SPAWNS = { party: partySpawn, rooms: { r3: map.rooms.r3, /* … */ } };
// createFloor50Roster(spawns, seed) — in floor50.ts or a sibling: spawns the
// monsters/NPCs per room, boss placement, etc.

export const floor50Level: LevelDef = {
  name: 'The Sewer Cellar', icon: '🐀', description: '…',
  structures,                       // from §3.2/3.3 + LevelStructures assembly
  roomOf: (x, z) => map.roomOf(x, z),
  roomNarration: ROOM_NARRATION,    // Record<'r1'..'r25', string> — bible verbatim
  makeRoster: (seed) => createFloor50Roster(FLOOR50_SPAWNS, seed ?? 20260802),
  makeInteractables: (seed) => floor50Interactables(seed, map.rooms),
  makeHiddenTreasures: (seed) => /* per-run tiles */,
  traps: (seed) => /* per-run trap spots */,
  hazards: [...],
};
export const F50_DEBUG = { ROOMS, CORRIDORS, map, structures, OFFSET, reserved, FLOOR50_SPAWNS };
```

Room entry narration is automatic: `dungeonSetup.updateDungeon` calls
`roomOf(leader.pos)`, sets `visited_<roomId>`, and narrates
`f50_room_<roomId>` from `roomNarration` on first entry (even mid-combat).
R1 is pre-flagged (`visited_r1`) because the intro covers arrival.

### 3.6 Interactables (E-key content)

`floor50Content.ts` — `floor50Interactables(seed, rooms) → Interactable[]`:

```ts
interface Interactable {
  id: string;
  pos: GridPos;
  radius: number;                       // Chebyshev tiles from party leader
  label: string;                        // "[R] Drink from the puddle"
  visibleIf?: (e) => boolean;           // flag-gated (boss dead, etc.)
  once?: boolean;                       // auto-hides after `did_<id>` flag
  run(e: GameEngineLike): void;         // the action
}
```

Helpers in floor50Content: `once(id, x, z, label, body)` (one-shot), `narr(id, text)`
(narrate + log), `grant(e, itemIds[], gold)`, `flagCount(e, prefix)` (e.g. duck
counts). Flags drive everything: `gribnab_dead` / `gribnab_befriended` open the
exit stairs; `soap_conundrum` stages gate the soap quest.

---

## 4. Floor transitions

Current status (shipped): **the machinery exists, the actual floor-to-floor load
does not — the floor-50 exit ends the run** (`winGame`). See
`docs/FLOOR_TRANSITIONS.md` for the full spec and the checklist to wire floor 49.

What exists in code:
- `FLOORS` registry + `levelForFloor()` + `engine.floorNumber` (persisted in saves).
- `setupDungeon()` is transition-safe: it must be called AFTER the previous floor
  is disposed (comment in `dungeonSetup.ts:41` — do NOT call `disposeFloor()`
  inside it; the caller owns disposal).
- `GameCanvas` shows a loading overlay between level transitions (new game / load game).
- The departure point: `exit_stairs` interactable (r25 bath chamber, radius 2,
  visible when Gribnab is dead/befriended) narrates `f50_departure` then calls
  `e.winGame?.()` — the run recap screen.

---

## 5. Voxel art system ("vox generation")

All models are **built from code at runtime** — no asset files. Two libraries:

### 5.1 `src/game/voxelModels.mjs` — prop + monster voxel data (plain JS)

- `Vox` class: coordinate-dedup voxel store. `add(x,y,z,color)`, `addM` (mirror x),
  `fill(x1,y1,z1,x2,y2,z2,color)`, `fillM`, `disc`, `ring`, `shell`, `list() → cells`.
- Deterministic RNG: `rng(seed)` (mulberry32), `shade(hex,f)`, `mix(a,b,t)`.
- **Prop builders** (`prop*` functions, ~48): `propStalagmite`, `propCrate`,
  `propPuddle`, `propBucket`, `propBody`, `propThrone` … each `(seed = 0.5) → PropModel`.
- `PROP_BUILDERS: Record<string, (seed?) => PropModel>` — the registry `props.ts` looks up.
- **Destructible builders**: `destrCrate`, `destrBarrel`, `destrVase`, `destrChest`,
  `destrSack`, `destrUrn` + `DESTRUCTIBLE_BUILDERS` registry.
- **Monster models**: `orcModel(scheme, weapon)`, `ratModel(scheme)`,
  `batModel(scheme)`, `skeletonModel(scheme, weapon)` (used by `characters.ts` rigs),
  `weaponVoxels(kind, accent)`.

Type declarations live in `src/game/voxelModels.d.mts` (the `.mjs` is imported
from TS with types via that sidecar).

### 5.2 `src/game/rigModels.mjs` — hi-res cutscene rig templates

`gregRigModel()`, `patronRigModel()` — tavern-cutscene characters at cube edge
`0.0285` with per-part pivots. These are for cutscene-quality rigs; gameplay
rigs use `characters.ts` (cube 0.10).

### 5.3 `src/game/characters.ts` — gameplay rigs

```ts
buildCharacter(scheme: CharacterScheme, weapon?: WeaponKind): Rig
// dispatch:
//   monster: rat | bat | skeleton | leech | blob   → dedicated animal rigs
//   kind:    wizard | barmaid | bouncer | barkeep  → humanoid feat variants
//   style:   'normal' → buildPlayerRig | orc → buildOrcRig | else chibi
```

- `Rig` = `{ group, parts, anim, pivots, equipped? }`; `buildHierarchy()` wires
  part pivots; `updateRig(rig, dt, speed)` animates (idle/walk/attack, squash).
- `PART_PIVOTS` (characters.ts:2081) — per-part local-space pivots; **myPose
  joint values must match the pivot layout** (hermit/other_hermit use `'myPose'`).
- Equipment visuals: `equip(rig, EquipVisual)`, `unequip`, `unequipAll`,
  `itemToEquipVisual(item, slotOverride?)`, `setWeapon(rig, kind|null, accent)`.
  `equip()` hides hair under headgear; `unequip()` restores it.
- `bakePassedOut(rig)` — lie-flat death pose (slight per-instance jitter).
- Monster scheme flag `monster: 'leech'|'blob'` extends the union in
  `CharacterScheme`; rigs are `buildLeechRig` / `buildBlobRig` (voxel sizes:
  leech 0.36×0.31×0.87 worm, blob 0.76×0.36×0.71 dome).

**Rule: `DROP += 0.85`** must stay in `buildPlayerRig`/chibi/other rigs — the
drop offset that seats a standing rig on the floor. Never regress it.

### 5.4 `src/game/props.ts` — prop factory (model data → THREE meshes)

```ts
createProp(kind: string, wx: number, groundTopY: number, wz: number, seed = 0.5): BuiltProp | null
// looks up PROP_BUILDERS[kind]; merges voxel cells into ONE vertex-colored mesh
// (propMat, MeshLambertMaterial); adds glow sprite (halo) + ParticleField for
// emissive kinds (torch/brazier/bonfire/mushroom); returns null for unknown kinds.
```

Used by `VoxelWorld.buildProps()` which walks `level.props` and places each via
`createProp` at the tile's top surface. World props carry `userData.propKind`
(for hover labels) and are hidden on unexplored tiles
(`updateExploredVisibility` — a stale save can show nothing until walked over).

### 5.5 Set dressing — `src/game/dungeonProps.ts`

`buildIronDoor(axis)`, `buildGoldenChest()`, `buildLever()`, `buildRubble(seed)`,
`buildStoneBath()`, `buildWeaponRack()` — placed by `setupDungeon` from
`LevelStructures` (boss door, bath, lever, rubble, chests).

### 5.6 Art constants (never change casually)

| Asset | Cube edge |
|---|---|
| Dungeon props (voxelModels props) | 0.055–0.09 (per builder) |
| Character mini-cubes (characters.ts rigs) | 0.10 |
| Hi-res cutscene rigs (rigModels.mjs) | 0.0285 |
| Particle cubes | `size * 0.145` |
| Textures | 64×64, NearestFilter, no mipmaps |

---

## 6. Props

Two distinct prop systems — do not confuse them:

| System | File | Purpose | Placed by |
|---|---|---|---|
| **Decor props** | `voxelModels.mjs` + `props.ts` | visible dressing: puddle, throne, well, torches… | `LevelDef.props` via `put/putW` in the floor file |
| **Interactables** | `engine/interactables.ts` + `floor50Content.ts` | E-key prompts: drink, take, open, examine | `LevelDef.makeInteractables` |
| **Destructibles** | `destructibles.ts` | breakable crates/barrels/vases/chests with loot | `LevelDef.destructibles` |
| **Set dressing** | `dungeonProps.ts` | iron doors, bath, chests, lever, rubble | `LevelStructures` in `setupDungeon` |

To add a new decor prop kind:
1. Build it in `voxelModels.mjs` (`propXxx(seed)` using `Vox`), return `PropModel`.
2. Register in `PROP_BUILDERS`.
3. Add the kind to the `PropKind` union in `levelTypes.ts`.
4. Add a hover label to `PROP_HOVER` in `engine/interaction.ts` (optional but expected).
5. Place it in the floor file with `putW('xxx', wx, wz, seed)`.

Prop counts (current floor 50): ~162 placed props, ~28 interactable-kind.

---

## 7. TTS / narration pipeline

### 7.1 How a line becomes audio

| Call | Audio it plays | Fallback |
|---|---|---|
| `engine.narrate(id, text, minMs?)` | `public/audio/narration/<id>.mp3` | text-only subtitle (captioned if mp3 missing) |
| `engine.speakDialogue(npcId, nodeId)` | `public/audio/npc/<npcId>_<nodeId>_cap.mp3` then `<npcId>_<nodeId>.mp3` | text-only dialogue |
| class card click | `public/audio/narration/class_<classId>.mp3` | silent |

`narrate` is skip-aware (`cineDelay`): the subtitle holds for the audio duration
(or `minMs` if the file is missing). **Voices never overlap**: one central VO
manager (`engine.stopVo()`/`playVo()`) cuts whatever is playing the instant a
new line starts — a newer `narrate`, `speakDialogue`, or class card click takes
over immediately, and cutscene skip (`markSkipped`/ESC/Space), dialogue close,
new game and load all silence the current voice. `speakDialogue` uses a
superseding token — clicking through a conversation never stacks voices.

### 7.2 Where the ids come from

- **Interactables/events**: explicit ids — `f50_puddle`, `f50_departure`,
  `f50_ambush`… (floor50Content.ts, dungeonSetup.ts).
- **Rooms**: `f50_room_<roomId>` from `LevelDef.roomNarration` (first entry per run).
- **Level-ups**: `sober_<level>` from `SOBER_LINES` (`engine/camping.ts`, keyed 2..6).
- **NPC dialogue**: `<npcId>_<nodeId>` per dialogue node in `src/game/npc.ts`
  (e.g. `hermit_intro`, `scrag_soap_done`); `_cap` variant plays first when present.
- **Intro/tavern cutscenes**: `narr_*`, `greg_*`, `title_*` ids (gameFlow/tavern).

### 7.3 The manifest — rewrite lines by editing text

`DUNGEON_FLOOR_TTS_LINES.txt` (repo root) lists every floor-50 TTS line:
`[id]  (source file)` + verbatim text. **To re-write a line: edit the TEXT there,
regenerate the mp3 under the SAME id** (see `docs/QWEN3_TTS_USAGE.md` — qwen3-tts
CustomVoice/VoiceDesign; edge-tts was the original Phase-3 voice plan), and the
game picks it up. Missing mp3 → caption fallback, never a crash.

### 7.4 Voice-over assets today

`public/audio/narration/` (~95 mp3s: `f50_*`, `sober_*`, `narr_*`, `class_*`),
`public/audio/npc/` (~35 mp3s incl. `*_cap` intros), plus SFX/music at
`public/audio/` root. Audio loading is via `audio.ts` (WebAudio buffers) and
plain `new Audio(url)` for VO.

---

## 8. Verification loop (do this for any floor/prop/rig change)

```bash
npx tsc -b                          # typecheck (must be exit 0)
npm run dev                         # dev server, then browser-verify
```

- **Vite stale-transform gotcha**: after editing files under a running dev
  server, `/src/<file>.ts` can serve an EMPTY module — restart the dev server,
  then curl the module to confirm non-zero bytes.
- Node can't import extensionless TS directly (`--experimental-strip-types`
  fails on `'./x'` imports); for logic tests, bundle with esbuild:
  `node_modules/@esbuild/win32-x64/esbuild.exe <file> --bundle --format=esm
  --outfile=out.mjs --log-level=error && node out.mjs`.
- Live-engine checks: `window.__dh_engine` exposes the engine handle — verify
  `floorNumber`, `structures`, `bonfireSpots`, `combat`, `roomNarration` etc.
- The loading screen's continue button and `.inv-panel` overlay can block input
  in browser tests — click them away first.

## 9. Do's & Don'ts

**DO**
- Copy `floor50.ts` as the template for a new floor; keep `F50_DEBUG`-style exports.
- Use `putW` with world-coord rects (`map.rooms.*`); `put` only with map-local coords.
- Reserve every structural tile; never let blocking props touch width-1 gate lanes.
- Use `makeRoster`/`makeInteractables`/`traps` as FUNCTIONS when the content should
  vary per run — they receive `runSeed`.
- Register every new prop kind in `PROP_BUILDERS` + `PropKind` + `PROP_HOVER`.
- Add TTS ids to `DUNGEON_FLOOR_TTS_LINES.txt` when you add narrate calls.

**DON'T**
- Don't change `DROP += 0.85` or `PART_PIVOTS` without re-verifying every rig
  (myPose joints, chibi, hermit sitting poses).
- Don't call `disposeFloor()` inside `setupDungeon` (crash on first init).
- Don't rely on `roster` for run-varying content — use `makeRoster`.
- Don't place props on tiles `reserved`/explored-hiding will fight: stale saves
  hide unexplored-tile props until walked over (tell players, don't chase it).
- Don't edit `engine.ts.backup` — it's a recovery snapshot, never shipped.
