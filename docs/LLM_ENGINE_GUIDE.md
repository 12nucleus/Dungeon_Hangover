# LLM Engine Guide — Dungeon Hangover

## ARCHITECTURE BOUNDARY

| Zone | Path | Who edits |
|------|------|-----------|
| **Engine + Logic** | `src/game/` | Human supervisor only |
| **Content (LLM-only zone)** | `src/content/` | LLMs may edit freely |
| **UI (React)** | `src/components/` | Human supervisor only |

**CRITICAL:** To add content (skills, monsters, items, barks, class-tree data), edit ONLY files inside `src/content/`. See [src/content/README.md](../src/content/README.md) for detailed recipes and the law. The engine reads content files as pure data records — adding a new skill, monster, item, or bark NEVER requires touching engine code.

---

*A reference for extending the game by adding data entries, not code.*

---

## 1. What This Engine Is

All game content lives as data records under `src/content/`. The combat engine (`combat.ts`) emits `CombatEvent[]` — pure logic, no rendering. The presentation engine (`engine.ts`) animates those events. React reads a single `UISnapshot` and never calls Three.js directly.

**Golden rule: add content, not code.** Every new skill, monster, item, perk, condition, destructible prop, trap, narrator bark, lore note, and texture is a new entry in an existing record under `src/content/`. You never need to touch `combat.ts`, `engine.ts`, or `dungeon.ts` to add gameplay content.

---

## 2. Architecture Map

```
React (HUD)  <──  engine.ts (Three.js + animation)  <──  combat.ts (pure logic)
                      │                                       │
                      │  reads/writes                          │  emits
                      ▼                                       ▼
                 UISnapshot                               CombatEvent[]
                      │                                       │
                      └────── data layer ──────────────────────┘
skills.ts, items.ts, perks.ts,
                          stats.ts, narrator.ts, dice.ts
                       (content data lives in src/content/)
```

### CombatEvent queue

`combat.ts` returns `CombatEvent[]` from every public method. `engine.ts` enqueues them via `enqueue()` and processes them one-by-one through `animate()` — a `switch` on `ev.type`. Engine never skips events; React never reads combat internals.

```typescript
// combat.ts — every method returns CombatEvent[]
start(engagedIds?: string[]): CombatEvent[]
useSkill(u: Unit, skillId: string, target: GridPos | string): CombatEvent[]
endTurn(): CombatEvent[]
```

### UISnapshot one-way contract

React receives a single `UISnapshot` object (defined in `types.ts`) and renders it. React calls `engine.selectSkill()`, `engine.defend()`, `engine.useConsumable()`, etc. — never touches Three.js. Engine never imports React.

```typescript
// types.ts — the complete UI contract
export interface UISnapshot {
  phase: GamePhase;
  units: Unit[];
  activeId: string | null;
  turnOrder: string[];
  selectedSkill: string | null;
  targeting: boolean;
  log: LogEntry[];
  round: number;
  muted: boolean;
  voiceOn: boolean;
  hoverInfo: string | null;
  loot: string[];
  inventory: import('./items').Item[];
  gold: number;
  showInventory: boolean;
  sneaking: boolean;
  depth: number;
  maxDepth: number;
  torchFuel: number;
  torchEquipped: boolean;
  viewMode: ViewMode;
  fpCursor: boolean;
  narrator: { id: number; text: string } | null;
  taunt: { id: number; text: string } | null;
  modal: ModalState | null;
  bossName: string | null;
  groundLootCount: number;
}
```

**Never render from `combat.ts`.** That file has zero imports from Three.js or React.

---

## 3. Cookbook: Add a Skill

### `SkillDef` — every field annotated

Add a new entry to `SKILLS` in `src/content/skills.ts`:

```typescript
// skills.ts — append to SKILLS: Record<string, SkillDef>
export const SKILLS: Record<string, SkillDef> = {
  // example from the existing codebase:
  firebolt: {
    id: 'firebolt',                  // unique key, matches record key
    name: 'Firebolt',                // displayed name
    icon: '🔥',                       // emoji glyph in hotbar
    desc: 'A bolt of stolen brazier-fire: 2d6 fire, DEX save DC 12 or Burning (2 rounds).',
    kind: 'ranged',                  // 'melee' | 'ranged' | 'aoe' | 'heal' | 'buff'
    range: 8,                        // tiles, Chebyshev distance
    aoeRadius: 0,                    // 0 = single target
    cost: 'action',                  // 'action' | 'bonus' | 'free'
    cooldown: 0,                     // rounds before reuse (0 = spammable)
    attackAbility: 'int',            // ability for attack roll
    damageDice: '2d6',               // e.g. "2d6+3" — "" for pure heals/buffs
    damageType: 'fire',              // DamageType union
    saveAbility: 'dex',              // if set, targets roll this save for half damage
    saveDC: 12,                      // DC for the save
    projectile: true,                // animate a projectile from caster to target
    fxColor: 0xff7a1f,               // hex color for FX
    fx: 'fire',                      // ParticleFX union
    appliesCondition: 'burning',     // condition id applied on failed save / hit
    conditionChance: undefined,      // attack-roll: chance to apply on hit (default 1)
    selfCentered: undefined,         // AoE radiates from caster
    targetsAllies: undefined,        // heal / buff
    selfOnly: undefined,             // caster-only
    allAllies: undefined,            // hits every living ally
    shove: undefined,                // knockback tiles on hit
  },
```

