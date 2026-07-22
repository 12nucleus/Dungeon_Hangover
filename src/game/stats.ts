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
    u.equipment.boots, u.equipment.gloves, u.equipment.weapon,
    u.equipment.offHand, u.equipment.amulet, u.equipment.ring1, u.equipment.ring2,
  ];
}

function allEnchs(u: Unit) {
  return allItems(u).map((item) => item?.enchantId ? ENCHANTS[item.enchantId] : undefined);
}

export function effAC(u: Unit): number {
  let bonus = 0;
  for (const item of allItems(u)) bonus += item?.acBonus ?? 0;
  for (const e of allEnchs(u)) bonus += e?.acBonus ?? 0;
  return u.ac + bonus + u.bonusAC + (u.conditions.some((c) => c.id === 'shielded') ? 2 : 0);
}

export function effMove(u: Unit): number {
  let bonus = 0;
  for (const e of allEnchs(u)) bonus += e?.moveBonus ?? 0;
  return u.moveRange + bonus + u.bonusMove;
}

export function effMaxHp(u: Unit): number {
  let bonus = 0;
  for (const e of allEnchs(u)) bonus += e?.hpBonus ?? 0;
  return u.maxHp + bonus;
}

export function effAtkBonus(u: Unit): number {
  const wEnch = u.equipment.weapon?.enchantId ? ENCHANTS[u.equipment.weapon.enchantId] : undefined;
  return wEnch?.atkBonus ?? 0;
}

// ── XP / levels (roster starts at level 3) ──────────────────
export const MAX_LEVEL = 5;
export const XP_THRESHOLDS: Record<number, number> = { 3: 300, 4: 650 };

/** xp progress within the current level band (for HUD bars) */
export function xpProgress(u: Unit): { cur: number; need: number; pct: number } {
  if (u.level >= MAX_LEVEL) return { cur: 1, need: 1, pct: 1 };
  const lo = u.level > 3 ? XP_THRESHOLDS[u.level - 1] : 0;
  const hi = XP_THRESHOLDS[u.level];
  return { cur: u.xp - lo, need: hi - lo, pct: Math.min(1, (u.xp - lo) / (hi - lo)) };
}
