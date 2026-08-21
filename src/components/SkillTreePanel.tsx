import { useMemo, useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot, Unit } from '@/game/types';
import { SKILLS } from '@/game/skills';
import { ALL_CLASS_SKILLS } from '@/game/classSkills';
import { treeFor, canUnlock } from '@/game/skilltree';
import type { SkillNode } from '@/game/skilltree';
import { activeCombos, comboForSkill, COMBOS } from '@/game/skillCombos';
import { comboTitleFor } from '@/game/classes';

interface Props { snap: UISnapshot; engine: GameEngine; }

/* Layout grid: tier bands stack top-down (I → V), one column per branch.
   Stars sit on each branch's spine; the capstone crowns the whole class
   in a full-width band below tier V. Vertical scroll only. */
const GUTTER = 64;      // left gutter holding tier labels
const COLW = 224;       // one branch column
const SPINE_X = 46;     // star center inside a column
const ROW_H = 46;       // vertical rhythm per node
const BAND_PAD = 15;    // breathing room above/below a tier band
const TOP_PAD = 10;
const CAP_BAND = 104;   // capstone crown band
const ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
const TIER_LVL: Record<number, string> = { 1: 'Lv 1+', 2: 'Lv 11+', 3: 'Lv 21+', 4: 'Lv 31+', 5: 'Lv 41+' };

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
  const classes = (u?.classes ?? []).slice(0, 2);
  const [classTab, setClassTab] = useState(classes[0] ?? '');
  const activeClass = classes.includes(classTab) ? classTab : classes[0] ?? '';

  const layout = useMemo(() => {
    if (!u || !activeClass) return null;
    const tree = treeFor(u).filter((node) => node.classId === activeClass);
    const branches: string[] = [];
    for (const node of tree) {
      if (node.capstone || node.branchId.endsWith(':mastery')) continue;
      if (!branches.includes(node.branchId)) branches.push(node.branchId);
    }
    const capstone = tree.find((node) => node.capstone) ?? null;

    // tier bands top-down; band height fits the fullest branch cell
    const cellSize: Record<number, number> = {};
    for (const node of tree) {
      if (node.capstone) continue;
      const inCell = tree.filter((c) => !c.capstone && c.branchId === node.branchId && c.tier === node.tier).length;
      cellSize[node.tier] = Math.max(cellSize[node.tier] ?? 1, inCell);
    }
    const bandTop: Record<number, number> = {};
    let y = TOP_PAD;
    for (const tier of [1, 2, 3, 4, 5] as const) {
      bandTop[tier] = y;
      y += (cellSize[tier] ?? 1) * ROW_H + BAND_PAD * 2;
    }
    const capY = y + CAP_BAND / 2;
    const w = GUTTER + branches.length * COLW + 10;
    const h = y + CAP_BAND + 6;

    const pos = new Map<string, { x: number; y: number; node: SkillNode }>();
    for (const node of tree) {
      if (node.capstone) { pos.set(node.id, { x: w / 2, y: capY, node }); continue; }
      const col = branches.indexOf(node.branchId);
      const siblings = tree.filter((c) => !c.capstone && c.branchId === node.branchId && c.tier === node.tier);
      const localIndex = siblings.findIndex((c) => c.id === node.id);
      pos.set(node.id, {
        x: GUTTER + col * COLW + SPINE_X,
        y: bandTop[node.tier] + BAND_PAD + localIndex * ROW_H + ROW_H / 2,
        node,
      });
    }
    const bandLabelY: Record<number, number> = {};
    for (const tier of [1, 2, 3, 4, 5] as const) {
      bandLabelY[tier] = bandTop[tier] + ((cellSize[tier] ?? 1) * ROW_H) / 2 + BAND_PAD;
    }
    return { tree, branches, pos, capstone, w, h, bandLabelY };
  }, [u, activeClass]);

  if (!u || !layout) return null;
  const { tree, branches, pos, w: skyW, h: skyH, bandLabelY } = layout;
  const sel = selId ? tree.find((node) => node.id === selId) ?? null : null;
  const selState = sel ? stateOf(u, sel) : null;
  const selReason = sel && selState !== 'unlocked' ? canUnlock(u, sel) : null;
  const active = activeCombos(u);
  const comboEdges = COMBOS.flatMap((combo) => {
    const a = tree.find((node) => node.unlockSkill === combo.skills[0] || node.passiveSkill === combo.skills[0]);
    const b = tree.find((node) => node.unlockSkill === combo.skills[1] || node.passiveSkill === combo.skills[1]);
    if (!a || !b || a.id > b.id) return [];
    return [{ combo, a: pos.get(a.id), b: pos.get(b.id) }];
  });

  const clickNode = (node: SkillNode) => {
    const state = stateOf(u, node);
    if (sel?.id === node.id && state === 'avail') {
      engine.unlockNode(u.id, node.id);
      return;
    }
    setSelId(node.id);
  };

  const skillId = sel?.unlockSkill ?? sel?.passiveSkill;
  const selectedCombos = skillId ? comboForSkill(skillId) : [];
  const branchMeta = new Map(branches.map((branchId) => {
    const node = tree.find((n) => n.branchId === branchId)!;
    return [branchId, { name: node.branch.split(' · ')[1] ?? node.branch, color: node.branchColor }];
  }));

  return (
    <div className="stc-overlay">
      <div className="stc-panel">
        <div className="stc-header">
          <span className="stc-title">✦ Constellation of Talents</span>
          <span className="stc-header-sp"><b>◈ {u.skillPoints}</b> skill point{u.skillPoints !== 1 ? 's' : ''}</span>
          <button className="stc-close" onClick={() => engine.toggleSkillTree()}>✕</button>
        </div>

        <div className="st-tabs">
          {party.map((member) => (
            <button key={member.id} className={`st-tab ${member.id === u.id ? 'active' : ''}`} onClick={() => { setTab(member.id); setSelId(null); }}>
              {member.name} · Lv{member.level} · {comboTitleFor(member.classes ?? [])}
              <span className="st-sp">◈ {member.skillPoints} SP</span>
            </button>
          ))}
        </div>

        {classes.length > 1 && (
          <div className="stc-class-tabs">
            {classes.map((cid) => (
              <button key={cid} className={`stc-class-tab ${cid === activeClass ? 'active' : ''}`} onClick={() => { setClassTab(cid); setSelId(null); }}>
                {comboTitleFor([cid])}
              </button>
            ))}
          </div>
        )}

        <div className="stc-main">
          <div className="stc-sky-wrap">
            <div className="stc-col-heads" style={{ paddingLeft: GUTTER }}>
              {branches.map((branchId) => {
                const meta = branchMeta.get(branchId)!;
                return (
                  <div key={branchId} className="stc-col-head" style={{ width: COLW, borderColor: meta.color }}>
                    <div className="stc-col-name" style={{ color: meta.color }}>{meta.name}</div>
                    <div className="stc-col-sub">specialization</div>
                  </div>
                );
              })}
            </div>
            <div className="stc-sky-scroll">
              <div className="stc-sky" style={{ width: skyW, height: skyH }}>
                <svg className="stc-edges" width={skyW} height={skyH} viewBox={`0 0 ${skyW} ${skyH}`}>
                  <defs>
                    <filter id="stc-glow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="2.6" result="b" />
                      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  {/* branch spines — the constellation's backbone */}
                  {branches.map((branchId, col) => {
                    const nodes = tree.filter((n) => !n.capstone && n.branchId === branchId);
                    if (!nodes.length) return null;
                    const x = GUTTER + col * COLW + SPINE_X;
                    const ys = nodes.map((n) => pos.get(n.id)!.y);
                    const anyUnlocked = nodes.some((n) => stateOf(u, n) === 'unlocked');
                    return <line key={branchId} className={`stc-spine ${anyUnlocked ? 'lit' : ''}`} x1={x} y1={Math.min(...ys) - 14} x2={x} y2={Math.max(...ys) + 14} />;
                  })}
                  {tree.flatMap((node) => (node.requires ?? []).map((requirement) => {
                    const a = pos.get(requirement);
                    const b = pos.get(node.id);
                    if (!a || !b) return null;
                    const aState = stateOf(u, a.node);
                    const bState = stateOf(u, b.node);
                    const cls = aState === 'unlocked' && bState === 'unlocked' ? 'lit'
                      : (aState === 'unlocked' && bState === 'avail') || (aState === 'avail' && bState === 'unlocked') ? 'flow' : '';
                    return <line key={`${requirement}-${node.id}`} className={`stc-edge ${cls}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
                  }))}
                  {comboEdges.map(({ combo, a, b }) => a && b && (
                    <line key={combo.id} className={`stc-edge combo-edge ${active.some((item) => item.id === combo.id) ? 'lit' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                  ))}
                </svg>

                {([1, 2, 3, 4, 5] as const).map((tier) => (
                  <div key={tier} className="stc-tier-label" style={{ top: bandLabelY[tier] }}>
                    <span className="stc-tier-roman">{ROMAN[tier]}</span>
                    <span className="stc-tier-lvl">{TIER_LVL[tier]}</span>
                  </div>
                ))}

                {tree.map((node) => {
                  const p = pos.get(node.id)!;
                  const state = stateOf(u, node);
                  const reason = state === 'unlocked' ? null : canUnlock(u, node);
                  const cap = !!node.capstone;
                  return <div key={node.id} className={`stc-node ${cap ? 'capstone' : ''} t${node.tier} ${state} ${sel?.id === node.id ? 'sel' : ''}`} style={{ left: p.x, top: p.y }}>
                    <div className="stc-star-wrap">
                      <button className="stc-star" onClick={() => clickNode(node)} title={state === 'avail' ? `${node.name} — click again to unlock (${node.cost} SP)` : state === 'locked' ? `${node.name} — ${reason}` : `${node.name} — mastered`}>
                        <span>{cap ? '👑' : node.icon}</span>
                      </button>
                    </div>
                    <div className="stc-node-tag"><div className="stc-node-name">{node.name}</div>{state !== 'unlocked' && <div className="stc-node-cost">◈ {node.cost} SP</div>}</div>
                  </div>;
                })}
              </div>
            </div>
          </div>

          <aside className={`stc-detail ${selState ?? ''}`}>
            {!sel && <div className="stc-detail-empty"><div>Choose a star to read its fate.</div><div className="stc-legend"><div className="stc-legend-row"><span className="stc-legend-dot lit" /> Mastered</div><div className="stc-legend-row"><span className="stc-legend-dot avail" /> Within reach</div><div className="stc-legend-row"><span className="stc-legend-dot dim" /> Future / blocked</div></div></div>}
            {sel && <>
              <div className="stc-detail-head"><div className="stc-detail-icon">{sel.capstone ? '👑' : sel.icon}</div><div><div className="stc-detail-name">{sel.name}</div><div className="stc-detail-sub">{sel.branch} · Tier {ROMAN[sel.tier]}</div></div></div>
              <span className="stc-detail-kind">{sel.unlockSkill ? 'Active skill' : sel.capstone ? 'Capstone' : 'Passive'}</span>
              <div className="stc-detail-desc">{sel.desc}</div>
              <div className="stc-detail-cost">◈ Costs {sel.cost} skill point{sel.cost > 1 ? 's' : ''} · Requires Lv{sel.levelReq}+</div>
              {!!sel.requiresAll?.length && <div className="stc-detail-req"><b>Requires all</b><span>{(sel.requiresAll ?? []).map((id) => tree.find((node) => node.id === id)?.name ?? id).join(' · ')}</span></div>}
              {!!sel.requiresAny?.length && <div className="stc-detail-req"><b>Requires one</b><span>{(sel.requiresAny ?? []).map((id) => tree.find((node) => node.id === id)?.name ?? id).join(' · ')}</span></div>}
              {!!selectedCombos.length && <div className="stc-detail-combos"><b>Combo links</b>{selectedCombos.map((combo) => <span key={combo.id} className={active.some((item) => item.id === combo.id) ? 'active' : ''}>✦ {combo.name}: {combo.description}</span>)}</div>}
              <div className="stc-detail-status">
                {selState === 'unlocked' && <div className="stc-status-mastered">✦ Mastered</div>}
                {selState === 'avail' && <><button className="btn-primary btn-sm stc-unlock-btn" onClick={() => engine.unlockNode(u.id, sel.id)}>✦ Unlock — {sel.cost} SP</button><div className="stc-unlock-hint">or click the star again</div></>}
                {selState === 'locked' && <div className="stc-status-reason">{selReason}</div>}
              </div>
            </>}
          </aside>
        </div>

        <div className="st-loadout">
          <div className="st-loadout-title">Loadout — {u.equippedSkills.length}/12 active slots · {u.knownSkills.filter((id) => (SKILLS[id] ?? ALL_CLASS_SKILLS[id])?.passive).length} passives active</div>
          <div className="st-loadout-skills">
            {u.knownSkills.map((id) => {
              const skill = SKILLS[id] ?? ALL_CLASS_SKILLS[id];
              if (!skill) return null;
              const equippedIndex = u.equippedSkills.indexOf(id);
              const passive = !!skill.passive;
              return <button key={id} className={`st-skill-chip ${equippedIndex >= 0 ? 'equipped' : ''} ${passive ? 'passive' : ''}`} disabled={passive} onClick={() => passive ? undefined : equippedIndex >= 0 ? engine.unequipSkill(u.id, id) : engine.equipSkill(u.id, id)} title={`${skill.name} — ${skill.desc}${passive ? ' [always active]' : equippedIndex >= 0 ? ` [slot ${equippedIndex + 1}]` : ' (click to equip)'}`}><span className="st-chip-icon">{skill.icon}</span><span className="st-chip-name">{skill.name}</span>{passive ? <span className="st-chip-slot">passive</span> : equippedIndex >= 0 && <span className="st-chip-slot">{equippedIndex + 1}</span>}</button>;
            })}
          </div>
        </div>
        <div className="st-footer"><span>{u.skillPoints > 0 ? `◈ ${u.skillPoints} skill point${u.skillPoints !== 1 ? 's' : ''} remaining` : 'Level up to earn more skill points.'}</span><button className="btn-ghost btn-sm" onClick={() => engine.resetSkillBuild(u.id)}>↺ Respec build</button></div>
      </div>
    </div>
  );
}