### Field reference table

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` | yes | Must match record key |
| `name` | `string` | yes | Hotbar/tooltip name |
| `icon` | `string` | yes | Emoji glyph |
| `desc` | `string` | yes | Tooltip text |
| `kind` | `SkillKind` | yes | `'melee' \| 'ranged' \| 'aoe' \| 'heal' \| 'buff'` |
| `range` | `number` | yes | Chebyshev tiles |
| `aoeRadius` | `number` | yes | 0 = single target |
| `cost` | `SkillCost` | yes | `'action' \| 'bonus' \| 'free'` |
| `cooldown` | `number` | yes | Rounds |
| `attackAbility` | `Ability` | yes | `'str' \| 'dex' \| 'con' \| 'int' \| 'wis' \| 'cha'` |
| `damageDice` | `string` | yes | `""` for pure heals/buffs |
| `damageType` | `DamageType` | yes | `'slashing' \| 'piercing' \| 'bludgeoning' \| 'fire' \| 'cold' \| 'radiant' \| 'force' \| 'poison'` |
| `saveAbility` | `Ability` | no | Target save for half damage |
| `saveDC` | `number` | no | If `saveAbility` is set |
| `healDice` | `string` | no | e.g. `"2d8+4"` |
| `projectile` | `boolean` | no | Animate projectile |
| `fxColor` | `number` | yes | Hex color |
| `fx` | `ParticleFX` | yes | `'slash' \| 'fire' \| 'heal' \| 'arcane' \| 'ice' \| 'arrow' \| 'holy' \| 'bash' \| 'buff' \| 'blood' \| 'poison'` |
| `appliesCondition` | `string` | no | Condition id |
| `conditionChance` | `number` | no | 0–1, attack-roll only |
| `selfCentered` | `boolean` | no | AoE from caster |
| `targetsAllies` | `boolean` | no | Heal/buff |
| `selfOnly` | `boolean` | no | Caster-only |
| `allAllies` | `boolean` | no | Mass heal |
| `shove` | `number` | no | Knockback tiles |

### Hotbar appearance

Skills appear in the player's `equippedSkills: string[]` array (max 12 slots, order matters). The hotbar displays `icon`, `name`, and `cooldown`. Skills with `cooldown > 0` get a grey overlay + cooldown counter. NPCs/AI use the same `useSkill()` method via `aiStep()`.

---

## 4. Cookbook: Add a Monster

### `MonsterDef` — every field

```typescript
// src/content/monsters.ts — append to MONSTER_DEFS: Record<string, MonsterDef>
export interface MonsterDef {
  id: string;
  name: string;          // used with a title, e.g. "Dungeon Rat"
  title: string;         // e.g. "Disease With Whiskers"
  hp: number;
  ac: number;
  moveRange: number;
  abilities: Unit['abilities'];  // full Record<Ability, number>
  skills: string[];              // skill ids from SKILLS
  weapon: WeaponKind;            // 'sword' | 'staff' | 'mace' | 'bow' | 'dagger' | 'club' | 'torch' | 'fish' | 'none'
  scheme: Unit['scheme'];        // full CharacterScheme
  xp: number;                    // XP awarded on kill
  minFloor: number;              // spawn-table entry: earliest floor
  weight: number;                // spawn-table weight (0 = never randomly spawned)
}
```

Real example:

```typescript
rat: M({
  id: 'rat', name: 'Dungeon Rat', title: 'Disease With Whiskers',
  hp: 6, ac: 11, moveRange: 7,
  abilities: { str: 8, dex: 15, con: 8, int: 3, wis: 10, cha: 4 },
  skills: ['bite'], weapon: 'none', xp: 20,
  scheme: { skin: 0x6a5a4a, cloth: 0x5a4c3e, accent: 0x3e332a, hair: 0x2e261e, hood: false, rat: true, bulk: 0.55, eyes: 0xb33a1f },
  minFloor: 1, weight: 4,
}),
```

### Spawn tables

`rollMonsterId(depth, rnd)` filters `MONSTER_DEFS` where `depth >= minFloor && depth <= minFloor + 2 && weight > 0`, then picks weighted-random. Higher `weight` = more common.

```typescript
// skills.ts — the spawn function
export function rollMonsterId(depth: number, rnd: () => number): string {
  const pool = Object.values(MONSTER_DEFS).filter(
    (d) => d.weight > 0 && depth >= d.minFloor && depth <= d.minFloor + 2
  );
  const total = pool.reduce((a, d) => a + d.weight, 0);
  let r = rnd() * total;
  for (const d of pool) { r -= d.weight; if (r <= 0) return d.id; }
  return pool[0]?.id ?? 'rat';
}
```

### AI skill picking

`Combat.aiStep()` iterates `u.equippedSkills`, filters by `canUse()` and range, picks the best. Monsters with multiple skills (e.g. `greg_club` + `greg_slam`) get tactical variety automatically.

```typescript
// combat.ts — AI methodology
for (const s of usable) {
  const cands = foes.filter((f) => Combat.dist(u.pos, f.pos) <= Math.max(1, s.range));
  if (!cands.length) continue;
  if (s.selfCentered) return this.useSkill(u, s.id, u.pos);
  const target = cands.sort((a, b) => a.hp - b.hp)[0];  // target lowest HP
  return this.useSkill(u, s.id, target.id);
}
```

### Floor-boss pattern

Bosses use `weight: 0` so they never randomly spawn. Placed explicitly in `engine.buildFloor()`:

```typescript
// engine.ts — boss placement
if (this.bossAlive) {
  const greg = spawnMonster('greg', this.freeTileNear(bossSpot, 1) ?? bossSpot);
  this.combat.units.push(greg);
  this.addUnit(greg);
  this.bossName = 'Greg the Bouncer';
  // add minions
  for (let i = 0; i < 2; i++) { ... }
}
```

The `bossdead` event unlocks the staircase:

```typescript
// engine.ts — handling bossdead
case 'bossdead': {
  this.narrate(pickBark('gregDead'));
  const stairs = this.fixtures.ofKind('stairs')[0];
  if (stairs) stairs.locked = false;
  this.bossAlive = false;
  break;
}
```

Mid-fight bark at 50% HP is wired in `combat.ts`:

```typescript
// combat.ts — private applyDamage()
if (t.monsterId === 'greg' && !this.bossBarked && t.hp > 0 && t.hp <= effMaxHp(t) / 2) {
  this.bossBarked = true;
  ev.push({ type: 'narrate', text: 'GREG: "That\'s it! You\'re barred! BARRED!"' });
}
```

---

## 5. Cookbook: Add an Item

### `ITEM_BASES` by slot kind

Items live in `src/content/items.ts`. Each slot kind has its own entry pattern:

```typescript
// weapons
sword1: B({ kind: 'weapon', name: 'Worn Longsword', icon: '🗡️', tier: 1,
  weaponKind: 'sword', damageDice: '1d8+1', damageType: 'slashing', value: 15,
  desc: 'A notched but trusty blade.' }),

