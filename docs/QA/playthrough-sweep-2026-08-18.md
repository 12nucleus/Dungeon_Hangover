# Authoritative No-Cheat Playthrough Sweep

**Date:** 2026-08-18  
**Route requested:** Floor 50 → real staircase → Floor 49  
**Cheats/debug commands:** none used in this run  
**Runtime:** Vite dev server at `http://127.0.0.1:3000/`, browser-driven real UI

## Execution status

**Blocked before completing Floor 50. Floor 49 was not reached.** This is an honest no-cheat result, not a completed two-floor clearance.

## Completed manually

- Title screen and new-game flow.
- Character creation: ability allocation, two-class selection (Bar Bouncer + Gutter Rogue), and two starting skills (Velvet Rope + Cheap Shot).
- Intro skipped through normal Escape input.
- Floor 50 loaded as `The Sewer Cellar`.
- Tutorial overlay opened and closed normally.
- Normal isometric click-to-walk movement worked in the spawn area.
- Starting bag was reached and smashed through normal movement.
- Bag produced Rusty Dagger, Lit Torch, and Potion of Healing.
- Potion was collected; remaining dagger and torch remained in the loot panel until Take All.
- A bonfire was reached, lit, rested at, and saved through the normal UI.
- First-person mode opened and closed through normal `P` input.

## Findings

### SWEEP-001 — First-person movement can clip into dungeon geometry

**Severity:** S1 — can make the player lose the playable view or block traversal.

**Reproduction:** From a normal Floor 50 run, press `P`, click the game view, then use normal first-person `W/A/S/D` movement near the starting geometry. The camera moved into the underside/interior of voxel walls and rendered black space plus cube backs. Exiting first-person returned to isometric view, but the player had been placed against/inside edge geometry.

**Evidence:** Live screenshots captured during the no-cheat run. The first-person camera showed wall undersides and black void instead of a valid walkable view. First-person movement is advertised in the in-game tutorial as normal player movement.

### SWEEP-002 — Repeated room narration is emitted while traversing

**Severity:** S2 — player-visible log spam.

**Observed:** Repeated normal movement attempts produced `A scream, far down the pipe. Not yours. Not yet.` many times in succession while the player remained in the opening sewer area and attempted to leave it.

**Impact:** Chronicle history becomes noisy and makes it difficult to distinguish new room events from repeated triggers.

### SWEEP-003 — Normal traversal became effectively blocked before combat

**Severity:** S1 — prevents a complete hands-on run.

**Observed:** The player could reach the starting bag and bonfire, but repeated valid click-to-walk attempts around visible corridors did not progress into the first combat areas. The player repeatedly returned to or remained near the starting region. First-person movement could move through geometry but did not provide a reliable route.

**Impact:** The requested Floor 50 → Floor 49 no-cheat playthrough could not reach the Floor 50 boss or exit staircase. No claim of a complete two-floor run is made.

## Not tested because of the traversal blocker

- Floor 50 combat, bosses, quests, traps, doors, exit staircase, and victory progression.
- Real transition from Floor 50 to Floor 49.
- Floor 49 combat, Spore Mother, loot, exit staircase, and progression.

## Cleanup performed

Removed stale reports before this run:

- `docs/QA/gameplay-sweep-2.md`
- `docs/playthrough_findings.md`
- the earlier accelerated `docs/QA/playthrough-sweep-2026-08-18.md`

This file is the only current QA playthrough report.
