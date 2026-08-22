// ─────────────────────────────────────────────────────────────
// Improvised equipment — every dungeon object has uses.
// A bucket is a club, a shield, a helmet, and a terrible shoe.
// Stats are per-slot; inspect UI reads this table, combat/AC do too.
// ─────────────────────────────────────────────────────────────
import type { DamageType, EquipSlot } from './types';
import type { Item } from './items';

export interface SlotUse {
  slot: EquipSlot;
  /** short role shown in inspect ("Helmet", "Bludgeon", "Shield") */
  role: string;
  damageDice?: string;
  damageType?: DamageType;
  acBonus?: number;
  hpBonus?: number;
  physResist?: number;
  atkBonus?: number;
  moveBonus?: number;
  onHitCondition?: { id: string; chance: number; rounds: number };
  /** one line: what this slot actually does */
  note: string;
}

export const SLOT_LABEL: Record<EquipSlot, string> = {
  head: 'Head', chest: 'Chest', legs: 'Legs', boots: 'Boots', gloves: 'Gloves',
  arms: 'Arms', cloak: 'Cloak', belt: 'Belt', trinket: 'Charm',
  weapon: 'Weapon', offHand: 'Off-Hand', amulet: 'Amulet', ring: 'Ring', ranged: 'Ranged', quiver: 'Quiver',
};

export const SLOT_ICON: Record<string, string> = {
  head: '⛑️', chest: '🦺', legs: '👖', boots: '👢', gloves: '🧤', arms: '💪',
  cloak: '🧥', belt: '🧷', trinket: '🧿', weapon: '⚔️', offHand: '🛡️',
  amulet: '📿', ring: '💍', ring1: '💍', ring2: '💍', ranged: '🏹', quiver: '🪶',
};

const U = (u: SlotUse) => u;

