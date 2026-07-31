import { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/game/engine';
import type { UISnapshot } from '@/game/types';
import { HUD } from './HUD';
import { SplashScreen } from './SplashScreen';
import { PauseMenu } from './PauseMenu';
import { LoadingScreen } from './LoadingScreen';
import { DebugPanel } from './DebugPanel';   // cutscene/level tweaker — only shown in ?debug mode

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [snap, setSnap] = useState<UISnapshot | null>(null);
  const isDebug = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');
  const [splashVisible, setSplashVisible] = useState(!isDebug);

  // Loading overlay — shown on first mount (asset/audio init) and between level
  // transitions (new game / load game). The engine still constructs + caches in
  // the background; we just cover it until it's safe to play.
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [loadingReady, setLoadingReady] = useState(false);
  const showLoadingBriefly = () => {
    setLoadingReady(false);
    setLoadingVisible(true);
    // re-ready after a short beat so the player sees the thought change
  };

  const startEngineAfterLoadingScene = useCallback(() => {
    if (engineRef.current?.renderer || !hostRef.current || !overlayRef.current) return;
    const engine = new GameEngine(hostRef.current, overlayRef.current, setSnap, () => {
      setLoadingReady(true);
    });
    engineRef.current = engine;
    engine.init();
    if (isDebug) engine.enterEditorMode();
  }, [isDebug]);

  useEffect(() => {
    return () => {
      if (engineRef.current?.renderer) engineRef.current.dispose();
      engineRef.current = null;
    };
  }, [isDebug]);

  const handleNewGame = (slotId: string) => {
    // The engine is already initialised in the background (deferred on mount),
    // so the game is ready the moment the player clicks "New Game" — no loading
    // screen needed here. Just drop the splash and start the run.
    engineRef.current?.startNewGame(slotId);
    setSplashVisible(false);
  };

  const handleLoad = (slotId: string) => {
    const loaded = engineRef.current?.loadGame(slotId) ?? false;
    setSplashVisible(false);
    showLoadingBriefly();     // same on load — different floor, different thought
    // loadGame restores the complete world synchronously. Do not leave the
    // overlay in an indeterminate state after that work has finished.
    if (loaded) setLoadingReady(true);
  };

  const handleResume = () => {
    engineRef.current?.setPaused(false);
  };

  const handlePauseLoad = (slotId: string) => {
    engineRef.current?.loadGame(slotId);
    engineRef.current?.setPaused(false);
  };

  const handleQuitToTitle = () => {
    // PERFORMANCE (Fix B): don't reload the page \u2014 ask the engine to
    // rebuild the title scene in-place. Saves ~3\u20135 s of re-parsing the
    // 1.16 MB JS bundle + re-running the synchronous engine init().
    engineRef.current?.returnToTitle();
    setSplashVisible(true);
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
      {splashVisible && (
        <SplashScreen
          visible
          onNewGame={handleNewGame}
          onLoad={handleLoad}
          onExit={handleExit}
          engineRef={engineRef}
        />
      )}
      <LoadingScreen
        visible={loadingVisible}
        ready={loadingReady}
        onContinue={() => { if (loadingReady) setLoadingVisible(false); }}
        onSceneReady={startEngineAfterLoadingScene}
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
