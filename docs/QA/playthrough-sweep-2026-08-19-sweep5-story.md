# Playthrough Sweep 5/5 — Story / Dialogue / Quests / Final Regression

**Date:** 2026-08-19

## Quests (QUESTS)
- `the_longest_morning` main: stages gateOpen → gribnabDown, narrated via `setFlag` hooks, progress on Gribnab truce/death
- `soap_conundrum` gate 98,50 openedByFlag `soap_gate_open` → `completeQuest` + log, any method (soap/force/charm)
- `the_other_hermit` r13 note, `hermit_finger` r15 bone pit skeleton, `cursed_gold` golden chest
- All start/progress/complete via `questLog` and emitSnapshot → J panel shows desc + rewardGold/items + xpReward

## NPCs / Dialogue (npc.ts + TTS)
- Hermit (r2 tent 52,74), Other Hermit (r13), Scrag (r9 120,64) — spawned via `structures.npcs`, proxy cylinders, rig anim `myPose` for hermits, `idle` for Scrag
- `scrag_hostile` flag: attack → summon goblin_guard Scrag 8/13, group `scrag_hostile`, combat start
- Scrag hostile path fixed: `dungeonSetup.ts:384` now checks `if(unit)` before `addUnit`
- Audio: `speakDialogue(npcId, nodeId)` plays `audio/npc/<id>_<node>.mp3`, captions fallback, `stopVo` prevents overlap, tavernGain 0.10 muffled

## Cutscenes (CutsceneDirector)
- Title `setupTitleScene` tavern exterior + moon wash, intro `playIntroCutscene` (sheep polymorph, pass-out, wake 190 builds), Gnaw `playBossRatCutscene`, Gribnab `playGribnabCutscene` (bath + sing + splash), Spore Mother `playSporeMotherCutscene` — all skip via Escape, `cutsceneSkip` fast-forwards walks
- `introGraceUntil`/`aggroGraceUntil` 2s after intro/respawn prevents swarm

## Story Polish (this pass)
- Phrase "Sovereign Sudds" kept as final-phase flavor, `sovereign_sudds` applies enraged +4 to all goblins
- `grib_bark_phase2` once: soap_storm/duck_swarm trigger GRIBNAB_BARKS.phase2 narration
- `gribnab_parley` at ≤10% HP offers fight/truce, truce sets `gribnab_befriended` dormant + golden key + 50g + bath ours log

## Final Regression
- `tsc -b` 0 errors, `vite build` 3.8MB → 1.2MB gzip (158 modules), 6.5s, no chunk warnings beyond Tauri dynamic import (expected)
- SSAO 0.55/0.06 tuned for voxel 0.055, bloom 0.58/0.48/0.85, toneMapping ACES exposure 1.12 — no white-screen, context loss recovery tested via `_loseCtxExt` 250ms retry ×40
- Hotbar: legendary 👑 badge, concentration ◉, cd fill height, `∞` for oncePerFight 999, B cost markers
- Minimap fog `explored` only, heights walkable, no canvas fog overlay

**Screenshot:** `docs/playthrough_screenshots/f49_spore_mother.png` (throne breach)

