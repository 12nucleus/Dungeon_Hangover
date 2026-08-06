# Plan: Character Creation + BG3-Style HUD + Intro Rework

Scope decisions confirmed with the user:
- **15 playable classes**, each with **all 50 skills authored** as full `SkillDef` data
  (~750 skills). Most are level-gated / passive / locked above Lv5; only Tier-1 sets
  are actually usable in the current 1–5 level game.
- **Class portraits**: rendered in-engine via `buildCharacter` with a per-class scheme
  (bouncer → pads/club, rogue → hood/dagger, …), captured to an offscreen canvas at
  runtime (or via a gen script). No external art.
- **Character creation** is triggered at the dungeon wake: Greg lies on the floor,
  curses/asks where/who he is (VO + text), then a creation UI runs → stat point-buy →
  pick 2 of 15 classes (with pros/cons + portrait) → pick 2 starting skills from the
  chosen classes → Greg stands up → exploration starts.
- **No auto-save on new-game spawn**. Save is written only when interacting with the
  bonfire (`lightBonfire` / `restAtBonfire`).
- **BG3-style bottom hotbar**: default actions (walk, run, jump, throw, etc.) plus up
  to 12 skill slots, selectable only at the bonfire, used during the game.

---

## A. Types & Data Layer

- Extend `Unit` (types.ts): dual-class support (`classes: string[]` or
  `primaryClass`/`secondaryClass`), `allocatedStats`, `hotbarLoadout`.
- Extend `SkillDef` (types.ts): add `levelReq`, `tier`, `passive`, `classId`,
  `apCost`, `requires` (combo/prereq), `procsOncePerTurn`, stacking metadata.
- New `CLASSES` registry (game/classes.ts): 15 class meta objects:
  `id, name, icon, tagline, lore, pros[], cons[], portraitScheme, tierSkills`.
- New `game/classSkills.ts`: all 750 `SkillDef`s grouped by class + tier,
  referencing the existing combat execution path where possible.
- Backfill `Klass` union / add `ClassId` type without breaking existing enemy units.

## B. Intro / Wake Cutscene Rework (cutscenes/intro.ts)

- Spawn Greg **lying on the ground** using `bakePassedOut()` (the same `loading_passout`
  pose used by the loading screen) instead of standing upright.
- After `narr_wake`, play **Greg's cursing/confused lines** (new VO ids via
  `gen_tts.py`): "Where am I… who am I… what the hell…" + narrator setup.
- Do **not** call `finishIntro()` yet. Instead set `phase = 'creation'` and hand off
  to the character-creation UI (engine stays cinematic/busy, input suppressed).
- On creation confirm: apply stats/classes/skills to the Greg unit, play a
  **stand-up animation**, then call `finishIntro()` → explore.

## C. Character Creation UI

- New React overlay `CharacterCreationPanel` (new phase `'creation'`, snapshot-driven).
- **Stat point-buy**: distribute a small pool of points across
  `str/dex/con/int/wis/cha` (D&D-style), previewing derived values.
- **Class browser**: pick 2 of 15. Each class card shows portrait (offscreen voxel
  render), lore, pros/cons, tagline.
- **Starting skills**: after classes chosen, pick 2 from the union of the two
  classes' Tier-1 skill lists.
- Confirm → writes to engine unit + starts the get-up animation.

## D. BG3-Style Hotbar

- New bottom hotbar component: persistent **default actions** (Walk, Run, Jump, Throw,
  etc.) + up to **12 skill slots**.
- Bonfire-only **loadout editor**: assign known skills to the 12 slots
  (reuses/extends the existing `equippedSkills` max-12 pattern).
- Wire hotbar clicks to existing `selectSkill`/targeting + new default-action handlers
  (run toggle, jump, throw item).

## E. Save System

- Extend `SaveData` + `saveGame`/`loadGame` to persist: `classes`, `allocatedStats`,
  `hotbarLoadout`, chosen skills.
- Guard: ensure **no `saveGame` call on new-game spawn** — only bonfire saves.

## F. Lighting: First-Room Brazier

- Add a `brazier` prop placement in the far corner of the starter room in
  `levels/dungeon.ts` (opposite the existing bonfire) so the first room has light
  before the bonfire is lit.

## G. VO Content

- Add new Greg + narrator lines for the wake/cursing beat to `scripts/gen_tts.py`
  (`greg_wake_1..n`, `narr_create`) and generate the mp3s.

---

## Execution order
1. Types & data (A)
2. Intro wake rework (B)
3. Creation UI (C)
4. Hotbar + bonfire loadout (D)
5. Save persistence + no-spawn-save guard (E)
6. First-room brazier (F)
7. VO content (G)
8. Balance check + build/test pass
