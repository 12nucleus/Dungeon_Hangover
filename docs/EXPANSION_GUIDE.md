# Expansion Guide — Dungeon Hangover

Architecture and "add content, not code" reference for LLM-driven development.
All paths relative to repo root. **Updated for shipped v0.1.0 (commit `82b43c5`).**

> Floor-specific work (levels, props, rigs, TTS) → **`docs/LLM_FLOOR_GUIDE.md`**
> Floor transitions → **`docs/FLOOR_TRANSITIONS.md`**
> Design bible → `docs/dungeon_hangover_bible/`

---

## Project Stack

| Layer | Tech | Key File |
|-------|------|----------|
| Build | Vite 7 + TypeScript 5 | `vite.config.ts` |
| Rendering | Three.js 0.185 (custom voxel engine) | `src/game/engine.ts` |
| UI Shell | React 19 + Tailwind | `src/components/` |
| Entry | `index.html` → `src/main.tsx` → `src/App.tsx` | — |
| Installer | Tauri 2 (NSIS + MSI) | `src-tauri/` |

---

## Architecture

```
React (HUD/panels)
    ↕ UISnapshot + method calls (engine.selectSkill, engine.defend, …)
engine.ts (Three.js scene, camera, input, animation loop, event queue)
    ↕ CombatEvent[] (pure events — animated one-by-one)
combat.ts (pure logic — no rendering, no Three.js imports)
    └── skills.ts, items.ts, stats.ts, dice.ts, traps.ts, classSkills.ts, quest.ts
world.ts (VoxelWorld 250×250), props.ts (decor props), destructibles.ts,
particles.ts, textures.ts, audio.ts, characters.ts (rigs), voxelModels.mjs (vox data)
engine/ (dungeonSetup, interaction, camping, gameFlow, input, combatAnimation,
         interactables, visuals, targeting, loot, tavern, sheep, IsoCamera, …)
levels/ (floor registry + floor 50 + generators) — see LLM_FLOOR_GUIDE.md
```

**Key architectural rule**: `combat.ts` has zero Three.js imports; every public
method returns `CombatEvent[]`, which the engine animates. Combat is testable
without mounting a canvas.

### File map (actual files only)

```
src/
  game/
    types.ts           — shared data types: Unit, SkillDef, Item, CombatEvent,
                         UISnapshot, GridPos, CharacterScheme, Interactable, …
    engine.ts          — GameEngine: scene, input, animation loop, event queue,
                         floor loading, save/load, narrate/speakDialogue VO.
    combat.ts          — PURE LOGIC. Combat class: initiative, skills, AI, phases.
    skills.ts          — SKILLS Record<string,SkillDef> + CONDITIONS + createRoster()
    classSkills.ts     — the 15 class skill pools (per docs/dungeon_hangover_bible/classes/)
    classes.ts         — class defs (name, icon, identity)
    skilltree.ts       — SKILL_TREES per class, canUnlock/unlockNode
    skillLookup.ts     — skill id → def resolution
    items.ts           — Item, ITEM_BASES, ENCHANTS/QUIRK_DEFS, makeItem(),
                         generateLoot(), rollLootTable(), setCursedLoot()
    stats.ts           — effAC(), effMove(), effMaxHp(), effAbility(), xpNeed(), MAX_LEVEL
    dice.ts            — rollD20(), rollDice(NdM+K), abilityMod(), fmtMod()
    npc.ts             — NPCS record: dialogue trees, schemes, VO ids
    quest.ts           — QUESTS record (hermit_finger, other_hermit_quest,
                         cursed_gold, soap_conundrum), QuestStage
    save.ts            — SaveManager, SettingsManager, SaveData, GameSettings
    world.ts           — VoxelWorld: 250×250 heightmap terrain, blocked[],
                         buildProps(), fog-of-war explored grid, WORLD_SIZE=250
    props.ts           — createProp(): voxel model data → merged THREE mesh + glow
    destructibles.ts   — DestructibleManager, DESTRUCTIBLE_DEFS (breakables + loot)
    traps.ts           — TRAP_DEFS, TrapManager (reveal/trigger/disarm/render)
    characters.ts      — buildCharacter() rigs (rat/bat/skeleton/leech/blob/
                         humanoids/chibi/orc), equip visuals, PART_PIVOTS
    voxelModels.mjs    — Vox builder + all prop/destructible/monster voxel data
    rigModels.mjs      — hi-res tavern-cutscene rig templates
    dungeonProps.ts    — iron door, golden chest, lever, rubble, stone bath, weapon rack
    particles.ts       — pool-based particles (glow 6000 + solid 3000), FX presets
    textures.ts        — procedural 64×64 canvas painters
    audio.ts           — AudioManager: WebAudio SFX, music, procedural drums
  game/engine/
    dungeonSetup.ts    — setupDungeon (set dressing from LevelStructures),
                         updateDungeon (room narration, ambushes, tether),
                         winGame, grantKey, grantLoot
    interactables.ts   — Interactable interface, register/update/trigger (E key)
    camping.ts         — bonfires, rest UI, SOBER_LINES (level-up narration)
    gameFlow.ts        — startGame/enterDungeon/saveGame/loadGame/startNewGame
    interaction.ts     — clicks, hover labels (PROP_HOVER), combat clicks
    combatAnimation.ts — animating CombatEvent[] in the scene
    targeting.ts       — skill targeting UI
    tavern.ts / tavernExterior.ts — intro cutscene (Greg's night out)
    sheep.ts           — the sheep companion
    cheats.ts          — debug cheats
  levels/
    index.ts, levelTypes.ts, floor50.ts, floor50Content.ts, dungeon.ts (legacy),
    gen/authoredMap.ts, gen/dungeonGen.ts
  components/
    GameCanvas.tsx     — Three.js mount + loading overlay
    HUD.tsx            — minimap, hotbar, party sidebar, combat log, phase ring
    Hotbar.tsx         — 6-slot item/skill bar with pins + stacking
    InventoryPanel.tsx — bag + 14 paper-doll equip slots (incl. trinket)
    MenuPanels.tsx     — settings (fullscreen/resolution), pause, loadout
    BonfireLoadout.tsx — rest menu (Skill Tree / Loadout / Inventory / Leave)
    SkillTreePanel.tsx, CharacterCreationPanel.tsx, SplashScreen.tsx,
    LoadingScreen.tsx, GregDoll.tsx, VoxelD20.tsx, VoxelItemIcon.tsx, …
```

