# Expansion Guide — Voxel Realms: Tactics of the Broken Shrine

Architecture reference for LLM-driven development. All paths relative to repo root.

---

## Project Stack

| Layer | Tech | Key File |
|-------|------|----------|
| Build | Vite 7 + TypeScript 5 | `vite.config.ts` |
| Rendering | Three.js 0.185 (custom engine) | `src/game/engine.ts` |
| UI Shell | React 19 + Tailwind CSS 3.4 + shadcn/ui | `src/components/` |
| Entry | `index.html` → `src/main.tsx` → `src/App.tsx` | — |

---

## Architecture Overview

```
React (HUD/panels)
    ↕ UISnapshot + method calls
engine.ts (Three.js scene, camera, input, animation loop, event queue)
    ↕ CombatEvent[]
combat.ts (pure logic — no rendering)
    └── skills.ts, items.ts, stats.ts, dice.ts, traps.ts, skilltree.ts
world.ts, characters.ts, particles.ts, destructibles.ts, textures.ts, audio.ts
```

The **key architectural rule**: `combat.ts` has zero imports from Three.js. Every public method returns `CombatEvent[]`. The engine receives those events and animates them one-by-one. This means you can test or replay combat without ever mounting a canvas.

### File Map (actual files only)

```
src/
  game/
    types.ts         — Everything data lives here: Unit, SkillDef, Item,
                       CombatEvent, UISnapshot, GridPos, LogEntry, etc.
    combat.ts        — PURE LOGIC (no rendering). Methods return CombatEvent[].
                       engine.ts receives and animates them.
    engine.ts        — Presentation: Three.js scene, IsoCamera, input,
                       animation loop, event queue, state machine.
    world.ts         — VoxelWorld: 46×46 heightmap terrain via InstancedMesh,
                       blocked[] grid for collision.
    characters.ts    — Voxel character rigs built from merged mini-cubes
                       with vertex colors (Rig type + buildCharacter).
    particles.ts     — Twinned InstancedMesh: glow pool (6000, AdditiveBlending)
                       + solid pool (3000, NormalBlending, Lambert). BurstOpts.
    destructibles.ts — Crate/barrel/vase/chest props, built from tiny cubes
                       via Vox class, destroyed into debris, drop loot.
    items.ts         — Item interface, ITEM_BASES table, ENCHANTS Record,
                       generateLoot(), rollLootTable().
    stats.ts         — effAC(), effMove(), effMaxHp(), effAtkBonus(),
                       XP_THRESHOLDS, MAX_LEVEL.
    skilltree.ts     — SKILL_TREES per class (SkillNode[]), canUnlock(),
                       treeFor(), unlockNode().
    traps.ts         — TRAP_DEFS, TRAP_PLACEMENTS, TrapManager:
                       reveal/trigger/disarm/render.
    audio.ts         — AudioManager: WebAudio, MP3 SFX buffers,
                       ambient loop + procedural combat drum synthesis.
    dice.ts          — rollD20(), rollDice(), abilityMod(), fmtMod().
    textures.ts      — Procedural 64×64 canvas painters (grass, dirt, stone,
                       sand, wood, leaves, water, brick, roof).
    skills.ts        — SKILLS Record<string,SkillDef> + createRoster()
                       returns Unit[] + CONDITIONS Record<string,Condition>.
  components/
    GameCanvas.tsx   — React mount point for Three.js canvas + HUD overlay.
    HUD.tsx          — Menu, initiative tracker, hotbar, party frames,
                       combat log, help, minimap overlay.
    InventoryPanel.tsx — Inventory grid + equipment slots + member cards.
    SkillTreePanel.tsx — Class tree branches, unlock buttons, skill loadout.
    ui/              — shadcn/ui primitives (button, dialog, etc.)
  App.tsx, main.tsx, index.css — Bootstrap, global styles.
public/audio/ — MP3 files: sword_hit, fireball, heal, magic_missile,
                arrow, dice, victory, ui_click, music_ambient.
```

---

## Game Loop

