import { useEffect } from 'react';

interface SplashScreenProps {
  /** when false the overlay fades out (CSS transition) to reveal the
   *  already-running tavern-exterior cutscene underneath */
  visible: boolean;
  /** called when the player clicks "Enter the Dungeon" (or presses Enter) */
  onEnter: () => void;
}

/**
 * HTML splash overlay shown on top of the engine's animated tavern-exterior
 * backdrop. It is NOT a separate 3D scene — the tavern the player sees here is
 * the exact same one the title cutscene continues from once this fades away.
 */
export function SplashScreen({ visible, onEnter }: SplashScreenProps) {
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onEnter]);

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
        <button className="splash__enter" onClick={onEnter}>⚔ ENTER THE DUNGEON</button>
        <p className="splash__hint">press Enter</p>
      </div>
    </div>
  );
}
