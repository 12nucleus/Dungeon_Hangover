# Dungeon Hangover — 50 Floors of Regret

A turn-based roguelite dungeon crawler in high-resolution voxel style. You wake up at the bottom of a 50-floor dungeon in your underwear, nursing a splitting headache, with nothing but a rusty dagger, a health potion, and a torch that probably won't last.

Built with **React 19 + Three.js 0.185 + TypeScript + Vite 7 + voxel art**.

> **Tone:** *Dungeon Crawler Carl* meets *Baldur's Gate 3*. Absurd litRPG humor, a snarky narrator who comments on your stupid decisions, ridiculous loot, slapstick violence — and genuine stakes underneath the jokes.

## Quick Start

```bash
npm install
npm run dev       # dev server (http://localhost:5173)
npm run build     # production build → dist/
```

## The Story

Greg the Grim drank the tavern dry, insulted a man with a sword, challenged a polymorph wizard to a fistfight, and briefly became livestock. None of those ended well.

He wakes at the bottom of a fifty-floor dungeon — in his underwear — with a headache that could crush a small kingdom. A bag of basic supplies sits by his head. The only way out is up.

## Features

### Gameplay
- **Turn-based combat** — d20 initiative, action/bonus economy, attack rolls vs AC, saving throws
- **10+ skills** — Slash, Cleave, Shield Bash, Fireball, Magic Missile, Frost Nova, Cure Wounds, Sacred Flame, Bless + more unlockable via skill trees
- **Destructible environment** — crates, barrels, vases that smash into voxel debris with loot
- **Stealth** — sneak past enemies, see their vision cones on sneak, surprise round on detection
- **Traps** — hidden spikes, fire traps, snares; revealed by perception, disarmed with a roll
- **Fog of war** — unexplored rooms stay hidden; vision radius expands with your torch
- **Inventory & equipment** — weapons, armor, trinkets with rarity tiers and enchantments
- **Skill trees** — unlock passives and new abilities as you level up

### The Dungeon
- **Procedurally generated** — 120×120 grid, 25+ isolated rooms connected by carved tunnels
- **Voxel-rendered terrain** — true 0.055-scale voxel walls with hewn-rock silhouette, voxellized floors with per-voxel color jitter and micro-height relief
- **Underground rivers** — wandering water features with real waterfall cascades at height drops
- **Mezzanines & stairs** — raised plateaus with auto-graded ramp geometry
- **Boss room** — sealed chamber behind a single iron door, with a full bathing-tyrant cutscene

### Cinematics
- **Title sequence** — establishing shot of the tavern exterior at night, chimney smoke, moon
- **Intro cutscene** — full tavern flashback: Greg drinks, brawls, gets polymorphed into a sheep, passes out, wakes in the dungeon
- **Boss cutscene** — Warlord Gorruk rises from his bath, wades to his weapon rack, seizes his greatclub, and roars

### Cheat Console
Press the **backtick** key `` ` `` to open the developer console:

| Command | Effect |
|---------|--------|
| `noaggro` | Toggle proximity aggro |
| `godmode` | Party takes no damage |
| `superhero` | Max stats, all skills, level 20 |
| `heal` | Full party heal |
| `killall` | Slay all enemies |
| `boss` | Warp to boss room |
| `gold [amt]` | Add gold |
| `reveal` | Clear fog of war |
| `help` | List all commands |

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Pan camera |
| Q / E | Rotate camera |
| Scroll wheel | Zoom |
| Left click | Move / interact |
| F | Focus active unit |
| 1–9, 0, -, = | Hotbar skills |
| C | Sneak (explore) |
| I | Inventory |
| K | Skill tree |
| V | Toggle follow-camera |
| M | Full map overlay |
| T | Toggle torch |
| Space / Enter | End turn / skip cutscene |
| Escape | Cancel / close panel |
| `` ` `` | Open cheat console |

## Documentation

- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — full game design document (premise, pillars, phased scope, combat spec, loot rules)
- [`docs/EXPANSION_GUIDE.md`](docs/EXPANSION_GUIDE.md) — comprehensive architecture guide for LLM extenders
- [`docs/AGENTS.md`](docs/AGENTS.md) — quick agent reference
- [`scripts/dungeon_preview.mjs`](scripts/dungeon_preview.mjs) — generate an SVG top-down map of the dungeon layout

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7
- **3D:** Three.js 0.185, EffectComposer, UnrealBloomPass
- **UI:** Radix UI primitives, Tailwind CSS
- **Audio:** Web Audio API, procedural SFX + ambient music
- **Voxel:** Custom `.vox` format loader, merged-geometry terrain builder
- **Desktop:** Tauri 2.x (cross-platform bundling)
