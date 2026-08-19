# Playthrough Sweep 2/5 — Floor 49 The Fungal Grotto 100% + Staircase

**Date:** 2026-08-19  
**Route:** Floor 50 cleared → staircase (60,67) → Floor 49 arrival → full grotto clear  
**Transition:** `goToFloor(49)` keeps party level/XP/skills/equipment, resets position to spawn, re-arms flags, companion Hermit departs correctly with log.

## Result: PASS

- Staircase interactable at r25 bath chamber opens after Gribnab door flag `gribnab_door_open`; `winGame` not called on floor 50 (staircase is exit)
- goToFloor keeps 6-slot hotbar, inventory, gold, flags; `visited_*` flags cleared, `mobsBarked` reset, `bonfireLit` false
- Floor 49 loads: Spore Mother throne (single 6x6 room + 2 antechambers), mushroom props (mushroom/blue/green glow), spore throne destructible (`spore_throne_destroyed` weakens Mother -15 maxHP)
- `setDropletWanted(false)` on floor 49 (no cave drip), ambience wet true in fungal rooms
- All mushrooms beat `f49_arrival` narration fires once, quest `through_grotto` starts
- PBR: marble/bone/sludge floors tint correctly under StandardMaterial 0.85 roughness

**Fix:** `engine.ts:752` dressingGroup teardown loops `doorMeshes` before `disposeFloor` to avoid leak on transition; `audio.setDropletWanted` toggles correctly.

**Screenshot:** `docs/playthrough_screenshots/f49_grotto.png`

