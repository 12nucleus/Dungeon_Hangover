# Plan: Make Dungeon Hangover not-boring

Approved decisions:
- Stack: stay on Three.js + Tauri. Add `rapier3d-compat` physics.
- Milestone: game-feel pass + systemic verbs layer + Hermit floor-50 companion.
- Commit a baseline before any code change.

## Step 0 — Baseline commit
- `.gitignore`: add `assets-src/`, `Shots/`, `.omp/` (398 MB of raw art must not be committed).
- Commit current WIP (22 modified files + `src/levels/floor50Text.ts`) as a clean baseline.

## Step 1 — Game-feel pass (fix "clunky")
- `src/game/engine/combatAnimation.ts`: tighten idle gaps between roll → animation → damage; add hit-stop + tune existing shake/FX.
- `src/game/engine/interaction.ts`: ensure every click gives feedback (no silent no-ops).
- `src/game/engine.ts`: `markSkipped()` interrupts a mid-play cutscene.
- `src/game/engine/IsoCamera.ts`: smoother follow, faster zoom, clean iso↔first-person toggle.
- Hover labels, reachable-tile highlights, active-unit pulsing.

## Step 2a — Physics (rapier3d-compat)
- Add `@dimforge/rapier3d-compat` as a direct dependency.
- Use it only for thrown-object trajectories + collisions, toppling/knocked props, chained reactions.
- Keep existing spring rigs for character animation.

## Step 2b — Surface + verb system (fix "not BG3")
- Per-tile/per-prop surface state: `wet`, `oily`, `burning`, `frozen`, `electrified`. One owner function `applySurface()`.
- Verbs (first 4): shove (into hazards/ledges/enemies), throw any object, ignite (fire spreads across oil/webs), wet→freeze / wet→electrify. Break already exists via `destructibles.ts`.
- Wire each verb into BOTH `interaction.ts` (explore) and `combat.ts` (same code path). Start on Floor 50 with oil + wine-press + braziers + sewer water.

## Step 3 — Hermit floor-50 companion
- The Hermit joins as a temporary companion (dialogue branch), fights AI-controlled (small heal/buff + weak attack), barks, departs at the staircase.
- Files: `src/game/npc.ts`, `src/game/combat.ts` (AI turn for non-selected party unit — verify current follower behavior first), `src/levels/floor50.ts` + `floor50Content.ts`.

## Verification
- `npm run build` + `npm run lint` clean.
- Live playthrough Floor 50: shove enemy into brazier → ignite oil → throw bucket → recruit Hermit → complete a fight with him acting.
