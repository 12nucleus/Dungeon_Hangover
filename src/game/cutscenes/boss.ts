// ─────────────────────────────────────────────────────────────
// cutscenes/boss — "The Bathing Tyrant" boss reveal cutscene
// ═════════════════════════════════════════════════════════════
import * as THREE from 'three';
import type { CutsceneHost } from './types';
import type { GridPos, Unit } from '../types';

export async function playBossCutscene(h: CutsceneHost) {
  if (!h.structures) return;
  const st = h.structures;
  h.busy = true;
  h.bossCineActive = true;
  h.introSkipped = false;

  const boss = h.combat.units.find((u) => (u as any).bossGroup && (u as any).dropKey === 'golden') as Unit | undefined;
  const v = boss ? h.visuals.get(boss.id) : null;
  const bathWp = h.unitWorld(st.bossBath);
  const bathTop = bathWp.clone().add(new THREE.Vector3(0, 0.55, 0));
  const headWp = bathWp.clone().add(new THREE.Vector3(0, 1.25, 0));
  const westWp = h.unitWorld({ x: st.bossBath.x - 3, z: st.bossBath.z });
  const rackApproach: GridPos = { x: st.bossBath.x + 1, z: st.bossBath.z };
  const rackWp = h.unitWorld({ x: st.bossBath.x + 2, z: st.bossBath.z });

  const savedDist = h.iso.desiredDist, savedYaw = h.iso.desiredYaw, savedPitch = h.iso.desiredPitch;
  h.iso.lerp = 2.1;

  if (v && boss) {
    boss.pos = { ...st.bossBath };
    v.rig.group.position.copy(bathWp);
    v.rig.anim.mode = 'idle';
    v.rig.anim.crouch = 1.2;
    v.rig.anim.lunge = 0; v.rig.anim.flinch = 0;
    h.setWeapon(v.rig, null, boss.scheme.accent);
    if (h.rackClub) h.rackClub.visible = true;
    h.faceToward(v, westWp, true);
  }

  // ── BEAT 1: push-in + pan ──
  h.iso.focus(headWp);
  h.iso.desiredDist = 7.5; h.iso.desiredPitch = 0.62; h.iso.desiredYaw = -Math.PI * 0.28;
  h.showCine('The Warlord\'s Warren — the innermost chamber…');
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

  // ── BEAT 2: bath-time song ──
  h.iso.desiredDist = 6.5; h.iso.desiredPitch = 0.6; h.iso.desiredYaw = -Math.PI * 0.28;
  h.iso.focus(headWp);
  h.audio.sing();
  h.showCine('♪ Rub-a-dub-dub, a warlord in his tub… ♪');
  for (let i = 0; i < 6; i++) { if (v) v.rig.anim.lunge = 0.35; h.waterPlink(bathTop); await h.cineDelay(950); }
  h.audio.sing(0.8);
  h.showCine('♪ …scrubbin\' off the blood of the fools I clubbed~ ♪');
  for (let i = 0; i < 6; i++) { if (v) v.rig.anim.lunge = 0.35; h.waterPlink(bathTop); await h.cineDelay(950); }
  h.clearCine();

  // ── BEAT 3: silence ──
  h.iso.desiredDist = 5.0; h.iso.desiredPitch = 0.54; h.iso.focus(headWp);
  await h.cineDelay(1500);
  if (v) v.rig.anim.flinch = 0.6;
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.12);
  await h.cineDelay(900);

  // ── BEAT 4: bellow ──
  if (v) h.faceToward(v, westWp);
  h.audio.roar();
  if (v) v.rig.anim.flinch = 1;
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.34);
  h.showCine('"WHO DARES DISTURB MY ROYAL BATH?!"');
  await h.cineDelay(2600);
  h.audio.roar(0.85);
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.28);
  h.showCine('"MY ONE HOUR OF PEACE — RUINED!!"');
  await h.cineDelay(2400);
  h.clearCine();

  // ── BEAT 5: erupts from the water ──
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

  // ── BEAT 6: wade to the rack ──
  if (v) {
    h.iso.focus(rackWp.clone().add(new THREE.Vector3(0, 0.9, 0)));
    await h.walkRigTo(v, rackApproach, 1.4);
    h.faceToward(v, rackWp, true);
    await h.cineDelay(450);
  }

  // ── BEAT 7: seize the club ──
  if (v && boss) {
    h.iso.desiredDist = 7.0; h.iso.desiredPitch = 0.62;
    v.rig.anim.lunge = 1;
    await h.cineDelay(360);
    if (h.rackClub) h.rackClub.visible = false;
    h.setWeapon(v.rig, 'club', boss.scheme.accent);
    h.audio.play('sword_hit', 0.6, 0.6);
    h.audio.bossSting();
    h.iso.shake = Math.max(h.iso.shake ?? 0, 0.3);
    h.fx.impactDust(h.particles, rackWp.clone().setY((v.rig.group.userData.baseY as number) + 0.9), [0x5a3a1e, 0x2a1f1a]);
    await h.cineDelay(900);
  }

  // ── BEAT 8: round on the party ──
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
  h.showCine('"NONE LEAVE MY WARREN ALIVE!"');
  await h.cineDelay(2400);
  h.clearCine();

  // ── hand the camera back to the player ──
  h.iso.desiredDist = savedDist; h.iso.desiredYaw = savedYaw; h.iso.desiredPitch = savedPitch;
  if (v) h.iso.focus(v.rig.group.position.clone());
  await h.cineDelay(700);
  h.iso.lerp = 7;

  // ── wake his honour-guard & begin the battle ──
  for (const u of h.combat.units) if ((u as any).bossGroup) (u as any).dormant = false;
  h.pushLog('👑 Warlord Gorruk heaves his greatclub from the rack — the fight begins!', 'system');
  h.bossCineActive = false;
  h.busy = false;
  h.enqueue(h.combat.start());
}
