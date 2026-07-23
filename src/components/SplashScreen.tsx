import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { GameEngine } from '@/game/engine';
import type { GameSettings, SaveSlotMeta } from '@/game/save';

interface SplashScreenProps {
  /** when false the overlay fades out (CSS transition) to reveal the
   *  already-running tavern-exterior cutscene underneath */
  visible: boolean;
  /** start a fresh playthrough in the given slot (plays the intro) */
  onNewGame: (slotId: string) => void;
  /** load an existing playthrough from the given slot */
  onLoad: (slotId: string) => void;
  /** exit the game */
  onExit: () => void;
  /** live reference to the engine (for slot list + settings) */
  engineRef: MutableRefObject<GameEngine | null>;
}

type Menu = 'main' | 'slots' | 'settings' | 'exit';
type SlotIntent = 'new' | 'load' | null;

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

/**
 * HTML splash overlay shown on top of the engine's animated tavern-exterior
 * backdrop. It is NOT a separate 3D scene — the tavern the player sees here is
 * the exact same one the title cutscene continues from once this fades away.
 *
 * The overlay now hosts the full main menu: New Game (slot picker), Load Game
 * (slot picker), Settings (volume / mute) and Exit.
 */
export function SplashScreen({ visible, onNewGame, onLoad, onExit, engineRef }: SplashScreenProps) {
  const [menu, setMenu] = useState<Menu>('main');
  const [intent, setIntent] = useState<SlotIntent>(null);
  const [slots, setSlots] = useState<Record<string, SaveSlotMeta | null>>({});
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<string | null>(null);

  const refreshSlots = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const next: Record<string, SaveSlotMeta | null> = {};
    for (let i = 1; i <= eng.maxSlots; i++) next[`slot${i}`] = eng.getSlotMeta(`slot${i}`);
    setSlots(next);
  };

  const openSlots = (next: SlotIntent) => {
    setIntent(next);
    refreshSlots();
    setMenu('slots');
  };

  const openSettings = () => {
    const eng = engineRef.current;
    if (eng) setSettings(eng.getSettings());
    setMenu('settings');
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menu !== 'main') {
          setMenu('main');
          setIntent(null);
          setConfirmOverwrite(null);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (menu === 'main') openSlots('new');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, menu]);

  const applySetting = (patch: Partial<GameSettings>) => {
    const eng = engineRef.current;
    if (!eng) return;
    const next = { ...(settings ?? eng.getSettings()), ...patch };
    setSettings(next);
    eng.setSettings(next);
  };

  const pickSlot = (slotId: string) => {
    if (intent === 'load') {
      if (slots[slotId]) onLoad(slotId);
      return;
    }
    // new game — confirm before clobbering an existing save
    if (slots[slotId]) {
      setConfirmOverwrite(slotId);
      return;
    }
    onNewGame(slotId);
  };

  return (
    <div className={`splash ${visible ? 'splash--show' : 'splash--hide'}`} aria-hidden={!visible}>
      <div className="splash__vignette" />
      <div className="splash__content">
        <div className="splash__rune">◆ ◆ ◆</div>
        <h1 className="splash__title">DUNGEON HANGOVER</h1>
        <h2 className="splash__subtitle">50 Floors of Regret</h2>
        <p className="splash__tag">
          A turn-based voxel roguelite. You wake at the bottom in your underwear, with a headache
          and a rusty dagger. The only way out is up.
        </p>

        {menu === 'main' && (
          <div className="splash__menu">
            <button className="splash__btn" onClick={() => openSlots('new')}>⚔ NEW GAME</button>
            <button className="splash__btn" onClick={() => openSlots('load')}>📂 LOAD GAME</button>
            <button className="splash__btn" onClick={openSettings}>⚙ SETTINGS</button>
            <button className="splash__btn splash__btn--danger" onClick={() => setMenu('exit')}>🚪 EXIT</button>
            <p className="splash__hint">press Enter for a new game · Esc to go back</p>
          </div>
        )}

        {menu === 'slots' && (
          <div className="splash__panel">
            <div className="splash__panel-title">{intent === 'load' ? 'LOAD GAME' : 'NEW GAME — choose a slot'}</div>
            <div className="splash__slots">
              {Object.entries(slots).map(([id, meta]) => (
                <div className="splash__slot" key={id}>
                  <div className="splash__slot-info">
                    <div className="splash__slot-name">{meta ? meta.name : 'Empty Slot'}</div>
                    <div className="splash__slot-sub">
                      {meta ? `Floor ${meta.floor} · ${fmtTime(meta.timestamp)}` : 'No save yet'}
                    </div>
                  </div>
                  <div className="splash__slot-actions">
                    {intent === 'load' ? (
                      <button className="splash__btn splash__btn--sm" disabled={!meta} onClick={() => pickSlot(id)}>Load</button>
                    ) : (
                      <button className="splash__btn splash__btn--sm" onClick={() => pickSlot(id)}>{meta ? 'Overwrite' : 'Start'}</button>
                    )}
                    {meta && (
                      <button
                        className="splash__btn splash__btn--sm splash__btn--danger"
                        onClick={() => {
                          engineRef.current?.deleteSlot(id);
                          refreshSlots();
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button className="splash__btn splash__btn--back" onClick={() => { setMenu('main'); setIntent(null); }}>← Back</button>
          </div>
        )}

        {menu === 'settings' && settings && (
          <div className="splash__panel">
            <div className="splash__panel-title">SETTINGS</div>
            <div className="splash__settings">
              <label className="splash__set-row">
                <span>Master Volume</span>
                <input type="range" min={0} max={1} step={0.01} value={settings.master}
                  onChange={(e) => applySetting({ master: Number(e.target.value) })} />
              </label>
              <label className="splash__set-row">
                <span>SFX Volume</span>
                <input type="range" min={0} max={1} step={0.01} value={settings.sfx}
                  onChange={(e) => applySetting({ sfx: Number(e.target.value) })} />
              </label>
              <label className="splash__set-row">
                <span>Music Volume</span>
                <input type="range" min={0} max={1} step={0.01} value={settings.music}
                  onChange={(e) => applySetting({ music: Number(e.target.value) })} />
              </label>
              <label className="splash__set-row splash__set-row--toggle">
                <span>Mute</span>
                <input type="checkbox" checked={settings.muted} onChange={(e) => applySetting({ muted: e.target.checked })} />
              </label>
            </div>
            <button className="splash__btn splash__btn--back" onClick={() => setMenu('main')}>← Back</button>
          </div>
        )}

        {menu === 'exit' && (
          <div className="splash__panel">
            <div className="splash__panel-title">EXIT GAME?</div>
            <p className="splash__tag">Your progress is saved at the last bonfire. Are you sure you want to leave?</p>
            <div className="splash__slot-actions splash__slot-actions--center">
              <button className="splash__btn splash__btn--sm splash__btn--danger" onClick={onExit}>Yes, Exit</button>
              <button className="splash__btn splash__btn--sm" onClick={() => setMenu('main')}>Cancel</button>
            </div>
          </div>
        )}

        {confirmOverwrite && (
          <div className="splash__confirm">
            <div className="splash__panel">
              <div className="splash__panel-title">OVERWRITE SAVE?</div>
              <p className="splash__tag">This will replace the existing save in this slot.</p>
              <div className="splash__slot-actions splash__slot-actions--center">
                <button
                  className="splash__btn splash__btn--sm splash__btn--danger"
                  onClick={() => { const id = confirmOverwrite; setConfirmOverwrite(null); onNewGame(id); }}
                >
                  Overwrite
                </button>
                <button className="splash__btn splash__btn--sm" onClick={() => setConfirmOverwrite(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