// offhands
shield1: B({ kind: 'shield', name: 'Battered Buckler', icon: '🛡️', tier: 1,
  acBonus: 1, value: 12, desc: '+1 AC. Dents tell stories.' }),
tome1: B({ kind: 'tome', name: 'Soggy Spellbook', icon: '📖', tier: 1,
  value: 16, desc: '+1 Magic. Pages stuck together by regret.' }),

// armor slots (head, torso, legs, boots, neck, ring)
hood1: B({ kind: 'head', name: 'Musty Hood', icon: '🎩', tier: 1,
  headVisual: 'hood', value: 8, desc: 'Hides your shame. And your hair.' }),
padded: B({ kind: 'torso', name: 'Padded Garb', icon: '🥋', tier: 1,
  acBonus: 1, armorVisual: 'padded', value: 12, desc: '+1 AC. Quilted comfort.' }),

// consumables
potion: B({ kind: 'consumable', name: 'Bottoms-Up Tonic', icon: '🧪', tier: 1,
  healDice: '2d4+2', value: 20, desc: 'Restores 2d4+2 HP.' }),

// tools
key: B({ kind: 'tool', name: 'Rusty Key', icon: '🗝️', tier: 1,
  toolId: 'key', value: 15, desc: 'Opens one locked door.' }),
lockpick: B({ kind: 'tool', name: 'Bent Lockpick', icon: '🥢', tier: 1,
  toolId: 'lockpick', value: 25, desc: 'Pick locked doors with DEX check (DC 13).' }),
```

### `Quirk` system — good/bad/ridiculous

```typescript
export interface Quirk {
  stat?: QuirkStat;      // undefined = pure flavor flag
  amount: number;
  desc: string;
  flag?: string;         // 'fishy' | 'squeaky' | 'haunted' | 'glows'
}
```

Quirk table entries in `QUIRK_DEFS`:

```typescript
// Good quirks (suffix)
str_up: Q({ stat: 'str', amount: [1, 2], good: true, nameGood: 'of the Ox', ... }),
// Bad quirks (prefix)
str_dn: Q({ stat: 'str', amount: [-2, -1], good: false, nameGood: '', nameBad: 'Feeble', ... }),
// Pure flavor
fishy: Q({ good: false, amount: [0, 0], flavor: 'fishy', nameGood: '', nameBad: 'Smelly', ... }),
```

### Naming rule

The random generator builds names as: **`BadPrefix Base GoodSuffix`**

```typescript
// src/content/items.ts — naming logic
it.name = `${pre ? pre + ' ' : ''}${base.name}${suf ? ' ' + suf : ''}`;
// Example output: "Feeble Worn Longsword of the Ox"
```

### `grantsSkill`

Weapons (tier ≥ 2) can randomly grant a skill while equipped:

```typescript
const GRANTABLE_SKILLS = ['fish_slap', 'headbutt', 'dirty_kick', 'sparks'];
if (kind === 'weapon' && tier >= 2 && Math.random() < SKILL_CHANCE) {
  it.grantsSkill = GRANTABLE_SKILLS[Math.floor(Math.random() * GRANTABLE_SKILLS.length)];
}
```

When equipped, `grantsSkill` is added to `u.knownSkills` and auto-slotted if space allows. Unequipping removes it.

### Loot tables

```typescript
export type LootSource = 'crate' | 'barrel' | 'vase' | 'chest' | 'boss' | 'enemy' | 'oil' | 'secret' | 'coffin';

