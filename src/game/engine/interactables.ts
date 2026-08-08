// ─────────────────────────────────────────────────────────────
// Interactables — a data-driven proximity system for hand-authored
// content (puddles, chests, valves, mushroom circles, staircases …).
//
// The floor level provides a list of `Interactable` defs (see
// floor50Content.ts). Every frame `updateInteractables` finds the nearest
// visible def within `radius` tiles (Chebyshev) of the party leader and
// exposes it as `engine.activeInteractable`; the HUD renders its label as
// "[E] …" and the E key / a click on it calls `triggerActiveInteractable`.
//
// No hardcoded proximity checks in updateDungeon — this is the single
// mechanism for "walk up and press E" content.
// ─────────────────────────────────────────────────────────────
import type { GridPos } from '../types';

/**
 * The minimal engine surface interactable `run` hooks may touch.
 * GameEngine satisfies this structurally; the type lives here (not in
 * engine.ts) so levels/ can import interactables without an import cycle.
 */
export interface GameEngineLike {
  narrate(id: string, text: string, minMs?: number): Promise<void>;
  pushLog(text: string, kind?: string): void;
  emitSnapshot(): void;
  setHoverInfoOnce(s: string): void;
  grantLoot(items: unknown[], gold: number): void;
  hasItemInInventory(baseId: string): boolean;
  /** remove one inventory item with this base id (returns success) */
  takeItem(baseId: string): boolean;
  addGold(n: number): void;
  healGreg(n: number): void;
  damageGreg(n: number, source: string): void;
  applyCondition(unitId: string, condId: string, rounds: number): void;
  hasClassSkill(classId: string): boolean;
  abilityCheck(stat: string, dc: number): boolean;
  /** show the rare die overlay for treasure quality */
  showDiceRoll?(die: string, total: number, reason: string): void;
  setFlag(flag: string): void;
  hasFlag(flag: string): boolean;
  startQuest(questId: string): void;
  completeQuest(questId: string): void;
  playSfx(name: string, vol?: number, pitch?: number): void;
  /** teleport the party leader to a tile (well drop, …) */
  teleportGreg?(tile: GridPos): void;
  /** mark a rect as explored (goblin map) */
  exploreRect?(rect: { x0: number; z0: number; x1: number; z1: number }): void;
  /** set a trap def triggered (valve/altar drains) */
  deactivateTrap?(defId: string): void;
  /** the floor-clear victory flow */
  winGame?(): void;
  /** climb to another registered floor (keeps party progression) */
  goToFloor?(n: number): void;
  /** recruit a party companion (Sporefriend…) — builds the unit + visuals */
  addCompanion?(name: string, title: string, scheme: Record<string, unknown>, maxHp: number): void;
  /** wake every dormant enemy with this groupId and start the fight (ambushes) */
  aggroGroup?(groupId: string): void;
  /** teleport the whole party to a tile (hidden tunnel shortcuts) */
  teleportParty?(tile: GridPos): void;
  /** per-run recap counters (vault gold, …) */
  runStats: { kills: number; deaths: number; questsDone: number; secretsFound: number; startedAt: number };
  /** current gold (dice table wagers) */
  gold: number;
  questLog: { fail(questId: string): void; get(questId: string): { stage: string } | undefined };
  startQuest(questId: string): void;
  completeQuest(questId: string): void;
  readonly flags: Set<string>;
  /** minimal combat surface used by content hooks */
  combat?: {
    inCombat?: boolean;
    living(team: 'party' | 'enemy'): { id: string; pos: GridPos; hp: number; maxHp: number; conditions?: { id: string }[] }[];
    units: { id: string; name: string; alive: boolean; dormant?: boolean; bossGroup?: boolean; groupId?: string; hp?: number; maxHp?: number }[];
    turnOrder: string[];
  };
  /** unit visuals (kill-a-baby animation) */
  visuals?: Map<string, { rig: { anim: { mode: string } }; bar: { style: { display: string } } }>;
}

export interface Interactable {
  id: string;
  pos: GridPos;
  /** Chebyshev radius in tiles the leader must be within */
  radius: number;
  /** "[E] Drink from the puddle" */
  label: string;
  visibleIf?: (e: GameEngineLike) => boolean;
  /** run once per run; auto-hides after `did_<id>` flag is set */
  once?: boolean;
  run(e: GameEngineLike): void;
}

/**
 * The engine-side fields the interactable system touches. GameEngine
 * satisfies this structurally (no import cycle, no `any`).
 */
export interface InteractableHost {
  interactables?: Interactable[];
  activeInteractable: Interactable | null;
  flags: Set<string>;
  combat?: { living(team: 'party' | 'enemy'): { pos: GridPos }[] };
  emitSnapshot(): void;
  setFlag(flag: string): void;
}

/** (re)install the floor's interactable defs (idempotent — re-called per run). */
export function registerInteractables(engine: InteractableHost, defs: Interactable[]) {
  engine.interactables = [...defs];
  engine.activeInteractable = null;
}

/** per-frame: pick the nearest visible interactable within the leader's radius. */
export function updateInteractables(engine: InteractableHost) {
  if (!engine.interactables?.length) return;
  const leader = engine.combat?.living('party')[0];
  if (!leader) { engine.activeInteractable = null; return; }
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of engine.interactables) {
    if (it.once && engine.flags.has(`did_${it.id}`)) continue;
    if (it.visibleIf && !it.visibleIf(engine as unknown as GameEngineLike)) continue;
    const d = Math.max(Math.abs(leader.pos.x - it.pos.x), Math.abs(leader.pos.z - it.pos.z));
    if (d <= it.radius && d < bestD) { bestD = d; best = it; }
  }
  if (engine.activeInteractable !== best) {
    engine.activeInteractable = best;
    engine.emitSnapshot();
  }
}

/** run the currently-active interactable (E key / click on it). */
export function triggerActiveInteractable(engine: InteractableHost) {
  const it = engine.activeInteractable;
  if (!it) return;
  if (it.once && engine.flags.has(`did_${it.id}`)) return;
  try {
    it.run(engine as unknown as GameEngineLike);
  } finally {
    if (it.once) engine.setFlag(`did_${it.id}`);
  }
  engine.emitSnapshot();
}
