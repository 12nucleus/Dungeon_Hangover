import { GameCanvas } from '@/components/GameCanvas';
import { PoseEditor } from '@/components/PoseEditor';

export default function App() {
  // `?pose` routes to the standalone pose editor (no GameEngine / no game).
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('pose')) {
    return <PoseEditor />;
  }
  return <GameCanvas />;
}
