// ─────────────────────────────────────────────────────────────
// CharacterCreationPanel — the dungeon-wake builder shown on
// phase='creation'. D&D-style point-buy across 6 abilities, pick 2
// of the 15 classes (with pros/cons + in-engine voxel portrait),
// then pick 2 starting skills from the chosen classes' Tier-1 sets.
// Confirm → engine.confirmCharacterCreation(build) → Greg stands up.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import type { GameEngine } from '@/game/engine';
import { CLASSES, classById } from '@/game/classes';
import { ALL_CLASS_SKILLS, tier1SkillsFor } from '@/game/classSkills';
import type { Ability, CharacterBuild, ClassId } from '@/game/types';
import { ABILITY_LABELS, ABILITY_HINTS } from '@/game/abilityLabels';
import { ClassPortrait } from './ClassPortrait';

interface Props {
  engine: GameEngine;
}

// Six classic D&D abilities renamed for a tavern-wake setting: mechanical
// meaning kept (str=power, dex=accuracy, con=hp...) but they read as things a
// hungover idiot would actually believe about himself. Labels shared via
// abilityLabels.ts so the stats panel agrees.
const ABILITIES: { key: Ability; label: string; hint: string }[] = (
  ['str', 'dex', 'con', 'int', 'wis', 'cha'] as Ability[]
).map((key) => ({ key, label: ABILITY_LABELS[key], hint: ABILITY_HINTS[key] }));

const BASE = 8;
const POOL = 14;
const MIN = 8;
const MAX = 15;

