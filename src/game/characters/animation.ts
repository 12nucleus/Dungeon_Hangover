// ─────────────────────────────────────────────────────────────
// Animation — DeathState, initDeath, initCollapse, springStep, updateRig
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Rig, DeathState } from './vox';
import { playClipOnRig } from '../../animationEditor/AnimationRuntime';
import { gregDrinkClip } from '../../animationData/gregDrinkClip';

// ────── ANIMATION ──────
// Build the randomised crumple pose + initial impact velocities for a fresh
// corpse. Only targets parts that actually exist on the rig, so it works for
// player / chibi / orc rigs alike.
function initDeath(rig: Rig): DeathState {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const fwd = Math.random() < 0.6 ? 1 : -1;
  const p = rig.parts;
  const d: DeathState = {
    gvx: fwd * rand(3.5, 6),
    gvz: rand(-2, 2),
    gtx: fwd * (Math.PI / 2) * rand(0.86, 1.0),
    gtz: rand(-0.6, 0.6),
    gvy: 0,
    gty: (rig.group.userData.baseY as number) - 0.06,
    pv: {}, pt: {},
    jelly: 0.2,
    impacted: false,
  };
  const set = (name: string, tx: number, ty: number, tz: number) => {
    if (!p[name]) return;
    d.pt[name] = new THREE.Vector3(tx, ty, tz);
    d.pv[name] = new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3));
  };
  set('legL', rand(-1.6, -0.8), rand(-0.4, 0.4), rand(0.3, 0.9));
  set('legR', rand(-1.6, -0.8), rand(-0.4, 0.4), rand(-0.9, -0.3));
  set('shinL', rand(0.4, 1.2), rand(-0.3, 0.3), rand(-0.3, 0.3));
  set('shinR', rand(0.4, 1.2), rand(-0.3, 0.3), rand(-0.3, 0.3));
  set('armL', rand(0.5, 1.4), 0, rand(0.7, 1.6));
  set('armR', rand(0.5, 1.4), 0, rand(-1.6, -0.7));
  set('foreL', rand(0.3, 1.0), 0, rand(-0.3, 0.3));
  set('foreR', rand(0.3, 1.0), 0, rand(-0.3, 0.3));
  set('handL', rand(0.3, 0.9), 0, rand(0.4, 1.0));
  set('handR', rand(0.3, 0.9), 0, rand(-1.0, -0.4));
  set('head', rand(0.5, 1.2) * fwd, rand(-0.5, 0.5), rand(-0.7, 0.7));
  set('torso', rand(-0.22, 0.22), 0, rand(-0.28, 0.28));
  set('hair', rand(0.2, 0.7), 0, rand(-0.3, 0.3));
  set('hood', rand(0.2, 0.6), 0, 0);
  set('hoodTip', rand(0.4, 0.9), 0, 0);
  set('padL', rand(0.2, 0.7), 0, rand(0.2, 0.7));
  set('padR', rand(0.2, 0.7), 0, rand(-0.7, -0.2));
  return d;
}

/** soft-body "passed out / lying down" pose — same spring collapse as death,
 *  but settles flat with splayed limbs and a gentle breathing wobble. */
function initCollapse(rig: Rig, lie: boolean): DeathState {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const p = rig.parts;
  const gtxSign = lie ? -1 : 1;
  const d: DeathState = {
    gvx: rand(-1.5, 1.5),
    gvz: rand(-1, 1),
    gtx: gtxSign * Math.PI / 2 * rand(0.9, 1.0),
    gtz: rand(-0.25, 0.25),
    gvy: 0,
    gty: (rig.group.userData.baseY as number) ?? rig.group.position.y,
    pv: {}, pt: {},
    jelly: 0.1,
    impacted: false,
  };
  const set = (name: string, tx: number, ty: number, tz: number) => {
    if (!p[name]) return;
    d.pt[name] = new THREE.Vector3(tx, ty, tz);
    d.pv[name] = new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2));
  };
  set('legL', rand(-0.6, -0.2), rand(-0.3, 0.3), rand(0.5, 1.0));
  set('legR', rand(-0.6, -0.2), rand(-0.3, 0.3), rand(-1.0, -0.5));
  set('shinL', rand(0.2, 0.8), 0, rand(-0.2, 0.2));
  set('shinR', rand(0.2, 0.8), 0, rand(-0.2, 0.2));
  set('armL', rand(0.6, 1.4), 0, rand(0.8, 1.6));
  set('armR', rand(0.6, 1.4), 0, rand(-1.6, -0.8));
  set('foreL', rand(0.3, 1.0), 0, rand(-0.3, 0.3));
  set('foreR', rand(0.3, 1.0), 0, rand(-0.3, 0.3));
  set('handL', rand(0.3, 0.9), 0, rand(0.4, 1.0));
  set('handR', rand(0.3, 0.9), 0, rand(-1.0, -0.4));
  set('head', rand(0.2, 0.6), rand(-0.4, 0.4), rand(-0.6, 0.6));
  set('torso', rand(-0.15, 0.15), 0, rand(-0.2, 0.2));
  set('hair', rand(0.1, 0.5), 0, rand(-0.2, 0.2));
  set('hood', rand(0.1, 0.4), 0, 0); set('hoodTip', rand(0.2, 0.6), 0, 0);
  set('padL', rand(0.1, 0.5), 0, rand(0.1, 0.5)); set('padR', rand(0.1, 0.5), 0, rand(-0.5, -0.1));
  return d;
}