/** authored per-base uses. Anything missing falls through to deriveUses(). */
const USES: Record<string, SlotUse[]> = {
  wooden_bucket: [
    U({ slot: 'weapon', role: 'Bludgeon', damageDice: '1d4', damageType: 'bludgeoning', note: 'A wet thunk. Dignity optional.' }),
    U({ slot: 'offHand', role: 'Shield', acBonus: 1, note: '+1 AC. You look like a waiter who lost a fight.' }),
    U({ slot: 'head', role: 'Helmet', acBonus: 1, atkBonus: -1, note: '+1 AC, −1 attack. The world is darker and damper.' }),
    U({ slot: 'boots', role: 'Shoe', acBonus: 0, moveBonus: -1, physResist: 1, note: '−1 move, −1 physical. One shoe. The other foot is jealous.' }),
  ],
  plunger: [
    U({ slot: 'weapon', role: 'Scepter', damageDice: '1d4', damageType: 'bludgeoning', onHitCondition: { id: 'stunned', chance: 0.25, rounds: 1 }, note: '25% stun. The sewer\'s royal seal.' }),
    U({ slot: 'offHand', role: 'Shield', acBonus: 1, note: '+1 AC. The cup makes a surprisingly loyal buckler.' }),
    U({ slot: 'head', role: 'Crown', acBonus: 0, hpBonus: 2, note: '+2 HP. You will never be taken seriously again. Worth it.' }),
  ],
  towel: [
    U({ slot: 'weapon', role: 'Whip', damageDice: '1d2', damageType: 'bludgeoning', onHitCondition: { id: 'blinded', chance: 0.5, rounds: 1 }, note: '50% blind. It smells like royalty and damp.' }),
    U({ slot: 'head', role: 'Turban', acBonus: 1, note: '+1 AC. Formal wear, if the form is "just left the bath".' }),
    U({ slot: 'cloak', role: 'Cape', acBonus: 1, note: '+1 AC. Flutters. Tragically.' }),
  ],
  rubber_duck: [
    U({ slot: 'head', role: 'Helm', acBonus: 1, note: '+1 AC. Squeaks when hit. So do you.' }),
    U({ slot: 'offHand', role: 'Focus', acBonus: 0, atkBonus: 1, note: '+1 attack. The duck believes in you. Nobody else does.' }),
    U({ slot: 'trinket', role: 'Charm', hpBonus: 1, note: '+1 HP. It watches. It judges. It squeaks.' }),
  ],
  broken_bottle: [
    U({ slot: 'weapon', role: 'Shiv', damageDice: '1d4', damageType: 'slashing', onHitCondition: { id: 'bleeding', chance: 1, rounds: 2 }, note: 'Bleeding. One good swing and the bottle is gone.' }),
    U({ slot: 'boots', role: 'Crampon', acBonus: 0, moveBonus: -1, physResist: 1, note: '−1 move, −1 physical. Glass in the sole. Fashion is pain.' }),
  ],
  wine_bottle: [
    U({ slot: 'weapon', role: 'Club', damageDice: '1d4', damageType: 'bludgeoning', note: 'Still full. The wine is a delivery system for regret.' }),
    U({ slot: 'offHand', role: 'Toast', acBonus: 1, note: '+1 AC. You are celebrating something. You do not know what.' }),
  ],
  wrench: [
    U({ slot: 'weapon', role: 'Spanner', damageDice: '1d4+1', damageType: 'bludgeoning', note: 'Opens pipes. Closes arguments.' }),
    U({ slot: 'offHand', role: 'Weight', acBonus: 1, note: '+1 AC. Heavy enough to matter.' }),
  ],
  rat_bone: [
    U({ slot: 'weapon', role: 'Club', damageDice: '1d4', damageType: 'bludgeoning', note: 'The rat is gone. The opinions remain.' }),
    U({ slot: 'trinket', role: 'Fetish', acBonus: 1, note: '+1 AC. Worn as a charm. The rats notice.' }),
  ],
  rope: [
    U({ slot: 'weapon', role: 'Lash', damageDice: '1d4', damageType: 'bludgeoning', note: 'Acceptable for hitting. Better for climbing.' }),
    U({ slot: 'belt', role: 'Belt', hpBonus: 2, note: '+2 HP. Holds the underwear up. A public service.' }),
  ],
  pipe_helmet: [
    U({ slot: 'head', role: 'Helm', acBonus: 0, physResist: 1, note: 'Physical −1. Waterproof, probably.' }),
    U({ slot: 'weapon', role: 'Pot', damageDice: '1d4', damageType: 'bludgeoning', note: 'You took it off to hit someone. Priorities.' }),
  ],
  wooden_shield: [
    U({ slot: 'offHand', role: 'Shield', acBonus: 1, note: '+1 AC. Splintered but loyal.' }),
    U({ slot: 'weapon', role: 'Lid', damageDice: '1d4', damageType: 'bludgeoning', note: 'A shield, inverted. The nails face outward now.' }),
  ],
  guards_cap: [
    U({ slot: 'head', role: 'Cap', acBonus: 1, note: '+1 AC. Smells like Scrag.' }),
    U({ slot: 'offHand', role: 'Swat', damageDice: '1d2', damageType: 'bludgeoning', note: '1d2. You are swatting a goblin with his own hat.' }),
  ],
  leather_boot: [
    U({ slot: 'boots', role: 'Boot', acBonus: 1, note: '+1 AC. Found on a floating body.' }),
    U({ slot: 'weapon', role: 'Missile', damageDice: '1d4', damageType: 'bludgeoning', note: 'The other boot is still out there. Somewhere.' }),
    U({ slot: 'offHand', role: 'Baffle', acBonus: 1, note: '+1 AC. Held like a very sad buckler.' }),
  ],
  sturdy_boots: [
    U({ slot: 'boots', role: 'Boots', acBonus: 1, physResist: 1, note: '+1 AC, physical −1. The Hermit insists they\'re lucky.' }),
  ],
  goblin_banner: [
    U({ slot: 'cloak', role: 'Cape', acBonus: 1, note: '+1 AC. It smells like a parade.' }),
    U({ slot: 'offHand', role: 'Standard', acBonus: 1, note: '+1 AC. You are now a one-man procession.' }),
  ],
  tattered_cloak: [
    U({ slot: 'cloak', role: 'Cloak', acBonus: 1, note: '+1 AC. Better days. Worse centuries.' }),
    U({ slot: 'head', role: 'Hood', acBonus: 1, note: '+1 AC. Pulled over the face. Mysterious. Damp.' }),
  ],
  mushroom_cap: [
    U({ slot: 'head', role: 'Hat', acBonus: 1, note: '+1 AC. Keeps the rain and the spores off.' }),
    U({ slot: 'offHand', role: 'Lid', acBonus: 1, note: '+1 AC. A mushroom used as a shield. The mushroom is honored.' }),
  ],
  soap_crown: [
    U({ slot: 'head', role: 'Crown', acBonus: 1, note: '+1 AC. Goblins respect you. Dignity sold separately.' }),
  ],
  moldy_cheese: [
    U({ slot: 'weapon', role: 'Brick', damageDice: '1d4', damageType: 'bludgeoning', onHitCondition: { id: 'nauseated', chance: 0.35, rounds: 2 }, note: '35% nauseated. The mold is the active ingredient.' }),
    U({ slot: 'offHand', role: 'Ration', hpBonus: 1, note: '+1 HP. You are holding lunch. Lunch is holding a grudge.' }),
  ],
  glowing_mushroom: [
    U({ slot: 'head', role: 'Lantern', acBonus: 0, note: 'Faint light. Do not ask what it is glowing with.' }),
    U({ slot: 'trinket', role: 'Lamp', hpBonus: 1, note: '+1 HP. Pocket sunshine, sewer edition.' }),
  ],
  drowned_majesty: [
    U({ slot: 'weapon', role: 'Scepter', damageDice: '1d10+1', damageType: 'bludgeoning', onHitCondition: { id: 'slippery', chance: 0.15, rounds: 2 }, note: '15% slippery. It will slide out of your hands on a fumble.' }),
    U({ slot: 'offHand', role: 'Scepter', acBonus: 1, note: '+1 AC. Too proud to be a shield. Being one anyway.' }),
  ],
  rusty_sword: [
    U({ slot: 'weapon', role: 'Blade', damageDice: '1d6+1', damageType: 'slashing', note: '10% snap on a fumble. A blade that has seen better centuries.' }),
    U({ slot: 'offHand', role: 'Parry', acBonus: 1, note: '+1 AC. Held short, like you know what you\'re doing.' }),
  ],
  rusty_mace: [
    U({ slot: 'weapon', role: 'Mace', damageDice: '1d6+1', damageType: 'bludgeoning', onHitCondition: { id: 'stunned', chance: 0.1, rounds: 1 }, note: '10% stun. Dents armor. And skulls.' }),
    U({ slot: 'offHand', role: 'Weight', acBonus: 1, note: '+1 AC. The rust is load-bearing.' }),
  ],
  leather_vest: [
    U({ slot: 'chest', role: 'Vest', acBonus: 1, note: '+1 AC. Goblin-grade stitching.' }),
  ],
  ribcage_armor: [
    U({ slot: 'chest', role: 'Cuirass', acBonus: 0, physResist: 1, note: 'Physical −1. The previous owner no longer needs it.' }),
    U({ slot: 'head', role: 'Crown', acBonus: 1, note: '+1 AC. Worn as a bone circlet. The aesthetic is committed.' }),
  ],
  leather_bracers: [
    U({ slot: 'arms', role: 'Bracers', acBonus: 1, note: '+1 AC. Snug as a hug with knuckles.' }),
    U({ slot: 'offHand', role: 'Pad', acBonus: 1, note: '+1 AC. One bracer held like a tiny shield.' }),
  ],
  rusty_bracers: [
    U({ slot: 'arms', role: 'Bracers', acBonus: 0, physResist: 1, note: 'Physical −1. They clang when you clap.' }),
    U({ slot: 'weapon', role: 'Cestus', damageDice: '1d4', damageType: 'bludgeoning', note: 'Worn as a knuckle. The rust is the point.' }),
  ],
  leather_belt: [
    U({ slot: 'belt', role: 'Belt', hpBonus: 2, note: '+2 HP. Holds the pants up, emotionally speaking.' }),
    U({ slot: 'weapon', role: 'Strap', damageDice: '1d2', damageType: 'bludgeoning', note: '1d2. You took your belt off to hit someone. The underwear notices.' }),
  ],
  hermits_ring: [
    U({ slot: 'ring', role: 'Ring', note: '+5% XP. Warm. Which finger is a question you stop asking.' }),
  ],
  blessed_penny: [
    U({ slot: 'trinket', role: 'Charm', note: '+5% gold found. The saint on it looks hungover too.' }),
    U({ slot: 'offHand', role: 'Wager', acBonus: 0, atkBonus: 1, note: '+1 attack. Luck, held like a threat.' }),
  ],
  rat_whisker: [
    U({ slot: 'trinket', role: 'Charm', acBonus: 1, note: '+1 AC. Worn as a charm. The rat was unlucky. You might not be.' }),
  ],
  lockpick: [
    U({ slot: 'trinket', role: 'Tool', note: 'Opens locks. The dungeon calls it cheating.' }),
    U({ slot: 'weapon', role: 'Pin', damageDice: '1d2', damageType: 'piercing', note: '1d2. You are stabbing with a hobby.' }),
  ],
  goblin_soap: [
    U({ slot: 'trinket', role: 'Bar', note: 'Pink. Strawberries and poor life choices. Scrag will lose his mind.' }),
    U({ slot: 'weapon', role: 'Cake', damageDice: '1d2', damageType: 'bludgeoning', onHitCondition: { id: 'slippery', chance: 0.4, rounds: 2 }, note: '40% slippery. You hit them with soap. It works.' }),
  ],
  premium_soap: [
    U({ slot: 'trinket', role: 'Bar', note: 'Unscented, triple-milled. Scrag may weep.' }),
    U({ slot: 'weapon', role: 'Cake', damageDice: '1d4', damageType: 'bludgeoning', onHitCondition: { id: 'slippery', chance: 0.5, rounds: 2 }, note: '50% slippery. Luxury violence.' }),
  ],
  soap_chunk: [
    U({ slot: 'trinket', role: 'Chip', note: 'A partial bar. The guard is not taking questions.' }),
    U({ slot: 'weapon', role: 'Pebble', damageDice: '1d2', damageType: 'bludgeoning', onHitCondition: { id: 'slippery', chance: 0.25, rounds: 1 }, note: '25% slippery. A fragment of tyranny.' }),
  ],
  bubble_bath: [
    U({ slot: 'trinket', role: 'Vial', note: 'Pour it at your feet: Slippery. Gribnab would be proud.' }),
  ],
  sewer_water_flask: [
    U({ slot: 'weapon', role: 'Flask', damageDice: '1d2', damageType: 'bludgeoning', onHitCondition: { id: 'nauseated', chance: 0.3, rounds: 2 }, note: '30% nauseated. The sewer plays fair.' }),
    U({ slot: 'offHand', role: 'Canteen', hpBonus: 1, note: '+1 HP. You are drinking this later. You will regret that later.' }),
  ],
  water_flask: [
    U({ slot: 'trinket', role: 'Flask', note: 'Clean-ish. For the fountain at the intersection.' }),
    U({ slot: 'weapon', role: 'Flask', damageDice: '1d2', damageType: 'bludgeoning', note: '1d2. Hydration as a martial art.' }),
  ],
  torch1: [
    U({ slot: 'weapon', role: 'Torch', damageDice: '1d4', damageType: 'bludgeoning', note: 'Light, and a weak club. Burns dimly.' }),
    U({ slot: 'offHand', role: 'Lamp', acBonus: 0, note: 'Held high. The dark hates this.' }),
  ],
};

