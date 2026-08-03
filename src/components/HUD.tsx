import { useEffect, useRef, useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot, Unit } from '@/game/types';
import { SKILLS } from '@/game/skills';
import { effMaxHp } from '@/game/stats';
import { InventoryPanel } from './InventoryPanel';
import { SkillTreePanel } from './SkillTreePanel';
import { CharacterCreationPanel } from './CharacterCreationPanel';
import { CharacterStatsPanel } from './CharacterStatsPanel';
import { Hotbar } from './Hotbar';
import { BonfireLoadout } from './BonfireLoadout';

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
  const [zoom, setZoom] = useState(2);
  const fullMap = snap.showFullMap ?? false;
  const SIZE = 142;
  const FULL_SIZE = Math.min(window.innerWidth * 0.78, window.innerHeight * 0.78);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snap.minimapTiles) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { walk, heights, units } = snap.minimapTiles;
    const S = walk.length;
    const w = S * zoom;
    const h = S * zoom;
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
        ctx.fillRect(z * zoom, x * zoom, zoom, zoom);
      }
    }
    
    // draw units
    for (const u of units) {
      ctx.fillStyle = u.team === 'party' ? '#4ade80' : '#ef4444';
      ctx.fillRect(u.z * zoom, u.x * zoom, Math.max(2, zoom), Math.max(2, zoom));
    }
    
    // draw player highlight
    const player = units.find(u => u.team === 'party');
    if (player) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(player.z * zoom - 1, player.x * zoom - 1, Math.max(2, zoom) + 2, Math.max(2, zoom) + 2);
    }
  }, [snap.minimapTiles, zoom]);
  
  if (!snap.minimapTiles) return null;
  const S = snap.minimapTiles.walk.length;
  const player = snap.minimapTiles.units.find(u => u.team === 'party');
  const px = player?.x ?? 0, pz = player?.z ?? 0;
  return (
    <div style={{ position: 'relative' }}>
      {!fullMap ? (
        <div style={{ width: SIZE, height: SIZE, overflow: 'hidden', border: '1px solid #334', borderRadius: 6, background: '#0a0a14' }}>
          <div style={{ transform: `translate(${SIZE/2 - pz * zoom}px, ${SIZE/2 - px * zoom}px)`, width: S * zoom, height: S * zoom }}>
            <canvas ref={canvasRef} style={{ width: S * zoom, height: S * zoom }} />
          </div>
          <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <button onClick={() => setZoom(z => Math.max(1, z - 1))} style={{ background: '#222', color: '#aaa', border: '1px solid #444', borderRadius: 3, width: 18, height: 18, fontSize: 11, lineHeight: 0, cursor: 'pointer' }}>−</button>
            <button onClick={() => setZoom(z => Math.min(6, z + 1))} style={{ background: '#222', color: '#aaa', border: '1px solid #444', borderRadius: 3, width: 18, height: 18, fontSize: 11, lineHeight: 0, cursor: 'pointer' }}>+</button>
          </div>
        </div>
      ) : (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(5,5,15,0.92)', zIndex: 9998, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#888', fontSize: 13, marginBottom: 6, fontFamily: 'monospace' }}>FULL MAP — press M to close — [+/−] to zoom</div>
          <div style={{ width: FULL_SIZE, height: FULL_SIZE, overflow: 'auto', border: '2px solid #4a9', borderRadius: 8, background: '#0a0a14' }}>
            <canvas ref={canvasRef} style={{ width: S * zoom, height: S * zoom }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => setZoom(z => Math.max(1, z - 1))} style={{ background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: 4, width: 28, height: 28, fontSize: 15, cursor: 'pointer' }}>−</button>
            <button onClick={() => setZoom(z => Math.min(8, z + 1))} style={{ background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: 4, width: 28, height: 28, fontSize: 15, cursor: 'pointer' }}>+</button>
          </div>
        </div>
      )}
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
  // Strict resolution from activeId only (used for enemy-turn banner / initiative).
  const activeUnit = snap.units.find((u) => u.id === snap.activeId) ?? null;
  const party = snap.units.filter((u) => u.team === 'party');
  const playerTurn = phase === 'combat' && activeUnit?.team === 'party';

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

      {/* ══ CHARACTER CREATION (dungeon wake) ══ */}
      {phase === 'creation' && engine && (
        <CharacterCreationPanel engine={engine} />
      )}

      {/* ══ VICTORY / DEFEAT ══ */}
      {(phase === 'victory' || phase === 'defeat') && (
        <div className={`overlay-screen ${phase}`}>
          <div className="menu-inner">
            <h1>{phase === 'victory' ? '🏆 FLOOR 50 CLEARED' : '💀 DEFEAT'}</h1>
            <h2>{phase === 'victory' ? 'The Sewer Cellar is behind you. The bath is behind you. The bottom of everything is behind you. Only up remains.' : 'Your party has fallen...'}</h2>
            {phase === 'victory' && (
              <div className="loot-box">
                <div className="loot-title">Run summary</div>
                <div className="run-stats">
                  <span>⏱ {Math.max(0, Math.round((Date.now() - (snap.runStats?.startedAt ?? Date.now())) / 1000))}s</span>
                  <span>💀 {snap.runStats?.kills ?? 0} kills</span>
                  <span>🕯 {snap.runStats?.deaths ?? 0} deaths</span>
                  <span>📜 {snap.runStats?.questsDone ?? 0} quests</span>
                  <span>🗝 {snap.runStats?.secretsFound ?? 0} secrets</span>
                </div>
                {snap.loot.length > 0 && <div className="loot-title" style={{ marginTop: 8 }}>Spoils of war</div>}
                {snap.loot.map((l, i) => <div key={i} className="loot-item">{l}</div>)}
              </div>
            )}
            {phase === 'victory' && (
              <div className="victory-actions">
                <button className="btn-primary" onClick={() => engine?.startNewGame(engine.currentSlotId ?? 'slot1')}>🔄 New Run</button>
                <button className="btn-secondary" onClick={() => engine?.returnToTitle()}>🏠 Title</button>
              </div>
            )}
            {phase === 'defeat' && <button className="btn-primary" onClick={() => engine?.respawn()}>🔥 Kindle again</button>}
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

      {/* ══ INTERACT PROMPT ══ */}
      {snap.interactPrompt && phase === 'explore' && !snap.showDialogue && (
        <div className="interact-prompt">{snap.interactPrompt}</div>
      )}

      {/* ══ QUEST LOG (J) ══ */}
      {snap.showQuestLog && phase !== 'menu' && (
        <div className="quest-log">
          <div className="quest-log-title">📜 Quest Log <button onClick={() => engine?.closeQuestLog()}>✕</button></div>
          {snap.quests && snap.quests.length > 0 ? (
            <div className="quest-log-body">
              {snap.quests.map((q) => (
                <div key={q.id} className={`quest-entry ${q.stage}`}>
                  <div className="quest-name">
                    {q.stage === 'completed' ? '✔' : q.stage === 'failed' ? '✖' : q.stage === 'accepted' || q.stage === 'in_progress' ? '◑' : '◔'}{' '}
                    {q.name}
                  </div>
                  <div className="quest-desc">{q.desc}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="quest-log-body empty">No quests yet. Talk to the Hermit in the next cell.</div>
          )}
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
                📜 Skill Tree
              </button>
              <button className="btn-primary" onClick={() => engine?.toggleBonfireLoadout()} style={{ fontSize: 14, padding: '8px 24px' }}>
                🎛 Loadout
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

      {/* ══ BONFIRE LOADOUT EDITOR ══ */}
      {snap.showBonfireLoadout && engine && (
        <BonfireLoadout snap={snap} engine={engine} />
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

          {/* torch indicator + fuel bar */}
          {snap.torchEquipped && (
            <div className="torch-indicator" onClick={() => engine?.toggleTorch()} title="Toggle torch [T]">
              <span>{snap.torchLit ? '🔥' : '🕯'} Torch {snap.torchLit ? 'ON' : 'OFF'}</span>
              {typeof snap.torchFuel === 'number' && (
                <div className="torch-fuel">
                  <div className="torch-fuel-fill" style={{ width: `${Math.max(0, Math.min(100, (snap.torchFuel / 100) * 100))}%` }} />
                </div>
              )}
            </div>
          )}

          {/* BG3-style bottom hotbar (default actions + 12 skill slots) */}
          {phase !== 'creation' && party.length > 0 && <Hotbar snap={snap} engine={engine!} />}
          {phase === 'combat' && activeUnit && activeUnit.team === 'enemy' && (
            <div className="enemy-turn-banner">⚔ {activeUnit.name} is acting…</div>
          )}
          {phase === 'explore' && (
            <div className="explore-hint">🧭 Click ground to move · I Inventory · K Skill tree · C Sneak · Space Rest</div>
          )}

          {/* floor banner (Floor 50 — The Sewer Cellar) */}
          {snap.floorName && (
            <div className="floor-banner" title={`Floor ${snap.floor ?? ''}`}>
              Floor {snap.floor ?? 50} — {snap.floorName}
            </div>
          )}

          {/* right controls */}
          {/* sneak toggle */}
          {phase === 'explore' && (
            <button className={`hud-btn sneak ${snap.sneaking ? 'on' : ''}`} onClick={() => engine?.toggleSneak()} title="Sneak [C]">
              {snap.sneaking ? '👤' : '🕴️'}
            </button>
          )}
          <div className="hud-right">
            <button className={`hud-btn ${snap.showQuestLog ? 'on' : ''}`} onClick={() => engine?.toggleQuestLog()} title="Quest log [J]">📖</button>
            <button className="hud-btn" onClick={() => engine?.toggleStats()} title="Character stats [U]">📊</button>
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

      {/* ══ CHARACTER STATS PANEL ══ */}
      {snap.showStats && phase !== 'menu' && engine && (
        <CharacterStatsPanel snap={snap} engine={engine} />
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

      {/* ══ CHEAT CONSOLE (backtick key) ══ */}
      {snap.showConsole && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(10, 12, 18, 0.95)', border: '2px solid #4a9',
          borderRadius: '8px', padding: '16px 20px', zIndex: 9999,
          fontFamily: 'monospace', minWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <div style={{ color: '#4a9', fontSize: '12px', marginBottom: '8px', opacity: 0.7 }}>
            CHEAT CONSOLE — type a command, press Enter (Esc to close)
          </div>
          <div style={{ color: '#7cc4ff', fontSize: '11px', marginBottom: '8px', opacity: 0.5 }}>
            noaggro · godmode · superhero · heal · killall · boss · gold [amt] · levelup · help
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#4a9', fontFamily: 'monospace', fontSize: '16px' }}>{'>'}</span>
            <span style={{
              color: '#fff', fontFamily: 'monospace', fontSize: '16px',
              minWidth: '400px',
              borderBottom: '1px solid #4a9', paddingBottom: '4px',
            }}>
              {snap.consoleInput ?? ''}
              <span style={{
                display: 'inline-block', width: '8px', height: '16px',
                background: '#4a9', marginLeft: '2px',
                animation: 'blink 1s step-end infinite',
              }} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