// rollLootTable(source): { items: Item[]; gold: number }
// example:
case 'chest':
  items.push(generateLoot({ minTier: 1, maxTier: 2, rarityBoost: 1.2 }));
  if (Math.random() < 0.5) items.push(generateLoot({ minTier: 1, maxTier: 2 }));
  if (Math.random() < 0.4) items.push(makeItem('key'));
  gold = g(15, 30);
  break;
```

Add a new `LootSource` to the union and a new `case` in `rollLootTable`.

---

## 6. Cookbook: Class Trees

**Note: The class trees system does not exist yet in the codebase.** The current game uses a classless perk-pool system (`perks.ts` — pools: `'martial' | 'arcane' | 'trickery'`). Below is the intended architecture for adding it.

### PLANNED: `treecontent.json` → 10×50 trees

Each class gets a 50-node tree. Nodes follow this pattern:

```json
{
  "classes": {
    "drunkard": {
      "name": "Drunkard",
      "icon": "🍺",
      "branches": ["stagger", "breath", "belly"],
      "tree": [
        // row 0 = major branch, 3 minor branches
        // index 9 = ultimate (level 50)
        { "id": "drunk_stagger_01", "skillNames": ["flail", "stagger"], "row": 0, "col": 0 },
        ...
        { "id": "drunk_ultimate", "skillNames": ["blackout_rage"], "row": 9, "col": 1 }
      ]
    }
  }
}
```

### Scaling by node index

- **Dice**: `damageDice` per node: row 0 = `1d6`, row 3 = `2d6+2`, row 6 = `3d6+4`, row 9 = `4d8+6`
- **Cooldown**: row 0 = 0, row 3 = 1, row 6 = 2, row 9 = 3

### Add an 11th class

1. Add class entry to `treecontent.json`
2. Define its 3 branch skill lists (skill ids from `SKILLS`)
3. Fill 9 rows of branch-major nodes + 1 ultimate node
4. Engine reads `treecontent.json` at level-up instead of `drawLevelUpChoices()`

### RIDICULOUS auto-grant every 5 sober levels

Every 5th sober level (5, 10, 15...100), auto-grant a RIDICULOUS perk/skill from the class's off-branch. These are wild, build-breaking abilities. The `CONDITIONS` table and `SKILLS` table are the right place to define them.

---

## 7. Cookbook: Progression

### Sober 1–100

```typescript
// stats.ts
export const MAX_LEVEL = 100;

export function xpNeed(level: number): number {
  return Math.floor(30 * level + 18 * Math.pow(level, 1.55));
}
// level 1→2: ~48 XP; level 50→51: ~6,900 XP; level 99→100: ~18,000 XP
```

### Per-level gains

```typescript
// combat.ts — awardXP()
while (p.level < MAX_LEVEL && p.xp >= (XP_THRESHOLDS[p.level] ?? Infinity)) {
  p.level++;
  p.maxHp += 5;
  p.hp = Math.min(effMaxHp(p), p.hp + 5);
  p.skillPoints += 1;  // +1 perk choice per level
  // triggers levelup event → engine shows level-up modal
}
```

`effMaxHp(p)` includes quirk bonuses (`quirkSum(u, 'maxHp')`). The `xpNeed` curve means early levels fly by (~2 kills each), later levels slow to a crawl.

### Bonfire-only hotbar editing

The `ModalState` type includes `{ kind: 'loadout' }` — triggered only at bonfire rest. The player reorders `equippedSkills: string[]` and spends `skillPoints` on tree nodes. Combat never allows hotbar editing.

---

## 8. Cookbook: Narrator & Dialogue

### BARKS categories + engine triggers

All hand-written, stored in `src/content/narrator.ts`:

```typescript
export const BARKS: Record<string, string[]> = {
  gameStart: [ "You wake up face-down on cold flagstone..." ],
  floorEnter: [''],  // indexed by depth
  floor1: [ "Floor 1. The bottom of the barrel..." ],
  torchLow: [ "Your torch is guttering..." ],
  torchDied: [ "Your torch dies..." ],
  brazierLit: [ "You light the brazier..." ],
  brazierOut: [ "You extinguish the brazier..." ],
  bonfireRest: [ "You rest by the bonfire..." ],
  death: [ "You die face-down in the dark..." ],
  killGeneric: [ "Down it goes..." ],
  killWithFish: [ "You just killed something with a fish..." ],
  lootJunk: [ "Loot acquired. Technically..." ],
  lootEpic: [ "Now THAT is a find..." ],
  fishEquip: [ "You equip the fish..." ],
  hangoverSevere: [ "The room spins..." ],
  hangoverMild: [ "The headache downgrades..." ],
  hangoverClear: [ "Clarity. Actual clarity..." ],
  companionJoin: [ "Sir Grobnik Marrowdeep rises..." ],
  companionLeaves: [ "Sir Grobnik salutes you..." ],
  companionDeath: [ "Sir Grobnik is down..." ],
  bossDoor: [ "Heavy footsteps ahead..." ],
  gregDead: [ "Greg the Bouncer collapses..." ],
  stairsUp: [ "You climb..." ],
  victory: [ "Daylight. Real daylight..." ],
  secretFound: [ "One of these bricks is loose..." ],
  secretOpen: [ "The hidden door grinds open..." ],
  mimicReveal: [ "The chest has teeth..." ],
  trapTrigger: [ "That was a trap..." ],
  levelup: [ "You feel stronger..." ],
  shoveBrazier: [ "You introduce your enemy to the brazier..." ],
  shoveWall: [ "You shove them into the wall..." ],
  jumpscare: [ "SURPRISE..." ],
  oilIgnite: [ "The oil barrel goes up..." ],
  squeakySneak: [ "Your equipment squeaks..." ],
  hauntedEquip: [ "The item whispers..." ],
  coffinEmpty: [ "Empty..." ],
  coffinSkeleton: [ "The coffin's occupant objects..." ],
  eggFishShrine: [ "A shrine to the Ancient Carp..." ],
  eggDevSkeleton: [ "A skeleton sits at a tiny desk..." ],
  eggTinyDoor: [ "A door, six inches tall..." ],
};

