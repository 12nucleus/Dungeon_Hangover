// ─────────────────────────────────────────────────────────────
// Skill tree — Skyrim-style constellation. Each branch is a
// column of stars against a night sky: tier 1 at the BOTTOM,
// tier 3 at the TOP, with SVG require-edges that ignite gold
// once both endpoints are mastered. Clicking a star inspects it
// in the detail card; clicking an available (haloed) star a
// second time — or the Unlock button — spends the points via
// engine.unlockNode. Party tabs + the 12-slot loadout bar are
// kept below the sky.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot, Unit } from '@/game/types';
import { SKILLS } from '@/game/skills';
import { ALL_CLASS_SKILLS } from '@/game/classSkills';
import { treeFor, canUnlock } from '@/game/skilltree';
import type { SkillNode } from '@/game/skilltree';
import { comboTitleFor } from '@/game/classes';

interface Props { snap: UISnapshot; engine: GameEngine; }

/* constellation geometry (px, deterministic — nodes + SVG share it) */
const CW = 210;          // branch column width
const GAP = 54;          // gap between branch columns
const ROW_H = 130;       // vertical spacing between tiers
const TOP = 96;          // y of tier 5 (the apex)
const PADX = 44;         // horizontal padding inside the sky
const PADB = 96;         // padding below tier 1

/* lateral zig-zag per tier so chains read like constellations,
   not ladders (fraction of CW, relative to the branch centre) */
const XOFF: Record<number, number> = { 5: -0.17, 4: 0.15, 3: -0.07, 2: 0.15, 1: -0.07 };
const ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

type NodeState = 'unlocked' | 'avail' | 'locked';

function stateOf(u: Unit, n: SkillNode): NodeState {
  if (u.unlockedNodes.includes(n.id)) return 'unlocked';
  return canUnlock(u, n) === null ? 'avail' : 'locked';
}

