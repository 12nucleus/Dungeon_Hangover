// ─────────────────────────────────────────────────────────────
// Save / Load system — multi-slot persistence (localStorage) +
// global settings persistence.
//
// Every piece of game state we persist is plain serializable data
// (see `Unit`, `Item`, `QuestState` in types.ts / quest.ts), so a
// save is just a JSON blob. The engine builds a `SaveData` from its
// live state and `SaveManager` stores it under a slot id; loading
// reverses the process.
//
// Slots are independent "playthroughs" — the user can keep several
// different runs (different characters / progress) side by side.
// ─────────────────────────────────────────────────────────────

import type { Unit, GridPos, GamePhase } from './types';
import type { Item } from './items';
import type { QuestState } from './quest';

/** Global audio / display settings (shared across all save slots). */
export interface GameSettings {
  /** master gain, 0..1 */
  master: number;
  /** sfx gain, 0..1 */
  sfx: number;
  /** music gain, 0..1 */
  music: number;
  /** master mute */
  muted: boolean;
  /** start / stay fullscreen (web Fullscreen API — best-effort on launch) */
  fullscreen: boolean;
  /** internal render width, 0 = native window resolution (height follows aspect) */
  resolution: number;
}

/** The full serializable game state captured at a bonfire. */
export interface SaveData {
  version: number;
  slotId: string;
  name: string;
  /** epoch ms — used for "most recent" sorting + display */
  timestamp: number;
  /** dungeon floor (50 — the sewer cellar) */
  floor: number;
  /** display name of the floor (for the HUD header) */
  floorName?: string;
  units: Unit[];
  gold: number;
  inventory: Item[];
  questStates: QuestState[];
  bonfirePos: GridPos | null;
  bonfireLit: boolean;
  defeatedSpecialMobs: string[];
  /** ids of props destroyed by the player — stays cleared across rests/loads (additive) */
  destroyedProps?: string[];
  /** player-curated item-bar keys (max 6, additive) */
  itemBar?: string[];
  /** fog-of-war explored grid (boolean[size][size]) */
  explored: boolean[][];
  combat: {
    turnOrder: string[];
    activeIdx: number;
    round: number;
    inCombat: boolean;
    phase: GamePhase;
  };
  selectedId: string | null;
  phase: GamePhase;

  // ── floor-50 run state (save v2) ──
  /** per-run string flags (doors, quests, one-shot interactables) */
  flags?: string[];
  /** seeded run — replays the same trap tiles / poison bottles on load */
  runSeed?: number;
  /** victory-screen recap counters */
  runStats?: { kills: number; deaths: number; questsDone: number; secretsFound: number; startedAt: number };
}

/** Lightweight metadata shown in the slot list (no full state). */
export interface SaveSlotMeta {
  slotId: string;
  name: string;
  timestamp: number;
  floor: number;
}

const SAVES_KEY = 'dh_saves_v2';
const SETTINGS_KEY = 'dh_settings_v1';
const SAVE_VERSION = 2;

type SaveStore = Record<string, { meta: SaveSlotMeta; data: SaveData }>;

function readStore(): SaveStore {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    return raw ? (JSON.parse(raw) as SaveStore) : {};
  } catch {
    return {};
  }
}

function writeStore(s: SaveStore) {
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(s));
  } catch {
    /* storage full / disabled — fail silently, the game keeps running */
  }
}

export const SaveManager = {
  /** number of independent save slots offered in the Load / New-Game UI */
  MAX_SLOTS: 4,

  /** all occupied slots, newest first */
  listSlots(): SaveSlotMeta[] {
    const all = readStore();
    return Object.values(all)
      .map((s) => s.meta)
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  getMeta(slotId: string): SaveSlotMeta | null {
    return readStore()[slotId]?.meta ?? null;
  },

  has(slotId: string): boolean {
    return !!readStore()[slotId];
  },

  save(slotId: string, data: SaveData) {
    const all = readStore();
    all[slotId] = {
      meta: { slotId, name: data.name, timestamp: data.timestamp, floor: data.floor },
      data,
    };
    writeStore(all);
  },

  load(slotId: string): SaveData | null {
    const data = readStore()[slotId]?.data ?? null;
    // v1 saves are incompatible (floor-50 release) — treat as absent
    if (data && data.version !== SAVE_VERSION_NUMBER) return null;
    return data;
  },

  delete(slotId: string) {
    const all = readStore();
    if (all[slotId]) {
      delete all[slotId];
      writeStore(all);
    }
  },
};

const DEFAULT_SETTINGS: GameSettings = { master: 0.9, sfx: 0.9, music: 0.42, muted: false, fullscreen: false, resolution: 0 };

export const SettingsManager = {
  load(): GameSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const p = JSON.parse(raw) as Partial<GameSettings>;
      return {
        master: typeof p.master === 'number' ? p.master : DEFAULT_SETTINGS.master,
        sfx: typeof p.sfx === 'number' ? p.sfx : DEFAULT_SETTINGS.sfx,
        music: typeof p.music === 'number' ? p.music : DEFAULT_SETTINGS.music,
        muted: !!p.muted,
        fullscreen: !!p.fullscreen,
        resolution: typeof p.resolution === 'number' && p.resolution >= 0 ? p.resolution : DEFAULT_SETTINGS.resolution,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  save(s: GameSettings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  },
};

export const SAVE_VERSION_NUMBER = SAVE_VERSION;
