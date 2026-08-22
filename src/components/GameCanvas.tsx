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
    (window as any).__engine = engine;
    engine.init();
    if (isDebug) engine.enterEditorMode();
  }, [isDebug]);

  // Fullscreen crit flash — the engine bumps snap.critFlash (epoch id) on
  // every critical hit; React shows the flash briefly so it re-triggers each
  // time even back-to-back.
  const [critFlashOn, setCritFlashOn] = useState(false);
  const lastCritRef = useRef(0);
  useEffect(() => {
    const cf = snap?.critFlash ?? 0;
    if (cf && cf !== lastCritRef.current) {
      lastCritRef.current = cf;
      setCritFlashOn(true);
      const t = setTimeout(() => setCritFlashOn(false), 340);
      return () => clearTimeout(t);
    }
  }, [snap?.critFlash]);

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
    // stop render/audio loops FIRST — a half-dead RAF loop is what painted the
    // white canvas while the window hung
    try { engineRef.current?.shutdownForExit(); } catch { /* ignore */ }
    // Tauri desktop: destroy() bypasses the close-request handler that
    // window.close() honours — close() could be vetoed/hang and leave the
    // webview white while the process lived. Destroying the last window
    // lets the tao event loop end the process naturally.
    void import('@tauri-apps/api/window')
      .then((w) => w.getCurrentWindow().destroy())
      .catch(() => {
        // close() refused (tab not script-opened): leave a visible goodbye
        // instead of a frozen canvas pretending to be alive
        setTimeout(() => {
          const veil = document.createElement('div');
          veil.innerHTML = '<div style="display:flex;height:100vh;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#0b0a08;color:#d8c9a3;font-family:monospace;text-align:center"><div style="font-size:30px">🔥 The fire dims.</div><div>Thanks for playing — you can close this tab now.</div></div>';
          document.body.appendChild(veil);
        }, 350);
      });
  };

  return (
    <div className="game-root">
      <div ref={hostRef} className="game-canvas" />
      <div ref={overlayRef} className="fx-layer" />
      {/* fullscreen combat juice — mounted beside the fx layer, driven by engine state
          (critFlash epoch id re-triggers the flash; tpkVignette holds while defeated) */}
      <div className="fx-crit-flash" style={{ opacity: critFlashOn ? 1 : 0, pointerEvents: 'none' }} />
      <div className={`fx-tpk-vignette ${snap?.tpkVignette ? 'on' : ''}`} style={{ pointerEvents: 'none' }} />
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