export function CharacterCreationPanel({ engine }: Props) {
  const [step, setStep] = useState<'stats' | 'classes' | 'skills'>('stats');
  const [stats, setStats] = useState<Record<Ability, number>>({
    str: BASE, dex: BASE, con: BASE, int: BASE, wis: BASE, cha: BASE,
  });
  const [classes, setClasses] = useState<ClassId[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const spent = useMemo(() => ABILITIES.reduce((s, a) => s + (stats[a.key] - BASE), 0), [stats]);
  const remaining = POOL - spent;

  // skills available from the chosen classes' Tier-1 pools
  const availableSkills = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; icon: string; cls: string }>();
    for (const cid of classes) {
      for (const sk of tier1SkillsFor(cid)) {
        if (!seen.has(sk.id)) {
          const cls = classById(cid);
          seen.set(sk.id, { id: sk.id, name: sk.name, icon: sk.icon, cls: cls?.name ?? cid });
        }
      }
    }
    return [...seen.values()];
  }, [classes]);

  const bump = (k: Ability, d: number) => {
    setStats((s) => {
      const next = s[k] + d;
      if (next < MIN || next > MAX) return s;
      if (d > 0 && spent >= POOL) return s;
      return { ...s, [k]: next };
    });
  };

  const toggleClass = (cid: ClassId) => {
    const wasSelected = classes.includes(cid);
    setClasses((cur) => {
      if (cur.includes(cid)) return cur.filter((c) => c !== cid);
      if (cur.length >= 2) return cur;
      return [...cur, cid];
    });
    setSelectedSkills([]);
    // Narrator introduces the class the moment the player picks it (mp3 only).
    if (!wasSelected) engine.playClassNarration(cid);
  };

  const toggleSkill = (id: string) => {
    setSelectedSkills((cur) => {
      if (cur.includes(id)) return cur.filter((s) => s !== id);
      if (cur.length >= 2) return cur;
      return [...cur, id];
    });
  };

  const canConfirm =
    classes.length === 2 && selectedSkills.length === 2 && remaining === 0;

  // Step tabs: jumping forward is gated the same way the Next button is;
  // jumping back is always allowed (no data loss). Disabled tabs explain why.
  const canJumpTo = (target: 'stats' | 'classes' | 'skills') => {
    if (target === 'stats') return true;
    if (target === 'classes') return remaining === 0;
    return classes.length === 2;
  };
  const jumpTo = (target: 'stats' | 'classes' | 'skills') => {
    if (canJumpTo(target)) setStep(target);
  };
  const stepDone = (id: 'stats' | 'classes' | 'skills') =>
    id === 'classes' ? remaining === 0 : id === 'skills' ? classes.length === 2 : false;

  const confirm = () => {
    const build: CharacterBuild = {
      classes: [classes[0], classes[1]],
      abilities: { ...stats },
      skills: [...selectedSkills],
      hotbarLoadout: [...selectedSkills, ...Array(10).fill(null)],
    };
    engine.confirmCharacterCreation(build);
  };

  return (
    <div className="creation-overlay">
      <div className="creation-panel">
        <div className="creation-header">
          <div className="creation-rune">◆ ◆ ◆</div>
          <h1>WHO THE HELL AM I?</h1>
          <p>Greg the Dim, apparently. Time to remember what that means.</p>
          <div className="creation-steps" role="tablist" aria-label="Creation steps">
            {([
              { id: 'stats', label: '1 · Ability Scores' },
              { id: 'classes', label: '2 · Two Classes' },
              { id: 'skills', label: '3 · Starting Skills' },
            ] as const).map((t) => {
              const active = step === t.id;
              const ready = canJumpTo(t.id);
              const done = stepDone(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`step-tab ${active ? 'on' : ''} ${done && !active ? 'done' : ''}`}
                  disabled={!ready}
                  onClick={() => jumpTo(t.id)}
                  title={!ready ? (t.id === 'classes' ? 'Spend all 14 points first' : 'Pick both classes first') : undefined}
                >
                  {done && !active ? '✓ ' : ''}{t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 1 — stats */}
        {step === 'stats' && (
          <div className="creation-step">
            <h2>Ability Scores</h2>
            <p className="creation-sub">Spend {POOL} points. Each point raises a score by 1 (min {MIN}, max {MAX}).</p>
            <div className="ability-grid">
              {ABILITIES.map((a) => (
                <div key={a.key} className="ability-row">
                  <div className="ability-name">
                    <strong>{a.label}</strong>
                    <span>{a.hint}</span>
                  </div>
                  <div className="ability-controls">
                    <button disabled={stats[a.key] <= MIN} onClick={() => bump(a.key, -1)}>−</button>
                    <span className="ability-value">{stats[a.key]}</span>
                    <button disabled={stats[a.key] >= MAX || remaining <= 0} onClick={() => bump(a.key, 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="creation-footer">
              <span className={`points-left ${remaining === 0 ? 'ok' : ''}`}>{remaining} points left</span>
              <button className="btn-primary" disabled={remaining !== 0} onClick={() => setStep('classes')}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — classes */}
        {step === 'classes' && (
          <div className="creation-step">
            <h2>Choose Two Classes</h2>
            <p className="creation-sub">Pick 2 of the 15. Your build is a hybrid — choose wisely.</p>
            <div className="class-grid">
              {CLASSES.map((c) => {
                const selected = classes.includes(c.id);
                const full = classes.length >= 2 && !selected;
                return (
                  <button
                    key={c.id}
                    className={`class-card ${selected ? 'selected' : ''} ${full ? 'dim' : ''}`}
                    onClick={() => toggleClass(c.id)}
                  >
                    <div className="class-card-portrait">
                      <ClassPortrait scheme={c.portrait.scheme} weapon={c.portrait.weapon} width={150} height={205} />
                      {selected && <div className="class-pick">✓</div>}
                    </div>
                    <div className="class-card-body">
                      <div className="class-card-title">
                        <span className="class-icon">{c.icon}</span>
                        <strong>{c.name}</strong>
                        <em>{c.tagline}</em>
                      </div>
                      <div className="class-role">{c.role}</div>
                      <div className="class-lore">{c.lore}</div>
                      <div className="class-pros">
                        <span>Pros</span>
                        <ul>{c.pros.map((p) => <li key={p}>• {p}</li>)}</ul>
                      </div>
                      <div className="class-cons">
                        <span>Cons</span>
                        <ul>{c.cons.map((p) => <li key={p}>• {p}</li>)}</ul>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="creation-footer">
              <button className="btn-ghost" onClick={() => setStep('stats')}>← Back</button>
              <span className={`points-left ${classes.length === 2 ? 'ok' : ''}`}>{classes.length}/2 classes</span>
              <button className="btn-primary" disabled={classes.length !== 2} onClick={() => setStep('skills')}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — skills */}
        {step === 'skills' && (
          <div className="creation-step">
            <h2>Starting Skills</h2>
            <p className="creation-sub">Choose 2 skills from your two classes' Tier-1 pools.</p>
            <div className="skill-grid">
              {availableSkills.map((sk) => {
                const selected = selectedSkills.includes(sk.id);
                const full = selectedSkills.length >= 2 && !selected;
                const def = ALL_CLASS_SKILLS[sk.id];
                return (
                  <button
                    key={sk.id}
                    className={`skill-card ${selected ? 'selected' : ''} ${full ? 'dim' : ''}`}
                    onClick={() => toggleSkill(sk.id)}
                  >
                    <span className="skill-icon">{sk.icon}</span>
                    <div className="skill-info">
                      <strong>{sk.name}</strong>
                      <em>{sk.cls}</em>
                      <p>{def?.desc ?? ''}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="creation-footer">
              <button className="btn-ghost" onClick={() => setStep('classes')}>← Back</button>
              <span className={`points-left ${selectedSkills.length === 2 ? 'ok' : ''}`}>{selectedSkills.length}/2 skills</span>
              <button className="btn-primary" disabled={!canConfirm} onClick={confirm}>
                ⚔ Stand Up & Begin
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
