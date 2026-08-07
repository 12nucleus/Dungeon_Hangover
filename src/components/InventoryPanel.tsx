import { useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot } from '@/game/types';
import type { Item, Rarity } from '@/game/items';
import { ENCHANTS, ITEM_BASES } from '@/game/items';
import type { EquipSlot } from '@/game/types';
import { effAC, effMaxHp, xpProgress } from '@/game/stats';
import { comboTitleFor } from '@/game/classes';
import { GregDoll } from './GregDoll';
import { VoxelItemIcon } from './VoxelItemIcon';
import { ItemInspect } from './ItemInspect';

const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9ca3af', uncommon: '#4ade80', rare: '#60a5fa', epic: '#c084fc',
};

const SLOT_ICON: Record<string, string> = {
  head: '⛑️', chest: '🦺', legs: '👖', boots: '👢', gloves: '🧤', arms: '💪', cloak: '🧥', belt: '🧷', trinket: '🧿',
  weapon: '⚔️', offHand: '🛡️', amulet: '📿', ring1: '💍', ring2: '💍',
};

const SLOT_LABEL: Record<string, string> = {
  head: 'Head', chest: 'Chest', legs: 'Legs', boots: 'Boots', gloves: 'Gloves', arms: 'Arms', cloak: 'Cloak', belt: 'Belt', trinket: 'Trinket',
  weapon: 'Weapon', offHand: 'Off-Hand', amulet: 'Amulet', ring1: 'Ring 1', ring2: 'Ring 2',
};

const PAPER_DOLL_SLOTS = ['head', 'chest', 'legs', 'boots', 'gloves', 'arms', 'cloak', 'belt', 'trinket', 'weapon', 'offHand', 'amulet', 'ring1', 'ring2'] as const;

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
      <VoxelItemIcon item={item} size={size - 8} />
      <span className="inv-item-tiers">{'●'.repeat(item.tier)}</span>
      {ench && <span className="inv-item-ench" style={{ color: ench.color }}>✦</span>}
    </div>
  );
}

export function InventoryPanel({ snap, engine }: { snap: UISnapshot; engine: GameEngine }) {
  const [selId, setSelId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<Item | null>(null);
  const party = snap.units.filter((u) => u.team === 'party');
  const [tab, setTab] = useState(party[0]?.id ?? '');
  const u = party.find((p) => p.id === tab) ?? party[0];
  const sel = snap.inventory.find((i) => i.id === selId) ?? null;

  if (!u) return null;

  /** arm a slot click: the selected item goes into THIS slot when allowed
   *  (altSlots — the bucket fits head/off-hand — or any one-handed weapon
   *  into the off hand); otherwise the normal auto-slot equip happens. */
  const armOnSlot = (slot: string) => {
    if (!sel) return;
    if (sel.kind === 'consumable') { engine.useConsumable(sel.id, u.id); setSelId(null); return; }
    const native = sel.slot ?? (sel._baseId ? ITEM_BASES[sel._baseId]?.slot ?? null : null)
      ?? (sel.kind === 'weapon' ? 'weapon' : sel.kind === 'armor' ? 'chest' : null);
    const allowed = slot === native
      || (sel.altSlots ?? []).includes(slot as EquipSlot)
      || (sel.kind === 'weapon' && !sel.twoHanded && slot === 'offHand');
    engine.equipItem(u.id, sel.id, allowed ? slot : undefined);
    setSelId(null);
  };

  const xp = xpProgress(u);

  return (
    <div className="inv-panel">
      <div className="inv-title">
        <span>🎒 PARTY INVENTORY</span>
        <span className="inv-gold">🪙 {snap.gold}</span>
        <button onClick={() => engine.toggleInventory()}>✕</button>
      </div>

      <div className="st-tabs" style={{ marginBottom: 8 }}>
        {party.map((m) => (
          <button key={m.id} className={`st-tab ${m.id === u.id ? 'active' : ''}`} onClick={() => setTab(m.id)}>
            {m.name} · Lv{m.level} · {comboTitleFor(m.classes ?? [])}
          </button>
        ))}
      </div>

      <div className="inv-body-new">
        <div className="paper-doll">
          <div className="paper-doll-header">
            <span className="paper-doll-name">{u.name}</span>
            <span className="paper-doll-sub">Lv {u.level} · HP {u.hp}/{effMaxHp(u)} · AC {effAC(u)}</span>
            <div className="xp-bar" title={`${xp.cur}/${xp.need} XP`}><i style={{ width: `${xp.pct * 100}%` }} /></div>
          </div>
          <div className="paper-doll-model">
            <GregDoll unit={u} width={130} height={205} />
          </div>
          <div className="paper-doll-slots">
            {PAPER_DOLL_SLOTS.map((slot) => {
              const it = (u.equipment as Record<string, Item | undefined>)[slot];
              return (
                <div key={slot} className={`paper-doll-slot ${sel ? 'armed' : ''}`}>
                  <span className="paper-doll-label">{SLOT_LABEL[slot]}</span>
                  {it ? (
                    <ItemIcon item={it} size={38} onClick={() => engine.unequipItem(u.id, slot)} />
                  ) : (
                    <div className="inv-item empty" style={{ width: 38, height: 38 }} onClick={sel ? () => armOnSlot(slot) : undefined}>
                      <span className="inv-item-icon">{SLOT_ICON[slot]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="inv-bag-col">
          <div className="inv-bag-title">Bag ({snap.inventory.length}/50)</div>
          <div className="inv-bag-new">
            {snap.inventory.length === 0 && <div className="inv-empty">Empty</div>}
            {snap.inventory.map((it) => (
              <ItemIcon key={it.id} item={it} selected={selId === it.id} onClick={() => setSelId(selId === it.id ? null : it.id)} />
            ))}
          </div>
        </div>
      </div>

      {sel && (
        <div className="inv-selbar" style={{ borderColor: RARITY_COLOR[sel.rarity] }}>
          <span>{sel.icon} <b style={{ color: RARITY_COLOR[sel.rarity] }}>{sel.name}</b> — {sel.desc}</span>
          <div className="inv-sel-actions">
            <span className="inv-sel-hint">{sel.kind === 'consumable' ? '🥤 click a hero to drink' : '🦸 click a slot to equip'} · click item again to cancel</span>
            <button className="inv-inspect-btn" onClick={() => setInspect(sel)}>🔍 Inspect</button>
            <button className="inv-drop-btn" onClick={() => { engine.dropItem(sel.id); setSelId(null); }}>
              🗑 Drop
            </button>
          </div>
        </div>
      )}

      {inspect && <ItemInspect item={inspect} onClose={() => setInspect(null)} />}
    </div>
  );
}
