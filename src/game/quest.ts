// ─────────────────────────────────────────────────────────────
// Quest system — definitions + a simple state machine.
// Pure data + logic; the engine drives the state transitions
// (start, progress, complete) and grants rewards.
//
// Tone: Dungeon Crawler Carl — absurd, situational, snarky.
// ─────────────────────────────────────────────────────────────

export type QuestStage = 'not_started' | 'accepted' | 'in_progress' | 'completed' | 'failed';

export interface QuestDef {
  id: string;
  name: string;
  /** the NPC who gives this quest ('' = started by an interactable, not an NPC) */
  giverNpcId: string;
  /** short description shown in the quest log */
  desc: string;
  /** the item the player must find/loot to progress */
  requiredItemId?: string;
  /** the item(s) granted on completion */
  rewardItemIds: string[];
  /** the dialogue node to show when the player returns without the required item */
  waitingNode: string;
  /** the dialogue node to show when the player returns WITH the required item */
  hasItemNode: string;
  /** the dialogue node to show after the quest is completed */
  doneNode: string;
  /** dialogue node when the quest has FAILED (e.g. the well ate the finger) */
  failedNode?: string;

  // ── floor 50 additions ──
  /** gold granted on completion (alongside rewardItemIds) */
  rewardGold?: number;
  /** experience granted on completion */
  xpReward?: number;
  /** hidden quests never appear in the log until started */
  hidden?: boolean;
}

export interface QuestState {
  id: string;
  stage: QuestStage;
}

// ══════════════════════════════════════════════════════════════
// THE HERMIT'S FINGER — the Hermit's quest.
// Kill "Baron Gnaw" (the Boss Rat), loot the severed finger,
// return it. Reward: the starting equipment set.
// ══════════════════════════════════════════════════════════════
export const QUEST_HERMIT_FINGER: QuestDef = {
  id: 'hermit_finger',
  name: "The Hermit's Finger",
  giverNpcId: 'hermit',
  desc: "The Hermit wants his finger back — wedding ring and all. The Boss Rat keeps it on a little bone pedestal. Reward: his spare equipment, 5 gold, and a potion.",
  requiredItemId: 'severed_finger',
  rewardItemIds: ['tattered_cloak', 'sturdy_boots', 'leather_belt', 'potion'],
  rewardGold: 5,
  xpReward: 100,
  waitingNode: 'waiting',
  hasItemNode: 'has_finger',
  doneNode: 'done',
  failedNode: 'failed',
};

// ══════════════════════════════════════════════════════════════
// SIDE QUEST 1 — THE OTHER HERMIT (hidden, auto-completes on talk)
// ══════════════════════════════════════════════════════════════
export const QUEST_OTHER_HERMIT: QuestDef = {
  id: 'other_hermit_quest',
  name: 'The Other Hermit',
  giverNpcId: 'other_hermit',
  desc: 'A second hermit, behind the mushroom circle. He gives you the Hermit\'s Ring and a warning: trust no one. Not even yourself.',
  rewardItemIds: ['hermits_ring'],
  rewardGold: 20,
  xpReward: 50,
  hidden: true,
  waitingNode: 'intro',
  hasItemNode: 'intro',
  doneNode: 'done',
};

// ══════════════════════════════════════════════════════════════
// SIDE QUEST 2 — CURSED GOLD (started by the vault, cured by holy water)
// ══════════════════════════════════════════════════════════════
export const QUEST_CURSED_GOLD: QuestDef = {
  id: 'cursed_gold',
  name: 'Cursed Gold',
  giverNpcId: '',
  desc: 'The vault gold is cursed. Your loot is worse for it. Holy water breaks the curse — and the vault\'s saint pays you back.',
  rewardItemIds: ['blessed_penny'],
  xpReward: 50,
  hidden: true,
  waitingNode: '',
  hasItemNode: '',
  doneNode: '',
};

