// ─────────────────────────────────────────────────────────────
// Voxel character rigs — TRUE tiny-cube construction (art direction:
// "everything is made of tiny cubes like the voxel orc reference").
// Each named part is ONE Mesh whose geometry is a merged set of
// mini-cubes (edge C=0.1) with per-cube vertex colors (+jitter) and
// ONE shared MeshLambertMaterial({ vertexColors: true }). Orc-ish
// schemes (scheme.orc) get pointed ears, white tusks & a dark brow.
// Parts keep the exact names/anchors updateRig() animates.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterScheme, WeaponKind } from './types';

export interface Rig {
  group: THREE.Group;
  parts: Record<string, THREE.Mesh>;
  /** animation state consumed by updateRig */
  anim: {
    mode: 'idle' | 'walk' | 'dead';
    t: number;               // time in current mode
    lunge: number;           // 0..1 attack lunge timer (starts at 1, decays)
    flinch: number;
    lungeDir: THREE.Vector3;
    bob: number;
  };
}

const C = 0.1; // mini-cube edge (world units)
const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const orbMat = new THREE.MeshLambertMaterial({ color: 0xa78bfa, emissive: 0x7c3aed, emissiveIntensity: 0.9 });
const tmpCol = new THREE.Color();

const METAL = 0xb8bfc9, METAL_DARK = 0x7a828e, DARK = 0x1a1a22;
const TUSK = 0xf2ede0, BROW = 0x241a10, BOOT = 0x2c2620;

/** tiny-cube assembler: collects colored mini-cubes → ONE merged mesh */
class Vox {
  private geos: THREE.BufferGeometry[] = [];

  /** add one mini-cube; gx/gy/gz are grid coords of the cube CENTER */
  add(gx: number, gy: number, gz: number, color: number, jitter = 0.1) {
    const g = new THREE.BoxGeometry(C, C, C);
    g.translate(gx * C, gy * C, gz * C);
    tmpCol.setHex(color).multiplyScalar(1 - jitter / 2 + Math.random() * jitter);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
  }

  /** filled box region, inclusive grid coords */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, jitter?: number) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.add(x, y, z, color, jitter);
  }

  mesh(): THREE.Mesh {
    const merged = mergeGeometries(this.geos, false)!;
    this.geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, bodyMat);
    m.castShadow = true;
    return m;
  }
}

// ── weapons (Group is found by updateRig as the only Group child) ──
function buildWeapon(kind: WeaponKind, accent: number): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox();
  const grip = 0x4a3421;
  switch (kind) {
    case 'sword':
      v.fill(0, 0, 0, 0, 1, 0, grip);            // grip
      v.fill(-1, 2, 0, 1, 2, 0, METAL_DARK);     // guard
      v.fill(0, 3, 0, 0, 8, 0, METAL);           // blade
      break;
    case 'dagger':
      v.add(0, 0, 0, grip);
      v.fill(0, 1, 0, 0, 4, 0, METAL);
      break;
    case 'club':
      v.fill(0, 0, 0, 0, 3, 0, grip);            // handle
      v.fill(-1, 4, -1, 1, 5, 1, accent);        // head
      break;
    case 'mace':
      v.fill(0, 0, 0, 0, 3, 0, grip);
      v.fill(-1, 4, -1, 1, 5, 1, METAL);         // head
      v.add(2, 4, 0, METAL); v.add(-2, 4, 0, METAL); // spikes
      v.add(0, 4, 2, METAL); v.add(0, 4, -2, METAL);
      break;
    case 'staff':
      v.fill(0, 0, 0, 0, 9, 0, 0x6b4a2e);        // rod
      v.fill(-1, 9, 0, 1, 9, 0, 0x5f3e22);       // claw holding the orb
      break;
    case 'bow':
      v.fill(0, 0, 0, 0, 4, 0, 0x6b4a2e);        // limb
      v.add(-1, -1, 0, 0x6b4a2e); v.add(-1, 5, 0, 0x6b4a2e); // recurves
      v.fill(-1, 0, 0, -1, 4, 0, DARK, 0.02);    // string
      break;
    case 'torch':
      v.fill(0, 0, 0, 0, 4, 0, 0x6b4a2e);        // stick
      v.fill(-1, 4, -1, 1, 5, 1, 0x3a2a18);      // rag wrap
      break;
  }
  g.add(v.mesh());
  if (kind === 'staff') {
    const orb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), orbMat);
    orb.position.set(0, 10.6 * C, 0);
    orb.castShadow = true;
    g.add(orb);
  }
  if (kind === 'torch') {
    const flameMat = new THREE.MeshLambertMaterial({ color: 0xffb545, emissive: 0xff7a1f, emissiveIntensity: 0.8 });
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), flameMat);
    f1.position.set(0, 5.4 * C, 0);
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), flameMat);
    f2.position.set(0, 6.3 * C, 0);
    g.add(f1, f2);
  }
  return g;
}

