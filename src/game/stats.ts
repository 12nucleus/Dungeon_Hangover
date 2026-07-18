// ─────────────────────────────────────────────────────────────
// Effective unit stats — equipment & enchantments applied as
// pure calculations (never mutate the Unit). Used by combat.ts
// (hit checks, movement, heal caps) and by the HUD (HP/XP bars).
// ─────────────────────────────────────────────────────────────
import type { Unit } from './types';
import { ENCHANTS } from './items';

const ench = (u: Unit) => ({
  w: u.equipment.weapon?.enchantId ? ENCHANTS[u.equipment.weapon.enchantId] : undefined,
  a: u.equipment.armor?.enchantId ? ENCHANTS[u.equipment.armor.enchantId] : undefined,
  t: u.equipment.trinket?.enchantId ? ENCHANTS[u.equipment.trinket.enchantId] : undefined,
});

export function effAC(u: Unit): number {
  const e = ench(u);
  return u.ac + (u.equipment.armor?.acBonus ?? 0) + (e.a?.acBonus ?? 0) + (e.t?.acBonus ?? 0)
    + u.bonusAC + (u.conditions.some((c) => c.id === 'shielded') ? 2 : 0);
}

export function effMove(u: Unit): number {
  const e = ench(u);
  return u.moveRange + (e.a?.moveBonus ?? 0) + (e.t?.moveBonus ?? 0) + (e.w?.moveBonus ?? 0) + u.bonusMove;
}

export function effMaxHp(u: Unit): number {
  const e = ench(u);
  return u.maxHp + (e.a?.hpBonus ?? 0) + (e.t?.hpBonus ?? 0) + (e.w?.hpBonus ?? 0);
}

export function effAtkBonus(u: Unit): number {
  return ench(u).w?.atkBonus ?? 0; // keen
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
