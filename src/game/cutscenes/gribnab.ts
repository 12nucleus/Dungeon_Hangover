// ─────────────────────────────────────────────────────────────
// cutscenes/gribnab — "The Soapy King" boss reveal.
// Same bath-song structure as the original warlord boss, but the captions
// are the bible's Pre-Fight blocks and they vary on how the player got
// the door open: knocked (calm, soapy) vs door_forced (very upset).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { CutsceneHost } from './types';
import { NPCS } from '../npc';

export async function playGribnabCutscene(h: CutsceneHost) {
  if (!h.structures) return;
  const st = h.structures;
  h.busy = true;
  h.bossCineActive = true;
  h.introSkipped = false;

  const forced = !!(h as any).flags?.has?.('door_forced');
  const introLine = forced ? NPCS.gribnab.dialogue.pre_fight_door.text : NPCS.gribnab.dialogue.pre_fight_soap.text;

  const boss = h.combat.units.find((u) => u.name === 'Gribnab') as any;
  const v = boss ? h.visuals.get(boss.id) : null;
  const bathWp = h.unitWorld(st.bossBath);
  const bathTop = bathWp.clone().add(new THREE.Vector3(0, 0.55, 0));
  const headWp = bathWp.clone().add(new THREE.Vector3(0, 1.25, 0));
  const westWp = h.unitWorld({ x: st.bossBath.x - 3, z: st.bossBath.z });

  const savedDist = h.iso.desiredDist, savedYaw = h.iso.desiredYaw, savedPitch = h.iso.desiredPitch;
  h.iso.lerp = 2.1;

  if (v && boss) {
    boss.pos = { ...st.bossBath };
    v.rig.group.position.copy(bathWp);
    v.rig.anim.mode = 'idle';
    v.rig.anim.crouch = 1.15;
    v.rig.anim.lunge = 0; v.rig.anim.flinch = 0;
    h.setWeapon(v.rig, null, boss.scheme.accent);
    h.faceToward(v, westWp, true);
  }

  // ── BEAT 1: push-in on the steam ──
  h.iso.focus(headWp);
  h.iso.desiredDist = 7.5; h.iso.desiredPitch = 0.62; h.iso.desiredYaw = -Math.PI * 0.28;
  h.showCine('The Bath Chamber of the Goblin King — steam, candles, and off-key humming…');
  h.audio.splash();
  await h.cineDelay(2200);
  h.clearCine();
  h.iso.desiredPitch = 0.95; h.iso.desiredYaw = -Math.PI * 0.45; h.iso.desiredDist = 16;
  h.iso.focus(bathWp.clone().add(new THREE.Vector3(0, 1.5, 0)));
  await h.cineDelay(1500);
  h.iso.focus(bathWp.clone().add(new THREE.Vector3(5.5, 1.2, 0)));
  await h.cineDelay(1600);
  h.iso.focus(bathWp.clone().add(new THREE.Vector3(-5.0, 1.0, 2)));
  await h.cineDelay(1500);

  // ── BEAT 2: the bath-time song ──
  h.iso.desiredDist = 6.5; h.iso.desiredPitch = 0.6; h.iso.desiredYaw = -Math.PI * 0.28;
  h.iso.focus(headWp);
  h.audio.sing();
  h.showCine('♪ Rub-a-dub-dub, a goblin king in his tub… ♪');
  for (let i = 0; i < 6; i++) { if (v) v.rig.anim.lunge = 0.35; h.waterPlink(bathTop); await h.cineDelay(950); }
  h.audio.sing(0.8);
  h.showCine('♪ …with ducks, and bubbles, and ZERO plans to be disturbed~ ♪');
  for (let i = 0; i < 6; i++) { if (v) v.rig.anim.lunge = 0.35; h.waterPlink(bathTop); await h.cineDelay(950); }
  h.clearCine();

  // ── BEAT 3: silence ──
  h.iso.desiredDist = 5.0; h.iso.desiredPitch = 0.54; h.iso.focus(headWp);
  await h.cineDelay(1500);
  if (v) v.rig.anim.flinch = 0.6;
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.12);
  await h.cineDelay(900);

  // ── BEAT 4: the greeting (varies on knocked vs forced) ──
  if (v) h.faceToward(v, westWp);
  h.audio.roar();
  if (v) v.rig.anim.flinch = 1;
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.34);
  h.showCine(introLine);
  h.speakDialogue('gribnab', forced ? 'pre_fight_door' : 'pre_fight_soap');
  await h.cineDelay(3600);
  h.clearCine();

  // ── BEAT 5: rises from the water ──
  h.iso.desiredDist = 9.0; h.iso.desiredPitch = 0.82; h.iso.focus(bathTop);
  if (v) {
    h.animateTo(() => v.rig.anim.crouch, (val) => { v.rig.anim.crouch = val; }, 0, 0.9);
    const baseY = v.rig.group.userData.baseY as number;
    h.animateTo(() => v.rig.group.position.y, (val) => { v.rig.group.position.y = val; }, baseY + 0.8, 0.45);
    setTimeout(() => { if (v) h.animateTo(() => v.rig.group.position.y, (val) => { v.rig.group.position.y = val; }, baseY, 0.5); }, 460);
  }
  h.audio.splash();
  h.splashBurst(bathTop, 34);
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.32);
  await h.cineDelay(1300);

  // ── BEAT 6: wade to the rack, seize the club ──
  if (v) {
    const rackWp = h.unitWorld({ x: st.bossBath.x + 2, z: st.bossBath.z });
    h.iso.focus(rackWp.clone().add(new THREE.Vector3(0, 0.9, 0)));
    await h.walkRigTo(v, { x: st.bossBath.x + 1, z: st.bossBath.z }, 1.4);
    h.faceToward(v, rackWp, true);
    await h.cineDelay(450);
    h.iso.desiredDist = 7.0; h.iso.desiredPitch = 0.62;
    v.rig.anim.lunge = 1;
    await h.cineDelay(360);
    if (h.rackClub) h.rackClub.visible = false;
    h.setWeapon(v.rig, 'club', boss.scheme.accent);
    h.audio.play('sword_hit', 0.6, 0.6);
    h.audio.bossSting();
    h.iso.shake = Math.max(h.iso.shake ?? 0, 0.3);
    h.fx.impactDust(h.particles, rackWp.clone().setY((v.rig.group.userData.baseY as number) + 0.9), [0x5a3a1e, 0xff9ac0]);
    await h.cineDelay(900);
  }

  // ── BEAT 7: round on the party ──
  if (v) {
    h.iso.focus(bathTop); h.iso.desiredDist = 8.0; h.iso.desiredPitch = 0.7;
    await h.walkRigTo(v, st.bossBath, 1.1);
    h.faceToward(v, westWp, true);
    v.rig.anim.lunge = 1;
  }
  h.audio.roar();
  h.audio.bossSting();
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.45);
  if (boss) boss.pos = { ...st.bossBath };
  h.showCine(NPCS.gribnab.dialogue.final_taunt.text);
  h.speakDialogue('gribnab', 'final_taunt');
  await h.cineDelay(2600);
  h.clearCine();

  // ── hand the camera back ──
  h.iso.desiredDist = savedDist; h.iso.desiredYaw = savedYaw; h.iso.desiredPitch = savedPitch;
  if (v) h.iso.focus(v.rig.group.position.clone());
  await h.cineDelay(700);
  h.iso.lerp = 7;

  // ── begin the battle (Gribnab fights alone — his guards are already gone) ──
  // wake ONLY Gribnab — the Baron (also bossGroup) must stay in his own arena
  for (const u of h.combat.units) if ((u as any).bossGroup && u.name === 'Gribnab') (u as any).dormant = false;
  h.pushLog('🫧 Gribnab the Soapy raises his soap-crusted club — the fight begins!', 'system');
  h.bossCineActive = false;
  h.busy = false;
  h.enqueue(h.combat.start());
}
