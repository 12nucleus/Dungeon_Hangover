// ─────────────────────────────────────────────────────────────
// Floor 50 narrative text — Gribnab barks, Baron Gnaw barks,
// main quest "The Longest Morning", and easter-egg lines.
//
// All strings are TTS-safe: no emoji, no brackets, no symbols,
// no abbreviations, numbers spelled out, no homophone traps.
// ─────────────────────────────────────────────────────────────

/** Gribnab's mid-fight barks. Indignant bath-king persona. */
export const GRIBNAB_BARKS = {
  hp75: "How DARE you track mud across my bath mat. That is a LIMITED EDITION bath mat.",
  hp50: "The bath overflows. The bath OVERFLOWS. Do you know how long it took to get the temperature just so.",
  hp25: "My bubbles. You are popping my BUBBLES. Each bubble had a NAME.",
  phase2: "Enough lukewarm hospitality. Now the water gets SERIOUS.",
  duckSummon: "To me, my ducks. TO ME. We have a situation and it is WEARING UNDERWEAR.",
  death: "I yield. I yield. The bath is yours. Just... just keep the cap. Please. It was a gift from the Suds himself. It is all I have. It is all I have EVER had.",
  bathTime: [
    "Bath time, little naked one. Hold still. This is going to be HUMILIATING.",
    "Into the water. The water heals. The water ALWAYS heals. The water is my MOTHER.",
    "You cannot fight a man in his bath. It is against the rules. I wrote the rules. They are VERY soapy rules.",
  ],
};

/** Baron Gnaw — the Boss Rat's narrator barks. */
export const BARON_BARKS = {
  summon: "The bath king calls, and Baron Gnaw ANSWERS. Mostly because he was promised snacks.",
  death: "Baron Gnaw collapses into a pile of wet fur and bad decisions. The bath is quieter now. The bath is ALWAYS quieter after the snacks arrive.",
};

/** Main quest: The Longest Morning. The hungover escape spine. */
export const MAIN_QUEST_F50 = {
  name: "The Longest Morning",
  desc: "You woke on cold stone in your underwear. The only way is up. First, find soap. Then, face the bath king. Then, climb toward the light.",
  stages: {
    start: "You wake on cold stone in your underwear. The world smells like soap and bad choices. Somewhere above you, the day is waiting. It can wait longer.",
    gateOpen: "The goblin guard steps aside. The iron door groans open. The smell of strawberries and tyranny rolls over you like a wave. You are through.",
    doorOpen: "The bath chamber door yields. Steam curls around your ankles. Somewhere in the pink water, a king is singing. He is always singing. He is terrible at it.",
    gribnabDown: "The bath king is finished. The water is still. The rubber ducks drift in the silence like tiny, judgmental survivors. You did it. You beautiful, soapy idiot.",
    departure: "The stairs go up. The stairs always go up. You climb away from the bath, away from the soap, toward whatever comes next. Your legs ache. Your dignity aches worse. But you climb.",
  },
};

/** Easter-egg narrator lines. */
export const EASTER_EGG_LINES = {
  duckChoir: "The rubber ducks begin to sing. It is not a song you know. It is not a song ANYONE knows. But the ducks are committed. The ducks are ALWAYS committed.",
  chandelier: "You look up at the chandelier. It glitters. It sways. You once thought you would marry a chandelier. Tonight, the chandelier looks back. It remembers.",
  wellWish: "You toss a penny into the well. It flashes once, twice, and vanishes. Somewhere deep below, a wish is granted. It is probably not yours.",
  wellWishFail: "You have no penny to toss. The well stares back. The well has seen this before. The well is not impressed.",
  tpk: [
    "Your party falls. All of you. In your underwear. At the bottom of a dungeon. The narrator would like you to know: this is the funniest thing that has ever happened.",
    "You are dead. The rats are already holding a meeting about who gets your socks. The meeting is surprisingly civil.",
    "Game over, Greg. The bath wins. The bath ALWAYS wins. But hey. You can try again. The dungeon has a sense of humor. It wants to see what you do next.",
  ],
};
