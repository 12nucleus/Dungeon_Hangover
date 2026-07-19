import { useEffect, useRef, useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot, Unit } from '@/game/types';
import { SKILLS } from '@/game/skills';
import { effMaxHp } from '@/game/stats';
import { InventoryPanel } from './InventoryPanel';
import { SkillTreePanel } from './SkillTreePanel';

interface Props { snap: UISnapshot | null; engine: GameEngine | null; }

const TEAM_COLOR: Record<string, string> = { party: '#7cc4ff', enemy: '#ff7a6b' };

function Portrait({ u, size = 44, active = false }: { u: Unit; size?: number; active?: boolean }) {
  const pct = u.hp / effMaxHp(u);
  return (
    <div className={`portrait ${u.alive ? '' : 'dead'} ${active ? 'active' : ''}`} style={{ width: size, height: size }}>
      <div className="portrait-face" style={{ background: `#${u.scheme.cloth.toString(16).padStart(6, '0')}` }}>
        <span style={{ color: `#${u.scheme.skin.toString(16).padStart(6, '0')}` }}>
          {u.team === 'party' ? u.name[0] : '👺'}
        </span>
      </div>
      <div className="portrait-hp"><i style={{ width: `${pct * 100}%`, background: pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#ef4444' }} /></div>
    </div>
  );
}

export function HUD({ snap, engine }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  const [showLog, setShowLog] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [snap?.log.length]);

  if (!snap) return null;
  const phase = snap.phase;
  const active = snap.units.find((u) => u.id === snap.activeId) ?? null;
  const party = snap.units.filter((u) => u.team === 'party');
  const playerTurn = phase === 'combat' && active?.team === 'party';

  return (
    <div className="hud">
      {/* ══ MAIN MENU ══ */}
      {phase === 'menu' && (
        <div className="overlay-screen menu">
          <div className="menu-inner">
            <div className="menu-rune">◆ ◆ ◆</div>
            <h1>VOXEL REALMS</h1>
            <h2>— Tactics of the Broken Shrine —</h2>
            <p className="menu-tag">A voxel tactical-RPG demo in the spirit of Baldur's Gate 3</p>
            <button className="btn-primary" onClick={() => engine?.startGame()}>⚔ Enter the Realm</button>
            <div className="menu-features">
              <span>🎲 d20 rolls &amp; initiative</span><span>🔥 15+ skills &amp; AoE spells</span>
              <span>🧱 voxel world</span><span>✨ particle sorcery</span><span>🤖 enemy AI</span>
            </div>
            <p className="menu-controls">WASD pan · Q/E rotate · wheel zoom · 1-4 skills · Space end turn · K skill tree</p>
          </div>
        </div>
      )}

      {/* ══ VICTORY / DEFEAT ══ */}
      {(phase === 'victory' || phase === 'defeat') && (
        <div className={`overlay-screen ${phase}`}>
          <div className="menu-inner">
            <h1>{phase === 'victory' ? '🏆 VICTORY' : '💀 DEFEAT'}</h1>
            <h2>{phase === 'victory' ? 'The goblin warband is broken.' : 'Your party has fallen...'}</h2>
            {phase === 'victory' && snap.loot.length > 0 && (
              <div className="loot-box">
                <div className="loot-title">Spoils of war</div>
                {snap.loot.map((l, i) => <div key={i} className="loot-item">{l}</div>)}
              </div>
            )}
            {phase === 'victory'
              ? <button className="btn-primary" onClick={() => engine?.continueAfterVictory()}>🧭 Keep exploring</button>
              : <button className="btn-primary" onClick={() => engine?.respawn()}>🔥 Kindle again</button>}
          </div>
        </div>
      )}

      {/* ══ INITIATIVE TRACKER ══ */}
      {phase === 'combat' && (
        <div className="initiative">
          <div className="initiative-round">ROUND {snap.round}</div>
          {snap.turnOrder.map((id) => {
            const u = snap.units.find((x) => x.id === id)!;
            return (
              <div key={id} className="initiative-slot" title={`${u.name} — ${u.hp}/${u.maxHp} HP`}>
                <Portrait u={u} size={40} active={id === snap.activeId} />
              </div>
            );
          })}
        </div>
      )}

      {/* ══ HOVER INFO ══ */}
      {snap.hoverInfo && phase !== 'menu' && <div className="hover-info">{snap.hoverInfo}</div>}

      {/* ══ TARGETING HINT ══ */}
      {snap.targeting && playerTurn && (
        <div className="targeting-hint">
          🎯 Aiming <b>{SKILLS[snap.selectedSkill!]?.name}</b> — click a target · right-click / Esc to cancel
        </div>
      )}

      {/* ══ COMBAT LOG ══ */}
      {phase !== 'menu' && (
        <div className={`combat-log ${showLog ? '' : 'collapsed'}`}>
          <div className="log-header" onClick={() => setShowLog(!showLog)}>
            📜 Chronicle {showLog ? '▾' : '▸'}
          </div>
          {showLog && (
            <div className="log-body" ref={logRef}>
              {snap.log.map((l) => <div key={l.id} className={`log-line ${l.kind}`}>{l.text}</div>)}
            </div>
          )}
        </div>
      )}

      {/* ══ BOTTOM BAR ══ */}
      {phase !== 'menu' && (
        <div className="bottom-bar">
          {/* party frames */}
          <div className="party-frames">
            {party.map((u) => (
              <div key={u.id} className={`party-frame ${u.id === snap.activeId ? 'active' : ''}`}>
                <Portrait u={u} size={52} active={u.id === snap.activeId} />
                <div className="pf-info">
                  <div className="pf-name" style={{ color: TEAM_COLOR[u.team] }}>{u.name}</div>
                  <div className="pf-hp">{u.hp}/{effMaxHp(u)}{u.equipment.weapon?.enchantId ? ' ✦' : ''}</div>
                  <div className="pf-cond">
                    {u.conditions.map((c) => <span key={c.id} className="cond-pip" title={c.name}>{c.id === 'blessed' ? '✨' : '❄'}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* torch indicator */}
          {snap.torchEquipped && (
            <div className="torch-indicator" onClick={() => engine?.toggleTorch()} title="Toggle torch [T]">
              {snap.torchLit ? '🔥' : '🕯'} Torch {snap.torchLit ? 'ON' : 'OFF'}
            </div>
          )}

          {/* hotbar */}
          {phase === 'combat' && active && active.team === 'party' && (
            <div className="hotbar">
              <div className="action-pips" title="Action / Bonus action">
                <span className={`pip ${active.hasAction ? 'on' : ''}`}>⚡</span>
                <span className={`pip bonus ${active.hasBonus ? 'on' : ''}`}>🔸</span>
                <span className="move-pip">👟 {active.movementLeft}</span>
              </div>
              {active.equippedSkills.map((sid, i) => {
                const s = SKILLS[sid];
                const cd = active.cooldowns[sid] ?? 0;
                const unavailable = (s.cost === 'action' && !active.hasAction) || (s.cost === 'bonus' && !active.hasBonus) || cd > 0;
                return (
                  <button
                    key={sid}
                    className={`skill-btn ${snap.selectedSkill === sid ? 'selected' : ''} ${unavailable ? 'disabled' : ''}`}
                    onClick={() => engine?.selectSkill(sid)}
                    title={`${s.name} — ${s.desc}${s.cooldown ? ` (CD ${s.cooldown})` : ''} [${i + 1}]`}
                  >
                    <span className="skill-icon">{s.icon}</span>
                    <span className="skill-key">{i + 1}</span>
                    {s.cost === 'bonus' && <span className="skill-cost">B</span>}
                    {cd > 0 && <span className="skill-cd">{cd}</span>}
                  </button>
                );
              })}
              <button className="end-turn" onClick={() => engine?.endTurn()} title="End turn [Space]">
                END<br />TURN
              </button>
            </div>
          )}
          {phase === 'combat' && active && active.team === 'enemy' && (
            <div className="enemy-turn-banner">⚔ {active.name} is acting…</div>
          )}
          {phase === 'explore' && snap.sneaking && (
            <div className="sneak-badge">👤 Sneaking [C] — move silently, avoid enemy vision cones</div>
          )}
          {phase === 'explore' && !snap.sneaking && (
            <div className="explore-hint">🧭 Click the ground to move your party — the ruins to the north-east are crawling with goblins…</div>
          )}

          {/* right controls */}
          {/* sneak toggle */}
          {phase === 'explore' && (
            <button className={`hud-btn sneak ${snap.sneaking ? 'on' : ''}`} onClick={() => engine?.toggleSneak()} title="Sneak [C]">
              {snap.sneaking ? '👤' : '🕴️'}
            </button>
          )}
          <div className="hud-right">
            <button className="hud-btn" onClick={() => engine?.toggleSkillTree()} title="Skill tree [K]">📜</button>
            <button className="hud-btn" onClick={() => engine?.toggleInventory()} title="Inventory [I]">🎒</button>
            <button className="hud-btn" onClick={() => engine?.toggleMute()} title="Mute">{snap.muted ? '🔇' : '🔊'}</button>
            <button className="hud-btn" onClick={() => setShowHelp(!showHelp)} title="Help">❓</button>
          </div>
        </div>
      )}

      {/* ══ INVENTORY PANEL ══ */}
      {snap.showInventory && phase !== 'menu' && engine && (
        <InventoryPanel snap={snap} engine={engine} />
      )}

      {/* ══ SKILL TREE PANEL ══ */}
      {snap.showSkillTree && phase !== 'menu' && engine && (
        <SkillTreePanel snap={snap} engine={engine} />
      )}

      {/* ══ HELP PANEL ══ */}
      {showHelp && phase !== 'menu' && (
        <div className="help-panel">
          <div className="help-title">How to play <button onClick={() => setShowHelp(false)}>✕</button></div>
          <ul>
            <li><b>Explore:</b> click ground to move, click a hero to select the leader.</li>
            <li><b>Combat:</b> blue tiles = movement. Click a tile to move, click an enemy for a quick attack.</li>
            <li><b>Skills:</b> hotbar or keys 1-9. 🔥/❄ aim with the mouse — red tiles show the blast.</li>
            <li><b>Action economy:</b> ⚡ action, 🔸 bonus action, 👟 movement per turn.</li>
            <li><b>Camera:</b> WASD pan, Q/E rotate, wheel zoom, F focus active unit.</li>
            <li><b>Inventory:</b> I or 🎒 — equip gear, drink potions (bonus action in combat).</li>
            <li><b>Skill tree:</b> K or 📜 — spend skill points to unlock passives &amp; new skills (earned on level-up). Equip up to 4 skills on the hotbar.</li>
            <li><b>Sneak:</b> C or 🕴️ — toggle stealth. Move slower but avoid enemy vision cones. Surprise enemies for an auto-crit first strike!</li>
            <li><b>Traps:</b> hidden hazards trigger when stepped on. Reveal them with passive perception (Wisdom). Click a revealed trap to disarm.</li>
            <li><b>Loot:</b> smash crates/barrels/vases; enemies drop gear &amp; gold. Rarity: grey→green→blue→purple.</li>
            <li><b>End turn:</b> Space or the END TURN button.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
