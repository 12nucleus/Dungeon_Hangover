# Playthrough Sweep 1/5 — Floor 50 The Sewer Cellar 100%

**Date:** 2026-08-19  
**Route:** Floor 50 full clear (new game → all rooms → both bosses → staircase)  
**Seed:** 20260802 (canon) + 3 random seeds (1337, 42, 999) for connectivity  
**Cheats:** none (except post-clear verification via `reveal`)

## Result: PASS — 100% reachable, 25/25 rooms

**Connectivity verified via `scripts/sweep_check.mjs`:**  
- Walkable 4325 tiles, 0 unreachable from spawn (62,96)
- All 25 rooms OK: r1 64/64, r2 36/36, r3 64/64, r4 100/100, r5 144/144, r6 112/112, r7 80/80, r8 64/64, r9 36/36, r10 48/48, r11 48/48, r12 100/100, r13 36/36, r14 36, r15 144, r16 36, r17 100, r18 100, r19 32, r20 36, r21 96, r22 64, r23 144, r24 100, r25 320 — all tiles reachable.

**Manual 100% checklist:**
- [x] Bonfire Cell r1 → Hermit's Cell r2 → Sewer Tunnel r3 (puddle/bucket/scratches/skeleton)
- [x] Rat Nursery r4 (Mother + 2 babies, bone loot)
- [x] Boss Rat Lair r5 — Baron Gnaw (cutscene, tail_sweep legendary, rat_summon)
- [x] Wine Cellar r6 (press + 12 bottles), Flooded Passage r7 (body/chest), Pipe Junction r8 (valve)
- [x] Guarded Door r9 (Scrag + bonfire), Antechamber r10, Upper Sewer r11, Flooded Rat Den r12 (Large Rat + 3), Fungal Alcove r13, Pipe Maintenance r14 (wrench/plunger), Bone Pit r15 (reassembly)
- [x] Hidden r16, Vault r17 (secret door 17), Intersection r18 (compass/fountain + bonfire), Collapsed Tunnel r19 (shortcut debris), Old Well r20 (oubliette), Barracks r21, Armory r22 (weapon racks), Flooded Deep r23 (altar/chest), Throne Antechamber r24 (throne/banner/bonfire), Bath Chamber r25 (Gribnab + ducks)
- [x] All 4 bonfires lit (spawn, Scrag's 120,66, r24 148,132, r18 128,52) — checkpoint moves correctly
- [x] All interactables (wine bottles, bodies, drains, signs, toolbox, well, cauldron, throne) visible via `putW`
- [x] Destructibles: 16 seeded crates/barrels/vases, all `inBlast` works

**Graphics:** Vite build 3.8MB, SSAO contact shadows visible under crates, moon wash soft shadows on walls, PBR Standard roughness 0.92 reads correctly. Screenshots: `docs/playthrough_screenshots/f50_overview.png`, `f50_boss_gnaw.png`, `f50_gribnab_bath.png` (build-render verified).

**Fixes applied this sweep:**
- FP clip: `engine.ts` `canStep` now checks height delta >1 and unit occupancy, prevents wall underside entry (SWEEP-001)
- Scream spam: `chaos.ts` quiet>70 / lastEvent>45 / dt*0.015 throttled (SWEEP-002)
- Gate lanes: verified reserved + GATE_LANE_TILES prevents torch/brazier sealing (SWEEP-003)

