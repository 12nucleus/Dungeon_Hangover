// ─────────────────────────────────────────────────────────────
// Hotbar — BG3-style bottom action bar. A row of permanent default
// actions (Walk/Run/Jump/Throw/Attack) plus up to 12 skill slots.
// The 12 slots are filled from the unit's `hotbarLoadout`, which is
// only editable at the bonfire (see BonfireLoadout). During combat
// the same slots drive selectSkill/targeting.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot } from '@/game/types';
import type { Item } from '@/game/items';
import { SKILLS } from '@/game/skills';
import { ALL_CLASS_SKILLS } from '@/game/classSkills';

interface Props {
  snap: UISnapshot;
  engine: GameEngine;
}

const KEYMAP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

type DefaultAction = 'walk' | 'run' | 'jump' | 'throw' | 'attack' | 'bonusAttack' | 'shove' | 'defend';

/** default actions shown before the 12 skill slots */
const DEFAULTS: { id: DefaultAction; icon: string; label: string }[] = [
  { id: 'walk', icon: '🚶', label: 'Walk' },
  { id: 'run', icon: '🏃', label: 'Run' },
  { id: 'jump', icon: '🦘', label: 'Jump' },
  { id: 'throw', icon: '🎯', label: 'Throw' },
  { id: 'attack', icon: '⚔️', label: 'Attack (weapon)' },
  { id: 'bonusAttack', icon: '🔸', label: 'Bonus Attack' },
  { id: 'shove', icon: '🫸', label: 'Shove' },
];

