// ─────────────────────────────────────────────────────────────
// cutscenes/title — Title card sequence
// ═════════════════════════════════════════════════════════════
import * as THREE from 'three';
import type { CutsceneHost } from './types';
import { playIntroCutscene } from './intro';


/**
 * Builds the tavern exterior as a static, animated splash backdrop.
 * No narration or music is started here — those require a user gesture
 * (the "Enter the Dungeon" click) and are handled by runTitleNarration,
 * so the cutscene continues seamlessly from this exact framing.
 * Returns the exterior group + the previous scene background so the caller
 * can later transition into the interior tavern cutscene.
 */
export function setupTitleScene(h: CutsceneHost): { ext: THREE.Group; prevBg: any } {
  h.busy = true;
  h.introActive = true;
  h.introSkipped = false;
  h.cinematic = true;
  h.emitSnapshot();

  h.worldGroup.visible = false;
  h.propsGroup.visible = false;
  if (h.dressingGroup) h.dressingGroup.visible = false;
  if (h.trapGroup) h.trapGroup.visible = false;
  for (const [, v] of h.visuals) v.rig.group.visible = false;

  const prevBg = h.scene.background as any;
  h.scene.background = new THREE.Color(0x070713);
  h.scene.fog = new THREE.Fog(0x070713, 14, 40);

  const ext = h.buildTavernExterior();
  h.scene.add(ext);

  const chimTop = ext.userData.chimneyTop as THREE.Vector3;
  h.titleIdle = true;
  let smokeT = 0, idleT = 0;
  h.propAnims.push((dt: number) => {
    if (!ext.parent) return true;
    // gentle idle orbit while the splash is up (stopped once the title
    // narration takes over the camera)
    if (h.titleIdle) {
      idleT += dt;
      h.iso.desiredYaw = 0.24 + Math.sin(idleT * 0.16) * 0.14;
    }
    smokeT += dt;
    if (smokeT > 0.10) {
      smokeT = 0;
      h.particles.burst({
        pos: chimTop.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25)),
        count: 2,
        color: [0x9aa0aa, 0x7a808a, 0xb0b6c0],
        speed: [0.4, 1.2], life: [2.2, 4.2], size: [0.32, 0.78],
        gravity: -0.5, up: 1.7, drag: 0.92, endScale: 0.04,
      });
    }
    return false;
  });

  h.iso.lerp = 2.0;
  h.iso.box = { minX: -16, maxX: 16, minZ: -16, maxZ: 16, minY: 0, maxY: 18 };
  h.iso.desiredYaw = 0.24; h.iso.desiredPitch = 0.42; h.iso.desiredDist = 11.5;
  h.iso.focus(new THREE.Vector3(0, 3.0, 0));

  // ensure the scene is fully revealed (not black) behind the splash overlay
  h.fadeTo(0);

  return { ext, prevBg };
}

/**
 * Runs the title-card narration + camera moves, then transitions into the
 * interior tavern cutscene. Designed to be called after setupTitleScene so
 * the front-of-tavern view the player has been looking at continues
 * seamlessly into the "inside the tavern" act.
 */
export async function runTitleNarration(h: CutsceneHost, ext: THREE.Group, prevBg: any) {
  h.titleIdle = false;
  // Only (re)start the tavern theme if the splash gesture hasn't already
  // kicked it off — avoids a jarring restart when the player enters.
  if (!h.audio.isTavernMusicPlaying()) {
    h.audio.stopMusic();
    h.audio.playTavernMusic({ muffled: true, volume: 0.10 });
    h.audio.setMusicDucked(true);
  }
  await h.cineDelay(500);
  if (h.introSkipped) { endTitleSequence(h, ext, prevBg); return; }

  await h.narrate('title_1', 'In a tavern far, far away…', 3400);
  if (h.introSkipped) { endTitleSequence(h, ext, prevBg); return; }

  const signWp = ext.userData.signBoardWp as THREE.Vector3;
  h.iso.desiredYaw = 0.10; h.iso.desiredPitch = 0.30; h.iso.desiredDist = 4.2;
  h.iso.focus(signWp.clone().add(new THREE.Vector3(0, 0.2, 0.4)));
  await h.cineDelay(900);
  await h.narrate('title_2', 'Actually, not that far. Just around the corner from the village...', 4000);
  if (h.introSkipped) { endTitleSequence(h, ext, prevBg); return; }

  h.fadeTo(1); await h.cineDelay(700);
  endTitleSequence(h, ext, prevBg);
}

/**
 * Full title sequence (setup + narration) — fallback entry point used when
 * the splash overlay is bypassed. The splash flow calls setupTitleScene then
 * runTitleNarration separately so the HTML title can fade out in between.
 */
export async function playTitleSequence(h: CutsceneHost) {
  const { ext, prevBg } = setupTitleScene(h);
  h.fadeTo(1); await h.cineDelay(500); h.fadeTo(0);
  await runTitleNarration(h, ext, prevBg);
}

export function endTitleSequence(h: CutsceneHost, ext: THREE.Group, prevBg: any) {
  h.clearCine();
  h.scene.remove(ext);
  h.scene.background = prevBg as any;
  h.audio.setTavernMuffled(false);
  h.audio.setMusicDucked(false);
  const hero = h.combat.living('party')[0];
  const hv = hero ? h.visuals.get(hero.id) : null;
  if (hv) hv.rig.group.visible = true;
  // chain into the interior act
  void playIntroCutscene(h);
}
