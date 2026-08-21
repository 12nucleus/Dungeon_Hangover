// ─────────────────────────────────────────────────────────────
// Effective unit stats — equipment & enchantments applied as
// pure calculations (never mutate the Unit). Used by combat.ts
// (hit checks, movement, heal caps) and by the HUD (HP/XP bars).
// ─────────────────────────────────────────────────────────────
import type { Unit } from './types';
import { ENCHANTS, type Item } from './items';
import { useForSlot } from './improvised';
import { skillModifiers } from './skillPassives';

function equippedPairs(u: Unit): { slot: string; item: Item }[] {
  const e = u.equipment ?? {};   // first-spawn units can lack the field — never crash the UI
  const pairs: { slot: string; item: Item }[] = [];
  const add = (slot: string, item?: Item) => { if (item) pairs.push({ slot, item }); };
  add('head', e.head); add('chest', e.chest); add('legs', e.legs);
  add('boots', e.boots); add('gloves', e.gloves); add('arms', e.arms);
  add('belt', e.belt); add('cloak', e.cloak); add('weapon', e.weapon);
  add('offHand', e.offHand); add('amulet', e.amulet); add('trinket', e.trinket);
  add('ring1', e.ring1); add('ring2', e.ring2);
  return pairs;
}

function allItems(u: Unit): (Item | undefined)[] {
  return equippedPairs(u).map((p) => p.item);
}

function allEnchs(u: Unit) {
  return allItems(u).map((item) => item?.enchantId ? ENCHANTS[item.enchantId] : undefined);
}

export function effAC(u: Unit): number {
  let bonus = 0;
  for (const { slot, item } of equippedPairs(u)) {
    const use = useForSlot(item, slot);
    bonus += use?.acBonus ?? ((slot === item.slot || slot === 'chest') ? (item.acBonus ?? 0) : 0);
  }
  for (const e of allEnchs(u)) bonus += e?.acBonus ?? 0;
  let cond = 0;
  if (u.conditions.some((c) => c.id === 'shielded')) cond += 2;
  if (u.conditions.some((c) => c.id === 'well_fed')) cond += 1;
  if (u.conditions.some((c) => c.id === 'fortified')) cond += 3;
  if (u.conditions.some((c) => c.id === 'inspired')) cond += 2;
  if (u.conditions.some((c) => c.id === 'stoneskin')) cond += 4;
  if (u.conditions.some((c) => c.id === 'armored')) cond += 5;
  if (u.conditions.some((c) => c.id === 'defending')) cond += 1;
  return u.ac + bonus + u.bonusAC + cond + skillModifiers(u).acBonus;
}

export function effMove(u: Unit): number {
  let bonus = 0;
  for (const e of allEnchs(u)) bonus += e?.moveBonus ?? 0;
  for (const { slot, item } of equippedPairs(u)) bonus += useForSlot(item, slot)?.moveBonus ?? 0;
  return u.moveRange + bonus + u.bonusMove + skillModifiers(u).moveBonus;
}

export function effMaxHp(u: Unit): number {
  let bonus = 0;
  for (const e of allEnchs(u)) bonus += e?.hpBonus ?? 0;
  for (const { slot, item } of equippedPairs(u)) {
    const use = useForSlot(item, slot);
    bonus += use?.hpBonus ?? item.hpBonus ?? 0;
  }
  return u.maxHp + bonus + skillModifiers(u).maxHpBonus;
}

/** flat physical-damage reduction from armor (sturdy boots, pipe helmet, …) */
export function effPhysResist(u: Unit): number {
  let resist = 0;
  for (const { slot, item } of equippedPairs(u)) {
    const use = useForSlot(item, slot);
    resist += use?.physResist ?? item.physResist ?? 0;
  }
  return resist;
}

/** +1 AC from the Well Fed condition */
export function effACBonusFromConditions(u: Unit): number {
  return u.conditions.some((c) => c.id === 'well_fed') ? 1 : 0;
}

export function effAtkBonus(u: Unit): number {
  const wEnch = u.equipment.weapon?.enchantId ? ENCHANTS[u.equipment.weapon.enchantId] : undefined;
  let bonus = wEnch?.atkBonus ?? 0;
  for (const { slot, item } of equippedPairs(u)) bonus += useForSlot(item, slot)?.atkBonus ?? 0;
  return bonus;
}

// ── XP / levels (Greg starts at level 1) ────────────────────
// Cumulative XP required to REACH each level. The curve is intentionally
// predictable: roughly one meaningful level per authored floor, with enough
// slack for optional fights and quests.
export const MAX_LEVEL = 50;
export const XP_THRESHOLDS: Record<number, number> = Object.fromEntries(
  Array.from({ length: MAX_LEVEL - 1 }, (_, index) => {
    const level = index + 2;
    return [level, Math.round(80 * Math.pow(level - 1, 1.65))];
  }),
);

export const MIN_LEVEL_BY_TIER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1, 2: 11, 3: 21, 4: 31, 5: 41,
};

/** Apply the shared level-up rewards. Both combat XP and bonfire catch-up use this. */
export function applyLevelUp(u: Unit): void {
  u.maxHp += 6;
  u.hp = Math.min(effMaxHp(u), u.hp + 6);
  u.skillPoints += 1;
  u.abilityPoints = (u.abilityPoints ?? 0) + 1;
}

/**
 * Attack penalty from Greg's hangover, by sobriety level:
 * L1–2: −2, L3–4: −1, L5+: sober (0). Floor 50 starts Greg hungover;
 * leveling up at the bonfire gradually sobers him (see camping.ts).
 */
export function hangoverPenalty(level: number): number {
  if (level >= 5) return 0;
  if (level >= 3) return 1;
  return 2;
}

/**
 * The minimum character level required before a class skill may be assigned
 * to the hotbar / learned at the bonfire. Base (non-class) skills fall back
 * to their `levelReq` (default 1).
 *
 * Class skills use their `tier`. A level is a minimum gate, never an expiry:
 * once a tier opens it remains available for planning and specialization.
 */
export function minLevelForSkill(s: { classId?: string; tier?: 1 | 2 | 3 | 4 | 5; levelReq?: number }): number {
  if (s.classId) {
    return MIN_LEVEL_BY_TIER[s.tier ?? 1];
  }
  return s.levelReq && s.levelReq > 1 ? s.levelReq : 1;
}

/**
 * Class-skill tier that becomes available at each character level (used by
 * `canUnlock` so the skill tree respects level gates too).
 */
export function tierAtLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level >= 41) return 5;
  if (level >= 31) return 4;
  if (level >= 21) return 3;
  if (level >= 11) return 2;
  return 1;
}

/** xp progress within the current level band (for HUD bars) */
export function xpProgress(u: Unit): { cur: number; need: number; pct: number } {
  if (u.level >= MAX_LEVEL) return { cur: 1, need: 1, pct: 1 };
  const lo = XP_THRESHOLDS[u.level] ?? 0;
  const hi = XP_THRESHOLDS[u.level + 1] ?? XP_THRESHOLDS[u.level] ?? 1;
  return { cur: u.xp - lo, need: hi - lo, pct: Math.min(1, Math.max(0, (u.xp - lo) / (hi - lo))) };
}
