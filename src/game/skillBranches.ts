import type { ClassId, SkillDef } from './types';

export interface ClassBranchDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Number of skills assigned to this branch in each ten-skill tier. */
  tierShape: [number, number, number];
}

/**
 * Branch identities are authored separately from the large skill registry.
 * The tierShape distributes the existing ordered content while the override
 * table anchors signature skills to their authored branch identity.
 */
export const CLASS_BRANCHES: Record<ClassId, ClassBranchDef[]> = {
  bar_bouncer: [
    { id: 'lockdown', name: 'Lockdown', icon: '⛓️', color: '#d7a83e', tierShape: [4, 3, 3] },
    { id: 'shove', name: 'Shove', icon: '🫸', color: '#e8794f', tierShape: [3, 4, 3] },
    { id: 'iron_wall', name: 'Iron Wall', icon: '🛡️', color: '#93a4b8', tierShape: [3, 3, 4] },
  ],
  gutter_rogue: [
    { id: 'bleed', name: 'Bleed', icon: '🩸', color: '#d24a4a', tierShape: [4, 3, 3] },
    { id: 'shadow', name: 'Shadow', icon: '🌑', color: '#a78bfa', tierShape: [3, 4, 3] },
    { id: 'dirty_tricks', name: 'Dirty Tricks', icon: '🪤', color: '#c9a227', tierShape: [3, 3, 4] },
  ],
  karaoke_bard: [
    { id: 'inspiration', name: 'Inspiration', icon: '✨', color: '#f5c542', tierShape: [4, 3, 3] },
    { id: 'dissonance', name: 'Dissonance', icon: '🎵', color: '#c084fc', tierShape: [3, 4, 3] },
    { id: 'stagecraft', name: 'Stagecraft', icon: '🎭', color: '#ff7a9a', tierShape: [3, 3, 4] },
  ],
  sommelier: [
    { id: 'appraisal', name: 'Appraisal', icon: '🔎', color: '#7dd3fc', tierShape: [4, 3, 3] },
    { id: 'pairing', name: 'Pairing', icon: '🍇', color: '#d24a1f', tierShape: [3, 4, 3] },
    { id: 'vintage', name: 'Vintage', icon: '🍷', color: '#a855f7', tierShape: [3, 3, 4] },
  ],
  barista: [
    { id: 'tempo', name: 'Tempo', icon: '⚡', color: '#facc15', tierShape: [4, 3, 3] },
    { id: 'heat', name: 'Heat', icon: '🔥', color: '#fb923c', tierShape: [3, 4, 3] },
    { id: 'precision', name: 'Precision', icon: '🎯', color: '#60a5fa', tierShape: [3, 3, 4] },
  ],
  accountant: [
    { id: 'audit', name: 'Audit', icon: '🧾', color: '#7dd3fc', tierShape: [4, 3, 3] },
    { id: 'debt', name: 'Debt', icon: '📉', color: '#d24a1f', tierShape: [3, 4, 3] },
    { id: 'profit', name: 'Profit', icon: '🪙', color: '#c9a227', tierShape: [3, 3, 4] },
  ],
  dentist: [
    { id: 'drill', name: 'Drill', icon: '🦷', color: '#7dd3fc', tierShape: [4, 3, 3] },
    { id: 'bleed', name: 'Bleed', icon: '🩸', color: '#d24a4a', tierShape: [3, 4, 3] },
    { id: 'novocaine', name: 'Novocaine', icon: '💉', color: '#93c5fd', tierShape: [3, 3, 4] },
  ],
  plumber: [
    { id: 'pressure', name: 'Pressure', icon: '💧', color: '#38bdf8', tierShape: [4, 3, 3] },
    { id: 'hazards', name: 'Hazards', icon: '🧪', color: '#84cc16', tierShape: [3, 4, 3] },
    { id: 'wrench', name: 'Wrenchwork', icon: '🔧', color: '#a3a3a3', tierShape: [3, 3, 4] },
  ],
  wedding_planner: [
    { id: 'formation', name: 'Formation', icon: '📋', color: '#f5c542', tierShape: [4, 3, 3] },
    { id: 'ceremony', name: 'Ceremony', icon: '💒', color: '#f9a8d4', tierShape: [3, 4, 3] },
    { id: 'crisis', name: 'Crisis Plan', icon: '🧯', color: '#fb923c', tierShape: [3, 3, 4] },
  ],
  tabloid_reporter: [
    { id: 'expose', name: 'Expose', icon: '📰', color: '#7dd3fc', tierShape: [4, 3, 3] },
    { id: 'panic', name: 'Panic', icon: '😱', color: '#c084fc', tierShape: [3, 4, 3] },
    { id: 'scoop', name: 'Scoop', icon: '📸', color: '#facc15', tierShape: [3, 3, 4] },
  ],
  haunted_chef: [
    { id: 'banquet', name: 'Banquet', icon: '🍲', color: '#84cc16', tierShape: [4, 3, 3] },
    { id: 'weaponized', name: 'Weaponized Food', icon: '🍳', color: '#fb923c', tierShape: [3, 4, 3] },
    { id: 'survival', name: 'Survival Kitchen', icon: '🥄', color: '#f5c542', tierShape: [3, 3, 4] },
  ],
  shaman: [
    { id: 'spirits', name: 'Spirits', icon: '🥁', color: '#60a5fa', tierShape: [4, 3, 3] },
    { id: 'curses', name: 'Curses', icon: '🔮', color: '#a78bfa', tierShape: [3, 4, 3] },
    { id: 'totems', name: 'Totems', icon: '🪵', color: '#84cc16', tierShape: [3, 3, 4] },
  ],
  zoologist: [
    { id: 'taming', name: 'Taming', icon: '🐾', color: '#84cc16', tierShape: [4, 3, 3] },
    { id: 'forms', name: 'Forms', icon: '🐺', color: '#a3a3a3', tierShape: [3, 4, 3] },
    { id: 'pack', name: 'Pack Tactics', icon: '🦴', color: '#facc15', tierShape: [3, 3, 4] },
  ],
  insurance_adjuster: [
    { id: 'risk', name: 'Risk', icon: '📊', color: '#7dd3fc', tierShape: [4, 3, 3] },
    { id: 'fine_print', name: 'Fine Print', icon: '📜', color: '#c084fc', tierShape: [3, 4, 3] },
    { id: 'coverage', name: 'Coverage', icon: '🛡️', color: '#facc15', tierShape: [3, 3, 4] },
  ],
  mortician: [
    { id: 'embalm', name: 'Embalm', icon: '🕯️', color: '#a3a3a3', tierShape: [4, 3, 3] },
    { id: 'reanimate', name: 'Reanimate', icon: '💀', color: '#84cc16', tierShape: [3, 4, 3] },
    { id: 'last_rites', name: 'Last Rites', icon: '⚰️', color: '#a78bfa', tierShape: [3, 3, 4] },
  ],
};