export function pickBark(cat: string): string {
  const pool = BARKS[cat];
  if (!pool || !pool.length) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}
```

Trigger points in the engine:
- `narrate(pickBark('death'))` — `engine.respawn()`
- `narrate(pickBark('killWithFish'))` — `combat.ts` on fish kills
- `narrate(pickBark('shoveBrazier'))` — `engine.animShove()` on brazier collision

### `DialogueState` — authored dialogues

```typescript
export interface DialogueChoice { id: string; label: string; }
export interface DialogueState {
  speaker: string;
  icon: string;
  lines: string[];        // shown one at a time
  idx: number;            // current line
  choices?: DialogueChoice[]; // shown after last line
}
```

Authored examples in `narrator.ts` (now `src/content/narrator.ts`):

```typescript
export const GROBNIK_RECRUIT = {
  speaker: 'Sir Grobnik Marrowdeep',
  icon: '💀',
  lines: [
    'Halt! State your business, warm-blood...',
    'What\'s that? Escaping the Underdrek? Splendid...',
    'I am Sir Grobnik Marrowdeep, Knight of the Ancient Carp!...',
  ],
  choices: [
    { id: 'recruit', label: '🤝 "Welcome aboard, Sir Grobnik."' },
    { id: 'rob', label: '💰 "Actually, I just wanted your coffin\'s loot."' },
  ],
};

export const GREG_INTRO = [
  'GREG THE BOUNCER: "Well. Well, well..."',
  'GREG THE BOUNCER: "Four. Thousand. Gold..."',
  'GREG THE BOUNCER: "I\'m gonna bounce you right back down those stairs..."',
  'GREG THE BOUNCER: "LAST CALL, underpants."',
];
```

### Lore notes

```typescript
export const LORE_NOTES: { title: string; text: string }[] = [
  { title: 'A soggy bar tab', text: '"TAB — 1× Dragonmouth Ale...' },
  { title: 'Bouncer\'s memo, page 1', text: '"REMINDER: the drunk ones go on Floor 1...' },
  // ...
];
```

Placed via POI `'loreNote'` in `dungeon.ts`. Engine reads `LORE_NOTES[f.noteIdx]`.

### Design law

**Narrator lines are hand-written, never runtime-generated.** The `pickBark()` function picks randomly from pre-authored arrays. No LLM calls, no string concatenation, no procedural prose. Comedy must be authored, not generated.

---

## 9. Cookbook: Dungeon Content

### FixtureManager — interactive POI objects

```typescript
// fixtures.ts
export type FixtureKind = 'brazier' | 'bonfire' | 'stairs' | 'coffin' | 'note' | 'egg' | 'pillar' | 'rubble';

export interface Fixture {
  id: string;
  kind: FixtureKind;
  pos: GridPos;
  group: THREE.Group;
  lit?: boolean;          // brazier
  light?: THREE.PointLight;
  opened?: boolean;       // coffin / note / egg
  locked?: boolean;       // stairs
  noteIdx?: number;
  eggId?: string;
  special?: string;       // 'grobnik'
}
```

Each `FixtureKind` has an `add*` method in `FixtureManager`:

```typescript
addBrazier(pos: GridPos, lit: boolean): Fixture
addBonfire(pos: GridPos): Fixture
addStairs(pos: GridPos, locked: boolean): Fixture
addCoffin(pos: GridPos, special?: string): Fixture
addNote(pos: GridPos, noteIdx: number): Fixture
addEgg(pos: GridPos, eggId: string): Fixture
addPillar(pos: GridPos): Fixture
addRubble(pos: GridPos): Fixture
```

All use the local `Vox` mini-cube assembler (`CELL = 0.055`). Adding a new fixture kind: create an `add*` method that builds voxels and pushes to `this.fixtures[]`, then wire its interaction in `engine.interactFixture()`.

### Destructibles — Vox props

```typescript
// destructibles.ts
export interface DestructibleDef {
  id: LootSource;      // also the loot-table source key
  name: string;
  icon: string;
  hp: number;
  volatile?: boolean;  // oil barrel: explodes on fire damage
  palette: number[];   // debris burst colors
  build: (v: Vox) => void;
}