```
menu → startGame()
         ↓
     explore (walk, sneak, break props, avoid traps)
         ↓
     combat trigger (distance 6 or vision-cone detection while sneaking)
         ↓
     start() → initiative loop:
         beginTurn → player acts → endTurn → AI acts → checkEnd
         ↓                                  ↓
     victory (loot screen)            defeat (game-over screen)
         ↓
     continue exploring
```

The state machine is inside `engine.ts` (private `phase: GamePhase`). Transitions:

- `'menu'` → `'explore'`: `startGame()`
- `'explore'` → `'combat'`: `combat.start()` called when enemies are within detection range
- `'combat'` → `'victory'` / `'defeat'`: `combat.checkEnd()` after each turn
- `'victory'` → `'explore'`: user clicks "Continue"
- `'defeat'` → `'menu'`: user clicks "Restart"

---

## Data-Driven Pattern: Add Content, Not Code

The engine is designed so that most additions are **data entries**, not logic changes.

### Adding a New Skill
1. Add a `SkillDef` to the `SKILLS` record in `src/game/skills.ts:9`
2. If it applies a condition, add the condition to `CONDITIONS` in the same file
3. Wire condition resolution in `combat.ts` (check `CombatEvent` handlers)
4. Add a particle preset in `FX` in `src/game/particles.ts` if new effect is needed

### Adding a New Unit
1. Add a `Unit` entry to `createRoster()` in `src/game/skills.ts`
2. Give it a `CharacterScheme` for the voxel builder

### Adding a New Item or Enchant
1. Add an `ItemBase` to `ITEM_BASES` in `src/game/items.ts:60`
2. Add an `EnchantDef` to `ENCHANTS` in `src/game/items.ts:48`
3. The item becomes droppable via `rollLootTable()` automatically

### Adding a New Destructible Prop
1. Add a `DestructibleDef` to `DESTRUCTIBLE_DEFS` in `src/game/destructibles.ts`
2. Use the `Vox` builder to define the shape with mini-cubes (`add`, `fill`, `disc`, `ring`)
3. Add a placement entry to `SPOTS` array in the same file

### Adding a New Trap
1. Add a `TrapDef` to `TRAP_DEFS` in `src/game/traps.ts:29`
2. Add a placement tuple to `TRAP_PLACEMENTS` in `src/game/traps.ts:35`

### Adding a New Skill Tree Node
1. Add a `SkillNode` to `SKILL_TREES` in `src/game/skilltree.ts:24`
2. Set `unlockSkill` to reference a skill id, or `passive` for stat bonuses
3. Set `requires` to parent node ids for dependency chains

### Adding a New Procedural Texture
1. Add a painter function to `painters` in `src/game/textures.ts`
2. Register the key in `getTextures()` in the same file

### Adding a New Particle Effect
1. Add a function to the `FX` object in `src/game/particles.ts`
2. Call `FX.yourEffect(pos, color)` from engine event handlers

---

## Combat System

**File**: `src/game/combat.ts`

Combat is a pure-logic class with no rendering dependencies:

```ts
class Combat {
  units: Unit[]
  turnOrder: string[]
  activeIdx: number
  round: number
  inCombat: boolean
  phase: GamePhase
  surpriseRound: boolean
  surpriseHits: Set<string>
}
```

### Key Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `CombatEvent[]` | Rolls initiative for all units, sets turn order, emits `phase` + `turn` events |
| `useSkill(unitId, skillId, target)` | `CombatEvent[]` | Resolves a skill: attack roll vs AC, damage, saves, conditions, death checks |
| `endTurn()` | `CombatEvent[]` | Advances to next unit, ticks cooldowns/conditions, auto-AI for enemies |
| `moveUnit(unitId, path)` | `CombatEvent[]` | Validates movement budget, emits `move` events |
| `checkEnd()` | `CombatEvent[]` or `null` | Returns victory/defeat events if all enemies or all party are dead |
| `reachable(unit, budget)` | `Map<string, GridPos[]>` | BFS pathfinding (4-dir, budget-limited) for movement highlights |

### CombatEvent Union (`src/game/types.ts:127`)

