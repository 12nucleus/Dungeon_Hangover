// ─────────────────────────────────────────────────────────────
// Dice engine — tabletop-style NdM+K rolls with full logging.
// Expansion: advantage/disadvantage hooks already exist via rollD20.
// ─────────────────────────────────────────────────────────────

export interface DiceResult {
  total: number;
  rolls: number[];
  modifier: number;
  expr: string;
}

export function rollDice(expr: string): DiceResult {
  const m = expr.trim().match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/i);
  if (!m) return { total: 0, rolls: [], modifier: 0, expr };
  const n = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  const modifier = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + modifier;
  return { total: Math.max(0, total), rolls, modifier, expr };
}

export interface D20Result {
  roll: number;      // raw d20
  bonus: number;     // flat bonus
  extra: number;     // situational dice (bless etc.)
  total: number;
  crit: boolean;     // natural 20
  fumble: boolean;   // natural 1
}

export function rollD20(bonus: number, extraDice = '', adv: 'adv' | 'dis' | null = null): D20Result {
  let roll = 1 + Math.floor(Math.random() * 20);
  if (adv) {                       // BG3 / 5e: roll twice, take the higher (adv) or lower (dis)
    const roll2 = 1 + Math.floor(Math.random() * 20);
    roll = adv === 'adv' ? Math.max(roll, roll2) : Math.min(roll, roll2);
  }
  const extra = extraDice ? rollDice(extraDice).total : 0;
  return {
    roll, bonus, extra,
    total: roll + bonus + extra,
    crit: roll === 20,
    fumble: roll === 1,
  };
}

/** Ability score → modifier, D&D style. */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
