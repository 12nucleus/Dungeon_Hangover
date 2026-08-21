import type { Unit } from './types';
import { CLASS_SKILLS } from './classSkills';
import { classById } from './classes';
import { assignSkillBranches, classBranches } from './skillBranches';
import { comboForSkill } from './skillCombos';
import { MIN_LEVEL_BY_TIER } from './stats';

export interface SkillNode {
  id: string;
  name: string;
  icon: string;
  desc: string;
  branch: string;
  branchId: string;
  branchColor: string;
  classId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  cost: number;
  levelReq: number;
  requires?: string[];
  requiresAll?: string[];
  requiresAny?: string[];
  unlockSkill?: string;
  passiveSkill?: string;
  passive?: { stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'maxHp' | 'move' | 'ac'; amount: number };
  comboIds?: string[];
  capstone?: boolean;
}

const TIER_COST: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };

export function nodeCostForTier(tier: 1 | 2 | 3 | 4 | 5, capstone = false): number {
  return capstone ? 5 : TIER_COST[tier];
}

function nodeId(classId: string, tier: number, skillId: string): string {
  // Keep the original id shape so existing saves retain their purchases.
  return `${classId}_t${tier}_${skillId}`;
}

export function buildClassTree(classes: string[] | undefined): SkillNode[] {
  const nodes: SkillNode[] = [];
  for (const cid of (classes ?? []).slice(0, 2)) {
    const classDef = classById(cid);
    const pool = CLASS_SKILLS[cid] ?? [];
    if (!classDef || !pool.length) continue;
    const assignments = assignSkillBranches(cid, pool);
    const previousByBranch = new Map<string, string[]>();
    const tierFiveByBranch = new Map<string, string[]>();

    for (const tier of [1, 2, 3, 4, 5] as const) {
      const tierSkills = pool.filter((skill) => (skill.tier ?? 1) === tier && !skill.capstone);
      const currentByBranch = new Map<string, string[]>();
      for (const skill of tierSkills) {
        const assignment = assignments.get(skill.id);
        const branch = assignment?.branch ?? classBranches(cid)[0];
        if (!branch) continue;
        const branchKey = `${cid}:${branch.id}`;
        const previous = previousByBranch.get(branchKey) ?? [];
        const id = nodeId(cid, tier, skill.id);
        const requiresAny = previous.length ? [...previous] : undefined;
        const node: SkillNode = {
          id,
          name: skill.name,
          icon: skill.icon,
          desc: skill.desc,
          branch: `${classDef.name} · ${branch.name}`,
          branchId: `${cid}:${branch.id}`,
          branchColor: branch.color,
          classId: cid,
          tier,
          cost: nodeCostForTier(tier),
          levelReq: MIN_LEVEL_BY_TIER[tier],
          requires: requiresAny,
          requiresAny,
          unlockSkill: skill.passive ? undefined : skill.id,
          passiveSkill: skill.passive ? skill.id : undefined,
          comboIds: comboForSkill(skill.id).map((combo) => combo.id),
        };
        nodes.push(node);
        currentByBranch.set(branchKey, [...(currentByBranch.get(branchKey) ?? []), id]);
        if (tier === 5) {
          const list = tierFiveByBranch.get(branchKey) ?? [];
          list.push(id);
          tierFiveByBranch.set(branchKey, list);
        }
      }
      for (const [key, ids] of currentByBranch) previousByBranch.set(key, ids);
    }

    // Mastery capstone: require the full Tier-5 column of the PRIMARY branch
    // (not every Tier-5 node in the class — that would cost ~95 skill points
    // and is unreachable before the level-50 cap). Specializing one branch to
    // its top row is a meaningful, affordable gate.
    const primaryKey = `${cid}:${classBranches(cid)[0]?.id ?? ''}`;
    const tierFiveIds = tierFiveByBranch.get(primaryKey) ?? [];
    const capstone = pool.find((skill) => skill.capstone);
    if (capstone && tierFiveIds.length) {
      const id = nodeId(cid, 5, capstone.id);
      nodes.push({
        id,
        name: capstone.name,
        icon: capstone.icon,
        desc: capstone.desc,
        branch: `${classDef.name} · Mastery`,
        branchId: `${cid}:mastery`,
        branchColor: '#f5c542',
        classId: cid,
        tier: 5,
        cost: nodeCostForTier(5, true),
        levelReq: MIN_LEVEL_BY_TIER[5],
        requires: tierFiveIds,
        requiresAll: tierFiveIds,
        unlockSkill: capstone.passive ? undefined : capstone.id,
        passiveSkill: capstone.passive ? capstone.id : undefined,
        comboIds: comboForSkill(capstone.id).map((combo) => combo.id),
        capstone: true,
      });
    }
  }
  return nodes;
}

export function treeFor(u: Unit): SkillNode[] {
  return buildClassTree(u.classes);
}

function nodeSatisfied(u: Unit, node: SkillNode): boolean {
  if (u.unlockedNodes.includes(node.id)) return true;
  // Creation skills are free Tier-1 mastery and must open their branch.
  const skillId = node.unlockSkill ?? node.passiveSkill;
  return node.tier === 1 && !!skillId && u.knownSkills.includes(skillId);
}

function missingNames(u: Unit, ids: string[], tree: SkillNode[]): string[] {
  return ids
    .filter((id) => {
      const node = tree.find((candidate) => candidate.id === id);
      return !node || !nodeSatisfied(u, node);
    })
    .map((id) => tree.find((node) => node.id === id)?.name ?? id);
}

/** null = unlockable now; otherwise the first actionable reason. */
export function canUnlock(u: Unit, node: SkillNode): string | null {
  if (u.unlockedNodes.includes(node.id) || nodeSatisfied(u, node)) return 'Already unlocked';
  if (!(u.classes ?? []).some((c) => c === node.classId)) return 'This skill belongs to another class.';
  if (u.level < node.levelReq) return `Requires level ${node.levelReq} (Tier ${node.tier}).`;
  if (u.skillPoints < node.cost) return `Needs ${node.cost} skill point${node.cost > 1 ? 's' : ''}`;
  const tree = treeFor(u);
  const allMissing = missingNames(u, node.requiresAll ?? [], tree);
  if (allMissing.length) return `Requires: ${allMissing.slice(0, 2).join(' + ')}${allMissing.length > 2 ? ` + ${allMissing.length - 2} more` : ''}`;
  const anyMissing = missingNames(u, node.requiresAny ?? [], tree);
  if ((node.requiresAny?.length ?? 0) > 0 && anyMissing.length === node.requiresAny!.length) {
    return `Requires one of: ${anyMissing.slice(0, 3).join(', ')}`;
  }
  return null;
}

export function validateSkillTree(classes: string[]): string[] {
  const tree = buildClassTree(classes);
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const node of tree) {
    if (ids.has(node.id)) issues.push(`${node.id}: duplicate node id`);
    ids.add(node.id);
    for (const requirement of node.requires ?? []) {
      if (!ids.has(requirement) && !tree.some((candidate) => candidate.id === requirement)) {
        issues.push(`${node.id}: missing prerequisite ${requirement}`);
      }
    }
    if (node.levelReq !== MIN_LEVEL_BY_TIER[node.tier]) issues.push(`${node.id}: tier level mismatch`);
    if (node.capstone && (node.requiresAll?.length ?? 0) < 3) issues.push(`${node.id}: capstone has too few mastery requirements`);
  }
  return issues;
}
