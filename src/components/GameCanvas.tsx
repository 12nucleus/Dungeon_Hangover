import { useEffect, useRef, useState } from 'react';
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
  // Auto-mark ready after a short delay (asset decode + first render). The
  // engine has already started building the title scene behind this overlay.
  useEffect(() => {
    if (!loadingVisible) return;
    const id = window.setTimeout(() => setLoadingReady(true), 1100);
    return () => window.clearTimeout(id);
  }, [loadingVisible]);
  const showLoadingBriefly = () => {
    setLoadingReady(false);
    setLoadingVisible(true);
    // re-ready after a short beat so the player sees the thought change
    window.setTimeout(() => setLoadingReady(true), 900);
  };

  useEffect(() => {
    if (!hostRef.current || !overlayRef.current || engineRef.current) return;
    const engine = new GameEngine(hostRef.current, overlayRef.current, setSnap);
    engineRef.current = engine;
    // Defer the heavy engine.init() until AFTER the loading screen has had a
    // chance to paint (its own THREE scene). This avoids blocking the first
    // frame where Greg should appear instantly. We yield to the browser with
    // requestAnimationFrame so the loading screen renders once before the
    // engine constructs its WebGLRenderer, lights, and defers the world build.
    let rafId = requestAnimationFrame(() => {
      if (!engine.disposed) engine.init();
      // in ?debug mode skip the splash + intro director; build the idle tavern
      if (isDebug) engine.enterEditorMode();
      rafId = 0; // mark as fired
    });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      // engine.init() may not have run yet (renderer undefined) — guard it.
      if (engine.renderer) engine.dispose();
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
    engineRef.current?.loadGame(slotId);
    setSplashVisible(false);
    showLoadingBriefly();     // same on load — different floor, different thought
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
      <SplashScreen
        visible={splashVisible}
        onNewGame={handleNewGame}
        onLoad={handleLoad}
        onExit={handleExit}
        engineRef={engineRef}
      />
      <LoadingScreen
        visible={loadingVisible}
        ready={loadingReady}
        onContinue={() => { if (loadingReady) setLoadingVisible(false); }}
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
