// Skill trees — complete per-class progression constellations. Every authored
//// class skill becomes a node; passive nodes are first-class unlocks too.
// The tree is deterministic so save files remain stable across reloads.
//
// The engine applies node rewards; this module only defines the graph.
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
  tier: 1 | 2 | 3 | 4 | 5;
  cost: number;
  requires?: string[];
  unlockSkill?: string;
  passiveSkill?: string;
  passive?: { stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'maxHp' | 'move' | 'ac'; amount: number };
}

const N = (n: SkillNode) => n;

/** minimum Sobriety (character level) required to unlock a tier.
 *  Tier 1 opens at Lv2, tier 2 at Lv3, tiers 3–5 at Lv4. */
export function levelForTier(tier: number): number {
  if (tier <= 1) return 2;
  if (tier === 2) return 3;
  return 4;
}

export function buildClassTree(classes: string[] | undefined): SkillNode[] {
  const nodes: SkillNode[] = [];
  for (const cid of (classes ?? []).slice(0, 2)) {
    const def = classById(cid);
    const pool = CLASS_SKILLS[cid] ?? [];
    if (!def || !pool.length) continue;
    let previousTier: string | undefined;
    for (const tier of [1, 2, 3, 4, 5] as const) {
      const tierSkills = pool.filter((s) => (s.tier ?? 1) === tier);
      const tierNodeIds: string[] = [];
      for (const sk of tierSkills) {
        const id = `${cid}_t${tier}_${sk.id}`;
        nodes.push(N({
          id, name: sk.name, icon: sk.icon, branch: def.name, tier,
          cost: tier >= 3 ? 2 : 1,
          requires: previousTier ? [previousTier] : undefined,
          unlockSkill: sk.passive ? undefined : sk.id,
          passiveSkill: sk.passive ? sk.id : undefined,
          desc: sk.desc,
        }));
        tierNodeIds.push(id);
      }
      if (tierNodeIds.length) previousTier = tierNodeIds[tierNodeIds.length - 1];
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
  const lvl = levelForTier(node.tier);
  if (u.level < lvl) return `Requires Sobriety ${lvl}`;
  if (u.skillPoints < node.cost) return `Needs ${node.cost} skill point${node.cost > 1 ? 's' : ''}`;
  for (const req of node.requires ?? []) {
    if (!u.unlockedNodes.includes(req)) {
      const rn = treeFor(u).find((n) => n.id === req);
      return `Requires ${rn?.name ?? req}`;
    }
  }
  return null;
}