const KEY_BASES: Record<string, true> = { iron_key: true, golden_key: true, rusty_key: true };

function deriveUses(item: Item): SlotUse[] {
  const uses: SlotUse[] = [];
  if (item.kind === 'weapon') {
    const wSlot: EquipSlot = (item.slot as EquipSlot) === 'ranged' ? 'ranged' : 'weapon';
    uses.push({
      slot: wSlot,
      role: wSlot === 'ranged' ? 'Ranged' : 'Weapon',
      damageDice: item.damageDice,
      damageType: item.damageType,
      onHitCondition: item.onHitCondition,
      note: item.damageDice
        ? `${item.damageDice} ${item.damageType ?? 'bludgeoning'}${wSlot === 'ranged' ? ` · ${item.tier === 3 ? 10 : 8} tiles` : ''}${item.twoHanded ? ' · two-handed' : ''}`
        : 'Improvised.',
    });
    if (!item.twoHanded && wSlot === 'weapon') {
      uses.push({
        slot: 'offHand',
        role: 'Off-hand',
        damageDice: item.damageDice,
        damageType: item.damageType,
        acBonus: item.acBonus,
        note: item.acBonus ? `+${item.acBonus} AC in the off hand.` : 'Can be dual-wielded.',
      });
    }
  } else if (item.kind === 'armor') {
    const slot = item.slot ?? 'chest';
    uses.push({
      slot,
      role: SLOT_LABEL[slot] ?? 'Armor',
      acBonus: item.acBonus,
      hpBonus: item.hpBonus,
      physResist: item.physResist,
      note: [
        item.acBonus ? `+${item.acBonus} AC` : null,
        item.physResist ? `physical −${item.physResist}` : null,
        item.hpBonus ? `+${item.hpBonus} HP` : null,
      ].filter(Boolean).join(', ') || 'Worn.',
    });
  } else if (item.kind === 'ammo') {
    const slot = item.slot ?? 'quiver';
    uses.push({
      slot,
      role: SLOT_LABEL[slot] ?? 'Quiver',
      note: item.infinite ? 'Endless basic arrows — restocks itself.' : (item.desc || 'Ammunition.'),
    });
  } else if (item.kind === 'trinket') {
    const slot = item.slot ?? 'trinket';
    uses.push({
      slot,
      role: SLOT_LABEL[slot] ?? 'Charm',
      acBonus: item.acBonus,
      hpBonus: item.hpBonus,
      note: item.desc,
    });
  }
  return uses;
}

