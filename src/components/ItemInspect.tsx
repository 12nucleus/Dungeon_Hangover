// ─────────────────────────────────────────────────────────────
// ItemInspect — a Fallout-style item viewer: the selected item is
// rendered as a large rotating voxel model with its full stat sheet
// (rarity, tier, damage/AC/heal, enchant, value, description).
// ─────────────────────────────────────────────────────────────
import type { Item } from '@/game/items';
import { ENCHANTS } from '@/game/items';
import { VoxelItemIcon } from './VoxelItemIcon';

const RARITY_COLOR: Record<string, string> = {
  common: '#9ca3af', uncommon: '#4ade80', rare: '#60a5fa', epic: '#c084fc',
};

interface Props {
  item: Item;
  onClose: () => void;
}

export function ItemInspect({ item, onClose }: Props) {
  const ench = item.enchantId ? ENCHANTS[item.enchantId] : null;
  const color = RARITY_COLOR[item.rarity] ?? '#9ca3af';

  return (
    <div className="inspect-overlay" onClick={onClose}>
      <div className="inspect-panel" onClick={(e) => e.stopPropagation()}>
        <div className="inspect-stage">
          <VoxelItemIcon item={item} size={220} spin />
          <div className="inspect-rarity" style={{ color }}>{item.rarity.toUpperCase()}</div>
        </div>
        <div className="inspect-details">
          <div className="inspect-title">
            <h2 style={{ color }}>{item.icon} {item.name}</h2>
            <button onClick={onClose}>✕</button>
          </div>
          <div className="inspect-meta">
            <span>Tier {item.tier}</span>
            <span>{item.kind}</span>
            {item.slot && <span>{item.slot}</span>}
            <span>🪙 {item.value}g</span>
          </div>
          <div className="inspect-stats">
            {item.damageDice && <div className="inspect-stat"><span>Damage</span><b>{item.damageDice} {item.damageType}</b></div>}
            {item.acBonus ? <div className="inspect-stat"><span>Armor</span><b>+{item.acBonus} AC</b></div> : null}
            {item.healDice && <div className="inspect-stat"><span>Heal</span><b>{item.healDice} HP</b></div>}
            {item.condition && <div className="inspect-stat"><span>Cures</span><b>{item.condition}</b></div>}
            {ench && (
              <div className="inspect-stat"><span>Enchant</span><b style={{ color: ench.color }}>{ench.prefix} — {ench.desc}</b></div>
            )}
          </div>
          <p className="inspect-desc">{item.desc}</p>
        </div>
      </div>
    </div>
  );
}
