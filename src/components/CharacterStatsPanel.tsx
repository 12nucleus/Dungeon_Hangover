// ─────────────────────────────────────────────────────────────
// CharacterStatsPanel — a detailed readout of the selected hero's
// combat stats: level / XP, the six (renamed) abilities with their
// modifiers, effective HP/AC/movement/attack, and any active
// buffs/debuffs. Toggled via the HUD (engine.toggleStats).
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot, Ability } from '@/game/types';
import { effAC, effMove, effMaxHp, effAtkBonus, xpProgress, MAX_LEVEL } from '@/game/stats';
import { ABILITY_LABELS, ABILITY_HINTS } from '@/game/abilityLabels';
import { comboTitleFor } from '@/game/classes';

interface Props {
  snap: UISnapshot;
  engine: GameEngine;
}

const ABIL_ORDER: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// condition id → (emoji, colour) so buffs/debuffs render distinctly
const COND_META: Record<string, { icon: string; kind: 'buff' | 'debuff' }> = {
  blessed: { icon: '✨', kind: 'buff' },
  shielded: { icon: '🛡️', kind: 'buff' },
  hasted: { icon: '⚡', kind: 'buff' },
  raging: { icon: '😡', kind: 'buff' },
  slowed: { icon: '🐌', kind: 'debuff' },
  burning: { icon: '🔥', kind: 'debuff' },
  poisoned: { icon: '☠️', kind: 'debuff' },
  bleeding: { icon: '🩸', kind: 'debuff' },
  frightened: { icon: '😨', kind: 'debuff' },
  blinded: { icon: '🙈', kind: 'debuff' },
};

export function CharacterStatsPanel({ snap, engine }: Props) {
  const party = snap.units.filter((u) => u.team === 'party');
  const [tab, setTab] = useState(party[0]?.id ?? '');
  const u = party.find((p) => p.id === tab) ?? party[0];
  if (!u) return null;

  const xp = xpProgress(u);
  const xpLabel = u.level >= MAX_LEVEL ? 'STONE COLD SOBER' : `${xp.cur}/${xp.need} XP`;
  const buffs = u.conditions.filter((c) => COND_META[c.id]?.kind === 'buff');
  const debuffs = u.conditions.filter((c) => COND_META[c.id]?.kind === 'debuff');
  const otherConds = u.conditions.filter((c) => !COND_META[c.id]);
  const weapon = u.equipment.weapon;

  const abilityMod = (k: Ability) => Math.floor((u.abilities[k] - 10) / 2);

  return (
    <div className="stats-panel">
      <div className="stats-title">
        <span>📊 CHARACTER STATS</span>
        <button onClick={() => engine.toggleStats()}>✕</button>
      </div>

      <div className="st-tabs" style={{ marginBottom: 8 }}>
        {party.map((m) => (
          <button key={m.id} className={`st-tab ${m.id === u.id ? 'active' : ''}`} onClick={() => setTab(m.id)}>
            {m.name} · Sobriety {m.level} · {comboTitleFor(m.classes ?? [])}
          </button>
        ))}
      </div>

      <div className="stats-hero">
        <div className="stats-hero-name">
          <b>{u.name}</b> <em>{comboTitleFor(u.classes ?? [])}</em>
        </div>
        <div className="xp-bar stats-xp" title={`${xpLabel}`}><i style={{ width: `${xp.pct * 100}%` }} /></div>
        <div className="stats-xp-label">{xpLabel} · Sobriety {u.level}</div>
      </div>

      {/* combat summary */}
      <div className="stats-grid">
        <div className="stat-cell"><span>HP</span><b>{u.hp}/{effMaxHp(u)}</b></div>
        <div className="stat-cell"><span>AC</span><b>{effAC(u)}</b></div>
        <div className="stat-cell"><span>Move</span><b>{effMove(u)}</b></div>
        <div className="stat-cell"><span>Atk Bonus</span><b>{effAtkBonus(u) >= 0 ? `+${effAtkBonus(u)}` : effAtkBonus(u)}</b></div>
        <div className="stat-cell"><span>Weapon</span><b className="stat-weapon">{weapon ? `${weapon.icon} ${weapon.name}` : 'Fists'}</b></div>
        <div className="stat-cell"><span>Damage</span><b>{weapon?.damageDice ?? '1d4'}</b></div>
      </div>

      {/* abilities */}
      <div className="stats-abilities">
        {ABIL_ORDER.map((k) => {
          const m = abilityMod(k);
          return (
            <div key={k} className="stat-ability" title={ABILITY_HINTS[k]}>
              <span className="sa-label">{ABILITY_LABELS[k]}</span>
              <span className="sa-value">{u.abilities[k]}</span>
              <span className={`sa-mod ${m >= 0 ? 'pos' : 'neg'}`}>{m >= 0 ? `+${m}` : m}</span>
            </div>
          );
        })}
      </div>

      {/* buffs / debuffs */}
      <div className="stats-conds">
        <div className="stats-cond-row">
          <span className="stats-cond-label">Buffs</span>
          {buffs.length === 0 && <span className="stats-cond-none">none</span>}
          {buffs.map((c) => (
            <span key={c.id} className="cond-chip buff">{COND_META[c.id].icon} {c.name} ({c.roundsLeft})</span>
          ))}
        </div>
        <div className="stats-cond-row">
          <span className="stats-cond-label">Debuffs</span>
          {debuffs.length === 0 && <span className="stats-cond-none">none</span>}
          {debuffs.map((c) => (
            <span key={c.id} className="cond-chip debuff">{COND_META[c.id].icon} {c.name} ({c.roundsLeft})</span>
          ))}
        </div>
        {otherConds.length > 0 && (
          <div className="stats-cond-row">
            <span className="stats-cond-label">Other</span>
            {otherConds.map((c) => (
              <span key={c.id} className="cond-chip neutral">{c.name} ({c.roundsLeft})</span>
            ))}
          </div>
        )}
      </div>

      <div className="stats-footer">AC & move include gear · ability scores set at creation</div>
    </div>
  );
}
