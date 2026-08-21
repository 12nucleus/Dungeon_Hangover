import type { SkillId, Unit } from './types';
import { skillById } from './skillLookup';
import { CONDITIONS } from './skills';

export interface ComboDef {
  id: string;
  name: string;
  skills: [SkillId, SkillId];
  description: string;
  requiresEquipped?: boolean;
  trigger: 'on-hit' | 'on-condition' | 'on-kill';
  requiresTargetCondition?: string;
  bonusDamageMultiplier?: number;
  bonusDamage?: number;
  bonusCritChance?: number;
  appliesCondition?: string;
  healPercent?: number;
}

/** Small, authored interaction layer shared by all 15 classes. */
export const COMBOS: ComboDef[] = [
  { id: 'rope-and-boot', name: 'No Way Out', skills: ['velvet_rope', 'boot'], description: 'Rooted targets take +25% damage from Boot.', requiresEquipped: true, trigger: 'on-hit', requiresTargetCondition: 'rooted', bonusDamageMultiplier: 0.25 },
  { id: 'rogue-venom', name: 'Venomous Bleed', skills: ['bleed_out', 'venom_blade'], description: 'Bleed attacks also poison a target already bleeding.', requiresEquipped: true, trigger: 'on-hit', requiresTargetCondition: 'bleeding', appliesCondition: 'poisoned' },
  { id: 'shadow-finisher', name: 'From the Dark', skills: ['shadow_step', 'backstab'], description: 'Backstab from Shadow Step deals +35% damage.', requiresEquipped: true, trigger: 'on-hit', bonusDamageMultiplier: 0.35 },
  { id: 'bard-crescendo', name: 'Crescendo', skills: ['off_key', 'power_chord'], description: 'Power Chord gains bonus force after Off Key.', requiresEquipped: true, trigger: 'on-hit', bonusDamage: 3 },
  { id: 'sommelier-pairing', name: 'Perfect Pairing', skills: ['vintage', 'pairing'], description: 'Pairing a revealed target deals bonus force damage.', requiresEquipped: true, trigger: 'on-hit', bonusDamage: 4 },
  { id: 'caffeine-crit', name: 'Overclocked', skills: ['double_shot', 'critical_brew'], description: 'Double Shot has +15% critical chance.', requiresEquipped: true, trigger: 'on-hit', bonusCritChance: 0.15 },
  { id: 'steam-pressure', name: 'Pressure Cooker', skills: ['over_heat', 'pressure'], description: 'Over Heat applies Burning when both skills are ready.', requiresEquipped: true, trigger: 'on-hit', appliesCondition: 'burning' },
  { id: 'spirit-hex', name: 'Haunted Chorus', skills: ['hex', 'summon_spirit'], description: 'Hexed targets near your spirit become Rooted.', requiresEquipped: true, trigger: 'on-condition', requiresTargetCondition: 'cursed', appliesCondition: 'rooted' },
  { id: 'beast-pounce', name: 'Predator Logic', skills: ['observe', 'pounce'], description: 'Pounce against an observed target deals +25% damage.', requiresEquipped: true, trigger: 'on-hit', bonusDamageMultiplier: 0.25 },
  { id: 'accounting-debt', name: 'Compound Interest', skills: ['audit', 'discrepancy'], description: 'Audit deals bonus damage after both skills are learned.', requiresEquipped: true, trigger: 'on-hit', bonusDamage: 4 },
  { id: 'pipe-wrench', name: 'Burst Valve', skills: ['pipe_burst', 'wrench'], description: 'Wrench attacks deal bonus damage after both skills are learned.', requiresEquipped: true, trigger: 'on-hit', bonusDamage: 3 },
  { id: 'reporter-panic', name: 'Front Page Panic', skills: ['headline', 'gossip'], description: 'Gossip applies Rooted after both skills are learned.', requiresEquipped: true, trigger: 'on-condition', appliesCondition: 'rooted' },
  { id: 'chef-salt', name: 'Seasoned Violence', skills: ['salt', 'burnt_offer'], description: 'Burnt Offer deals bonus damage after both skills are learned.', requiresEquipped: true, trigger: 'on-hit', bonusDamage: 3 },
  { id: 'totem-curse', name: 'Hexed Ground', skills: ['hex', 'totem'], description: 'Cursed targets entering your totem radius become Slowed.', requiresEquipped: true, trigger: 'on-condition', requiresTargetCondition: 'cursed', appliesCondition: 'slowed' },
  { id: 'mortician-kill', name: 'Death Dividend', skills: ['grave_marker', 'embalm'], description: 'Killing a marked target restores 10% maximum HP.', requiresEquipped: false, trigger: 'on-kill', healPercent: 0.1 },
];

export function comboForSkill(skillId: string): ComboDef[] {
  return COMBOS.filter((combo) => combo.skills.includes(skillId));
}

function readySkill(u: Unit, id: string, equipped: Set<string>): boolean {
  const skill = skillById(id);
  if (!skill) return false;
  if (skill.passive) return (u.knownSkills ?? []).includes(id);
  return equipped.has(id);
}

export function activeCombos(u: Unit): ComboDef[] {
  const equipped = new Set(u.equippedSkills ?? u.hotbarLoadout?.filter((id): id is string => !!id) ?? []);
  const learned = [...new Set([...(u.knownSkills ?? []), ...Object.keys(u.skillState?.passiveRanks ?? {})])];
  return COMBOS.filter((combo) => combo.skills.every((id) => {
    if (!learned.includes(id)) return false;
    return !combo.requiresEquipped || readySkill(u, id, equipped);
  }));
}

export function validateCombos(allSkills: Record<string, unknown>): string[] {
  const issues: string[] = [];
  for (const combo of COMBOS) {
    for (const id of combo.skills) if (!allSkills[id]) issues.push(`${combo.id}: unknown skill ${id}`);
    if (combo.appliesCondition && !CONDITIONS[combo.appliesCondition]) issues.push(`${combo.id}: unknown condition ${combo.appliesCondition}`);
  }
  return issues;
}

export function comboDamage(u: Unit, skillId: string, target?: { conditions: { id: string }[] }): { multiplier: number; flat: number; critChance: number } {
  let multiplier = 0;
  let flat = 0;
  let critChance = 0;
  for (const combo of activeCombos(u)) {
    if (!combo.skills.includes(skillId) || combo.trigger !== 'on-hit') continue;
    if (combo.requiresTargetCondition && !target?.conditions.some((c) => c.id === combo.requiresTargetCondition)) continue;
    multiplier += combo.bonusDamageMultiplier ?? 0;
    flat += combo.bonusDamage ?? 0;
    critChance += combo.bonusCritChance ?? 0;
  }
  return { multiplier, flat, critChance };
}

export function comboConditions(u: Unit, skillId: string, target: { conditions: { id: string }[] }): string[] {
  return activeCombos(u)
    .filter((combo) => combo.skills.includes(skillId) && combo.trigger !== 'on-kill')
    .filter((combo) => !combo.requiresTargetCondition || target.conditions.some((c) => c.id === combo.requiresTargetCondition))
    .map((combo) => combo.appliesCondition)
    .filter((id): id is string => !!id);
}

export function comboKillHeal(u: Unit): number {
  return activeCombos(u)
    .filter((combo) => combo.trigger === 'on-kill')
    .reduce((amount, combo) => amount + (combo.healPercent ?? 0), 0);
}
