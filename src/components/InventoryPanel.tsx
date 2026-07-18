// ─────────────────────────────────────────────────────────────
// Inventory & equipment panel — party cards (equip slots, XP bars)
// on the left, shared bag grid + gold on the right. Rarity-colored
// borders: common grey / uncommon green / rare blue / epic purple.
// Select an item, then click a hero card to equip (or drink) it.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot, Unit } from '@/game/types';
import type { Item, Rarity } from '@/game/items';
import { ENCHANTS } from '@/game/items';
import { effAC, effMaxHp, xpProgress } from '@/game/stats';

const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9ca3af', uncommon: '#4ade80', rare: '#60a5fa', epic: '#c084fc',
};

const SLOT_ICON: Record<string, string> = { weapon: '⚔️', armor: '🛡️', trinket: '💍' };

function ItemIcon({ item, size = 40, selected = false, onClick, title }: {
  item: Item; size?: number; selected?: boolean; onClick?: () => void; title?: string;
}) {
  const ench = item.enchantId ? ENCHANTS[item.enchantId] : null;
  return (
    <div
      className={`inv-item ${selected ? 'selected' : ''}`}
      style={{ width: size, height: size, borderColor: RARITY_COLOR[item.rarity] }}
      onClick={onClick}
      title={title ?? `${item.name} — ${item.desc}${ench ? `\n✦ ${ench.desc}` : ''}\nValue ${item.value}g · Tier ${item.tier}`}
    >
      <span className="inv-item-icon">{item.icon}</span>
      <span className="inv-item-tiers">{'●'.repeat(item.tier)}</span>
      {ench && <span className="inv-item-ench" style={{ color: ench.color }}>✦</span>}
    </div>
  );
}

function MemberCard({ u, engine, armed, onArm }: {
  u: Unit; engine: GameEngine; armed: boolean; onArm: () => void;
}) {
  const xp = xpProgress(u);
  return (
    <div className={`inv-member ${armed ? 'armed' : ''} ${u.alive ? '' : 'dead'}`} onClick={onArm}>
      <div className="inv-member-head">
        <span className="inv-member-name">{u.name}</span>
        <span className="inv-member-sub">Lv {u.level} {u.klass} · {u.hp}/{effMaxHp(u)} HP · AC {effAC(u)}</span>
        <div className="xp-bar" title={`${xp.cur}/${xp.need} XP to next level`}><i style={{ width: `${xp.pct * 100}%` }} /></div>
      </div>
      <div className="inv-slots">
        {(['weapon', 'armor', 'trinket'] as const).map((slot) => {
          const it = u.equipment[slot];
          return it ? (
            <ItemIcon key={slot} item={it} size={36} onClick={() => engine.unequipItem(u.id, slot)} />
          ) : (
            <div key={slot} className="inv-item empty" style={{ width: 36, height: 36 }} title={`${slot} slot (empty)`}>
              <span className="inv-item-icon">{SLOT_ICON[slot]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InventoryPanel({ snap, engine }: { snap: UISnapshot; engine: GameEngine }) {
  const [selId, setSelId] = useState<string | null>(null);
  const party = snap.units.filter((u) => u.team === 'party');
  const sel = snap.inventory.find((i) => i.id === selId) ?? null;

  const armOn = (u: Unit) => {
    if (!sel) return;
    if (sel.kind === 'consumable') engine.useConsumable(sel.id, u.id);
    else engine.equipItem(u.id, sel.id);
    setSelId(null);
  };

  return (
    <div className="inv-panel">
      <div className="inv-title">
        <span>🎒 PARTY INVENTORY</span>
        <span className="inv-gold">🪙 {snap.gold}</span>
        <button onClick={() => engine.toggleInventory()}>✕</button>
      </div>
      <div className="inv-body">
        <div className="inv-members">
          {party.map((u) => (
            <MemberCard key={u.id} u={u} engine={engine} armed={!!sel} onArm={() => armOn(u)} />
          ))}
        </div>
        <div className="inv-bag">
          {snap.inventory.length === 0 && <div className="inv-empty">Empty — smash crates, barrels &amp; vases to find loot.</div>}
          {snap.inventory.map((it) => (
            <ItemIcon key={it.id} item={it} selected={selId === it.id} onClick={() => setSelId(selId === it.id ? null : it.id)} />
          ))}
        </div>
      </div>
      {sel && (
        <div className="inv-selbar" style={{ borderColor: RARITY_COLOR[sel.rarity] }}>
          <span>{sel.icon} <b style={{ color: RARITY_COLOR[sel.rarity] }}>{sel.name}</b> — {sel.desc}</span>
          <span className="inv-sel-hint">{sel.kind === 'consumable' ? '🥤 click a hero to drink' : '🦸 click a hero to equip'} · click item again to cancel</span>
        </div>
      )}
    </div>
  );
}
