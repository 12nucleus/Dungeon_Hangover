// ─────────────────────────────────────────────────────────────
// cutscenes/intro — "Dungeon Hangover" intro cutscene
// ═════════════════════════════════════════════════════════════
import * as THREE from 'three';
import type { CutsceneHost } from './types';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Full intro cutscene — Greg in the tavern, the wizard polymorph,
 * waking in the dungeon.
 */
export async function playIntroCutscene(h: CutsceneHost) {
  const hero = h.combat.living('party')[0];
  if (!hero) return;
  const hv = h.visuals.get(hero.id);
  if (!hv) return;
  h.busy = true;
  h.introActive = true;
  h.introSkipped = false;

  // ── build the tavern flashback, drop the dungeon behind it ──
  h.inTavern = true;
  h.worldGroup.visible = false;
  h.propsGroup.visible = false;
  for (const [id, v] of h.visuals) {
    v.bar.style.display = 'none';
    if (id !== hero.id) v.rig.group.visible = false;
  }
  h.tavern = h.buildTavern();
  h.scene.add(h.tavern);
  h.scene.fog = new THREE.Fog(0x140d08, 6, 26);

  const poi = (h.tavern!.userData as { poi: Record<string, THREE.Vector3> }).poi;

  // -- seat Greg at his table: sitting, tankard in hand, facing into the room --
  // poi.gregSeat.y is 0.8 (a camera focus height), but the rig origin is at
  // the feet — drop him to the floor so he actually sits on the stool.
  const seat = poi.gregSeat.clone();
  seat.y = 0;
  hv.rig.group.position.copy(seat);
  hv.rig.group.rotation.y = Math.PI;
  hv.yaw = hv.targetYaw = Math.PI;
  hv.rig.anim.mode = 'sit'; hv.rig.anim.crouch = 0; hv.rig.anim.lunge = 0; hv.rig.anim.flinch = 0;
  hv.rig.group.scale.setScalar(1);

  // voxel tankard in Greg's left hand
  const mug = new THREE.Group();
  const mugBody = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.24, 0.20), new THREE.MeshLambertMaterial({ color: 0x8a5a2e }));
  const mugFoam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.22), new THREE.MeshLambertMaterial({ color: 0xf2ead2 }));
  mugFoam.position.y = 0.14; mug.add(mugBody, mugFoam);
  const hand = hv.rig.parts.handL ?? hv.rig.parts.armL;
  let mugHand: THREE.Object3D | null = null;
  if (hand) { mug.position.set(0, -0.02, 0.10); hand.add(mug); mugHand = hand; }
  if (mugHand) {
    // Keep the tankard level by counter-rotating it against the hand's world
    // pitch. Reading world orientation (via quaternion) is hierarchy-agnostic:
    // works for both the legacy flat rig and the unified hierarchical skeleton.
    const handObj = hand;
    const tmpQ = new THREE.Quaternion();
    const tmpE = new THREE.Euler();
    h.propAnims.push(() => {
      if (!h.tavern) return true;
      handObj.getWorldQuaternion(tmpQ);
      tmpE.setFromQuaternion(tmpQ, 'XYZ');
      mug.rotation.x = -tmpE.x;
      return false;
    });
  }
  h.setWeapon(hv.rig, null, hero.scheme.accent);

  // -- camera: kept inside the little set (box clamp) with slow cinematic easing --
  h.iso.lerp = 2.0;
  h.iso.box = { minX: -4.2, maxX: 4.2, minZ: -3.4, maxZ: 5.6, minY: 0.5, maxY: 3.2 };
  h.iso.desiredYaw = Math.PI * 0.78; h.iso.desiredPitch = 0.44; h.iso.desiredDist = 5.4;
  h.iso.focus(poi.gregHead);
  h.fadeTo(0);
  h.audio.stopMusic(); h.audio.stopTavernMusic(); h.audio.playTavernMusic();
  await h.cineDelay(900);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 1: establishing - the warm, dingy room; Greg mid-bender ==
  await h.narrate('t_open', 'The Dirty Mug. Last call came and went two hours ago. Nobody has found the courage to tell Greg.', 5200);
  if (h.introSkipped) { finishIntro(h); return; }
  // Greg takes a long, theatrical sip: a single 3-second keyframed animation
  // (raise the mug → sip with head tilted back → lower it back to the table).
  // The clip drives the arm/head rotations; updateRig keeps the sitting hip-sink.
  hv.rig.anim.t = 0;
  hv.rig.anim.mode = 'drink_anim';
  await h.cineDelay(3000);
  hv.rig.anim.mode = 'sit';

  // == BEAT 2: Greg holds court ==
  h.iso.desiredYaw = Math.PI * 0.16; h.iso.desiredPitch = 0.36; h.iso.desiredDist = 3.6;
  h.iso.focus(poi.gregHead);
  await h.cineDelay(700);
  hv.rig.anim.lunge = 0.7;
  await h.narrate('greg_a', "Barkeep! Another! And one for me shadow - the big fella's had a hard night an' all!", 5000);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 3: slow pan across the unimpressed room ==
  h.iso.desiredYaw = -Math.PI * 0.4; h.iso.desiredPitch = 0.5; h.iso.desiredDist = 6.6;
  h.iso.focus(new THREE.Vector3(-1.0, 1.3, -1.4));
  await h.cineDelay(600);
  await h.narrate('narr_room', 'There is no shadow. There is only Greg, a table he has declared a sovereign kingdom, and a room full of people quietly praying he leaves first.', 7400);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 4: Greg picks a fight with the furniture ==
  h.iso.desiredYaw = Math.PI * 0.2; h.iso.desiredPitch = 0.34; h.iso.desiredDist = 4.2;
  h.iso.focus(poi.gregHead);
  await h.cineDelay(500);
  hv.rig.anim.lunge = 1;
  await h.narrate('greg_b', "I said the WHOLE table's mine, Norris! Every splinter of it! Come and take it, if yeh think yer hard enough!", 5600);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 5: the barmaid delivers yet another round ==
  const bar = h.tavernActors.barmaid;
  h.iso.desiredYaw = -0.6; h.iso.desiredDist = 4.8; h.iso.desiredPitch = 0.46;
  h.iso.focus(poi.barmaid.clone());
  if (bar) h.barmaidServe(bar);
  await h.narrate('narr_maid', 'The barmaid has poured this exact drink for this exact man forty-seven times. She stopped making eye contact somewhere around the thirtieth. It is safer that way.', 7600);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 6: the nervous wizard in the corner ==
  h.iso.desiredYaw = 0.5; h.iso.desiredDist = 5.0; h.iso.desiredPitch = 0.44;
  h.iso.focus(poi.wizard.clone());
  await h.cineDelay(500);
  await h.narrate('narr_wiz', 'Over in the corner, a very small wizard is doing a very large amount of nervous arithmetic. The kind you do right before you turn a problem into a farm animal.', 7400);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 7: the bouncer cracks his knuckles; Greg mounts the table ==
  const bc = h.tavernActors.bouncer;
  h.iso.desiredYaw = -0.2; h.iso.desiredDist = 5.2; h.iso.desiredPitch = 0.42;
  h.iso.focus(poi.bouncer.clone());
  if (bc) bc.anim.mode = 'crack';
  await h.narrate('narr_bounce', 'By the door, the bouncer cracks his knuckles - a retired warlord who took this job for the peace and quiet. Greg reads the room perfectly, and climbs onto the table.', 7400);
  if (bc) bc.anim.mode = 'idle';
  if (h.introSkipped) { finishIntro(h); return; }
  h.iso.desiredYaw = -Math.PI * 0.15; h.iso.desiredDist = 5.8; h.iso.desiredPitch = 0.4;
  h.iso.focus(poi.gregHead.clone().add(new THREE.Vector3(0, 0.7, 0)));
  hv.rig.anim.mode = 'idle'; hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 0;
  hv.rig.group.position.set(0, 0.99, 1.35);   // up on the tabletop (feet flush on the top)
  hv.rig.anim.lunge = 1;
  await h.cineDelay(900);

  // == CHAOS: a voxel stool flies, the wizard casts Polymorph, SHEEP ==
  const stool = new THREE.Group();
  const stoolWood = new THREE.MeshLambertMaterial({ color: 0x5a3e26 });
  const stoolWoodD = new THREE.MeshLambertMaterial({ color: 0x3a2818 });
  const stoolSeat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), stoolWood); stoolSeat.position.y = 0.2; stool.add(stoolSeat);
  for (const [lx, lz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), stoolWoodD); leg.position.set(lx, 0.08, lz); stool.add(leg);
  }
  stool.position.set(0, 0.55, 1.9); h.scene.add(stool);
  const stoolTarget = poi.wizard.clone().add(new THREE.Vector3(-0.2, 0.2, 0.3));
  h.animateTo(() => stool.position.x, (val) => { stool.position.x = val; }, stoolTarget.x, 0.5);
  h.animateTo(() => stool.position.y, (val) => { stool.position.y = val; }, stoolTarget.y, 0.5);
  h.animateTo(() => stool.position.z, (val) => { stool.position.z = val; }, stoolTarget.z, 0.5);
  const spinStart = performance.now();
  h.propAnims.push(() => { stool.rotation.x += 0.3; stool.rotation.z += 0.24; return performance.now() - spinStart > 520; });
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.15);
  await h.cineDelay(260);

  const wiz = h.tavernActors.wizard;
  const from = poi.wizard.clone().add(new THREE.Vector3(-0.2, 0.15, 0.4));
  const to2 = hv.rig.group.position.clone().add(new THREE.Vector3(0, 1.0, 0));
  h.iso.desiredYaw = 0.5; h.iso.desiredDist = 5.2; h.iso.focus(poi.wizard.clone());
  if (wiz) wiz.anim.lunge = -0.6;
  h.audio.play('magic_missile', 0.9);
  await h.cineDelay(160);
  if (wiz) wiz.anim.lunge = 1;
  h.launchMagicMissile(from, to2);
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.12);
  await h.cineDelay(220);
  h.iso.focus(hv.rig.group.position.clone().add(new THREE.Vector3(0, 0.8, 0))); h.iso.desiredDist = 5.6;
  await h.cineDelay(220);
  if (wiz) wiz.anim.lunge = 0;
  h.fx.explosion(h.particles, to2, 1.2);
  h.particles.burst({ pos: to2, count: 30, color: [0x8a4af0, 0xb06af0, 0xffffff, 0xdaa0ff], speed: [1, 4], life: [0.4, 0.9], size: [0.3, 0.8], gravity: -1.5, up: 2.5, endScale: 0.1 });
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.22);
  if (h.heroLight) h.heroLight.color.setHex(0x8a4af0);
  const sheep = h.buildSheep();
  sheep.position.copy(hv.rig.group.position); sheep.rotation.y = hv.rig.group.rotation.y;
  sheep.scale.setScalar(0.5);
  h.tavern!.add(sheep);
  hv.rig.group.visible = false;
  await h.narrate('narr_baa', "A stool takes flight. The wizard squeaks a word he'll regret. Purple light - and for four glorious seconds, Greg the Grim is the loudest sheep the Dirty Mug has ever heard.", 7400);
  hv.rig.group.visible = true;
  h.tavern!.remove(sheep);
  if (h.heroLight) h.heroLight.color.setHex(0xffb060);
  h.scene.remove(stool);
  stool.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  if (h.introSkipped) { finishIntro(h); return; }

  // -- Greg, human again and thoroughly rattled, drops back onto his stool --
  hv.rig.group.position.copy(seat);
  hv.rig.anim.mode = 'sit'; hv.rig.anim.crouch = 0.6; hv.rig.anim.flinch = 0.7;
  await h.cineDelay(600);

  // == FINALE: one last drink, then the long faint ==
  h.iso.desiredDist = 3.4; h.iso.desiredYaw = -Math.PI * 0.1; h.iso.desiredPitch = 0.34;
  h.iso.focus(poi.gregHead);
  hv.rig.anim.crouch = 0;
  hv.rig.anim.mode = 'drink'; await h.cineDelay(700); hv.rig.anim.mode = 'sit';
  hv.rig.anim.lunge = 0.7;
  h.audio.play('dice', 0.5);
  await h.cineDelay(600);
  hv.rig.anim.flinch = 1; h.iso.shake = Math.max(h.iso.shake ?? 0, 0.16);
  await h.narrate('narr_thud', 'The magic wears off. The ale, sadly, does not. Greg salutes a chair, mistakes the floor for the chair, and meets both at considerable speed.', 6800);
  if (h.introSkipped) { finishIntro(h); return; }
  h.passOut(1.6);
  h.audio.stopTavernMusic(); h.audio.playMusic('music_ambient');
  await h.cineDelay(1800);
  await h.narrate('narr_bridge', 'He drank the tavern dry, insulted a man with a sword, challenged a wizard to a fistfight, and spent four seconds as livestock. Then the floor rose up to introduce itself.', 6800);
  if (h.introSkipped) { finishIntro(h); return; }

  // ── wake at the bottom of the dungeon ──
  h.scene.remove(h.tavern); h.tavern = null; h.tavernRigs = []; h.tavernActors = {}; h.iso.box = null;
  h.worldGroup.visible = true;
  h.propsGroup.visible = true;
  h.scene.fog = new THREE.Fog(0x08080e, 4, 24);
  h.inTavern = false;
  for (const [id, v] of h.visuals) { if (id !== hero.id) v.rig.group.visible = true; }
  h.setWeapon(hv.rig, hero.weapon, hero.scheme.accent);

  const floorWp = h.unitWorld(h.combat.units[0].pos);
  hv.rig.group.position.copy(floorWp);
  hv.rig.group.rotation.set(0, Math.PI, 0);
  hv.yaw = hv.targetYaw = Math.PI;
  hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 1; hv.rig.anim.mode = 'floor';
  if (mugHand) mugHand.remove(mug);

  h.iso.desiredYaw = Math.PI * 0.25; h.iso.desiredPitch = 0.62; h.iso.desiredDist = 8;
  h.iso.focus(floorWp.clone().add(new THREE.Vector3(0, 1.2, 0)));
  h.canvas.style.filter = 'none';
  if (h.fadeEl) h.fadeEl.style.transition = '';
  h.fadeTo(0);
  await delay(700);
  await h.narrate('narr_wake', 'You wake at the bottom of a fifty floor dungeon. In your underwear. With a headache that could crush a small kingdom.', 6200);
  if (h.introSkipped) { finishIntro(h); return; }

  const starPos = floorWp.clone().add(new THREE.Vector3(0, 1.7, 0));
  h.spawnStars(starPos);
  await h.narrate('narr_premise', 'A bag of basic supplies sits by your head: a rusty dagger, a health potion, and a torch that probably won\'t last. The only way out is up.', 6600);
  if (h.introSkipped) { finishIntro(h); return; }

  hv.rig.group.rotation.x = -Math.PI / 2;
  hv.rig.anim.mode = 'getup';
  hv.rig.anim.crouch = 1.3;
  h.iso.desiredDist = 5.5; h.iso.focus(floorWp.clone().add(new THREE.Vector3(0, 1.4, 0)));
  h.animateTo(() => hv.rig.group.rotation.x, (val) => { hv.rig.group.rotation.x = val; }, 0, 0.7);
  await delay(700);
  h.animateTo(() => hv.rig.anim.crouch, (val) => { hv.rig.anim.crouch = val; }, 0, 0.8);
  for (let i = 0; i < 3; i++) { h.spawnStars(starPos); await delay(450); }
  await delay(700);
  hv.rig.anim.mode = 'idle'; hv.rig.anim.crouch = 0;
  await h.narrate('narr_small', 'Yes. Underwear. The dungeon, it seems, has a sense of humour. Try not to lose the potion before the first rat, hmm?', 6000);
  h.spawnStars(starPos);
  await delay(900);
  await h.narrate('narr_floor', 'Floor one of the Warren. The bonfire behind you is the last warm thing you\'ll see for a long, long time. Get up, Greg. We\'ve got fifty floors of regret to climb.', 6800);
  if (h.introSkipped) { finishIntro(h); return; }
  finishIntro(h);
}

