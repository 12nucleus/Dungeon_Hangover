// ─────────────────────────────────────────────────────────────
// Items, enchantments & the random loot generator — all data-driven.
//   ITEM_BASES  → weapon/armor/trinket/consumable templates by tier
//   ENCHANTS    → prefix modifiers (flaming, frost, keen, ...)
//   generateLoot()   → one random Item
//   rollLootTable()  → per-source drop bundles { items, gold }
// No rendering here — pure data + dice. Add content, not code.
// ─────────────────────────────────────────────────────────────
import type { DamageType, EquipSlot, WeaponKind } from './types';
import { extraSlotsFor } from './improvised';
export type ItemKind = 'weapon' | 'armor' | 'trinket' | 'consumable';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
export type Tier = 1 | 2 | 3;

export interface Item {
  id: string;
  kind: ItemKind;
  slot?: EquipSlot;
  /** extra slots this item can be equipped into (e.g. the bucket: weapon/off-hand/head) */
  altSlots?: EquipSlot[];
  /** two-handed weapon — both hands busy, no off-hand while equipped */
  twoHanded?: boolean;
  name: string;
  icon: string;
  tier: Tier;
  rarity: Rarity;
  weaponKind?: WeaponKind;
  damageDice?: string;      // weapons
  damageType?: DamageType;
  acBonus?: number;         // armor
  enchantId?: string;
  healDice?: string;        // consumables
  condition?: string;       // consumable cures this condition
  value: number;            // gold value
  desc: string;

  // ── floor 50 additions ──
  /** base-template id the item was made from (for flag/hook checks) */
  _baseId?: string;
  /** trinket/armor: flat +max HP */
  hpBonus?: number;
  /** armor: flat physical damage reduction (min 1 after reduction) */
  physResist?: number;
  /** equip requirement (level) — enforced in equipItem */
  levelReq?: number;
  /** tool tag (e.g. 'plumber' — counts as the Plumber class skill) */
  tool?: string;
  /** weapon: destroyed after its first successful hit */
  fragile?: boolean;
  /** weapon: chance (0..1) to shatter on a natural-1 attack roll */
  fumbleBreak?: number;
  /** weapon: chance (0..1) to drop out of the wielder's hands on a natural 1 */
  fumbleDrop?: number;
  /** weapon: chance to apply a condition to the target on a hit */
  onHitCondition?: { id: string; chance: number; rounds: number };
  /** consumable: chance to apply a condition to the drinker */
  consumeCondition?: { id: string; chance: number; rounds: number };
  /** consumable: strips every condition from the drinker */
  cleanses?: boolean;
}

// ── enchantments ─────────────────────────────────────────────
export interface EnchantDef {
  id: string;
  prefix: string;          // "Flaming Fine Longsword +1"
  color: string;           // UI accent
  desc: string;
  elemDice?: string;       // extra elemental damage on hit
  elemType?: DamageType;
  slowChance?: number;     // frost: chance to apply 'slowed' 1 round
  atkBonus?: number;       // keen
  acBonus?: number;        // warding
  hpBonus?: number;        // vital
  moveBonus?: number;      // swift
}

export const ENCHANTS: Record<string, EnchantDef> = {
  flaming: { id: 'flaming', prefix: 'Flaming', color: '#ff7a1f', desc: '+1d4 fire damage on hit', elemDice: '1d4', elemType: 'fire' },
  frost: { id: 'frost', prefix: 'Frost', color: '#7dd3fc', desc: '+1d4 cold damage, 25% slow (1 round)', elemDice: '1d4', elemType: 'cold', slowChance: 0.25 },
  shocking: { id: 'shocking', prefix: 'Shocking', color: '#fde047', desc: '+1d4 force damage on hit', elemDice: '1d4', elemType: 'force' },
  keen: { id: 'keen', prefix: 'Keen', color: '#f8fafc', desc: '+1 to attack rolls', atkBonus: 1 },
  warding: { id: 'warding', prefix: 'Warding', color: '#93c5fd', desc: '+1 AC', acBonus: 1 },
  vital: { id: 'vital', prefix: 'Vital', color: '#4ade80', desc: '+6 max HP', hpBonus: 6 },
  swift: { id: 'swift', prefix: 'Swift', color: '#f0abfc', desc: '+1 movement', moveBonus: 1 },
};
const ENCHANT_IDS = Object.keys(ENCHANTS);

// ── item bases ───────────────────────────────────────────────
interface ItemBase {
  kind: ItemKind; slot?: EquipSlot; altSlots?: EquipSlot[]; twoHanded?: boolean; name: string; icon: string; tier: Tier;
  weaponKind?: WeaponKind; damageDice?: string; damageType?: DamageType;
  acBonus?: number; healDice?: string; value: number; desc: string;
  hpBonus?: number; physResist?: number; levelReq?: number; tool?: string;
  fragile?: boolean; fumbleBreak?: number; fumbleDrop?: number;
  onHitCondition?: { id: string; chance: number; rounds: number };
  consumeCondition?: { id: string; chance: number; rounds: number };
  cleanses?: boolean;
}
const B = (b: ItemBase) => b;

