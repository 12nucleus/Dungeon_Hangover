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
  | { type: 'openShop' }
  | { type: 'bossParley'; outcome: 'fight' | 'truce' }
  | { type: 'endConvo' };

/** gate a dialogue choice on inventory / flags / an ability check */
export interface ChoiceCondition {
  item?: string;
  /** require at least N copies of `item` (default 1) */
  minCount?: number;
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
      choices: [
        { label: 'You ever get bored out here?', next: 'bored' },
        { label: '[Leave]', action: { type: 'endConvo' } },
      ],
    },
    bored: {
      text: "Bored. BORED. I have been standing in front of this door for six years. I have counted the stones in the wall. There are two hundred and fourteen. I have named twelve of them. That one is Colin. Colin is my best friend. Do not tell Colin I said that.",
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
      text: "Wait. Wait. You're not going to kill me? You're... you're offering me a truce? A... a partnership? You want to rule the bath together? I have never had a partner. I have had subjects. I have had rubber ducks. The ducks do not talk back. Well — one does. But he is a liar. This is... this is nice. Do you like warm water? Please say you like warm water.",
      choices: [
        { label: '🫧 We rule the bath together. (Truce)', action: { type: 'bossParley', outcome: 'truce' } },
        { label: '⚔ No truce. This ends.', action: { type: 'bossParley', outcome: 'fight' } },
        { label: 'Tell me about the ducks.', next: 'ducks' },
        { label: 'Why the bath?', next: 'why_bath' },
      ],
    },
    ducks: {
      text: "The ducks. My ducks. Each one is a loyal subject. Each one is a FRIEND. That one is Sir Quacksley. That one is the Duchess of Squeaks. That one is... I do not remember his name, but he is VINCIBLE. They are all vincible. They are all I have.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    why_bath: {
      text: "Why the bath? Because the bath does not judge. The bath does not leave. The bath is WARM and it STAYS WARM and when you are the king of the bath, the bath listens to YOU. It is the only relationship that has never disappointed me. Except that one time. With the eel.",
      choices: [{ label: '[Leave]', action: { type: 'endConvo' } }],
    },
    pre_fight_soap: {
      text: "Enter! You have soap? You DO! Wonderful! Oh, beautiful, beautiful soap! Come in, come in. Don't mind the bubbles. Don't mind the ducks. Don't mind me. I am Gribnab, King of the Goblins, Lord of the Bath, Sovereign of Suds! I have been soaking in this very tub for three hundred years and it has never once gone cold. And you are... in your underwear. Bold. Naked. I respect it more than you know.",
    },
    pre_fight_door: {
      text: "You BROKE my door! That was a GOOD door! That was an IRON door, carried down through seventeen flooded tunnels by goblins who did not survive the trip! Do you know how hard it is to get iron down here?! Do you know how many buckets of bath water I had to trade?! I am going to BATH you! I am going to bath you until you are CLEAN and also DEAD!",
    },
    final_taunt: {
      text: "You fight well for someone in underwear! I am almost proud! Almost! But the bath demands a sacrifice and the water is getting cold, and you — YOU — are it. Every king needs a cautionary tale. Every bath needs a rubber duck. And you, my naked friend, are about to become BOTH.",
    },
  },
};

// ══════════════════════════════════════════════════════════════
// FLOOR 49 — THE FUNGAL GROTTO cast
// (voices designed by scripts/gen_voice_design.py)
// ══════════════════════════════════════════════════════════════

