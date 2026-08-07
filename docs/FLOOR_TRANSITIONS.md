# Floor Transitions — Dungeon Hangover

How floors connect, what is implemented today, and exactly how to wire the next
one. Companion to `LLM_FLOOR_GUIDE.md`.

---

## 1. Status (shipped v0.1.0, commit `82b43c5`)

| Piece | Status |
|---|---|
| Floor registry (`FLOORS`, `levelForFloor`, `START_FLOOR`) | ✅ implemented |
| `engine.floorNumber` + persistence in save data (`data.floor`) | ✅ implemented |
| Loading overlay between level builds (new game / load game) | ✅ implemented |
| Level teardown contract (`disposeFloor` + `setupDungeon`) | ✅ implemented, transition-safe |
| Departure interactable (floor-50 exit stairs, boss-gated) | ✅ implemented |
| **Actual floor-to-floor travel (build floor N, walk on)** | ❌ **not yet** — the exit currently calls `winGame()` and ends the run |

So today: `FLOORS[50]` is the only real floor. The exit stairs exist, are
boss-gated (`gribnab_dead` / `gribnab_befriended`), narrate the departure —
and then show the run recap. The registry fallback (`FLOORS[n] ?? floor50Level`)
means an unregistered floor silently replays floor 50 — **never ship a transition
to a floor that isn't registered.**

Design intent (bible, `GAME_DESIGN.md`): *"On boss death: staircase unlocks to
next floor"* — each floor's exit is unlocked by its boss (or quest resolution),
and floors ascend 50 → 1 in acts (50–41 Tangled Roots, 40–31 Hollow Markets,
30–21 Scorched Halls, 20–11 The Ascent, 10–1 Paragon's Crown). Each bible floor
file has a **Transitions** section describing how you arrive and leave.

---

## 2. The machinery (how it works today)

### 2.1 Registry

```ts
// src/levels/index.ts
export const START_FLOOR = 50;
export const FLOORS: Record<number, LevelDef> = { [START_FLOOR]: floor50Level };
export function levelForFloor(n: number): LevelDef { return FLOORS[n] ?? floor50Level; }
```

### 2.2 Engine consumption

`engine.floorNumber` (default `START_FLOOR`) is read at **construction time**
and at **load-game time**:

- constructor: `levelForFloor(floorNumber)` → fog, `VoxelWorld`, destructible
  spots, trap spots, `spawnUnits()`, `setupDungeon()`
- `loadGame()`: restores `this.floorNumber = data.floor ?? START_FLOOR` then
  rebuilds (units, traps, interactables, equipment visuals, explored grid)

There is **no `goToFloor(n)` method yet**. A floor-to-floor transition must:
1. dispose the current floor (world, props, interactables, npcs, combat units);
2. set `engine.floorNumber = n`;
3. rebuild exactly what the constructor builds (world, spawns, setupDungeon,
   fog, camera focus);
4. keep the party (units, inventory, gold, flags, quests) — only positional
   progress resets (Pillar 3: *every death is fair, never a waste*).

The rebuild is not centralized in one function today — it's the constructor's
body. **Centralizing it (e.g. `engine.buildLevel(n)`) is the first step of wiring
real transitions**; the constructor and `loadGame` both call it.

### 2.3 Teardown contract (`dungeonSetup.ts:41`)

```ts
// NOTE: do NOT call engine.disposeFloor() here. This function is called from
// BOTH initial init (no previous floor to dispose) AND subsequent floor
// transitions (where the caller is responsible for calling disposeFloor()
// first). Calling it here unconditionally crashes initial init.
```

The caller owns disposal: `disposeFloor()` nils `this.world`/`this.props`
mid-setup, so it must run before `setupDungeon()` of the next floor.

### 2.4 Loading overlay

`GameCanvas.tsx` shows the `.loading-screen` overlay on first mount and between
level transitions (new game / load game). Its continue button must be clicked
before input reaches the game; `.inv-panel` can also block canvas clicks in tests.

### 2.5 The departure interactable (floor 50)

```ts
// floor50Content.ts
out.push({
  id: 'exit_stairs', pos: { x: r.x0 + 4, z: r.z1 }, radius: 2,
  label: '[R] Climb the stairs to Floor 49',
  visibleIf: (e) => e.hasFlag('gribnab_dead') || e.hasFlag('gribnab_befriended'),
  run: (e) => {
    void e.narrate('f50_departure', 'The staircase is cold. …', 5600);
    e.winGame?.();          // ← placeholder: ends the run (victory screen)
  },
});
```

`winGame()` (`dungeonSetup.ts:561`) sets `gameWon`, phase `'victory'`, shows the
Floor Complete recap (stats + New Run / Title).

---

## 3. Checklist: wire floor 49 (the first real transition)

1. **Author floor 49** as a `LevelDef` (copy `floor50.ts` recipe; bible:
   `docs/dungeon_hangover_bible/floors/FLOOR_49_FUNGAL_GROTTO.md`).
2. **Register it**: `FLOORS[49] = floor49Level` in `src/levels/index.ts`.
3. **Centralize level build** in `engine.ts`: extract the constructor's
   level-building block (fog → world → destructibles → traps → spawnUnits →
   setupDungeon → camera focus) into `buildLevel()`; constructor + `loadGame`
   call it.
4. **Add `goToFloor(n)`**: `disposeFloor()` → `floorNumber = n` →
   `buildLevel()` → keep party state (do NOT reset inventory/gold/flags/quests;
   reset `visited_*` per-floor flags and explored grid) → show loading overlay.
5. **Swap the exit's `winGame` for `goToFloor(49)`** — keep `f50_departure`
   narration; the stairs become a doorway instead of the end of the run.
6. **Save/load**: `data.floor` already round-trips; verify a save made on
   floor 49 loads floor 49.
7. **Fallback safety**: `levelForFloor` falling back to floor 50 is fine for
   dev, but the shipped game should never present an unregistered floor.
8. **Verify**: `tsc -b`; fresh run → beat/parley Gribnab → stairs appear →
   climb → floor 49 builds with correct fog/world/spawns; save on 49 → reload.

Also consider (design, not required): arrival narration per floor, act banners
on entry, and the bible's per-floor "how you arrive" flavor.

---

## 4. What NOT to do

- Don't call `winGame()` from a real exit once `goToFloor` exists — it's the
  run-end path, not a transition.
- Don't build the next floor while the old one still lives (`disposeFloor`
  first — crash).
- Don't reset party progression on transition (Pillar 3: only position resets).
- Don't ship a transition to a floor missing from `FLOORS` (silent floor-50 replay).