// ══════════════════════════════════════════════════════════════
// SIDE QUEST 3 — THE SOAP CONUNDRUM (Scrag's gate)
// ══════════════════════════════════════════════════════════════
export const QUEST_SOAP_CONUNDRUM: QuestDef = {
  id: 'soap_conundrum',
  name: 'The Soap Conundrum',
  giverNpcId: 'scrag',
  desc: "Scrag won't open the door without soap. Find soap in the pipes (Room 8), or charm, or break the door down.",
  rewardItemIds: [],
  xpReward: 50,
  hidden: true,
  waitingNode: 'intro',
  hasItemNode: 'intro',
  doneNode: 'done',
};

/** All registered quests, keyed by id. */
export const QUESTS: Record<string, QuestDef> = {
  hermit_finger: QUEST_HERMIT_FINGER,
  other_hermit_quest: QUEST_OTHER_HERMIT,
  cursed_gold: QUEST_CURSED_GOLD,
  soap_conundrum: QUEST_SOAP_CONUNDRUM,
};

/** A per-game quest log: quest id → state. */
export class QuestLog {
  private states = new Map<string, QuestState>();

  get(questId: string): QuestState | undefined {
    return this.states.get(questId);
  }

  start(questId: string): QuestState {
    const qs: QuestState = { id: questId, stage: 'accepted' };
    this.states.set(questId, qs);
    return qs;
  }

  progress(questId: string): QuestState | undefined {
    const qs = this.states.get(questId);
    if (!qs) return undefined;
    if (qs.stage === 'accepted') qs.stage = 'in_progress';
    return qs;
  }

  complete(questId: string): QuestState | undefined {
    const qs = this.states.get(questId);
    if (!qs) return undefined;
    qs.stage = 'completed';
    return qs;
  }

  /** mark a quest failed (e.g. dropping the finger in the well) */
  fail(questId: string): QuestState | undefined {
    const qs = this.states.get(questId);
    if (!qs) return undefined;
    qs.stage = 'failed';
    return qs;
  }

  /** every quest with its current stage (for the quest-log UI) */
  all(): { id: string; name: string; stage: QuestStage; desc: string }[] {
    const out: { id: string; name: string; stage: QuestStage; desc: string }[] = [];
    for (const q of Object.values(QUESTS)) {
      const qs = this.states.get(q.id);
      if (!qs || qs.stage === 'not_started') {
        if (q.hidden) continue;               // hidden quests stay hidden until started
        out.push({ id: q.id, name: q.name, stage: 'not_started', desc: q.desc });
        continue;
      }
      out.push({ id: q.id, name: q.name, stage: qs.stage, desc: q.desc });
    }
    return out;
  }

  isActive(questId: string): boolean {
    const qs = this.states.get(questId);
    return !!qs && (qs.stage === 'accepted' || qs.stage === 'in_progress');
  }

  isFailed(questId: string): boolean {
    const qs = this.states.get(questId);
    return !!qs && qs.stage === 'failed';
  }

  /** restore the full quest state from a save (replaces current state) */
  load(states: QuestState[]) {
    this.states.clear();
    for (const s of states) this.states.set(s.id, { id: s.id, stage: s.stage });
  }

  /** serialize all current quest states (for saving) */
  statesEntries(): QuestState[] {
    return [...this.states.values()].map((s) => ({ id: s.id, stage: s.stage }));
  }

  isCompleted(questId: string): boolean {
    const qs = this.states.get(questId);
    return !!qs && qs.stage === 'completed';
  }

  /** which dialogue node should the NPC show when the player talks to them? */
  nodeFor(npcId: string, hasRequiredItem: boolean): string | null {
    for (const q of Object.values(QUESTS)) {
      if (!q.giverNpcId || q.giverNpcId !== npcId) continue;
      const qs = this.states.get(q.id);
      if (!qs || qs.stage === 'not_started') continue;
      if (qs.stage === 'completed') return q.doneNode;
      if (qs.stage === 'failed') return q.failedNode ?? q.waitingNode;
      if (qs.stage === 'accepted' || qs.stage === 'in_progress') {
        return hasRequiredItem ? q.hasItemNode : q.waitingNode;
      }
    }
    return null;  // no active quest → use the NPC's entry node
  }
}
