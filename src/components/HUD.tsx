import { useEffect, useRef, useState } from 'react';
import type { GameEngine } from '@/game/engine';
import type { UISnapshot, Unit } from '@/game/types';
import { SKILLS } from '@/game/skills';
import { ALL_CLASS_SKILLS } from '@/game/classSkills';
import { effMaxHp } from '@/game/stats';
import { InventoryPanel } from './InventoryPanel';
import { SkillTreePanel } from './SkillTreePanel';
import { CharacterCreationPanel } from './CharacterCreationPanel';
import { CharacterStatsPanel } from './CharacterStatsPanel';
import { Hotbar } from './Hotbar';
import { BonfireLoadout } from './BonfireLoadout';
import { VoxelItemIcon } from './VoxelItemIcon';
import { ItemInspect } from './ItemInspect';
import { VoxelD20 } from './VoxelD20';
import type { Item } from '@/game/items';
import { isQuestLoot } from '@/game/engine/loot';

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

/** Rare full-screen roll — reserved for special checks, perception, and treasure quality. */
function DiceRollOverlay({ snap }: { snap: UISnapshot }) {
  const d = snap.diceShow;
  if (!d) return null;
  const fresh = performance.now() - d.at < 3200;
  if (!fresh) return null;
  return (
    <div className="dice-overlay" key={d.at}>
      <div className="dice-scene">
        <VoxelD20 seed={d.at} />
        <div className="dice-total">{d.total}</div>
      </div>
      <div className="dice-reason">{d.reason} · {d.die}</div>
    </div>
  );
}

/** Action feed — the last few Chronicle lines floating over the canvas so
 *  the player can follow what just happened without opening the log. */
function ActionFeed({ snap }: { snap: UISnapshot }) {
  const log = snap.log ?? [];
  if (!log.length) return null;
  return (
    <div className="action-feed">
      {log.slice(-4).map((l) => (
        <div key={l.id} className={`action-feed-item ${l.kind}`}>{l.text}</div>
      ))}
    </div>
  );
}

/** Loot preview — see what dropped, choose what to take (Take All / per-item).
 *  Each row offers Examine (full model + stat sheet) before taking. */
