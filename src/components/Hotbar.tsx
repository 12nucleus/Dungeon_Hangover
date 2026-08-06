// ─────────────────────────────────────────────────────────────
// Hotbar — BG3-style bottom action bar. A row of permanent default
// actions (Walk/Run/Jump/Throw/Attack) plus up to 12 skill slots.
// The 12 slots are filled from the unit's `hotbarLoadout`, which is
// only editable at the bonfire (see BonfireLoadout). During combat
// the same slots drive selectSkill/targeting.
// ─────────────────────────────────────────────────────────────
import type { GameEngine } from '@/game/engine';
import type { UISnapshot } from '@/game/types';
import { SKILLS } from '@/game/skills';
import { ALL_CLASS_SKILLS } from '@/game/classSkills';

interface Props {
  snap: UISnapshot;
  engine: GameEngine;
}

const KEYMAP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

type DefaultAction = 'walk' | 'run' | 'jump' | 'throw' | 'attack' | 'bonusAttack';

/** default actions shown before the 12 skill slots */
const DEFAULTS: { id: DefaultAction; icon: string; label: string }[] = [
  { id: 'walk', icon: '🚶', label: 'Walk' },
  { id: 'run', icon: '🏃', label: 'Run' },
  { id: 'jump', icon: '🦘', label: 'Jump' },
  { id: 'throw', icon: '🎯', label: 'Throw' },
  { id: 'attack', icon: '⚔️', label: 'Attack (weapon)' },
  { id: 'bonusAttack', icon: '🔸', label: 'Bonus Attack' },
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
  // persistent consumable/item bar — the party's shared usable items, always
  // reachable above the skill bar. Click to drink/eat/use on the active hero:
  // free in explore, costs the bonus action in combat. In combat each item
  // also offers a Throw (🎯) bonus action.
  const items = (snap.inventory ?? []).filter((i) => i.kind === 'consumable').slice(0, 12);

  return (
    <div className={`hotbar-stack ${enemyTurn ? 'enemy-phase' : ''}`}>
      {/* usable item bar — above the skill bar, usable any time */}
      {items.length > 0 && (
        <div className={`item-bar ${phase === 'combat' ? '' : 'idle'}`}>
          <span className={`item-bar-label ${phase === 'combat' && snap.turnMode === 'bonus' ? 'on' : ''}`} title="Click an item to use it — free in explore, a bonus action in combat">
            ITEMS
          </span>
          <div className="item-bar-slots">
            {items.map((it) => (
              <div key={it.id} className={`item-slot ${phase === 'combat' && !active.hasBonus ? 'no-bonus' : ''}`}>
                <button
                  className={`item-use ${phase === 'combat' && (!active.hasBonus || enemyTurn) ? 'disabled' : ''}`}
                  onClick={() => !enemyTurn && engine.useConsumable(it.id, active.id)}
                  title={`${it.icon} ${it.name} — ${it.desc} (${phase === 'combat' ? 'bonus action' : 'free'})`}
                >
                  <span className="skill-icon">{it.icon}</span>
                  {phase === 'combat' && <span className="item-cost">B</span>}
                </button>
                {phase === 'combat' && (
                  <button
                    className={`item-throw ${snap.selectedSkill === `THROW:${it.id}` ? 'on' : ''}`}
                    onClick={() => !enemyTurn && engine.startThrow(it.id)}
                    title={`Throw ${it.name} at a unit (bonus action)`}
                  >
                    🎯
                  </button>
                )}
              </div>
            ))}
          </div>
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
              className={`skill-btn default ${enemyTurn ? 'disabled' : ''} ${d.id === 'run' && (active as { running?: boolean }).running ? 'on' : ''} ${isAttack && snap.sneaking && phase === 'combat' ? 'backstab' : ''}`}
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

      {/* combat extras — BG3-style phase ring + end turn (locked during the enemy phase) */}
      {phase === 'combat' && (
        <div className={`turn-ring ${enemyTurn ? 'locked' : ''}`}>
          <button
            className={`turn-mode ${snap.turnMode === 'walk' ? 'on' : ''}`}
            onClick={() => !enemyTurn && engine.setTurnMode('walk')}
            title="Movement phase — click a tile to walk">
            🚶
          </button>
          <button
            className={`turn-mode ${snap.turnMode === 'action' ? 'on' : ''}`}
            onClick={() => !enemyTurn && engine.setTurnMode('action')}
            title="Action phase — click an enemy to attack, pick a skill">
            ⚔️
          </button>
          <button
            className={`turn-mode ${snap.turnMode === 'bonus' ? 'on' : ''}`}
            onClick={() => !enemyTurn && engine.setTurnMode('bonus')}
            title="Bonus phase — bonus-cost skills">
            🔸
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
