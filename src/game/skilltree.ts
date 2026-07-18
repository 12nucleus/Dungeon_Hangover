// ─────────────────────────────────────────────────────────────
// Skill trees — per-class unlock graphs (BG3-style): 2 branches ×
// 3 tiers, tier costs 1/1/2 skill points (earned on level-up).
// Nodes either UNLOCK a skill (added to knownSkills) or grant a
// permanent PASSIVE. Pure data + validation; engine applies them.
// ─────────────────────────────────────────────────────────────
import type { Unit } from './types';

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

export const SKILL_TREES: Record<'fighter' | 'wizard' | 'cleric', SkillNode[]> = {
  fighter: [
    // ── Weaponmaster ──
    N({ id: 'f_wm1', name: 'Power Strike', icon: '💥', branch: 'Weaponmaster', tier: 1, cost: 1, unlockSkill: 'power_strike', desc: 'Unlock: a crushing blow, 3d6+3 slashing (CD 2).' }),
    N({ id: 'f_wm2', name: 'Brutal Training', icon: '💪', branch: 'Weaponmaster', tier: 2, cost: 1, requires: ['f_wm1'], passive: { stat: 'str', amount: 2 }, desc: 'Passive: +2 Strength.' }),
    N({ id: 'f_wm3', name: 'Whirlwind', icon: '🌪️', branch: 'Weaponmaster', tier: 3, cost: 2, requires: ['f_wm2'], unlockSkill: 'whirlwind', desc: 'Unlock: spin attack, 2d6+3 to all adjacent enemies (CD 3).' }),
    // ── Guardian ──
    N({ id: 'f_gd1', name: 'Shield Wall', icon: '🛡️', branch: 'Guardian', tier: 1, cost: 1, passive: { stat: 'ac', amount: 2 }, desc: 'Passive: +2 AC.' }),
    N({ id: 'f_gd2', name: 'Second Wind', icon: '❤️‍🔥', branch: 'Guardian', tier: 2, cost: 1, requires: ['f_gd1'], unlockSkill: 'second_wind', desc: 'Unlock: bonus-action self heal 1d10+5 (CD 3).' }),
    N({ id: 'f_gd3', name: 'Veteran Hide', icon: '🪖', branch: 'Guardian', tier: 3, cost: 2, requires: ['f_gd2'], passive: { stat: 'maxHp', amount: 10 }, desc: 'Passive: +10 max HP.' }),
  ],
  wizard: [
    // ── Evocation ──
    N({ id: 'w_ev1', name: 'Ice Lance', icon: '🧊', branch: 'Evocation', tier: 1, cost: 1, unlockSkill: 'ice_lance', desc: 'Unlock: 4d6 cold bolt; failed CON save → Slowed (CD 2).' }),
    N({ id: 'w_ev2', name: 'Sharpened Mind', icon: '🧠', branch: 'Evocation', tier: 2, cost: 1, requires: ['w_ev1'], passive: { stat: 'int', amount: 2 }, desc: 'Passive: +2 Intelligence.' }),
    N({ id: 'w_ev3', name: 'Chain Lightning', icon: '⚡', branch: 'Evocation', tier: 3, cost: 2, requires: ['w_ev2'], unlockSkill: 'chain_lightning', desc: 'Unlock: 3d8+3 force bolt (CD 3).' }),
    // ── Warding ──
    N({ id: 'w_wd1', name: 'Toughness', icon: '🫀', branch: 'Warding', tier: 1, cost: 1, passive: { stat: 'maxHp', amount: 8 }, desc: 'Passive: +8 max HP.' }),
    N({ id: 'w_wd2', name: 'Arcane Shield', icon: '🔷', branch: 'Warding', tier: 2, cost: 1, requires: ['w_wd1'], unlockSkill: 'arcane_shield', desc: 'Unlock: bonus action, +2 AC for 3 rounds (CD 3).' }),
    N({ id: 'w_wd3', name: 'Iron Will', icon: '🏋️', branch: 'Warding', tier: 3, cost: 2, requires: ['w_wd2'], passive: { stat: 'con', amount: 2 }, desc: 'Passive: +2 Constitution.' }),
  ],
  cleric: [
    // ── Life ──
    N({ id: 'c_lf1', name: 'Healing Word', icon: '💬', branch: 'Life', tier: 1, cost: 1, unlockSkill: 'healing_word', desc: 'Unlock: bonus-action ranged heal 1d8+4.' }),
    N({ id: 'c_lf2', name: 'Deep Faith', icon: '🕊️', branch: 'Life', tier: 2, cost: 1, requires: ['c_lf1'], passive: { stat: 'wis', amount: 2 }, desc: 'Passive: +2 Wisdom.' }),
    N({ id: 'c_lf3', name: 'Mass Heal', icon: '🌈', branch: 'Life', tier: 3, cost: 2, requires: ['c_lf2'], unlockSkill: 'mass_heal', desc: 'Unlock: heal ALL allies 1d8+4 (CD 3).' }),
    // ── War ──
    N({ id: 'c_wr1', name: 'Blessed Plate', icon: '⛨', branch: 'War', tier: 1, cost: 1, passive: { stat: 'ac', amount: 1 }, desc: 'Passive: +1 AC.' }),
    N({ id: 'c_wr2', name: 'Guiding Bolt', icon: '🌠', branch: 'War', tier: 2, cost: 1, requires: ['c_wr1'], unlockSkill: 'guiding_bolt', desc: 'Unlock: 4d6 radiant bolt (CD 1).' }),
    N({ id: 'c_wr3', name: 'War Vigor', icon: '🎖️', branch: 'War', tier: 3, cost: 2, requires: ['c_wr2'], passive: { stat: 'maxHp', amount: 10 }, desc: 'Passive: +10 max HP.' }),
  ],
};

export function treeFor(u: Unit): SkillNode[] {
  return (SKILL_TREES as Record<string, SkillNode[]>)[u.klass] ?? [];
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
