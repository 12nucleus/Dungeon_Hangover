// ─────────────────────────────────────────────────────────────
// NPC system — definitions + dialogue trees for hand-authored
// NPCs. Pure data + a tiny dialogue runner; the engine wires the
// click-to-talk interaction and renders the overlay.
//
// Floor 50 NPCs (bible: docs/dungeon_hangover_bible/floors/
// FLOOR_50_SEWER_CELLAR.md § NPCs): the Hermit, the Other Hermit,
// Goblin Guard "Scrag", and Gribnab the Soapy (parley only).
// ─────────────────────────────────────────────────────────────
import type { Ability, CharacterScheme } from './types';

export interface DialogueNode {
  /** the line the NPC says */
  text: string;
  /** optional narrator caption (shown above the dialogue, italic) */
  caption?: string;
  /** player response choices; each leads to another node id or ends the convo */
  choices?: { label: string; next?: string; action?: DialogueAction; actions?: DialogueAction[]; visibleIf?: ChoiceCondition }[];
  /** if set, this node triggers an action (give item, start quest, etc.) */
  action?: DialogueAction;
  /** multiple actions on one node (start + complete, takeItem + setFlag…) */
  actions?: DialogueAction[];
}

export type DialogueAction =
  | { type: 'giveItem'; itemId: string }
  | { type: 'takeItem'; itemId: string }
  | { type: 'startQuest'; questId: string }
  | { type: 'completeQuest'; questId: string }
  | { type: 'setFlag'; flag: string }
  | { type: 'gamble' }
  | { type: 'bossParley'; outcome: 'fight' | 'truce' }
  | { type: 'endConvo' };

/** gate a dialogue choice on inventory / flags / an ability check */
export interface ChoiceCondition {
  item?: string;
  flag?: string;
  notFlag?: string;
  ability?: { stat: Ability; min: number };
}

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
// THE HERMIT (Room 2) — quest giver. Cheerful, cryptic, kind, weird.
// Missing his LEFT ring finger. Straw beard. Rags. Always smiling.
// ══════════════════════════════════════════════════════════════
const hermitScheme: CharacterScheme = {
  skin: 0xb8a888, cloth: 0x6a5a3a, accent: 0x2a2a2a, hair: 0xd8c890,
  hood: false, style: 'normal', kind: 'barkeep', beard: true,
};