// ── THE HERMIT SHROOM (r4) — a mushroom old man. Speaks only while
//    you are hallucinating. Wise, sad, knows the Spire is a dream. ──
export const HERMIT_SHROOM: NPCDef = {
  id: 'hermit_shroom',
  name: 'The Hermit Shroom',
  title: 'The Oldest Mushroom in the Grotto',
  scheme: { skin: 0xd8c8a0, cloth: 0x8a7a5a, accent: 0x6a5a3a, hair: 0xc8b890, hood: false, monster: 'mushroom', bulk: 0.95 },
  entryNode: 'asleep',
  dialogue: {
    asleep: {
      caption: 'A mushroom the size of a grandfather, leaning on the pool. His eyes are closed. His gills are breathing.',
      text: "...zzz... the Spire dreams of... zzz... a monkey with a... zzz... The mushroom man is asleep. Or ignoring you. With mushrooms it is genuinely hard to tell.",
      choices: [
        { label: 'Wake him', next: 'awake', visibleIf: { flag: 'pool_drank' } },
        { label: 'Let him sleep', action: { type: 'endConvo' } },
      ],
    },
    awake: {
      caption: 'His eyes open. They are the colour of the pool. They have seen too much, and forgiven none of it.',
      text: "You drank the water. Good. Bad. Both. Now you can SEE. The Spire is REAL. The Spire is ALIVE. The Spire is DREAMING. And in its dream it made me. It made all of this. The mushrooms. The spores. The GROTTO. All dreams. All Spire dreams.",
      actions: [{ type: 'setFlag', flag: 'did_talk_hermit_r4' }, { type: 'startQuest', questId: 'through_grotto' }, { type: 'startQuest', questId: 'mycologist_request' }],
      choices: [
        { label: 'How do I wake it up?', next: 'climb' },
        { label: 'What about the mushrooms?', next: 'science' },
        { label: 'I should go. (Leave)', action: { type: 'endConvo' } },
      ],
    },
    climb: {
      text: "You do not wake it. You CLIMB. You climb to the DREAMER. You climb to the thing that dreams. You climb to Floor 1. You climb to the PARAGON. And you ask it: are you dreaming? And if it says yes... then maybe. Maybe we can ALL wake up.",
      choices: [
        { label: 'What about the mushrooms?', next: 'science' },
        { label: 'I should go. (Leave)', action: { type: 'endConvo' } },
      ],
    },
    science: {
      caption: 'He gestures at the caps around the pool with a trembling, mycelial hand.',
      text: "The mushrooms. Ah. The mushrooms are the reason I am still here. Five glowing mushrooms, and I can finish my life's work. My taxonomy. My GREAT work: which of these bastards wants to kill you, and which just wants to be your friend. Bring me five. For science.",
      choices: [
        { label: 'I will bring you five.', action: { type: 'endConvo' } },
        { label: 'How do I wake it up?', next: 'climb' },
      ],
    },
  },
};

