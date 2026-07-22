// ─────────────────────────────────────────────────────────────
// Items, enchantments & the random loot generator — all data-driven.
//   ITEM_BASES  → weapon/armor/trinket/consumable templates by tier
//   ENCHANTS    → prefix modifiers (flaming, frost, keen, ...)
//   generateLoot()   → one random Item
//   rollLootTable()  → per-source drop bundles { items, gold }
// No rendering here — pure data + dice. Add content, not code.
// ─────────────────────────────────────────────────────────────
import type { DamageType, EquipSlot, WeaponKind } from './types';

export type ItemKind = 'weapon' | 'armor' | 'trinket' | 'consumable';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
export type Tier = 1 | 2 | 3;

export interface Item {
  id: string;
  kind: ItemKind;
  slot?: EquipSlot;
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
  kind: ItemKind; slot?: EquipSlot; name: string; icon: string; tier: Tier;
  weaponKind?: WeaponKind; damageDice?: string; damageType?: DamageType;
  acBonus?: number; healDice?: string; value: number; desc: string;
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
  // bows (piercing)
  bow1: B({ kind: 'weapon', slot: 'weapon', name: 'Bent Shortbow', icon: '🏹', tier: 1, weaponKind: 'bow', damageDice: '1d6+1', damageType: 'piercing', value: 14, desc: 'Creaks, but shoots true-ish.' }),
  bow2: B({ kind: 'weapon', slot: 'weapon', name: 'Fine Shortbow', icon: '🏹', tier: 2, weaponKind: 'bow', damageDice: '1d6+2', damageType: 'piercing', value: 42, desc: 'Yew laminate, smooth draw.' }),
  bow3: B({ kind: 'weapon', slot: 'weapon', name: 'Masterwork Shortbow', icon: '🏹', tier: 3, weaponKind: 'bow', damageDice: '2d6+2', damageType: 'piercing', value: 130, desc: 'Elven craftsmanship.' }),
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
  warlord_blade: B({ kind: 'weapon', name: "Warlord's Cleaver", icon: '⚔️', tier: 3, weaponKind: 'sword', damageDice: '2d8+4', damageType: 'slashing', value: 320, desc: 'A brutal greatblade taken from a bathing tyrant. Still faintly soapy.' }),
  severed_finger: B({ kind: 'trinket', name: "Merv's Severed Finger", icon: '\uD83D\uDD90\uFE0F', tier: 1, value: 0, desc: 'A gnawed-off ring finger, still wearing a tarnished silver band. The ring is engraved: "Agnes".' }),
  stupid_shirt: B({ kind: 'armor', name: "Stupid Shirt", icon: '\uD83D\uDC55', tier: 1, acBonus: 0, value: 0, desc: "A shirt. It's stupid. Merv gave it to you as a pre-reward. It smells like moss and regret." }),
  toeless_boots: B({ kind: 'armor', name: "Toeless Boots", icon: '\uD83D\uDC62', tier: 2, acBonus: 1, value: 50, desc: "Fine leather boots. Missing the toes. Don't ask. +1 AC. +1 movement." }),
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
    id: `it${iid++}`, kind: b.kind, name, icon: b.icon, tier: b.tier, rarity: r,
    weaponKind: b.weaponKind, damageDice: b.damageDice, damageType: b.damageType,
    acBonus: b.acBonus, healDice: b.healDice, enchantId, value, desc: b.desc,
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

export function generateLoot(opts?: { minTier?: Tier; maxTier?: Tier; rarityBoost?: number; kind?: ItemKind }): Item {
  const minT = opts?.minTier ?? 1, maxT = opts?.maxTier ?? 2;
  // rarity (boost shifts weight away from common)
  const boost = opts?.rarityBoost ?? 0;
  const rarity = pickWeighted(RARITY_WEIGHTS.map(([r, w], i) => [r, w * (1 + boost * i)] as [Rarity, number]));
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
export type LootSource = 'crate' | 'barrel' | 'vase' | 'chest' | 'boss' | 'goblin' | 'goldenkey' | 'secret' | 'beast' | 'undead';

export function rollLootTable(source: LootSource): { items: Item[]; gold: number } {
  const items: Item[] = [];
  let gold = 0;
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
      items.push(generateLoot({ minTier: 1, maxTier: 2, rarityBoost: 1.2 }));
      if (Math.random() < 0.5) items.push(generateLoot({ minTier: 1, maxTier: 2 }));
      gold = g(15, 30);
      break;
    case 'goblin':
      if (Math.random() < 0.3) items.push(generateLoot({ minTier: 1, maxTier: 1 }));
      if (Math.random() < 0.4) gold = g(2, 6);
      break;
    case 'boss':
      items.push(generateLoot({ minTier: 2, maxTier: 3, rarityBoost: 2 }));
      if (Math.random() < 0.6) items.push(generateLoot({ minTier: 1, maxTier: 2, rarityBoost: 0.8 }));
      gold = g(40, 80);
      break;
    case 'beast':
      if (Math.random() < 0.2) items.push(generateLoot({ minTier: 1, maxTier: 1, kind: 'consumable' }));
      if (Math.random() < 0.35) gold = g(1, 5);
      break;
    case 'undead':
      if (Math.random() < 0.3) items.push(generateLoot({ minTier: 1, maxTier: 2 }));
      if (Math.random() < 0.5) gold = g(4, 12);
      break;
    case 'secret':
      // hidden stash: a guaranteed good item + gold
      items.push(generateLoot({ minTier: 2, maxTier: 3, rarityBoost: 1.6 }));
      if (Math.random() < 0.7) items.push(generateLoot({ minTier: 1, maxTier: 2, kind: 'consumable' }));
      gold = g(30, 60);
      break;
    case 'goldenkey':
      // the golden-chest jackpot: the signature epic reward + spoils
      items.push(makeItem('warlord_blade', 'flaming', 'epic'));
      items.push(generateLoot({ minTier: 2, maxTier: 3, rarityBoost: 2.5 }));
      items.push(makeItem('potion_greater'));
      gold = g(120, 200);
      break;
  }
  return { items, gold };
}
