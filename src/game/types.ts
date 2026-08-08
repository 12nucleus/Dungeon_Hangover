// ─────────────────────────────────────────────────────────────
// VOXEL REALMS — core type definitions
// Everything data-driven lives here. See docs/EXPANSION_GUIDE.md
// for how an LLM (or human) should extend these structures.
// ─────────────────────────────────────────────────────────────

export type Team = 'party' | 'enemy';
export type GamePhase = 'menu' | 'explore' | 'combat' | 'victory' | 'defeat' | 'creation';
export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/**
 * The 15 class skill pools from the design bible. Every playable class is
 * selectable in character creation (pick 2) and contributes its own skill list.
 */
export type ClassId =
  | 'bar_bouncer' | 'gutter_rogue' | 'karaoke_bard' | 'sommelier'
  | 'barista' | 'accountant' | 'dentist' | 'plumber'
  | 'wedding_planner' | 'tabloid_reporter' | 'haunted_chef' | 'shaman'
  | 'zoologist' | 'insurance_adjuster' | 'mortician';
export type DamageType =
  | 'slashing' | 'piercing' | 'bludgeoning'
  | 'fire' | 'cold' | 'radiant' | 'force' | 'poison';
export type SkillCost = 'action' | 'bonus' | 'free';
export type SkillKind = 'melee' | 'ranged' | 'aoe' | 'heal' | 'buff';
export type EquipSlot = 'head' | 'chest' | 'legs' | 'boots' | 'gloves' | 'arms' | 'cloak' | 'belt' | 'trinket' | 'weapon' | 'offHand' | 'amulet' | 'ring';

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
  monster?: 'rat' | 'bat' | 'skeleton' | 'leech' | 'blob' | 'mushroom' | 'crawler' | 'fish' | 'frog';  // beast/undead rigs (characters.ts)
  kind?: 'wizard' | 'barmaid' | 'bouncer' | 'barkeep';  // distinct tavern NPC silhouettes
  /**
   * "naked" rebuilds the rig as underwear only — no shirt, no pants, no boots,
   * no belt/buckle/laces. Used for Greg's dungeon spawn ("yes, underwear, the
   * dungeon has a sense of humour"). Cloth + accent become the boxer/bra trim.
   */
  naked?: boolean;
  /**
   * Hair style variant for the normal (buildPlayerRig) humanoids — used to give
   * tavern NPCs (patron, snoozer, …) distinct silhouettes. Defaults to 'mop'.
   */
  hairStyle?: 'mop' | 'bald' | 'buzz' | 'balding' | 'bun' | 'mohawk';
  /** Full beard under the jaw, rendered in the hair colour. */
  beard?: boolean;
}

export type WeaponKind = 'sword' | 'staff' | 'mace' | 'bow' | 'dagger' | 'club' | 'torch' | 'unarmed';
export type Klass = 'fighter' | 'wizard' | 'cleric' | 'goblin';

/** Result of the character-creation builder, applied to Greg on confirm. */
export interface CharacterBuild {
  /** the 2 chosen class pools */
  classes: [ClassId, ClassId];
  /** final ability scores after point-buy (all 6 present) */
  abilities: Record<Ability, number>;
  /** the 2 chosen starting skill ids */
  skills: string[];
  /** the 12-slot hotbar loadout (skill ids / null). */
  hotbarLoadout: (string | null)[];
}

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
  appliesRounds?: number;    // duration of appliesCondition (default 3)
  appliesChance?: number;    // 0..1 — chance the rider condition lands (default 1)
  selfCentered?: boolean;    // AoE radiates from the caster
  targetsAllies?: boolean;   // heal / buff
  selfOnly?: boolean;        // caster-only (second wind, arcane shield)
  allAllies?: boolean;       // hits every living ally (mass heal)

  // ── design-bible additions (all 750 class skills) ──
  classId?: ClassId;          // owning class pool
  tier?: 1 | 2 | 3 | 4 | 5;   // unlock tier (1..5 + capstone=5)
  levelReq?: number;          // character level required to unlock (0 = always)
  passive?: boolean;          // passive (0 AP, persistent) vs active
  apCost?: number;            // action-point cost (design-bible AP system)
  procsOncePerTurn?: boolean; // proc effects trigger once per turn
  stacking?: string;          // stacking notes (combo metadata)
  combo?: string[];           // [COMBO] partner skill ids
  capstone?: boolean;         // level-50 capstone skill

  // ── boss-gate fields (aiStep honors these) ──
  /** only usable while the caster is BELOW this HP percentage (0..1) */
  hpBelowPct?: number;
  /** only usable while the caster is ABOVE this HP percentage (0..1) */
  hpAbovePct?: number;
  /** usable only once per fight (tracked on unit.cooldowns['once_<skillId>']) */
  oncePerFight?: boolean;
  /** summon template id from SUMMON_TEMPLATES on use */
  summonId?: string;
  /** how many minions this summon spawns (default 1) */
  summonCount?: number;
  /** raise-dead: resurrect this fight's fallen enemies as party skeletons */
  raiseCorpses?: 'one' | 'all';
}