export const ITEM_BASES: Record<string, ItemBase> = {
  // swords (slashing)
  sword1: B({ kind: 'weapon', slot: 'weapon', name: 'Worn Longsword', icon: '🗡️', tier: 1, weaponKind: 'sword', damageDice: '1d8+1', damageType: 'slashing', value: 15, desc: 'A notched but trusty blade.' }),
  sword2: B({ kind: 'weapon', slot: 'weapon', name: 'Fine Longsword', icon: '🗡️', tier: 2, weaponKind: 'sword', damageDice: '1d8+2', damageType: 'slashing', value: 45, desc: 'Balanced steel, keen edge.' }),
  sword3: B({ kind: 'weapon', slot: 'weapon', name: 'Masterwork Longsword', icon: '⚔️', tier: 3, weaponKind: 'sword', damageDice: '2d6+3', damageType: 'slashing', value: 140, desc: "A smith's life's work." }),
  // daggers (piercing)
  dagger1: B({ kind: 'weapon', slot: 'weapon', name: 'Rusty Dagger', icon: '🔪', tier: 1, weaponKind: 'dagger', damageDice: '1d4+1', damageType: 'piercing', value: 8, desc: 'Better than fists.' }),
  dagger2: B({ kind: 'weapon', slot: 'weapon', name: 'Fine Dagger', icon: '🔪', tier: 2, weaponKind: 'dagger', damageDice: '1d4+2', damageType: 'piercing', value: 30, desc: 'Slim and silent.' }),
  dagger3: B({ kind: 'weapon', slot: 'weapon', name: 'Masterwork Dagger', icon: '🔪', tier: 3, weaponKind: 'dagger', damageDice: '2d4+2', damageType: 'piercing', value: 95, desc: 'A duellist\'s dream.' }),
  // bows (piercing) — dedicated ranged slot, usable in and out of combat
  bow1: B({ kind: 'weapon', slot: 'ranged', name: 'Bent Shortbow', icon: '🏹', tier: 1, weaponKind: 'bow', damageDice: '1d6+1', damageType: 'piercing', value: 14, twoHanded: true, desc: 'Creaks, but shoots true-ish. Equip in Ranged slot (8 tiles).' }),
  bow2: B({ kind: 'weapon', slot: 'ranged', name: 'Fine Shortbow', icon: '🏹', tier: 2, weaponKind: 'bow', damageDice: '1d6+2', damageType: 'piercing', value: 42, twoHanded: true, desc: 'Yew laminate, smooth draw. Ranged 8.' }),
  bow3: B({ kind: 'weapon', slot: 'ranged', name: 'Masterwork Shortbow', icon: '🏹', tier: 3, weaponKind: 'bow', damageDice: '2d6+2', damageType: 'piercing', value: 130, twoHanded: true, desc: 'Elven craftsmanship. Ranged 10.' }),
  // maces (bludgeoning)
  mace1: B({ kind: 'weapon', name: 'Cracked Mace', icon: '🔨', tier: 1, weaponKind: 'mace', damageDice: '1d6+1', damageType: 'bludgeoning', value: 12, desc: 'Dents armor. And skulls.' }),
  mace2: B({ kind: 'weapon', name: 'Fine Mace', icon: '🔨', tier: 2, weaponKind: 'mace', damageDice: '1d6+2', damageType: 'bludgeoning', value: 38, desc: 'Blessed by the forge-temple.' }),
  mace3: B({ kind: 'weapon', name: 'Masterwork Mace', icon: '🔨', tier: 3, weaponKind: 'mace', damageDice: '2d6+3', damageType: 'bludgeoning', value: 125, desc: 'Dwarven justice.' }),
  // clubs (bludgeoning)
  club1: B({ kind: 'weapon', name: 'Gnarled Club', icon: '🪵', tier: 1, weaponKind: 'club', damageDice: '1d6', damageType: 'bludgeoning', value: 5, desc: 'A very persuasive branch.' }),
  club2: B({ kind: 'weapon', name: 'Spiked Club', icon: '🪵', tier: 2, weaponKind: 'club', damageDice: '1d6+2', damageType: 'bludgeoning', value: 28, desc: 'Nails add credibility.' }),
  club3: B({ kind: 'weapon', name: 'Ogre Greatclub', icon: '🪵', tier: 3, weaponKind: 'club', damageDice: '2d6+2', damageType: 'bludgeoning', value: 100, desc: 'Ripped from an ogre\'s fist.' }),
  // staves (bludgeoning)
  staff1: B({ kind: 'weapon', name: 'Gnarled Staff', icon: '🪄', tier: 1, weaponKind: 'staff', damageDice: '1d6', damageType: 'bludgeoning', value: 10, desc: 'Humms faintly with power.' }),
  staff2: B({ kind: 'weapon', name: 'Runed Staff', icon: '🪄', tier: 2, weaponKind: 'staff', damageDice: '1d6+2', damageType: 'bludgeoning', value: 36, desc: 'Runes crawl along its length.' }),
  staff3: B({ kind: 'weapon', name: 'Archmage Staff', icon: '🪄', tier: 3, weaponKind: 'staff', damageDice: '2d6+2', damageType: 'bludgeoning', value: 120, desc: 'It remembers older spells.' }),
  // torch — utility weapon, deals minimal damage but emits light
  torch1: B({ kind: 'weapon', name: 'Lit Torch', icon: '🔥', tier: 1, weaponKind: 'torch', damageDice: '1d4', damageType: 'bludgeoning', value: 3, desc: 'Pierces the dark of the Underdrek. Burns dimly.' }),
  // armor
  padded: B({ kind: 'armor', name: 'Padded Garb', icon: '🥋', tier: 1, acBonus: 0, value: 5, desc: 'Quilted comfort. Mostly comfort.' }),
  leather: B({ kind: 'armor', name: 'Leather Armor', icon: '🦺', tier: 1, acBonus: 1, value: 20, desc: '+1 AC. Boiled and sturdy.' }),
  chain: B({ kind: 'armor', name: 'Chain Mail', icon: '⛓️', tier: 2, acBonus: 2, value: 60, desc: '+2 AC. Rings of protection.' }),
  plate: B({ kind: 'armor', name: 'Plate Armor', icon: '🛡️', tier: 3, acBonus: 3, value: 180, desc: '+3 AC. A walking fortress.' }),
  // trinkets
  ring: B({ kind: 'trinket', name: 'Lucky Ring', icon: '💍', tier: 1, value: 25, desc: 'It glints at the right moments.' }),
  amulet: B({ kind: 'trinket', name: 'Amulet of Warding', icon: '📿', tier: 2, value: 55, desc: 'Warm against the skin.' }),
  cloak: B({ kind: 'trinket', name: 'Traveler\'s Cloak', icon: '🧥', tier: 1, value: 18, desc: 'Smells of rain and roads.' }),
  // consumables
  potion: B({ kind: 'consumable', name: 'Potion of Healing', icon: '🧪', tier: 1, healDice: '2d4+2', value: 20, desc: 'Restores 2d4+2 HP. Bonus action.' }),
  potion_greater: B({ kind: 'consumable', name: 'Greater Potion of Healing', icon: '⚗️', tier: 2, healDice: '4d4+4', value: 60, desc: 'Restores 4d4+4 HP. Bonus action.' }),
  // ── quest keys (trinkets, no combat effect) ──
  iron_key: B({ kind: 'trinket', name: 'Iron Key', icon: '🗝️', tier: 1, value: 0, desc: 'A heavy, cold key. It fits a great iron door.' }),
  golden_key: B({ kind: 'trinket', name: 'Golden Key', icon: '🔑', tier: 3, value: 0, desc: 'Ornate and warm to the touch. It hums with promise.' }),
  // ── the boss reward (special epic loot) ──
  warlord_blade: B({ kind: 'weapon', name: "Warlord's Cleaver", icon: '⚔️', tier: 3, weaponKind: 'sword', damageDice: '2d8+4', damageType: 'slashing', value: 320, twoHanded: true, desc: 'A brutal greatblade taken from a bathing tyrant. Still faintly soapy.' }),
  severed_finger: B({ kind: 'trinket', name: "The Hermit's Severed Finger", icon: '\uD83D\uDD90\uFE0F', tier: 1, value: 0, desc: 'A gnawed-off ring finger, still wearing a tarnished silver band. The ring is engraved: Agnes. Someone is missing this. Someone is MISSING.' }),
  toeless_boots: B({ kind: 'armor', slot: 'boots', name: "Toeless Boots", icon: '\uD83D\uDC62', tier: 2, acBonus: 1, value: 50, desc: "Fine leather boots. Missing the toes. Don't ask. +1 AC. +1 movement." }),

  // ── floor 50 — the sewer cellar ──
  // improvised weapons
  broken_bottle: B({ kind: 'weapon', slot: 'weapon', name: 'Broken Bottle', icon: '🍾', tier: 1, weaponKind: 'dagger', damageDice: '1d4', damageType: 'slashing', value: 1, fragile: true, onHitCondition: { id: 'bleeding', chance: 1, rounds: 2 }, desc: 'A jagged bottle edge. One good swing and it\'s gone.' }),
  rat_bone: B({ kind: 'weapon', slot: 'weapon', name: 'Rat Bone', icon: '🦴', tier: 1, weaponKind: 'club', damageDice: '1d4', damageType: 'bludgeoning', value: 2, desc: 'A gnawed femur. Surprisingly sturdy. The rat it came from had opinions. The rat is gone. The opinions remain.' }),
  rusty_sword: B({ kind: 'weapon', slot: 'weapon', name: 'Rusty Sword', icon: '🗡️', tier: 1, weaponKind: 'sword', damageDice: '1d6+1', damageType: 'slashing', value: 18, fumbleBreak: 0.1, desc: 'A blade that has seen better centuries. 10% chance to snap on a fumble.' }),
  rusty_axe: B({ kind: 'weapon', slot: 'weapon', name: 'Rusty Axe', icon: '🪓', tier: 1, weaponKind: 'sword', damageDice: '1d8', damageType: 'slashing', value: 22, twoHanded: true, desc: 'Mostly rust, technically an axe. Two hands, one swing, zero regrets.' }),
  rusty_mace: B({ kind: 'weapon', slot: 'weapon', name: 'Rusty Mace', icon: '🔨', tier: 1, weaponKind: 'mace', damageDice: '1d6+1', damageType: 'bludgeoning', value: 20, onHitCondition: { id: 'stunned', chance: 0.1, rounds: 1 }, desc: 'Dents armor. 10% chance to rattle the target\'s brain.' }),
  rusty_spear: B({ kind: 'weapon', slot: 'weapon', name: 'Rusty Spear', icon: '🔱', tier: 1, weaponKind: 'staff', damageDice: '1d6', damageType: 'piercing', value: 16, twoHanded: true, desc: 'Pointy end, rusted end, middle is a mystery. Takes both hands.' }),
  goblin_spear: B({ kind: 'weapon', slot: 'weapon', name: 'Goblin Spear', icon: '🔱', tier: 1, weaponKind: 'staff', damageDice: '1d6', damageType: 'piercing', value: 14, twoHanded: true, desc: 'Crude, sharp, and smug about it. Two hands.' }),
  wrench: B({ kind: 'weapon', slot: 'weapon', name: 'Wrench', icon: '🔧', tier: 1, weaponKind: 'mace', damageDice: '1d4+1', damageType: 'bludgeoning', value: 12, tool: 'plumber', desc: 'Heavy, greasy, and it opens pipes AND skulls. Counts as a Plumber\'s tool.' }),
  plunger: B({ kind: 'weapon', slot: 'weapon', name: 'Plunger', icon: '🪠', tier: 1, weaponKind: 'club', damageDice: '1d4', damageType: 'bludgeoning', value: 6, onHitCondition: { id: 'stunned', chance: 0.25, rounds: 1 }, desc: 'The most feared weapon in any sewer. 25% chance to stun.' }),
  drowned_majesty: B({ kind: 'weapon', slot: 'weapon', name: "The Drowned Majesty", icon: '🛁', tier: 3, weaponKind: 'club', damageDice: '1d10+1', damageType: 'bludgeoning', value: 320, levelReq: 3, onHitCondition: { id: 'slippery', chance: 0.15, rounds: 2 }, fumbleDrop: 0.05, desc: "Gribnab's soap-crusted club. It smells like strawberries and tyranny. 15% slippery on hit, and it WILL slide out of your hands on a fumble. The club is judging you." }),
  towel: B({ kind: 'weapon', slot: 'weapon', name: 'Towel', icon: '🧻', tier: 1, weaponKind: 'club', damageDice: '1d2', damageType: 'bludgeoning', value: 3, onHitCondition: { id: 'blinded', chance: 0.5, rounds: 1 }, desc: 'A towel from Gribnab\'s rack. Whip-crack! 50% chance to blind. It smells like royalty and damp.' }),
  rope: B({ kind: 'weapon', slot: 'weapon', name: 'Rope', icon: '🪢', tier: 1, weaponKind: 'club', damageDice: '1d4', damageType: 'bludgeoning', value: 4, desc: 'A length of old well-rope. Good for climbing, acceptable for hitting.' }),
  wooden_bucket: B({ kind: 'weapon', slot: 'weapon', altSlots: ['offHand', 'head'], name: 'Wooden Bucket', icon: '🪣', tier: 1, weaponKind: 'club', damageDice: '1d4', damageType: 'bludgeoning', value: 3, desc: 'A bucket. As a weapon it is a statement — a wet, denting, deeply confusing statement. Swing it, throw it, or wear it. The narrator has SO many comments.' }),
  goblin_banner: B({ kind: 'armor', slot: 'cloak', name: 'Goblin Banner', icon: '🚩', tier: 1, acBonus: 1, value: 12, desc: 'Torn from the throne-room wall, worn as a cape. +1 AC. It smells like a parade.' }),
  // armor
  tattered_cloak: B({ kind: 'armor', slot: 'cloak', name: 'Tattered Cloak', icon: '🧥', tier: 1, acBonus: 1, value: 15, desc: '+1 AC. The Hermit\'s gift. It has seen better days and worse centuries.' }),
  sturdy_boots: B({ kind: 'armor', slot: 'boots', name: 'Sturdy Boots', icon: '👢', tier: 1, acBonus: 1, value: 12, desc: '+1 AC. Physical damage taken −1. The Hermit insists they\'re lucky.' }),
  leather_boot: B({ kind: 'armor', slot: 'boots', name: 'Leather Boot', icon: '🥾', tier: 1, acBonus: 1, value: 10, desc: '+1 AC. Found on a floating body. The body didn\'t mind.' }),
  leather_vest: B({ kind: 'armor', name: 'Leather Vest', icon: '🦺', tier: 1, acBonus: 1, value: 18, desc: '+1 AC. Boiled leather, goblin-grade stitching.' }),
  chain_shirt: B({ kind: 'armor', name: 'Chain Shirt', icon: '⛓️', tier: 2, acBonus: 2, value: 55, desc: '+2 AC. Rings of questionable provenance.' }),
  guards_cap: B({ kind: 'armor', slot: 'head', name: "Guard's Cap", icon: '🎖️', tier: 1, acBonus: 1, value: 8, desc: '+1 AC. Smells faintly of the guard who lost it. Probably Scrag\'s.' }),
  pipe_helmet: B({ kind: 'armor', slot: 'head', name: 'Pipe-Fitting Helmet', icon: '🪖', tier: 1, acBonus: 0, physResist: 1, value: 9, desc: 'Physical damage taken −1. Waterproof, too. Probably.' }),
  ribcage_armor: B({ kind: 'armor', slot: 'chest', name: 'Ribcage Armor', icon: '🩻', tier: 1, acBonus: 0, physResist: 1, value: 14, desc: 'Physical damage taken −1. Worn by someone who no longer needs it.' }),
  leather_bracers: B({ kind: 'armor', slot: 'arms', name: 'Leather Bracers', icon: '💪', tier: 1, acBonus: 1, value: 9, desc: '+1 AC. Stiffened leather vambraces. Snug as a hug with knuckles.' }),
  rusty_bracers: B({ kind: 'armor', slot: 'arms', name: 'Rusty Bracers', icon: '🥁', tier: 1, acBonus: 0, physResist: 1, value: 6, desc: 'Physical damage taken −1. Hammered iron. They clang when you clap.' }),
  wooden_shield: B({ kind: 'armor', slot: 'offHand', name: 'Wooden Shield', icon: '🛡️', tier: 1, acBonus: 1, value: 11, desc: '+1 AC. Splintered but loyal. Held in the off hand.' }),
  soap_crown: B({ kind: 'armor', slot: 'head', name: 'Soap Crown', icon: '👑', tier: 2, acBonus: 1, levelReq: 2, value: 60, desc: '+1 AC. Goblins respect you. Equipping it earns the throne\'s respect — and everyone smells strawberries. Dignity sold separately.' }),
  // trinkets
  hermits_ring: B({ kind: 'trinket', slot: 'ring', name: "Hermit's Ring", icon: '💍', tier: 2, value: 40, desc: '+5% XP. Warm against the finger. Which finger is a question you stop asking. You stop asking a lot of things down here.' }),
  leather_belt: B({ kind: 'trinket', slot: 'belt', name: 'Leather Belt', icon: '🧷', tier: 1, hpBonus: 2, value: 10, desc: '+2 max HP. Holds your pants up, emotionally speaking.' }),
  blessed_penny: B({ kind: 'trinket', slot: 'trinket', name: 'Blessed Penny', icon: '🪙', tier: 2, value: 25, desc: '+5% gold found. It has a tiny saint on it. The saint looks hungover too. Saints are not immune to the Spire.' }),
  rat_whisker: B({ kind: 'trinket', slot: 'trinket', name: 'Rat Whisker', icon: '🐭', tier: 1, acBonus: 1, value: 6, desc: '+1 AC. The whisker of a very large, very unlucky rat. Worn as a charm.' }),
  lockpick: B({ kind: 'trinket', name: 'Lockpick', icon: '🪛', tier: 1, value: 15, desc: 'Opens locked chests and doors. The dungeon calls it cheating. The dungeon is a hypocrite with very nice locks.' }),
  water_flask: B({ kind: 'trinket', name: 'Water Flask', icon: '🧴', tier: 1, value: 2, desc: 'Clean-ish water from the pipe junction. Pour it into the fountain at the intersection.' }),
  goblin_soap: B({ kind: 'trinket', name: "Goblin King's Soap", icon: '🧼', tier: 1, value: 5, desc: 'Pink. It smells like strawberries and poor life choices. Scrag will lose his mind for this.' }),
  premium_soap: B({ kind: 'trinket', name: 'Premium Soap', icon: '🧼', tier: 2, value: 25, desc: 'Unscented, triple-milled, vault-fresh. Scrag has never seen such luxury. Scrag may weep. Let him weep.' }),
  soap_chunk: B({ kind: 'trinket', name: 'Soap Chunk', icon: '🧼', tier: 1, value: 2, desc: 'A partial bar of soap. Not enough for the guard. Or maybe it is. The guard is not taking questions.' }),
  rusty_key: B({ kind: 'trinket', name: 'Rusty Key', icon: '🗝️', tier: 1, value: 0, desc: 'A rusted key. It opens things. Probably. It was in the boss rat. Think about that.' }),
  love_letter: B({ kind: 'trinket', name: 'Love Letter', icon: '💌', tier: 1, value: 0, desc: 'Addressed to Scrag. From someone named Bliss. It is VERY graphic. You put it back.' }),
  waterlogged_book: B({ kind: 'trinket', name: 'Waterlogged Book', icon: '📖', tier: 1, value: 0, desc: 'The ink has mostly run. What survives is a recipe for stew and a poem about a duck. The poem is better than the stew.' }),
  // consumables
  moldy_cheese: B({ kind: 'consumable', name: 'Moldy Cheese', icon: '🧀', tier: 1, healDice: '15', value: 8, consumeCondition: { id: 'nauseated', chance: 0.5, rounds: 3 }, desc: 'Heals 15 HP. 50% chance of Nauseated. The mold adds flavor. The mold adds CHARACTER.' }),
  glowing_mushroom: B({ kind: 'consumable', name: 'Glowing Mushroom', icon: '🍄', tier: 1, healDice: '5', value: 4, desc: 'Heals 5 HP. Also faintly luminous. Do not ask what it is glowing with. You will not like the answer.' }),
  poison_mushroom: B({ kind: 'consumable', name: 'Poison Mushroom', icon: '🍄‍🟫', tier: 1, healDice: '0', value: 1, consumeCondition: { id: 'poisoned', chance: 1, rounds: 3 }, desc: 'The OTHER mushroom. Poisoned for 3 rounds. Weaponizing it is a problem for another Greg.' }),
  wine_bottle: B({ kind: 'consumable', name: 'Ancient Wine', icon: '🍷', tier: 1, healDice: '10', value: 6, consumeCondition: { id: 'poisoned', chance: 0.25, rounds: 2 }, desc: 'Heals 10 HP. It\'s basically vinegar. 25% of the bottles are poisoned. Gambler\'s choice.' }),
  holy_water: B({ kind: 'consumable', name: 'Holy Water', icon: '⛲', tier: 2, healDice: '0', value: 30, cleanses: true, desc: 'Removes every condition, including the Cursed Gold\'s curse. The saint on the flask looks smug. Saints are like that.' }),
  dwarven_ale: B({ kind: 'consumable', name: 'Dwarven Ale', icon: '🍺', tier: 2, healDice: '0', value: 20, desc: '+4 damage, −2 attack for 1 round. The dwarves swear by it. The dwarves are also wrong a lot.' }),
  ghost_soup: B({ kind: 'consumable', name: 'Ghost Soup', icon: '🍲', tier: 2, healDice: '99', value: 40, desc: 'Full heal + Well Fed (99 rounds). It is warm. It should not be warm. It is not yours. Drink it anyway.' }),
  sewer_water_flask: B({ kind: 'consumable', name: 'Sewer Water', icon: '🧪', tier: 1, healDice: '5', value: 1, consumeCondition: { id: 'nauseated', chance: 0.5, rounds: 3 }, desc: '50% heal 5 HP, 50% Nauseated. The sewer plays fair.' }),
  bubble_bath: B({ kind: 'consumable', name: 'Bubble Bath', icon: '🫧', tier: 2, healDice: '0', value: 15, desc: 'Pour it at your feet: Slippery for 2 rounds. Gribnab would be proud. Gribnab is proud of everything. It is exhausting.' }),
  rubber_duck: B({ kind: 'consumable', name: 'Rubber Duck', icon: '🦆', tier: 1, healDice: '0', value: 3, desc: 'Squeeze it. All enemies become Distracted for 1 round. It works every time. Nobody knows why. The duck is not talking.' }),
  // ── floor 49 — fungal grotto ──
  mushroom_staff: B({ kind: 'weapon', slot: 'weapon', name: 'Mushroom Staff', icon: '🍄', tier: 1, weaponKind: 'staff', damageDice: '1d6', damageType: 'bludgeoning', value: 22, onHitCondition: { id: 'nauseated', chance: 0.15, rounds: 2 }, desc: 'A staff grown, not carved. It whispers spore recipes at you. 15% Nauseated on hit.' }),
  spore_dagger: B({ kind: 'weapon', slot: 'weapon', name: 'Spore Dagger', icon: '🗡️', tier: 1, weaponKind: 'dagger', damageDice: '1d4+1', damageType: 'piercing', value: 26, onHitCondition: { id: 'poisoned', chance: 0.25, rounds: 2 }, desc: 'The blade is covered in fine purple dust. Do not lick it. 25% Poisoned on hit.' }),
  vine_whip: B({ kind: 'weapon', slot: 'weapon', name: 'Vine Whip', icon: '🌿', tier: 1, weaponKind: 'dagger', damageDice: '1d4', damageType: 'piercing', value: 18, onHitCondition: { id: 'rooted', chance: 0.1, rounds: 1 }, desc: 'A living lash. It grabs things. 10% Rooted (Bound) on hit.' }),
  fungal_blade: B({ kind: 'weapon', slot: 'weapon', name: 'Fungal Blade', icon: '⚔️', tier: 2, weaponKind: 'sword', damageDice: '1d8', damageType: 'slashing', value: 55, levelReq: 2, onHitCondition: { id: 'poisoned', chance: 0.25, rounds: 2 }, desc: 'A sword that grew around a sword. It blooms where it cuts. 25% Poisoned on hit.' }),
  mycelial_staff: B({ kind: 'weapon', slot: 'weapon', name: 'Mycelial Staff', icon: '🪄', tier: 2, weaponKind: 'staff', damageDice: '1d8+1', damageType: 'bludgeoning', value: 95, levelReq: 3, onHitCondition: { id: 'hallucinating', chance: 0.2, rounds: 1 }, desc: 'Pulsing with the Spire\'s dreams. 20% Hallucinating on hit. The dreams are not your dreams.' }),
  spore_crown: B({ kind: 'armor', slot: 'head', name: 'Spore Crown', icon: '👑', tier: 2, acBonus: 1, hpBonus: 4, value: 70, levelReq: 3, desc: 'A crown of living fungi. It hums. +1 AC, +4 HP. Smells like earth and ambition.' }),
  mushroom_cap: B({ kind: 'armor', slot: 'head', name: 'Mushroom Cap', icon: '🍄', tier: 1, acBonus: 1, value: 12, desc: 'A wide, friendly mushroom cap worn as a hat. +1 AC. Keeps the rain (and the spores) off.' }),
  vine_cloak: B({ kind: 'armor', slot: 'chest', name: 'Vine Cloak', icon: '🧥', tier: 1, acBonus: 1, value: 20, desc: 'A cloak of woven vines. It rustles when you move. +1 AC.' }),
  frog_skin_cloak: B({ kind: 'armor', slot: 'chest', name: 'Frog Skin Cloak', icon: '🧥', tier: 1, acBonus: 1, hpBonus: 2, value: 24, desc: 'Slippery and green. It came off a very large, very surprised frog. +1 AC, +2 HP.' }),
  waterlogged_boots: B({ kind: 'armor', slot: 'boots', name: 'Waterlogged Boots', icon: '👢', tier: 1, acBonus: 1, value: 16, desc: 'Heavy, wet, and full of tiny fish. They do not mind. +1 AC.' }),
  moon_cap: B({ kind: 'consumable', name: 'Moon Cap', icon: '🌙', tier: 2, healDice: '20', value: 30, desc: 'A mushroom that only grows in moonlight it has never seen. Heals 20 HP.' }),
  spore_heart: B({ kind: 'consumable', name: 'Spore Heart', icon: '❤️‍🩹', tier: 3, healDice: '999', value: 120, desc: 'The heart of the Spore Mother. It still beats. Eating it heals you fully. It is the only way.' }),
  hallucinogenic_spore: B({ kind: 'consumable', name: 'Hallucinogenic Spore', icon: '🫧', tier: 1, healDice: '0', consumeCondition: { id: 'hallucinating', chance: 1, rounds: 2 }, value: 10, desc: 'A puff of purple dust. The walls become very honest with you for 2 turns.' }),
  cave_fish_meat: B({ kind: 'consumable', name: 'Cave Fish Meat', icon: '🐟', tier: 1, healDice: '10', value: 9, consumeCondition: { id: 'nauseated', chance: 0.25, rounds: 2 }, desc: 'Heals 10 HP. 25% Nauseated. It tasted like it was already upset.' }),
  crystal_shard: B({ kind: 'trinket', name: 'Crystal Shard', icon: '💎', tier: 1, value: 12, desc: 'A warm shard of grotto crystal. It glows when it is quiet. Crafting material.' }),
  glowing_spore: B({ kind: 'trinket', name: 'Glowing Spore', icon: '✨', tier: 1, value: 4, desc: 'A mote of bioluminescence in a glass vial. Crafting material.' }),
  // ── floor 49 expansion: quest items + vendor / crafting bits ──
  mycologist_satchel: B({ kind: 'trinket', slot: 'trinket', name: "Mycologist's Satchel", icon: '🎒', tier: 2, hpBonus: 1, value: 45, desc: '+1 max HP, and POCKETS. So many pockets. The Hermit Shroom says it is for science. It is mostly for mushrooms.' }),
  vine_fiber: B({ kind: 'trinket', name: 'Vine Fiber', icon: '🧶', tier: 1, value: 6, desc: 'A strand of vine that still twitches when you hold it. The vine remembers being alive. Crafting material.' }),
  frog_tongue: B({ kind: 'trinket', name: 'Giant Frog Tongue', icon: '👅', tier: 1, value: 18, desc: 'A surprisingly long tongue. It is still warm. The frog is not. Myke the Spore Merchant will pay handsomely for this.' }),
  seventh_cap: B({ kind: 'trinket', name: 'The Seventh Cap', icon: '🍄', tier: 2, value: 45, desc: 'A mushroom cap of impossible colour — every colour at once, depending on how you squint. The circle is missing its seventh member. It wants to go home.' }),
  giant_cap: B({ kind: 'consumable', name: "Giant's Cap", icon: '🌕', tier: 2, healDice: '30', value: 45, desc: 'The cap of the Sleeping Giant. It dreams of the surface, of wind, of things that are not caves. Heals 30 HP.' }),
};

