# Dungeon Hangover — Godot Demo

A single-room prototype built in **Godot 4.7** to explore what the engine can
do for this project: **"The Mother Rat's Lair"** — a turn-based combat scene
with a voxel-built hero and a Mother Rat boss plus her pups.

Everything is built **from code** (no placeholder grey boxes): procedural
voxel-style models, authored room dressing (walls, torches, the rat's nest,
scattered bones), point/directional lighting, and fog.

## Run it

1. Install [Godot 4.7](https://godotengine.org/download) (standard build).
2. Open Godot → **Import** → select this folder's `project.godot`.
3. Press **F5** (Play).

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D or arrows | Move (up to 4 tiles per turn) |
| Space | Attack (1d6+2 vs an adjacent enemy) |
| Enter | End turn |
| Q / E | Rotate camera |
| Scroll wheel | Zoom |
| R (on defeat) | Restart |

## Combat rules (simplified from the main game)

- You and the Mother Rat alternate turns. Three **pups** move and nip with her.
- Attack reach is 8-way adjacency. The rat hits for 1d6+1, pups for 1.
- **Win** by killing the Mother Rat (45 HP). **Lose** if Greg hits 0 HP.

## Files

- `project.godot` — project config (GL Compatibility renderer).
- `demo/MotherRatRoom.tscn` — the scene root (just a `Node3D` + script).
- `demo/main.gd` — everything: room build, model builders, turn-based combat, HUD.

## Notes

- The demo is self-contained and validated to run headless in Godot 4.7 with
  no script errors (`--headless --quit-after 10`).
- Models are assembled from `BoxMesh` primitives with `StandardMaterial3D`
  materials — the same "voxel" look as the web game, but native 3D.