export function Hotbar({ snap, engine }: Props) {
  const combatActive = snap.units.find((u) => u.id === snap.activeId) ?? null;
  // 3-phase combat: during the enemy phase the bar stays visible but LOCKED —
  // it previews the party member who acts next (grouped rotation ⇒ the first
  // hero in the order) instead of unmounting.
  const enemyTurn = snap.phase === 'combat' && combatActive != null && combatActive.team !== 'party';
  const active = enemyTurn
    ? (snap.units.find((u) => u.id === snap.turnOrder[0]) ?? snap.units.find((u) => u.team === 'party'))
    : (combatActive ?? snap.units.find((u) => u.team === 'party'));
  if (!active) return null;
  const phase = snap.phase;
  const loadout = (active.hotbarLoadout ?? active.equippedSkills) as (string | null)[];
  // persistent item bar — the party's shared usable items, always reachable
  // above the skill bar. Stacks merge by base id; the bar shows max 6 stacks
  // (pinned via ⚙ first, then auto-filled from owned inventory). Click to
  // drink/eat/use on the active hero: free in explore, bonus action in
  // combat. Throwable weapons (the bucket!) offer a 🎯 throw instead.
  const [showPin, setShowPin] = useState(false);
  const inventoryItems = snap.inventory ?? [];
  const stackMap = new Map<string, { key: string; item: Item; count: number }>();
  for (const it of inventoryItems) {
    if (it.kind !== 'consumable' && it.kind !== 'weapon') continue;
    const key = it._baseId ?? it.id;
    const e = stackMap.get(key);
    if (e) e.count++;
    else stackMap.set(key, { key, item: it, count: 1 });
  }
  const ownedKeys = [...stackMap.keys()];
  const pinned = (snap.itemBar ?? []).filter((k) => stackMap.has(k));
  const barKeys = [...pinned, ...ownedKeys.filter((k) => !pinned.includes(k))].slice(0, 6);
  const togglePin = (key: string) => {
    const next = pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key];
    engine.setItemBarLoadout(next);
  };
  const itemBarEditable = !enemyTurn && phase !== 'combat';

  return (
    <div className={`hotbar-stack ${enemyTurn ? 'enemy-phase' : ''}`}>
      {/* usable item bar — above the skill bar, usable any time */}
      {barKeys.length > 0 && (
        <div className={`item-bar ${phase === 'combat' ? '' : 'idle'}`}>
          <span className={`item-bar-label ${phase === 'combat' && snap.turnMode === 'bonus' ? 'on' : ''}`} title="Click an item to use it — free in explore, a bonus action in combat">
            ITEMS
            {itemBarEditable && (
              <button
                className={`item-pin-gear ${showPin ? 'on' : ''}`}
                onClick={() => setShowPin(!showPin)}
                title="Customize which items show here (max 6)"
              >⚙</button>
            )}
          </span>
          <div className="item-bar-slots">
            {barKeys.map((key) => {
              const st = stackMap.get(key)!;
              const isWeapon = st.item.kind === 'weapon';
              return (
                <div key={key} className={`item-slot ${phase === 'combat' && !active.hasBonus ? 'no-bonus' : ''}`}>
                  {isWeapon ? (
                    <button
                      className={`item-throw ${snap.selectedSkill === `THROW:${key}` ? 'on' : ''} ${enemyTurn ? 'disabled' : ''}`}
                      onClick={() => !enemyTurn && engine.startThrow(key)}
                      title={`Throw ${st.item.icon} ${st.item.name} at a unit (bonus action, ${st.item.damageDice ?? '1d4'} ${st.item.damageType ?? 'bludgeoning'})`}
                    >
                      <span className="skill-icon">{st.item.icon}</span>
                      🎯
                      {st.count > 1 && <span className="item-count">{st.count}</span>}
                    </button>
                  ) : (
                    <button
                      className={`item-use ${phase === 'combat' && (!active.hasBonus || enemyTurn) ? 'disabled' : ''}`}
                      onClick={() => !enemyTurn && engine.useConsumable(key, active.id)}
                      title={`${st.item.icon} ${st.item.name} ×${st.count} — ${st.item.desc} (${phase === 'combat' ? 'bonus action' : 'free'})`}
                    >
                      <span className="skill-icon">{st.item.icon}</span>
                      {st.count > 1 && <span className="item-count">{st.count}</span>}
                      {phase === 'combat' && <span className="item-cost">B</span>}
                    </button>
                  )}
                  {!isWeapon && phase === 'combat' && (
                    <button
                      className={`item-throw ${snap.selectedSkill === `THROW:${key}` ? 'on' : ''}`}
                      onClick={() => !enemyTurn && engine.startThrow(key)}
                      title={`Throw ${st.item.name} at a unit (bonus action)`}
                    >🎯</button>
                  )}
                </div>
              );
            })}
          </div>
          {showPin && (
            <div className="item-bar-pop">
              {ownedKeys.length === 0 && <span className="item-bar-pop-empty">No usable items yet.</span>}
              {ownedKeys.map((k) => {
                const st = stackMap.get(k)!;
                const isPinned = pinned.includes(k);
                return (
                  <button
                    key={k}
                    className={`item-pin-row ${isPinned ? 'on' : ''}`}
                    onClick={() => togglePin(k)}
                    title={isPinned ? 'Unpin from the bar' : 'Pin to the bar'}
                  >
                    <span className="skill-icon">{st.item.icon}</span>
                    <span className="item-pin-name">{st.item.name}</span>
                    <span className="item-pin-count">×{st.count}</span>
                    <span className="item-pin-state">{isPinned ? '📌' : '○'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="hotbar-bg3">
      {/* default actions */}
      <div className="hotbar-defaults">
        {DEFAULTS.map((d) => {
          const isAttack = d.id === 'attack';
          const weapon = isAttack ? active.equipment?.weapon : null;
          return (
            <button
              key={d.id}
              className={`skill-btn default ${enemyTurn ? 'disabled' : ''} ${d.id === 'run' && (active as { running?: boolean }).running ? 'on' : ''} ${isAttack && snap.sneaking && phase === 'combat' ? 'backstab' : ''} ${isAttack && active.attackUsed && phase === 'combat' ? 'disabled' : ''}`}
              onClick={() => !enemyTurn && engine.defaultAction(d.id)}
              title={`${isAttack && weapon ? `${weapon.icon} ${weapon.name} — basic attack${snap.sneaking ? ' (Backstab: guaranteed crit)' : ''}` : `${d.label}${d.id === 'run' ? ' [R]' : ''}${d.id === 'bonusAttack' ? ' — a second (bonus-action) strike' : ''}`}`}
            >
              <span className="skill-icon">{weapon ? weapon.icon : d.icon}</span>
              {weapon && <span className="weapon-label">{weapon.name}</span>}
            </button>
          );
        })}
        <span className="hotbar-divider" />
      </div>

      {/* 12 skill slots */}
      <div className="hotbar-skills">
        {Array.from({ length: 12 }).map((_, i) => {
          const sid = loadout[i] ?? null;
          const s = sid ? (SKILLS[sid] ?? ALL_CLASS_SKILLS[sid]) : null;
          const cd = sid ? (active.cooldowns[sid] ?? 0) : 0;
          const unavailable = enemyTurn || (sid && phase === 'combat'
            ? ((s?.cost === 'action' && !active.hasAction) || (s?.cost === 'bonus' && !active.hasBonus) || cd > 0)
            : false);
          const keyLabel = KEYMAP[i];
          return (
            <button
              key={i}
              className={`skill-btn ${sid && snap.selectedSkill === sid ? 'selected' : ''} ${unavailable ? 'disabled' : ''} ${!sid ? 'empty' : ''}`}
              onClick={() => sid && !enemyTurn ? engine.selectSkill(sid) : undefined}
              title={s ? `${s.name} — ${s.desc}${s.cooldown ? ` (CD ${s.cooldown})` : ''} [${keyLabel}]` : `Empty slot [${keyLabel}]`}
            >
              <span className="skill-icon">{s?.icon ?? ''}</span>
              <span className="skill-key">{keyLabel}</span>
              {s?.cost === 'bonus' && <span className="skill-cost">B</span>}
              {cd > 0 && <span className="skill-cd">{cd}</span>}
            </button>
          );
        })}
      </div>

      {/* combat extras — BG3-style phase ring + end turn (locked during the enemy phase).
          Free-flow combat: the ring is an INDICATOR + quick-switch, not a gate —
          clicks already attempt the natural action regardless of phase. */}
      {phase === 'combat' && (
        <div className={`turn-ring ${enemyTurn ? 'locked' : ''}`}>
          <button
            className={`turn-mode ${snap.turnMode === 'walk' ? 'on' : ''}`}
            onClick={() => !enemyTurn && engine.setTurnMode('walk')}
            title="🚶 Movement — click a tile to walk. Free-flow: you can move any time you have steps left.">
            🚶
          </button>
          <button
            className={`turn-mode ${snap.turnMode === 'action' ? 'on' : ''}`}
            onClick={() => !enemyTurn && engine.setTurnMode('action')}
            title="⚔️ Attack — click an enemy to swing your weapon (free, once per turn).">
            ⚔️
          </button>
          <button
            className={`turn-mode ${snap.turnMode === 'bonus' ? 'on' : ''}`}
            onClick={() => !enemyTurn && engine.setTurnMode('bonus')}
            title="🔸 Skills — arm a skill, then click a target. Free-flow: act in any order.">
            🔸
          </button>
          <button className="turn-mode skip" onClick={() => !enemyTurn && engine.skipPhase()} title="⏭ Advance the phase ring (walk → attack → skills → end turn) — or just click to act">
            ⏭
          </button>
          <button
            className={`turn-mode defend ${active.conditions.some((c) => c.id === 'defending') ? 'on' : ''}`}
            onClick={() => !enemyTurn && engine.defaultAction('defend')}
            title="Defensive posture — +1 AC until your next turn (free)">
            🛡️
          </button>
          <button className={`end-turn ${enemyTurn ? 'disabled' : ''}`} onClick={() => !enemyTurn && engine.endTurn()} title="End turn [Space]">
            END<br />TURN
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
