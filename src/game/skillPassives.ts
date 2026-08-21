import type { Unit } from './types';
import { skillById } from './skillLookup';

export interface SkillModifiers {
  damageMultiplier: number;
  attackBonus: number;
  acBonus: number;
  moveBonus: number;
  maxHpBonus: number;
  critChance: number;
  cooldownReduction: number;
}

const EMPTY: SkillModifiers = {
  damageMultiplier: 0, attackBonus: 0, acBonus: 0, moveBonus: 0,
  maxHpBonus: 0, critChance: 0, cooldownReduction: 0,
};

const RULES: Record<string, Partial<SkillModifiers>> = {
  bouncer_stance: { acBonus: 1 },
  bouncer_privilege: { damageMultiplier: 0.15 },
  caffeine_rush: { moveBonus: 2 },
  quick_brew: { cooldownReduction: 1 },
  critical_brew: { critChance: 0.15 },
  rock_god: { damageMultiplier: 0.3 },
  intuition: { damageMultiplier: 0.3 },
  poison_master: { damageMultiplier: 0.15 },
  legendary_voice: { cooldownReduction: 1 },
  shadow_dance: { moveBonus: 2, attackBonus: 1 },
  the_slip: { acBonus: 1 },
};

function inferredRule(desc: string): Partial<SkillModifiers> {
  const rule: Partial<SkillModifiers> = {};
  const damage = !/dmg reduction/i.test(desc) ? desc.match(/\+(\d+)% dmg(?=[.,]|$)/i) : null;
  const ac = desc.match(/\+(\d+) AC/);
  const move = desc.match(/\+(\d+) movement/);
  if (damage) rule.damageMultiplier = Number(damage[1]) / 100;
  if (ac) rule.acBonus = Number(ac[1]);
  if (move) rule.moveBonus = Number(move[1]);
  return rule;
}

export function skillModifiers(u: Unit): SkillModifiers {
  const out = { ...EMPTY };
  const learned = new Set([...(u.knownSkills ?? []), ...Object.keys(u.skillState?.passiveRanks ?? {})]);
  for (const id of learned) {
    const skill = skillById(id);
    if (!skill?.passive) continue;
    const rule = RULES[id] ?? inferredRule(skill.desc);
    out.damageMultiplier += rule.damageMultiplier ?? 0;
    out.attackBonus += rule.attackBonus ?? 0;
    out.acBonus += rule.acBonus ?? 0;
    out.moveBonus += rule.moveBonus ?? 0;
    out.maxHpBonus += rule.maxHpBonus ?? 0;
    out.critChance += rule.critChance ?? 0;
    out.cooldownReduction += rule.cooldownReduction ?? 0;
  }
  return out;
}