export function itemUses(item: Item): SlotUse[] {
  const authored = item._baseId ? USES[item._baseId] : undefined;
  if (authored?.length) return authored;
  return deriveUses(item);
}

export function extraSlotsFor(baseId: string, native?: EquipSlot): EquipSlot[] {
  const authored = USES[baseId];
  if (!authored) return [];
  return authored.map((u) => u.slot).filter((s) => s !== native);
}

export function canEquipIn(item: Item, slot: string): boolean {
  const want = slot === 'ring1' || slot === 'ring2' ? 'ring' : slot;
  return itemUses(item).some((u) => u.slot === want);
}

export function useForSlot(item: Item, slot: string): SlotUse | undefined {
  const want = slot === 'ring1' || slot === 'ring2' ? 'ring' : slot;
  return itemUses(item).find((u) => u.slot === want);
}

export function isThrowable(item: Item): boolean {
  if (KEY_BASES[item._baseId ?? '']) return true;
  return item.kind === 'weapon' || item.kind === 'consumable' || item.kind === 'armor' || item.kind === 'trinket';
}

export function throwProfile(item: Item): { dice: string; type: DamageType } {
  const w = useForSlot(item, 'weapon');
  if (w?.damageDice) return { dice: w.damageDice, type: w.damageType ?? 'bludgeoning' };
  if (item.damageDice) return { dice: item.damageDice, type: item.damageType ?? 'bludgeoning' };
  return { dice: '1d4', type: 'bludgeoning' };
}

