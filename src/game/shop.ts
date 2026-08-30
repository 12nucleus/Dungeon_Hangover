// ─────────────────────────────────────────────────────────────
// SHOP — vendor stock + pricing for the Floor 49 Spore Merchant.
// "Myke" runs the only honest business in the grotto. Everything
// is pre-owned. Some of it is pre-death.
// ─────────────────────────────────────────────────────────────
export interface ShopStockItem {
  baseId: string;
  /** base price in gold (discounts applied at buy time) */
  price: number;
  levelReq?: number;
  /** stock only appears once this flag is set (quest unlocks) */
  requiresFlag?: string;
  /** Myke's sales pitch for this item */
  pitch: string;
}

/** how much Myke's "loyal customer" card knocks off (Frog Tongue Shortage reward) */
export const SPORE_MERCHANT_DISCOUNT = 0.8;

export const SPORE_MERCHANT_STOCK: ShopStockItem[] = [
  // ── tier 1 weapons ──
  { baseId: 'vine_whip', price: 35, pitch: 'A whip that grabs things. Do not let it grab your wallet. It will try.' },
  { baseId: 'spore_dagger', price: 50, pitch: 'Pre-owned. The previous owner is fine. The previous owner is a skeleton, but he is FINE.' },
  { baseId: 'mushroom_staff', price: 45, pitch: 'Grown, not carved. It whispers recipes at you. Mostly mushroom recipes. Mostly bad ones.' },
  // ── tier 2 weapons (level-gated — Myke is a businessman, not a miracle worker) ──
  { baseId: 'fungal_blade', price: 100, levelReq: 2, pitch: 'A sword that grew around a sword. Two swords for the price of one. Or one sword, twice. Either way, it blooms.' },
  { baseId: 'mycelial_staff', price: 165, levelReq: 3, requiresFlag: 'vendor_favor', pitch: 'This one is SPECIAL. Save your discount. I only show it to friends.' },
  // ── armor ──
  { baseId: 'mushroom_cap', price: 25, pitch: 'A hat that is also a mushroom. Keeps the rain AND the judgement off.' },
  { baseId: 'vine_cloak', price: 40, pitch: 'Woven from the finest vines. They were alive. They are still sort of alive. Think of it as a pet.' },
  { baseId: 'waterlogged_boots', price: 32, pitch: 'Waterproof. Actually they are WATER-FULL. But they are full of FRIENDLY fish.' },
  { baseId: 'frog_skin_cloak', price: 48, pitch: 'Came off a very large, very surprised frog. The frog is fine. The frog is a theory.' },
  { baseId: 'spore_crown', price: 125, levelReq: 3, requiresFlag: 'vendor_favor', pitch: 'A crown of living fungi. It hums. I am legally obligated to tell you it is not for sale to royalty. There is no royalty. Buy it.' },
  // ── consumables & bits ──
  { baseId: 'potion', price: 20, pitch: 'Heals. Tastes like a basement that has given up.' },
  { baseId: 'ration', price: 15, pitch: 'Dehydrated. Pre-chewed, some say. Rest at a fire with one of these and your wounds close PROPER.' },
  { baseId: 'moon_cap', price: 55, pitch: 'A mushroom that only grows in moonlight it has never seen. I have two. They are not for me. I do not deserve them.' },
  { baseId: 'hallucinogenic_spore', price: 18, pitch: 'I can sell you more of these. I cannot sell you FEWER of these.' },
  { baseId: 'crystal_shard', price: 20, pitch: 'Warm. Glows when it is quiet. Like me, before the economy.' },
];

/** stock visible to THIS run (flags gate the premium shelf) */
export function shopStockFor(e: { hasFlag(f: string): boolean }): ShopStockItem[] {
  return SPORE_MERCHANT_STOCK.filter((s) => !s.requiresFlag || e.hasFlag(s.requiresFlag));
}

/** final price — the loyalty card applies once Myke owes you a favour */
export function shopPriceFor(s: ShopStockItem, e: { hasFlag(f: string): boolean }): number {
  const disc = e.hasFlag('vendor_favor') ? SPORE_MERCHANT_DISCOUNT : 1;
  return Math.max(1, Math.round(s.price * disc));
}