// ── MYKE THE SPORE MERCHANT (r1) — the only honest businessman in
//    the grotto. Everything is pre-owned. Some of it is pre-death. ──
export const SPORE_MERCHANT: NPCDef = {
  id: 'spore_merchant',
  name: 'Myke the Spore Merchant',
  title: 'Proprietor, Myke\'s Pre-Owned Adventuring Supplies',
  scheme: { skin: 0xe0d8c4, cloth: 0x4a9a4a, accent: 0xffd23a, hair: 0x2a2a3a, hood: false, monster: 'mushroom', bulk: 1.15 },
  entryNode: 'intro',
  dialogue: {
    intro: {
      caption: 'A mushroom in a tiny vest and an enormous hat. He smells like coins and optimism.',
      text: "Welcome! Welcome to Myke's Pre-Owned Adventuring Supplies! Everything is pre-owned. Some of it is pre-death. The prices are fair, the warranties are a lie, and the questions are FREE. That's the one thing I can't mark up.",
      choices: [
        { label: '🛒 Browse the wares', action: { type: 'openShop' } },
        { label: 'What happened to the last owner of this gear?', next: 'last_owner' },
        { label: 'What\'s with the tongue situation?', next: 'tongue_intro', visibleIf: { notFlag: 'vendor_favor' } },
        { label: 'Bye, Myke.', action: { type: 'endConvo' } },
      ],
    },
    last_owner: {
      text: "Who, the gear? Oh, he's fine. He's FINE. He retired. To a very nice... arrangement... underground. Look, here's the thing about adventurers in this grotto: they either retire to a very nice arrangement underground, or they buy MORE gear from me. It's a beautiful business model.",
      choices: [
        { label: '🛒 Browse the wares', action: { type: 'openShop' } },
        { label: 'Bye, Myke.', action: { type: 'endConvo' } },
      ],
    },
    tongue_intro: {
      text: "The tongue situation. HA. My supplier was a frog. A big frog. A beautiful, tongue-based business model. Then the big frog met someone like you, and now the big frog is a big PROBLEM, and I have no supplier, and my premium shelf has been gathering dust and judgment. Bring me the frog's tongue and three cave fish. I'll make it worth your while. I swear on my mother. She's a mushroom. She cannot hear me.",
      choices: [
        { label: 'Deal. (Accept the quest)', actions: [{ type: 'startQuest', questId: 'frog_tongue_shortage' }, { type: 'setFlag', flag: 'frog_tongue_quest' }] },
        { label: "I've got the tongue right here.", next: 'tongue_deliver', visibleIf: { item: 'frog_tongue' } },
        { label: 'I\'ll think about it.', action: { type: 'endConvo' } },
      ],
    },
    tongue_deliver: {
      caption: 'Myke holds the tongue up to the light like a sommelier.',
      text: "Oh, it's BEAUTIFUL. Look at the grip on that thing. He used this tongue to eat the last three suppliers. Now the fish. Three of them. They were the supply chain's supply chain.",
      actions: [{ type: 'takeItem', itemId: 'frog_tongue' }, { type: 'setFlag', flag: 'tongue_delivered' }],
      choices: [
        { label: 'Here are the fish. (3 Cave Fish Meat)', actions: [
          { type: 'takeItem', itemId: 'cave_fish_meat' }, { type: 'takeItem', itemId: 'cave_fish_meat' }, { type: 'takeItem', itemId: 'cave_fish_meat' },
          { type: 'completeQuest', questId: 'frog_tongue_shortage' },
          { type: 'setFlag', flag: 'vendor_favor' },
        ], visibleIf: { item: 'cave_fish_meat', minCount: 3 } },
        { label: 'I\'m short on fish. Give me a minute.', action: { type: 'endConvo' } },
      ],
    },
  },
};

// ── THE SPORE MOTHER (r7 boss) — her cutscene speaks these nodes. ──
export const SPORE_MOTHER_NPC: NPCDef = {
  id: 'spore_mother',
  name: 'The Spore Mother',
  title: 'The Dreamer of the Grotto',
  scheme: { skin: 0x4a3a6a, cloth: 0x9a5cf0, accent: 0xe0d8c4, hair: 0xffd23a, hood: false, monster: 'mushroom', bulk: 2.0 },
  entryNode: 'wake',
  dialogue: {
    wake: {
      caption: 'Her voice is a chorus of dead mushrooms, and the chorus is ALARMED.',
      text: "We are the garden. We are the rot. We are what grows when nothing else will. You are meat. You will be soil. ...What? No. No, you may not 'just pass through'. You may be COMPOST through. That is the only through.",
    },
    wake_broken: {
      caption: 'She looks at the splinters of her throne. The dreaming stops. The waking begins.',
      text: "You... you BROKE it. The throne. The DREAM. You smashed a thousand years of quiet breathing because it was in your WAY. Oh, you magnificent idiot. You have made this SO personal. I am going to grow in your teeth.",
    },
  },
};

// ── monster barks — one-line combat cries, spoken in their own
//    designed voices. Spawned via unit.npcId on combat start. ──
const mobScheme = (monster: 'mushroom' | 'crawler' | 'fish' | 'frog', skin: number, cloth: number) =>
  ({ skin, cloth, accent: 0x222222, hair: 0x111111, hood: false, monster });