function LootPreviewOverlay({ snap, engine }: { snap: UISnapshot; engine: GameEngine | null }) {
  const offer = snap.pendingLoot;
  const [examining, setExamining] = useState<Item | null>(null);
  if (!offer) return null;
  const hasItems = offer.items.length > 0;
  const allQuest = offer.items.every(isQuestLoot);
  return (
    <div className="loot-overlay">
      {examining && <ItemInspect item={examining} onClose={() => setExamining(null)} />}
      <div className="loot-box">
        <div className="loot-title">📦 {offer.source}</div>
        <div className="loot-hint">Choose what to take. Quest items must be taken.</div>
        {hasItems && (
          <div className="loot-list">
            {offer.items.map((it) => {
              const quest = isQuestLoot(it);
              return (
                <div key={it.id} className={`loot-row ${quest ? 'quest' : ''}`}>
                  <VoxelItemIcon item={it} size={44} />
                  <div className="loot-row-info">
                    <div className="loot-row-name" style={{ color: it.rarity === 'rare' ? '#ffd75e' : it.rarity === 'epic' ? '#ff7ad9' : it.rarity === 'uncommon' ? '#7dd3fc' : '#e8e6e1' }}>
                      {it.icon} {it.name} {quest && <span className="loot-quest-tag">quest</span>}
                    </div>
                    <div className="loot-row-desc">{it.desc}</div>
                  </div>
                  <button className="loot-btn take" onClick={() => engine?.takeLootItem(it.id)}>Take</button>
                  <button className="loot-btn examine" onClick={() => setExamining(it)}>🔍 Examine</button>
                  {!quest && <button className="loot-btn leave" onClick={() => engine?.leaveLootItem(it.id)}>Leave</button>}
                </div>
              );
            })}
          </div>
        )}
        {offer.gold > 0 && (
          <div className="loot-gold">🪙 {offer.gold} gold</div>
        )}
        <div className="loot-actions">
          <button className="btn-primary btn-sm" onClick={() => engine?.takeAllLoot()}>
            Take All{offer.gold > 0 ? ` + ${offer.gold}🪙` : ''}
          </button>
          <button className="btn-secondary" onClick={() => engine?.dismissLoot()}>
            {allQuest && hasItems ? 'Keep Required' : hasItems ? 'Leave the rest' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* cartographer's palette — parchment rises out of dark ink */
const MAP_INK = '#13100a';
const MAP_HEIGHT_TONES = ['#8f7a4e', '#a8905c', '#c2a76e', '#dac188'];

function Minimap({ snap }: { snap: UISnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullViewRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(2);
  const fullMap = snap.showFullMap ?? false;
  const SIZE = 142;
  const FULL_SIZE = Math.min(window.innerWidth * 0.78, window.innerHeight * 0.72);

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

    // dark-ink unexplored ground
    ctx.fillStyle = MAP_INK;
    ctx.fillRect(0, 0, w, h);

    // explored terrain — parchment shaded by elevation
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        if (!walk[x][z]) continue;
        const ht = heights[x][z];
        const tone = ht >= 1.5 ? 3 : ht >= 1.25 ? 2 : ht >= 1.0 ? 1 : 0;
        ctx.fillStyle = MAP_HEIGHT_TONES[tone] ?? MAP_HEIGHT_TONES[0] ?? '#8f7a4e';
        ctx.fillRect(z * zoom, x * zoom, zoom, zoom);
      }
    }

    const player = units.find((u) => u.team === 'party');

    // party allies — small gold-green ticks
    for (const u of units) {
      if (u.team !== 'party' || u === player) continue;
      ctx.fillStyle = '#8fd06a';
      ctx.fillRect(u.z * zoom, u.x * zoom, Math.max(2, zoom - 1), Math.max(2, zoom - 1));
    }

    // enemies — ember-red dots with a faint glow
    for (const u of units) {
      if (u.team !== 'enemy') continue;
      const r = Math.max(1.6, zoom * 0.55);
      ctx.save();
      ctx.shadowColor = 'rgba(208, 58, 42, 0.8)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#d03a2a';
      ctx.beginPath();
      ctx.arc(u.z * zoom + zoom / 2, u.x * zoom + zoom / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // the player — a burning gilded diamond + a facing wedge so the
    // north-up overview still shows where the hero is looking
    if (player) {
      const cx = player.z * zoom + zoom / 2;
      const cy = player.x * zoom + zoom / 2;
      const s = Math.max(4, zoom * 1.4);
      const fy = snap.heroYaw ?? 0;
      const ang = Math.atan2(Math.cos(fy), -Math.sin(fy));
      ctx.save();
      ctx.translate(cx, cy);
      // facing wedge
      ctx.rotate(ang);
      ctx.fillStyle = '#ffe14d';
      ctx.shadowColor = 'rgba(255, 225, 77, 0.9)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.9);
      ctx.lineTo(-s * 0.75, 0);
      ctx.lineTo(s * 0.75, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // bright yellow dot with a dark ring
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 225, 77, 0.95)';
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#1a1404';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [snap.minimapTiles, zoom, snap.heroYaw]);

  // centre the cartographer's viewport on the player when it (re)opens
  const ppz = snap.minimapTiles?.units.find((u) => u.team === 'party')?.z ?? 0;
  const ppx = snap.minimapTiles?.units.find((u) => u.team === 'party')?.x ?? 0;
  useEffect(() => {
    const el = fullViewRef.current;
    if (!fullMap || !el) return;
    el.scrollLeft = ppz * zoom + zoom / 2 - el.clientWidth / 2;
    el.scrollTop = ppx * zoom + zoom / 2 - el.clientHeight / 2;
  }, [fullMap, zoom, ppz, ppx]);

  if (!snap.minimapTiles) return null;
  const S = snap.minimapTiles.walk.length;
  const player = snap.minimapTiles.units.find((u) => u.team === 'party');
  const px = player?.x ?? 0, pz = player?.z ?? 0;
  // rotating map: "up" = the hero's facing. rotate the pan around the player
  // tile (the transform-origin) so the wedge marker always points at the top.
  const yaw = snap.heroYaw ?? 0;
  const rot = Math.atan2(Math.cos(yaw), Math.sin(yaw)) + Math.PI;

  if (fullMap) {
    return (
      <div className="fullmap-overlay">
        <div className="fullmap-panel">
          <div className="fullmap-head">✦ Cartographer's Map ✦</div>
          <div className="fullmap-viewport" ref={fullViewRef} style={{ width: FULL_SIZE, height: FULL_SIZE }}>
            <canvas ref={canvasRef} style={{ width: S * zoom, height: S * zoom }} />
          </div>
          <div className="fullmap-foot">
            <span>press M to close</span>
            <div className="minimap-zoom">
              <button className="mm-coin" onClick={() => setZoom((z) => Math.max(1, z - 1))} title="Zoom out">−</button>
              <button className="mm-coin" onClick={() => setZoom((z) => Math.min(8, z + 1))} title="Zoom in">+</button>
            </div>
            <span>only explored ground is inked</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="minimap-frame">
      <div className="minimap-viewport" style={{ width: SIZE, height: SIZE }}>
        <div
          className="minimap-pan"
          style={{
            transform: `translate(${SIZE / 2 - pz * zoom - zoom / 2}px, ${SIZE / 2 - px * zoom - zoom / 2}px) rotate(${rot}rad)`,
            transformOrigin: `${pz * zoom + zoom / 2}px ${px * zoom + zoom / 2}px`,
            width: S * zoom, height: S * zoom,
          }}
        >
          <canvas ref={canvasRef} style={{ width: S * zoom, height: S * zoom }} />
        </div>
        {/* you are here — a bright dot with a facing wedge (the map rotates so
            the wedge always points the way the hero is looking) */}
        <div className="minimap-player" title="You are here" />
      </div>
      <div className="minimap-zoom">
        <button className="mm-coin" onClick={() => setZoom((z) => Math.max(1, z - 1))} title="Zoom out">−</button>
        <button className="mm-coin" onClick={() => setZoom((z) => Math.min(6, z + 1))} title="Zoom in">+</button>
      </div>
    </div>
  );
}

export function HUD({ snap, engine }: Props) {
  const [showLog, setShowLog] = useState(true);
  const [initHover, setInitHover] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [snap?.log.length]);

  if (!snap) return null;
  const phase = snap.phase;
  // Strict resolution from activeId only (used for enemy-turn banner / initiative).
  const activeUnit = snap.units.find((u) => u.id === snap.activeId) ?? null;
  // party strip: dead SUMMONS drop out of the sidebar (their boxes are cleaned
  // up when they die) — core members stay visible in their dead state
  const party = snap.units.filter((u) => u.team === 'party' && (u.alive || !u.id.startsWith('summon_')));
  const playerTurn = phase === 'combat' && activeUnit?.team === 'party';

  return (
    <div className="hud">
      {/* ══ MAIN MENU ══ (title idle only — hidden while the intro/cutscene
          narration runs: between caption beats `cinematic` is false but the
          cutscene is still playing, so the menu would flicker over it) */}
      {phase === 'menu' && !snap.cinematic && !snap.busy && (
        <div className="overlay-screen menu">
          <div className="menu-inner">
            <div className="menu-rune">◆ ◆ ◆</div>
            <h1>DUNGEON HANGOVER</h1>
            <h2>— 50 Floors of Regret —</h2>
            <p className="menu-tag">A turn-based voxel dungeon crawler. You wake at the bottom in your underwear, with a headache and a rusty dagger. The only way out is up.</p>
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

      {/* ══ INITIATIVE TRACKER — grouped: the whole party block first, then
          every enemy (BG3-style two-phase rotation) ══ */}
      {phase === 'combat' && (
        <div className="initiative">
          <div className="initiative-round">ROUND {snap.round}</div>
          {snap.turnOrder.map((id, i) => {
            const u = snap.units.find((x) => x.id === id)!;
            const prev = i > 0 ? snap.units.find((x) => x.id === snap.turnOrder[i - 1]) : null;
            const teamColor = TEAM_COLOR[u.team] ?? '#aaa';
            return (
              <div key={id} style={{ display: 'contents' }}>
                {prev && prev.team !== u.team && (
                  <div className="initiative-divider">{u.team === 'enemy' ? '▼ ENEMY PHASE' : '▲ YOUR PHASE'}</div>
                )}
                <div
                  className="initiative-slot"
                  title={`${u.name} — ${u.hp}/${u.maxHp} HP`}
                  onMouseEnter={() => setInitHover(id)}
                  onMouseLeave={() => setInitHover((cur) => (cur === id ? null : cur))}
                >
                  <Portrait u={u} size={40} active={id === snap.activeId} />
                  {initHover === id && (
                    <div className="init-hover">
                      <div className="init-hover-name" style={{ color: teamColor }}>{u.name}</div>
                      <div className="init-hover-hp">❤ {u.hp}/{u.maxHp} HP</div>
                      <div className="init-hover-team" style={{ background: `${teamColor}22`, color: teamColor, border: `1px solid ${teamColor}55` }}>{u.team}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ COMBAT PHASE FLASH — big center banner at every phase change ══ */}
      {snap.phaseBanner && phase === 'combat' && (
        <div key={snap.phaseBanner.id} className={`phase-banner ${snap.phaseBanner.cls}`}>
          <span>{snap.phaseBanner.text}</span>
          <small>{snap.phaseBanner.cls === 'party' ? 'All heroes act — then the enemy.' : 'The enemy acts. Hold your ground.'}</small>
        </div>
      )}

      {/* ══ HOVER INFO ══ */}
      {snap.hoverInfo && phase !== 'menu' && phase !== 'victory' && phase !== 'defeat' && <div className="hover-info">{snap.hoverInfo}</div>}

      {/* ══ BIG MESSAGE ══ */}
      {snap.bigMessage && (
        <div key={snap.bigMessage} className={`big-message ${snap.cinematic ? 'cinematic' : ''}`}>{snap.bigMessage}</div>
      )}

      {/* ══ TARGETING HINT ══ */}
      {snap.targeting && playerTurn && (() => {
        const isThrow = typeof snap.selectedSkill === 'string' && snap.selectedSkill.startsWith('THROW:');
        const throwItem = isThrow ? snap.inventory.find((i) => i.id === snap.selectedSkill!.slice(6)) : null;
        return (
          <div className="targeting-hint">
            {isThrow
              ? <>🎯 Throwing <b>{throwItem?.icon} {throwItem?.name}</b> — click a unit or tile (range 6) · right-click / Esc to cancel</>
              : <>🎯 Aiming <b>{(SKILLS[snap.selectedSkill!] ?? ALL_CLASS_SKILLS[snap.selectedSkill!])?.name}</b> — click a target · right-click / Esc to cancel</>}
          </div>
        );
      })()}

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

      {/* ══ DIALOGUE OVERLAY ══ — never mount over the victory/defeat recap
          (QA S2-8: the dead boss's truce dialogue stayed clickable on the
          "FLOOR 50 CLEARED" screen). */}
      {snap.showDialogue && phase !== 'victory' && phase !== 'defeat' && (
        <div className="dialogue-overlay">
          <div className="dialogue-box">
            <div className="dialogue-npc-name">{snap.showDialogue.npcName}</div>
            {snap.showDialogue.caption && <div className="dialogue-caption">{snap.showDialogue.caption}</div>}
            <div className="dialogue-text">{snap.showDialogue.text}</div>
            {snap.showDialogue.choices && snap.showDialogue.choices.length > 0 && (
              <div className="dialogue-choices">
                {snap.showDialogue.choices.map((c, i) => (
                  <button key={c.index} className="dialogue-choice" onClick={() => engine?.dialogueChoice(snap.showDialogue!.npcId, c.index)}>
                    {i + 1}. {c.label}
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

      {/* ══ LOOT PREVIEW ══ */}
      {snap.pendingLoot && <LootPreviewOverlay snap={snap} engine={engine} />}

      {/* ══ BONFIRE REST UI ══ */}
      {snap.showBonfireUI && (
        <div className="bonfire-rest">
          <div className="bonfire-rest-inner">
            <div className="bonfire-rest-title">🔥 Resting at the Bonfire</div>
            <p className="bonfire-rest-desc">The flames warm your bones. The dungeon stirs beyond the light.</p>
            <div className="bonfire-rest-actions">
              <button className="btn-primary btn-sm" onClick={() => engine?.toggleSkillTree()}>
                📜 Skill Tree
              </button>
              <button className="btn-primary btn-sm" onClick={() => engine?.toggleBonfireLoadout()}>
                🎛 Loadout
              </button>
              <button className="btn-primary btn-sm" onClick={() => engine?.toggleInventory()}>
                🎒 Inventory
              </button>
              <p className="bonfire-rest-hint">Level up by fighting — spend your skill points in the Skill Tree (📜).</p>
              <button className="btn-primary btn-sm btn-ember" onClick={() => engine?.closeBonfireUI()}>
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
      {phase !== 'menu' && party.length > 0 && (
        <div className="party-sidebar">
          {party.map((u) => {
            const size = party.length >= 5 ? 40 : party.length >= 3 ? 46 : 52;
            return (
              <div key={u.id} className={`party-frame ${u.id === snap.activeId ? 'active' : ''}`}>
                <Portrait u={u} size={size} active={u.id === snap.activeId} />
                <div className="pf-info">
                  <div className="pf-name" style={{ color: TEAM_COLOR[u.team] }}>{u.name}</div>
                  <div className="pf-hp">{u.hp}/{effMaxHp(u)}{u.equipment.weapon?.enchantId ? ' ✦' : ''}</div>
                  <div className="pf-cond">
                    {u.conditions.map((c) => <span key={c.id} className="cond-pip" title={c.name}>{c.id === 'blessed' ? '✨' : '❄'}</span>)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {phase !== 'menu' && (
        <div className="bottom-bar">
          {/* torch indicator — the torch never burns out; T equips/stows it */}
          {snap.torchEquipped && (
            <div className="torch-indicator" onClick={() => engine?.toggleTorch()} title="Stow torch — press T to switch back [T]">
              <span>🔥 Torch in hand</span>
              <span className="torch-hint">press T to stow (never burns out)</span>
            </div>
          )}

          {/* BG3-style bottom hotbar (default actions + 12 skill slots) */}
          {phase !== 'creation' && phase !== 'victory' && phase !== 'defeat' && party.length > 0 && <Hotbar snap={snap} engine={engine!} />}
          {/* persistent phase chip — what you can do RIGHT NOW */}
          {phase === 'combat' && (
            <div className={`combat-phase-chip ${activeUnit?.team === 'party' ? 'party' : 'enemy'}`}>
              {activeUnit?.team === 'party'
                ? <>⚔ YOUR TURN — move, act, then <b>End Turn</b></>
                : <>🐀 ENEMY PHASE — {activeUnit?.name ?? 'the enemy'} is acting…</>}
            </div>
          )}
          {phase === 'explore' && (
            <div className="explore-hint">🧭 Click ground to move · I Inventory · K Skills · U Stats · C Sneak · T Torch · P First-person · Q/E Rotate</div>
          )}

          {/* right controls */}
          {/* sneak toggle */}
          {phase === 'explore' && (
            <button className={`hud-btn sneak ${snap.sneaking ? 'on' : ''}`} onClick={() => engine?.toggleSneak()} title="Sneak [C]">
              {snap.sneaking ? '👤' : '🕴️'}
            </button>
          )}
          <div className="hud-right">
            <button className="hud-btn" onClick={() => engine?.recenterCamera()} title="Re-center camera on your hero">📍</button>
            <button className={`hud-btn ${snap.tacticalView ? 'on' : ''}`} onClick={() => engine?.toggleTacticalView()} title="Tactical view — top-down on the battlefield">🗺️</button>
            <button className={`hud-btn ${snap.showQuestLog ? 'on' : ''}`} onClick={() => engine?.toggleQuestLog()} title="Quest log [J]">📖</button>
            <button className="hud-btn" onClick={() => engine?.toggleStats()} title="Character stats [U]">📊</button>
            <button className="hud-btn" onClick={() => engine?.toggleSkillTree()} title="Skill tree [K]">📜</button>
            <button className="hud-btn" onClick={() => engine?.toggleInventory()} title="Inventory [I]">🎒</button>
            <button className="hud-btn" onClick={() => engine?.toggleMute()} title="Mute">{snap.muted ? '🔇' : '🔊'}</button>
          </div>
        </div>
      )}

      {/* ══ FLOOR BANNER — top of the canvas (was bottom-bar, user asked for the top) ══ */}
      {phase !== 'menu' && snap.floorName && (
        <div className="floor-banner" title={`Floor ${snap.floor ?? ''}`}>
          Floor {snap.floor ?? 50} — {snap.floorName}
        </div>
      )}

      {/* ══ DICE ROLL (BG3-style visual) ══ */}
      {snap.diceShow && phase !== 'menu' && <DiceRollOverlay snap={snap} />}

      {/* ══ ACTION FEED — live Chronicle lines over the canvas ══ */}
      {phase !== 'menu' && phase !== 'creation' && <ActionFeed snap={snap} />}

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
