// ─────────────────────────────────────────────────────────────
// Effective unit stats — equipment & enchantments applied as
// pure calculations (never mutate the Unit). Used by combat.ts
// (hit checks, movement, heal caps) and by the HUD (HP/XP bars).
// ─────────────────────────────────────────────────────────────
import type { Unit } from './types';
import { ENCHANTS, type Item } from './items';

function allItems(u: Unit): (Item | undefined)[] {
  return [
    u.equipment.head, u.equipment.chest, u.equipment.legs,
    u.equipment.boots, u.equipment.gloves, u.equipment.arms, u.equipment.belt, u.equipment.cloak,
    u.equipment.weapon, u.equipment.offHand, u.equipment.amulet, u.equipment.trinket,
    u.equipment.ring1, u.equipment.ring2,
  ];
}

function allEnchs(u: Unit) {
  return allItems(u).map((item) => item?.enchantId ? ENCHANTS[item.enchantId] : undefined);
}

export function effAC(u: Unit): number {
  let bonus = 0;
  for (const item of allItems(u)) bonus += item?.acBonus ?? 0;
  for (const e of allEnchs(u)) bonus += e?.acBonus ?? 0;
  let cond = 0;
  if (u.conditions.some((c) => c.id === 'shielded')) cond += 2;
  if (u.conditions.some((c) => c.id === 'well_fed')) cond += 1;
  if (u.conditions.some((c) => c.id === 'fortified')) cond += 3;
  if (u.conditions.some((c) => c.id === 'inspired')) cond += 2;
  if (u.conditions.some((c) => c.id === 'stoneskin')) cond += 4;
  if (u.conditions.some((c) => c.id === 'armored')) cond += 5;
  if (u.conditions.some((c) => c.id === 'defending')) cond += 1;
  return u.ac + bonus + u.bonusAC + cond;
}

export function effMove(u: Unit): number {
  let bonus = 0;
  for (const e of allEnchs(u)) bonus += e?.moveBonus ?? 0;
  return u.moveRange + bonus + u.bonusMove;
}

export function effMaxHp(u: Unit): number {
  let bonus = 0;
  for (const e of allEnchs(u)) bonus += e?.hpBonus ?? 0;
  for (const item of allItems(u)) bonus += item?.hpBonus ?? 0;
  return u.maxHp + bonus;
}

/** flat physical-damage reduction from armor (sturdy boots, pipe helmet, …) */
export function effPhysResist(u: Unit): number {
  let resist = 0;
  for (const item of allItems(u)) resist += item?.physResist ?? 0;
  return resist;
}

/** +1 AC from the Well Fed condition */
export function effACBonusFromConditions(u: Unit): number {
  return u.conditions.some((c) => c.id === 'well_fed') ? 1 : 0;
}

export function effAtkBonus(u: Unit): number {
  const wEnch = u.equipment.weapon?.enchantId ? ENCHANTS[u.equipment.weapon.enchantId] : undefined;
  return wEnch?.atkBonus ?? 0;
}

// ── XP / levels (Greg starts at level 1) ────────────────────
// Cumulative XP required to REACH each level (level N → XP_THRESHOLDS[N]).
// Level 1 is 0 XP; there is no threshold entry for it.
export const MAX_LEVEL = 6;
export const XP_THRESHOLDS: Record<number, number> = { 2: 80, 3: 200, 4: 400, 5: 650, 6: 950 };

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
 * Class skills use their `tier` — note Tier-1 opens at Lv2 so that at Lv1 the
 * ONLY assignable skills are the 2 the player picked at creation:
 *   Tier-1 → level 2
 *   Tier-2 → level 3
 *   Tier-3 → level 4
 *   Tier-4+ → level 4
 */
export function minLevelForSkill(s: { classId?: string; tier?: 1 | 2 | 3 | 4 | 5; levelReq?: number }): number {
  if (s.classId) {
    switch (s.tier) {
      case 2: return 3;
      case 3: return 4;
      case 4:
      case 5: return 4;
      default: return 2; // Tier-1 class skills open at Lv2
    }
  }
  return s.levelReq && s.levelReq > 1 ? s.levelReq : 1;
}

/**
 * Class-skill tier that becomes available at each character level (used by
 * `canUnlock` so the skill tree respects level gates too).
 */
export function tierAtLevel(level: number): 1 | 2 | 3 | 4 {
  if (level >= 4) return 4;
  if (level === 3) return 3;
  if (level === 2) return 2;
  return 1;
}

/** xp progress within the current level band (for HUD bars) */
export function xpProgress(u: Unit): { cur: number; need: number; pct: number } {
  if (u.level >= MAX_LEVEL) return { cur: 1, need: 1, pct: 1 };
  const lo = XP_THRESHOLDS[u.level] ?? 0;
  const hi = XP_THRESHOLDS[u.level + 1] ?? XP_THRESHOLDS[u.level] ?? 1;
  return { cur: u.xp - lo, need: hi - lo, pct: Math.min(1, Math.max(0, (u.xp - lo) / (hi - lo))) };
}