export const DESTRUCTIBLE_DEFS: Record<string, DestructibleDef> = {
  crate: { id: 'crate', name: 'Crate', icon: '📦', hp: 8,
    palette: [WOOD, WOOD_DARK, WOOD_MID],
    build: (v) => v.shell(12, WOOD, WOOD_DARK),
  },
  oil_barrel: { id: 'oil', name: 'Oil Barrel', icon: '🛢️', hp: 6,
    volatile: true, palette: [0x3a2e22, IRON, OIL, 0xff7a1f],
    build: (v) => buildBarrel(v, true),
  },
};
```

`DestructibleManager.place(defId, x, z)` builds the voxel InstancedMesh, adds a pickbox, blocks the tile, and returns the `Destructible`. `destroy()` unblocks the tile and calls `rollLootTable(def.id)`.

### Traps

```typescript
// traps.ts
export interface TrapDef {
  id: string; name: string; icon: string;
  damageDice: string; damageType: DamageType;
  appliesCondition?: string; conditionRounds?: number;
}

export const TRAP_DEFS: Record<string, TrapDef> = {
  spike: { id: 'spike', name: 'Spike Trap', icon: '🕳️',
    damageDice: '2d6', damageType: 'piercing',
    appliesCondition: 'bleeding', conditionRounds: 2 },
  fire: { id: 'fire', name: 'Fire Trap', icon: '🔥',
    damageDice: '3d6', damageType: 'fire',
    appliesCondition: 'burning', conditionRounds: 2 },
  snare: { id: 'snare', name: 'Snare Trap', icon: '🪢',
    damageDice: '0', damageType: 'piercing',
    appliesCondition: 'rooted', conditionRounds: 2 },
};
```

POI-to-trap mapping: `{ trapSpike: 'spike', trapFire: 'fire', trapSnare: 'snare' }`.

### Secret doors and easter eggs

Secret doors are placed by `DungeonFloor.placeSecrets()`. Revealed when `Combat.dist(player.pos, d) <= 2`. Click opens the door (removes wall, reveals a secret room with a `secretChest`).

Easter eggs (3 IDs: `'fishShrine'`, `'devSkeleton'`, `'tinyDoor'`) are placed via POI `'easterEgg'` with `data: { id }`. Each builds a unique voxel sculpture and triggers a bark.

### POI flow: generator → engine

```
DungeonFloor.generate() → this.pois: POI[]
  ↓
engine.buildFloor() iterates pois[]:
  switch (poi.kind):
    'brazier'      → fixtures.addBrazier()
    'coffin'       → fixtures.addCoffin()
    'chest'        → props.place('chest_small')
    'enemyPack'    → rollMonsterId() + spawnMonster()
    'trapSpike'    → trapManager.init() (auto-resolved)
    'loreNote'     → fixtures.addNote()
    'easterEgg'    → fixtures.addEgg()
    'jumpscare'    → engine.jumpscarePOIs.push()
    'partySpawn'   → used for player position
    'bossSpawn'    → boss placement + stairs
