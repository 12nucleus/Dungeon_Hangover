# Skills Audit — Passive Hooks Report

## Findings
Counts (computed from source):

- **252 SkillDef objects** carry `passive: true` (1 in `skills.ts`, 251 in `classSkills.ts`).
- **250 of them** are mechanic-specific (grapple/shove/Knockback/fog/Defend-reflect/flee-prevention/class-tier passives etc.) — none of these have engine hooks.
- **Only `frenzy`** (skills.ts:248) has its effect wired: `beginTurn` in `combat.ts:289` checks `equippedSkills.includes('frenzy')` to grant an extra action below 50% HP.
- **Tree-node passives** (`node.passive { stat, amount }` in `skilltree.ts` / `engine.ts:2213` / `engine/camping.ts:346`) are fully wired for stat-bumps (str/dex/con/int/wis/cha/maxHp/ac/move). This is a SEPARATE system from SkillDef.passive and works correctly.

## Two distinct "passive" meanings in the codebase
1. **`SkillDef.passive: true`** — used as a marker so the engine skips the skill from castable skill lists (`combat.ts:1070`). Effect-by-description is informational; **does not** fire on its own.
2. **`node.passive` (class-tree field) in skilltree.ts** — permanent stat bumps, applied at `unlockNode`.

## Conclusion for the audit
- The audit's directive — "Verify passives wire into combat hooks" — found a **structural gap**: SkillDef-style passives describe in-combat modifier behaviour (dmg bonuses vs grappled targets, dmg-reduction when stationary, on-kill stacking, Knockback-immunity), but only ONE (`frenzy`) is hooked up. The rest would need bespoke hook code on attack-rolled/damage-taken/on-kill/on-move/on-enter-range per passive — that's not within the scope of the skills-effect audit (brokenness fix + balance review) but a multi-mechanic feature ask.
- Recommended follow-up (not done here):
  1. Decide whether SkillDef-style passives should validate against a small set of generic hooks (`onHit`, `onTakeDamage`, `onKill`, `onStartPosition`, `hpBelowPct`). Several already have clean analogues (`hpBelowPct` exists at SkillDef level; combat.ts:1072 uses it; could be extended to passive-style atk-mod).
  2. For now, SkillDef passive descriptions should be treated as design-aspirational text, not executable behaviour.
- The trio of SkillDef-passive-shaped skills that ALREADY had data WITHOUT `passive: true` flag but WITHOUT `cond` either were the 51 drawing-board skills just fixed. SkillDef-buff-style with intent to buff was migrated to `cond` + `appliesRounds` (Path A: 13 skills) or inline combat case branches (Path B: 36 skills + 2 follow-ups = 38 total).

## Scope decision made
Implementing the 250 SkillDef-passive mechanic hooks is a separate feature body of work and out of scope for the skills-audit pass. The existing skill tree `node.passive` system handles permanent-stat passives correctly. The audit's PASSIVES VERIFICATION task is closed with this write-up as its deliverable — documenting the structural gap is the audit finding.
