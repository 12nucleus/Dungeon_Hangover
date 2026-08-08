import { useState } from 'react';
import type { GameEngine } from '../game/engine';
import type { UISnapshot } from '../game/types';

/** Myke's Pre-Owned Adventuring Supplies — the Floor 49 shop panel. */
export function ShopPanel({ snap, engine }: { snap: UISnapshot; engine: GameEngine }) {
  const [sel, setSel] = useState<string | null>(null);
  const stock = snap.shopStock ?? [];
  const selItem = stock.find((s) => s.baseId === sel) ?? null;

  return (
    <div className="shop-overlay">
      <div className="shop-panel">
        <div className="shop-header">
          <div className="shop-title">🛒 {snap.shopNpcName ?? "Myke's"} Pre-Owned Adventuring Supplies</div>
          <div className="shop-sub">"Everything is pre-owned. Some of it is pre-death."</div>
        </div>
        {snap.shopDiscount && <div className="shop-discount-banner">⭐ Loyal customer card active — 20% off everything!</div>}

        <div className="shop-grid">
          {stock.length === 0 && <div className="shop-empty">The shelves are bare. Even the dust has been repossessed.</div>}
          {stock.map((s) => (
            <button
              key={s.baseId}
              className={`shop-item ${sel === s.baseId ? 'selected' : ''} ${s.canBuy ? '' : 'locked'}`}
              onClick={() => setSel(s.baseId)}
            >
              <div className="shop-item-icon">{s.icon}</div>
              <div className="shop-item-name">{s.name}</div>
              <div className="shop-item-meta">
                <span className={`tier-pips t${s.tier}`}>{'◆'.repeat(s.tier)}</span>
                {s.levelReq && <span className="shop-req">Lv {s.levelReq}</span>}
              </div>
              <div className="shop-item-price">{s.price} 🪙</div>
            </button>
          ))}
        </div>

        {selItem && (
          <div className="shop-detail">
            <div className="shop-detail-pitch">"{selItem.pitch}"</div>
            <div className="shop-detail-actions">
              <button
                className="btn-primary btn-sm"
                disabled={!selItem.canBuy}
                onClick={() => engine?.buyShopItem(selItem.baseId)}
              >
                Buy for {selItem.price} 🪙
              </button>
              <span className="shop-your-gold">Your gold: {snap.gold ?? 0} 🪙</span>
            </div>
          </div>
        )}

        <div className="shop-footer">
          <button className="btn-primary btn-sm" onClick={() => engine?.closeShop()}>
            Leave shop (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
