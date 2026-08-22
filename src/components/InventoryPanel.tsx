import { useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot } from '@/game/types';
import type { Item, Rarity } from '@/game/items';
import { ENCHANTS } from '@/game/items';
import { canEquipIn, itemUses, formatUseLine, isThrowable } from '@/game/improvised';
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
  weapon: '⚔️', offHand: '🛡️', amulet: '📿', ring1: '💍', ring2: '💍', ranged: '🏹',
};

const SLOT_LABEL: Record<string, string> = {
  head: 'Head', chest: 'Chest', legs: 'Legs', boots: 'Boots', gloves: 'Gloves', arms: 'Arms', cloak: 'Cloak', belt: 'Belt', trinket: 'Trinket',
  weapon: 'Main Hand', offHand: 'Off Hand', amulet: 'Amulet', ring1: 'Ring I', ring2: 'Ring II', ranged: 'Ranged',
};

const LEFT_SLOTS = ['head', 'chest', 'legs', 'boots', 'cloak', 'belt', 'arms'] as const;
const RIGHT_SLOTS = ['weapon', 'offHand', 'ranged', 'gloves', 'amulet', 'ring1', 'ring2', 'trinket'] as const;

function ItemIcon({ item, size = 42, selected = false, onClick, onContextMenu, title }: {
  item: Item; size?: number; selected?: boolean; onClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void; title?: string;
}) {
  const ench = item.enchantId ? ENCHANTS[item.enchantId] : null;
  return (
    <div
      className={`inv-item ${selected ? 'selected' : ''}`}
      style={{ width: size, height: size, borderColor: RARITY_COLOR[item.rarity] }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title ?? `${item.name} (${item.rarity.toUpperCase()})\n${item.desc}${ench ? `\n✦ ${ench.desc}` : ''}\nValue: ${item.value}g · Tier ${item.tier}\n(Right-click to Inspect / Quick Action)`}
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
  const [filter, setFilter] = useState<'all' | 'equipment' | 'consumable' | 'throwable'>('all');
  const party = snap.units.filter((u) => u.team === 'party' && !u.id.startsWith('summon_'));
  const [tab, setTab] = useState(party[0]?.id ?? '');
  const u = party.find((p) => p.id === tab) ?? party[0];
  const sel = snap.inventory.find((i) => i.id === selId) ?? null;

  if (!u) return null;

  const armOnSlot = (slot: string) => {
    if (!sel) return;
    if (sel.kind === 'consumable' && itemUses(sel).length === 0) {
      engine.useConsumable(sel.id, u.id); setSelId(null); return;
    }
    engine.equipItem(u.id, sel.id, canEquipIn(sel, slot) ? slot : undefined);
    setSelId(null);
  };

  const quickEquipOrUse = (item: Item) => {
    if (item.kind === 'consumable' && itemUses(item).length === 0) {
      engine.useConsumable(item.id, u.id);
    } else {
      engine.equipItem(u.id, item.id);
    }
    setSelId(null);
  };

  const xp = xpProgress(u);

  const filteredInventory = snap.inventory.filter((it) => {
    if (filter === 'equipment') return it.kind === 'weapon' || it.kind === 'armor' || it.kind === 'trinket';
    if (filter === 'consumable') return it.kind === 'consumable';
    if (filter === 'throwable') return isThrowable(it);
    return true;
  });

  const renderSlot = (slot: string) => {
    const it = ((u.equipment ?? {}) as Record<string, Item | undefined>)[slot];   // first-spawn units may lack equipment — keep the slot chrome visible
    const fits = sel ? canEquipIn(sel, slot) : false;
    return (
      <div
        key={slot}
        className={`paper-doll-slot ${fits ? 'highlight-fit' : ''} ${sel ? 'armed' : ''}`}
        onClick={sel ? () => armOnSlot(slot) : undefined}
      >
        <div className="slot-info">
          <span className="paper-doll-label">{SLOT_LABEL[slot]}</span>
          <span className="slot-subtext">{it ? it.name : 'Empty'}</span>
        </div>
        {it ? (
          <ItemIcon
            item={it}
            size={40}
            onClick={() => { engine.unequipItem(u.id, slot); }}
            onContextMenu={(e) => { e.preventDefault(); setInspect(it); }}
          />
        ) : (
          <div className="inv-item empty" style={{ width: 40, height: 40 }}>
            <span className="inv-item-icon">{SLOT_ICON[slot]}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="inv-panel">
      <div className="inv-title">
        <span>🎒 HERO INVENTORY & EQUIPMENT</span>
        <span className="inv-gold">🪙 {snap.gold} gold</span>
        <button onClick={() => engine.toggleInventory()}>✕</button>
      </div>

      {/* Party Switcher Tabs */}
      <div className="st-tabs" style={{ marginBottom: 12 }}>
        {party.map((m) => (
          <button key={m.id} className={`st-tab ${m.id === u.id ? 'active' : ''}`} onClick={() => { setTab(m.id); setSelId(null); }}>
            {m.name} · Lv{m.level} · {comboTitleFor(m.classes ?? [])}
          </button>
        ))}
      </div>

      <div className="inv-body-new">
        {/* Left Slots Column */}
        <div className="paper-doll-col left">
          {LEFT_SLOTS.map(renderSlot)}
        </div>

        {/* Center Paperdoll Model View */}
        <div className="paper-doll-center">
          <div className="paper-doll-header">
            <span className="paper-doll-name">{u.name}</span>
            <span className="paper-doll-sub">Lv {u.level} · HP {u.hp}/{effMaxHp(u)} · AC {effAC(u)}</span>
            <div className="xp-bar" title={`${xp.cur}/${xp.need} XP`}><i style={{ width: `${xp.pct * 100}%` }} /></div>
          </div>
          <div className="paper-doll-model">
            <GregDoll unit={u} width={170} height={250} />
          </div>
          <div className="paper-doll-quick-stats">
            <span>🛡️ AC: <b>{effAC(u)}</b></span>
            <span>❤️ Max HP: <b>{effMaxHp(u)}</b></span>
            <span>🏃 Move: <b>{u.moveRange}</b></span>
          </div>
        </div>

        {/* Right Slots Column */}
        <div className="paper-doll-col right">
          {RIGHT_SLOTS.map(renderSlot)}
        </div>

        {/* Backpack Column */}
        <div className="inv-bag-col">
          <div className="inv-bag-header">
            <span className="inv-bag-title">Bag ({snap.inventory.length}/50)</span>
            <div className="inv-filters">
              {(['all', 'equipment', 'consumable', 'throwable'] as const).map((f) => (
                <button
                  key={f}
                  className={`inv-filter-btn ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'equipment' ? 'Gear' : f === 'consumable' ? 'Potions' : 'Throw'}
                </button>
              ))}
            </div>
          </div>

          <div className="inv-bag-new">
            {filteredInventory.length === 0 && <div className="inv-empty">No items match filter</div>}
            {filteredInventory.map((it) => (
              <ItemIcon
                key={it.id}
                item={it}
                selected={selId === it.id}
                onClick={() => setSelId(selId === it.id ? null : it.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  quickEquipOrUse(it);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Selected Bar / Item Details */}
      {sel && (
        <div className="inv-selbar" style={{ borderColor: RARITY_COLOR[sel.rarity] }}>
          <div className="inv-sel-info">
            <span className="inv-sel-name">{sel.icon} <b style={{ color: RARITY_COLOR[sel.rarity] }}>{sel.name}</b></span>
            <span className="inv-sel-desc">{sel.desc}</span>
          </div>
          <div className="inspect-uses">
            {itemUses(sel).map((use) => (
              <span key={use.slot} className="inspect-use">{use.slot}: {use.role} · {formatUseLine(use)}</span>
            ))}
          </div>
          <div className="inv-sel-actions">
            <button className="btn-primary-sm" onClick={() => quickEquipOrUse(sel)}>
              {sel.kind === 'consumable' && itemUses(sel).length === 0 ? 'Use / Drink' : 'Auto Equip'}
            </button>
            <button className="inv-inspect-btn" onClick={() => setInspect(sel)}>Inspect 3D</button>
            <button className="inv-drop-btn" onClick={() => { engine.dropItem(sel.id); setSelId(null); }}>
              Drop
            </button>
          </div>
        </div>
      )}

      {inspect && <ItemInspect item={inspect} onClose={() => setInspect(null)} />}
    </div>
  );
}
