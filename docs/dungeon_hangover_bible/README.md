# DUNGEON HANGOVER: 50 FLOORS OF REGRET
## Complete Floor-by-Floor Breakdown

This directory contains the full game design for **Dungeon Hangover: 50 Floors of Regret**,
organized as a reference bible for development.

**STATUS: COMPLETE.** All 50 floor files are fully detailed (~11,800 lines total).
The original master design bible (classes, skills, story, loot rules) is at
`../DUNGEON_HANGOVER_DESIGN_BIBLE.md`.

---

## FILE STRUCTURE

| File | Content |
|------|---------|
| `../DUNGEON_HANGOVER_DESIGN_BIBLE.md` | Master design bible — classes, skills, 50-floor storyline, loot rules, core pillars |
| `00_MASTER_INDEX.md` | This file — navigation and quick reference |
| `floors/FLOOR_50_SEWER_CELLAR.md` | Floor 50 — Sewer Cellar |
| `floors/FLOOR_49_FUNGAL_GROTTO.md` | Floor 49 — Fungal Grotto |
| `floors/FLOOR_48_COLLAPSED_LIBRARY.md` | Floor 48 — Collapsed Library |
| `floors/FLOOR_47_BONE_YARD.md` | Floor 47 — Bone Yard |
| `floors/FLOOR_46_DROWNED_CHAPEL.md` | Floor 46 — Drowned Chapel |
| `floors/FLOOR_45_RAT_KINGS_COURT.md` | Floor 45 — The Rat King's Court |
| `floors/FLOOR_44_WAX_MUSEUM.md` | Floor 44 — Wax Museum |
| `floors/FLOOR_43_TUNNEL_MOUTH.md` | Floor 43 — The Tunnel Mouth |
| `floors/FLOOR_42_WEEPING_HALL.md` | Floor 42 — The Weeping Hall |
| `floors/FLOOR_41_GATES_OF_MARKET.md` | Floor 41 — Gates of the Hollow Market |
| `floors/FLOOR_40_GOBLIN_BAZAAR.md` | Floor 40 — Goblin Bazaar |
| `floors/FLOOR_39_SOAP_TRADERS_ROW.md` | Floor 39 — Soap Trader's Row |
| `floors/FLOOR_38_DICE_PARAOUR.md` | Floor 38 — The Dice Parlour |
| `floors/FLOOR_37_GOBLIN_COURT.md` | Floor 37 — Goblin Court |
| `floors/FLOOR_36_BATHHOUSE_ANTECHAMBER.md` | Floor 36 — The Bathhouse Antechamber |
| `floors/FLOOR_35_FUNGAL_DEEP_GARDENS.md` | Floor 35 — Fungal Deep Gardens |
| `floors/FLOOR_34_TOLL_BRIDGE.md` | Floor 34 — The Toll Bridge |
| `floors/FLOOR_33_FORGOTTEN_KITCHEN.md` | Floor 33 — The Forgotten Kitchen |
| `floors/FLOOR_32_WHISPERING_GALLERY.md` | Floor 32 — The Whispering Gallery |
| `floors/FLOOR_31_GOBLIN_KING_OUTER_SANCTUM.md` | Floor 31 — Goblin King's Outer Sanctum |
| `floors/FLOOR_30_DWARVEN_GATE.md` | Floor 30 — Dwarven Gate |
| `floors/FLOOR_29_MOLTEN_TUNNELS.md` | Floor 29 — The Molten Tunnels |
| `floors/FLOOR_28_MINING_OFFICE.md` | Floor 28 — The Mining Office |
| `floors/FLOOR_27_GRAND_EXCAVATION.md` | Floor 27 — The Grand Excavation |
| `floors/FLOOR_26_BROKEN_LIFT.md` | Floor 26 — The Broken Lift |
| `floors/FLOOR_25_FIRST_ECHO.md` | Floor 25 — The First Echo |
| `floors/FLOOR_24_BATHHOUSE_CATACOMBS.md` | Floor 24 — Bathhouse Catacombs |
| `floors/FLOOR_23_DWARVEN_BAR.md` | Floor 23 — The Dwarven Bar |
| `floors/FLOOR_22_COLLAPSING_GALLERY.md` | Floor 22 — The Collapsing Gallery |
| `floors/FLOOR_21_ARCHITECTS_TOMB.md` | Floor 21 — The Architect's Tomb |
| `floors/FLOOR_20_WIND_HALLS.md` | Floor 20 — The Wind Halls |
| `floors/FLOOR_19_GLASS_BRIDGE.md` | Floor 19 — The Glass Bridge |
| `floors/FLOOR_18_COURT_OF_WHISPERS.md` | Floor 18 — The Court of Whispers |
| `floors/FLOOR_17_GARDEN_OF_STONE.md` | Floor 17 — The Garden of Stone |
| `floors/FLOOR_16_WAR_CAMP.md` | Floor 16 — The War Camp |
| `floors/FLOOR_15_MIRROR_FLOOR.md` | Floor 15 — The Mirror Floor |
| `floors/FLOOR_14_FLOOR_OF_DOORS.md` | Floor 14 — The Floor of Doors |
| `floors/FLOOR_13_FLOOR_OF_FACES.md` | Floor 13 — The Floor of Faces |
| `floors/FLOOR_12_THE_CHASM.md` | Floor 12 — The Chasm |
| `floors/FLOOR_11_GATE_OF_QUESTIONS.md` | Floor 11 — The Gate of Questions |
| `floors/FLOOR_10_GOLDEN_HALL.md` | Floor 10 — The Golden Hall |
| `floors/FLOOR_9_HALL_OF_LESSONS.md` | Floor 9 — The Hall of Lessons |
| `floors/FLOOR_8_THRONE_ANTEROOM.md` | Floor 8 — The Throne Anteroom |
| `floors/FLOOR_7_FLOOR_OF_REGRETS.md` | Floor 7 — The Floor of Regrets |
| `floors/FLOOR_6_GARDEN_OF_SECOND_CHANCES.md` | Floor 6 — The Garden of Second Chances |
| `floors/FLOOR_5_ARMORY_OF_HOPE.md` | Floor 5 — The Armory of Hope |
| `floors/FLOOR_4_BRIDGE_BETWEEN.md` | Floor 4 — The Bridge Between |
| `floors/FLOOR_3_PENULTIMATE_ROOM.md` | Floor 3 — The Penultimate Room |
| `floors/FLOOR_2_THE_DOOR.md` | Floor 2 — The Door |
| `floors/FLOOR_1_PARAGONS_THRONE.md` | Floor 1 — The Paragon's Throne |