export const HERMIT: NPCDef = {
  id: 'hermit',
  name: 'The Hermit',
  title: 'Floor 50 Hermit',
  scheme: hermitScheme,
  entryNode: 'intro',
  dialogue: {
    intro: {
      caption: 'An old man in the next cell. He is missing a finger. He is smiling. This is not reassuring.',
      text: "Ah! You're awake! I was starting to think you'd sleep through the apocalypse. Again.",
      choices: [
        { label: 'Where am I? Why am I in my underwear?', next: 'where' },
        { label: 'I should go.', next: 'bye' },
      ],
    },
    where: {
      text: "You're in the Spire of Regret. Floor 50. The bottom. As for the underwear — that's between you and whatever you did last night. I don't judge. I can't. I have no eyebrows.",
      choices: [
        { label: 'What are you doing down here?', next: 'finger_story' },
        { label: 'I should go.', next: 'bye' },
      ],
    },
    finger_story: {
      text: "I need a favor. A rat took my finger. The big one, down the tunnel. It has a little bone pedestal — very tasteful, for a rat. The finger has my wedding ring on it. I want it back. I was married once. She left me. But the ring stays.",
      choices: [
        { label: 'You want me to fight a giant rat. For your finger.', next: 'accept', action: { type: 'startQuest', questId: 'hermit_finger' } },
        { label: "That's disgusting. No.", next: 'refuse' },
      ],
    },
    accept: {
      text: "I want you to fight a giant rat for my finger. Yes. I'll make it worth your while. I have things. Equipment. Knowledge. I know what's going on here. I know why you're at the bottom. I know why you're in your underwear. Well — I have theories about the underwear.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    refuse: {
      text: "Fine. Walk around fingerless, see if I care. I don't. The moss doesn't judge.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    bye: {
      text: 'Off you go. Mind the dark, the damp, and the things that squeak. Especially the things that squeak.',
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    // ── return states ──
    waiting: {
      text: "No finger yet, then? The rat's a slippery beast. It's been a century since anything slipped past it, but you've got the look of a man who's slipped past worse.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    has_finger: {
      caption: "The Hermit cries. The Hermit LAUGHS. The ring FITS. The ring ALWAYS fit.",
      text: "You did it! You beautiful, half-naked idiot. Here — take this.",
      action: { type: 'completeQuest', questId: 'hermit_finger' },
      choices: [{ label: '[Take the equipment]', next: 'spire_lore' }],
    },
    spire_lore: {
      text: "Now listen. This place — the Spire — it's alive. It grows around regret. You're at the bottom because your regrets are the freshest. The higher you go, the older the regrets. The worse they get. At the top — Floor 1 — there's something that's been trying to be good for a very long time. And failing. Every day. For ten thousand years.",
      choices: [
        { label: 'What is it?', next: 'what_is_it' },
        { label: '[Leave]', action: { type: 'endConvo' } },
      ],
    },
    what_is_it: {
      text: "I'll tell you when you get back down. If you get back down. Now go. And Greg? The goblin at the door? He wants soap. Find the soap. It's in the pipes. Don't ask why.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    done: {
      text: "The finger's home. The ring's home. I'm home. Go on, then — the soap is in the pipes. Don't ask why.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    failed: {
      text: "The well. You dropped it in the well. Centuries I kept that ring safe, and you fed it to a hole. …No. No, it's fine. The moss forgives you. I am not the moss.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
  },
};

// ══════════════════════════════════════════════════════════════
// THE OTHER HERMIT (Room 16) — hidden behind the mushroom circle.
// Identical to the first Hermit, missing his RIGHT ring finger.
// Always frowning. Brutally honest.
// ══════════════════════════════════════════════════════════════
const otherHermitScheme: CharacterScheme = {
  ...hermitScheme,
  cloth: 0x5a5a6a,
  accent: 0x3a3a4a,
};

export const OTHER_HERMIT: NPCDef = {
  id: 'other_hermit',
  name: 'The Other Hermit',
  title: 'The One Who Tells the Truth',
  scheme: otherHermitScheme,
  entryNode: 'intro',
  dialogue: {
    intro: {
      caption: 'A hidden room. Another old man. Also missing a finger. This is getting weird.',
      text: "You found me. Good. Or bad. Depends on which Hermit you've been talking to.",
      choices: [
        { label: 'There are two of you?', next: 'truth' },
        { label: '[Leave]', action: { type: 'endConvo' } },
      ],
    },
    truth: {
      text: "There are always two of everything down here. I'm the one who tells the truth. He's the one who tells the story. Both are useful. Both are dangerous.",
      choices: [
        { label: 'Which one are you?', next: 'which' },
        { label: '[Leave]', action: { type: 'endConvo' } },
      ],
    },
    which: {
      text: "I'm the one who's still missing his finger. He got his back, didn't he? Did he tell you where it came from? Did he tell you it was HIS rat? It wasn't his rat. It was the dungeon's rat. The dungeon gave it to him. The dungeon gives everyone what they regret.",
      choices: [
        { label: 'What do you regret?', next: 'regret' },
        { label: '[Leave]', action: { type: 'endConvo' } },
      ],
    },
    regret: {
      text: "I trusted him. My brother. The other me. He said we could leave. He said there was a way. There wasn't. There isn't. But you — you might actually make it. You're too stupid to know you can't.",
      choices: [
        { label: 'Is that a compliment?', next: 'compliment' },
        { label: '[Leave]', action: { type: 'endConvo' } },
      ],
    },
    compliment: {
      text: "It's an observation. Take this.",
      actions: [
        { type: 'startQuest', questId: 'other_hermit_quest' },
        { type: 'completeQuest', questId: 'other_hermit_quest' },
      ],
      choices: [{ label: '[Take the ring]', next: 'warning' }],
    },
    warning: {
      text: "And Greg? When you get to the top — don't trust the Paragon. Don't trust me. Don't trust yourself. Trust the chandelier.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    done: {
      text: "You're still here. Good. Or bad. The ring works either way.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
  },
};

// ══════════════════════════════════════════════════════════════
// GOBLIN GUARD "SCRAG" (Room 9) — the soap gate. Tired, underpaid,
// just wants soap.
// ══════════════════════════════════════════════════════════════
const scragScheme: CharacterScheme = {
  skin: 0x6f9c3f, cloth: 0x4a3a28, accent: 0x2e2418, hair: 0x1c1c1c,
  hood: false, orc: true, bulk: 0.9,
};

export const SCRAG: NPCDef = {
  id: 'scrag',
  name: 'Scrag',
  title: 'Goblin Guard',
  scheme: scragScheme,
  entryNode: 'intro',
  dialogue: {
    intro: {
      caption: 'A goblin in rusty armor. Spear. Bored expression. Name tag: "SCRAG."',
      text: "Halt. State your business. …Soap. The King wants soap. I want soap. Everyone wants soap. You bring me soap, you go through. No soap, no go. Those are the rules. I didn't make them. I just enforce them. Badly.",
      choices: [
        { label: '🧼 Hand over the goblin soap', visibleIf: { item: 'goblin_soap' }, actions: [{ type: 'takeItem', itemId: 'goblin_soap' }, { type: 'setFlag', flag: 'soap_gate_open' }, { type: 'completeQuest', questId: 'soap_conundrum' }], next: 'soap_done' },
        { label: '🧼 Hand over the premium soap', visibleIf: { item: 'premium_soap' }, actions: [{ type: 'takeItem', itemId: 'premium_soap' }, { type: 'setFlag', flag: 'soap_gate_open' }, { type: 'completeQuest', questId: 'soap_conundrum' }], next: 'soap_done' },
        { label: '💥 Break it down', visibleIf: { ability: { stat: 'str', min: 14 } }, actions: [{ type: 'setFlag', flag: 'soap_gate_open' }, { type: 'setFlag', flag: 'made_noise' }], next: 'break_done' },
        { label: '😏 Charm him', visibleIf: { ability: { stat: 'cha', min: 15 } }, actions: [{ type: 'setFlag', flag: 'soap_gate_open' }], next: 'charm_done' },
        { label: '⚔ Attack', action: { type: 'setFlag', flag: 'scrag_hostile' }, next: 'attack' },
        { label: '[Leave]', action: { type: 'endConvo' } },
      ],
    },
    soap_done: {
      text: "Is that... is that soap? That's soap! That's beautiful soap! Give it here! Give it! ...Okay. You can go through. But knock first. The King hates being surprised.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    break_done: {
      text: "No soap? Then no door. Unless you can break it. It's iron. You're in your underwear. I like your chances. I don't, actually. But it'll be funny to watch.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    charm_done: {
      text: "Well. Well, well. Fine. You can go through. But knock first. The King hates being surprised.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    done: {
      caption: 'Scrag leans on his spear. He looks almost content.',
      text: "Soap. Delivered. Door. Open. King. Happy — or at least less angry. You did good work, stranger. Don't let the bath get you. The bath gets everyone eventually.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    attack: {
      text: "You what? …RIGHT! GUARD! WE'VE GOT A LIVE ONE!",
      choices: [{ label: '[Fight]', action: { type: 'endConvo' } }],
    },
  },
};

// ══════════════════════════════════════════════════════════════
// GRIBNAB THE SOAPY (Room 25) — the parley overlay only. The fight
// itself is a boss encounter; these nodes carry the pre-fight lines
// (used as cutscene captions) and the mid-fight truce offer.
// ══════════════════════════════════════════════════════════════
export const GRIBNAB: NPCDef = {
  id: 'gribnab',
  name: 'Gribnab',
  title: 'The Soapy, King of the Goblins',
  scheme: { skin: 0x7a9c4a, cloth: 0x4a6a8a, accent: 0xff9ac0, hair: 0x101010, hood: false, orc: true, bulk: 1.2 },
  entryNode: 'parley',
  dialogue: {
    parley: {
      caption: 'The Goblin King lowers his soap-crusted club. The bubbles settle.',
      text: "Wait. Wait. You're not going to kill me? You're... you're offering me a truce? A... a partnership? You want to rule the bath together? ...I've never had a partner. I've only had subjects. And rubber ducks. This is... this is nice.",
      choices: [
        { label: '🫧 We rule the bath together. (Truce)', action: { type: 'bossParley', outcome: 'truce' } },
        { label: '⚔ No truce. This ends.', action: { type: 'bossParley', outcome: 'fight' } },
      ],
    },
    pre_fight_soap: {
      text: "Enter! You have soap? You do! Wonderful! Come in, come in! Don't mind the bubbles. Don't mind the ducks. Don't mind me. I am Gribnab, King of the Goblins, Lord of the Bath, Sovereign of Suds! And you are... in your underwear. Bold choice. I respect it.",
    },
    pre_fight_door: {
      text: "You BROKE my door! That was a good door! That was an IRON door! Do you know how hard it is to get iron down here?! I am going to BATH you! I am going to bath you to DEATH!",
    },
    final_taunt: {
      text: "You fight well for someone in underwear! I am almost proud! Almost! But the bath demands a sacrifice! And you are IT!",
    },
  },
};

/** All registered NPCs, keyed by id. */
export const NPCS: Record<string, NPCDef> = {
  hermit: HERMIT,
  other_hermit: OTHER_HERMIT,
  scrag: SCRAG,
  gribnab: GRIBNAB,
};
