// ─────────────────────────────────────────────────────────────
// Loot offering — the "see what dropped, choose what to take"
// pipeline. Every drop (props, chests, enemy bodies, trapped gold)
// is OFFERED instead of auto-granted:
//
//   offerLoot()      → explore phase: opens the loot overlay now
//                      combat phase: queues it for after the fight
//   flushLootQueue() → combat ended → open everything queued
//   takeAllLoot()    → grant everything, close
//   takeItem/leaveItem → per-item choice (quest items can't be left)
//   dismissLoot()    → close; unclaimed items are lost (quest items
//                      are force-taken, so quests can't soft-lock)
//
// Pure functions over the engine (no imports → no circular deps).
// ─────────────────────────────────────────────────────────────
import type { Item } from '../items';

export interface LootOffer {
  source: string;
  items: Item[];
  gold: number;
}

/** quest-critical bases: leaving them behind would soft-lock a quest */
export const QUEST_LOOT_BASES = new Set([
  'severed_finger', 'rusty_key',
  'goblin_soap', 'premium_soap',
  'holy_water', 'water_flask',
  'soap_crown', 'hermits_ring',
]);

export function isQuestLoot(it: Item): boolean {
  return !!it._baseId && QUEST_LOOT_BASES.has(it._baseId);
}

function merge(a: LootOffer, b: LootOffer): LootOffer {
  return {
    source: a.source === b.source ? a.source : `${a.source} + ${b.source}`,
    items: [...a.items, ...b.items],
    gold: a.gold + b.gold,
  };
}

export function offerLoot(engine: any, source: string, items: any[], gold: number) {
  // an empty drop (empty crate, unlucky corpse) shouldn't open a pointless
  // overlay — just log it and move on
  if ((!items || items.length === 0) && !gold) {
    engine.emitSnapshot?.();
    return;
  }
  const offer: LootOffer = { source, items: [...items], gold };
  if (engine.combat?.inCombat) {
    if (!engine.lootQueue) engine.lootQueue = [];
    const i = engine.lootQueue.findIndex((o: LootOffer) => o.source === source);
    if (i >= 0) engine.lootQueue[i] = merge(engine.lootQueue[i], offer);
    else engine.lootQueue.push(offer);
    return;
  }
  engine.pendingLoot = engine.pendingLoot ? merge(engine.pendingLoot, offer) : offer;
  engine.busy = true;
  engine.emitSnapshot?.();
}

/** combat ended — surface everything that dropped during the fight */
export function flushLootQueue(engine: any) {
  const q = engine.lootQueue as LootOffer[] | undefined;
  if (!q || !q.length) return;
  engine.lootQueue = [];
  let merged: LootOffer | null = null;
  for (const o of q) merged = merged ? merge(merged, o) : o;
  if (merged) {
    engine.pendingLoot = engine.pendingLoot ? merge(engine.pendingLoot, merged) : merged;
    engine.busy = true;
  }
  engine.emitSnapshot?.();
}

function grant(engine: any, items: Item[], gold: number) {
  engine.inventory.push(...items);
  engine.gold += gold;
  for (const it of items) engine.loot.push(`${it.icon} ${it.name}`);
  if (gold) engine.loot.push(`🪙 ${gold} gold`);
}

/** rarity rank for celebration gating */
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };
let lootFlashSeq = 0;

/** Zelda-flavored pickup feedback — the more special the haul, the bigger
 *  the noise: epic/quest items get the full banner + fanfare, rare/uncommon
 *  get a chime, and any gold gets a coin blip + floating popup. */
function celebrate(engine: any, items: Item[], gold: number) {
  let best: Item | null = null;
  let bestRank = -1;
  let quest = false;
  for (const it of items) {
    if (isQuestLoot(it)) quest = true;
    const r = RARITY_RANK[it.rarity] ?? 0;
    if (r > bestRank) { bestRank = r; best = it; }
  }
  if (quest || bestRank >= 3) {
    engine.lootFlash = { id: ++lootFlashSeq, name: best?.name ?? 'Treasure', icon: best?.icon ?? '✨', rarity: quest ? 'quest' : (best?.rarity ?? 'epic') };
    setTimeout(() => { if (engine.lootFlash?.id === lootFlashSeq) { engine.lootFlash = null; engine.emitSnapshot?.(); } }, 2600);
  } else if (bestRank >= 1) {
    engine.audio?.lootChime?.(0.8);
  }
  if (gold > 0) {
    engine.audio?.coin?.(0.7);
    engine.addPopup?.(`+${gold} 🪙`, 'gold');
  }
}

/** take everything in the current offer */
export function takeAllLoot(engine: any) {
  const p = engine.pendingLoot as LootOffer | null;
  if (!p) return;
  grant(engine, p.items, p.gold);
  celebrate(engine, p.items, p.gold);
  engine.pushLog(`📦 ${p.source}: ${[...p.items.map((i) => `${i.icon} ${i.name}`), p.gold ? `🪙 ${p.gold} gold` : ''].filter(Boolean).join(', ')}.`, 'system');
  engine.pendingLoot = null;
  engine.busy = false;
  engine.emitSnapshot?.();
}

/** take a single item (gold stays in the offer) */
export function takeLootItem(engine: any, itemId: string) {
  const p = engine.pendingLoot as LootOffer | null;
  if (!p) return;
  const idx = p.items.findIndex((i) => i.id === itemId);
  if (idx < 0) return;
  const [it] = p.items.splice(idx, 1);
  grant(engine, [it], 0);
  celebrate(engine, [it], 0);
  engine.pushLog(`You take ${it.icon} ${it.name}.`, 'system');
  if (!p.items.length && p.gold <= 0) { engine.pendingLoot = null; engine.busy = false; }
  engine.emitSnapshot?.();
}

/** drop a single item (quest items are protected — they're taken anyway) */
export function leaveLootItem(engine: any, itemId: string) {
  const p = engine.pendingLoot as LootOffer | null;
  if (!p) return;
  const idx = p.items.findIndex((i) => i.id === itemId && !isQuestLoot(i));
  if (idx < 0) return;
  const [it] = p.items.splice(idx, 1);
  engine.pushLog(`You leave the ${it.name} behind.`, 'system');
  if (!p.items.length && p.gold <= 0) { engine.pendingLoot = null; engine.busy = false; }
  engine.emitSnapshot?.();
}

/** close the overlay — unclaimed items are lost (quest items force-taken) */
export function dismissLoot(engine: any) {
  const p = engine.pendingLoot as LootOffer | null;
  if (!p) return;
  const keep = p.items.filter(isQuestLoot);
  const lost = p.items.filter((i) => !isQuestLoot(i));
  if (lost.length) engine.pushLog(`You leave ${lost.map((i) => i.name).join(', ')} behind.`, 'system');
  if (keep.length) {
    grant(engine, keep, 0);
    celebrate(engine, keep, 0);
    engine.pushLog(`You keep ${keep.map((i) => `${i.icon} ${i.name}`).join(', ')} (needed).`, 'system');
  }
  engine.pendingLoot = null;
  engine.busy = false;
  engine.emitSnapshot?.();
}

/** defeat/reset — drop anything still offered or queued */
export function clearLoot(engine: any) {
  engine.pendingLoot = null;
  engine.lootQueue = [];
  engine.busy = false;
}