```

To add a new POI kind: define it in `POIKind`, generate it in `DungeonFloor.placePOIs()`, handle it in `engine.buildFloor()`, and add interaction logic.

---

## 10. Art Pipeline

### HI-RES constants

| Asset | Cube Edge | Notes |
|---|---|---|
| Characters | `const C = 0.05` | `buildCharacter()`, grid coords doubled |
| Props/Fixtures | `const CELL = 0.055` | `DestructibleManager`, `FixtureManager` |
| Textures | `S = 128` | `makeTexture()`, `NearestFilter`, no mipmaps |
| Particles | `const EDGE = 0.08` | `ParticleSystem`, cube edge per particle |

### Texture painters

All procedural, S-relative (detail scales with canvas size):

```typescript
type Painter = (ctx: CanvasRenderingContext2D, rnd: () => number, S: number) => void;
```

Current painters (in `textures.ts`): `flagstone`, `mossstone`, `bonefloor`, `dungeonbrick`, `grass_top`, `grass_side`, `dirt`, `stone`, `brick`, `sand`, `wood`, `leaves`, `water`, `snow`.

Add a new painter:

```typescript
const painters: Record<string, Painter> = {
  my_new_floor(ctx, rnd, S) {
    // fill with noise + detail
    noiseFill(ctx, rnd, S, '#443322', ['#554433', '#332211']);
    // add unique markings
    for (let i = 0; i < 10; i++) px(ctx, rnd() * S, rnd() * S, S / 16, S / 16, '#ffcc00');
  },
};
```

Material name in `painters` matches the string used in `DungeonFloor.topMat[][]` and `fallbacks`:

```typescript
const fallbacks: Record<string, number> = {
  flagstone: 0x8a8a92, mossstone: 0x5f7a4a, bonefloor: 0xc9c2ae, dungeonbrick: 0x6e5a4c,
};
```

### Creature scheme flags

```typescript
export interface CharacterScheme {
  skin: number; cloth: number; accent: number; hair: number;
  hood: boolean;
  bulk?: number;        // group scale (rats ~0.55, bosses ~1.35)
  orc?: boolean;        // green-skin: pointed ears, tusks, brow
  bones?: boolean;      // skeleton: rib rows, dark sockets, ember eyes
  rat?: boolean;        // snout, round ears, pink tail
  spider?: boolean;     // 6 extra side legs
  teeth?: boolean;      // mimic: toothy maw across the torso
  eyes?: number;        // override eye color
}
```

Each flag auto-adds voxel features in `buildCharacter()`. No code changes needed to support a new visual combo.

### Weapon kinds

```typescript
export type WeaponKind = 'sword' | 'staff' | 'mace' | 'bow' | 'dagger' | 'club' | 'torch' | 'fish' | 'none';
```

Each has a `buildWeapon()` case in `characters.ts` that builds the voxel mesh. Armor visuals are driven by `ArmorVisual` and `HeadVisual`:

```typescript
export type ArmorVisual = 'bare' | 'padded' | 'leather' | 'chain' | 'robes';
export type HeadVisual = 'none' | 'hood' | 'helmet' | 'hat';
export type OffhandVisual = 'none' | 'shield' | 'tome';
```

### Palettes

Colors in palette arrays are used by `FX.debris()` for destructible shrapnel, defined per `DestructibleDef.palette`:

```typescript
palette: [WOOD, WOOD_DARK, WOOD_MID]  // crate shrapnel colors
```

---

## 11. Audio Pipeline

### SFX files

Placed in `public/audio/*.mp3`. Loaded by filename:

```typescript
const SFX_FILES = [
  'sword_hit', 'fireball', 'heal', 'magic_missile',
  'arrow', 'dice', 'victory', 'ui_click',
] as const;
export type SfxName = (typeof SFX_FILES)[number];
```

AudioManager plays via `play(name, volume, rate)`:

```typescript
play(name: SfxName, volume = 1, rate = 1)
```

To add a new SFX: drop the `.mp3` in `public/audio/`, add the filename (without extension) to `SFX_FILES`, call `this.audio.play('my_sfx')`.

### Procedural drums

Combat drums run at 132 BPM, synthesized in `scheduleDrums()`:

```typescript
// Kick on beats 0, 6, 10; tom on 4, 12; hat on odd beats
if (b === 0 || b === 6 || b === 10) this.drum(this.nextBeat, 110, 0.5, 0.9);
if (b === 4 || b === 12) this.drum(this.nextBeat, 190, 0.32, 0.7);
if (b % 2 === 1) this.hat(this.nextBeat, 0.12 + (b % 4 === 3 ? 0.1 : 0));
if (b === 14) this.drum(this.nextBeat, 90, 0.6, 1);
```

Toggled by engine on `phase === 'combat'`:

```typescript
this.audio.setDrums(true);  // combat start
this.audio.setDrums(false); // explore / defeat
```

### TTS narrator (planned)

The `voiceOn` flag in `UISnapshot` and the `DialogueState.lines` array are designed for TTS integration. Each line is a complete sentence the narrator reads. The `'narrator'` log kind and `narratorLatest` snapshot field provide the current bark text.

---

## 12. Formulas & Balance

### d20 vs AC

```typescript
// types.ts → dice.ts
export function rollD20(bonus: number, extraDice = ''): D20Result {
  const roll = 1 + Math.floor(Math.random() * 20);
  const extra = extraDice ? rollDice(extraDice).total : 0;
  return {
    roll, bonus, extra,
    total: roll + bonus + extra,
    crit: roll === 20,
    fumble: roll === 1,
  };
}

// Attack resolution (combat.ts):
const hit = auto || atk.crit || surpriseCrit || (!atk.fumble && atk.total >= tgtAC);
```

### Ability modifier

```typescript
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}
// str 10 → +0, str 14 → +2, str 18 → +4
```

### Saves

Saving throw skills: target rolls `d20 + abilityMod(effAbility(t, saveAbility))` vs `saveDC`:

```typescript
const save = rollD20(abilityMod(effAbility(t, s.saveAbility)));
const success = save.total >= (s.saveDC ?? 12);
if (success) amount = Math.floor(amount / 2);
```

### XP values

| Monster | XP |
|---|---|
| Rat | 20 |
| Goblin | 30 |
| Goblin Rock-Lobber | 30 |
| Skeleton | 35 |
| Skeleton Archer | 35 |
| Zombie | 45 |
| Spider | 40 |
| Cultist | 55 |
| Mimic | 80 |
| Greg (boss) | 400 |

### Dice notation

`rollDice(expr: string)` parses `NdM+K`:

```typescript
// regex: /^(\d*)d(\d+)\s*([+-]\s*\d+)?$/i
// examples:
rollDice('2d6')    → { total: 7, rolls: [3,4], modifier: 0 }
rollDice('1d8+2')  → { total: 6, rolls: [4], modifier: 2 }
rollDice('3d4+3')  → { total: 10, rolls: [2,3,2], modifier: 3 }
```

### XP need curve

```typescript
// stats.ts
export function xpNeed(level: number): number {
  return Math.floor(30 * level + 18 * Math.pow(level, 1.55));
}
```

| Level | XP to next | Cumulative |
|---|---|---|
| 1 → 2 | ~48 | 48 |
| 5 → 6 | ~316 | ~1,020 |
| 10 → 11 | ~869 | ~4,900 |
| 25 → 26 | ~3,712 | ~42,600 |
| 50 → 51 | ~12,260 | ~247,000 |
| 99 → 100 | ~34,500 | ~965,000 |

---

## 13. Do's & Don'ts

### DO

- **Add data entries** to `SKILLS`, `MONSTER_DEFS`, `ITEM_BASES`, `QUIRK_DEFS`, `DESTRUCTIBLE_DEFS`, `TRAP_DEFS`, `CONDITIONS`, `PERKS`, `BARKS`, `LORE_NOTES`, painter functions
- **Add new weapon kinds** to the `WeaponKind` union + `buildWeapon()` switch
- **Add new creature flags** to `CharacterScheme` + if-block in `buildCharacter()`
- **Add new loot sources** to `LootSource` union + switch case in `rollLootTable()`
- **Add new FX presets** as static methods on `FX` in `particles.ts`
- **Add new `SkillKind`** to the union + resolution logic in `combat.ts` (rare)
- **Use `pickBark()`** for all narrator lines — pre-authored, not generated
- **Prefer `quirkSum()`** over direct mutation for stat calculations
- **Keep `setHangover()`** as the only hangover modifier

### DON'T

- **Don't mutate `Unit` at render time.** `effAC()`, `effMove()`, `effMaxHp()`, `effAbility()` are pure — they read, never write.
- **Don't per-frame allocate in `engine.update()`.** The particle system uses pools (`glowPool`, `solidPool`). No `new THREE.Vector3()` in hot paths (reuse `tmpColor`, `m4`, `q`, etc.).
- **Don't import engine or Three.js into `combat.ts`.** Combat is pure logic. It returns `CombatEvent[]` — it doesn't know what a mesh is.
- **Don't runtime-generate prose.** The `pickBark()` function selects from authored arrays. No sprintf, no LLM, no template concatenation for narrative.
- **Don't add new files for content.** Every new skill, monster, item, etc. is a line in an existing file. Only create new files for genuinely new systems.
- **Don't touch `dungeon.ts` for content.** POI placement rules live in `DungeonFloor.placePOIs()`; add new POI kinds there, but spawn tables and loot stay in `src/content/monsters.ts` / `src/content/items.ts`.
- **Don't break the one-way snapshot.** React reads `UISnapshot`; it never calls Three.js or reads combat internals.
- **Don't forget `conditionChance`.** Attack-roll skills that apply a condition must set this (e.g. `bite` uses `conditionChance: 0.3` for 30% Bleeding). Default is 1 (always).
- **Don't add code that generates random items outside `generateLoot()`.** The loot pipeline is `ITEM_BASES → generateLoot() → rollLootTable()`. Any bypass breaks rarity balance.

---

## Appendix: File Map

### Content (LLM-editable zone — src/content/)

| file | what lives here | key exports |
|---|---|---|
| `src/content/skills.ts` | `SKILLS`, `CONDITIONS` | `SKILLS`, `CONDITIONS` |
| `src/content/monsters.ts` | `MONSTER_DEFS`, `MonsterDef` | `MONSTER_DEFS`, `MonsterDef` |
| `src/content/items.ts` | `ITEM_BASES`, `QUIRK_DEFS`, loot generator | `Item`, `Quirk`, `ITEM_BASES`, `QUIRK_DEFS`, `generateLoot()`, `rollLootTable()`, `makeItem()`, `makeTheFish()` |
| `src/content/narrator.ts` | Hand-written barks, dialogues, lore | `BARKS`, `LORE_NOTES`, `GROBNIK_*`, `GREG_INTRO`, `pickBark()` |
| `src/content/treecontent.json` | 10 class × 50 node trees + ridiculous pool | `classes[]`, `ridiculous[]` |

### Engine + Logic (supervisor-only — src/game/)

| file | what lives here | key exports |
|---|---|---|
| `types.ts` | All shared types | `SkillDef`, `Unit`, `CombatEvent`, `UISnapshot`, `ModalState`, `DialogueState`, `CharacterScheme`, `GridPos`, `DamageType`, `Ability` |
| `skills.ts` | Unit factories + re-exports from content | `registerSkills()`, `createPlayer()`, `createCompanion()`, `spawnMonster()`, `rollMonsterId()` — re-exports `SKILLS`, `CONDITIONS`, `MONSTER_DEFS`, `MonsterDef` |
| `perks.ts` | Perk pools (classless) | `PERKS`, `PerkDef`, `availablePerks()`, `drawLevelUpChoices()` |
| `stats.ts` | Effective stats, SOBERING progression | `quirkSum()`, `effAC()`, `effMove()`, `effMaxHp()`, `effAbility()`, `xpNeed()`, `MAX_LEVEL` |
| `combat.ts` | Pure logic: combat, skills, AI | `Combat` class, `TacticalWorld` |
| `engine.ts` | Presentation, Three.js scene, animations | `GameEngine` class |
| `dungeon.ts` | Procedural 128×128 floor generator | `DungeonFloor`, `DUNGEON_SIZE`, `POI`, `DungeonRoom` |
| `fixtures.ts` | Interactive POI objects | `FixtureManager`, `Fixture`, `FixtureKind` |
| `destructibles.ts` | Breakable crates/barrels/chests | `DestructibleManager`, `DESTRUCTIBLE_DEFS`, `Vox` |
| `characters.ts` | Voxel character rigs | `buildCharacter()`, `buildWeapon()`, `updateRig()`, `Rig` |
| `textures.ts` | Procedural 128×128 tile textures | `getTextures()`, `TextureSet`, `painters{}` |
| `particles.ts` | Pooled voxel particle system, FX presets | `ParticleSystem`, `FX`, `BurstOpts` |
| `traps.ts` | Hidden floor traps | `TrapManager`, `TRAP_DEFS`, `TrapDef` |
| `audio.ts` | WebAudio SFX, procedural drums | `AudioManager`, `SfxName` |
| `dice.ts` | d20, NdM+K dice roller | `rollDice()`, `rollD20()`, `abilityMod()` |