// ── the character ────────────────────────────────────────────
export function buildCharacter(scheme: CharacterScheme, weapon: WeaponKind): Rig {
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const orc = scheme.orc === true;
  const martial = weapon === 'sword' || weapon === 'mace' || weapon === 'club';
  const skin = scheme.skin, cloth = scheme.cloth, accent = scheme.accent, hair = scheme.hair;

  // legs — pivot at hip (y=0.25), cubes centered on the pivot like before
  for (const [name, x] of [['legL', -0.12], ['legR', 0.12]] as const) {
    const v = new Vox();
    v.fill(0, -1, -1, 0, 2, 0, orc ? skin : accent);   // bare orc legs / pants
    v.fill(0, -2, -1, 0, -2, 0, BOOT);                 // boots
    const m = v.mesh();
    m.position.set(x, 0.25, 0);
    parts[name] = m; group.add(m);
  }

  // torso — origin at chest center (y=0.78), updateRig breathes scale.y
  {
    const v = new Vox();
    v.fill(-2, -1, -1, 2, 2, 1, cloth);                // chest 5×4×3
    v.fill(-2, -2, -1, 2, -2, 1, accent);              // belt row
    if (weapon === 'staff') {                          // wizard robe skirt
      v.fill(-2, -3, -1, 2, -3, 1, cloth);
      v.fill(-3, -4, -2, 2, -4, 1, cloth);
    }
    if (orc) {                                         // loincloth + chest strap
      v.fill(-1, -3, 1, 1, -3, 1, accent);
      v.fill(0, -4, 1, 1, -4, 1, accent);
      v.fill(-2, 1, 2, 2, 1, 2, accent);
    }
    const torso = v.mesh();
    torso.position.set(0, 0.78, 0);
    parts.torso = torso; group.add(torso);
  }

  // arms — pivot at shoulder (y=0.8), swing around center as before
  for (const [name, x] of [['armL', -0.35], ['armR', 0.35]] as const) {
    const v = new Vox();
    v.fill(0, -1, -1, 0, 2, 0, orc ? skin : cloth);
    v.fill(0, -2, -1, 0, -2, 0, orc ? accent : cloth); // bracer row
    const m = v.mesh();
    m.position.set(x, 0.8, 0);
    parts[name] = m; group.add(m);
  }

  // hands
  for (const [name, x] of [['handL', -0.35], ['handR', 0.35]] as const) {
    const v = new Vox();
    v.add(0, 0, 0, skin);
    const m = v.mesh();
    m.position.set(x, 0.52, 0);
    parts[name] = m; group.add(m);
  }

  // head — origin at head center (y=1.28); 4×4×4 skin block + features
  {
    const v = new Vox();
    v.fill(-2, -2, -2, 1, 1, 1, skin);
    if (orc) {
      v.fill(-2, 1, 2, 1, 1, 2, BROW, 0.04);           // brow ridge
      v.add(-1, -2, 2, TUSK, 0.03); v.add(0, -2, 2, TUSK, 0.03); // tusks
      v.fill(-4, 0, 0, -3, 0, 0, skin);                // pointed ear L
      v.fill(2, 0, 0, 3, 0, 0, skin);                  // pointed ear R
    } else if (weapon === 'mace') {                    // dwarven beard
      v.fill(-2, -3, 0, 1, -3, 2, hair);
      v.fill(-2, -2, 2, 1, -2, 2, hair);               // mustache
    }
    const head = v.mesh();
    head.position.set(0, 1.28, 0);
    parts.head = head; group.add(head);
  }

  // eyes (separate parts — updateRig bobs them)
  for (const [name, x] of [['eyeL', -0.09], ['eyeR', 0.09]] as const) {
    const v = new Vox();
    v.add(0, 0, 0, orc ? 0x3d1414 : DARK, 0);
    const m = v.mesh();
    m.position.set(x, 1.3, 0.16);
    parts[name] = m; group.add(m);
  }

  // hood or hair
  if (scheme.hood) {
    const hv = new Vox();
    hv.fill(-2, -1, -2, 1, 0, 1, cloth);               // cowl
    const hood = hv.mesh();
    hood.position.set(0, 1.44, -0.02);
    parts.hood = hood; group.add(hood);
    const tv = new Vox();
    tv.fill(-1, 0, -1, 0, 0, 0, cloth);
    tv.add(0, 1, -1, cloth);                           // tip
    const hoodTip = tv.mesh();
    hoodTip.position.set(0, 1.58, -0.06);
    parts.hoodTip = hoodTip; group.add(hoodTip);
  } else {
    const v = new Vox();
    if (weapon === 'sword') v.fill(-2, -1, -2, 1, 0, 1, hair); // fighter: helmet-ish
    else { v.fill(-2, 0, -2, 1, 0, 1, hair); v.fill(-2, -1, -2, 1, -1, -2, hair); } // cap + back fall
    const m = v.mesh();
    m.position.set(0, 1.5, 0);
    parts.hair = m; group.add(m);
  }

  // shoulder pads for martial classes
  if (martial) {
    for (const [name, x] of [['padL', -0.35], ['padR', 0.35]] as const) {
      const v = new Vox();
      v.fill(-1, 0, -1, 1, 0, 1, METAL_DARK);
      const m = v.mesh();
      m.position.set(x, 1.02, 0);
      parts[name] = m; group.add(m);
    }
  }

  // weapon in right hand
  const wg = buildWeapon(weapon, accent);
  if (weapon === 'torch') {
    wg.position.set(0.38, 0.72, 0.08);
    wg.rotation.x = -0.12;  // held upward, flame at top
  } else {
    wg.position.set(0.38, 0.5, 0.08);
    wg.rotation.x = weapon === 'bow' ? 0 : -0.5;
  }
  group.add(wg);
  parts.weapon = wg as unknown as THREE.Mesh;
  (wg as any).userData.kind = weapon;

  group.scale.setScalar(scheme.bulk ?? 1);

  return {
    group, parts,
    anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0 },
  };
}

