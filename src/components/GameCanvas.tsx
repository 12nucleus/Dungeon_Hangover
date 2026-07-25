import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/game/engine';
import type { UISnapshot } from '@/game/types';
import { HUD } from './HUD';
import { SplashScreen } from './SplashScreen';
import { PauseMenu } from './PauseMenu';
import { DebugPanel } from './DebugPanel';   // cutscene/level tweaker — only shown in ?debug mode

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [snap, setSnap] = useState<UISnapshot | null>(null);
  const isDebug = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');
  const [splashVisible, setSplashVisible] = useState(!isDebug);

  useEffect(() => {
    if (!hostRef.current || !overlayRef.current || engineRef.current) return;
    const engine = new GameEngine(hostRef.current, overlayRef.current, setSnap);
    engineRef.current = engine;
    engine.init();
    // in ?debug mode skip the splash + intro director; build the idle tavern
    if (isDebug) engine.enterEditorMode();
    return () => { engine.dispose(); engineRef.current = null; };
  }, [isDebug]);

  const handleNewGame = (slotId: string) => {
    engineRef.current?.startNewGame(slotId);
    setSplashVisible(false);
  };

  const handleLoad = (slotId: string) => {
    engineRef.current?.loadGame(slotId);
    setSplashVisible(false);
  };

  const handleResume = () => {
    engineRef.current?.setPaused(false);
  };

  const handlePauseLoad = (slotId: string) => {
    engineRef.current?.loadGame(slotId);
    engineRef.current?.setPaused(false);
  };

  const handleQuitToTitle = () => {
    // the title scene was torn down when the run started, so a full reload
    // is the clean way back to a fresh splash
    window.location.reload();
  };

  const handleExit = () => {
    // best-effort: browsers only allow script-close for script-opened
    // windows, so this is a no-op in most cases and the menu simply stays.
    window.close();
  };

  return (
    <div className="game-root">
      <div ref={hostRef} className="game-canvas" />
      <div ref={overlayRef} className="fx-layer" />
      <HUD snap={snap} engine={engineRef.current} />
      {isDebug && <DebugPanel engine={engineRef.current} />}
      <SplashScreen
        visible={splashVisible}
        onNewGame={handleNewGame}
        onLoad={handleLoad}
        onExit={handleExit}
        engineRef={engineRef}
      />
      <PauseMenu
        visible={!!snap?.paused}
        onResume={handleResume}
        onLoad={handlePauseLoad}
        onQuitToTitle={handleQuitToTitle}
        engineRef={engineRef}
      />
    </div>
  );
}
