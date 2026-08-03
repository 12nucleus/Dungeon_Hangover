// ─────────────────────────────────────────────────────────────
// BonfireLoadout — the bonfire-only editor for the 12 hotbar
// slots. Lists the party leader's known skills (both the existing
// SKILLS pool and the 15-class Tier-1 pools) and lets the player
// assign them to the BG3-style hotbar. Only reachable while resting.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot } from '@/game/types';
import { SKILLS } from '@/game/skills';
import { ALL_CLASS_SKILLS, classPoolSkillIds } from '@/game/classSkills';
import { classById } from '@/game/classes';
import { minLevelForSkill } from '@/game/stats';

interface Props {
  snap: UISnapshot;
  engine: GameEngine;
}

const KEYMAP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export function BonfireLoadout({ snap, engine }: Props) {
  const hero = snap.units.find((u) => u.team === 'party');
  const [slots, setSlots] = useState<(string | null)[]>(
    hero?.hotbarLoadout ?? hero?.equippedSkills ?? Array(12).fill(null),
  );

  // Every skill the leader can eventually learn: the ones they know now
  // (assignable) plus the full class pool they have NOT reached the level
  // for yet (shown greyed-out with a level badge). `known` membership is
  // the level gate — creation picks enter knownSkills at Lv1, the class
  // pool hydrates on level-up (tier-1 → Lv2, tier-2 → Lv3, tier-3+ → Lv4).
  const known = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; icon: string; cls: string; desc: string; minLevel: number; known: boolean }>();
    const add = (id: string, known: boolean) => {
      if (seen.has(id)) return;
      const s = SKILLS[id] ?? ALL_CLASS_SKILLS[id];
      if (!s) return;
      const cls = s.classId ? (classById(s.classId)?.name ?? s.classId) : 'Base';
      seen.set(id, { id, name: s.name, icon: s.icon, cls, desc: s.desc, minLevel: minLevelForSkill(s), known });
    };
    for (const id of hero?.knownSkills ?? []) add(id, true);
    for (const id of classPoolSkillIds(hero?.classes ?? [])) add(id, false);
    return [...seen.values()];
  }, [hero]);

  if (!hero) return null;

  const setSlot = (i: number, id: string | null) => {
    const next = [...slots];
    // remove this skill from any other slot so each appears once
    if (id) {
      for (let k = 0; k < next.length; k++) if (next[k] === id) next[k] = null;
    }
    next[i] = id;
    setSlots(next);
  };

  const save = () => {
    engine.setHotbarLoadout(slots);
    engine.toggleBonfireLoadout();
  };

  return (
    <div className="bl-overlay">
      <div className="bl-panel">
        <div className="bl-header">
          <span>🎒 LOADOUT — {hero.name}</span>
          <button onClick={() => engine.toggleBonfireLoadout()}>✕</button>
        </div>
        <p className="bl-hint">
          Assign up to 12 skills to your hotbar (BG3 style). Slot the ones you'll actually use.
        </p>

        {/* the 12 slots */}
        <div className="bl-slots">
          {Array.from({ length: 12 }).map((_, i) => {
            const id = slots[i];
            const s = id ? (SKILLS[id] ?? ALL_CLASS_SKILLS[id]) : null;
            return (
              <button
                key={i}
                className={`skill-btn ${id ? '' : 'empty'}`}
                onClick={() => setSlot(i, null)}
                title={s ? `${s.name} — ${s.desc}` : `Slot ${i + 1} [${KEYMAP[i]}]`}
              >
                <span className="skill-icon">{s?.icon ?? ''}</span>
                <span className="skill-key">{KEYMAP[i]}</span>
              </button>
            );
          })}
        </div>

        {/* known skills to assign */}
        <div className="bl-known">
          <div className="bl-known-title">Known Skills</div>
          <div className="bl-known-grid">
            {known.map((sk) => {
              const already = slots.includes(sk.id);
              const locked = !sk.known;
              return (
                <button
                  key={sk.id}
                  className={`bl-skill ${already ? 'used' : ''} ${locked ? 'locked' : ''}`}
                  disabled={locked}
                  onClick={() => {
                    if (locked) return;
                    // already on the bar → remove it; otherwise place in first empty slot
                    if (already) {
                      setSlot(slots.indexOf(sk.id), null);
                    } else {
                      const empty = slots.findIndex((x) => x === null);
                      if (empty >= 0) setSlot(empty, sk.id);
                    }
                  }}
                  title={locked ? `${sk.name} — unlocks at level ${sk.minLevel}` : `${sk.name} — ${sk.desc}`}
                >
                  <span className="bl-skill-icon">{locked ? '🔒' : sk.icon}</span>
                  <div>
                    <strong>{sk.name}</strong>
                    <em>{sk.cls}</em>
                  </div>
                  {locked && <span className="bl-lock">Lv {sk.minLevel}</span>}
                  {!locked && already && <span className="bl-used">on bar</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bl-footer">
          <button className="btn-primary" onClick={save}>✓ Save Loadout</button>
          <button className="btn-ghost" onClick={() => engine.toggleBonfireLoadout()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