// one step of a semi-implicit damped spring; returns [newValue, newVelocity]
function springStep(x: number, target: number, v: number, dt: number, stiff: number, damp: number): [number, number] {
  v += (stiff * (target - x) - damp * v) * dt;
  return [x + v * dt, v];
}

export function updateRig(rig: Rig, dt: number, speed = 1) {
  const a = rig.anim;
  a.t += dt * speed;
  const p = rig.parts;
  const P = rig.pivots;

  // 'passout' is a fully static baked pose (loading screen / dungeon wake).
  // The bake already set every node rotation; leave them completely alone so
  // the per-frame solver can't stand Greg back up while the game runs.
  if (a.mode === 'passout') return;

  if (a.mode === 'dead' || a.mode === 'floor' || a.mode === 'lie') {
    const d = a.death ?? (a.death = (a.mode === 'dead' ? initDeath(rig) : initCollapse(rig, a.mode === 'lie')));
    const g = rig.group;
    const h = Math.min(dt, 1 / 30);
    const STIFF = 130, DAMP = 13;
    [g.rotation.x, d.gvx] = springStep(g.rotation.x, d.gtx, d.gvx, h, STIFF, DAMP);
    [g.rotation.z, d.gvz] = springStep(g.rotation.z, d.gtz, d.gvz, h, STIFF, DAMP);
    if (a.mode === 'dead') {
      [g.position.y, d.gvy] = springStep(g.position.y, d.gty, d.gvy, h, 90, 16);
      if (!d.impacted && Math.abs(g.rotation.x) >= Math.abs(d.gtx) * 0.7) d.impacted = true;
    }
    const hierD = !!rig.group.userData.hierarchyBuilt;
    const torsoChild = (n: string) => n === 'head' || n === 'hair' || n === 'hood' || n === 'hoodTip' || n === 'armL' || n === 'armR';
    if (hierD && p.torso && d.pt.torso) {
      const tv = d.pv.torso;
      [p.torso.rotation.x, tv.x] = springStep(p.torso.rotation.x, d.pt.torso.x, tv.x, h, STIFF, DAMP);
      [p.torso.rotation.y, tv.y] = springStep(p.torso.rotation.y, d.pt.torso.y, tv.y, h, STIFF, DAMP);
      [p.torso.rotation.z, tv.z] = springStep(p.torso.rotation.z, d.pt.torso.z, tv.z, h, STIFF, DAMP);
    }
    const torsoPitch = hierD && p.torso ? p.torso.rotation.x : 0;
    for (const name in d.pt) {
      if (hierD && name === 'torso') continue;
      const m = p[name]; if (!m) continue;
      const t = d.pt[name], v = d.pv[name];
      const lx = hierD && torsoChild(name) ? t.x - torsoPitch : t.x;
      [m.rotation.x, v.x] = springStep(m.rotation.x, lx, v.x, h, STIFF, DAMP);
      [m.rotation.y, v.y] = springStep(m.rotation.y, t.y, v.y, h, STIFF, DAMP);
      [m.rotation.z, v.z] = springStep(m.rotation.z, t.z, v.z, h, STIFF, DAMP);
    }
    let wob: number;
    if (a.mode === 'dead') { d.jelly *= Math.exp(-h * 3.2); wob = Math.sin(a.t * 19) * d.jelly; }
    else { wob = Math.sin(a.t * 1.6) * 0.05; }
    if (p.torso) p.torso.scale.set(1 + wob * 0.7, 1 - wob * 0.9, 1 + wob * 0.5);
    if (p.head) p.head.scale.setScalar(1 + wob * 0.5);
    return;
  }

  // revived/reset: undo any leftover ragdoll transforms once
  if (a.death) {
    a.death = undefined;
    rig.group.rotation.z = 0;
    for (const name in p) {
      const m = p[name]; if (!m) continue;
      m.rotation.set(0, 0, 0);
      m.scale.setScalar(1);
    }
  }

  if (a.mode !== 'getup') rig.group.rotation.x = 0;
  const walking = a.mode === 'walk';
  const w = walking ? Math.sin(a.t * 11) : 0;
  if (a.phase === undefined) a.phase = Math.random() * Math.PI * 2;
  const ph = a.phase;
  const idle = Math.sin((a.t + ph) * 1.1);

  // crouch pose: hips sink while feet stay planted.
  const cr = a.crouch ?? 0;
  const HIP = P?.hip ?? 0.25;
  let DROP = cr * 0.26;
  let legScaleY = HIP > 0 ? Math.max(0.5, 1 - DROP / HIP) : 1;

  // base limb targets (idle / walk)
  let legLX = w * 0.75, legRX = -w * 0.75;
  let armLX = -w * 0.6 + idle * 0.05 + cr * 0.25;
  let armRX = w * 0.6 + idle * 0.05 + cr * 0.25;
  let torsoX = cr * 0.2, headX = -cr * 0.12;
  let hipY = HIP - DROP;
  const hasKnee = !!P && !!p.shinL;
  let kneeL = 0.15, kneeR = 0.15, elbowL = 0.2, elbowR = 0.2;
  let armLZ = 0, armRZ = 0;
  let elbowLZ = 0, elbowRZ = 0;
  let wristL = 0, wristR = 0;
  let torsoY = 0, torsoZ = 0, headY = 0, headZ = 0;
  let armLY = 0, armRY = 0, elbowLY = 0, elbowRY = 0;
  let wristLY = 0, wristLZ = 0, wristRY = 0, wristRZ = 0;
  let legLY = 0, legLZ = 0, legRY = 0, legRZ = 0;
  let kneeLY = 0, kneeLZ = 0, kneeRY = 0, kneeRZ = 0;
  let hipRotX = 0, hipRotY = 0, hipRotZ = 0;

  // ── drink_anim: Greg's keyframed drinking animation ──
  if (a.mode === 'drink_anim') {
    DROP = 0.20;
    legScaleY = Math.max(0.5, 1 - DROP / HIP);
    hipY = HIP - 0.22;
    playClipOnRig(rig, gregDrinkClip, a.t);

    rig.group.rotation.x = 0;
    const hierD = !!rig.group.userData.hierarchyBuilt;
    const bob = idle * 0.02;
    a.bob = bob;
    const bb = bob * 1.2;
    const hy = a.headYOffset ?? 0;

    if (p.hip && p.hip.userData.baseY !== undefined) p.hip.position.y = p.hip.userData.baseY - DROP;
    if (!hasKnee) { p.legL.scale.y = legScaleY; p.legR.scale.y = legScaleY; }
    if (!hierD) { p.legL.position.y = hipY; p.legR.position.y = hipY; }

    if (hierD && p.torso.userData.baseY !== undefined) p.torso.position.y = p.torso.userData.baseY + bob - DROP;
    else p.torso.position.y = (P?.torso ?? 0.78) + bob - DROP;
    p.torso.scale.y = 1 + idle * 0.02;

    if (hierD) {
      if (p.head.userData.baseY !== undefined) p.head.position.y = p.head.userData.baseY + hy;
      if (p.hair && p.hair.userData.baseY !== undefined) p.hair.position.y = p.hair.userData.baseY + (a.hairYOffset ?? 0);
    } else {
      p.head.position.y = (P?.head ?? 1.28) + bb - DROP + hy;
      p.armL.position.y = (P?.arm ?? 0.8) + bob - DROP;
      p.armR.position.y = (P?.arm ?? 0.8) + bob - DROP;
    }
    const EO = P?.eye ?? 1.3;
    if (p.eyeL) { p.eyeL.position.y = EO + bb - DROP + hy; p.eyeR.position.y = EO + bb - DROP + hy; }

    const weapon = p.weapon as unknown as THREE.Object3D | undefined;
    if (weapon && (weapon as { userData?: { kind?: string } }).userData?.kind === 'staff') weapon.rotation.x = 0;

    if (a.lunge > 0) a.lunge = Math.max(0, a.lunge - dt * 3.2);
    if (a.flinch > 0) {
      a.flinch = Math.max(0, a.flinch - dt * 4);
      rig.group.rotation.x = -Math.sin(a.flinch * Math.PI) * 0.25;
    }
    return;
  }

  // ── pose presets ──
  armLZ = 0; armRZ = 0;
  elbowL = 0; elbowR = 0;
  elbowLZ = 0; elbowRZ = 0;
  wristL = 0; wristR = 0;
  kneeL = 0; kneeR = 0;
  if (a.mode === 'sit') {
    DROP += 0.20; legScaleY = Math.max(0.5, 1 - DROP / HIP);
    armLX = -1.35; armRX = -0.452;
    armRZ = 0.048;
    legLX = -1.492; legRX = -1.702;
    torsoX = 0.06; headX = -0.05; hipY = HIP - 0.22;
    kneeL = 1.368; kneeR = 1.688;
    elbowL = 0.15; elbowR = 0.128;
    elbowRZ = 0.148;
  } else if (a.mode === 'drink') {
    DROP += 0.20; legScaleY = Math.max(0.5, 1 - DROP / HIP);
    armLX = -1.342; armLZ = -0.152; armRX = -0.452; armRZ = 0.048;
    headX = -0.05; torsoX = 0.06; hipY = HIP - 0.22;
    legLX = -1.492; legRX = -1.702; kneeL = 1.368; kneeR = 1.688;
    elbowL = -1.192; elbowLZ = 0.998; elbowR = 0.128; elbowRZ = 0.148;
  } else if (a.mode === 'crack') {
    torsoX = 0.06; headX = -0.05;
    armLX = -0.732; armLZ = -0.192; armRX = -1.552; armRZ = -0.212;
    elbowL = -1.3; elbowR = -0.842;
  } else if (a.mode === 'cross') {
    armLX = -1.032; armRX = -1.192;
    armLZ = 0.128;  armRZ = 0.088;
    elbowL = -0.972; elbowR = -1.162;
    elbowLZ = 1.128; elbowRZ = -1.682;
    wristL = -0.412; wristR = 0.198;
    torsoX = -0.006; headX = -0.02; hipY = HIP;
  } else if (a.mode === 'sit_cross') {
    DROP += 0.20; legScaleY = Math.max(0.5, 1 - DROP / HIP);
    armLX = -0.282; armLZ = -0.152; armRX = -0.692; armRZ = 0.148;
    elbowL = 0.608; elbowLZ = 1.468; elbowR = -0.082; elbowRZ = -1.232;
    legLX = -1.532; legRX = -1.442; kneeL = 1.258; kneeR = 0.648;
    hipY = HIP - 0.22;
  } else if (a.mode === 'myPose') {                      // criss-cross legs on the ground (hermit)
    // deep hip sink (0.85 vs sit_cross's 0.20): the thighs pitch UP-forward
    // (~115°) with the shins folded back, so the pelvis must sit at floor
    // level or the figure hovers. Verified: hips at 0.85 → belt bottom
    // 0.10 off the floor, boots touching (no clip).
    DROP += 0.85; legScaleY = Math.max(0.5, 1 - DROP / HIP);
    armLX = -0.492; armLZ = -0.152; armRX = -0.692; armRZ = 0.148;
    elbowL = 0.608; elbowLZ = 1.468; elbowR = -0.082; elbowRZ = -1.232;
    legLX = -2.002; legLY = -1.062; legRX = -1.652; legRY = 1.638;
    kneeL = 1.258; kneeLZ = 0.308; kneeR = 1.288;
    hipY = HIP - 0.22;
  } else if (a.mode === 'sleep') {
    DROP += 0.10; legScaleY = Math.max(0.5, 1 - DROP / HIP);
    torsoX = -1.442; torsoY = 1.188; torsoZ = 0;
    headX = -1.274; headY = 1.338; headZ = 0;
    hipRotX = 0.178; hipRotY = 0.048; hipRotZ = -1.642;
    armLX = -1.614; armLY = 0.278; armLZ = -0.042;
    armRX = 1.586; armRY = 0; armRZ = -0.102;
    elbowL = -0.242; elbowLY = 0; elbowLZ = 0.328;
    elbowR = 0.428; elbowRY = 0; elbowRZ = -0.452;
    wristL = 0; wristLY = 0; wristLZ = 0;
    wristR = 0; wristRY = 0; wristRZ = 0;
    legLX = -1.732; legLY = -0.562; legLZ = 0;
    legRX = -1.662; legRY = 0; legRZ = 0;
    kneeL = 1.278; kneeLY = -0.172; kneeLZ = 0;
    kneeR = 0.308; kneeRY = 0; kneeRZ = 0;
    hipY = HIP - 0.10;
  } else if (a.mode === 'point') {
    armRX = -1.422; armRZ = -0.212;
    elbowL = -0.732; elbowLZ = -0.062;
  } else if (a.mode === 'wipe') {
    torsoX = 0.55; headX = -0.35;
    const wipeT = a.t * 2.5;
    const wipeR = 0.16;
    armLX = -1.40;
    armLZ = -0.0 + Math.cos(wipeT) * wipeR;
    armLY = 0.55 + Math.sin(wipeT) * wipeR;
    elbowL = 0.25 + Math.cos(wipeT) * 0.08;
    elbowLZ = 0.95;
    wristL = 0.5; wristLZ = 0;
    armRX = 0.08; armRZ = -0.1; elbowR = -0.3;
  }
  if (a.mode === 'idle') { armLX -= 0.1745; armRX -= 0.1745; }
  if (a.lunge > 0) {
    const L = Math.sin(a.lunge * Math.PI);
    armRX = -L * 2.4; torsoX -= L * 0.14;
    if (a.mode === 'idle' || a.mode === 'walk') legRX = -w * 0.6 - L * 0.5;
    elbowR = -L * 0.6;
  }

  rig.group.rotation.x = 0;
  const hier = !!rig.group.userData.hierarchyBuilt;

  if (p.hip) {
    p.hip.rotation.set(hipRotX, hipRotY, hipRotZ);
    if (p.hip.userData.baseY !== undefined) p.hip.position.y = p.hip.userData.baseY - DROP;
  }

  p.legL.rotation.x = legLX; p.legR.rotation.x = legRX;
  p.legL.rotation.y = legLY; p.legR.rotation.y = legRY;
  p.legL.rotation.z = legLZ; p.legR.rotation.z = legRZ;
  if (hasKnee) {
    if (walking) { kneeL = 0.25 + Math.max(0, -w) * 0.7; kneeR = 0.25 + Math.max(0, w) * 0.7; }
    if (a.crouch > 0) { kneeL = kneeR = 0.2 + a.crouch * 1.3; }
    p.shinL.rotation.x = kneeL; p.shinR.rotation.x = kneeR;
    p.shinL.rotation.y = kneeLY; p.shinR.rotation.y = kneeRY;
    p.shinL.rotation.z = kneeLZ; p.shinR.rotation.z = kneeRZ;
    if (!hier) { p.legL.position.y = hipY; p.legR.position.y = hipY; }
  } else {
    p.legL.scale.y = legScaleY; p.legR.scale.y = legScaleY;
    if (!hier) { p.legL.position.y = hipY + Math.max(0, w) * 0.06; p.legR.position.y = hipY + Math.max(0, -w) * 0.06; }
  }

  const armLocal = hier ? (v: number) => v - torsoX : (v: number) => v;
  p.armL.rotation.x = armLocal(armLX); p.armR.rotation.x = armLocal(armRX);
  p.armL.rotation.y = armLY; p.armR.rotation.y = armRY;
  p.armL.rotation.z = armLZ; p.armR.rotation.z = armRZ;
  if (hasKnee && p.foreL) {
    p.foreL.rotation.x = elbowL + (a.forearmLOffset ?? 0);
    p.foreR.rotation.x = elbowR + (a.forearmROffset ?? 0);
    p.foreL.rotation.y = elbowLY; p.foreR.rotation.y = elbowRY;
    p.foreL.rotation.z = elbowLZ; p.foreR.rotation.z = elbowRZ;
    const wizL = a.forearmLOffset ? -(armLX + elbowL + a.forearmLOffset) : 0;
    const wizR = a.forearmROffset ? -(armRX + elbowR + a.forearmROffset) : 0;
    if (p.wristL) { p.wristL.rotation.x = wristL + wizL; p.wristL.rotation.y = wristLY; p.wristL.rotation.z = wristLZ; }
    if (p.wristR) { p.wristR.rotation.x = wristR + wizR; p.wristR.rotation.y = wristRY; p.wristR.rotation.z = wristRZ; }
    if (p.handL) p.handL.rotation.x = 0; if (p.handR) p.handR.rotation.x = 0;
  } else {
    p.handL.rotation.x = armLX; p.handR.rotation.x = armRX;
  }

  if (rig.group.userData.flap) {
    const f = Math.sin(a.t * 13) * 0.7 + 0.15;
    p.armL.rotation.x = 0; p.armR.rotation.x = 0;
    p.armL.rotation.z = f; p.armR.rotation.z = -f;
    p.handL.rotation.z = f; p.handR.rotation.z = -f;
  }

  const weapon = p.weapon as unknown as THREE.Object3D | undefined;
  if (weapon) {
    const wkind = (weapon as any).userData?.kind;
    if (wkind === 'staff') {
      weapon.rotation.x = 0;
    } else {
      const weaponBase = wkind === 'torch' ? 0.4 : 1.35;
      const armWorldX = (hasKnee && p.foreR ? p.foreR.rotation.x + p.armR.rotation.x : p.armR.rotation.x) + (hier ? torsoX : 0);
      weapon.rotation.x = weaponBase + armWorldX * 0.9;
    }
  }

  const bob = walking ? Math.abs(Math.sin(a.t * 11)) * 0.07 : idle * 0.02;
  a.bob = bob;

  const TO = P?.torso ?? 0.78;
  const HO = P?.head ?? 1.28;
  const EO = P?.eye ?? 1.3;
  const HRO = P?.hair ?? 1.5;
  const HUD = P?.hood ?? 1.44;
  const HT = P?.hoodTip ?? 1.58;
  const AR = P?.arm ?? 0.8;
  const HA = P?.hand ?? 0.52;
  const WO = P?.weapon ?? 0.5;
  const PA = P?.pad ?? 1.02;
  const bb = bob * 1.2;
  const hy = a.headYOffset ?? 0;

  if (hier && p.torso.userData.baseY !== undefined) {
    p.torso.position.y = p.torso.userData.baseY + bob - DROP;
  } else {
    p.torso.position.y = TO + bob - DROP;
  }
  p.torso.scale.y = 1 + idle * 0.02;
  p.torso.rotation.x = torsoX;
  p.torso.rotation.y = torsoY;
  p.torso.rotation.z = torsoZ;
  if (hier) {
    p.head.rotation.x = headX - torsoX;
    p.head.rotation.y = headY - torsoY;
    p.head.rotation.z = headZ - torsoZ;
    if (p.head.userData.baseY !== undefined) p.head.position.y = p.head.userData.baseY + hy;
    if (p.hair) {
      p.hair.rotation.set(0, 0, 0);
      if (p.hair.userData.baseY !== undefined) p.hair.position.y = p.hair.userData.baseY + (a.hairYOffset ?? 0);
    }
    if (p.hood) { p.hood.rotation.set(0, 0, 0); p.hoodTip!.rotation.set(0, 0, 0); }
    if (p.eyeL) { p.eyeL.position.y = EO + bb - DROP + hy; p.eyeR.position.y = EO + bb - DROP + hy; }
  } else {
    p.head.position.y = HO + bb - DROP + hy;
    p.head.rotation.x = headX;
    p.head.rotation.y = headY; p.head.rotation.z = headZ;
    if (p.eyeL) { p.eyeL.position.y = EO + bb - DROP + hy; p.eyeR.position.y = EO + bb - DROP + hy; }
    if (p.hood) { p.hood.position.y = HUD + bb - DROP + hy; p.hoodTip!.position.y = HT + bb - DROP + hy; p.hood.rotation.set(headX, headY, headZ); p.hoodTip!.rotation.set(headX, headY, headZ); }
    if (p.hair) { p.hair.position.y = HRO + bb - DROP + hy + (a.hairYOffset ?? 0); p.hair.rotation.set(headX, headY, headZ); }
    p.armL.position.y = AR + bob - DROP; p.armR.position.y = AR + bob - DROP;
    if (!hasKnee) { p.handL.position.y = HA + bob - DROP; p.handR.position.y = HA + bob - DROP; }
    if (weapon && !hasKnee) weapon.position.y = WO + bob - DROP;
    if (p.padL) { p.padL.position.y = PA + bob - DROP; p.padR!.position.y = PA + bob - DROP; }
  }

  if (a.lunge > 0) a.lunge = Math.max(0, a.lunge - dt * 3.2);
  if (a.flinch > 0) {
    a.flinch = Math.max(0, a.flinch - dt * 4);
    rig.group.rotation.x = -Math.sin(a.flinch * Math.PI) * 0.25;
  }
}
