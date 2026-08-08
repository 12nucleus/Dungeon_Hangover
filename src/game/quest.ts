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

// ══════════════════════════════════════════════════════════════
// FLOOR 49 — THE FUNGAL GROTTO quests
// ══════════════════════════════════════════════════════════════

// MAIN QUEST — THROUGH THE GROTTO (started on arrival, completed at the exit)
export const QUEST_THROUGH_GROTTO: QuestDef = {
  id: 'through_grotto',
  name: 'Through the Grotto',
  giverNpcId: '',
  desc: 'Navigate the Fungal Grotto: cross the spore fields, defeat (or outsmart) the Spore Mother, and find the staircase behind the waterfall. The Spire is dreaming — keep climbing.',
  rewardItemIds: [],
  rewardGold: 50,
  xpReward: 150,
  waitingNode: '',
  hasItemNode: '',
  doneNode: '',
};

// SIDE QUEST 1 — MYCOLOGIST'S REQUEST (Hermit Shroom, r4)
export const QUEST_MYCOLOGIST: QuestDef = {
  id: 'mycologist_request',
  name: "The Mycologist's Request",
  giverNpcId: '',
  desc: 'The Hermit Shroom wants 5 Glowing Mushrooms — for science, it insists. Bring them back to the pool.',
  requiredItemId: 'glowing_mushroom',
  rewardItemIds: ['moon_cap', 'glowing_spore'],
  rewardGold: 25,
  xpReward: 100,
  waitingNode: '',
  hasItemNode: '',
  doneNode: '',
};

// SIDE QUEST 2 — THE MUSHROOM CHILD (offering bowl, r5)
export const QUEST_MUSHROOM_CHILD: QuestDef = {
  id: 'mushroom_child',
  name: 'The Mushroom Child',
  giverNpcId: '',
  desc: 'Seven mushrooms, seven colors, and a small mushroom that wants a parent. Place a Glowing Mushroom in the offering bowl — you are a mushroom parent now.',
  rewardItemIds: [],
  rewardGold: 0,
  xpReward: 75,
  waitingNode: '',
  hasItemNode: '',
  doneNode: '',
};

// SIDE QUEST 3 — SPORE MADNESS (breathe deep, r2; finish at the shrine in r3)
// The narrator DARES you. You take the dare. Of course you take the dare.
export const QUEST_SPORE_MADNESS: QuestDef = {
  id: 'spore_madness',
  name: 'Spore Madness',
  giverNpcId: '',
  desc: 'The spores are everywhere. You can see them. You can breathe them. You probably should not breathe them. Breathe them anyway. Then let the hallucination guide you to the hidden shrine.',
  rewardItemIds: ['glowing_spore'],
  rewardGold: 10,
  xpReward: 100,
  waitingNode: '',
  hasItemNode: '',
  doneNode: '',
};

// SIDE QUEST 4 — THE FROG TONGUE SHORTAGE (Myke the Spore Merchant, r1)
// The supply chain is a frog. The frog is no longer supplying.
export const QUEST_FROG_TONGUE: QuestDef = {
  id: 'frog_tongue_shortage',
  name: 'The Frog Tongue Shortage',
  giverNpcId: 'spore_merchant',
  desc: 'Myke the Spore Merchant had a supplier. The supplier was a frog. The frog is now a problem with a tongue. Bring Myke the Giant Frog Tongue and 3 Cave Fish Meat and he will make it worth your while. He swears. He swears on his mother. His mother is a mushroom. She cannot hear him.',
  requiredItemId: 'frog_tongue',
  rewardItemIds: ['mycologist_satchel'],
  rewardGold: 40,
  xpReward: 100,
  waitingNode: '',
  hasItemNode: '',
  doneNode: '',
};

// SIDE QUEST 5 — SEVEN IS A PARTY (the circle, r5; the cap is in the rot tree, r11)
// The circle is incomplete. The circle is SAD. Fix it. For the circle.
export const QUEST_SEVEN_IS_A_PARTY: QuestDef = {
  id: 'seven_is_a_party',
  name: 'Seven Is A Party',
  giverNpcId: '',
  desc: 'The mushroom circle has seven places and six mushrooms. Someone (a hermit. a mushroom hermit. a HERMIT MUSHROOM) stole the seventh. Find The Seventh Cap in the hollow of the rotting tree and put it back. The circle will throw a party. You are invited. You were ALWAYS invited.',
  requiredItemId: 'seventh_cap',
  rewardItemIds: ['giant_cap'],
  rewardGold: 20,
  xpReward: 100,
  waitingNode: '',
  hasItemNode: '',
  doneNode: '',
};

/** All registered quests, keyed by id. */
export const QUESTS: Record<string, QuestDef> = {
  hermit_finger: QUEST_HERMIT_FINGER,
  other_hermit_quest: QUEST_OTHER_HERMIT,
  cursed_gold: QUEST_CURSED_GOLD,
  soap_conundrum: QUEST_SOAP_CONUNDRUM,
  through_grotto: QUEST_THROUGH_GROTTO,
  mycologist_request: QUEST_MYCOLOGIST,
  mushroom_child: QUEST_MUSHROOM_CHILD,
  spore_madness: QUEST_SPORE_MADNESS,
  frog_tongue_shortage: QUEST_FROG_TONGUE,
  seven_is_a_party: QUEST_SEVEN_IS_A_PARTY,
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