```ts
type CombatEvent =
  | { type: 'log'; text: string; kind: LogKind }
  | { type: 'move'; unitId: string; path: GridPos[] }
  | { type: 'melee'; unitId: string; targetId: string }
  | { type: 'projectile'; unitId: string; from: GridPos; to: GridPos; color: number; fx: ParticleFX }
  | { type: 'skillfx'; skill: SkillDef; at: GridPos; targets: string[] }
  | { type: 'damage'; unitId: string; amount: number; kind: DamageType; crit: boolean }
  | { type: 'heal'; unitId: string; amount: number }
  | { type: 'float'; unitId: string; text: string; cls: string }
  | { type: 'save'; unitId: string; success: boolean; total: number }
  | { type: 'death'; unitId: string }
  | { type: 'turn'; unitId: string; round: number }
  | { type: 'phase'; phase: GamePhase }
  | { type: 'loot'; items: Item[]; gold: number }
  | { type: 'levelup'; unitId: string }
  | { type: 'shake'; power: number }
```

### Combat Resolution Flow (`useSkill`)

1. Find skill in `SKILLS` record, validate cooldown + cost
2. For each target:
   a. If skill has `attackAbility`: roll `d20 + abilityMod + proficiency + atkBonus` vs `effAC(target)`
   b. On hit: roll `damageDice`, apply damage (with possible crit doubling)
   c. If skill has `saveAbility`: defender rolls save DC, success = half damage
   d. If skill has `appliesCondition`: apply condition on failed save
   e. If skill has `healDice`: roll and apply healing
3. Emit damage/heal/float/save/death/levelup events
4. Check end conditions
5. Apply XP to party units on enemy death

---

## Items & Loot

**File**: `src/game/items.ts`

### Item Interface
```ts
interface Item {
  id: string; kind: ItemKind; name: string; icon: string;
  tier: Tier; rarity: Rarity;
  weaponKind?: WeaponKind; damageDice?: string; damageType?: DamageType;
  acBonus?: number; enchantId?: string;
  healDice?: string; condition?: string; value: number; desc: string;
}
```

### Enchantment System
Enchantments are prefix modifiers defined in `ENCHANTS`:
```ts
const ENCHANTS: Record<string, EnchantDef> = {
  flaming: { prefix: 'Flaming', elemDice: '1d4', elemType: 'fire', ... },
  frost:   { prefix: 'Frost', elemDice: '1d4', elemType: 'cold', slowChance: 0.25, ... },
  keen:    { prefix: 'Keen', atkBonus: 1, ... },
  warding: { prefix: 'Warding', acBonus: 1, ... },
  vital:   { prefix: 'Vital', hpBonus: 6, ... },
  swift:   { prefix: 'Swift', moveBonus: 1, ... },
}
```

### Loot Generation
- `generateLoot(tier, kind?)` — rolls a random item base, optionally applies an enchantment (30% chance), returns an `Item`
- `rollLootTable(source: LootSource)` — returns `{ items: Item[], gold: number }` per enemy type or destructible type
- Loot sources: `'goblin'`, `'hobgoblin'`, `'crate'`, `'barrel'`, `'vase'`, `'chest'`

---

## Skill Trees

**File**: `src/game/skilltree.ts`

Each class has a `SkillNode[]` with 2 branches and 3 tiers:

```ts
interface SkillNode {
  id: string; name: string; icon: string; desc: string;
  branch: string; tier: 1 | 2 | 3; cost: number;
  requires?: string[];        // parent node ids
  unlockSkill?: string;       // skill id to learn
  passive?: { stat: StatName; amount: number };  // permanent boost
}
```

| Class | Branch 1 | Branch 2 |
|-------|----------|----------|
| Fighter | Weaponmaster (Power Strike → Brute → Whirlwind) | Guardian (Shield Wall → Second Wind → Veteran Hide) |
| Wizard | Evocation (Ice Lance → Sharpened Mind → Chain Lightning) | Warding (Toughness → Arcane Shield → Iron Will) |
| Cleric | Life (Healing Word → Deep Faith → Mass Heal) | War (Bless → Iron Resolve → Divine Strike) |

