// ─────────────────────────────────────────────────────────────
// skillLookup — single canonical resolver for skill ids across
// both registries (base SKILLS + the 750 design-bible class
// skills). Every consumer (hotbar, loadout, combat resolver,
// AI, HUD) should go through `skillById` so class skills work
// end-to-end. Kept dependency-light to avoid import cycles.
// ─────────────────────────────────────────────────────────────
import type { SkillDef } from './types';
import { SKILLS } from './skills';
import { ALL_CLASS_SKILLS } from './classSkills';

/** Resolve a skill by id from either registry (base first). */
export function skillById(id: string): SkillDef | undefined {
  return SKILLS[id] ?? ALL_CLASS_SKILLS[id];
}