let iid = 0;
/** instantiate a base template, optionally enchanted */
export function makeItem(baseId: string, enchantId?: string, rarity?: Rarity): Item {
  const b = ITEM_BASES[baseId];
  const r: Rarity = rarity ?? (enchantId ? 'uncommon' : 'common');
  const en = enchantId ? ENCHANTS[enchantId] : undefined;
  const name = en ? `${en.prefix} ${b.name} +${b.tier}` : b.name;
  const value = b.value + (en ? 20 * b.tier : 0);
  return {
    id: `it${iid++}`, kind: b.kind, slot: b.slot, altSlots: b.altSlots ?? extraSlotsFor(baseId, b.slot), twoHanded: b.twoHanded, name, icon: b.icon, tier: b.tier, rarity: r,
    weaponKind: b.weaponKind, damageDice: b.damageDice, damageType: b.damageType,
    acBonus: b.acBonus, healDice: b.healDice, enchantId, value, desc: b.desc,
    _baseId: baseId,
    hpBonus: b.hpBonus, physResist: b.physResist, levelReq: b.levelReq, tool: b.tool,
    fragile: b.fragile, fumbleBreak: b.fumbleBreak, fumbleDrop: b.fumbleDrop,
    onHitCondition: b.onHitCondition, consumeCondition: b.consumeCondition, cleanses: b.cleanses,
  };
}