/** A playable class from the design bible (15 total). */
export interface ClassDef {
  id: ClassId;
  name: string;
  icon: string;
  tagline: string;          // short pitch
  role: string;             // combat role label
  lore: string;             // class lore (from bible)
  pros: string[];           // what it's good at
  cons: string[];           // weaknesses
  /** CharacterScheme (+weapon) used to render the in-engine voxel portrait */
  portrait: { scheme: CharacterScheme; weapon: WeaponKind };
  tier1Skills: string[];    // skill ids offered as starting choices
}

export interface Condition {
  id: string;             // 'blessed' | 'slowed' | 'burning' ...
  name: string;
  roundsLeft: number;
  /** damage-over-time tick applied at the start of the carrier's turn */
  dot?: { dice: string; type: DamageType };
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
  equipment: { head?: import('./items').Item; chest?: import('./items').Item; legs?: import('./items').Item; boots?: import('./items').Item; gloves?: import('./items').Item; arms?: import('./items').Item; belt?: import('./items').Item; cloak?: import('./items').Item; trinket?: import('./items').Item; weapon?: import('./items').Item; offHand?: import('./items').Item; amulet?: import('./items').Item; ring1?: import('./items').Item; ring2?: import('./items').Item };
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
  /** the free basic attack (⚔️ phase) is spent for this turn */
  attackUsed?: boolean;
  movementLeft: number;
  initiative: number;
  conditions: Condition[];
  scheme: CharacterScheme;
  weapon?: WeaponKind;
  xpValue: number;        // used by the loot/XP hooks

  // ── character-creation additions (party units) ──
  /** up to 2 chosen class pools (design-bible classes). Empty for enemies. */
  classes?: ClassId[];
  /** bonus ability points from creation point-buy (added on top of base). */
  allocatedStats?: Partial<Record<Ability, number>>;
  /** 12-slot hotbar loadout (skill ids or null for empty). Only party uses it. */
  hotbarLoadout?: (string | null)[];
  // ── dungeon encounter fields (optional) ──
  dormant?: boolean;      // not yet aggroed — excluded from combat until its group activates
  groupId?: string;       // enemies sharing a groupId aggro together
  /** voice-id for the monster bark audio (npc/<id>_bark.mp3) */
  npcId?: string;
  bossGroup?: boolean;    // only activated by the boss cutscene, never by proximity
  dropKey?: 'iron' | 'golden';  // guaranteed key drop on death
  flying?: boolean;       // hovers above the floor (bats)
  restedAtBonfire?: boolean;
  /** AI flees (full-move away) once HP drops to this value or below */
  fleesAtHp?: number;
  /** room leash: enemy AI movement (chase AND flee) never leaves this world
   *  rect — dungeon groups can't leak into neighbouring rooms mid-fight */
  leash?: { x0: number; z0: number; x1: number; z1: number };
  /** guaranteed item/gold drop on death (items via makeItem ids); `random`
   *  draws `count` random ids from each pool at kill time */
  deathDrops?: { itemIds?: string[]; gold?: number; random?: { pool: string[]; count?: number }[] };
  /** monster passive: chance to apply a condition on a landed hit */
  onHit?: { condition: string; chance: number; rounds: number; saveAbility?: Ability; saveDC?: number };
  /** home bath tile — bath_time teleports here */
  bathPos?: GridPos;
  /** last damage type received (death hooks: bone rat vs fire) */
  lastDamageKind?: DamageType;
  /** bone rat: already reassembled once this run */
  reassembledOnce?: boolean;
  /** bone rat: bones burned — never reassembles */
  burnPrevented?: boolean;
  /** next attack is a guaranteed crit (shadow_step / xray) */
  sneak?: boolean;
  /** vow bond: this unit's partner shares its damage (The Vow) */
  vowPartner?: string;
  /** summoned wall/totem lifetime: fades when this hits 0 at its turn start */
  turnsLeft?: number;
  // ── idle patrolling (M8) ──
  /** home tile the mob patrols around (anchor point) */
  home?: GridPos;
  /** seconds until the next patrol leg (counted down in updateDungeon) */
  patrolT?: number;
}

