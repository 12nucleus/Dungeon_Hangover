import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/game/engine';
import type { UISnapshot } from '@/game/types';
import { HUD } from './HUD';
import { SplashScreen } from './SplashScreen';

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [snap, setSnap] = useState<UISnapshot | null>(null);
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    if (!hostRef.current || !overlayRef.current || engineRef.current) return;
    const engine = new GameEngine(hostRef.current, overlayRef.current, setSnap);
    engineRef.current = engine;
    engine.init();
    return () => { engine.dispose(); engineRef.current = null; };
  }, []);

  const handleEnterDungeon = () => {
    engineRef.current?.enterDungeon();
    setSplashVisible(false);
  };

  return (
    <div className="game-root">
      <div ref={hostRef} className="game-canvas" />
      <div ref={overlayRef} className="fx-layer" />
      <HUD snap={snap} engine={engineRef.current} />
      <SplashScreen visible={splashVisible} onEnter={handleEnterDungeon} />
    </div>
  );
}
