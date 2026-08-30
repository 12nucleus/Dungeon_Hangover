// ─────────────────────────────────────────────────────────────
// Combat narration — Dungeon-Crawler-Carl in-fight color. The voice is
// fire-and-forget (`void engine.narrate(...)`): missing mp3s degrade
// silently to the subtitle line, so adding a line here is always safe.
// ─────────────────────────────────────────────────────────────

/** kill lines — ids `f50_kill_1..10` map 1:1 to their archive entries. */
export const KILL_LINES = [
  'And down he goes. The dungeon bills his estate.',
  'One less thing to be afraid of. The list remains long.',
  "He's dead. The dungeon does not send flowers.",
  'You put him down like a bad habit.',
  "Clean kill. Ish. There's a lot of blood, but it's CLEAN-adjacent.",
  'Another one for the losing team.',
  'Dead. The floor did not see that coming. The floor sees everything, so this is a problem.',
  'He folds. The dungeon does not reimburse him.',
  'Down like the drink prices when Greg wakes up.',
  'One less monster. The grotto takes it personally.',
];

/** near-death lines — a single `f50_near_death_1` VO, varied subtitles. */
export const NEAR_DEATH_LINES = [
  "You're hurt bad. The dungeon can smell it.",
  "That's a lot of your blood that isn't inside you anymore.",
  "You're one bad decision from a reload screen.",
  'Greg is leaking. This is not a drill.',
  'Your HP bar is screaming. Politely, but screaming.',
  'One more hit like that and this walkthrough ends badly.',
  'You are dangerously low. The dungeon has opinions about that.',
  'That was close. Too close. The kind of close that gets a sequel.',
];

/** crit praise — a single `f50_crit_1` VO, varied subtitles. */
export const CRIT_PRAISE_LINES = [
  'CRITICAL. The dice have chosen violence.',
  'Oh that was NASTY. In the good way.',
  'A crit! The dungeon flinches.',
  'The dice do not mess around. Damage everywhere.',
  "Clean through. That one's going on the highlight reel.",
  'The numbers erect a small statue in your honor.',
  'That hit had a grudge. And a lawyer.',
  'CRIT. The monster rethinks its life choices.',
];

/** fumble jab — a single `f50_fumble_1` VO, varied subtitles. */
export const FUMBLE_JUDGE_LINES = [
  'A miss. The floor snickers.',
  'The natural one. The universe\u2019s way of saying \u201cno.\u201d',
  'You swung at a ghost and MISSED.',
  'The dice have betrayed you. It happens.',
  'Whiff. A pigeon somewhere is judging you.',
  "That wasn't an attack. That was a suggestion.",
  'A fumble. The monster yawns.',
  'The 1. Every table fears it. So does this one.',
];

/** throttle gate: at least 2.5s since the last line, then roll `chance<1`. */
export function maybe(chance: number, last: number, now: number): boolean {
  return now - last > 2500 && Math.random() < chance;
}

/** 1-indexed pick of a line + its ordinal — keeps id and subtitle paired. */
export function pickIndexed(lines: readonly string[]): { n: number; text: string } {
  const n = 1 + Math.floor(Math.random() * lines.length);
  return { n, text: lines[n - 1] };
}