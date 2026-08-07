# Dungeon Hangover — 50 Floors of Regret

A turn-based roguelite dungeon crawler in high-resolution voxel style. Greg the Grim
drinks the tavern dry, gets polymorphed into a sheep, and wakes up at the bottom of a
fifty-floor dungeon — in his underwear — with a headache that could crush a small
kingdom, a bag of basic supplies, and a torch that probably won't last. The only way
out is up.

Built with **React 19 + Three.js 0.185 + TypeScript + Vite 7 + voxel art**, packaged as
a **Tauri 2** desktop app.

> **Tone:** *Dungeon Crawler Carl* meets *Baldur's Gate 3*. Absurd litRPG humor, a
> snarky narrator who comments on your stupid decisions, ridiculous loot, slapstick
> violence — and genuine stakes underneath the jokes.

## Quick Start

```bash
npm install
npm run dev       # dev server (http://localhost:5173)
npm run build     # production build → dist/
CI=false npx tauri build   # Windows installer (NSIS + MSI)
```

## The Game (shipped v0.1.0)

- **Floor 50: The Sewer Cellar** — the bottom of the Spire of Regret, fully authored:
  25 hand-designed rooms (bonfire cell, hermit's cell, sewer tunnels, mushroom circle,
  soap store, wine press, goblin throne antechamber, the King's bath…) connected by
  grand corridors, on a 250×250 voxel grid.
- **Turn-based combat** — d20 initiative, attack rolls vs AC, saving throws, in a
  **3-phase turn**: walk (move/jump) → attack (basic weapon swing) → skills; ⏭ Skip
  and 🛡 Defend (+1 AC) in the turn ring.
- **Voxel monsters** — rats, bats, skeletons, sewer leeches, mold blobs, goblins, and
  the bosses: **Gnaw** the giant boss rat and **Baron Gribnab**, the goblin king who
  bathes. Every unit is a distinct runtime-built voxel model.
- **Sobering up** — leveling is sobering: +6 max HP, +1 skill point, and a choice of
  ONE skill from any of the **15 class pools** (Bar Bouncer, Gutter Rogue, Karaoke
  Bard, Sommelier, Barista, Accountant, Dentist, Plumber, Wedding Planner, Tabloid
  Reporter, Haunted Chef, Shaman, Zoologist, Insurance Adjuster, Mortician).
- **Quests** — The Hermit's Finger, The Other Hermit, Cursed Gold, The Soap
  Conundrum. NPCs (Hermit, Other Hermit, Scrag the guard) with full dialogue trees
  and voiced lines.
- **Bonfires** — two on the floor; resting heals, saves, and lets you edit your
  **6-slot hotbar**. Kindling/resting at a fire **moves your respawn checkpoint** to it.
  Death keeps gold/loot/levels — only position is lost.
- **Voiced narrator** — pre-generated TTS lines for narration, rooms, level-ups and
  NPC dialogue (mp3 + caption fallback). Line manifest: `DUNGEON_FLOOR_TTS_LINES.txt`.
- **Intro cutscene** — the tavern night: drinking, brawling, sheep polymorph, the
  pass-out, the wake. Title sequence with the tavern exterior at night.
- **Exploration** — fog of war, stealth + enemy vision cones, traps, destructible
  crates/barrels/vases with loot, throwable/shoveable props (buckets, ducks, wine
  bottles, the King's towel), hidden treasures, a secret room behind rubble, a
  rotating minimap with a you-are-here marker.
- **Equipment** — 14 paper-doll slots incl. arms, cloak, ring and trinket; hair hides
  under headgear; the bucket fits on your head; dual-wield and thrown weapons work.

### Cheat Console
Press the **backtick** key `` ` `` to open the developer console:

| Command | Effect |
|---------|--------|
| `noaggro` | Toggle proximity aggro |
| `godmode` / `god` | Party takes no damage |
| `superhero` | Max stats, all skills, level 20 |
| `heal` | Full party heal |
| `killall` | Slay all enemies |
| `boss` / `boss1` | Warp to boss room |
| `gold [amt]` | Add gold (default 1000) |
| `levelup` | +1 level, +1 skill point |
| `reveal` | Clear fog of war |
| `help` | List all commands |

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Move / pan (first-person: W/S walk, mouse look) |
| Q / E | Rotate camera (turn in first person) |
| Scroll wheel | Zoom |
| Left click | Move / interact / attack |
| Right click | Cancel targeting |
| R | Interact with the active [R] prompt |
| F | Focus active unit |
| 1–9, 0, -, = | Hotbar skills / items |
| C | Sneak (explore) |
| T | Toggle torch |
| I | Inventory |
| J | Quest log |
| K | Skill tree |
| U | Stats |
| M | Full map overlay |
| V | Toggle follow camera |
| P | Toggle first-person view |
| Space / Enter | End turn / skip cutscene |
| B | Debug warp to boss |
| Escape | Skip cutscene / close panel / pause |
| `` ` `` | Open cheat console |

## Documentation

- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — the design bible: premise, pillars, combat spec, loot rules
- [`docs/LLM_FLOOR_GUIDE.md`](docs/LLM_FLOOR_GUIDE.md) — **how the current systems work in code**: floor generation, voxel art, props, TTS — the template for adding floors
- [`docs/FLOOR_TRANSITIONS.md`](docs/FLOOR_TRANSITIONS.md) — floor-transition machinery + how to wire floor 49
- [`docs/EXPANSION_GUIDE.md`](docs/EXPANSION_GUIDE.md) — architecture + "add content, not code" recipes (skills, items, NPCs, quests)
- [`docs/AGENTS.md`](docs/AGENTS.md) — quick agent reference
- [`docs/QWEN3_TTS_USAGE.md`](docs/QWEN3_TTS_USAGE.md) — regenerating the narration mp3s
- [`docs/dungeon_hangover_bible/`](docs/dungeon_hangover_bible/) — the 50-floor design spec (floors 49–1 are designed, not yet implemented)

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7
- **3D:** Three.js 0.185, EffectComposer, UnrealBloomPass — all models built from voxel data at runtime (no asset files)
- **UI:** Radix UI primitives, Tailwind CSS
- **Audio:** Web Audio API, procedural SFX + music, TTS narration mp3s
- **Desktop:** Tauri 2.x (NSIS + MSI installers)
