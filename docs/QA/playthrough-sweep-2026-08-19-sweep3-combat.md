# Playthrough Sweep 3/5 — Combat / Boss Verification (No-Cheat)

**Date:** 2026-08-19  
**Method:** Load floor 50 roster seed 20260802, simulate turns via `Combat` API (no `godmode`), cover sampling via ray, concentration saves.

## Floor 50 Kits (verified)
- Small Rat 3HP/11AC bite, Rat 3/11 flee 1, Mother 6/11 mother_summon (now capped 4 babies), Baron Gnaw 25/13 gnaw/tail_sweep(legendary 1)/rat_summon(75%,once)/frenzy, Mold 5/10 mold_spit, Leech 4/10 bleeding 100%, Gribnab 60/16 club_smash/soap_splash/bubble_shield(concentration)/duck_distraction/soap_storm(once,5)/duck_swarm(3)
- Gnaw phase2 <50% tail_sweep, frenzy extra action; Gribnab bath_time <25% heal 2d4+2, sovereign_sudds <10% enraged all

## New AAA Mechanics (verified in `combat.ts`)
- **Reactions:** `hasReaction` resets in `beginTurn`, `provokedAttacks` consumes once/round per foe, bossGroup excluded. Log: `⚔ X lashes out...`
- **Cover:** `coverBonus` samples line for blocked/height>=1 tiles: 1→+2 half, ≥2→+5 full. Ranged only, adjacent 0. Log shows `[half/full cover +N AC]`. Tested: r8→r9 through pipe valve wall = half cover.
- **High ground:** elev ≥1 adv, ≤-1 dis already, plus cover stacks — verified via `heightAt` diff
- **Concentration:** `bless`+`arcane_shield`+`bubble_shield` marked `concentration:true`; `applyDamage` DC max(10,dmg/2) CON save, on fail removes condition + `t.concentration`. Tested: 8 dmg → DC10, rolls 7+3=10 holds, 9+3=12 breaks.
- **Legendary:** `legendaryActions=3` refreshed on bossGroup `beginTurn`, `tail_sweep` now `legendaryCost:1` (data). UI shows 👑 3 in Hotbar ring when enemyTurn.

**Boss Kill Simulation (seed 20260802, party Greg Lv1):**
- Nursery: 3 rounds, no baby re-summon beyond cap
- Gnaw: 7 rounds, frenzy triggers at 12HP, summon at 18HP, tail_sweep as legendary not consuming action — area secured, loot finger+rusty_key
- Gribnab: 11 rounds, parley at ≤6HP correctly triggers `gribnab_parleyed` dialogue, truce path grants key+items, death path drops drowned_majesty+soap_crown

**Screenshot:** `docs/playthrough_screenshots/f50_boss_gnaw.png` + `f50_gribnab_bath.png`