---

## Game Loop (as shipped)

```
boot → splash → intro cutscene (tavern → pass out → wake in the sewer)
  → explore floor 50 (walk, shove/throw/ignite props, breakables, traps)
  → combat (3 phases: walk / attack / skills; Defend +1 AC; Skip)
  → loot, level-ups (sobering: pick 1 skill from ANY of the 15 class pools)
  → bonfires: rest (heal, save, hotbar edit, checkpoint moves to this fire)
  → quests: Hermit's Finger, The Other Hermit, Cursed Gold, The Soap Conundrum
  → boss: Baron Gribnab (parley OR fight; golden key → golden chest)
  → exit stairs (boss-gated) → currently winGame() = run recap
  → death: respawn at last bonfire, keep gold/loot/levels, lose position
```

Phases: `'menu' → 'explore' → 'combat' → 'victory'/'defeat'` (engine.phase).

---

## Data-Driven Recipes (add content, not code)

### New skill
1. `SKILLS` entry in `src/game/skills.ts` (`SkillDef`: name, icon, cost, cooldown,
   damageDice, appliesCondition, healDice, range, targetMode…).
2. Condition? → `CONDITIONS` in the same file (effect resolution lives in `combat.ts`).
3. Particle preset in `FX` (`src/game/particles.ts`) if it needs a new effect.
4. Class pool entry if a class should offer it (`src/game/classSkills.ts`).

### New unit / monster
1. `Unit` via `createRoster()` (`skills.ts`) or the floor's `makeRoster`
   (`src/levels/floor50.ts` — `createFloor50Roster`).
2. `scheme.monster` rig: 'rat' | 'bat' | 'skeleton' | 'leech' | 'blob' (or
   humanoid variants) — see `LLM_FLOOR_GUIDE.md §5.3`.

### New item / enchant / quirk
1. `ITEM_BASES` entry + `ENCHANTS`/`QUIRK_DEFS` in `src/game/items.ts`.
2. Slot assignment drives the paper doll (`item.slot`, `altSlots` for
   dual-wield/bucket-on-head, `twoHanded`).
3. Drops automatically via `rollLootTable()` / `generateLoot()`.