export interface SkillBranchAssignment {
  classId: ClassId;
  branch: ClassBranchDef;
  tier: 1 | 2 | 3 | 4 | 5;
  indexInBranch: number;
}

/** Hand-authored anchors keep the most important early paths semantically stable. */
export const SKILL_BRANCH_OVERRIDES: Record<string, string> = {
  velvet_rope: 'lockdown', stool_smash: 'shove', bouncer_stance: 'iron_wall',
  cheap_shot: 'bleed', shadow_step: 'shadow', slick_floor: 'dirty_tricks',
  power_chord: 'dissonance', encore: 'inspiration', stage_fright: 'stagecraft',
  vintage: 'appraisal', pairing: 'pairing', cork_popper: 'vintage',
  double_shot: 'tempo', over_heat: 'heat', critical_brew: 'precision',
};

export function classBranches(classId: string): ClassBranchDef[] {
  return CLASS_BRANCHES[classId as ClassId] ?? [];
}

/** Assign ordered tier content to authored branch identities. */
export function assignSkillBranches(classId: string, skills: SkillDef[]): Map<string, SkillBranchAssignment> {
  const branches = classBranches(classId);
  const result = new Map<string, SkillBranchAssignment>();
  for (const tier of [1, 2, 3, 4, 5] as const) {
    const tierSkills = skills.filter((skill) => (skill.tier ?? 1) === tier && !skill.capstone);
    const assigned = new Set<string>();
    const counts = new Map<string, number>();
    for (const skill of tierSkills) {
      const override = SKILL_BRANCH_OVERRIDES[skill.id];
      const branch = override ? branches.find((candidate) => candidate.id === override) : undefined;
      if (branch) {
        const indexInBranch = counts.get(branch.id) ?? 0;
        result.set(skill.id, { classId: classId as ClassId, branch, tier, indexInBranch });
        counts.set(branch.id, indexInBranch + 1);
        assigned.add(skill.id);
      }
    }
    branches.forEach((branch, branchIndex) => {
      const targetCount = branch.tierShape[branchIndex];
      for (const skill of tierSkills) {
        if (assigned.has(skill.id) || (counts.get(branch.id) ?? 0) >= targetCount) continue;
        const indexInBranch = counts.get(branch.id) ?? 0;
        result.set(skill.id, { classId: classId as ClassId, branch, tier, indexInBranch });
        counts.set(branch.id, indexInBranch + 1);
        assigned.add(skill.id);
      }
    });
    for (const skill of tierSkills) {
      if (assigned.has(skill.id)) continue;
      const branch = branches.reduce((best, candidate) => (counts.get(candidate.id) ?? 0) < (counts.get(best.id) ?? 0) ? candidate : best, branches[0]);
      const indexInBranch = counts.get(branch.id) ?? 0;
      result.set(skill.id, { classId: classId as ClassId, branch, tier, indexInBranch });
      counts.set(branch.id, indexInBranch + 1);
    }
  }
  return result;
}