/** finish the intro: hand control to the player, in the dungeon, torch lit. */
export function finishIntro(h: CutsceneHost) {
  h.introPlayed = true;
  h.introActive = false;
  h.introSkipped = false;
  h.inTavern = false;
  h.worldGroup.visible = true;
  h.propsGroup.visible = true;
  h.audio.stopTavernMusic(); h.audio.playMusic('music_ambient');
  const hero = h.combat.living('party')[0];
  for (const [id, v] of h.visuals) { if (!hero || id !== hero.id) v.rig.group.visible = true; }
  h.clearCine();
  h.canvas.style.filter = 'none';   // clear any lingering pass-out blur (skip safety)
  h.fadeTo(0);
  if (hero) {
    const hv = h.visuals.get(hero.id);
    if (hv) {
      hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 0; hv.rig.group.rotation.set(0, Math.PI, 0);
      hv.yaw = hv.targetYaw = Math.PI;
      if (hero.weapon) h.setWeapon(hv.rig, hero.weapon, hero.scheme.accent);
      if (!h.heroLight) h.attachHeroTorch(hv.rig);
    }
  }
  // reveal the bonfire checkpoint behind Greg as the respawn point + grace window
  h.setBonfireCheckpoint(h.structures?.checkpoint ?? { x: 5, z: 5 });
  h.armIntroGrace(2.5);
  h.iso.lerp = 7;
  h.busy = false;
  h.phase = 'explore';
  h.onIntroComplete();
  h.pushLog('Floor 1 — The Warlord\'s Warren. (B) jumps to the boss cutscene. Light the bonfire to set your respawn.', 'system');
  h.emitSnapshot();
}
