import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { GameEngine } from '@/game/engine';
import { SlotPicker, SettingsPanel } from './MenuPanels';

interface PauseMenuProps {
  /** driven by the engine's `paused` flag in the UISnapshot */
  visible: boolean;
  onResume: () => void;
  onLoad: (slotId: string) => void;
  /** return to the title screen */
  onQuitToTitle: () => void;
  engineRef: MutableRefObject<GameEngine | null>;
}

type Menu = 'main' | 'slots' | 'settings';

/**
 * In-game pause menu. Opens when the player presses Esc during play; the
 * engine freezes the simulation (see GameEngine.setPaused) while this is up.
 * Reuses the shared SlotPicker / SettingsPanel so it matches the title menu.
 */
export function PauseMenu({ visible, onResume, onLoad, onQuitToTitle, engineRef }: PauseMenuProps) {
  const [menu, setMenu] = useState<Menu>('main');

  // reset to the main panel each time the menu is (re)opened
  useEffect(() => { if (visible) setMenu('main'); }, [visible]);

  if (!visible) return null;

  return (
    <div className="pause-menu" aria-hidden={!visible}>
      <div className="pause-menu__scrim" />
      <div className="splash__content">
        <div className="splash__rune">❚❚</div>
        <h1 className="splash__title splash__title--sm">PAUSED</h1>

        {menu === 'main' && (
          <div className="splash__menu">
            <button className="splash__btn" onClick={onResume}>▶ RESUME</button>
            <button className="splash__btn" onClick={() => setMenu('slots')}>📂 LOAD GAME</button>
            <button className="splash__btn" onClick={() => setMenu('settings')}>⚙ SETTINGS</button>
            <button className="splash__btn splash__btn--danger" onClick={onQuitToTitle}>🏠 MAIN MENU</button>
            <p className="splash__hint">press Esc to resume</p>
          </div>
        )}

        {menu === 'slots' && (
          <div className="splash__panel">
            <SlotPicker engineRef={engineRef} intent="load" onPick={onLoad} onBack={() => setMenu('main')} />
          </div>
        )}

        {menu === 'settings' && (
          <div className="splash__panel">
            <SettingsPanel engineRef={engineRef} onBack={() => setMenu('main')} />
          </div>
        )}
      </div>
    </div>
  );
}