---

## ACT STRUCTURE

| Act | Floors | Theme |
|-----|--------|-------|
| ACT I | 50–41 | The Tangled Roots — Sewers, mold, vermin, forgotten cellars |
| ACT II | 40–31 | The Hollow Markets — Goblin bazaars, fungal gardens, underground rivers |
| ACT III | 30–21 | The Scorched Halls — Dwarven ruins, lava tubes, dead civilizations |
| ACT IV | 20–11 | The Ascent — Verticality, sky cracks, self-confrontation |
| ACT V | 10–1 | The Paragon's Crown — Marble, gold, light, truth |

---

## HOW TO USE EACH FLOOR FILE

Each floor file contains:
1. **Floor Overview** — Theme, mood, ambient, lighting
2. **Floor Map** — Room layout (ASCII + connections)
3. **Room Breakdowns** — Every room with contents, interactions, narrator lines
4. **Encounters** — Combat, traps, puzzles, hidden features, social
5. **NPCs** — Full dialogue trees
6. **Quests** — Main quest + side quests with rewards
7. **Boss** — Stat block, arena, phase mechanics, dialogues
8. **Loot Table** — Floor-specific items
9. **Transitions** — How you arrive, how you leave, connections to other floors
10. **Design Notes** — Developer intentions, difficulty tuning, secrets

---

## REFERENCE

For classes, skills, core mechanics, loot rules, and the overarching storyline,
see `../DUNGEON_HANGOVER_DESIGN_BIBLE.md`.
