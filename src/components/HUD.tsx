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

function Minimap({ snap }: { snap: UISnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snap.minimapTiles) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { walk, heights, units } = snap.minimapTiles;
    const S = walk.length;
    const cellSize = 3;
    const w = S * cellSize;
    const h = S * cellSize;
    canvas.width = w;
    canvas.height = h;
    
    ctx.clearRect(0, 0, w, h);
    
    // draw terrain
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        if (walk[x][z]) {
          const ht = heights[x][z];
          if (ht >= 1.5) ctx.fillStyle = '#8a7a5a';
          else if (ht >= 1.25) ctx.fillStyle = '#7a6a4a';
          else if (ht >= 1.0) ctx.fillStyle = '#5a5a5a';
          else ctx.fillStyle = '#4a4a4a';
        } else {
          ctx.fillStyle = '#1a1a2a';
        }
        ctx.fillRect(z * cellSize, x * cellSize, cellSize, cellSize);
      }
    }
    
    // draw units
    for (const u of units) {
      ctx.fillStyle = u.team === 'party' ? '#4ade80' : '#ef4444';
      ctx.fillRect(u.z * cellSize, u.x * cellSize, cellSize, cellSize);
    }
    
    // draw player highlight
    const player = units.find(u => u.team === 'party');
    if (player) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(player.z * cellSize - 1, player.x * cellSize - 1, cellSize + 2, cellSize + 2);
    }
  }, [snap.minimapTiles]);
  
  if (!snap.minimapTiles) return null;
  return (
    <div className="minimap">
      <canvas ref={canvasRef} className="minimap-canvas" width={138} height={138} />
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
      {phase === 'menu' && !snap.cinematic && (
        <div className="overlay-screen menu">
          <div className="menu-inner">
            <div className="menu-rune">◆ ◆ ◆</div>
            <h1>DUNGEON HANGOVER</h1>
            <h2>— 50 Floors of Regret —</h2>
            <p className="menu-tag">A turn-based voxel roguelite. You wake at the bottom in your underwear, with a headache and a rusty dagger. The only way out is up.</p>
            <button className="btn-primary" onClick={() => engine?.startGame()}>⚔ Enter the Realm</button>
            <div className="menu-features">
              <span>🎲 d20 rolls &amp; initiative</span><span>🔥 15+ skills &amp; AoE spells</span>
              <span>🧱 voxel world</span><span>✨ particle sorcery</span><span>🤖 enemy AI</span>
            </div>
            <p className="menu-controls">WASD pan · Q/E rotate · wheel zoom · 1-9,0,-,= skills · Space end turn · K skill tree</p>
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

      {/* ══ BIG MESSAGE ══ */}
      {snap.bigMessage && (
        <div key={snap.bigMessage} className={`big-message ${snap.cinematic ? 'cinematic' : ''}`}>{snap.bigMessage}</div>
      )}

      {/* ══ TARGETING HINT ══ */}
      {snap.targeting && playerTurn && (
        <div className="targeting-hint">
          🎯 Aiming <b>{SKILLS[snap.selectedSkill!]?.name}</b> — click a target · right-click / Esc to cancel
        </div>
      )}

      {/* ══ DIALOGUE OVERLAY ══ */}
      {snap.showDialogue && (
        <div className="dialogue-overlay">
          <div className="dialogue-box">
            <div className="dialogue-npc-name">{snap.showDialogue.npcName}</div>
            {snap.showDialogue.caption && <div className="dialogue-caption">{snap.showDialogue.caption}</div>}
            <div className="dialogue-text">{snap.showDialogue.text}</div>
            {snap.showDialogue.choices && snap.showDialogue.choices.length > 0 && (
              <div className="dialogue-choices">
                {snap.showDialogue.choices.map((c) => (
                  <button key={c.index} className="dialogue-choice" onClick={() => engine?.dialogueChoice(snap.showDialogue!.npcId, c.index)}>
                    {c.index + 1}. {c.label}
                  </button>
                ))}
              </div>
            )}
            {!snap.showDialogue.choices && (
              <button className="dialogue-close" onClick={() => engine?.dialogueChoice(snap.showDialogue!.npcId, -1)}>[Continue]</button>
            )}
          </div>
        </div>
      )}

      {/* ══ BONFIRE REST UI ══ */}
      {snap.showBonfireUI && (
        <div className="bonfire-rest">
          <div className="bonfire-rest-inner">
            <div className="bonfire-rest-title">🔥 Resting at the Bonfire</div>
            <p className="bonfire-rest-desc">The flames warm your bones. The dungeon stirs beyond the light.</p>
            <div className="bonfire-rest-actions">
              <button className="btn-primary" onClick={() => engine?.toggleSkillTree()} style={{ fontSize: 14, padding: '8px 24px' }}>
                📜 Skill Tree & Loadout
              </button>
              <button className="btn-primary" onClick={() => engine?.toggleInventory()} style={{ fontSize: 14, padding: '8px 24px' }}>
                🎒 Inventory
              </button>
              <p className="bonfire-rest-hint">Spend XP to level up in the skill tree panel.</p>
              <button className="btn-primary" onClick={() => engine?.closeBonfireUI()} style={{ fontSize: 14, padding: '8px 24px', background: 'linear-gradient(180deg, #5a3a1e, #3a2010)', border: '1px solid #8a6d14' }}>
                🔥 Leave Bonfire
              </button>
            </div>
          </div>
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

      {/* ══ MINIMAP ══ */}
      {phase !== 'menu' && <Minimap snap={snap} />}
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

          {/* permanent skill bar — always visible */}
          {active && active.team === 'party' && (
            <div className="hotbar-permanent">
              {phase === 'combat' && (
                <div className="action-pips" title="Action / Bonus action">
                  <span className={`pip ${active.hasAction ? 'on' : ''}`}>⚡</span>
                  <span className={`pip bonus ${active.hasBonus ? 'on' : ''}`}>🔸</span>
                  <span className="move-pip">👟 {active.movementLeft}</span>
                </div>
              )}
              {/* default attack button */}
              <button
                className="skill-btn default-attack"
                onClick={() => engine?.selectSkill(active.equippedSkills[0] ?? 'slash')}
                title="Default Attack"
              >
                <span className="skill-icon">⚔️</span>
              </button>
              {/* 12 skill slots */}
              {Array.from({ length: 12 }).map((_, i) => {
                const sid = active.equippedSkills[i];
                const s = sid ? SKILLS[sid] : null;
                const cd = sid ? (active.cooldowns[sid] ?? 0) : 0;
                const unavailable = sid && phase === 'combat' ? ((s?.cost === 'action' && !active.hasAction) || (s?.cost === 'bonus' && !active.hasBonus) || cd > 0) : false;
                const keyLabel = i < 9 ? `${i + 1}` : i === 9 ? '0' : i === 10 ? '-' : '=';
                return (
                  <button
                    key={i}
                    className={`skill-btn ${sid && snap.selectedSkill === sid ? 'selected' : ''} ${unavailable ? 'disabled' : ''} ${!sid ? 'empty' : ''}`}
                    onClick={() => sid ? engine?.selectSkill(sid) : undefined}
                    title={s ? `${s.name} — ${s.desc}${s.cooldown ? ` (CD ${s.cooldown})` : ''} [${keyLabel}]` : `Empty slot [${keyLabel}]`}
                  >
                    <span className="skill-icon">{s?.icon ?? ''}</span>
                    <span className="skill-key">{keyLabel}</span>
                    {s?.cost === 'bonus' && <span className="skill-cost">B</span>}
                    {cd > 0 && <span className="skill-cd">{cd}</span>}
                  </button>
                );
              })}
              {phase === 'combat' && (
                <button className="end-turn" onClick={() => engine?.endTurn()} title="End turn [Space]">
                  END<br />TURN
                </button>
              )}
            </div>
          )}
          {phase === 'combat' && active && active.team === 'enemy' && (
            <div className="enemy-turn-banner">⚔ {active.name} is acting…</div>
          )}
          {phase === 'explore' && (
            <div className="explore-hint">🧭 Click ground to move · I Inventory · K Skill tree · C Sneak · Space Rest</div>
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
            <li><b>Skills:</b> hotbar or keys 1-9,0,-,=. 🔥/❄ aim with the mouse — red tiles show the blast.</li>
            <li><b>Action economy:</b> ⚡ action, 🔸 bonus action, 👟 movement per turn.</li>
            <li><b>Camera:</b> WASD pan, Q/E rotate, wheel zoom, F focus active unit.</li>
            <li><b>Inventory:</b> I or 🎒 — equip gear, drink potions (bonus action in combat).</li>
            <li><b>Skill tree:</b> K or 📜 — spend skill points to unlock passives &amp; new skills (earned on level-up — spend XP at bonfires to level up). Equip up to 12 skills on the hotbar.</li>
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