const HIP_Y = 0.25; // leg pivot compensation

export function updateRig(rig: Rig, dt: number, speed = 1) {
  const a = rig.anim;
  a.t += dt * speed;
  const p = rig.parts;

  if (a.mode === 'dead') {
    // topple over & sink slightly
    const k = Math.min(1, a.t * 2.2);
    rig.group.rotation.x = -k * Math.PI / 2 * 0.9;
    rig.group.position.y = rig.group.userData.baseY - k * 0.15;
    return;
  }

  rig.group.rotation.x = 0;
  const walking = a.mode === 'walk';
  const w = walking ? Math.sin(a.t * 11) : 0;
  const idle = Math.sin(a.t * 2.2);

  // legs swing around hip: rotate + translate to fake pivot
  p.legL.rotation.x = w * 0.75;
  p.legR.rotation.x = -w * 0.75;
  p.legL.position.y = HIP_Y + Math.max(0, w) * 0.06;
  p.legR.position.y = HIP_Y + Math.max(0, -w) * 0.06;

  // arms
  p.armL.rotation.x = -w * 0.6 + idle * 0.05;
  p.armR.rotation.x = w * 0.6 + idle * 0.05 + (a.lunge > 0 ? -Math.sin(a.lunge * Math.PI) * 2.2 : 0);
  p.handL.rotation.x = p.armL.rotation.x;
  p.handR.rotation.x = p.armR.rotation.x;

  // weapon follows right arm
  const weapon = rig.group.children.find((c) => c.type === 'Group')!;
  const weaponBase = (weapon as any).userData?.kind === 'torch' ? 0.4 : -0.5;
  weapon.rotation.x = weaponBase + p.armR.rotation.x * 0.9;

  // body bob & breathe
  const bob = walking ? Math.abs(Math.sin(a.t * 11)) * 0.07 : idle * 0.02;
  a.bob = bob;
  p.torso.position.y = 0.78 + bob;
  p.torso.scale.y = 1 + idle * 0.02; // geometry is pre-scaled now — breathe ±2%
  p.head.position.y = 1.28 + bob * 1.2;
  p.eyeL.position.y = 1.3 + bob * 1.2;
  p.eyeR.position.y = 1.3 + bob * 1.2;
  if (p.hood) { p.hood.position.y = 1.44 + bob * 1.2; p.hoodTip!.position.y = 1.58 + bob * 1.2; }
  if (p.hair) p.hair.position.y = 1.5 + bob * 1.2;
  p.armL.position.y = 0.8 + bob; p.armR.position.y = 0.8 + bob;
  p.handL.position.y = 0.52 + bob; p.handR.position.y = 0.52 + bob;
  weapon.position.y = 0.5 + bob;
  if (p.padL) { p.padL.position.y = 1.02 + bob; p.padR!.position.y = 1.02 + bob; }

  // lunge arm swing (translation handled engine-side)
  if (a.lunge > 0) a.lunge = Math.max(0, a.lunge - dt * 3.2);
  // flinch
  if (a.flinch > 0) {
    a.flinch = Math.max(0, a.flinch - dt * 4);
    rig.group.rotation.x = -Math.sin(a.flinch * Math.PI) * 0.25;
  }
}
