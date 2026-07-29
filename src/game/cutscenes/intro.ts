// ─────────────────────────────────────────────────────────────
// cutscenes/intro — "Dungeon Hangover" intro cutscene
// ═════════════════════════════════════════════════════════════
import * as THREE from 'three';
import type { CutsceneHost } from './types';
// Real tavern room bounds — used to size the cinematic camera clamp (h.iso.box)
// so it matches the actual room instead of a stale, undersized box.
// Adjust this import path if your project layout differs.
import { RX, ZB, ZF, WH } from '../engine/tavern';

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
  if (h.dressingGroup) h.dressingGroup.visible = false;   // hide boss bath + weapon rack etc.
  for (const [id, v] of h.visuals) {
    v.bar.style.display = 'none';
    if (id !== hero.id) v.rig.group.visible = false;
  }
  h.tavern = h.buildTavern();
  h.scene.add(h.tavern);
  // No fog in the tavern — keeps all four walls fully visible without
  // any atmospheric obscuring that could be misread as a missing wall.
  h.scene.fog = null;

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

  // FIX 1: remove Greg's shoulder pads by narrowing the torso's x-extent.
  // The gregRigModel's torso array has a wide shoulder line at z=4-5 across
  // y=33-44 (pale-blue voxels 0xafb3b8) that reads visually as padded armor.
  // We narrow the torso mesh's scale.x by 12% so the shoulder line collapses
  // inward without touching the immutable .mjs rig data — this fix is
  // reusable on any future player model without re-exporting from scripts/.
  const torso = hv.rig.parts.torso;
  if (torso) torso.scale.x = 0.88;
  // (Sleeves still hang from the shoulder pivots; they automatically follow
  //  the narrower torso without their own scale edit.)

  // FIX 2: voxel tankard clamped under Greg's LEFT FOREARM (not in the hand)
  // so it sits lower — resting against his elbow / mid-forearm. Same prop anim
  // (counter-rotating against the host's world pitch) keeps it visually level.
  const mug = new THREE.Group();
  const mugBody = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.24, 0.20), new THREE.MeshLambertMaterial({ color: 0x8a5a2e }));
  const mugFoam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.22), new THREE.MeshLambertMaterial({ color: 0xf2ead2 }));
  mugFoam.position.y = 0.14; mug.add(mugBody, mugFoam);
  // host: forearm if available (hierarchical rig), otherwise fall back to hand
  const hand = hv.rig.parts.foreL ?? hv.rig.parts.handL ?? hv.rig.parts.armL;
  let mugHand: THREE.Object3D | null = null;
  if (hand) {
    // Local offset places the mug on the *outer* side of the forearm, level with
    // the wrist. With foreL as parent, position is in forearm-local space.
    mug.position.set(0, -0.04, 0.18);
    hand.add(mug);
    mugHand = hand;
  }
  if (mugHand) {
    // Counter-rotate the tankard against the host's world pitch so it stays
    // visually upright regardless of arm/forearm pose. World-orientation read
    // makes this hierarchy-agnostic (works for legacy flat rigs AND the new
    // hierarchical skeleton).
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

  // companion torch removed permanently per user request – no more hero light at all.
  // (the hero torch is never created by attachHeroTorch which is now a no-op)
  // FIX 9 (revised): a single `visible = false` here didn't stick, which
  // means something else — most likely a normal per-frame "torch follows
  // player" update running underneath the cutscene — is turning it back on
  // every frame. Fight that every frame instead of once: force it off in a
  // propAnim (which runs every render tick) for as long as we're in the
  // tavern, except during the brief polymorph flash below.
  let heroLightFlash = false;
  h.propAnims.push(() => {
    if (h.heroLight && !heroLightFlash) { h.heroLight.visible = false; h.heroLight.intensity = 0; }
    return !h.inTavern;
  });

  // -- camera: kept inside the tavern (box clamp) with slow cinematic easing --
  // FIX 8: this used to be a stale, tiny box (maxZ: 5.6) left over from an
  // earlier version of the scene where everything sat near the room center.
  // Since then Greg's table (z=18), the bouncer (z≈40), and the front wall
  // (z=ZF=43) all moved out to their real positions, but this clamp never
  // did — so on every wide/establishing/reveal shot the camera got yanked
  // back into that tiny box while the *focus* target stayed far away. That's
  // what caused walls to appear to vanish (camera ended up jammed behind/
  // inside nearby geometry, backface-culled) and the camera to visibly fail
  // to follow the barmaid/wizard/bouncer/Greg. Clamp to the real room
  // interior instead, with a small margin so the camera never pokes through
  // a wall.
  h.iso.lerp = 2.0;
  h.iso.box = { minX: -RX + 2, maxX: RX - 2, minZ: ZB + 2, maxZ: ZF - 2, minY: 0.5, maxY: WH - 3 };
  h.iso.desiredYaw = Math.PI * 0.78; h.iso.desiredPitch = 0.44; h.iso.desiredDist = 5.4;
  h.iso.focus(poi.gregHead);
  h.fadeTo(0);
  h.audio.stopMusic(); h.audio.stopTavernMusic(); h.audio.playTavernMusic();
  await h.cineDelay(900);
  if (h.introSkipped) { finishIntro(h); return; }

  // FIX 4: WIDE establishing shot first so the audience reads the WHOLE room
  // (back wall, hearth, doorway, bouncer) before we tighten in on Greg.
  h.iso.desiredYaw = -Math.PI * 0.18; h.iso.desiredPitch = 0.50; h.iso.desiredDist = 9.5;
  h.iso.focus(new THREE.Vector3(0, 1.4, 0));
  await h.cineDelay(700);

  // == BEAT 1: establishing - the warm, dingy room; Greg mid-bender ==
  // FIX 4: tight medium close-up on Greg (was 5.4 dist — too far to read
  // his face). Face him from the front-right so the audience can see the
  // mug + his expression.
  h.iso.desiredYaw = Math.PI * 0.78; h.iso.desiredPitch = 0.36; h.iso.desiredDist = 3.2;
  h.iso.focus(poi.gregHead);
  await h.cineDelay(400);
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
  // FIX 4: face Greg head-on at close range so we read his expression as he
  // bangs the table.
  h.iso.desiredYaw = Math.PI; h.iso.desiredPitch = 0.32; h.iso.desiredDist = 3.0;
  h.iso.focus(poi.gregHead);
  await h.cineDelay(500);
  hv.rig.anim.lunge = 0.7;
  await h.narrate('greg_a', "Barkeep! Another! And one for me shadow - the big fella's had a hard night an' all!", 5000);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 3: slow pan across the unimpressed room ==
  // FIX 4: WIDER shot so the audience reads the patron tables and the wizard
  // corner simultaneously.
  h.iso.desiredYaw = -Math.PI * 0.45; h.iso.desiredPitch = 0.55; h.iso.desiredDist = 8.0;
  h.iso.focus(new THREE.Vector3(-1.0, 1.5, -1.4));
  await h.cineDelay(600);
  await h.narrate('narr_room', 'There is no shadow. There is only Greg, a table he has declared a sovereign kingdom, and a room full of people quietly praying he leaves first.', 7400);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 4: Greg picks a fight with the furniture ==
  // FIX 4: tight close-up, low angle — we should feel Greg leaning INTO the
  // confrontation with Norris.
  h.iso.desiredYaw = Math.PI * 0.95; h.iso.desiredPitch = 0.30; h.iso.desiredDist = 3.4;
  h.iso.focus(poi.gregHead);
  await h.cineDelay(500);
  hv.rig.anim.lunge = 1;
  await h.narrate('greg_b', "I said the WHOLE table's mine, Norris! Every splinter of it! Come and take it, if yeh think yer hard enough!", 5600);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 5: the barmaid delivers yet another round ==
  // FIX 4: face the BARMAID (was facing the wrong angle). The bartender is
  // the subject of this beat; we should see her face, not Greg's shoulder.
  const bar = h.tavernActors.barmaid;
  h.iso.desiredYaw = -0.3; h.iso.desiredDist = 3.8; h.iso.desiredPitch = 0.42;
  h.iso.focus(poi.barmaid.clone().add(new THREE.Vector3(0, 0.2, 0)));
  if (bar) h.barmaidServe(bar);
  await h.narrate('narr_maid', 'The barmaid has poured this exact drink for this exact man forty-seven times. She stopped making eye contact somewhere around the thirtieth. It is safer that way.', 7600);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 6: the nervous wizard in the corner ==
  // FIX 4: face the wizard from the front (not profile). The wizard is small;
  // we need a closer shot so we can read the nervous arithmetic on his face.
  h.iso.desiredYaw = 0.85; h.iso.desiredDist = 3.6; h.iso.desiredPitch = 0.40;
  h.iso.focus(poi.wizard.clone().add(new THREE.Vector3(0, 0.1, 0)));
  await h.cineDelay(500);
  await h.narrate('narr_wiz', 'Over in the corner, a very small wizard is doing a very large amount of nervous arithmetic. The kind you do right before you turn a problem into a farm animal.', 7400);
  if (h.introSkipped) { finishIntro(h); return; }

  // == BEAT 7: the bouncer cracks his knuckles; Greg mounts the table ==
  // FIX 3a: the previous version's "two-shot" focus point (-2.0, 1.2, -0.6)
  // was nowhere near the bouncer (poi.bouncer = -4, 0.8, 40) — the camera was
  // framing empty floor in the middle of the room while the narration was
  // about the bouncer. Now we focus tightly on the bouncer by the door so the
  // audience reads him cracking his knuckles. yaw=-π*0.5 looks along -z toward
  // the door wall (z=ZF=+43) from inside the room.
  const bc = h.tavernActors.bouncer;
  h.iso.desiredYaw = -Math.PI * 0.5; h.iso.desiredDist = 3.4; h.iso.desiredPitch = 0.42;
  h.iso.focus(poi.bouncer.clone().add(new THREE.Vector3(0, 0.6, 0)));
  if (bc) bc.anim.mode = 'crack';
  await h.cineDelay(400);   // brief settle onto the bouncer before the line lands
  await h.narrate('narr_bounce', 'By the door, the bouncer cracks his knuckles - a retired warlord who took this job for the peace and quiet. Greg reads the room perfectly, and climbs onto the table.', 7400);
  if (bc) bc.anim.mode = 'idle';
  if (h.introSkipped) { finishIntro(h); return; }
  // FIX 4: tighter shot for Greg on the table — we want to feel his theatrical
  // stance before the wizard fires.
  h.iso.desiredYaw = -Math.PI * 0.15; h.iso.desiredDist = 4.6; h.iso.desiredPitch = 0.36;
  h.iso.focus(poi.gregHead.clone().add(new THREE.Vector3(0, 0.7, 0)));
  hv.rig.anim.mode = 'idle'; hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 0;
  // FIX 10: this was hardcoded to z=1.35 — a leftover from before Greg's table
  // was moved out to z=18 (poi.gregSeat/gregHead). That left Greg ~16 units
  // away from his own table and from where the camera was focused (gregHead),
  // so he visibly teleported off-camera the moment he stood up. Anchor to
  // seat.z (his table's actual z) and keep the small forward offset.
  hv.rig.group.position.set(0, 0.99, seat.z + 1.35);   // up on the tabletop (feet flush on the top)
  hv.rig.anim.lunge = 1;
  await h.cineDelay(700);

  // FIX 3: SWING CAMERA TO FACE THE FRONT WALL so the audience sees the door
  // + windows the bouncer is standing in front of. The interior front wall
  // is at z=ZF (back of the tavern from the audience's POV). This shot also
  // confirms to the player that yes, the tavern HAS a wall there \u2014 the wizard
  // will later fire a beam that passes through Greg and into the wall behind
  // him. NOTE: the interior door frame style here is TIMBER/WOOD_D (see
  // tavern.ts:127) while the exterior uses TIMBER + IRON hinges; future
  // polish should make them visually identical \u2014 for now both are
  // recognisably "tavern door + 2 windows".
  h.iso.desiredYaw = -Math.PI * 0.5; h.iso.desiredDist = 7.5; h.iso.desiredPitch = 0.30;
  // ZF is the back-side wall (front from the camera's POV when looking at
  // the door). Focus on the door's height so the camera reads it as the
  // subject, not Greg.
  // poi.doorZ is a Vector3; use its z component (ZF-1 = 42) as the focus point.
  const doorFocus = poi.doorZ ?? new THREE.Vector3(0, 1.6, 42);
  h.iso.focus(new THREE.Vector3(0, doorFocus.y, doorFocus.z));
  await h.cineDelay(800);
  // Now SWING BACK to Greg on the table for the spell impact.
  h.iso.desiredYaw = -Math.PI * 0.15; h.iso.desiredDist = 4.6; h.iso.desiredPitch = 0.36;
  h.iso.focus(poi.gregHead.clone().add(new THREE.Vector3(0, 0.7, 0)));
  await h.cineDelay(400);

  // == CHAOS: a voxel stool flies, the wizard casts Polymorph, SHEEP ==
  const stool = new THREE.Group();
  const stoolWood = new THREE.MeshLambertMaterial({ color: 0x5a3e26 });
  const stoolWoodD = new THREE.MeshLambertMaterial({ color: 0x3a2818 });
  const stoolSeat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), stoolWood); stoolSeat.position.y = 0.2; stool.add(stoolSeat);
  for (const [lx, lz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), stoolWoodD); leg.position.set(lx, 0.08, lz); stool.add(leg);
  }
  // FIX 10: same stale-coordinate bug as Greg's table position above — this
  // needs to start near Greg at his real table (z=18), not near the old z≈2
  // location, or the stool visibly flies in from empty space.
  stool.position.set(0, 0.55, seat.z + 1.9); h.scene.add(stool);
  const stoolTarget = poi.wizard.clone().add(new THREE.Vector3(-0.2, 0.2, 0.3));
  h.animateTo(() => stool.position.x, (val) => { stool.position.x = val; }, stoolTarget.x, 0.5);
  h.animateTo(() => stool.position.y, (val) => { stool.position.y = val; }, stoolTarget.y, 0.5);
  h.animateTo(() => stool.position.z, (val) => { stool.position.z = val; }, stoolTarget.z, 0.5);
  const spinStart = performance.now();
  h.propAnims.push(() => { stool.rotation.x += 0.3; stool.rotation.z += 0.24; return performance.now() - spinStart > 520; });
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.15);
  await h.cineDelay(260);

  // FIX 6 + 3b: 3-SECOND STAGED CAST with a STEADY camera. The previous
  // version tightened dist twice (4.6 -> 3.6 -> 5.6) AND bumped iso.shake 3
  // times in under 2 s while focus jumped from wizard to Greg — that's what
  // produced the "bouncing / rotating like crazy" the user reported. Now we
  // lock the camera on the wizard for the whole 3 s and do ONE clean pan +
  // ONE shake burst at the moment of FIRE.
  const wiz = h.tavernActors.wizard;
  const to2 = hv.rig.group.position.clone().add(new THREE.Vector3(0, 1.0, 0));
  // PRE-SET the wizard framing ONCE and keep it (no per-stage dist changes):
  h.iso.desiredYaw = 0.85; h.iso.desiredDist = 3.8; h.iso.desiredPitch = 0.40;
  h.iso.focus(poi.wizard.clone().add(new THREE.Vector3(0, 0.5, 0)));
  await h.cineDelay(300);   // let the iso.lerp ease onto the wizard before the cast
  // STAGE A: STAFF RAISE (1.4 s) — wizard's forearmROffset rotates his staff
  // up from rest to vertical, like an orchestra conductor raising a baton.
  if (wiz) {
    wiz.anim.forearmROffset = 0;       // reset before animating
    wiz.anim.mode = 'crack';            // crack pose = both fists raised
  }
  h.audio.play('dice', 0.4);           // soft "summoning" sound as staff rises
  await h.cineDelay(1400);
  if (h.introSkipped) { finishIntro(h); return; }
  // STAGE B: AIM (0.8 s) — camera stays on the wizard. Charging motes bloom
  // at the staff tip (no focus/distance change — the camera finally settled
  // onto the wizard in STAGE A; if we touch the focus here we restart the
  // iso.lerp ease and the whole shot jitters).
  const wizardTip = poi.wizard.clone().add(new THREE.Vector3(0.15, 1.6, 0.05));
  h.particles.burst({ pos: wizardTip, count: 14, color: [0xc084fc, 0xe9d5ff], speed: [0.2, 0.8], life: [0.5, 1.0], size: [0.3, 0.6], gravity: -0.4, endScale: 0.2 });
  await h.cineDelay(800);
  if (h.introSkipped) { finishIntro(h); return; }
  // STAGE C: FIRE (0.8 s) — wizard snaps forward, single whip-pan to Greg + a
  // SINGLE shake burst at the polymorph moment (NO second shake during the pan
  // itself — that was the cause of the "bouncing around" feel).
  if (wiz) { wiz.anim.lunge = 1; }
  h.audio.play('magic_missile', 0.9);
  h.iso.focus(hv.rig.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
  h.iso.desiredDist = 5.2;            // gentle pull-back so the burst fits in frame
  await h.cineDelay(260);
  if (wiz) wiz.anim.lunge = 0;
  // FIX 6: PARTICLE SPELL (replaces launchMagicMissile's cube orb).
  // The wizard's hand is the burst origin so the spell visually EMANATES
  // from him rather than flying across the room.
  h.fx.polymorph(h.particles, to2);
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.18);   // ONE shake, at the burst
  // FIX 9: lift the per-frame override for the flash window and let the light
  // show through, recolored purple for the spell impact.
  heroLightFlash = true;
  if (h.heroLight) { h.heroLight.visible = true; h.heroLight.intensity = 0.6; h.heroLight.color.setHex(0x8a4af0); }
  await h.cineDelay(460);
  // SHEEP POLYMORPH (the punchline of the spell)
  const sheep = h.buildSheep();
  sheep.position.copy(hv.rig.group.position); sheep.rotation.y = hv.rig.group.rotation.y;
  // FIX 5: sheep is a touch smaller so it reads as livestock, not a pony.
  // (Body+legs are now vertically aligned \u2014 see engine/sheep.ts.)
  sheep.scale.setScalar(0.45);
  h.tavern!.add(sheep);
  hv.rig.group.visible = false;
  await h.narrate('narr_baa', "A stool takes flight. The wizard squeaks a word he'll regret. Purple light - and for four glorious seconds, Greg the Grim is the loudest sheep the Dirty Mug has ever heard.", 7400);
  hv.rig.group.visible = true;
  h.tavern!.remove(sheep);
  // FIX 9: flash is over — hand control back to the per-frame override, which
  // will force it off again on the very next frame.
  heroLightFlash = false;
  if (h.heroLight) h.heroLight.color.setHex(0xffb060);
  // reset wizard so the cast pose doesn't stick
  if (wiz) { wiz.anim.mode = 'idle'; wiz.anim.lunge = 0; }
  h.scene.remove(stool);
  stool.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  if (h.introSkipped) { finishIntro(h); return; }

  // -- Greg, human again and thoroughly rattled, drops back onto his stool --
  hv.rig.group.position.copy(seat);
  hv.rig.anim.mode = 'sit'; hv.rig.anim.crouch = 0.6; hv.rig.anim.flinch = 0.7;
  await h.cineDelay(600);

  // == FINALE: one last drink, then Greg LITERALLY falls off the stool ==
  h.iso.desiredDist = 3.4; h.iso.desiredYaw = -Math.PI * 0.1; h.iso.desiredPitch = 0.34;
  h.iso.focus(poi.gregHead);
  hv.rig.anim.crouch = 0;
  hv.rig.anim.mode = 'drink'; await h.cineDelay(700); hv.rig.anim.mode = 'sit';
  hv.rig.anim.lunge = 0.7;
  h.audio.play('dice', 0.5);
  await h.cineDelay(600);

  // FIX 7 + 4: GREG FALLS OFF THE STOOL. The previous code went straight from
  // flinch -> passOut without any visible FALL — Greg should literally drop
  // off the stool, hit the floor face-first, then pass out. We animate his
  // rig.position.y from seated height (0.4) down to floor (0.0) over 0.9 s
  // while rotating him sideways (the "ragdoll on the floorboards" pose).
  // CRITICAL (user report): the camera was still focused at poi.gregHead
  // (y=1.55, stool-seat height) — once Greg is on the floor the camera points
  // HIGHER than him and we don't see him. We pip the focus TO the floor at
  // Greg's feet (y≈0.35) AND lower the iso pitch so the camera tilts down to
  // read him lying flat. The focus is a live Vector3 so it tracks Greg's
  // floor position as the animateTo() lerps him down.
  hv.rig.anim.flinch = 1;
  h.iso.shake = Math.max(h.iso.shake ?? 0, 0.16);
  h.iso.desiredPitch = 0.30;                 // tilt camera DOWN toward the floor but not below it
  h.iso.desiredDist = 3.8;                   // back-off from presenting only his falling hand
  // animate focus Y in lockstep with Greg's falling body so the camera
  // *follows* him down rather than looking past him.
  const _fallFocus = hv.rig.group.position.clone();
  h.iso.focus(_fallFocus);
  h.animateTo(() => _fallFocus.y, (v) => { _fallFocus.y = v; }, 0.65, 0.9);  // focus lands on his head
  h.animateTo(() => hv.rig.group.position.y, (v) => { hv.rig.group.position.y = v; }, -0.15, 0.9); // he sags a hair past floor to lie properly
  h.animateTo(() => hv.rig.group.rotation.z, (v) => { hv.rig.group.rotation.z = v; }, -Math.PI * 0.5, 0.9);
  h.animateTo(() => hv.rig.group.rotation.x, (v) => { hv.rig.group.rotation.x = v; }, -0.45, 0.9);
  h.fx.impactDust(h.particles, hv.rig.group.position.clone().setY(0), []);
  h.audio.play('sword_hit', 0.4, 0.5);   // dull thud
  await h.cineDelay(900);

  await h.narrate('narr_thud', 'The magic wears off. The ale, sadly, does not. Greg salutes a chair, mistakes the floor for the chair, and meets both at considerable speed.', 6800);
  if (h.introSkipped) { finishIntro(h); return; }

  // FIX 7 (continued): PASS OUT — full-screen blur to black, tavern music
  // crossfades to the dungeon ambient loop.
  h.passOut(1.6);
  h.audio.stopTavernMusic(); h.audio.playMusic('music_ambient');
  await h.cineDelay(1800);
  await h.narrate('narr_bridge', 'He drank the tavern dry, insulted a man with a sword, challenged a wizard to a fistfight, and spent four seconds as livestock. Then the floor rose up to introduce itself.', 6800);
  if (h.introSkipped) { finishIntro(h); return; }

  // ── wake at the bottom of the dungeon ──
  h.scene.remove(h.tavern); h.tavern = null; h.tavernRigs = []; h.tavernActors = {}; h.iso.box = null;
  h.worldGroup.visible = true;
  h.propsGroup.visible = true;
  if (h.dressingGroup) h.dressingGroup.visible = true;
  h.scene.fog = new THREE.Fog(0x08080e, 4, 24);
  h.inTavern = false;
  for (const [id, v] of h.visuals) { if (id !== hero.id) v.rig.group.visible = true; }
  // FIX 1 (reset): restore Greg's torso to full width once he wakes in the
  // dungeon so the in-game rig doesn't look squished.
  if (hv.rig.parts.torso) hv.rig.parts.torso.scale.x = 1.0;
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
  if (h.dressingGroup) h.dressingGroup.visible = true;
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
      // suspend hero torch attachment — now a no-op
    }
  }
  // reveal the bonfire checkpoint behind Greg as the respawn point + grace window
  h.setBonfireCheckpoint(h.structures?.checkpoint ?? { x: 5, z: 5 });
  h.armIntroGrace(2.5);
  // hero torch phenomenon permanently disabled

  h.iso.lerp = 7;
  h.busy = false;
  h.phase = 'explore';
  h.onIntroComplete();
  h.pushLog('Floor 1 — The Warlord\'s Warren. (B) jumps to the boss cutscene. Light the bonfire to set your respawn.', 'system');
  h.emitSnapshot();
}