export const MOB_VINE_CRAWLER: NPCDef = {
  id: 'vine_crawler', name: 'Vine Crawler', title: 'Living Vine', scheme: mobScheme('crawler', 0x3a7a3a, 0x6ac86a), entryNode: 'bark',
  dialogue: {
    bark: {
      text: 'Eat the grass. The grass is a LIE. The grass eats BACK. ...That is us. We are the grass. That was the point.',
    },
  },
};
export const MOB_MUSHROOM_GUARDIAN: NPCDef = {
  id: 'mushroom_guardian', name: 'Mushroom Guardian', title: "The Grotto's Bouncer", scheme: mobScheme('mushroom', 0xe0d8c4, 0x36d17a), entryNode: 'bark',
  dialogue: {
    bark: {
      text: 'NO FUNGUS ON THE DANCE FLOOR. The floor is MOSS. The moss is CLOSED. You are CLOSED.',
    },
  },
};
export const MOB_SMALL_MUSHROOM: NPCDef = {
  id: 'small_mushroom', name: 'Small Mushroom', title: 'Spore Child', scheme: mobScheme('mushroom', 0xe8e0d0, 0x49b6ff), entryNode: 'bark',
  dialogue: {
    bark: {
      text: 'I contain multitudes. I contain SO MANY SPORES. Please do not hit me. I am very small and very full of vengeance.',
    },
  },
};
export const MOB_CAVE_FISH: NPCDef = {
  id: 'cave_fish', name: 'Cave Fish', title: 'Blind Pool Swimmer', scheme: mobScheme('fish', 0x3a7a9a, 0x9ad8ff), entryNode: 'bark',
  dialogue: {
    bark: {
      text: 'Blub. Blub blub. I have not seen light in forty years and I am FINE with that. The light is overrated. The light is where the FROGS live.',
    },
  },
};
export const MOB_GIANT_FROG: NPCDef = {
  id: 'giant_frog', name: 'Giant Frog', title: 'The Tongue That Waits', scheme: mobScheme('frog', 0x4a9a4a, 0xc8e8a0), entryNode: 'bark',
  dialogue: {
    bark: {
      text: 'Ribbit. That was not a question. That was a WARNING. I have a tongue the length of your life story and I am NOT afraid to use it.',
    },
  },
};
export const MOB_MUSHROOM_MIMIC: NPCDef = {
  id: 'mushroom_mimic', name: 'Mushroom Mimic', title: 'The Chest That Bites', scheme: mobScheme('mushroom', 0xc8a030, 0x8a6a1a), entryNode: 'bark',
  dialogue: {
    bark: {
      text: 'Finally. FINALLY. Three hundred years I have sat here pretending to be furniture, waiting for someone to OPEN me. Do you know what it is like to be a chest with DREAMS? Now. Where were we. AH yes. Biting.',
    },
  },
};

// (mob barks aren't spawned NPCs — they're combat units with unit.npcId —
// but registering keeps them discoverable)

/** All registered NPCs, keyed by id. */
export const NPCS: Record<string, NPCDef> = {
  hermit: HERMIT,
  other_hermit: OTHER_HERMIT,
  scrag: SCRAG,
  gribnab: GRIBNAB,
  // ── floor 49 cast (voices designed by scripts/gen_voice_design.py) ──
  hermit_shroom: HERMIT_SHROOM,
  spore_merchant: SPORE_MERCHANT,
  spore_mother: SPORE_MOTHER_NPC,
  // monster barks — combat units carry unit.npcId; registering keeps them
  // discoverable and gives the voice designer their bark lines
  vine_crawler: MOB_VINE_CRAWLER,
  mushroom_guardian: MOB_MUSHROOM_GUARDIAN,
  small_mushroom: MOB_SMALL_MUSHROOM,
  cave_fish: MOB_CAVE_FISH,
  giant_frog: MOB_GIANT_FROG,
  mushroom_mimic: MOB_MUSHROOM_MIMIC,
};
