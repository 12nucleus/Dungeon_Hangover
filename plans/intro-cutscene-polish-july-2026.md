# Intro Cutscene Polish — July 2026

Status: completed — all 8 items + 4 regressions fixed; hero torch permanently removed. Clean build `✓ 112 modules transformed · 1,165 KB (gzip 332 KB)`.
Risk: resolved. Front wall stone gaps filled, fog extended to 60 so full depth; camera follows actor focus; Greg's fall dislocation fixed; torch light erased.

## Investigation Findings

The intro cutscene lives in `src/game/cutscenes/intro.ts` (298 lines, 7 beats +
finale). It uses the `CutsceneHost` adapter so engine internals stay hidden.

| # | User Request | Current State | Fix |
|---|---|---|---|
| 1 | Remove Greg's shoulder pads | None found in `characters.ts` — likely voxels in `rigModels.mjs` `gregRigModel` that read as shoulder pads. Need to inspect & delete. | Edit `rigModels.mjs` greg parts OR characters.ts rig builder to drop shoulder voxels |
| 2 | Bring beer mug lower, on arm | Mug is parented to `handL` at `intro.ts:54` — sits in the palm. User wants it on the forearm/elbow, lower. | Parent mug to `foreL` at lower offset; reuse the hand-counter-rotation prop anim |
| 3 | Add front tavern wall | **Already built** at `tavern.ts:118-146` (door + 2 windows). The real issue: camera never faces this wall. | Add a beat where camera pans to face the door. Verify it visually matches the exterior's door (same plank colors + positions) |
| 4 | Camera doesn't follow action | Beats 2-7 use fixed angles that don't track who's talking. Wizard/maid beats are too far. | Per-beat tightening: face actor, narrow dist when they're the focus, pan back for establishing shots |
| 5 | Sheep too big + legs disconnected | Sheep scale 0.5; legs at y=0..8, body at cy=9.5 → 1.5-unit gap between leg top and body bottom. | Lower body (cy=8) OR raise legs (ly=0..9); also shrink further (scale 0.45) |
| 6 | 3s mage cast + magic particles | Currently wizard does 350ms `lunge=-0.6 → 1` then `launchMagicMissile` (orb = cube mesh). User wants 3s: staff raise → aim → cast, and replace cube with particle spell. | Add new `cast_polymorph` rig mode (3s keyframe). Replace `launchMagicMissile` with `FX.arcane` particle burst from `particles.ts`. |
| 7 | Greg falls off chair + passes out | Partially exists (`drink → lunge → flinch → passOut`). Missing the actual fall — Greg should literally drop off the stool, hit the floor, and pass out. | Add rig.position.y drop (0.4 → 0) with rotation wobble; then `passOut` already exists |
| 8 | Splash flash | `runTitleNarration` does `await cineDelay(500)` BEFORE fading to 1. React splash is visible during that window. | In `enterDungeon()`, fade to 1 IMMEDIATELY before narrating |

## Implementation Order (lowest risk first)

```
1. Fix 8  — splash flash          (5 min,  safest)
2. Fix 2  — lower mug             (10 min, single line)
3. Fix 5  — sheep legs            (15 min, single function)
4. Fix 1  — remove shoulder pads  (20 min, voxel array edit)
5. Fix 4  — camera beats          (30 min, many small tweaks)
6. Fix 3  — wall visibility beat  (30 min, add new beat)
7. Fix 6  — mage cast anim + FX   (45 min, new mode + new particle)
8. Fix 7  — Greg falls off        (45 min, position + rotation + wobble)
9. Build + smoke test             (10 min, npx tsc --noEmit + npm run build)
```

## Files Touched

- `src/game/engine.ts` — `enterDungeon()` adds `fadeTo(1)` (Fix 8)
- `src/game/cutscenes/intro.ts` — mug parenting (Fix 2), camera beats (Fix 4, Fix 3), Greg fall (Fix 7), mage cast (Fix 6)
- `src/game/engine/sheep.ts` — body+leg Y alignment + scale (Fix 5)
- `src/game/rigModels.mjs` — remove shoulder pad voxels (Fix 1)
- `src/game/characters.ts` or rigHumanoid.ts — only if shoulder pads are added by code, not just voxels
- `src/game/characters.ts` or rigTypes — possibly add new `cast_polymorph` rig mode (Fix 6)
- `src/game/particles.ts` — possibly add new `FX.polymorph` particle burst (Fix 6)
- `src/game/engine.ts` — `launchMagicMissile` host helper, may add `polymorph` helper (Fix 6)

## Verification

After each fix:
- `npx tsc --noEmit` should pass (0 errors)
- Visual check: open in dev mode, watch the intro, verify the change

Final:
- `npm run build` should pass (0 errors, bundle size unchanged or slightly smaller)
- Manual smoke test of full intro sequence

## Risk Per Fix

| Fix | Risk | Mitigation |
|---|---|---|
| 8  | None — pure CSS opacity | n/a |
| 2  | None — change parent + offset | n/a |
| 5  | None — change scale + Y | n/a |
| 1  | Low — voxel edit, easy revert | git checkout if wrong |
| 4  | Low — angle/distance tweaks | each beat is isolated |
| 3  | Low — add new beat, copy existing | n/a |
| 6  | Medium — new animation mode + FX | test with `playIntroCutscene` directly |
| 7  | Medium — coordinate with `getup` sequence | preserve finale's wake-up logic |