Passives apply permanent stat bonuses (`str`, `dex`, `con`, `int`, `wis`, `cha`, `maxHp`, `move`, `ac`) and stack with equipment. Check `effMaxHp`, `effAC`, `effMove` in `stats.ts` to see how passives are factored.

---

## Stealth & Vision Cones

**Engine file**: `src/game/engine.ts`

The game has a `sneaking` flag (toggled with C key in explore phase).

- **Enemy vision cones** — red cone meshes (`ConeHelper` class) are drawn from each enemy's position in the direction they face, with ~60° field of view and configurable range (default 8 tiles)
- **Player vision cone** — blue cone when sneaking, showing what enemies can see you
- **Detection**: during explore mode, each frame checks if sneaking player's position is inside any enemy vision cone. If detected → `combat.start()` with `surpriseRound = true` and enemies get a free turn

### Cone Rendering
Cones are built as `THREE.BufferGeometry` with a pie-slice shape, rendered with `MeshBasicMaterial` at 0.15 opacity. Updated every frame during explore phase when sneaking.

---

## Traps

**File**: `src/game/traps.ts`

### Trap Definitions
```ts
const TRAP_DEFS = {
  spike: { name: 'Spike Trap', damageDice: '2d6', damageType: 'piercing' },
  fire:  { name: 'Fire Trap', damageDice: '3d6', damageType: 'fire', appliesCondition: 'burning', conditionRounds: 2 },
  snare: { name: 'Snare Trap', damageDice: '0', damageType: 'piercing', appliesCondition: 'rooted', conditionRounds: 2 },
}
```

### Trap Placements
```ts
const TRAP_PLACEMENTS: [string, number, number][] = [
  ['spike', 28, 16], ['spike', 30, 13], ['fire', 36, 7],
  ['snare', 40, 14], ['spike', 27, 24], ['fire', 38, 22],
]
```

### TrapManager Methods
- `revealTrap(pos)` — marks a trap as revealed (shown to player), triggered by passive perception check during explore
- `triggerTrap(unit, pos)` — resolves damage/conditions when a unit steps on an unrevealed trap
- `disarmTrap(unit, pos)` — ability check (DEX) to safely remove a revealed trap; success removes it, failure triggers it
- `render()` — draws revealed traps as small voxel indicators

---

## Voxel Art Pipeline

### Procedural Textures (`src/game/textures.ts`)

All block-face textures are 64×64 canvases painted at runtime:

```
function makeTexture(name, painter, size=64) → THREE.CanvasTexture
  - Creates a 64×64 canvas
  - Seeds a PRNG from the texture name (mulberry32)
  - Calls the painter function (ctx, rnd, size)
  - Returns CanvasTexture with NearestFilter (no mipmaps)
```

Example painters: `grass`, `dirt`, `stone`, `sand`, `wood`, `leaves`, `water`, `brick`, `roof`. Each uses the seeded RNG for deterministic results. The `px(ctx, x, y, color)` helper sets individual pixels.

### Character Rigs (`src/game/characters.ts`)

Characters are built from ~200 mini-cubes (edge = 0.1 world units) assembled into body parts:

```
buildCharacter(scheme: CharacterScheme, weaponKind: WeaponKind) → Rig
  - Body parts: head, torso, leftArm, rightArm, legs, weapon
  - Each part is an array of Cell {x,y,z,c} objects
  - Parts are merged with mergeGeometries() from three/addons
  - Vertex colors baked in (no texture atlas needed)
  - Scheme controls: skin/cloth/accent/hair colors, hood, orc features
```

The `Rig` type stores one `THREE.Mesh` per body part plus a skeleton group. `updateRig(rig, scheme, weapon)` can re-dress a character.

### Destructible Props (`src/game/destructibles.ts`)

Props use the `Vox` builder (mini-cube edge = 0.11):

```
class Vox:
  add(x, y, z, color, jitter?)    — one cube with color jitter
  fill(x1,y1,z1, x2,y2,z2, color, jitter?) — filled box
  disc(y, r, color, jitter?)      — filled circle
  ring(y, r, color, jitter?)      — hollow ring
  shell(y1,y2, r, color, jitter?) — hollow cylinder
  mesh() → THREE.BufferGeometry   — extract merged geometry
```

