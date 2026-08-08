// ─────────────────────────────────────────────────────────────
// cutscenes/sporeMother — "The Dreamer of the Grotto" boss reveal.
// The Spore Mother stirs on her throne of living mushrooms; the
// narrator has opinions. Variant text if the player already smashed
// her throne (she wakes FURIOUS).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { CutsceneHost } from './types';

export async function playSporeMotherCutscene(h: CutsceneHost) {
  if (!h.structures) return;
  const st = h.structures;
  h.busy = true;
  h.bossCineActive = true;
  h.introSkipped = false;

  const throneBroken = !!(h as any).flags?.has?.('spore_throne_destroyed');

  const boss = h.combat.units.find((u) => u.name === 'The Spore Mother') as any;
  const v = boss ? h.visuals.get(boss.id) : null;
  const throneWp = h.unitWorld(boss?.pos ?? (st.arenaRect ? { x: (st.arenaRect.x0 + st.arenaRect.x1) >> 1, z: (st.arenaRect.z0 + st.arenaRect.z1) >> 1 } : { x: 0, z: 0 }));

  const savedDist = h.iso.desiredDist, savedYaw = h.iso.desiredYaw, savedPitch = h.iso.desiredPitch;
  h.iso.lerp = 2.1;

  // ── BEAT 1: push-in on the throne ──
  h.iso.focus(throneWp.clone().add(new THREE.Vector3(0, 2.2, 0)));
  h.iso.desiredDist = 9.0; h.iso.desiredPitch = 0.6; h.iso.desiredYaw = -Math.PI * 0.3;
  h.showCine('The throne of living mushrooms. It breathes. It dreams. It has been dreaming for a very long time.');
  h.audio.play('sword_hit', 0.4, 0.5);
  await h.cineDelay(2400);
  h.clearCine();
  h.iso.desiredDist = 14; h.iso.desiredPitch = 0.85; h.iso.desiredYaw = -Math.PI * 0.45;
  await h.cineDelay(1600);

  // ── BEAT 2: the mother stirs ──
  h.iso.desiredDist = 7.0; h.iso.desiredPitch = 0.62; h.iso.desiredYaw = -Math.PI * 0.3;
  h.iso.focus(throneWp.clone().add(new THREE.Vector3(0, 1.6, 0)));
  if (v) v.rig.anim.flinch = 0.5;
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.16);
  h.audio.bossSting();
  h.showCine('The throne EXHALES. The mushrooms part. Something beneath them was listening the whole time.');
  await h.cineDelay(2600);
  h.clearCine();

  // ── BEAT 3: she rises ──
  if (v) {
    v.rig.anim.flinch = 1;
    h.animateTo(() => v.rig.anim.crouch, (val) => { v.rig.anim.crouch = val; }, 1.15, 0.8);
    const baseY = v.rig.group.userData.baseY as number;
    h.animateTo(() => v.rig.group.position.y, (val) => { v.rig.group.position.y = val; }, baseY + 1.0, 0.5);
  }
  h.audio.play('sword_hit', 0.7, 0.4);
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.4);
  h.fx.impactDust(h.particles, throneWp.clone().setY((v ? v.rig.group.userData.baseY : 0) as number + 0.4), [0x9a5cf0, 0x4a3a5a, 0x6ac86a]);
  await h.cineDelay(1200);

  h.audio.roar();
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.5);
  if (v) {
    h.faceToward(v, h.unitWorld((h as any).combat?.living('party')[0]?.pos ?? { x: 0, z: 0 }), true);
    v.rig.anim.lunge = 1;
  }
  h.showCine(throneBroken
    ? 'The Spore Mother sees her CRUMBLED throne. The dreaming stops. The waking begins. You did this. You magnificent idiot, you did this.'
    : 'The Spore Mother opens her eyes. They are the colour of the deepest pool. She has been dreaming of you. Now she will dream OF you.');
  h.speakDialogue('spore_mother', throneBroken ? 'wake_broken' : 'wake');
  await h.cineDelay(3400);
  h.clearCine();

  // ── hand the camera back ──
  h.iso.desiredDist = savedDist; h.iso.desiredYaw = savedYaw; h.iso.desiredPitch = savedPitch;
  if (v) h.iso.focus(v.rig.group.position.clone());
  await h.cineDelay(600);
  h.iso.lerp = 7;

  // ── begin the battle ──
  for (const u of h.combat.units) if ((u as any).bossGroup && u.name === 'The Spore Mother') (u as any).dormant = false;
  h.pushLog('🍄 The Spore Mother rises to her full height. The grotto holds its breath. The fight begins!', 'system');
  h.bossCineActive = false;
  h.busy = false;
  h.enqueue(h.combat.start());
}