/** world clutter → inventory base. Seeded pickups use this map. */
export const PROP_TO_ITEM: Record<string, string> = {
  bucket: 'wooden_bucket',
  plunger: 'plunger',
  wrench: 'wrench',
  towel: 'towel',
  duck: 'rubber_duck',
  wine_bottle: 'wine_bottle',
  broken_bottle: 'broken_bottle',
  bones: 'rat_bone',
  pipe_fitting: 'pipe_helmet',
  toolbox: 'wrench',
  nest: 'rat_whisker',
  compass: 'blessed_penny',
  sign: 'wooden_shield',
  banner: 'goblin_banner',
};

export function formatUseLine(u: SlotUse): string {
  const bits: string[] = [];
  if (u.damageDice) bits.push(`${u.damageDice} ${u.damageType ?? ''}`.trim());
  if (u.acBonus) bits.push(`+${u.acBonus} AC`);
  if (u.hpBonus) bits.push(`+${u.hpBonus} HP`);
  if (u.physResist) bits.push(`−${u.physResist} phys`);
  if (u.atkBonus) bits.push(`${u.atkBonus > 0 ? '+' : ''}${u.atkBonus} ATK`);
  if (u.moveBonus) bits.push(`${u.moveBonus > 0 ? '+' : ''}${u.moveBonus} move`);
  if (u.onHitCondition) bits.push(`${Math.round(u.onHitCondition.chance * 100)}% ${u.onHitCondition.id}`);
  return bits.join(' · ') || 'cosmetic';
}