Each prop type has one `InstancedMesh`. When destroyed, cells are converted to `ParticleSystem.burst()` calls (solid debris pool).

### Particle System (`src/game/particles.ts`)

Two pools, each backed by `InstancedMesh`:

| Pool | Count | Material | Blending |
|------|-------|----------|----------|
| Glow | 6000 | MeshBasicMaterial | AdditiveBlending |
| Solid | 3000 | MeshLambertMaterial | NormalBlending |

Particle lifecycle: `burst()` activates dead particles with random velocities, gravity, spin, lifetime, and fade (glow fades by lerping color → black; solid shrinks to zero scale).

FX presets (`slash`, `fire`, `heal`, `arcane`, `ice`, `arrow`, `holy`, `bash`, `buff`, `blood`) configure count, speed, color, gravity, and pool routing.

---

## Audio Pipeline

**File**: `src/game/audio.ts`

### SFX
MP3 files in `public/audio/` loaded as `AudioBuffer`:
- `sword_hit.mp3`, `fireball.mp3`, `heal.mp3`, `magic_missile.mp3`
- `arrow.mp3`, `dice.mp3`, `victory.mp3`, `ui_click.mp3`
- `music_ambient.mp3` — ambient loop (cross-faded)

### Procedural Combat Drums
When combat starts, a `setInterval` callback synthesizes kick/tom/hat oscillators via `AudioContext.createOscillator()` + `createGain()` scheduled at beat boundaries. Tempo: 140 BPM. Stops when combat ends.

### Usage
```ts
audio.play('sword_hit');       // SFX
audio.startMusic();            // ambient loop
audio.toggleMute();            // master volume 0 ↔ 1
```

---

## Performance Budget

| Target | Budget |
|--------|--------|
| Terrain InstancedMeshes | ~6–8 (grass, dirt, stone, sand, trees, rocks, walls) |
| Glow particles | 6000 (AdditiveBlending, MeshBasic) |
| Solid particles | 3000 (NormalBlending, MeshLambert) |
| Character meshes | ~10 merged geometries each (1 Mesh per body part) |
| Vision cones | ≤5 cone meshes |
| Trap meshes | ≤6 indicator meshes |
| Texture count | < 64 unique, 64×64 each |
| Bloom intensity | 0.55 (UnrealBloomPass) |
| Shadow map | 2048px, PCFSoftShadowMap (deprecated in r186, auto-fallback) |
| Draw calls | < 200 |

---

## Quest System Design (Future)

Data model for a future quest system:

```ts
interface QuestObjective {
  type: 'kill' | 'reach' | 'collect';
  unitId?: string;       // kill: which enemy to slay
  count: number;         // kill: how many
  tile?: GridPos;        // reach: which tile to step on
  itemId?: string;       // collect: which item to acquire
}

interface Quest {
  id: string;
  name: string;
  desc: string;
  objectives: QuestObjective[];
  rewards: Item[];
  xp: number;
}
```

### Hooks into Existing Events
- `CombatEvent.death` → check kill objectives
- Movement proximity during explore → check reach objectives
- Inventory changes (`addItem()`) → check collect objectives
- `engine.ts` would tick `quests: Quest[]`, emit log events on progress, and auto-complete when all objectives are met

### Starter Example
"Slay the Hobgoblin Boss": `{ type: 'kill', unitId: 'hobgoblin', count: 1 }` → rewards a rare item + 200 XP.

---

## Roadmap to Production

1. **Save/Load** — serialize engine state to localStorage JSON; restore on page load
2. **Dialogue system** — scripted conversations with branching choices (JSON-driven)
3. **Quest journal** — UI panel tracking active/completed quests
4. **World zones** — multiple 46×46 maps connected by transitions
5. **More classes/races/skills** — rogue, ranger, paladin with unique mechanics
6. **Multiplayer** — sync CombatEvent[] over WebRTC; server-authoritative combat
7. **Asset pipeline** — replace procedural textures with hand-painted PNGs; replace Vox-built props with MagicaVoxel .vox exports via three-voxel-loader
