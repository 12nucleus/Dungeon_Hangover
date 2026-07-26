import { GameCanvas } from '@/components/GameCanvas';
import { PoseEditor } from '@/components/PoseEditor';
import { AnimationEditorPage } from '@/animationEditor/AnimationEditorPage';

export default function App() {
  // `?anim` routes to the standalone animation editor.
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('anim')) {
    return <AnimationEditorPage />;
  }
  // `?pose` routes to the standalone pose editor (no GameEngine / no game).
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('pose')) {
    return <PoseEditor />;
  }
  return <GameCanvas />;
}
