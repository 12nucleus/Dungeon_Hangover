# Integration notes

I only had `engine.ts`, `world.ts`, `dungeon.ts`, `dungeonGen.ts` — not
`levelTypes.ts`, `props.ts`, `textures.ts`, `voxelModels.mjs`,
`dungeonProps.ts`, or `skills.ts`. I kept every external interface shape
(`LevelDef`, `LevelStructures`, `PropPlacement`, `DungeonSpawns`) exactly
as the original code used it, so this should drop in with **one small
type change** and a couple of things worth double-checking.

## 1. Required: extend `LevelDef['layout']` in `levelTypes.ts`

Add the three new terrain-pack fields as optional:

```ts
layout?: {
  walk: boolean[][];
  heights: number[][];
  floorMats?: string[][];
  wallMats?: string[][];
  wallH?: number[][];
};
```

Without this, `dungeon.ts`'s `as LevelDef['layout']` cast still compiles
(it's just a cast), but you lose type-checking on those three fields.
`world.ts` reads them defensively either way (`layout.floorMats && ...`),
so nothing breaks at runtime if you skip this — but do it for real
type safety.

## 2. Worth checking: `createDungeonRoster` in `skills.ts`

The new `dungeon.ts` keeps the exact same `DungeonSpawns` shape
(`party, rats, bats, skeletons, hub, rabid, bossGuards, boss, secret,
baronGnaw`) but the arrays are now longer (spread across ~48 rooms
instead of 5). If `createDungeonRoster` hardcodes an expected array
length per category (e.g. "rats.length must be 3"), it'll need to
either loop over whatever length it's given, or you tell me its
signature and I'll adjust `dungeon.ts`'s distribution to match.

## 3. Simplification: the secret room isn't rubble-sealed anymore

The old file walled off `ROOM_SECRET` behind rubble + a lever. To keep
the procedural version tractable I designated one room as "secret" but
left it as a normal, reachable chamber — `secretLever`/`secretRubble`
are populated with harmless placeholder values so the `LevelStructures`
shape doesn't change. Say the word and I'll wire the rubble/lever
puzzle back on top of `secretIdx`.

## 4. Voxel performance budget

`voxelTerrain.ts` exports `DEFAULT_BUDGET = { maxBoxes: 220_000 }`
(≈2.6M triangles, built once at load and merged into 2 draw calls —
flat interiors + all voxel detail). If that's too heavy for your
target hardware, lower `maxBoxes` in the `buildVoxelTerrain(...)` call
in `world.ts`; the builder will automatically double the voxel step
(0.055 → 0.11 → 0.22 …) until the level fits, and logs a console
warning when it does. Watch the console line:

```
[VoxelWorld] voxel terrain: N boxes / ~N tris @ step 0.055 (budget 220000)
```

If you regularly see `step` above `0.055`, either raise the budget or
trim `rooms`/`size` in `dungeon.ts`'s `generateDungeon(...)` call.

## 5. Color palette

Materials are no longer textured — `voxelTerrain.ts`'s
`DEFAULT_PALETTE` maps material names (`cave_floor`, `cave_stone`,
`gravel`, etc.) to flat hex colors for vertex coloring. This is a
placeholder art direction; swap in your own palette by editing
`DEFAULT_PALETTE` or passing a custom `PaletteFn` into
`buildVoxelTerrain`.

## 6. Open-world (non-dungeon) mode

`WORLD_SIZE` moved from 46 → 90. The old heightmap/river/arena mode
(`level === null`) keeps its original logic untouched but its hardcoded
`arena`/river numbers were tuned for a 46-wide map — re-tune those if
you still use that mode anywhere.
