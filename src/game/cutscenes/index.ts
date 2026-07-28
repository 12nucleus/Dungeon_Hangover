// ─────────────────────────────────────────────────────────────
// cutscenes — barrel re-export
// ─────────────────────────────────────────────────────────────
export type { CutsceneHost, UnitVisual } from './types';
export { CutsceneDirector } from './director';
export { setupTitleScene, runTitleNarration, playTitleSequence, endTitleSequence } from './title';
export { playIntroCutscene, finishIntro } from './intro';
export { playBossCutscene } from './boss';
