import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { GameEngine } from '@/game/engine';
import { SlotPicker, SettingsPanel } from './MenuPanels';

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

/**
 * HTML splash overlay shown on top of the engine's animated tavern-exterior
 * backdrop. It is NOT a separate 3D scene — the tavern the player sees here is
 * the exact same one the title cutscene continues from once this fades away.
 *
 * Hosts the full main menu: New Game (slot picker), Load Game (slot picker),
 * Settings (volume / mute) and Exit.
 */
export function SplashScreen({ visible, onNewGame, onLoad, onExit, engineRef }: SplashScreenProps) {
  const [menu, setMenu] = useState<Menu>('main');
  const [intent, setIntent] = useState<SlotIntent>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<string | null>(null);

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
        if (menu === 'main') {
          setIntent('new');
          setMenu('slots');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, menu]);

  const pickSlot = (slotId: string) => {
    if (intent === 'load') {
      onLoad(slotId);
      return;
    }
    // new game — confirm before clobbering an existing save
    const meta = engineRef.current?.getSlotMeta(slotId);
    if (meta) {
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
            <button className="splash__btn" onClick={() => { setIntent('new'); setMenu('slots'); }}>⚔ NEW GAME</button>
            <button className="splash__btn" onClick={() => { setIntent('load'); setMenu('slots'); }}>📂 LOAD GAME</button>
            <button className="splash__btn" onClick={() => setMenu('settings')}>⚙ SETTINGS</button>
            <button className="splash__btn splash__btn--danger" onClick={() => setMenu('exit')}>🚪 EXIT</button>
            <p className="splash__hint">press Enter for a new game · Esc to go back</p>
          </div>
        )}

        {menu === 'slots' && (
          <div className="splash__panel">
            <SlotPicker engineRef={engineRef} intent={intent ?? 'new'} onPick={pickSlot}
              onBack={() => { setMenu('main'); setIntent(null); }} />
          </div>
        )}

        {menu === 'settings' && (
          <div className="splash__panel">
            <SettingsPanel engineRef={engineRef} onBack={() => setMenu('main')} />
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
