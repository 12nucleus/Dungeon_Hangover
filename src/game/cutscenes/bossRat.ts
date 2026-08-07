// ─────────────────────────────────────────────────────────────
// cutscenes/bossRat — Baron Gnaw, the Boss Rat reveal.
// Three quick beats: camera push-in, glowing eyes, and the fight.
// Triggered by entering Room 5 (structures.arenaRect).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { CutsceneHost } from './types';
import type { GridPos } from '../types';

export async function playBossRatCutscene(h: CutsceneHost) {
  if (!h.structures) return;
  const st = h.structures;
  h.busy = true;
  h.bossCineActive = true;
  h.introSkipped = false;

  const baron = h.combat.units.find((u) => u.name === 'Baron Gnaw') as any;
  const v = baron ? h.visuals.get(baron.id) : null;
  const rect = st.arenaRect ?? st.bossRoom;
  const center: GridPos = rect ? { x: (rect.x0 + rect.x1) >> 1, z: (rect.z0 + rect.z1) >> 1 } : baron?.pos ?? { x: 0, z: 0 };
  const wp = h.unitWorld(center);
  const eyeWp = wp.clone().add(new THREE.Vector3(0, 0.9, 0));

  const savedDist = h.iso.desiredDist, savedYaw = h.iso.desiredYaw, savedPitch = h.iso.desiredPitch;
  h.iso.lerp = 2.2;

  // position the baron at the lair's heart, watching
  if (baron && v) {
    baron.pos = { ...center };
    v.rig.group.position.copy(wp);
    v.rig.group.userData.baseY = wp.y;
    v.rig.anim.mode = 'idle';
    h.faceToward(v, h.unitWorld({ x: center.x - 3, z: center.z }), true);
  }

  // ── BEAT 1: the lair, the pedestal, the eyes ──
  h.iso.focus(eyeWp);
  h.iso.desiredDist = 5.5; h.iso.desiredPitch = 0.5; h.iso.desiredYaw = -Math.PI * 0.3;
  await h.narrate('boss_rat_1', 'The room smells like rat. Specifically, like a rat that has never once considered bathing.', 2600);
  h.iso.desiredDist = 9.0; h.iso.desiredPitch = 0.72; h.iso.desiredYaw = -Math.PI * 0.5;
  await h.cineDelay(1400);

  // ── BEAT 2: the eyes glow red ──
  if (v) {
    h.faceToward(v, h.unitWorld({ x: center.x + 4, z: center.z }), true);
    v.rig.anim.flinch = 0.4;
  }
  h.audio.squeak();
  h.audio.screech();
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.15);
  await h.narrate('boss_rat_2', 'In the center, on a little bone pedestal, is a finger. It has a ring on it. The rat is watching you. The rat is ALWAYS watching.', 3400);

  // ── BEAT 3: round on the party, fight ──
  if (v) {
    h.iso.desiredDist = 7.0; h.iso.desiredPitch = 0.6;
    h.faceToward(v, h.unitWorld(h.combat.living('party')[0]?.pos ?? center), true);
    v.rig.anim.lunge = 1;
  }
  h.audio.roar(0.7);
  h.audio.bossSting();
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.4);
  h.showCine("BARON GNAW claims the finger. The finger is his. The ring is his. EVERYTHING IS HIS.");
  h.speakDialogue('baron_gnaw', 'claims');
  await h.cineDelay(2400);
  h.clearCine();

  // hand the camera back
  h.iso.desiredDist = savedDist; h.iso.desiredYaw = savedYaw; h.iso.desiredPitch = savedPitch;
  if (v) h.iso.focus(v.rig.group.position.clone());
  await h.cineDelay(600);
  h.iso.lerp = 7;

  // wake the baron's group (unless already pacified) & begin
  if (!(h as any).flags?.has?.('boss_pacified')) {
    for (const u of h.combat.units) {
      if ((u as any).groupId === 'baron_gnaw') (u as any).dormant = false;
    }
  }
  h.pushLog('🐀 Baron Gnaw bares every tooth he has, and he has MANY. The fight begins!', 'system');
  h.bossCineActive = false;
  h.busy = false;
  h.enqueue(h.combat.start());
}
