# Playthrough Sweep 4/5 — Traps / Hazards / Surfaces / Loot

**Date:** 2026-08-19

## Traps (floor50Traps)
- Seeded via `mulberry32(seed ^ room)`, `floor50Traps(seed, map.rooms, map.walk, reserved)` — all walkable, not on reserved/gate
- Reveal: WIS+prof vs DC via `revealCheck` 5 tiles, also perception roll on room enter `d20+WIS+prof vs 14` → reveals traps + glints treasures + hints secretDoor. Verified: room r3 entry with WIS 11 (+0) +2 prof rolled 13 → success revealed spike trap.
- Disarm: DEX+prof vs DC12, on fail triggers `triggerTrap` (crumble + shake + dmg dice + cond). On success removes mesh + trapEls + gives 3-10 gold. Tested: r7 leech trap disarmed 15 vs 12 → gold 7.
- Trigger: `triggerTrap` now kills 0HP zombie guard (sets `alive=false`) — explore tick routes to defeat correctly.

## Hazards
- `floor50Hazards` wine_press (r6) 10 dmg + crush, bath (r25) 5 + scalded — `hazardUsed` Set per fight, cleared on `phase explore`. Tested shove into press: 10 dmg + float -10.
- `surfaces`: oil/wet seeded, `ignite` on fire AoE, `frozen` on ice AoE — verified `surfaces.ignite(at.x,at.z,rad)` in `animSkillFx`.

## Loot
- `rollLootTable` tiers 10, `ITEM_BASES` multi-effect (good/bad/ridiculous), `deathDrops` random pools draw count correctly (Mother drops leather + trinket)
- `offerLoot` queues during combat, `flushLootQueue` on explore — no overlap
- `hiddenTreasures` 6 gold on first step, flag `ht_idx`, secretFound++

**Graphics:** Trap mesh `MeshStandardMaterial` shadowed, oil surface shimmer via PBR roughness 0.25.

