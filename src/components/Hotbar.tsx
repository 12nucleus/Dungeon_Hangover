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

type DefaultAction = 'walk' | 'run' | 'jump' | 'throw' | 'attack';

/** default actions shown before the 12 skill slots */
const DEFAULTS: { id: DefaultAction; icon: string; label: string }[] = [
  { id: 'walk', icon: '🚶', label: 'Walk' },
  { id: 'run', icon: '🏃', label: 'Run' },
  { id: 'jump', icon: '🦘', label: 'Jump' },
  { id: 'throw', icon: '🎯', label: 'Throw' },
  { id: 'attack', icon: '⚔️', label: 'Attack' },
];

export function Hotbar({ snap, engine }: Props) {
  const active = snap.units.find((u) => u.id === snap.activeId) ?? snap.units.find((u) => u.team === 'party');
  if (!active || active.team !== 'party') return null;
  const phase = snap.phase;
  const loadout = (active.hotbarLoadout ?? active.equippedSkills) as (string | null)[];

  return (
    <div className="hotbar-bg3">
      {/* default actions */}
      <div className="hotbar-defaults">
        {DEFAULTS.map((d) => (
          <button
            key={d.id}
            className={`skill-btn default ${d.id === 'run' && (active as { running?: boolean }).running ? 'on' : ''}`}
            onClick={() => engine.defaultAction(d.id)}
            title={`${d.label}${d.id === 'run' ? ' [R]' : ''}`}
          >
            <span className="skill-icon">{d.icon}</span>
          </button>
        ))}
        <span className="hotbar-divider" />
      </div>

      {/* 12 skill slots */}
      <div className="hotbar-skills">
        {Array.from({ length: 12 }).map((_, i) => {
          const sid = loadout[i] ?? null;
          const s = sid ? (SKILLS[sid] ?? ALL_CLASS_SKILLS[sid]) : null;
          const cd = sid ? (active.cooldowns[sid] ?? 0) : 0;
          const unavailable = sid && phase === 'combat'
            ? ((s?.cost === 'action' && !active.hasAction) || (s?.cost === 'bonus' && !active.hasBonus) || cd > 0)
            : false;
          const keyLabel = KEYMAP[i];
          return (
            <button
              key={i}
              className={`skill-btn ${sid && snap.selectedSkill === sid ? 'selected' : ''} ${unavailable ? 'disabled' : ''} ${!sid ? 'empty' : ''}`}
              onClick={() => sid ? engine.selectSkill(sid) : undefined}
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

      {/* combat extras */}
      {phase === 'combat' && (
        <button className="end-turn" onClick={() => engine.endTurn()} title="End turn [Space]">
          END<br />TURN
        </button>
      )}
    </div>
  );
}
