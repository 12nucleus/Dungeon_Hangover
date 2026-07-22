// ─────────────────────────────────────────────────────────────
// NPC system — definitions + dialogue trees for hand-authored
// NPCs. Pure data + a tiny dialogue runner; the engine wires the
// click-to-talk interaction and renders the overlay.
//
// Tone: Dungeon Crawler Carl — absurd, situational, snarky.
// Never a generic gag; the comedy comes from the situation.
// ─────────────────────────────────────────────────────────────
import type { CharacterScheme } from './types';

export interface DialogueNode {
  /** the line the NPC says */
  text: string;
  /** optional narrator caption (shown above the dialogue, italic) */
  caption?: string;
  /** player response choices; each leads to another node id or ends the convo */
  choices?: { label: string; next?: string; action?: DialogueAction }[];
  /** if set, this node triggers an action (give item, start quest, etc.) */
  action?: DialogueAction;
}

export type DialogueAction =
  | { type: 'giveItem'; itemId: string }
  | { type: 'startQuest'; questId: string }
  | { type: 'completeQuest'; questId: string }
  | { type: 'endConvo' };

export interface NPCDef {
  id: string;
  name: string;
  title: string;
  scheme: CharacterScheme;
  /** dialogue tree: node id → node */
  dialogue: Record<string, DialogueNode>;
  /** the first node shown when you talk to the NPC */
  entryNode: string;
}

// ══════════════════════════════════════════════════════════════
// OLD MERV — the hermit in the side-chamber off spawn.
// A rat gnawed off his ring finger. He wants it back.
// Reward: the Toeless Boots.
// ══════════════════════════════════════════════════════════════
export const HERMIT_MERV: NPCDef = {
  id: 'hermit_merv',
  name: 'Old Merv',
  title: 'Cave Hermit',
  scheme: {
    skin: 0xb8a888, cloth: 0x4a3a2a, accent: 0x2a2a2a, hair: 0xc0c0c0,
    hood: false, style: 'normal', kind: 'barkeep', // reuses the hunched barkeep silhouette
  },
  entryNode: 'intro',
  dialogue: {
    intro: {
      caption: 'A hunched figure in a side-chamber, talking to his own hand.',
      text: "You're not a rat. That's a good start. I'm Merv. I live here. Don't touch the moss — it's my friend. We had a whole thing.",
      choices: [
        { label: 'What happened to your hand?', next: 'finger_story' },
        { label: 'I should go.', next: 'bye' },
      ],
    },
    finger_story: {
      text: "See, a rat — a big one, had the audacity of a baron — gnawed off my ring finger. The one with my Agnes's ring still on it. I'd like it back. The finger, the ring, the whole finger.",
      choices: [
        { label: 'I\'ll find your finger. (Accept)', next: 'accept', action: { type: 'startQuest', questId: 'hermit_finger' } },
        { label: 'That\'s disgusting. No.', next: 'refuse' },
      ],
    },
    accept: {
      text: "Good. Good. The rat's somewhere in these caves. Big one. Calls himself Baron Gnaw, or so I imagine rats do. Bring me my finger and I'll give you these boots. Don't ask about the toes. The toes are a whole other story.",
      action: { type: 'giveItem', itemId: 'stupid_shirt' },
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    refuse: {
      text: "Fine. Walk around fingerless, see if I care. I don't. The moss doesn't judge.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    bye: {
      text: "Off you go. Mind the stalactite by the third turn — it drips resentment.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    // ── return states (after accepting the quest) ──
    waiting: {
      text: "You don't have my finger. I can tell. I can always tell. The moss agrees with me.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    has_finger: {
      caption: 'Merv\'s eyes go wide — well, wider.',
      text: "You found it! You found my finger! And the ring — Agnes's ring! Give it here, give it here. Here, take the boots. They're toeless. Don't ask. Just... don't ask.",
      action: { type: 'completeQuest', questId: 'hermit_finger' },
      choices: [{ label: '[Take the Toeless Boots]', action: { type: 'endConvo' } }],
    },
    done: {
      text: "The finger's back. The ring's back. I'm whole. Mostly. The moss says thank you. I don't, but the moss does.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
  },
};

/** All registered NPCs, keyed by id. */
export const NPCS: Record<string, NPCDef> = {
  hermit_merv: HERMIT_MERV,
};
