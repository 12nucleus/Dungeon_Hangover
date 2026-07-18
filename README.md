# Voxel Realms — Tactics of the Broken Shrine

A playable Baldur's-Gate-3-inspired turn-based tactical RPG demo in high-resolution voxel style. Built with React 19 + Three.js 0.185 + TypeScript + Vite 7.

## Quick Start
```
npm install
npm run dev       # dev server (http://localhost:5173)
npm run build     # production build → dist/
```

## Features
- **Voxel everything** — terrain, characters, props, and particles are all tiny cubes
- **Turn-based combat** — d20 initiative, action/bonus economy, attack rolls vs AC, saving throws
- **9+ skills** — Slash, Cleave, Shield Bash, Fireball, Magic Missile, Frost Nova, Cure Wounds, Sacred Flame, Bless + more unlockable via skill trees
- **Destructible props** — crates, barrels, vases that smash into voxel debris with loot
- **Stealth + vision cones** — sneak past enemies (C key), see their cone of view, surprise round on detection
- **Traps** — hidden spikes, fire traps, snares; revealed by perception, disarmed with a roll
- **Inventory & equipment** — weapons, armor, trinkets with 3 tiers, rarity (common→epic), and enchantments (Flaming, Frost, Keen, etc.)
- **Class skill trees** — Fighter (Weaponmaster/Guardian), Wizard (Evocation/Warding), Cleric (Life/War)
- **XP & level-ups** — skill points unlock nodes, passives boost stats
- **Procedural pixel-art textures** — zero external image assets
- **Adaptive audio** — AI-generated MP3 SFX + ambient loop + procedural combat drums
- **Bloom + particle FX** — fireballs explode with glowing voxel cubes

## Controls
| Key | Action |
|-----|--------|
| WASD / Arrows | Pan camera |
| Q / E | Rotate camera |
| Scroll wheel | Zoom |
| F | Focus active unit |
| 1–4 | Hotbar skill |
| C | Sneak (explore) |
| I | Inventory |
| K | Skill tree |
| Space / Enter | End turn |
| Right-click / Esc | Cancel targeting / close panel |
| M / button | Toggle mute |

## Documentation
- `docs/EXPANSION_GUIDE.md` — comprehensive architecture guide for LLM extenders
- `docs/AGENTS.md` — quick agent reference