// ── random generator ─────────────────────────────────────────
const RARITY_WEIGHTS: [Rarity, number][] = [['common', 55], ['uncommon', 28], ['rare', 13], ['epic', 4]];
const ENCHANT_CHANCE: Record<Rarity, number> = { common: 0, uncommon: 0.35, rare: 0.7, epic: 1 };

function pickWeighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((a, p) => a + p[1], 0);
  let r = Math.random() * total;
  for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
  return pairs[0][0];
}

/**
 * Cursed (floor 50 vault gold): loot rarity is downgraded one step while
 * the party leader carries the `cursed` condition. The engine flips this
 * flag from the condition; generateLoot/rollLootTable read it. Module-level
 * because loot is rolled deep inside combat.ts with no engine handle.
 */
let cursedLoot = false;
export function setCursedLoot(v: boolean) { cursedLoot = v; }
export function isCursedLoot(): boolean { return cursedLoot; }

/** rarity one step down (common stays common) */
const DOWN: Record<Rarity, Rarity> = { common: 'common', uncommon: 'common', rare: 'uncommon', epic: 'rare' };

const RARITY_ORDER: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };

export function generateLoot(opts?: { minTier?: Tier; maxTier?: Tier; rarityBoost?: number; kind?: ItemKind }): Item {
  const minT = opts?.minTier ?? 1, maxT = opts?.maxTier ?? 2;
  // rarity (boost shifts weight away from common)
  const boost = opts?.rarityBoost ?? 0;
  let rarity = pickWeighted(RARITY_WEIGHTS.map(([r, w], i) => [r, w * (1 + boost * i)] as [Rarity, number]));
  if (cursedLoot && RARITY_ORDER[rarity] > 0) rarity = DOWN[rarity];
  // kind
  const kind = opts?.kind ?? pickWeighted<ItemKind>([['weapon', 35], ['armor', 25], ['trinket', 15], ['consumable', 25]]);
  // base: match kind & tier band
  const tier = (minT + Math.floor(Math.random() * (maxT - minT + 1))) as Tier;
  let cands = Object.entries(ITEM_BASES).filter(([, b]) => b.kind === kind && b.tier >= minT && b.tier <= maxT);
  if (!cands.length) cands = Object.entries(ITEM_BASES).filter(([, b]) => b.kind === kind);
  // prefer exact tier, else nearest in band
  const exact = cands.filter(([, b]) => b.tier === tier);
  const [baseId] = (exact.length ? exact : cands)[Math.floor(Math.random() * (exact.length ? exact.length : cands.length))];
  // enchant (weapons/armor/trinkets only, never consumables)
  let enchantId: string | undefined;
  if (kind !== 'consumable' && Math.random() < ENCHANT_CHANCE[rarity]) {
    // weapons: any enchant; armor/trinkets: only defensive/utility ones
    const pool = kind === 'weapon' ? ENCHANT_IDS : ENCHANT_IDS.filter((e) => !ENCHANTS[e].elemDice && !ENCHANTS[e].atkBonus);
    enchantId = pool[Math.floor(Math.random() * pool.length)];
  }
  return makeItem(baseId, enchantId, rarity);
}

