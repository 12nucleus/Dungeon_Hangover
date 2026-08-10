# Dungeon Hangover — Technical Status Document

**Version:** 0.1.0 (Windows) · **Branch:** master (clean, pushed) · **Build:** Tauri release (NSIS/MSI/portable)

---

## 1. Engine & Architecture

A desktop voxel roguelite built on **Tauri 2.11 + React 19 + Three.js 0.185 + TypeScript 5.9** (Vite 7). The game logic is a single plain-TS `GameEngine` class (~3,900 lines) that owns the scene, world, combat, state, and audio; React is a thin HUD over it — the engine emits flat `UISnapshot` objects and the HUD calls back into engine methods. No store/reducer; one-way data flow keeps the render loop independent of UI.

```
GameEngine (engine.ts)
 ├─ VoxelWorld — terrain grid + blocked tiles + fog of war (250×250)
 ├─ Combat (combat.ts) — pure turn logic, emits event queues → animated
 ├─ IsoCamera — tactical isometric rig (desired dist/yaw/pitch, focus, shake)
 ├─ ParticleSystem/FX — slash, fire, heal, arcane, ice, arrow, holy, bash, blood
 ├─ TrapManager / DestructibleManager — seeded traps + breakable props
 ├─ SkillTree / QuestLog / SaveManager (JSON slots, SAVE_VERSION 2)
 └─ AudioManager — 9 SFX + music + narration/npc voice-over queues
```

Code is organized into `src/game/` (engine, combat, skills, items, quests, npc, shop, save, audio, particles, characters, voxelModels) and `src/game/engine/` (per-concern modules: interaction, combatAnimation, dungeonSetup, camping, loot, input, cheats, interactables). Level content lives in `src/levels/`; a `CutsceneDirector` (title/intro/boss reveal cutscenes) shares a typed `CutsceneHost` interface.

## 2. Graphics

All geometry is hand-authored voxel construction (no model files): `voxelModels.mjs` exposes **79 prop builders** (torches, braziers, furniture, giant mushrooms, pools, waterfalls, chests, a mushroom throne…), terrain is voxel-dressed with palettes (`cave_floor`, `moss`, `marble`, `sludge`, `bone`…) and wall heights up to 6. Characters are parametric rigs from `characters.ts` — **13 rig builders** (humanoid, chibi, orc, plus rat/bat/skeleton/leech/blob/mushroom/crawler/fish/frog monsters) sharing one animation solver: walk/idle/hop, torso squash, flinch/lunge/crouch, ragdoll and revive-reset. Lighting is point-light heavy (mushrooms carry colored glow lights + drifting spore particles), with per-floor ambient/sun/fog tuning and water planes. Fog-of-war + explored-grid minimap.

## 3. Combat

Turn-based, BG3-flavored: walk → action → bonus → end-turn, d20 dice with `rollD20` (ability + proficiency vs DC), crits double dice, cover/leash per room. **15 conditions** (poisoned, nauseated, rooted/Bound, slowed, hallucinating, enraged, hungover…), **49 skills** (class + monster), shove/throw/traps/destructible-environment interactions, and a shared XP→level pipeline (`grantXp`) paying the whole party. Enemy AI uses group aggro (dormant groups, boss-only triggers, detection cones, sneak/surprise). Defeat → bonfire respawn with surviving enemies re-dormanted; victory → run recap.

## 4. Dungeon Generation

Hand-authored maps, not procedural: `buildAuthoredMap` rasterizes room rects + corridor polylines onto the world grid with fail-fast validation (BFS reachability, no overlaps); a `SCALE` grandeur pass (×2) doubles rooms/corridors, and `buildTerrain` dresses heights/palettes. Per-run variety is **seeded** (`mulberry32`): trap tiles, hidden treasure tiles, spawn jitter, loot. **Two playable floors** with real transition machinery (`goToFloor`) that keeps party/inventory/gold/flags/quests and rebuilds the world:

- **Floor 50 — Sewer Cellar** (25 rooms): hermit questline, Goblin King Gribnab (parley or fight), Baron Gnaw (boss rat), soap gate, vault, secret rooms, 4 bonfires.
- **Floor 49 — The Fungal Grotto** (18 rooms): bioluminescent mushroom garden, Spore Mother boss (smashable throne weakens her), mimic den, sleeping-giant ambush, echo chamber, hermit pool hallucination puzzles, 3 bonfires.

Floor 48 is not yet built; the grotto exit currently ends the run (`winGame`).

## 5. Quests, Items & Economy

**10 quests** in the `QuestLog` (stages: not_started → accepted → in_progress → completed/failed): floor 50 — Hermit's Finger, The Other Hermit, Cursed Gold, Soap Conundrum; floor 49 — Through the Grotto (main), Mycologist's Request, The Mushroom Child, Spore Madness, The Frog Tongue Shortage, Seven Is A Party. **83 items** (weapons/armor/consumables/trinkets/materials with tiers, enchants, rarity, on-hit conditions). Economy: gold looted/spent at the shop (Myke the Spore Merchant, 14-item stock with level gates + quest-unlocked premium shelf + loyalty discount), Scrag's dice table.

## 6. NPCs & Voice

**13 NPC definitions** with dialogue trees (choices gated on flags/items/abilities) and per-character VO: the Hermit, Other Hermit, Scrag, Gribnab, plus floor-49 cast — Hermit Shroom, Myke the Spore Merchant, Spore Mother — and **6 monster "bark" voices** fired on combat start. TTS pipeline (`scripts/gen_tts_floor49/50.py`, `gen_voice_design.py`): Qwen3-TTS-12Hz-1.7B clones the human **Narrator** sample for narration (~120 narration lines) and a VoiceDesign model **creates new character voices from text descriptions** (9 designed voices). All lines are extracted verbatim from source so subtitles match audio; missing assets degrade silently.

## 7. Game Loop & Storyline

Title → new run → character creation (**15 absurd classes**: Bar Bouncer, Gutter Rogue, Karaoke Bard, Sommelier, Barista, Accountant, Dentist, Plumber, Wedding Planner, Tabloid Reporter, Haunted Chef, Shaman…) → tavern intro → descend the Spire. Greg wakes hungover in a dream-sewer; **the Spire is alive and dreaming**, and the narrator (full Dungeon Crawler Carl energy: judgmental, meme-driven, absurd) urges him to climb to Floor 1 and ask the Paragon: *"Are you dreaming?"* Each floor is a dream-set piece — sewer cellar comedy, then the beautiful-but-wrong fungal grotto. Loop: explore → fight → level up/skills at bonfires (checkpoints = respawn + save) → boss → next floor → victory recap with run stats (kills, deaths, quests, secrets, time).

## 8. Status & Known Gaps

**Shipped:** both floors fully playable, boss fights + cutscenes (skippable), shop, 10 quests, 7 bonfires, TTS voices, cheat console (`gotofloor`, `gold`, `killall`, `superhero`, `reveal`), Windows installer build + push pipeline. **Gaps:** Floor 48+ (progression currently ends at 49), no sell-back at the shop, mob barks play once per floor, TTS regeneration is a manual script run (GPU, ~1–4 h), save/load not yet E2E-verified for floor-49 mid-run state. Frontend bundle is a single 1.7 MB JS chunk (code-split later). QA sweep docs in `docs/QA/`.
