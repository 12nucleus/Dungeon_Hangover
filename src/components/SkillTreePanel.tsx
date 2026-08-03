// ─────────────────────────────────────────────────────────────
// Skill tree panel — per-class unlock graphs, 2 branches × 3
// tiers, cost 1/1/2 points. Click nodes to unlock, toggle
// known skills on/off the hotbar (max 12 equipped). Match the
// dark-glass HUD style (index.css).
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot, Unit } from '@/game/types';
import { SKILLS } from '@/game/skills';
import { ALL_CLASS_SKILLS } from '@/game/classSkills';
import { treeFor, canUnlock } from '@/game/skilltree';
import type { SkillNode } from '@/game/skilltree';
import { comboTitleFor } from '@/game/classes';

interface Props { snap: UISnapshot; engine: GameEngine; }

function SkillNodeBtn({ u, node, onUnlock }: { u: Unit; node: SkillNode; onUnlock: () => void }) {
  const unlocked = u.unlockedNodes.includes(node.id);
  const reason = unlocked ? null : canUnlock(u, node);
  const available = !unlocked && reason === null;

  let cls = 'st-node';
  if (unlocked) cls += ' unlocked';
  else if (available) cls += ' available';
  else cls += ' locked';

  if (reason && reason !== 'Already unlocked') cls += ' blocked';

  return (
    <button className={cls} onClick={available ? onUnlock : undefined} title={reason ?? node.desc}>
      <span className="st-node-icon">{node.icon}</span>
      <span className="st-node-name">{node.name}</span>
      <span className="st-node-tier">T{node.tier}</span>
      {node.unlockSkill && <span className="st-node-cat">skill</span>}
      {node.passive && <span className="st-node-cat">passive</span>}
      {!unlocked && <span className="st-node-cost">{node.cost} SP</span>}
      {unlocked && <span className="st-node-check">✓</span>}
    </button>
  );
}

export function SkillTreePanel({ snap, engine }: Props) {
  const party = snap.units.filter((u) => u.team === 'party');
  const [tab, setTab] = useState(party[0]?.id ?? '');

  const u = party.find((p) => p.id === tab) ?? party[0];
  if (!u) return null;

  const tree = treeFor(u);
  const branches = new Map<string, SkillNode[]>();
  for (const n of tree) {
    const b = branches.get(n.branch) ?? [];
    b.push(n);
    branches.set(n.branch, b);
  }

  return (
    <div className="st-panel">
      <div className="st-header">
        <span>🌳 SKILL TREE</span>
        <button onClick={() => engine.toggleSkillTree()}>✕</button>
      </div>

      {/* member tabs */}
      <div className="st-tabs">
        {party.map((m) => (
          <button key={m.id} className={`st-tab ${m.id === u.id ? 'active' : ''}`} onClick={() => setTab(m.id)}>
            {m.name} · Lv{m.level} · {comboTitleFor(m.classes ?? [])}
            <span className="st-sp">🪙 {m.skillPoints} SP</span>
          </button>
        ))}
      </div>

      {/* branches */}
      <div className="st-body">
        {[...branches.entries()].map(([branchName, nodes]) => (
          <div key={branchName} className="st-branch">
            <div className="st-branch-title">{branchName}</div>
            <div className="st-tiers">
              {([1, 2, 3] as const).map((tier) => {
                const n = nodes.find((x) => x.tier === tier);
                return n ? (
                  <SkillNodeBtn key={n.id} u={u} node={n} onUnlock={() => engine.unlockNode(u.id, n.id)} />
                ) : (
                  <div key={`empty-${tier}`} className="st-node empty" />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* loadout */}
      <div className="st-loadout">
        <div className="st-loadout-title">Loadout (max 12)</div>
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

      {/* summary */}
      <div className="st-footer">
        {u.skillPoints > 0 && <span className="st-sp-rem">🪙 {u.skillPoints} skill point{u.skillPoints !== 1 ? 's' : ''} remaining</span>}
        {u.skillPoints === 0 && <span className="st-sp-spent">All skill points spent. Level up to earn more!</span>}
      </div>
    </div>
  );
}
