// ─────────────────────────────────────────────────────────────
// Skill trees — per-class unlock constellations (BG3-style sky):
// one branch per chosen class (up to 2), three tiers each, drawn
// from that class's real CLASS_SKILLS pool (first non-passive
// skill per tier). Tier costs 1/1/2 skill points; a level-up grants
// one point, so the cadence is roughly one new skill per level.
// Nodes either UNLOCK a skill (added to knownSkills) or grant a
// permanent PASSIVE. Pure data + validation; engine applies them.
//
// The old hardcoded fighter/wizard/cleric trees are gone: no playable
// class id matched them, so every hero — whatever class they picked —
// saw the same 6 fighter stars. The constellation is now generated
// from the hero's actual classes.
// ─────────────────────────────────────────────────────────────
import type { Unit } from './types';
import { CLASS_SKILLS } from './classSkills';
import { classById } from './classes';

export interface SkillNode {
  id: string;
  name: string;
  icon: string;
  desc: string;
  branch: string;
  tier: 1 | 2 | 3;
  cost: number;
  requires?: string[];
  unlockSkill?: string;   // id into SKILLS
  passive?: { stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'maxHp' | 'move' | 'ac'; amount: number };
}

const N = (n: SkillNode) => n;

/**
 * Build the hero's constellation from their chosen classes. One branch per
 * class (branch = class name), tiers 1–3 chained within the branch, each node
 * unlocking the first NON-PASSIVE skill of that class+tier from CLASS_SKILLS.
 * Class-pool passives are skipped (they were never combat-functional); only
 * learnable skills appear. Deterministic: same classes ⇒ same tree, so saved
 * `unlockedNodes` stay valid across reloads.
 */
export function buildClassTree(classes: string[] | undefined): SkillNode[] {
  const nodes: SkillNode[] = [];
  for (const cid of (classes ?? []).slice(0, 2)) {
    const def = classById(cid);
    const pool = CLASS_SKILLS[cid] ?? [];
    if (!def || !pool.length) continue;
    let prev: string | null = null;
    for (const tier of [1, 2, 3] as const) {
      const sk = pool.find((s) => (s.tier ?? 1) === tier && !s.passive);
      if (!sk) continue;
      const id = `${cid}_t${tier}_${sk.id}`;
      nodes.push(N({
        id,
        name: sk.name,
        icon: sk.icon,
        branch: def.name,
        tier,
        cost: tier === 3 ? 2 : 1,
        requires: prev ? [prev] : undefined,
        unlockSkill: sk.id,
        desc: sk.desc,
      }));
      prev = id;
    }
  }
  return nodes;
}

export function treeFor(u: Unit): SkillNode[] {
  return buildClassTree(u.classes);
}

/** null = unlockable now; otherwise the reason why not */
export function canUnlock(u: Unit, node: SkillNode): string | null {
  if (u.unlockedNodes.includes(node.id)) return 'Already unlocked';
  if (u.skillPoints < node.cost) return `Needs ${node.cost} skill point${node.cost > 1 ? 's' : ''}`;
  for (const req of node.requires ?? []) {
    if (!u.unlockedNodes.includes(req)) {
      const rn = treeFor(u).find((n) => n.id === req);
      return `Requires ${rn?.name ?? req}`;
    }
  }
  return null;
}
