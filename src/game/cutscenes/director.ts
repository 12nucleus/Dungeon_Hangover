// ─────────────────────────────────────────────────────────────
// cutscenes/director — CutsceneDirector class
// ─────────────────────────────────────────────────────────────
import type { CutsceneHost } from './types';
import { playIntroCutscene } from './intro';
import { playTitleSequence } from './title';
import { playBossRatCutscene } from './bossRat';
import { playGribnabCutscene } from './gribnab';
import { playSporeMotherCutscene } from './sporeMother';

export type CutsceneId = 'intro' | 'title' | 'boss_rat' | 'gribnab' | 'spore_mother';

/**
 * DIRECTOR — the one object the engine creates & talks to.
 * Routes skip input, tracks `active` cutscene id, and dispatches.
 */
export class CutsceneDirector {
  private host: CutsceneHost;
  /** currently-running cutscene id (null = none). */
  activeId: CutsceneId | null = null;

  constructor(host: CutsceneHost) { this.host = host; }

  /** engine should call when space/escape is pressed during a cutscene.
   *  Sets BOTH the public skip flag (so cutscene scripts' `if (h.introSkipped)`
   *  checks trip) AND the internal `cutsceneSkip` flag (so the engine's own
   *  cineDelay/narrate awaits resolve immediately). */
  requestSkip() {
    if (!this.activeId) return;
    this.host.introSkipped = true;
    this.host.markSkipped();
  }

  /** start a cutscene by id. returns once it has finished (skipped or natural). */
  async play(id: CutsceneId): Promise<void> {
    if (this.activeId) return;   // never overlap cutscenes
    this.activeId = id;
    this.host.introSkipped = false;
    this.host.resetSkipState();
    try {
      if (id === 'title') await playTitleSequence(this.host);
      else if (id === 'intro') await playIntroCutscene(this.host);
      else if (id === 'boss_rat') await playBossRatCutscene(this.host);
      else if (id === 'gribnab') await playGribnabCutscene(this.host);
      else if (id === 'spore_mother') await playSporeMotherCutscene(this.host);
    } finally {
      this.activeId = null;
    }
  }
}