export type LogKind = 'info' | 'hit' | 'miss' | 'crit' | 'heal' | 'death' | 'system' | 'roll';
export interface LogEntry { id: number; text: string; kind: LogKind; }

/** Snapshot pushed to the React HUD whenever anything changes. */
export interface UISnapshot {
  phase: GamePhase;
  /** current floor number (50) + display name */
  floor?: number;
  floorName?: string;
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
  showStats: boolean;
  sneaking: boolean;
  running: boolean;
  throwing: boolean;
  /** overhead tactical camera view active (top-down on the field) */
  tacticalView: boolean;
  torchLit: boolean;
  torchEquipped: boolean;
  bigMessage?: string | null;
  cinematic?: boolean;
  /** engine is mid-cutscene/interaction — UI should not fight it */
  busy?: boolean;
  /** true while the in-game pause menu is open (simulation frozen) */
  paused?: boolean;
  minimapTiles?: { walk: boolean[][]; heights: number[][]; units: { x: number; z: number; team: 'party' | 'enemy' }[] };
  /** party leader's facing (radians, THREE rotation.y) — drives the rotating minimap */
  heroYaw?: number;
  showBonfireUI?: boolean;
  showBonfireLoadout?: boolean;
  showFullMap?: boolean;
  /** quest-log panel open (J key) */
  showQuestLog?: boolean;
  /** nearest talkable NPC id (generic registry) */
  talkTarget?: string | null;
  /** active interactable prompt, e.g. "[E] Drink from the puddle" */
  interactPrompt?: string | null;
  /** quest log entries for the J panel */
  quests?: { id: string; name: string; stage: string; desc: string }[];
  /** vendor shop panel (Floor 49 Spore Merchant) */
  showShop?: boolean;
  shopNpcName?: string;
  /** Myke's loyalty card is active (Frog Tongue Shortage reward) */
  shopDiscount?: boolean;
  shopStock?: { baseId: string; name: string; icon: string; tier: number; kind: string; price: number; levelReq?: number; canBuy: boolean; pitch: string }[];
  /** big center-screen combat phase flash (keyed by id — re-mounts on change) */
  phaseBanner?: { text: string; cls: string; id: number } | null;
  /** run recap counters (victory screen) */
  runStats?: { kills: number; deaths: number; questsDone: number; secretsFound: number; startedAt: number };
  showDialogue?: { npcId: string; npcName: string; text: string; caption?: string; choices?: { label: string; index: number }[] } | null;
  /** visual dice roll (animated die overlay) */
  diceShow?: { die: string; total: number; reason: string; at: number } | null;
  /** loot-preview overlay — what just dropped, what to take */
  pendingLoot?: { source: string; items: import('./items').Item[]; gold: number } | null;
  /** BG3-style turn phase: walk → action → bonus → end turn */
  turnMode?: 'walk' | 'action' | 'bonus';
  /** player-curated item bar (consumable keys in display order, max 6) */
  itemBar?: string[];
  /** next tile click is a jump (budget-2 hop) */
  jumpMode?: boolean;
  /** cheat console overlay (backtick key) */
  showConsole?: boolean;
  consoleInput?: string;
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
  | { type: 'dice'; die: string; total: number; reason: string }
  | { type: 'loot'; items: import('./items').Item[]; gold: number }
  | { type: 'levelup'; unitId: string }
  | { type: 'shake'; power: number }
  | { type: 'summon'; unit: Unit };  // a new unit fades in (boss summons, Scrag hostile)
