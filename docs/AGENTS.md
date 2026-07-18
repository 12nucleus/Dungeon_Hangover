# Agent Reference — Voxel Realms

## Commands
npm run dev          # dev server
npm run build        # tsc -b && vite build → dist/
npm run lint         # ESLint

## Architecture
React ↔ engine.ts (UISnapshot + methods) ↔ combat.ts (pure logic) ↔ Three.js scene
Data-driven: files under src/game/ are "add content, not code".

## Where to Add Content
| What | File | Key Structure |
|------|------|---------------|
| New skill | src/game/skills.ts | SKILLS = Record<string, SkillDef> |
| New unit | src/game/skills.ts | createRoster() returns Unit[] |
| New item base / enchant | src/game/items.ts | ITEM_BASES / ENCHANTS |
| New destructible prop | src/game/destructibles.ts | DESTRUCTIBLE_DEFS + SPOTS |
| New trap | src/game/traps.ts | TRAP_DEFS + TRAP_PLACEMENTS |
| New skill tree node | src/game/skilltree.ts | SKILL_TREES per class |
| New texture | src/game/textures.ts | painters{} + add to getTextures |
| New particle FX | src/game/particles.ts | FX{} |
| New condition | src/game/skills.ts | CONDITIONS + wire in combat.ts |

## Key Types (src/game/types.ts)
Unit, SkillDef, CombatEvent (union), Item, GridPos, DamageType, GamePhase, UISnapshot

## Art Constants
- Prop mini-cubes: 0.11 edge (world units)
- Character mini-cubes: 0.10 edge
- Particle cubes: edge = size * 0.145
- Textures: 64×64, NearestFilter, no mipmaps
