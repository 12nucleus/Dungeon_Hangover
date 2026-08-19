import type {
  SkillDef, SkillEffect, SkillId, SkillPresentation, SkillRuntimeDefinition,
  SkillState, SkillAudioCue, Unit,
} from './types';
import { SKILLS, CONDITIONS, SUMMON_TEMPLATES } from './skills';
import { ALL_CLASS_SKILLS } from './classSkills';
import { skillById } from './skillLookup';
import { minLevelForSkill } from './stats';

const ACTIVE_SLOT_LIMIT = 12;

const AUDIO_BY_FX: Record<SkillDef['fx'], SkillAudioCue> = {
  slash: 'melee', bash: 'impact', blood: 'impact', arrow: 'ranged',
  fire: 'fireball_cast', ice: 'ice', holy: 'holy', heal: 'heal', buff: 'buff', arcane: 'arcane',
};

const IMPACT_BY_FX: Partial<Record<SkillDef['fx'], SkillAudioCue>> = {
  slash: 'impact', bash: 'impact', blood: 'impact', arrow: 'impact', fire: 'fireball_impact', ice: 'impact', holy: 'impact',
};

export function presentationForSkill(skill: SkillDef): SkillPresentation {
  return {
    castAudio: AUDIO_BY_FX[skill.fx] ?? 'arcane',
    impactAudio: IMPACT_BY_FX[skill.fx],
    trail: skill.projectile ? skill.fx : undefined,
    burst: skill.fx,
    shake: skill.fx === 'fire' ? 0.5 : skill.aoeRadius > 0 ? 0.28 : skill.kind === 'melee' ? 0.2 : 0.08,
    flash: skill.fx === 'fire' || skill.fx === 'holy' ? skill.fxColor : undefined,
  };
}

/** Converts legacy SkillDef fields into the typed effect contract. */
export function effectsForSkill(skill: SkillDef): SkillEffect[] {
  const effects: SkillEffect[] = [];
  if (skill.damageDice) {
    effects.push({
      type: 'damage', dice: skill.damageDice, damageType: skill.damageType,
      save: skill.saveAbility && skill.saveDC ? { ability: skill.saveAbility, dc: skill.saveDC, result: skill.id === 'sacred_flame' ? 'negate' : 'half' } : undefined,
    });
  }
  if (skill.healDice) effects.push({ type: 'heal', dice: skill.healDice });
  if (skill.appliesCondition) effects.push({ type: 'condition', id: skill.appliesCondition, rounds: skill.appliesRounds ?? 3, chance: skill.appliesChance });
  if (skill.appliesCondition2) effects.push({ type: 'condition', id: skill.appliesCondition2, rounds: skill.appliesRounds2 ?? 2 });
  if (skill.summonId) effects.push({ type: 'summon', template: skill.summonId, count: skill.summonCount });
  if (skill.raiseCorpses || skill.passive || !effects.length) effects.push({ type: 'script', handler: skill.id });
  return effects;
}

export function runtimeSkill(skill: SkillDef): SkillRuntimeDefinition {
  return { ...skill, effects: effectsForSkill(skill), presentation: presentationForSkill(skill) };
}

export function skillRuntimeById(id: SkillId): SkillRuntimeDefinition | undefined {
  const skill = skillById(id);
  return skill ? runtimeSkill(skill) : undefined;
}

/** Migrate old saves lazily and keep legacy fields synchronized for old callers. */
export function ensureSkillState(u: Unit): SkillState {
  if (!u.skillState) {
    const learned = [...new Set(u.knownSkills ?? [])];
    const loadout = (u.hotbarLoadout ?? u.equippedSkills ?? learned).slice(0, ACTIVE_SLOT_LIMIT);
    while (loadout.length < ACTIVE_SLOT_LIMIT) loadout.push(null);
    u.skillState = {
      learned,
      loadout,
      unlockedNodes: [...(u.unlockedNodes ?? [])],
      passiveRanks: {},
    };
  }
  syncSkillState(u);
  return u.skillState;
}

