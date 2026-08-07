# Agent Reference — Dungeon Hangover

## Commands
```
npm run dev          # dev server (vite)
npm run build        # tsc -b && vite build → dist/
npm run lint         # ESLint
CI=false npx tauri build   # Windows installer (NSIS+MSI) — CI=false is REQUIRED
```

## Architecture
React ↔ engine.ts (UISnapshot + methods) ↔ combat.ts (pure logic) ↔ Three.js scene
Data-driven: files under src/game/ and src/levels are "add content, not code".

## Where to Add Content
| What | File | Key Structure |
|------|------|---------------|
| New floor | `src/levels/index.ts` + a new `src/levels/floorNN.ts` | `FLOORS[NN] = levelNNLevel` (copy floor50.ts) |
| New decor prop | `src/game/voxelModels.mjs` + `src/levels/levelTypes.ts` | `PROP_BUILDERS` + `PropKind` union + `PROP_HOVER` (engine/interaction.ts) |
| New interactable (E-key) | `src/levels/floor50Content.ts` (per-floor) | `makeInteractables(seed) → Interactable[]` |
| New destructible prop | `src/game/voxelModels.mjs` | `DESTRUCTIBLE_BUILDERS` + `LevelDef.destructibles` |
| New trap | `src/game/traps.ts` | `TRAP_DEFS` + `LevelDef.traps` |
| New skill | `src/game/skills.ts` | `SKILLS = Record<string, SkillDef>` |
| New unit | `src/game/skills.ts` / floor `makeRoster` | `createRoster()` / `createFloor50Roster()` |
| New item / enchant / quirk | `src/game/items.ts` | `ITEM_BASES` / `ENCHANTS` / `QUIRK_DEFS` |
| New NPC | `src/game/npc.ts` | `NPCS` (dialogue nodes = VO file ids) |
| New quest | `src/game/quest.ts` | `QUESTS` |
| New skill tree node | `src/game/skilltree.ts` | `SKILL_TREES` per class |
| New rig | `src/game/characters.ts` + `voxelModels.mjs` | `buildCharacter()` dispatch / monster models |
| New TTS line | text: `DUNGEON_FLOOR_TTS_LINES.txt` + mp3: `public/audio/` | `audio/narration/<id>.mp3`, `audio/npc/<npcId>_<nodeId>.mp3` |
| New texture | `src/game/textures.ts` | painters{} + add to getTextures |
| New particle FX | `src/game/particles.ts` | FX{} |
| New condition | `src/game/skills.ts` | CONDITIONS + wire in combat.ts |

## Key Types (src/game/types.ts)
Unit, SkillDef, CombatEvent (union), Item, GridPos, DamageType, GamePhase, UISnapshot, CharacterScheme

## Level System (see docs/LLM_FLOOR_GUIDE.md for the full recipe)
- `LevelDef` = one floor; `LevelStructures` = doors/bonfires/boss/NPCs/exit stairs.
- Rooms/corridors authored map-local, scaled ×2 (`SCALE`) + offset (24,24) into the 250×250 world.
- `put()` = map-local coords (+OFFSET); `putW()` = world coords. Room rects from `map.rooms` are WORLD.
- Room first-entry narration: `roomNarration` record → `f50_room_<id>.mp3`, flag `visited_<id>`.
- Bonfires: `structures.bonfires[]` — kindling/resting moves the respawn checkpoint.
- Exit: `exitStairs` interactable (boss-gated) → currently `winGame()` (see docs/FLOOR_TRANSITIONS.md).

## Art Constants
- Dungeon prop mini-cubes: 0.055–0.09 (world units, per builder in voxelModels.mjs)
- Character mini-cubes: 0.10 (characters.ts rigs); cutscene rigs: 0.0285 (rigModels.mjs)
- Particle cubes: edge = size * 0.145
- Textures: 64×64, NearestFilter, no mipmaps
- Rig drop offset `DROP += 0.85` — never regress; myPose joints must match PART_PIVOTS

## Gotchas
- `engine.ts` / `characters.ts` are LIVE — `characters/` + `engine/camping.ts` mirrors stay in sync; never touch `engine.ts.backup`.
- Vite dev server can serve stale/empty modules after edits — restart it, curl the module to confirm.
- Node strip-types fails on extensionless TS imports — esbuild-bundle for node tests.
- Tauri build breaks with `CI=1` (harness default) — always `CI=false`.
- Browser tests: click the loading-screen continue button first; `.inv-panel` blocks canvas clicks.
- Stale saves hide unexplored-tile props until walked over (explored-grid visibility).