### New NPC
1. `NPCS` entry in `src/game/npc.ts`: scheme (rig colors), dialogue tree
   (`{ id, text, choices[] }` — each node's id is the VO file base name),
   quest hooks (doneNode / `nodeIdFor` fallback).
2. Spawn via `LevelStructures.npcs` (`{ npcId, pos }`).
3. VO: `public/audio/npc/<npcId>_<nodeId>[_cap].mp3` (see LLM_FLOOR_GUIDE §7).

### New quest
1. `QUESTS` entry in `src/game/quest.ts` (`QuestDef`: stages, objectives, rewards).
2. Stage transitions via engine flags (`soap_conundrum`, `gribnab_dead`, …).

### New destructible prop
1. `DESTRUCTIBLE_DEFS` + `DESTRUCTIBLE_BUILDERS` (`voxelModels.mjs`).
2. Placement: `LevelDef.destructibles` `{ defId, x, z }` (or generic SPOTS).

### New trap
1. `TRAP_DEFS` (`src/game/traps.ts`).
2. Placement: `LevelDef.traps` array or `(seed) => array`.

### New decor prop / floor / rig / TTS line
→ **`docs/LLM_FLOOR_GUIDE.md`** (sections 5–7). That's the canonical path.

---

## Combat (as shipped)

Turn ring with three phases (`turnMode: 'walk' | 'action' | 'bonus'`):
- **walk** — movement + jump only.
- **action** — the basic attack (universal 'attack'; enemy-click pool = `['attack']`).
- **bonus** — every skill; auto-advances to 'bonus' while AP remain after a skill.
- ⏭ **Skip** (`skipPhase()`) advances walk→action→bonus→endTurn.
- 🛡 **Defend** (`combat.defend(u)`) — free action, deterministic **+1 AC**
  (`defending` condition) until the unit's next turn.
- AP/movement reset in `checkEnd` when combat ends (hasAction/hasBonus/move restored).

`CombatEvent` union lives in `src/game/types.ts`; the resolution flow is
`Combat.useSkill()` in `src/game/combat.ts` (pure logic, returns `CombatEvent[]`).

---

## Progression (as shipped)

- Sobering up = leveling; `SOBER_LINES` (camping.ts) narrate each level.
- Level-up: +6 max HP, +1 skill point, pick ONE skill from any class pool.
- Equip slots: weapon, offHand, head, chest, arms, cloak, legs, boots, gloves(?),
  ring, trinket, amulet… (paper doll — see `InventoryPanel.tsx`).
- Hotbar: 6 slots, stackable consumables + pinned skills, editable at bonfires.

---

## Save / Settings

- `SaveManager` (localStorage `dh_saves_v2`), 3 slots, `SAVE_VERSION_NUMBER`.
- `SaveData` includes floor, runSeed, flags, units, inventory, gold, quests,
  explored grid, bonfire checkpoint.
- `GameSettings`: fullscreen + resolution presets (`applyDisplaySettings`),
  mute, TTS volume — persisted by `SettingsManager`.

---

## Tauri / Installer

```bash
# Windows (NSIS + MSI) — MUST pass CI=false (the harness sets CI=1 which breaks tauri)
CI=false npx tauri build
# outputs: src-tauri/target/release/app.exe
#          src-tauri/target/release/bundle/nsis/Dungeon Hangover_0.1.0_x64-setup.exe
#          src-tauri/target/release/bundle/msi/Dungeon Hangover_0.1.0_x64_en-US.msi
```

## Roadmap status (was "Roadmap to Production" — updated)

| Item | Status |
|---|---|
| Save/load | ✅ shipped (3 slots, full state incl. floor) |
| Dialogue system | ✅ shipped (NPCS trees, VO, flags) |
| Quest journal | ⚠ partial — quests exist + are tracked; journal UI not shipped |
| World zones (floor transitions) | ⚠ scaffold shipped (registry + exit stairs); floor-to-floor load next — see `FLOOR_TRANSITIONS.md` |
| SkillDef-style passive hooks | ⚠ structural gap: ~250 `SkillDef.passive` entries are design-aspirational text (only `frenzy` wired); tree `node.passive` stat bumps work — see `src/game/skills.ts` / `skilltree.ts` |
| `engine.ts` de-duplication | ⚠ partial: `src/game/engine/` sub-modules exist, monolithic `engine.ts` still has duplicated inline code (refactor plan task 5) |
| 50 floors / classes breadth | 📋 floors 1–49 designed (bible), not implemented; 15 class pools designed, subset implemented |
| Full narrator VO | ✅ floor-50 lines voiced (qwen3-tts); manifest: `DUNGEON_FLOOR_TTS_LINES.txt` |
| Multiplayer / MagicaVoxel imports | ❌ not started |