// ── per-source loot tables ───────────────────────────────────
export type LootSource = 'crate' | 'barrel' | 'vase' | 'chest' | 'boss' | 'goblin' | 'goldenkey' | 'secret' | 'beast' | 'undead' | 'starting' | 'floor49_supply';

export function rollLootTable(source: LootSource): { items: Item[]; gold: number; lootRoll?: number } {
  const items: Item[] = [];
  let gold = 0;
  // Treasure chests use one visible quality roll; ordinary enemy/prop drops
  // stay quiet so the full-screen die remains a rare event.
  const lootRoll = source === 'chest' || source === 'secret' || source === 'goldenkey'
    ? 1 + Math.floor(Math.random() * 20)
    : undefined;
  const g = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  switch (source) {
    case 'crate':
      if (Math.random() < 0.55) items.push(generateLoot({ minTier: 1, maxTier: 1, kind: Math.random() < 0.5 ? 'consumable' : undefined }));
      if (Math.random() < 0.6) gold = g(5, 12);
      break;
    case 'barrel':
      if (Math.random() < 0.45) items.push(generateLoot({ minTier: 1, maxTier: 1, kind: 'consumable' }));
      if (Math.random() < 0.5) gold = g(3, 8);
      break;
    case 'vase':
      if (Math.random() < 0.5) items.push(generateLoot({ minTier: 1, maxTier: 2 }));
      if (Math.random() < 0.55) gold = g(6, 15);
      break;
    case 'chest':
      items.push(generateLoot({ minTier: 1, maxTier: (lootRoll ?? 10) >= 12 ? 2 : 1, rarityBoost: (lootRoll ?? 10) >= 16 ? 1.8 : 1.2 }));
      if (Math.random() < 0.5) items.push(generateLoot({ minTier: 1, maxTier: 2 }));
      if (Math.random() < 0.25) items.push(makeItem('wine_bottle'));
      if (Math.random() < 0.15) items.push(makeItem('holy_water'));
      gold = g(15, 30);
      break;
    case 'goblin':
      if (Math.random() < 0.3) items.push(generateLoot({ minTier: 1, maxTier: 1 }));
      if (Math.random() < 0.2) items.push(makeItem('goblin_spear'));
      if (Math.random() < 0.4) gold = g(2, 6);
      break;
    case 'boss':
      items.push(generateLoot({ minTier: 2, maxTier: 3, rarityBoost: 2 }));
      if (Math.random() < 0.6) items.push(generateLoot({ minTier: 1, maxTier: 2, rarityBoost: 0.8 }));
      gold = g(40, 80);
      break;
    case 'beast':
      if (Math.random() < 0.2) items.push(generateLoot({ minTier: 1, maxTier: 1, kind: 'consumable' }));
      if (Math.random() < 0.1) items.push(makeItem('rat_whisker'));
      if (Math.random() < 0.15) items.push(makeItem('moldy_cheese'));
      if (Math.random() < 0.35) gold = g(1, 5);
      break;
    case 'undead':
      if (Math.random() < 0.3) items.push(generateLoot({ minTier: 1, maxTier: 2 }));
      if (Math.random() < 0.5) gold = g(4, 12);
      break;
    case 'secret':
      // The quality roll determines whether the top tier is available.
      items.push(generateLoot({ minTier: 2, maxTier: (lootRoll ?? 10) >= 13 ? 3 : 2, rarityBoost: (lootRoll ?? 10) >= 16 ? 2.2 : 1.6 }));
      if (Math.random() < 0.7) items.push(generateLoot({ minTier: 1, maxTier: 2, kind: 'consumable' }));
      gold = g(30, 60);
      break;
    case 'goldenkey':
      // The signature reward is fixed; the quality roll controls the bonus item.
      items.push(makeItem('warlord_blade', 'flaming', 'epic'));
      items.push(generateLoot({ minTier: 2, maxTier: (lootRoll ?? 10) >= 12 ? 3 : 2, rarityBoost: (lootRoll ?? 10) >= 16 ? 3 : 2.5 }));
      items.push(makeItem('potion_greater'));
      gold = g(120, 200);
      break;
    case 'starting':
      // Greg's starter satchel: fixed drop, always the same kit.
      items.push(makeItem('dagger1'));
      items.push(makeItem('torch1'));
      items.push(makeItem('potion'));
      gold = 0;
      break;
    case 'floor49_supply':
      // Floor 49 entry supply bag: exactly 3 healing potions (user request)
      items.push(makeItem('potion'));
      items.push(makeItem('potion'));
      items.push(makeItem('potion'));
      gold = 0;
      break;
  }
  return { items, gold, lootRoll };
}