export function syncSkillState(u: Unit): void {
  const state = u.skillState;
  if (!state) return;
  state.learned = [...new Set(state.learned.filter((id) => !!skillById(id)))];
  state.loadout = state.loadout.slice(0, ACTIVE_SLOT_LIMIT).map((id) => id && state.learned.includes(id) ? id : null);
  while (state.loadout.length < ACTIVE_SLOT_LIMIT) state.loadout.push(null);
  u.knownSkills = [...state.learned];
  u.unlockedNodes = [...state.unlockedNodes];
  u.hotbarLoadout = [...state.loadout];
  u.equippedSkills = state.loadout.filter((id): id is string => !!id);
}

export function activeSkillIds(u: Unit): SkillId[] {
  if (u.skillState) return ensureSkillState(u).loadout.filter((id): id is string => !!id);
  return [...(u.equippedSkills ?? [])];
}

export interface SkillRuleResult { ok: boolean; reason?: string; }

export function canLearnSkill(u: Unit, id: SkillId): SkillRuleResult {
  const skill = skillById(id);
  if (!skill) return { ok: false, reason: 'Unknown skill.' };
  if (!skill.classId) return { ok: false, reason: 'This skill is not learned through a class progression.' };
  if (!(u.classes ?? []).includes(skill.classId)) return { ok: false, reason: 'This skill belongs to another class.' };
  if (u.level < minLevelForSkill(skill)) return { ok: false, reason: `Requires level ${minLevelForSkill(skill)}.` };
  if (ensureSkillState(u).learned.includes(id)) return { ok: false, reason: 'Already learned.' };
  if (u.skillPoints <= 0) return { ok: false, reason: 'No skill points available.' };
  return { ok: true };
}

export function canEquipSkill(u: Unit, id: SkillId): SkillRuleResult {
  const state = ensureSkillState(u);
  if (!state.learned.includes(id)) return { ok: false, reason: 'Skill has not been learned.' };
  if (state.loadout.includes(id)) return { ok: false, reason: 'Skill is already equipped.' };
  if (state.loadout.filter(Boolean).length >= ACTIVE_SLOT_LIMIT) return { ok: false, reason: 'All 12 skill slots are full.' };
  return { ok: true };
}

export function canUseSkill(u: Unit, skill: SkillDef): string | null {
  if (!u.alive) return 'dead';
  if (skill.passive) return 'Passive skills cannot be activated.';
  if (skill.id !== 'attack' && skill.id !== 'shove' && !activeSkillIds(u).includes(skill.id) && u.team === 'party') return 'Skill is not equipped.';
  if (skill.id === 'attack') return u.attackUsed ? 'Already attacked this turn' : null;
  if (skill.oncePerFight && u.cooldowns[`once_${skill.id}`]) return 'Already used this fight';
  if ((u.cooldowns[skill.id] ?? 0) > 0) return `${skill.name} is on cooldown`;
  if (skill.cost === 'action' && !u.hasAction) return 'No action left';
  if (skill.cost === 'bonus' && !u.hasBonus) return 'No bonus action left';
  return null;
}

export interface SkillValidationIssue { id: string; message: string; }

/** Content gate: run this in tests/CI so no skill silently fizzles. */
export function validateSkills(): SkillValidationIssue[] {
  const all = { ...SKILLS, ...ALL_CLASS_SKILLS };
  const issues: SkillValidationIssue[] = [];
  for (const skill of Object.values(all)) {
    if (!skill.id || !skill.name || !skill.fx) issues.push({ id: skill.id, message: 'Missing identity or presentation.' });
    if (skill.appliesCondition && !CONDITIONS[skill.appliesCondition]) issues.push({ id: skill.id, message: `Unknown condition ${skill.appliesCondition}.` });
    if (skill.appliesCondition2 && !CONDITIONS[skill.appliesCondition2]) issues.push({ id: skill.id, message: `Unknown condition ${skill.appliesCondition2}.` });
    if (skill.summonId && !SUMMON_TEMPLATES[skill.summonId]) issues.push({ id: skill.id, message: `Unknown summon ${skill.summonId}.` });
    if (skill.range < 0 || skill.aoeRadius < 0 || skill.cooldown < 0) issues.push({ id: skill.id, message: 'Range, radius, and cooldown must be non-negative.' });
    if (!effectsForSkill(skill).length) issues.push({ id: skill.id, message: 'Skill has no execution effects.' });
    if (skill.combo) for (const partner of skill.combo) if (!all[partner]) issues.push({ id: skill.id, message: `Unknown combo partner ${partner}.` });
  }
  return issues;
}
