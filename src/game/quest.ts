// ─────────────────────────────────────────────────────────────
// Quest system — definitions + a simple state machine.
// Pure data + logic; the engine drives the state transitions
// (start, progress, complete) and grants rewards.
//
// Tone: Dungeon Crawler Carl — absurd, situational, snarky.
// ─────────────────────────────────────────────────────────────

export type QuestStage = 'not_started' | 'accepted' | 'in_progress' | 'completed';

export interface QuestDef {
  id: string;
  name: string;
  /** the NPC who gives this quest */
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
}

export interface QuestState {
  id: string;
  stage: QuestStage;
}

// ══════════════════════════════════════════════════════════════
// THE HERMIT'S FINGER — Old Merv's quest.
// Kill "Baron Gnaw" (a named rat), loot the severed finger,
// return it to Merv. Reward: the Toeless Boots.
// ══════════════════════════════════════════════════════════════
export const QUEST_HERMIT_FINGER: QuestDef = {
  id: 'hermit_finger',
  name: "The Hermit's Finger",
  giverNpcId: 'hermit_merv',
  desc: "Old Merv's ring finger was gnawed off by a rat called Baron Gnaw. Find the rat, loot the finger, return it to Merv. Reward: the Toeless Boots.",
  requiredItemId: 'severed_finger',
  rewardItemIds: ['toeless_boots'],
  waitingNode: 'waiting',
  hasItemNode: 'has_finger',
  doneNode: 'done',
};

/** All registered quests, keyed by id. */
export const QUESTS: Record<string, QuestDef> = {
  hermit_finger: QUEST_HERMIT_FINGER,
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

  isActive(questId: string): boolean {
    const qs = this.states.get(questId);
    return !!qs && (qs.stage === 'accepted' || qs.stage === 'in_progress');
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
      if (q.giverNpcId !== npcId) continue;
      const qs = this.states.get(q.id);
      if (!qs || qs.stage === 'not_started') continue;
      if (qs.stage === 'completed') return q.doneNode;
      if (qs.stage === 'accepted' || qs.stage === 'in_progress') {
        return hasRequiredItem ? q.hasItemNode : q.waitingNode;
      }
    }
    return null;  // no active quest → use the NPC's entry node
  }
}
