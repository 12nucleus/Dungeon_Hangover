// ─────────────────────────────────────────────────────────────
// Floor registry — the game currently ships one hand-authored level,
// Floor 50 — The Sewer Cellar (the bottom of the Spire of Regret).
// Future floors get appended here and the engine picks by number.
// ─────────────────────────────────────────────────────────────
import type { LevelDef } from './levelTypes';
import { floor50Level } from './floor50';

export const START_FLOOR = 50;

export const FLOORS: Record<number, LevelDef> = {
  [START_FLOOR]: floor50Level,
};

export function levelForFloor(n: number): LevelDef {
  return FLOORS[n] ?? floor50Level;
}