export function SkillTreePanel({ snap, engine }: Props) {
  const party = snap.units.filter((u) => u.team === 'party');
  const [tab, setTab] = useState(party[0]?.id ?? '');
  const [selId, setSelId] = useState<string | null>(null);

  const u = party.find((p) => p.id === tab) ?? party[0];

  /* branch columns + node positions, recomputed per hero */
  const layout = useMemo(() => {
    if (!u) return null;
    const tree = treeFor(u);
    const branches: string[] = [];
    for (const n of tree) if (!branches.includes(n.branch)) branches.push(n.branch);
    const pos = new Map<string, { x: number; y: number; node: SkillNode }>();
    for (const n of tree) {
      const bi = branches.indexOf(n.branch);
      pos.set(n.id, {
        x: PADX + bi * (CW + GAP) + CW / 2 + (XOFF[n.tier] ?? 0) * CW,
        y: TOP + (5 - n.tier) * ROW_H,
        node: n,
      });
    }
    const w = PADX * 2 + branches.length * CW + (branches.length - 1) * GAP;
    const h = TOP + 4 * ROW_H + PADB;
    return { tree, branches, pos, w, h };
  }, [u]);

  if (!u || !layout) return null;
  const { tree, branches, pos, w: skyW, h: skyH } = layout;

  const sel = selId ? tree.find((n) => n.id === selId) ?? null : null;
  const selState = sel ? stateOf(u, sel) : null;
  const selReason = sel && selState !== 'unlocked' ? canUnlock(u, sel) : null;

  const clickNode = (n: SkillNode) => {
    const st = stateOf(u, n);
    if (sel?.id === n.id && st === 'avail') {
      engine.unlockNode(u.id, n.id);
      return;
    }
    setSelId(n.id);
  };
  return (
    <div className="stc-overlay">
      <div className="stc-panel">
        <div className="stc-header">
          <span className="stc-title">✦ Constellation of Talents</span>
          <span className="stc-header-sp">
            <b>🪙 {u.skillPoints}</b> skill point{u.skillPoints !== 1 ? 's' : ''}
          </span>
          <button className="stc-close" onClick={() => engine.toggleSkillTree()}>✕</button>
        </div>

        {/* party tabs */}
        <div className="st-tabs">
          {party.map((m) => (
            <button
              key={m.id}
              className={`st-tab ${m.id === u.id ? 'active' : ''}`}
              onClick={() => { setTab(m.id); setSelId(null); }}
            >
              {m.name} · Lv{m.level} · {comboTitleFor(m.classes ?? [])}
              <span className="st-sp">🪙 {m.skillPoints} SP</span>
            </button>
          ))}
        </div>

        <div className="stc-main">
          {/* the night sky */}
          <div className="stc-sky-scroll">
            <div className="stc-sky" style={{ width: skyW, height: skyH }}>
              {/* require-edges */}
              <svg className="stc-edges" width={skyW} height={skyH} viewBox={`0 0 ${skyW} ${skyH}`}>
                <defs>
                  <filter id="stc-glow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="2.6" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {tree.flatMap((n) =>
                  (n.requires ?? []).map((req) => {
                    const a = pos.get(req);
                    const b = pos.get(n.id);
                    if (!a || !b) return null;
                    const aState = stateOf(u, a.node);
                    const bState = stateOf(u, b.node);
                    const cls =
                      aState === 'unlocked' && bState === 'unlocked' ? 'lit'
                      : (aState === 'unlocked' && bState === 'avail') || (aState === 'avail' && bState === 'unlocked') ? 'flow'
                      : '';
                    return (
                      <line
                        key={`${req}-${n.id}`}
                        className={`stc-edge ${cls}`}
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      />
                    );
                  }),
                )}
              </svg>

              {/* branch + tier labels */}
              {branches.map((b, bi) => {
                const cx = PADX + bi * (CW + GAP) + CW / 2;
                return (
                  <div key={b}>
                    <div className="stc-branch-name" style={{ left: cx, top: 20 }}>{b}</div>
                    <div className="stc-branch-sub" style={{ left: cx, top: 42 }}>constellation</div>
                  </div>
                );
              })}
              {([5, 4, 3, 2, 1] as const).map((t) => (
                <div key={t} className="stc-tier-label" style={{ left: 10, top: TOP + (5 - t) * ROW_H }}>
                  TIER {ROMAN[t]}
                </div>
              ))}

              {/* the stars */}
              {tree.map((n) => {
                const p = pos.get(n.id)!;
                const st = stateOf(u, n);
                const reason = st === 'unlocked' ? null : canUnlock(u, n);
                return (
                  <div
                    key={n.id}
                    className={`stc-node t${n.tier} ${st} ${sel?.id === n.id ? 'sel' : ''}`}
                    style={{ left: p.x, top: p.y }}
                  >
                    <div className="stc-star-wrap">
                      <button
                        className="stc-star"
                        onClick={() => clickNode(n)}
                        title={
                          st === 'avail'
                            ? `${n.name} — click to inspect, click again to unlock (${n.cost} SP)`
                            : st === 'locked'
                              ? `${n.name} — ${reason}`
                              : `${n.name} — mastered`
                        }
                      >
                        <span>{n.icon}</span>
                      </button>
                    </div>
                    <div className="stc-node-tag">
                      <div className="stc-node-name">{n.name}</div>
                      {st !== 'unlocked' && <div className="stc-node-cost">◈ {n.cost} SP</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* detail card */}
          <aside className={`stc-detail ${selState ?? ''}`}>
            {!sel && (
              <div className="stc-detail-empty">
                <div>Choose a star to read its fate.</div>
                <div className="stc-legend">
                  <div className="stc-legend-row"><span className="stc-legend-dot lit" /> Mastered</div>
                  <div className="stc-legend-row"><span className="stc-legend-dot avail" /> Within reach</div>
                  <div className="stc-legend-row"><span className="stc-legend-dot dim" /> Beyond your grasp</div>
                </div>
              </div>
            )}
            {sel && (
              <>
                <div className="stc-detail-head">
                  <div className="stc-detail-icon">{sel.icon}</div>
                  <div>
                    <div className="stc-detail-name">{sel.name}</div>
                    <div className="stc-detail-sub">{sel.branch} · Tier {ROMAN[sel.tier]}</div>
                  </div>
                </div>
                <span className="stc-detail-kind">{sel.unlockSkill ? 'Skill' : 'Passive'}</span>
                <div className="stc-detail-desc">{sel.desc}</div>
                <div className="stc-detail-cost">◈ Costs {sel.cost} skill point{sel.cost > 1 ? 's' : ''}</div>
                <div className="stc-detail-status">
                  {selState === 'unlocked' && <div className="stc-status-mastered">✦ Mastered</div>}
                  {selState === 'avail' && (
                    <>
                      <button className="btn-primary btn-sm stc-unlock-btn" onClick={() => engine.unlockNode(u.id, sel.id)}>
                        ✦ Unlock — {sel.cost} SP
                      </button>
                      <div className="stc-unlock-hint">or click the star again</div>
                    </>
                  )}
                  {selState === 'locked' && <div className="stc-status-reason">{selReason}</div>}
                </div>
              </>
            )}
          </aside>
        </div>

        {/* loadout (max 12) */}
        <div className="st-loadout">
          <div className="st-loadout-title">Loadout — {u.equippedSkills.length}/12 equipped</div>
          <div className="st-loadout-skills">
            {u.knownSkills.map((sid) => {
              const s = SKILLS[sid] ?? ALL_CLASS_SKILLS[sid];
              if (!s) return null;
              const equippedIdx = u.equippedSkills.indexOf(sid);
              const isEquipped = equippedIdx >= 0;
              return (
                <button
                  key={sid}
                  className={`st-skill-chip ${isEquipped ? 'equipped' : ''}`}
                  onClick={() => {
                    if (isEquipped) engine.unequipSkill(u.id, sid);
                    else engine.equipSkill(u.id, sid);
                  }}
                  title={`${s.name} — ${s.desc}${isEquipped ? ` [slot ${equippedIdx + 1}]` : ' (click to equip)'}`}
                >
                  <span className="st-chip-icon">{s.icon}</span>
                  <span className="st-chip-name">{s.name}</span>
                  {isEquipped && <span className="st-chip-slot">{equippedIdx + 1}</span>}
                </button>
              );
            })}
          </div>
          {u.equippedSkills.length === 0 && <div className="st-loadout-empty">No skills equipped — click a skill above to add it to the hotbar.</div>}
        </div>

        <div className="st-footer">
          {u.skillPoints > 0 && <span className="st-sp-rem">🪙 {u.skillPoints} skill point{u.skillPoints !== 1 ? 's' : ''} remaining — spend them among the stars</span>}
          {u.skillPoints === 0 && <span className="st-sp-spent">All skill points spent. Level up to earn more!</span>}
        </div>
      </div>
    </div>
  );
}
