// ─────────────────────────────────────────────────────────────
// VOXEL REALMS — core type definitions
// Everything data-driven lives here. See docs/EXPANSION_GUIDE.md
// for how an LLM (or human) should extend these structures.
// ─────────────────────────────────────────────────────────────

export type Team = 'party' | 'enemy';
export type GamePhase = 'menu' | 'explore' | 'combat' | 'victory' | 'defeat';
export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type DamageType =
  | 'slashing' | 'piercing' | 'bludgeoning'
  | 'fire' | 'cold' | 'radiant' | 'force' | 'poison';
export type SkillCost = 'action' | 'bonus' | 'free';
export type SkillKind = 'melee' | 'ranged' | 'aoe' | 'heal' | 'buff';

export interface GridPos { x: number; z: number; }

/** Visual recipe for a voxel character (built in characters.ts). */
export interface CharacterScheme {
  skin: number;
  cloth: number;
  accent: number;
  hair: number;
  hood: boolean;
  bulk?: number;        // group scale (goblins ~0.85, bosses ~1.15)
  orc?: boolean;        // green-skin features: pointed ears, tusks, brow
  style?: 'normal' | 'chibi';  // normal proportions or chibi stubby
  monster?: 'rat' | 'bat' | 'skeleton';  // beast/undead rigs (characters.ts)
}

export type WeaponKind = 'sword' | 'staff' | 'mace' | 'bow' | 'dagger' | 'club' | 'torch';
export type Klass = 'fighter' | 'wizard' | 'cleric' | 'goblin';

export type ParticleFX =
  | 'slash' | 'fire' | 'heal' | 'arcane' | 'ice'
  | 'arrow' | 'holy' | 'bash' | 'buff' | 'blood';

export interface SkillDef {
  id: string;
  name: string;
  icon: string;           // emoji glyph used in the hotbar
  desc: string;           // tooltip text
  kind: SkillKind;
  range: number;          // tiles (Chebyshev distance)
  aoeRadius: number;      // 0 = single target
  cost: SkillCost;
  cooldown: number;       // rounds before reuse (0 = spammable)
  attackAbility: Ability; // ability used for the attack roll
  damageDice: string;     // e.g. "2d6+3" — "" for pure heals/buffs
  damageType: DamageType;
  saveAbility?: Ability;  // if set, targets roll this save for half damage
  saveDC?: number;
  healDice?: string;      // e.g. "2d8+4"
  projectile?: boolean;   // animate a projectile from caster to target
  fxColor: number;
  fx: ParticleFX;
  appliesCondition?: string; // condition id applied on failed save / hit
  selfCentered?: boolean;    // AoE radiates from the caster
  targetsAllies?: boolean;   // heal / buff
  selfOnly?: boolean;        // caster-only (second wind, arcane shield)
  allAllies?: boolean;       // hits every living ally (mass heal)
}

export interface Condition {
  id: string;             // 'blessed' | 'slowed' | 'burning' ...
  name: string;
  roundsLeft: number;
}

export interface Unit {
  id: string;
  name: string;
  title: string;          // "Goblin Cutthroat", "Human Fighter"...
  team: Team;
  klass: Klass;
  level: number;
  xp: number;             // accumulated experience
  skillPoints: number;    // unspent (used by a later chunk)
  equipment: { weapon?: import('./items').Item; armor?: import('./items').Item; trinket?: import('./items').Item };
  maxHp: number;
  hp: number;
  ac: number;
  abilities: Record<Ability, number>;
  proficiency: number;
  moveRange: number;      // tiles per turn
  pos: GridPos;
  alive: boolean;
  knownSkills: string[];      // starting + unlocked via skill tree
  equippedSkills: string[];   // the hotbar (max 4)
  unlockedNodes: string[];    // skill-tree node ids
  bonusAC: number;            // permanent passives (skill tree)
  bonusMove: number;
  cooldowns: Record<string, number>;
  hasAction: boolean;
  hasBonus: boolean;
  movementLeft: number;
  initiative: number;
  conditions: Condition[];
  scheme: CharacterScheme;
  weapon: WeaponKind;
  xpValue: number;        // used by the loot/XP hooks
  // ── dungeon encounter fields (optional) ──
  dormant?: boolean;      // not yet aggroed — excluded from combat until its group activates
  groupId?: string;       // enemies sharing a groupId aggro together
  bossGroup?: boolean;    // only activated by the boss cutscene, never by proximity
  dropKey?: 'iron' | 'golden';  // guaranteed key drop on death
  flying?: boolean;       // hovers above the floor (bats)
}

export type LogKind = 'info' | 'hit' | 'miss' | 'crit' | 'heal' | 'death' | 'system' | 'roll';
export interface LogEntry { id: number; text: string; kind: LogKind; }

/** Snapshot pushed to the React HUD whenever anything changes. */
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
  hoverInfo: string | null;
  loot: string[];         // human-readable recap lines (victory screen)
  inventory: import('./items').Item[];
  gold: number;
  showInventory: boolean;
  showSkillTree: boolean;
  sneaking: boolean;
  torchLit: boolean;
  torchEquipped: boolean;
  bigMessage: string | null;
}

// ── combat events: the pure-logic layer (combat.ts) emits these,
// the presentation layer (engine.ts) animates them sequentially ──
export type CombatEvent =
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
  | { type: 'loot'; items: import('./items').Item[]; gold: number }
  | { type: 'levelup'; unitId: string }
  | { type: 'shake'; power: number };
