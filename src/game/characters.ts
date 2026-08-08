// ─────────────────────────────────────────────────────────────
// Voxel character rigs — "everything is made of tiny cubes"
// Chibi style (C=0.1) for goblins/orcs, normal style (C=0.055)
// for humanoid PCs with rich detail (~600+ cubes per character).
// Parts keep exact names updateRig() animates.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { orcModel } from './voxelModels.mjs';
import type { CharacterScheme, WeaponKind, EquipSlot } from './types';
import { ENCHANTS, type Item } from './items';
import { playClipOnRig } from '../animationEditor/AnimationRuntime';
import { gregDrinkClip } from '../animationData/gregDrinkClip';
import { POSE_PRESETS } from './poseEditor';

// Soft-body / ragdoll collapse state, created the first frame a rig dies.
// Every joint is a critically-under-damped spring that swings toward a
// randomised "crumpled" target, while the whole group topples and the
// torso/head jiggle (squash-and-stretch) so the body reads as soft.
export interface DeathState {
  gvx: number; gvz: number; gtx: number; gtz: number;   // group pitch/roll velocity + target
  gvy: number; gty: number;                             // group posY velocity + target
  pv: Record<string, THREE.Vector3>;                    // per-part angular velocity (euler xyz)
  pt: Record<string, THREE.Vector3>;                    // per-part target euler
  jelly: number;                                        // decaying wobble amplitude
  impacted: boolean;                                    // true once the body has hit the ground (for FX)
}

export interface Rig {
  group: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  anim: {
    mode: 'idle' | 'walk' | 'dead' | 'sit' | 'floor' | 'lie' | 'passout' | 'drink' | 'drink_anim' | 'crack' | 'cross' | 'getup' | 'sit_cross' | 'myPose' | 'sleep' | 'point' | 'wipe';
    t: number;
    lunge: number;
    flinch: number;
    lungeDir: THREE.Vector3;
    bob: number;
    crouch: number;
    /** random per-rig phase offset (radians) so idle breathing / arm sway
     *  isn't in lockstep across all NPCs. Set once at build time. */
    phase?: number;
    /** persistent vertical offset (world units) added to the whole head
     *  assembly every frame — used by the editor to nudge a rig's head
     *  without fighting the per-frame pose solver. 1 tavern voxel = 0.11. */
    headYOffset?: number;
    /** persistent vertical offset (world units) added to the `hair` part
     *  every frame. For the wizard the `hair` part IS the star hat, so this
     *  raises just the hat. 1 tavern voxel = 0.11. */
    hairYOffset?: number;
    /** persistent rotation (radians) added to a forearm every frame — used to
     *  angle a character's lower arm (e.g. the wizard holding his staff). The
     *  matching wrist is counter-rotated so a held staff stays vertical. */
    forearmLOffset?: number;
    forearmROffset?: number;
    death?: DeathState;
    /** timestamp (anim.t) when a 'getup' rise started — for the stand-up curve. */
    getupStart?: number;
  };
  pivots?: {
    hip: number; torso: number; head: number; eye: number;
    hair: number; arm: number; hand: number; weapon: number;
    hood?: number; hoodTip?: number; pad?: number; knee?: number; elbow?: number; wrist?: number;
  };
  /** voxel equipment meshes attached via the equipment system, keyed by slot */
  equipped?: Partial<Record<EquipSlot, THREE.Object3D[]>>;
}

const C_CHIBI = 0.1;
const C_NORMAL = 0.055;
const C_DETAIL = 0.0285;   // high-res player model (~77 cubes ≈ 2.2 world units)
const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const orbMat = new THREE.MeshLambertMaterial({ color: 0xa78bfa, emissive: 0x7c3aed, emissiveIntensity: 0.9 });
const tmpCol = new THREE.Color();

const METAL = 0xb8bfc9, METAL_DARK = 0x7a828e, DARK = 0x1a1a22;
const TUSK = 0xf2ede0, BROW = 0x241a10, BOOT = 0x2c2620;

// tint a hex color by factor f (>1 lighten, <1 darken), clamped
function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// blend two hex colors (t=0 → a, t=1 → b)
function mix(hexA: number, hexB: number, t: number): number {
  const r = Math.round(((hexA >> 16) & 255) + (((hexB >> 16) & 255) - ((hexA >> 16) & 255)) * t);
  const g = Math.round(((hexA >> 8) & 255) + (((hexB >> 8) & 255) - ((hexA >> 8) & 255)) * t);
  const b = Math.round((hexA & 255) + ((hexB & 255) - (hexA & 255)) * t);
  return (r << 16) | (g << 8) | b;
}

class Vox {
  private geos: THREE.BufferGeometry[] = [];
  private C: number;
  private SUB: number;
  private EDGE: number;
  constructor(cubeEdge: number, sub = 1) {
    this.C = cubeEdge;
    this.SUB = Math.max(1, sub | 0);
    this.EDGE = cubeEdge / this.SUB;
  }
  add(gx: number, gy: number, gz: number, color: number, jitter = 0.1) {
    const place = (cx: number, cy: number, cz: number) => {
      const g = new THREE.BoxGeometry(this.EDGE, this.EDGE, this.EDGE);
      g.translate(cx * this.C, cy * this.C, cz * this.C);
      tmpCol.setHex(color).multiplyScalar(1 - jitter / 2 + Math.random() * jitter);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      this.geos.push(g);
    };
    if (this.SUB <= 1) { place(gx, gy, gz); return; }
    const s = this.SUB;
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) for (let k = 0; k < s; k++) {
      place(gx + (i + 0.5) / s - 0.5, gy + (j + 0.5) / s - 0.5, gz + (k + 0.5) / s - 0.5);
    }
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, jitter?: number) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.add(x, y, z, color, jitter);
  }
  // solid elliptic column along Y (rounded limbs)
  col(cx: number, cz: number, y0: number, y1: number, rx: number, rz: number, color: number, jitter?: number) {
    for (let y = y0; y <= y1; y++)
      for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dz = (z - cz) / rz;
          if (dx * dx + dz * dz <= 1.08) this.add(x, y, z, color, jitter);
        }
  }
  ellip(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: number, jitter?: number) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
      for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1.05) this.add(x, y, z, color, jitter);
        }
  }
  mesh(): THREE.Mesh {
    if (!this.geos.length) return new THREE.Mesh(new THREE.BufferGeometry(), bodyMat); // guard: empty part
    const merged = mergeGeometries(this.geos, false)!;
    this.geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, bodyMat);
    m.castShadow = true;
    return m;
  }
  count() { return this.geos.length; }
}

// Build a two-bone limb (thigh+shin or upper+forearm) as nested Groups so the
// lower segment pivots at the knee/elbow and follows the upper segment's swing.
// `splitY` is the grid height of the joint (knee / elbow). `upperAbove` true →
// voxels with gy >= splitY go to the upper bone, the rest to the lower bone.
// Returns { upper, lower, upperMesh, lowerMesh } where `lower` is parented to
// `upper` at the correct local joint offset.
interface Limb {
  upper: THREE.Group; lower: THREE.Group; hand?: THREE.Mesh; wrist?: THREE.Group;
}
function buildLimb(bucket: Map<string, number>, cx: number, cyUpper: number, splitY: number, C: number, handBucket?: Map<string, number>, handCy?: number, SUB: number = 1): Limb {
  const JIT = 0.035;
  const upper = new THREE.Group();
  const lower = new THREE.Group();
  const voU = new Vox(C, SUB), voL = new Vox(C, SUB);
  for (const [k, c] of bucket) {
    const [gx, gy, gz] = k.split(',').map(Number);
    if (gy >= splitY) voU.add(gx - cx, gy - cyUpper, gz, c, JIT);
    else voL.add(gx - cx, gy - splitY, gz, c, JIT);
  }
  upper.position.set(cx * C, cyUpper * C, 0);
  const um = voU.mesh(); upper.add(um);
  lower.position.set(0, (splitY - cyUpper) * C, 0);
  const lm = voL.mesh(); lower.add(lm);
  upper.add(lower);
  let hand: THREE.Mesh | undefined;
  let wrist: THREE.Group | undefined;
  if (handBucket && handCy !== undefined) {
    const vh = new Vox(C, SUB);
    for (const [k, c] of handBucket) {
      const [gx, gy, gz] = k.split(',').map(Number);
      vh.add(gx - cx, gy - handCy!, gz, c, JIT);
    }
    wrist = new THREE.Group();
    wrist.position.set(0, (handCy - splitY) * C, 0);
    hand = vh.mesh();
    wrist.add(hand);
    lower.add(wrist);
  }
  return { upper, lower, hand, wrist };
}

/**
 * Build the unified hierarchical skeleton for a humanoid rig.
 *
 * Wraps the rigid torso/head/hair meshes in pivot Groups at their anatomical
 * joints (hip / neck / crown), wraps the limb Groups in pivots at their actual
 * shoulder / hip world positions, fixes the nested elbow / knee / wrist joints,
 * and finally reparents head / hair / arms under the torso so they follow the
 * torso's tilt. After this runs, `rig.parts[name]` always points at the rotation
 * pivot (the Group that should be rotated to articulate that joint).
 *
 * Joint values stay in FLAT format (absolute world-space euler angles). The
 * consumers (updateRig, poseEditor.applyPose, animationEditor.playClipOnRig)
 * convert flat → local for torso-children by subtracting the parent's rotation.
 *
 * Only applies to "detailed" humanoid rigs (those whose `pivots.torso` matches
 * the player grid convention). Chibi / bat / skeleton / sheep rigs are left
 * flat — their animation paths use absolute rotation about the rig origin.
 *
 * Grid-y reference (player rig, C_DETAIL = 0.0285):
 *   Hip 34   Torso centre 45   Neck 56   Head centre 64   Crown 70
 *
 * Idempotent: sets `rig.group.userData.hierarchyBuilt = true` and early-exits
 * on subsequent calls.
 */
export function buildHierarchy(rig: Rig): void {
  const group = rig.group;
  if (group.userData.hierarchyBuilt) return;
  const P = rig.parts;
  const piv = rig.pivots;
  if (!piv) return;

  // Only the player / NPC detailed rig uses the grid-Y convention this function
  // relies on (torso pivot ≈ 45 * C_DETAIL ≈ 1.28). Chibi/creature rigs use
  // different scales and stay flat.
  const C = piv.torso / 45;
  if (Math.abs(C - 0.0285) > 0.01) return;   // not a detailed humanoid rig

  const HIP_GY = 34, NECK_GY = 56, CROWN_GY = 70;
  const TORSO_CY = 45, HEAD_CY = 64, HAIR_CY = 66;

  // ── Step A: wrap rigid parts in pivot groups at anatomical joints ──
  const wrapMesh = (name: string, jointGy: number, meshGy: number) => {
    const mesh = P[name];
    if (!mesh || (mesh as THREE.Object3D).type !== 'Mesh') return;
    const pivot = new THREE.Group();
    pivot.position.set(0, jointGy * C, 0);
    pivot.userData.baseY = jointGy * C;   // remember the build-time local Y for per-frame nudges
    group.add(pivot);
    mesh.parent?.remove(mesh);
    mesh.position.set(mesh.position.x, (meshGy - jointGy) * C, mesh.position.z);
    pivot.add(mesh);
    P[name] = pivot;
  };
  wrapMesh('torso', HIP_GY, TORSO_CY);
  wrapMesh('head',  NECK_GY, HEAD_CY);
  wrapMesh('hair',  CROWN_GY, HAIR_CY);
  if (P.hood)   wrapMesh('hood',   CROWN_GY, HAIR_CY + 2);
  if (P.hoodTip) wrapMesh('hoodTip', CROWN_GY, HAIR_CY + 4);

  // ── Step A2: fix the LIMB pivots (centreline → actual joint) ──
  const wrapLimb = (name: string) => {
    const upper = P[name] as THREE.Group | undefined;
    if (!upper || (upper as THREE.Object3D).type !== 'Group') return;
    group.updateMatrixWorld(true);
    const up = new THREE.Vector3();
    upper.getWorldPosition(up);
    const localJoint = group.worldToLocal(up.clone());
    let jointX = localJoint.x;
    const um = upper.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
    if (um) { const mp = new THREE.Vector3(); um.getWorldPosition(mp); jointX = group.worldToLocal(mp).x; }
    const pivot = new THREE.Group();
    pivot.position.set(jointX, localJoint.y, 0);
    group.add(pivot);
    pivot.attach(upper);
    P[name] = pivot;
  };
  wrapLimb('armL'); wrapLimb('armR');
  wrapLimb('legL'); wrapLimb('legR');

  // ── Step A3: fix the NESTED joints (elbow/knee + wrist) ──
  const wrapNestedJoint = (parent: THREE.Object3D, child: THREE.Object3D, partKey: string) => {
    parent.updateMatrixWorld(true);
    const cm = child.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
    const wp = new THREE.Vector3();
    if (cm) cm.getWorldPosition(wp); else child.getWorldPosition(wp);
    const local = parent.worldToLocal(wp.clone());
    const pivot = new THREE.Group();
    pivot.position.copy(local);
    parent.add(pivot);
    pivot.attach(child);
    if (partKey) P[partKey] = pivot;
  };
  const fixLimbJoints = (upperKey: string, foreKey: string, wristKey?: string) => {
    const pivot = P[upperKey] as THREE.Group | undefined;
    if (!pivot) return;
    const upper = pivot.children.find((c) => (c as THREE.Object3D).type === 'Group') as THREE.Group | undefined;
    if (!upper) return;
    const lower = upper.children.find((c) => (c as THREE.Object3D).type === 'Group') as THREE.Group | undefined;
    if (!lower) return;
    wrapNestedJoint(upper, lower, foreKey);
    if (wristKey) {
      const wrist = lower.children.find((c) => (c as THREE.Object3D).type === 'Group') as THREE.Group | undefined;
      if (wrist) wrapNestedJoint(lower, wrist, wristKey);
    }
  };
  fixLimbJoints('armL', 'foreL', 'wristL');
  fixLimbJoints('armR', 'foreR', 'wristR');
  fixLimbJoints('legL', 'shinL');
  fixLimbJoints('legR', 'shinR');

  // ── Step A4: hip pivot — wraps both legs so they can rotate together ──
  // Placed at the hip joint (grid-Y 34). Both legL and legR pivots are
  // reparented under it. Rotating this group swings both legs as a unit
  // (useful for sitting / lying poses where the whole lower body tilts).
  group.updateMatrixWorld(true);
  {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(0, HIP_GY * C, 0);
    hipPivot.userData.baseY = HIP_GY * C;
    group.add(hipPivot);
    if (P.legL) hipPivot.attach(P.legL);
    if (P.legR) hipPivot.attach(P.legR);
    P.hip = hipPivot;
  }

  // ── Step B: reparent head/hair/arms under torso so they follow torso tilt ──
  group.updateMatrixWorld(true);
  const rep = (childName: string, parentName: string) => {
    const child = P[childName] as THREE.Object3D | undefined;
    const newParent = P[parentName] as THREE.Object3D | undefined;
    if (!child || !newParent || child.parent === newParent) return;
    newParent.attach(child);
  };
  rep('head', 'torso');
  rep('hair', 'head');
  rep('armL', 'torso');
  rep('armR', 'torso');
  if (P.hood)   rep('hood',   'head');
  if (P.hoodTip) rep('hoodTip', 'head');

  // After reparenting, the local position.y of each reparented pivot has
  // changed (attach preserves world transform). Re-capture the true local Y
  // so updateRig can reconstruct positions correctly when applying nudges.
  group.updateMatrixWorld(true);
  for (const n of ['torso', 'head', 'hair', 'hood', 'hoodTip', 'armL', 'armR', 'hip']) {
    const o = P[n];
    if (o) o.userData.baseY = o.position.y;
  }

  group.userData.hierarchyBuilt = true;
}

function buildWeapon(kind: WeaponKind, accent: number, C: number, SUB: number = 1): THREE.Group {
  const g = new THREE.Group();
  const v = new Vox(C, SUB);
  const grip = 0x4a3421;
  switch (kind) {
    case 'sword':
      v.fill(0, 0, 0, 0, 1, 0, grip);
      v.fill(-1, 2, 0, 1, 2, 0, METAL_DARK);
      v.fill(0, 3, 0, 0, 8, 0, METAL);
      break;
    case 'dagger':
      v.add(0, 0, 0, grip);
      v.fill(0, 1, 0, 0, 4, 0, METAL);
      break;
    case 'club':
      v.fill(0, 0, 0, 0, 3, 0, grip);
      v.fill(-1, 4, -1, 1, 5, 1, accent);
      break;
    case 'mace':
      v.fill(0, 0, 0, 0, 3, 0, grip);
      v.fill(-1, 4, -1, 1, 5, 1, METAL);
      v.add(2, 4, 0, METAL); v.add(-2, 4, 0, METAL);
      v.add(0, 4, 2, METAL); v.add(0, 4, -2, METAL);
      break;
    case 'staff':
      // shaft extends from y=-34 (touches the ground) to y=27 (top crossbar)
      v.fill(0, -34, 0, 0, 27, 0, 0x6b4a2e);
      v.fill(-1, 27, 0, 1, 27, 0, 0x5f3e22);
      break;
    case 'bow':
      v.fill(0, 0, 0, 0, 4, 0, 0x6b4a2e);
      v.add(-1, -1, 0, 0x6b4a2e); v.add(-1, 5, 0, 0x6b4a2e);
      v.fill(-1, 0, 0, -1, 4, 0, DARK, 0.02);
      break;
    case 'torch':
      v.fill(0, 0, 0, 0, 4, 0, 0x6b4a2e);
      v.fill(-1, 4, -1, 1, 5, 1, 0x3a2a18);
      break;
  }
  g.add(v.mesh());
    if (kind === 'staff') {
      // faceted gem: octahedron (8 faces) instead of a plain cube
      const gemSize = 0.11;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(gemSize, 0), orbMat);
      orb.position.set(0, 28.5 * C, 0);
      orb.castShadow = true;
      g.add(orb);
      // small accent facets: a second smaller octahedron rotated 45° for extra sparkle
      const gem2 = new THREE.Mesh(new THREE.OctahedronGeometry(gemSize * 0.6, 0), orbMat);
      gem2.position.set(0, 28.5 * C, 0);
      gem2.rotation.y = Math.PI / 4;
      gem2.castShadow = true;
      g.add(gem2);
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

// ════════════════════════════════════════════════════════════════
//  NORMAL PLAYER — detailed high-res voxel model (~10k cubes)
//  Ported from scripts/gen_vox.mjs, split into animated parts.
//  Grid (77 cubes ≈ 2.2 world units at C_DETAIL):
//    0..10 boots   10..34 jeans   33..37 hip/belt
//   37..56 shirt   56..72 head    49..77 hair (curtain→crown)
//   arms 34..55 (forearm+sleeve)  hands 28..34
// ════════════════════════════════════════════════════════════════
function buildPlayerRig(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  const C = C_DETAIL;
  const WC = C_NORMAL;   // weapon scale (keeps torch-flame light offset valid)
  // SUB=1: original voxel detail for Greg's model. (The earlier 8× fidelity bump
  // to SUB=2 hurt performance, so it was reverted — same grid, cheaper build.)
  const SUB = 1;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const martial = weapon === 'sword' || weapon === 'mace' || weapon === 'club';

  // ── palette derived from scheme (+ fixed accents) ──
  const skin = scheme.skin;
  const skinD = shade(skin, 0.87), skinD2 = shade(skin, 0.74), skinHL = shade(skin, 1.09), blush = shade(skin, 0.93);
  const cloth = scheme.cloth;
  const shirtD = shade(cloth, 0.9), shirtD2 = shade(cloth, 0.8), shirtHI = shade(cloth, 1.03);
  const pant = scheme.accent;
  const pantD = shade(pant, 0.82), pantD2 = shade(pant, 0.66), pantHI = shade(pant, 1.16), seam = shade(pant, 1.38);
  const hair = scheme.hair;
  const hairD = shade(hair, 0.66), hairD2 = shade(hair, 0.45), hairHI = shade(hair, 1.4), hairHL = shade(hair, 1.75);
  const B_BOOT = 0x5c3d22, B_BOOTD = 0x3d2816, B_BOOTHI = 0x7d5230, B_SOLE = 0x28221d, LACE = 0xd8c48c;
  const C_BELT = 0x3a2a1a, BUCKLE = 0xc9a94a, BUCKLE_D = 0xa2842f;
  const EYE_W = 0xf5f2ec, IRIS = 0x6b4426, PUPIL = 0x15100c, EYE_HI = 0xffffff;
  const M_MOUTH = 0xb05a4a, M_MOUTHD = 0x8a3a30;
  const POCK = shade(cloth, 0.97), POCK_ST = shade(cloth, 0.78);

  // ── grid pivots ──
  const LEG_X = 4, ARM_X = 10;
  const HIP_G = 34, TORSO_G = 45, ARM_G = 55, HAND_G = 31, HEAD_G = 64, HAIR_G = 66, EYE_G = 63, PAD_G = 56;
  const partInfo: Record<string, { cx: number; cy: number }> = {
    legL: { cx: -LEG_X, cy: HIP_G }, legR: { cx: LEG_X, cy: HIP_G },
    torso: { cx: 0, cy: TORSO_G },
    armL: { cx: -ARM_X, cy: ARM_G }, armR: { cx: ARM_X, cy: ARM_G },
    handL: { cx: -ARM_X, cy: HAND_G }, handR: { cx: ARM_X, cy: HAND_G },
    head: { cx: 0, cy: HEAD_G }, hair: { cx: 0, cy: HAIR_G },
  };
  const buckets: Record<string, Map<string, number>> = {};
  for (const k of Object.keys(partInfo)) buckets[k] = new Map();

  // ── voxel helpers writing into the current target bucket (last write wins) ──
  let cur: Map<string, number> = buckets.torso;
  const put = (x: number, y: number, z: number, c: number) =>
    cur.set(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`, c);
  const putM = (x: number, y: number, z: number, c: number) => { put(x, y, z, c); put(-x, y, z, c); };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, c);
  };
  const colf = (cx: number, cz: number, y0: number, y1: number, rx: number, rz: number, c: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dz = (z - cz) / rz;
          if (dx * dx + dz * dz <= 1.02) put(x, y, z, c);
        }
  };
  const rbox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, c: number) => {
    const cx0 = x0 + r, cx1 = x1 - r, cz0 = z0 + r, cz1 = z1 - r;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      let dx = 0, dz = 0;
      if (x < cx0) dx = x - cx0; else if (x > cx1) dx = x - cx1;
      if (z < cz0) dz = z - cz0; else if (z > cz1) dz = z - cz1;
      if (dx * dx + dz * dz <= r * r + 0.3) put(x, y, z, c);
    }
  };
  const ellipsoid = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number, inner = 0) => {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
      for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          const d = dx * dx + dy * dy + dz * dz;
          if (d <= 1.02 && d >= inner) put(x, y, z, c);
        }
  };

  // ═══ LEGS (per side) ═══
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.legL : buckets.legR;
    const cx = s * LEG_X;
    if (scheme.naked) {
      // bare leg + bare foot + yellow briefs (no shoes, no jeans)
      colf(cx, 0.5, 2, 34, 3.2, 3.4, skin);
      colf(cx, 0.5, 0, 2, 3.4, 3.6, skinD);
      for (let y = 1; y <= 33; y++) {
        put(cx + s * 3, y, 0, skinD2);
        put(cx - s * 3, y, 0, skinD);
        put(cx, y, 3, skinHL);
        put(cx, y, -3, skinD2);
      }
      rbox(cx - 3, 0, -4, cx + 3, 1, 6, 2, skinD);   // bare foot
      rbox(cx - 3, 33, -2, cx + 3, 37, 3, 1.6, cloth); // briefs band
      box(cx - 3, 33, 3, cx + 3, 35, 3, cloth);         // front pouch
      put(cx, 35, 3, shirtHI);
    } else {
      // boots + jeans
      rbox(cx - 3, 0, -4, cx + 3, 1, 6, 2, B_SOLE);
      box(cx - 3, 1, -4, cx + 3, 1, 6, B_BOOTD);
      rbox(cx - 3, 2, -4, cx + 3, 8, 5, 2, B_BOOT);
      box(cx - 2, 2, 5, cx + 2, 4, 6, B_BOOTHI);
      box(cx - 2, 2, -4, cx + 2, 4, -4, B_BOOTD);
      rbox(cx - 3, 8, -3, cx + 3, 10, 4, 2, B_BOOTHI);
      box(cx - 3, 9, -3, cx + 3, 9, 4, B_BOOTD);
      for (let ly = 4; ly <= 8; ly += 2) { put(cx - 1, ly, 6, LACE); put(cx + 1, ly, 6, LACE); }
      put(cx, 5, 6, LACE); put(cx, 7, 6, LACE);
      box(cx - 3, 5, 0, cx - 3, 6, 0, B_BOOTD);
      box(cx + 3, 5, 0, cx + 3, 6, 0, B_BOOTD);
      colf(cx, 0.5, 10, 34, 3.2, 3.4, pant);
      colf(cx, 0.5, 10, 11, 3.4, 3.6, pantD);
      for (let y = 11; y <= 33; y++) {
        put(cx + s * 3, y, 0, seam);
        put(cx - s * 3, y, 0, pantD2);
        put(cx, y, 3, pantHI);
        put(cx, y, -3, pantD);
      }
      box(cx - 2, 20, 3, cx + 2, 20, 4, pantD);
      box(cx - 2, 22, 3, cx + 2, 22, 4, pantHI);
      box(cx - 1, 18, 3, cx + 1, 18, 4, pantD);
      box(cx - 3, 12, 3, cx + 3, 12, 3, seam);
      colf(cx, 3, 19, 23, 1.6, 1.2, pantHI);
    }
  }

  // ═══ TORSO (hip / briefs / bare chest / neck) ═══
  cur = buckets.torso;
  if (scheme.naked) {
    // yellow briefs centre band + bare chest + neck
    rbox(-8, 33, -4, 8, 36, 4, 2, cloth);
    box(-1, 33, 3, 1, 36, 4, shirtHI);
    box(-1, 33, -4, 1, 36, -4, cloth);
    for (let y = 37; y <= 55; y++) { const t = (y - 37) / 18; const hx = Math.round(7 + t * 1.8); rbox(-hx, y, -5, hx, y, 5, 2, skin); }
    box(-8, 37, -4, 8, 37, 5, skinD);
    rbox(-11, 53, -4, 11, 56, 4, 2, skin);
    box(-11, 53, 0, -9, 55, 0, skinD);
    box(9, 53, 0, 11, 55, 0, skinD);
    for (let y = 38; y <= 53; y++) { put(-5, y, 5, skinD); put(5, y, 5, skinHL); put(0, y, -5, skinD); }
    for (let i = 0; i < 5; i++) { put(-6 + i, 39 + i, 5, skinD2); put(6 - i, 39 + i, 5, skinD2); }
    put(-3, 47, 5, skinD2); put(3, 47, 5, skinD2);   // nipples
    colf(0, -1, 55, 58, 2.2, 2.0, skin);
    put(0, 56, -2, skinD2);
    box(-2, 56, 2, 2, 57, 2, skinD);
  } else {
    rbox(-8, 33, -4, 8, 36, 4, 2, pant);
    box(-1, 33, 3, 1, 36, 4, pantD);
    box(-1, 33, -4, 1, 36, -4, pantD2);
    for (const s of [-1, 1]) { box(Math.min(s * 4, s * 6), 34, 4, Math.max(s * 4, s * 6), 36, 4, pantD); put(s * 4, 33, 4, seam); put(s * 6, 33, 4, seam); }
    rbox(-8, 35, -4, 8, 37, 5, 2, C_BELT);
    box(-2, 35, 5, 2, 37, 5, BUCKLE);
    box(-1, 35, 5, 1, 36, 5, BUCKLE_D);
    for (const bx of [-6, -2, 2, 6]) box(bx, 35, 5, bx, 37, 5, pantD);
    for (let y = 37; y <= 55; y++) { const t = (y - 37) / 18; const hx = Math.round(7 + t * 1.8); rbox(-hx, y, -5, hx, y, 5, 2, cloth); }
    box(-8, 37, -4, 8, 37, 5, shirtD);
    rbox(-11, 53, -4, 11, 56, 4, 2, cloth);
    box(-11, 53, 0, -9, 55, 0, shirtD);
    box(9, 53, 0, 11, 55, 0, shirtD);
    for (let y = 38; y <= 53; y++) { put(-5, y, 5, shirtD); put(5, y, 5, shirtHI); put(0, y, -5, shirtD); }
    for (let i = 0; i < 5; i++) { put(-6 + i, 39 + i, 5, shirtD2); put(6 - i, 39 + i, 5, shirtD2); }
    box(-8, 48, 4, -6, 51, 5, shirtD);
    box(6, 48, 4, 8, 51, 5, shirtD);
    rbox(-3, 55, 2, 3, 57, 5, 1, cloth);
    box(-2, 56, 5, 2, 56, 5, shirtD);
    box(-2, 57, 4, 2, 57, 5, skinD2);
    box(2, 46, 5, 5, 50, 5, POCK);
    box(2, 50, 5, 5, 50, 5, POCK_ST);
    put(2, 46, 5, POCK_ST); put(5, 46, 5, POCK_ST);
    box(2, 46, 5, 2, 50, 5, POCK_ST);
    box(5, 46, 5, 5, 50, 5, POCK_ST);
    colf(0, -1, 55, 58, 2.2, 2.0, skin);
    put(0, 56, -2, skinD2);
    box(-2, 56, 2, 2, 57, 2, skinD);
  }
  if (weapon === 'staff') rbox(-9, 30, -4, 9, 37, 5, 2, cloth);   // caster robe skirt

  // ═══ ARMS (bare when naked, else sleeve + bare forearm) ═══
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.armL : buckets.armR;
    const cx = s * ARM_X;
    if (scheme.naked) {
      colf(cx, 0, 34, 55, 2.4, 2.5, skin);
      for (let y = 35; y <= 54; y++) { put(cx, y, 2, skinHL); put(cx, y, -2, skinD); }
      put(cx + s * 2, 53, 1, skinD);
    } else {
      colf(cx, 0, 43, 55, 2.6, 2.6, cloth);
      colf(cx, 0, 43, 44, 2.8, 2.8, shirtD);
      put(cx + s * 2, 52, 0, shirtHI);
      put(cx - s * 2, 51, 0, shirtD);
      colf(cx, 0, 34, 42, 2.2, 2.3, skin);
      for (let y = 35; y <= 41; y++) { put(cx, y, 2, skinHL); put(cx, y, -2, skinD); }
      put(cx + s * 2, 40, 1, skinD);
      colf(cx, -1, 42, 43, 2.0, 1.6, skinD);
    }
  }

  // ═══ HANDS ═══
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.handL : buckets.handR;
    const cx = s * ARM_X;
    rbox(cx - 2, 30, -2, cx + 2, 34, 2, 1, skin);
    put(cx, 32, 2, skinHL); put(cx, 31, -2, skinD);
    for (let f = -1; f <= 2; f++) { const fx = cx + f; box(fx, 28, -1, fx, 30, 1, skin); put(fx, 28, 0, skinD); put(fx, 29, 1, skinHL); }
    box(cx + s * 2, 31, 1, cx + s * 3, 32, 2, skin);
    put(cx + s * 3, 31, 2, skinD);
  }

  // ═══ HEAD + face ═══
  cur = buckets.head;
  ellipsoid(0, HEAD_G, 0, 6, 8, 6, skin);
  ellipsoid(0, 58, 1, 4.5, 3.5, 5, skin);
  put(0, 56, 3, skinD);
  for (const s of [-1, 1]) { put(s * 4, 61, 5, blush); put(s * 4, 62, 4, skinHL); put(s * 5, 63, 2, skinD); }
  box(-2, 68, 5, 2, 69, 6, skinHL);
  for (const s of [-1, 1]) { box(s * 6, 62, -1, s * 6, 64, 1, skin); put(s * 6, 63, 0, skinD); put(s * 7, 63, 0, skin); put(s * 6, 61, 0, skinD2); }
  for (const s of [-1, 1]) {
    const ex = s * 3;
    box(ex - 1, 62, 5, ex + 1, 63, 6, skinD);
    put(ex - 1, 63, 6, EYE_W); put(ex + 1, 63, 6, EYE_W);
    put(ex - 1, 62, 6, EYE_W); put(ex + 1, 62, 6, EYE_W);
    put(ex, 63, 6, IRIS); put(ex, 62, 6, PUPIL);
    put(ex + s, 63, 6, EYE_HI);   // catch-light, kept flush with the face (z=6)
    box(ex - 1, 64, 6, ex + 1, 64, 6, skinD2);
    put(ex, 61, 6, skinD);
  }
  for (const s of [-1, 1]) { box(Math.min(s * 2, s * 4), 65, 6, Math.max(s * 2, s * 4), 65, 6, hairD); put(s * 3, 66, 6, hairD2); }
  box(0, 61, 6, 0, 63, 6, skin);
  put(0, 61, 7, skinHL);
  putM(1, 61, 6, skinD2);
  put(0, 60, 6, skinD);
  box(-2, 59, 6, 2, 59, 6, M_MOUTH);
  box(-1, 59, 6, 1, 59, 6, M_MOUTHD);
  putM(2, 60, 6, M_MOUTH);
  put(0, 58, 6, skinD);

  // ═══ HAIR ═══
  cur = buckets.hair;
  const hairShade = (x: number, y: number, z: number): number => {
    const h = (((x + 40) * 73856093) ^ ((y + 40) * 19349663) ^ ((z + 40) * 83492791)) >>> 0;
    const r = h % 100;
    if (r < 10) return hairHI;
    if (r < 16) return hairHL;
    if (r < 24) return hairD;
    return hair;
  };
  const HR_CY = 66;
  for (let x = -8; x <= 8; x++) for (let y = 63; y <= 82; y++) for (let z = -8; z <= 8; z++) {
    const dx = x / 7.2, dy = (y - HR_CY) / 9.0, dz = z / 7.0;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > 1.05 || d < 0.62) continue;
    if (z > 2 && y < 68) continue;
    if (z > 4 && y < 71) continue;
    put(x, y, z, hairShade(x, y, z));
  }
  ellipsoid(0, 70, 0, 6.6, 6.0, 6.4, hair, 0.55);
  const fringe: [number, number, number][] = [[-5,70,6],[-4,69,6],[-4,68,7],[-3,70,7],[-2,68,7],[0,69,7],[2,68,7],[3,70,7],[4,68,7],[4,69,6],[5,70,6]];
  for (const [x, y, z] of fringe) put(x, y, z, hair);
  const sHI: [number, number, number][] = [[-6,72,3],[-4,74,4],[-2,75,3],[0,76,2],[2,75,4],[4,74,3],[6,72,2],[-5,72,5],[-3,71,6],[3,71,6],[5,72,5],[-1,74,5],[1,74,5],[-6,70,1],[6,70,1],[-3,75,1],[3,75,1]];
  for (const [x, y, z] of sHI) put(x, y, z, hairHI);
  const sHL: [number, number, number][] = [[-2,76,2],[2,76,2],[0,75,3],[-4,74,3],[4,74,3],[-1,75,4],[1,75,4]];
  for (const [x, y, z] of sHL) put(x, y, z, hairHL);
  const sD: [number, number, number][] = [[-7,68,-2],[7,68,-2],[-6,66,-3],[6,66,-3],[-5,71,-5],[5,71,-5],[-4,73,-6],[4,73,-6],[0,74,-6]];
  for (const [x, y, z] of sD) put(x, y, z, hairD);
  const tufts: [number, number, number][] = [[-2,76,1],[2,76,1],[-1,76,-1],[1,76,-2],[3,75,0],[-3,75,0],[0,76,0]];
  for (const [x, y, z] of tufts) put(x, y, z, hair);
  put(0, 77, 0, hairHI);
  for (let y = 49; y <= 62; y++) {
    const t = (y - 49) / 13;
    const halfW = Math.round(3 + t * 3);
    for (let x = -halfW; x <= halfW; x++) {
      const edge = 1 - Math.abs(x) / (halfW + 0.6);
      const back = -5 - Math.round(edge * 2);
      put(x, y, back, hairShade(x, y, back));
      put(x, y, back + 1, hairShade(x, y, back + 1));
      put(x, y, back + 2, hairShade(x, y, back + 2));
    }
    put(0, y, -5, y % 3 === 0 ? hairHI : hair);
  }
  const tips: [number, number, number][] = [[-3,48,-6],[0,47,-6],[3,48,-6],[-2,48,-5],[2,47,-5],[-4,49,-6],[4,49,-6]];
  for (const [x, y, z] of tips) { put(x, y, z, hairShade(x, y, z)); put(x, y, z - 1, hairShade(x, y, z - 1)); }
  for (const s of [-1, 1]) {
    for (let y = 53; y <= 67; y++) { put(s * 6, y, -2, hair); put(s * 6, y, -4, hair); put(s * 7, y, -3, hairD); put(s * 5, y, -5, hair); }
    put(s * 6, 52, -3, hair); put(s * 5, 51, -4, hairD); put(s * 6, 66, 3, hairHI);
  }
  for (const s of [-1, 1]) { box(Math.min(s * 6, s * 7), 66, 3, Math.max(s * 6, s * 7), 68, 4, hair); put(s * 7, 67, 4, hairHI); }

  // ═══ de-dupe hair/head (hair is decorative — skin wins) ═══
  for (const k of [...buckets.hair.keys()]) if (buckets.head.has(k)) buckets.hair.delete(k);

  // ═══ BUILD PART MESHES ═══
  // torso / head / hair are rigid single meshes; legs & arms are two-bone
  // limbs (thigh+shin, upper+forearm) so they can bend at knee / elbow.
  for (const name of ['torso', 'head', 'hair'] as const) {
    const info = partInfo[name];
    const vo = new Vox(C, SUB);
    for (const [k, c] of buckets[name]) {
      const [gx, gy, gz] = k.split(',').map(Number);
      vo.add(gx - info.cx, gy - info.cy, gz, c, 0.035);
    }
    const m = vo.mesh();
    m.position.set(info.cx * C, info.cy * C, 0);
    parts[name] = m; group.add(m);
  }
  const KNEE_G = 22, ELBOW_G = 43;
  for (const s of [-1, 1] as const) {
    const lm = buildLimb(s < 0 ? buckets.legL : buckets.legR, s * LEG_X, HIP_G, KNEE_G, C);
    parts[s < 0 ? 'legL' : 'legR'] = lm.upper; parts[s < 0 ? 'shinL' : 'shinR'] = lm.lower; group.add(lm.upper);
    const am = buildLimb(s < 0 ? buckets.armL : buckets.armR, s * ARM_X, ARM_G, ELBOW_G, C, s < 0 ? buckets.handL : buckets.handR, HAND_G);
    parts[s < 0 ? 'armL' : 'armR'] = am.upper; parts[s < 0 ? 'foreL' : 'foreR'] = am.lower;
    if (am.hand) parts[s < 0 ? 'handL' : 'handR'] = am.hand;
    if (am.wrist) parts[s < 0 ? 'wristL' : 'wristR'] = am.wrist;
    group.add(am.upper);
  }

  // ═══ SHOULDER PADS (martial only) — ride on the upper arm ═══
  if (martial) {
    for (const [name, sx] of [['padL', -ARM_X], ['padR', ARM_X]] as const) {
      const vo = new Vox(C, SUB);
      vo.fill(-3, -2, -3, 3, 2, 3, METAL_DARK);
      vo.fill(-4, 0, -2, 4, 2, 2, METAL, 0.03);
      vo.fill(-1, 3, 0, 1, 3, 0, METAL, 0.02);
      const m = vo.mesh();
      m.position.set(sx * C, PAD_G * C, 0);
      parts[name] = m; group.add(m);
    }
  }

  // ═══ WEAPON — parented to the right hand so it follows the arm ═══
  const WEAPON_Y = 34;
  if (weapon) {
    const wg = buildWeapon(weapon, scheme.accent, WC);
    wg.position.set(0.03, (WEAPON_Y - HAND_G) * C, 5 * C);
    wg.rotation.x = weapon === 'bow' || weapon === 'torch' ? -0.12 : 1.35;
    const handR = parts.handR as THREE.Mesh | undefined;
    if (handR) handR.add(wg); else group.add(wg);
    parts.weapon = wg as unknown as THREE.Mesh;
    (wg as any).userData.kind = weapon;
  }

  group.scale.setScalar(scheme.bulk ?? 1);

  const rig: Rig = {
    group, parts,
    anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: {
      hip: HIP_G * C, torso: TORSO_G * C, head: HEAD_G * C, eye: EYE_G * C,
      hair: HAIR_G * C, arm: ARM_G * C, hand: HAND_G * C, weapon: WEAPON_Y * C,
      pad: PAD_G * C, knee: KNEE_G * C, elbow: ELBOW_G * C, wrist: HAND_G * C,
    },
  };
  buildHierarchy(rig);
  return rig;
}

// ────── CHIBI RIG (unchanged) ──────
function buildChibiRig(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  const C = C_CHIBI;
  const SUB = 4;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const orc = scheme.orc === true;
  const martial = weapon === 'sword' || weapon === 'mace' || weapon === 'club';
  const skin = scheme.skin, cloth = scheme.cloth, accent = scheme.accent, hair = scheme.hair;

  for (const [name, x] of [['legL', -0.12], ['legR', 0.12]] as const) {
    const v = new Vox(C, SUB);
    v.fill(0, -1, -1, 0, 2, 0, orc ? skin : accent);
    v.fill(0, -2, -1, 0, -2, 0, BOOT);
    const m = v.mesh();
    m.position.set(x, 0.25, 0);
    parts[name] = m; group.add(m);
  }
  {
    const v = new Vox(C, SUB);
    v.fill(-2, -1, -1, 2, 2, 1, cloth);
    v.fill(-2, -2, -1, 2, -2, 1, accent);
    if (weapon === 'staff') { v.fill(-2, -3, -1, 2, -3, 1, cloth); v.fill(-3, -4, -2, 2, -4, 1, cloth); }
    if (orc) { v.fill(-1, -3, 1, 1, -3, 1, accent); v.fill(0, -4, 1, 1, -4, 1, accent); v.fill(-2, 1, 2, 2, 1, 2, accent); }
    const torso = v.mesh(); torso.position.set(0, 0.78, 0);
    parts.torso = torso; group.add(torso);
  }
  for (const [name, x] of [['armL', -0.35], ['armR', 0.35]] as const) {
    const v = new Vox(C, SUB);
    v.fill(0, -1, -1, 0, 2, 0, orc ? skin : cloth);
    v.fill(0, -2, -1, 0, -2, 0, orc ? accent : cloth);
    const m = v.mesh(); m.position.set(x, 0.8, 0);
    parts[name] = m; group.add(m);
  }
  for (const [name, x] of [['handL', -0.35], ['handR', 0.35]] as const) {
    const v = new Vox(C, SUB); v.add(0, 0, 0, skin);
    const m = v.mesh(); m.position.set(x, 0.52, 0);
    parts[name] = m; group.add(m);
  }
  {
    const v = new Vox(C, SUB);
    v.fill(-2, -2, -2, 1, 1, 1, skin);
    if (orc) { v.fill(-2, 1, 2, 1, 1, 2, BROW, 0.04); v.add(-1, -2, 2, TUSK, 0.03); v.add(0, -2, 2, TUSK, 0.03); v.fill(-4, 0, 0, -3, 0, 0, skin); v.fill(2, 0, 0, 3, 0, 0, skin); }
    else if (weapon === 'mace') { v.fill(-2, -3, 0, 1, -3, 2, hair); v.fill(-2, -2, 2, 1, -2, 2, hair); }
    const head = v.mesh(); head.position.set(0, 1.28, 0);
    parts.head = head; group.add(head);
  }
  for (const [name, x] of [['eyeL', -0.09], ['eyeR', 0.09]] as const) {
    const v = new Vox(C, SUB); v.add(0, 0, 0, orc ? 0x3d1414 : DARK, 0);
    const m = v.mesh(); m.position.set(x, 1.3, 0.16);
    parts[name] = m; group.add(m);
  }
  if (scheme.hood) {
    const hv = new Vox(C, SUB); hv.fill(-2, -1, -2, 1, 0, 1, cloth);
    const hood = hv.mesh(); hood.position.set(0, 1.44, -0.02);
    parts.hood = hood; group.add(hood);
    const tv = new Vox(C, SUB); tv.fill(-1, 0, -1, 0, 0, 0, cloth); tv.add(0, 1, -1, cloth);
    const hoodTip = tv.mesh(); hoodTip.position.set(0, 1.58, -0.06);
    parts.hoodTip = hoodTip; group.add(hoodTip);
  } else {
    const v = new Vox(C, SUB);
    if (weapon === 'sword') v.fill(-2, -1, -2, 1, 0, 1, hair);
    else { v.fill(-2, 0, -2, 1, 0, 1, hair); v.fill(-2, -1, -2, 1, -1, -2, hair); }
    const m = v.mesh(); m.position.set(0, 1.5, 0);
    parts.hair = m; group.add(m);
  }
  if (martial) {
    for (const [name, x] of [['padL', -0.35], ['padR', 0.35]] as const) {
      const v = new Vox(C, SUB); v.fill(-1, 0, -1, 1, 0, 1, METAL_DARK);
      const m = v.mesh(); m.position.set(x, 1.02, 0);
      parts[name] = m; group.add(m);
    }
  }
  if (weapon) {
    const wg = buildWeapon(weapon, accent, C, SUB);
    if (weapon === 'torch') { wg.position.set(0.38, 0.72, 0.08); wg.rotation.x = -0.12; }
    else { wg.position.set(0.38, 0.5, 0.08); wg.rotation.x = weapon === 'bow' ? 0 : 1.35; }
    group.add(wg);
    parts.weapon = wg as unknown as THREE.Mesh;
    (wg as any).userData.kind = weapon;
  }
  group.scale.setScalar(scheme.bulk ?? 1);
  return { group, parts, anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 } };
}

// ════════════════════════════════════════════════════════════════
//  BEAST & UNDEAD RIGS — rats, bats, skeletons. Non-humanoid rigs
//  MUST return a `pivots` block so updateRig() places their parts at
//  the right heights (it defaults to humanoid Ys otherwise). All rigs
//  still expose legL/legR/torso/armL/armR/handL/handR/head so the
//  shared animation + ragdoll death keep working.
// ════════════════════════════════════════════════════════════════
type Build = (v: Vox) => void;

function buildRatRig(scheme: CharacterScheme): Rig {
  const C = 0.075;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const fur = scheme.skin, furD = shade(fur, 0.78), belly = scheme.cloth, ear = scheme.accent, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: Build) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  part('torso', 0, 0.16, 0, (v) => {
    v.ellip(0, 0, 0, 2.4, 1.9, 3.6, fur);            // body
    v.ellip(0, -1, 1, 1.8, 1.2, 2.6, belly);         // pale underbelly
    v.fill(-1, 1, -3, 1, 2, -2, furD);               // haunch hump
    let tz = -4, ty = 0;                             // long curling tail
    for (let i = 0; i < 8; i++) { v.add(0, Math.round(ty), tz, i < 3 ? furD : ear); tz -= 1; if (i > 2) ty += 0.7; }
  });
  part('head', 0, 0.2, 0.34, (v) => {
    v.ellip(0, 0, 0, 1.8, 1.6, 1.8, fur);
    v.fill(-1, -1, 1, 1, 0, 2, furD);                // snout
    v.add(0, -1, 3, 0x2a2020);                       // nose
    for (const s of [-1, 1]) { v.add(s * 2, 2, -1, ear); v.add(s * 2, 3, -1, shade(ear, 1.2)); v.add(s * 2, 2, 0, ear); } // round ears
    v.add(-1, 1, 2, eye); v.add(1, 1, 2, eye);       // beady eyes
  });
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.11, 0.19, -0.14, (v) => {
    v.add(0, 0, 0, furD); v.fill(0, -1, 0, 0, -1, 1, fur); v.add(0, -2, 1, 0x2a2020);
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.1, 0.12, 0.2, (v) => {
    v.fill(0, -1, 0, 0, 0, 0, fur); v.add(0, -2, 1, 0x2a2020);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.1, 0.05, 0.24, (v) => { v.add(0, 0, 0, furD); });

  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.1, torso: 0.16, head: 0.2, eye: 0.22, hair: 0.2, arm: 0.12, hand: 0.05, weapon: 0.2 },
  };
}

function buildBatRig(scheme: CharacterScheme): Rig {
  const C = 0.08;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const skin = scheme.skin, skinHI = shade(skin, 1.2), wing = scheme.cloth, edge = scheme.accent, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: Build) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  part('torso', 0, 0.9, 0, (v) => {
    v.ellip(0, 0, 0, 1.4, 2.0, 1.4, skin);
    v.fill(-1, -2, 0, 1, -2, 0, shade(skin, 0.8));   // furry chest
  });
  part('head', 0, 1.12, 0.04, (v) => {
    v.ellip(0, 0, 0, 1.5, 1.4, 1.5, skin);
    for (const s of [-1, 1]) { v.fill(s * 1, 2, -1, s * 1, 3, -1, skin); v.add(s * 1, 4, -1, skinHI); } // tall ears
    v.add(-1, 0, 2, eye); v.add(1, 0, 2, eye);       // eyes
    v.add(-1, -1, 2, 0xffffff); v.add(1, -1, 2, 0xffffff); // fangs
  });
  // membranous wings mapped to the arms (updateRig flaps them via userData.flap)
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.12, 0.95, 0, (v) => {
    for (let gx = 0; gx <= 4; gx++) {
      const span = 2 - Math.floor(gx * 0.35);
      for (let gz = -span; gz <= span; gz++) v.add(s * gx, Math.round(-gx * 0.25), gz, wing);
      v.add(s * gx, Math.round(-gx * 0.25) - span - 1, 0, edge);  // trailing claw
    }
    for (let gz = -2; gz <= 2; gz++) v.add(s * 4, -1, gz, edge);   // wing-tip bone
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.5, 0.95, 0, (v) => { v.add(0, 0, 0, edge); });
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.05, 0.78, -0.05, (v) => { v.fill(0, -1, 0, 0, 0, 0, shade(skin, 0.7)); });

  group.userData.flap = true;
  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.78, torso: 0.9, head: 1.12, eye: 1.12, hair: 1.12, arm: 0.95, hand: 0.95, weapon: 0.95 },
  };
}

function buildLeechRig(scheme: CharacterScheme): Rig {
  const C = 0.075;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const skin = scheme.skin, skinD = shade(skin, 0.8), skinD2 = shade(skin, 0.62), belly = scheme.cloth, sucker = scheme.accent, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: Build) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  // long segmented body, low to the ground — reads clearly as a worm, not a rat
  part('torso', 0, 0.12, 0, (v) => {
    v.ellip(0, 0, 0, 1.3, 0.95, 4.2, skin);            // the worm
    v.ellip(0, -0.6, 0.7, 1.0, 0.4, 3.3, belly);       // pale underbelly
    for (let z = -3; z <= 3; z++) v.fill(-1, 0.45, z, 1, 0.85, z, skinD);   // segment rings
    v.add(0, -0.3, -4.6, skinD2); v.add(0, -0.5, -4.9, skinD2); v.add(0, -0.6, -5.1, skinD2);  // tail taper
  });
  // blunt head with a sucker mouth + tiny eyes on top
  part('head', 0, 0.14, 0.34, (v) => {
    v.ellip(0, 0, 0, 1.0, 0.9, 1.1, skin);
    v.fill(-0.7, -0.5, 0.6, 0.7, 0.1, 1.2, sucker);   // mouth sucker
    v.add(-0.5, 0.6, 0.5, eye); v.add(0.5, 0.6, 0.5, eye);
    v.add(-0.7, -0.6, 0.8, skinD); v.add(0.7, -0.6, 0.8, skinD);
  });
  // stubby waddle feet + tiny side nubs (anim contract needs the full set)
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.14, 0.1, -0.1, (v) => {
    v.fill(0, -1, 0, 0, 0, 1, skinD); v.add(0, -2, 1, skinD2);
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.12, 0.12, 0.3, (v) => {
    v.fill(0, -1, 0, 0, 0, 0, skinD); v.add(0, -2, 1, skinD2);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.12, 0.05, 0.34, (v) => { v.add(0, 0, 0, skinD); });

  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.1, torso: 0.12, head: 0.14, eye: 0.16, hair: 0.12, arm: 0.1, hand: 0.05, weapon: 0.14 },
  };
}

function buildBlobRig(scheme: CharacterScheme): Rig {
  const C = 0.075;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const skin = scheme.skin, skinHI = shade(skin, 1.22), skinD = shade(skin, 0.8), spot = scheme.accent, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: Build) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  // a wide, wobbly dome — mold green with spotty mottling
  part('torso', 0, 0.12, 0, (v) => {
    v.ellip(0, 0, 0, 2.6, 1.7, 2.6, skin);
    v.ellip(0, 0.9, -0.3, 1.7, 0.9, 1.7, skinHI);     // shiny cap
    v.add(-1.6, 0.4, 0.4, spot); v.add(1.4, 0.2, -0.8, spot); v.add(-0.6, -0.2, 1.7, spot); v.add(1.0, 0.8, 1.2, spot);
    v.add(0.2, -0.5, -1.8, spot); v.add(-1.8, -0.4, -0.6, spot);   // mold spots
    v.fill(-2.0, -1.2, -2.0, 2.0, -1.0, 2.0, skinD);  // slump ring at the base
  });
  // googly-eye lump on the front-top
  part('head', 0, 0.16, 0.4, (v) => {
    v.ellip(0, 0, 0, 1.2, 1.0, 1.2, skin);
    v.add(-0.7, 0.5, 1.2, eye); v.add(0.7, 0.5, 1.2, eye);
    v.add(-0.7, 0.7, 1.2, 0xffffff); v.add(0.7, 0.7, 1.2, 0xffffff);  // highlights
  });
  // tiny foot nubs + side nubs (anim contract needs the full part set)
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.3, 0.1, 0.1, (v) => {
    v.fill(0, -1, 0, 0, 0, 1, skinD); v.add(0, -2, 1, skinD);
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.34, 0.1, 0.2, (v) => {
    v.fill(0, -1, 0, 0, 0, 1, skinD); v.add(0, -2, 1, skinD);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.34, 0.04, 0.24, (v) => { v.add(0, 0, 0, skinD); });

  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.1, torso: 0.12, head: 0.16, eye: 0.2, hair: 0.14, arm: 0.1, hand: 0.05, weapon: 0.16 },
  };
}

// ── floor 49 — fungal grotto monsters ───────────────────────
// All four follow the anim contract (full part set: torso/head/legL/legR/
// armL/armR/handL/handR) so the shared updateRig solver, ragdoll death and
// revive-reset all work unchanged. Mushrooms + frogs carry the `hop` flag
// for a squash-and-stretch hop in updateRig; crawlers waddle like the leech.

function buildMushroomRig(scheme: CharacterScheme): Rig {
  const C = 0.075;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const skin = scheme.skin, skinD = shade(skin, 0.7), skinHi = mix(skin, 0xffffff, 0.5);
  const cap = scheme.cloth, capD = shade(cap, 0.65), capHi = mix(cap, 0xffffff, 0.5);
  const stem = scheme.accent, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: Build) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  // stalk + big wobbly cap — reads as a walking mushroom, not a blob
  part('torso', 0, 0.3, 0, (v) => {
    v.col(0, 0, 0, 6, 1.7, 1.7, stem);                 // stem
    v.col(0, 0, 0, 2, 2.2, 2.2, shade(stem, 0.8));      // bulbous foot
    v.ellip(0, 8, 0, 4.4, 3.2, 4.4, capD);          // cap dome
    v.ellip(0, 10, 0, 3.6, 2.2, 3.6, cap);
    v.ellip(0, 12, 0, 2.6, 1.2, 2.6, capHi);        // shiny top
    // gill skirt under the cap
    for (let a = 0; a < 14; a++) {
      const aa = (a / 14) * Math.PI * 2;
      v.add(Math.round(Math.cos(aa) * 3.6), 6, Math.round(Math.sin(aa) * 3.6), mix(cap, 0xffffff, 0.3));
    }
    // glowing spots on the cap
    for (let s = 0; s < 5; s++) v.add(Math.round((s - 2) * 1.4), 9, Math.round(Math.sin(s * 2.7) * 2.4), skinHi);
  });
  // a worried little face on the cap front
  part('head', 0, 0.34, 0.5, (v) => {
    v.add(-1.4, 1, 2.2, eye); v.add(1.4, 1, 2.2, eye);   // eyes
    v.add(-1.4, 2, 2.2, 0xffffff); v.add(1.4, 2, 2.2, 0xffffff);
    v.add(0, 0, 2.6, eye);                              // small frown mouth
    v.add(-1, -1, 2.2, skinD); v.add(1, -1, 2.2, skinD); // cheeks
  });
  // tiny stubby feet + nub arms (the waddle)
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.3, 0.1, -0.1, (v) => {
    v.fill(0, -1, 0, 0, 0, 1, skinD); v.add(0, -2, 1, shade(skinD, 0.7));
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.4, 0.28, 0.1, (v) => {
    v.fill(0, -1, 0, 0, 0, 1, skinD); v.add(0, -2, 1, skinD);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.4, 0.1, 0.14, (v) => { v.add(0, 0, 0, skinD); });

  group.userData.hop = true;
  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.1, torso: 0.3, head: 0.34, eye: 0.4, hair: 0.34, arm: 0.28, hand: 0.1, weapon: 0.34 },
  };
}

function buildCrawlerRig(scheme: CharacterScheme): Rig {
  const C = 0.075;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const skin = scheme.skin, skinD = shade(skin, 0.78), skinD2 = shade(skin, 0.6);
  const vine = scheme.cloth, vineHi = mix(vine, 0xffffff, 0.5), eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: Build) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  // a segmented vine-worm, low to the ground (like the leech but leafy)
  part('torso', 0, 0.12, 0, (v) => {
    v.ellip(0, 0, 0, 1.3, 0.9, 4.4, skin);
    v.ellip(0, -0.5, 0.7, 1.0, 0.35, 3.4, vine);        // pale vine underbelly
    for (let z = -3; z <= 3; z++) v.fill(-1, 0.4, z, 1, 0.8, z, skinD);  // segments
    v.add(0, -0.2, -4.8, skinD2); v.add(0, -0.4, -5.1, skinD2);
    // little leaves along the back
    for (let z = -2; z <= 2; z += 2) { v.add(-1, 0.9, z, vineHi); v.add(1, 0.9, z, vineHi); }
  });
  part('head', 0, 0.14, 0.36, (v) => {
    v.ellip(0, 0, 0, 1.0, 0.85, 1.1, skin);
    v.fill(-0.7, -0.4, 0.7, 0.7, 0.1, 1.3, vine);       // mouth
    v.add(-0.5, 0.5, 0.6, eye); v.add(0.5, 0.5, 0.6, eye);
    v.add(-0.6, 0.8, 0.3, vineHi); v.add(0.6, 0.8, 0.3, vineHi);  // antennae leaves
  });
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.16, 0.1, -0.1, (v) => {
    v.fill(0, -1, 0, 0, 0, 1, skinD); v.add(0, -2, 1, skinD2);
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.14, 0.12, 0.3, (v) => {
    v.fill(0, -1, 0, 0, 0, 1, skinD); v.add(0, -2, 1, skinD2);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.14, 0.05, 0.34, (v) => { v.add(0, 0, 0, skinD); });

  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.1, torso: 0.12, head: 0.14, eye: 0.16, hair: 0.12, arm: 0.1, hand: 0.05, weapon: 0.14 },
  };
}

function buildFishRig(scheme: CharacterScheme): Rig {
  const C = 0.075;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const skin = scheme.skin, skinD = shade(skin, 0.7), belly = scheme.cloth, fin = scheme.accent, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: Build) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  // sleek cave fish — body + tail sweep in one torso piece
  part('torso', 0, 0.14, 0, (v) => {
    v.ellip(0, 0, 0, 2.2, 1.5, 3.4, skin);
    v.ellip(0, -0.6, 0.4, 1.7, 0.7, 2.6, belly);
    // tail fin sweeping back
    for (let z = -3; z >= -6; z--) {
      const w = 1 + (z + 6) * 0.35;
      for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) v.add(x, Math.round((z + 6) * 0.4), z, fin);
    }
    // dorsal fin
    for (let y = 1; y <= 3; y++) for (let x = -1; x <= 1; x++) v.add(x, y, -1, fin);
    // glowing side stripe
    for (let z = 0; z <= 3; z++) v.add(0, 0, z, mix(skin, 0xffffff, 0.55));
  });
  part('head', 0, 0.14, 0.36, (v) => {
    v.ellip(0, 0, 0, 1.5, 1.3, 1.3, skin);
    v.add(-0.8, 0.3, 1.2, eye); v.add(0.8, 0.3, 1.2, eye);
    v.add(0, -0.6, 1.2, 0x2a2020);                       // mouth
    v.add(-0.7, 0.7, 1.0, 0xffffff); v.add(0.7, 0.7, 1.0, 0xffffff);
  });
  // pectoral fins as arms, belly fins as legs
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.2, 0.08, -0.1, (v) => {
    v.fill(0, -1, 0, 0, 0, 1, fin); v.add(0, -2, 1, skinD);
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.3, 0.14, 0.2, (v) => {
    v.ellip(s * 1.5, 0, 0, 1.6, 0.5, 0.5, fin);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.3, 0.06, 0.24, (v) => { v.add(0, 0, 0, skinD); });

  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.08, torso: 0.14, head: 0.14, eye: 0.18, hair: 0.14, arm: 0.14, hand: 0.06, weapon: 0.14 },
  };
}

function buildFrogRig(scheme: CharacterScheme): Rig {
  const C = 0.075;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const skin = scheme.skin, skinD = shade(skin, 0.7), skinHi = mix(skin, 0xffffff, 0.4);
  const belly = scheme.cloth, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: Build) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  // crouched frog: wide body, big eyes, huge back legs
  part('torso', 0, 0.2, 0, (v) => {
    v.ellip(0, 2, 0, 3.4, 2.2, 3.4, skin);           // body
    v.ellip(0, 1, 1.2, 2.6, 1.4, 2.0, belly);        // pale belly
    v.ellip(0, 4, -0.6, 3.0, 1.4, 2.6, skinHi);      // back hump
    for (let s = 0; s < 6; s++) v.add(Math.round((s - 2.5) * 1.2), 1, Math.round(Math.sin(s * 1.9) * 2.4), skinD);
  });
  part('head', 0, 0.34, 0.5, (v) => {
    v.ellip(0, 1, 0, 3.0, 1.6, 1.6, skin);
    v.add(-1.8, 2.6, 1.2, eye); v.add(1.8, 2.6, 1.2, eye);  // bulging eyes
    v.add(-1.8, 3.6, 1.2, 0xffffff); v.add(1.8, 3.6, 1.2, 0xffffff);
    v.fill(-1.6, -0.6, 1.4, 1.6, 0.2, 2.4, shade(skinD, 0.8));  // wide mouth
    v.add(0, 0.4, 2.2, 0xffffff);                        // tongue tip
  });
  // huge haunch legs (folded for a jump), short front arms
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.8, 0.12, -0.6, (v) => {
    v.ellip(0, 1, 0, 1.8, 1.6, 1.8, skinD);
    v.fill(0, -1, 1, 0, 0, 2, skin);
    v.add(0, -2, 2.4, shade(skinD, 0.6));                // webbed foot
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.5, 0.2, 0.5, (v) => {
    v.fill(0, -1, 0, 0, 0, 1, skin); v.add(0, -2, 1, skinD);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.5, 0.08, 0.55, (v) => { v.add(0, 0, 0, skinD); });

  group.userData.hop = true;
  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.12, torso: 0.2, head: 0.34, eye: 0.4, hair: 0.34, arm: 0.2, hand: 0.08, weapon: 0.34 },
  };
}

function buildSkeletonRig(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  const C = 0.1;
  const SUB = 4;  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const bone = scheme.skin, boneD = shade(bone, 0.78), cloth = scheme.cloth, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: Build) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.12, 0.25, 0, (v) => {
    v.fill(0, -2, 0, 0, 2, 0, bone); v.add(0, 1, 0, boneD); v.add(0, -2, 1, boneD);   // femur + knee + foot
  });
  part('torso', 0, 0.78, 0, (v) => {
    v.fill(-2, 3, -1, 2, 3, 1, bone);                // clavicle / shoulders
    v.fill(0, -2, 0, 0, 3, 0, boneD);                // spine
    for (let r = 0; r < 3; r++) { v.fill(-2, r, 0, 2, r, 1, bone); v.add(0, r, 1, boneD); } // ribs
    v.fill(-2, -2, -1, 2, -2, 1, boneD);             // pelvis
    v.fill(-1, 3, -1, 1, 4, 1, boneD);               // neck column (so head sits clear of torso)
    v.fill(-2, 3, 1, 2, 4, 2, cloth);                // tattered cloak scrap
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.32, 0.8, 0, (v) => {
    v.fill(0, -2, 0, 0, 2, 0, bone); v.add(0, 0, 0, boneD);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.32, 0.52, 0.02, (v) => {
    v.add(0, 0, 0, bone); v.add(0, 0, 1, boneD); v.add(0, -1, 1, bone);
  });
  // head sits on the neck column (torso top ≈ 1.18): the old 5.8/5.84
  // values were stale (a different grid) and floated the skull ~4.5 units
  // above the body.
  part('head', 0, 1.28, 0, (v) => {
    v.fill(-2, -1, -2, 2, 1, 2, bone);               // cranium
    v.fill(-1, -1, 0, 1, -1, 2, boneD);              // jaw
    v.add(-1, 0, 3, 0x101014); v.add(1, 0, 3, 0x101014); // eye sockets
    v.add(0, -1, 3, 0x101014);                       // nasal cavity
  });
  const eyeMat = new THREE.MeshLambertMaterial({ color: eye, emissive: eye, emissiveIntensity: 0.9 });
  for (const [name, x] of [['eyeL', -0.1], ['eyeR', 0.1]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), eyeMat);
    m.position.set(x, 1.3, 0.24); m.castShadow = false; parts[name] = m; group.add(m);
  }
  if (weapon) {
    const wg = buildWeapon(weapon, scheme.accent, C, SUB);
    wg.position.set(0.36, 0.5, 0.08); wg.rotation.x = weapon === 'bow' ? 0 : 1.35;
    group.add(wg); parts.weapon = wg as unknown as THREE.Mesh; (wg as unknown as THREE.Object3D).userData.kind = weapon;
  }

  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.25, torso: 0.78, head: 1.28, eye: 1.3, hair: 1.4, arm: 0.8, hand: 0.52, weapon: 0.5 },
  };
}


//  but ~10× the voxels: rounded muscle, heavy brow, tusks, pointy
//  ears, loincloth, leather straps, glowing eyes. Boss (bulk>1)
//  gains horns + war-paint + bone pauldrons.
// ════════════════════════════════════════════════════════════════
function buildOrcRig(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  const model = orcModel(scheme, weapon ?? 'club');
  const C = model.cube;
  const SUB = 2;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};

  const meshFrom = (voxels: { x: number; y: number; z: number; c: number }[]): THREE.Mesh => {
    const v = new Vox(C, SUB);
    for (const p of voxels) v.add(p.x, p.y, p.z, p.c);
    return v.mesh();
  };

  // animated body parts (names/pivots match the chibi rig contract)
  for (const [name, part] of Object.entries(model.parts)) {
    const m = meshFrom(part.voxels);
    m.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);
    parts[name] = m;
    group.add(m);
  }

  // glowing emissive eyes
  const eyeMat = new THREE.MeshLambertMaterial({ color: model.eyes.color, emissive: model.eyes.color, emissiveIntensity: 0.9 });
  const eyeNames = ['eyeL', 'eyeR'] as const;
  model.eyes.positions.forEach((p, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.05), eyeMat);
    m.position.set(p[0], p[1], p[2]);
    m.castShadow = false;
    parts[eyeNames[i]] = m;
    group.add(m);
  });

  // held weapon (animated Group — kept in characters.ts for torch flame/orb)
  if (weapon) {
    const wg = buildWeapon(weapon, scheme.accent, 0.07, SUB);
    if (weapon === 'torch') { wg.position.set(0.42, 0.72, 0.1); wg.rotation.x = -0.12; }
    else { wg.position.set(0.42, 0.5, 0.1); wg.rotation.x = weapon === 'bow' ? 0 : 1.35; }
    group.add(wg);
    parts.weapon = wg as unknown as THREE.Mesh;
    (wg as unknown as THREE.Object3D).userData.kind = weapon;
  }

  group.scale.setScalar(scheme.bulk ?? 1);
  return { group, parts, anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 } };
}

// ─────────────────────────────────────────────────────────────
//  DISTINGUISHED TAVERN NPCS — wizard / barmaid / bouncer.
//  One compact, feature-driven humanoid builder re-used for all three
//  so each gets a CLEARLY different silhouette (not a Greg colour-swap):
//    wizard  → long robe, pointy star hat, white beard, holds a staff
//    barmaid → short dress + apron + hair bun, carries a tray
//    bouncer → bald dome, black bouncer vest, bulky (no tusks)
//  Uses the SAME part contract + pivots as buildPlayerRig, so updateRig()
//  animates sit / lie / drink / lunge identically.
// ─────────────────────────────────────────────────────────────
interface HumanoidFeat {
  robe?: boolean; dress?: boolean; beard?: boolean; hat?: boolean;
  bun?: boolean; bald?: boolean; apron?: boolean; vest?: boolean;
  stars?: boolean; tray?: boolean; leftHand?: boolean;
}
function buildHumanoidRig(scheme: CharacterScheme, weapon: WeaponKind | undefined, feat: HumanoidFeat): Rig {
  const C = C_DETAIL;
  const WC = C_NORMAL;
  const SUB = 1;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const skin = scheme.skin, skinD = shade(skin, 0.86), skinHL = shade(skin, 1.1);
  const cloth = scheme.cloth, clothD = shade(cloth, 0.85);
  const pant = scheme.accent, pantD = shade(pant, 0.8);
  const hairC = scheme.hair;
  const STAR = 0xf3c969, WHITE = 0xf2efe6, WHITED = 0xcfc9bd, VEST = 0x20232b;

  const LEG_X = 4, ARM_X = 10;
  const HIP_G = 34, TORSO_G = 45, ARM_G = 55, HAND_G = 31, HEAD_G = 64, HAIR_G = 66, EYE_G = 63, PAD_G = 56;
  const partInfo: Record<string, { cx: number; cy: number }> = {
    legL: { cx: -LEG_X, cy: HIP_G }, legR: { cx: LEG_X, cy: HIP_G },
    torso: { cx: 0, cy: TORSO_G },
    armL: { cx: -ARM_X, cy: ARM_G }, armR: { cx: ARM_X, cy: ARM_G },
    handL: { cx: -ARM_X, cy: HAND_G }, handR: { cx: ARM_X, cy: HAND_G },
    head: { cx: 0, cy: HEAD_G }, hair: { cx: 0, cy: HAIR_G },
  };
  const buckets: Record<string, Map<string, number>> = {};
  for (const k of Object.keys(partInfo)) buckets[k] = new Map();
  let cur: Map<string, number> = buckets.torso;
  const put = (x: number, y: number, z: number, c: number) =>
    cur.set(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`, c);
  const putM = (x: number, y: number, z: number, c: number) => { put(x, y, z, c); put(-x, y, z, c); };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, c);
  };
  const colf = (cx: number, cz: number, y0: number, y1: number, rx: number, rz: number, c: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dz = (z - cz) / rz;
          if (dx * dx + dz * dz <= 1.02) put(x, y, z, c);
        }
  };
  const ell = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number, inner = 0) => {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
      for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++)
        for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          const d = dx * dx + dy * dy + dz * dz;
          if (d <= 1.02 && d >= inner) put(x, y, z, c);
        }
  };

  // ── LEGS ──
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.legL : buckets.legR;
    const cx = s * LEG_X;
    if (feat.robe || feat.dress) {
      colf(cx, 0, 0, 34, 3, 3, cloth);                 // hidden inside the robe/dress
    } else {
      box(cx - 3, 0, -4, cx + 3, 2, 6, 0x3a2a1a);      // boot
      colf(cx, 0.5, 2, 34, 3.2, 3.4, pant);            // trouser leg
      for (let y = 4; y <= 33; y += 3) put(cx, y, 4, pantD);
    }
  }
  // robe and dress both fully enclose the legs — drop the hidden leg voxels so
  // they don't coincide with the robe/dress column (that overlap was
  // z-fighting on the wizard; on the barmaid the A-line skirt now reaches the
  // floor and hides them anyway).
  if (feat.robe || feat.dress) { buckets.legL.clear(); buckets.legR.clear(); }

  // ── TORSO ──
  cur = buckets.torso;
  if (feat.robe || feat.dress) {
    const top = feat.robe ? 56 : 44;
    for (let y = 0; y <= top; y++) {
      let rx: number, rz: number;
      if (feat.dress && y <= 33) {
        // full A-line skirt: a wide flared hem at the ankles tapering to a
        // fitted waist — covers BOTH legs entirely. The generous flare (plus
        // the hip band below) is what keeps it reading as a dress rather than
        // a rigid floor-to-chest pillar.
        const s = y / 33;                                       // 0 at hem, 1 at waist
        rx = 8.8 - 3.8 * s;                                     // 8.8 hem → 5.0 waist
        rz = 5.8 - 2.2 * s;                                     // 5.8 hem → 3.6 waist
      } else if (feat.dress && y <= 36) {
        // fitted hip band above the skirt seam so the hip bulge stays covered;
        // z is kept under 4 so the dark belt (z 4-5) reads cleanly on top.
        const t = (y - 34) / 2;                                 // 0 at hip, 1 at seam
        rx = 7.2 - 1.6 * t;                                     // 7.2 hip → 5.6 seam
        rz = 3.4;
      } else if (feat.robe && y <= 33) {
        // skirt below the belt: flares from the waist out to a wide hem at the feet
        const s = y / 33;                                       // 0 at feet, 1 at belt
        rx = 6.5 + 5.0 * (1 - s);                               // 5.5 at belt → 8.5 at feet
        rz = 6.5 + 5.7 * (1 - s);                               // 4.3 at belt → 6.0 at feet
      } else {
        rx = feat.robe ? 5.2 : 5.6 - y * 0.05;
        rz = feat.robe ? 4.2 : 4.0;
      }
      colf(0, 0, y, y, Math.max(2, rx), rz, (feat.dress || y >= 33) ? cloth : pant);
    }
  }
  for (let y = 37; y <= 55; y++) { const t = (y - 37) / 18; const hx = Math.round(7 + t * 1.8); for (let x = -hx; x <= hx; x++) for (let z = -5; z <= 5; z++) put(x, y, z, cloth); }
  box(-8, 33, 4, 8, 36, 5, 0x2a2018); put(0, 34, 5, 0xc9a94a);   // belt + buckle
  box(-11, 53, 0, 11, 56, 4, clothD);                              // shoulders
  colf(0, -1, 55, 58, 2.2, 2.0, skin);                            // neck
  if (feat.vest) for (let y = 37; y <= 54; y++) for (let x = -6; x <= 6; x++) for (let z = 3; z <= 5; z++) put(x, y, z, VEST);
  if (feat.vest) put(0, 45, 5, 0xc9a94a);
  if (feat.apron) for (let y = 37; y <= 50; y++) for (let x = -4; x <= 4; x++) for (let z = 4; z <= 5; z++) put(x, y, z, WHITE);
  if (feat.stars) for (const [sx, sy] of [[-3, 46], [3, 46], [0, 50], [-2, 52], [2, 52]] as const) { put(sx, sy, 6, STAR); put(sx, sy + 1, 6, STAR); }

  // ── ARMS ──
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.armL : buckets.armR;
    const cx = s * ARM_X;
    colf(cx, 0, 43, 55, 2.6, 2.6, feat.robe || feat.dress ? cloth : cloth);
    colf(cx, 0, 34, 42, 2.2, 2.3, skin);
    if (feat.vest) for (let y = 43; y <= 55; y++) for (let z = -2; z <= 2; z++) put(cx, y, z, VEST);
  }
  // ── HANDS ──
  for (const s of [-1, 1] as const) {
    cur = s < 0 ? buckets.handL : buckets.handR;
    const cx = s * ARM_X;
    ell(cx, 33, 0, 2.2, 2.4, 2.2, skin);
    for (let f = -1; f <= 1; f++) box(cx + f, 31, -1, cx + f, 33, 1, skin);
  }
  // ── HEAD + face ──
  cur = buckets.head;
  ell(0, HEAD_G, 0, 6, 8, 6, skin);
  ell(0, 58, 1, 4.5, 3.5, 5, skin);
  for (const s of [-1, 1]) { const ex = s * 3; box(ex - 1, 62, 5, ex + 1, 63, 6, skinD); put(ex, 63, 6, 0xf5f2ec); put(ex, 62, 6, 0x6b4426); }
  put(0, 60, 6, skinD); box(-2, 59, 6, 2, 59, 6, 0xb05a4a);
  if (feat.beard) for (let y = 54; y <= 58; y++) {
    const w = Math.max(0, Math.round((y - 54) * 0.9));   // narrow at chin tip, wider at the jaw
    const z = 6 + Math.round((58 - y) * 0.25);           // sits on the chin, in front of the face
    for (let x = -w; x <= w; x++) put(x, y, z, y >= 57 ? WHITE : WHITED);
  }
  // ── HAIR / HAT / BALD ──
  cur = buckets.hair;
  if (feat.bald) {
    // shiny bald dome — constrain to head ellipsoid surface so nothing floats above
    for (let y = 70; y <= 72; y++) for (let x = -3; x <= 3; x++) {
      const dx = x / 6, dy = (y - HEAD_G) / 8, dz = 3 / 6;
      if (dx * dx + dy * dy + dz * dz <= 1.02) put(x, y, 3, skinHL);
    }
  } else if (feat.hat) {
    box(-6, 64, -6, 6, 66, 6, clothD);                                   // brim
    for (let y = 66; y <= 82; y++) { const r = Math.max(1, Math.round(5 - (y - 66) * 0.28)); for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (x * x + z * z <= r * r + 1) put(x, y, z, cloth); }
    put(0, 82, 0, STAR); put(0, 80, 1, STAR); putM(0, 68, 7, STAR);
  } else if (feat.bun) {
    ell(0, 78, -2, 3, 3, 3, hairC);
    for (let y = 63; y <= 76; y++) { const w = Math.round(5 - (y - 63) * 0.2); for (let x = -w; x <= w; x++) for (let z = -5; z <= 1; z++) put(x, y, z, hairC); }
  } else {
    for (let y = 63; y <= 78; y++) { const w = Math.round(5 - (y - 63) * 0.2); for (let x = -w; x <= w; x++) for (let z = -5; z <= 1; z++) put(x, y, z, hairC); }
  }

  // ── de-dupe coincident voxels ──
  // Every part is a SEPARATE voxel mesh placed in the same world space, so if a
  // grid cell exists in two buckets the two coplanar cubes z-fight. The direction
  // of the de-dupe depends on which part should stay solid:
  if (feat.hat) {
    // Trim the upper skull (grid-y >= 65) so nothing pokes above the hat rim.
    // Keep the grid-y == 64 ring as a filler: with the hat raised 1 voxel
    // (hairYOffset = 0.11) the brim sits one voxel above the skull, and this ring
    // closes the seam — no gap below the brim, no coincident-cell z-fighting.
    for (const k of [...buckets.head.keys()]) {
      const gy = Number(k.split(',')[1]);
      if (gy >= 70) buckets.head.delete(k);
    }
  } else {
    // real hair is decorative and sits atop the skull, so drop the hair cell
    // wherever the head already fills it (head/skin wins). This removes the
    // barmaid/patron hair-head (and hair-face) flicker.
    for (const k of [...buckets.hair.keys()]) if (buckets.head.has(k)) buckets.hair.delete(k);
  }

  // ── build part meshes ──
  // torso / head / hair rigid; legs & arms are two-bone limbs (knee / elbow).
  for (const name of ['torso', 'head', 'hair'] as const) {
    const info = partInfo[name];
    const vo = new Vox(C, SUB);
    for (const [k, c] of buckets[name]) { const [gx, gy, gz] = k.split(',').map(Number); vo.add(gx - info.cx, gy - info.cy, gz, c, 0.035); }
    const m = vo.mesh(); m.position.set(info.cx * C, info.cy * C, 0); parts[name] = m; group.add(m);
  }
  const KNEE_G = 22, ELBOW_G = 43;
  for (const s of [-1, 1] as const) {
    const lm = buildLimb(s < 0 ? buckets.legL : buckets.legR, s * LEG_X, HIP_G, KNEE_G, C);
    parts[s < 0 ? 'legL' : 'legR'] = lm.upper; parts[s < 0 ? 'shinL' : 'shinR'] = lm.lower; group.add(lm.upper);
    const am = buildLimb(s < 0 ? buckets.armL : buckets.armR, s * ARM_X, ARM_G, ELBOW_G, C, s < 0 ? buckets.handL : buckets.handR, HAND_G);
    parts[s < 0 ? 'armL' : 'armR'] = am.upper; parts[s < 0 ? 'foreL' : 'foreR'] = am.lower;
    if (am.hand) parts[s < 0 ? 'handL' : 'handR'] = am.hand;
    if (am.wrist) parts[s < 0 ? 'wristL' : 'wristR'] = am.wrist;
    group.add(am.upper);
  }

  // ── held weapon OR tray ──
  if (feat.tray) {
    const tray = new THREE.Group();
    const tm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), new THREE.MeshLambertMaterial({ color: WHITE }));
    tray.add(tm);
    // voxel mug (replaces CylinderGeometry)
    const mug = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.1), new THREE.MeshLambertMaterial({ color: 0x8a5a2a }));
    mug.position.set(0.1, 0.09, 0.1); tray.add(mug);
    const handR = parts.handR as THREE.Mesh | undefined;
    if (handR) handR.add(tray); else group.add(tray);
  } else if (weapon) {
    const wg = buildWeapon(weapon, scheme.accent, WC);
    // staff grips through the palm: x nudged toward the body centre, z pulled back
    // so the shaft runs down through the hand rather than floating in front of it.
    const staffOffsetZ = feat.leftHand ? 1.5 * C : 5 * C;
    wg.position.set(0.03, (34 - HAND_G) * C, staffOffsetZ);
    wg.rotation.x = weapon === 'staff' ? 0 : (weapon === 'bow' || weapon === 'torch' ? -0.12 : 1.35);
    const hand = (feat.leftHand ? parts.handL : parts.handR) as THREE.Mesh | undefined;
    if (hand) hand.add(wg); else group.add(wg);
    parts.weapon = wg as unknown as THREE.Mesh; (wg as any).userData.kind = weapon;
  }

  group.scale.setScalar(scheme.bulk ?? 1);
  const rig: Rig = {
    group, parts,
    anim: { mode: 'idle', t: 0, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: HIP_G * C, torso: TORSO_G * C, head: HEAD_G * C, eye: EYE_G * C, hair: HAIR_G * C, arm: ARM_G * C, hand: HAND_G * C, weapon: 34 * C, pad: PAD_G * C, knee: KNEE_G * C, elbow: ELBOW_G * C, wrist: HAND_G * C },
  };
  buildHierarchy(rig);
  return rig;
}

export function buildCharacter(scheme: CharacterScheme, weapon?: WeaponKind): Rig {
  if (scheme.monster === 'rat') return buildRatRig(scheme);
  if (scheme.monster === 'bat') return buildBatRig(scheme);
  if (scheme.monster === 'skeleton') return buildSkeletonRig(scheme, weapon);
  if (scheme.monster === 'leech') return buildLeechRig(scheme);
  if (scheme.monster === 'blob') return buildBlobRig(scheme);
  if (scheme.monster === 'mushroom') return buildMushroomRig(scheme);
  if (scheme.monster === 'crawler') return buildCrawlerRig(scheme);
  if (scheme.monster === 'fish') return buildFishRig(scheme);
  if (scheme.monster === 'frog') return buildFrogRig(scheme);
  if (scheme.kind === 'wizard') return buildHumanoidRig(scheme, weapon, { robe: true, beard: true, hat: true, stars: true, leftHand: true });
  if (scheme.kind === 'barmaid') return buildHumanoidRig(scheme, weapon, { dress: true, apron: true, bun: true, tray: true });
  if (scheme.kind === 'bouncer') return buildHumanoidRig(scheme, weapon, { bald: true, vest: true });
  if (scheme.kind === 'barkeep') return buildHumanoidRig(scheme, weapon, { apron: true, bald: true });
  if (scheme.style === 'normal') return buildPlayerRig(scheme, weapon);
  if (scheme.orc) return buildOrcRig(scheme, weapon);
  return buildChibiRig(scheme, weapon);
}

/** Swap (or remove) the weapon held in the rig's hand. Pass null to unequip. */
export function setWeapon(rig: Rig, kind: WeaponKind | null, accent: number) {
  // remove existing weapon group
  const existing = rig.parts.weapon as unknown as THREE.Object3D | undefined;
  if (existing) {
    existing.parent?.remove(existing);
    existing.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    delete (rig.parts as { weapon?: THREE.Mesh }).weapon;
  }
  if (!kind) return;

  const detailed = !!rig.pivots;
  const C = detailed ? C_DETAIL : C_CHIBI;
  const WC = detailed ? C_NORMAL : C_CHIBI;
  const wg = buildWeapon(kind, accent, WC);
  if (detailed) {
    const handR = rig.parts.handR as THREE.Mesh | undefined;
    if (handR) {
      wg.position.set(0.03, ((rig.pivots!.weapon ?? 34 * C) / C - 31) * C, 5 * C);
      wg.rotation.x = kind === 'bow' || kind === 'torch' ? -0.12 : 1.35;
      handR.add(wg);
    } else {
      wg.position.set(10 * C + 0.03, (rig.pivots!.weapon ?? 28 * C), 5 * C);
      wg.rotation.x = kind === 'bow' || kind === 'torch' ? -0.12 : -0.6;
      rig.group.add(wg);
    }
  } else if (kind === 'torch') {
    wg.position.set(0.38, 0.72, 0.08); wg.rotation.x = -0.12;
    rig.group.add(wg);
  } else {
    wg.position.set(0.38, 0.5, 0.08); wg.rotation.x = kind === 'bow' ? 0 : 1.35;
    rig.group.add(wg);
  }
  rig.parts.weapon = wg as unknown as THREE.Mesh;
  (wg as unknown as THREE.Object3D).userData.kind = kind;
}

// ────── ANIMATION ──────
// Build the randomised crumple pose + initial impact velocities for a fresh
// corpse. Only targets parts that actually exist on the rig, so it works for
// player / chibi / orc rigs alike.
function initDeath(rig: Rig): DeathState {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const fwd = Math.random() < 0.6 ? 1 : -1;               // topple forward or backward
  const p = rig.parts;
  const d: DeathState = {
    gvx: fwd * rand(3.5, 6),                              // initial topple kick (rad/s)
    gvz: rand(-2, 2),
    gtx: fwd * (Math.PI / 2) * rand(0.86, 1.0),           // end lying on face/back
    gtz: rand(-0.6, 0.6),                                 // slight sideways lean
    gvy: 0,
    // The body topples about its feet (group origin sits at ground = baseY), so
    // it naturally comes to rest flat at ground level — only a small settle sink.
    gty: (rig.group.userData.baseY as number) - 0.06,
    pv: {}, pt: {},
    jelly: 0.2,
    impacted: false,
  };
  const set = (name: string, tx: number, ty: number, tz: number) => {
    if (!p[name]) return;
    d.pt[name] = new THREE.Vector3(tx, ty, tz);
    d.pv[name] = new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)); // impact jolt
  };
  // gravity-rest targets: limbs hang DOWN once the body is flat. A limb whose
  // free end points +Y (arms/fore/hand/head/hair) rests at π-gtx; one whose free
  // end points -Y (legs/shin) rests at -gtx. Small random variation keeps it organic.
  // gravity-rest targets. Limbs whose free end points -Y (legs, arms, hands)
  // hang straight down at world pitch 0 → local rest = -gtx. Limbs whose free
  // end points +Y (head, hair, hood) hang at world pitch π → local rest = π-gtx.
  const restArm = Math.PI - d.gtx, restLeg = -d.gtx;
  set('legL', restLeg + rand(-0.25, 0.25), rand(-0.3, 0.3), rand(0.2, 0.6));   // buckle + slight splay
  set('legR', restLeg + rand(-0.25, 0.25), rand(-0.3, 0.3), rand(-0.6, -0.2));
  set('shinL', restLeg + rand(-0.15, 0.15), rand(-0.2, 0.2), rand(-0.2, 0.2)); // lower leg flops
  set('shinR', restLeg + rand(-0.15, 0.15), rand(-0.2, 0.2), rand(-0.2, 0.2));
  set('armL', restLeg + rand(-0.25, 0.25), 0, rand(0.15, 0.5));                // rest near the body, hanging down
  set('armR', restLeg + rand(-0.25, 0.25), 0, rand(-0.5, -0.15));
  set('foreL', restLeg + rand(-0.15, 0.15), 0, rand(-0.2, 0.2));
  set('foreR', restLeg + rand(-0.15, 0.15), 0, rand(-0.2, 0.2));
  set('handL', restLeg + rand(-0.15, 0.15), 0, rand(0.1, 0.4));
  set('handR', restLeg + rand(-0.15, 0.15), 0, rand(-0.4, -0.1));
  set('head', restArm + rand(-0.3, 0.3), rand(-0.4, 0.4), rand(-0.5, 0.5));    // head lolls
  set('torso', rand(-0.18, 0.18), 0, rand(-0.22, 0.22));
  set('hair', restArm + rand(-0.25, 0.25), 0, rand(-0.25, 0.25));             // hair flops under gravity
  set('hood', restArm + rand(-0.2, 0.2), 0, 0);
  set('hoodTip', restArm + rand(-0.2, 0.2), 0, 0);
  set('padL', rand(0.15, 0.5), 0, rand(0.15, 0.5));
  set('padR', rand(0.15, 0.5), 0, rand(-0.5, -0.15));
  return d;
}

/** soft-body "passed out / lying down" pose — same spring collapse as death,
 *  but settles flat with splayed limbs and a gentle breathing wobble (it's a
 *  resting state, not a one-shot topple). */
function initCollapse(rig: Rig, lie: boolean): DeathState {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const p = rig.parts;
  const gtxSign = lie ? -1 : 1;                       // asleep → on back, passed-out → face down
  const d: DeathState = {
    gvx: rand(-1.5, 1.5),
    gvz: rand(-1, 1),
    gtx: gtxSign * Math.PI / 2 * rand(0.9, 1.0),      // lie flat
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
  // gravity-rest targets: limbs hang DOWN once the body is flat (see initDeath).
  const restArm = Math.PI - d.gtx, restLeg = -d.gtx;
  set('legL', restLeg + rand(-0.15, 0.15), rand(-0.25, 0.25), rand(0.2, 0.5));   // splayed + slack
  set('legR', restLeg + rand(-0.15, 0.15), rand(-0.25, 0.25), rand(-0.5, -0.2));
  set('shinL', restLeg + rand(-0.1, 0.1), 0, rand(-0.15, 0.15));
  set('shinR', restLeg + rand(-0.1, 0.1), 0, rand(-0.15, 0.15));
  set('armL', restLeg + rand(-0.15, 0.15), 0, rand(0.15, 0.45));                 // rest near body, hanging down
  set('armR', restLeg + rand(-0.15, 0.15), 0, rand(-0.45, -0.15));
  set('foreL', restLeg + rand(-0.1, 0.1), 0, rand(-0.2, 0.2));
  set('foreR', restLeg + rand(-0.1, 0.1), 0, rand(-0.2, 0.2));
  set('handL', restLeg + rand(-0.1, 0.1), 0, rand(0.1, 0.35));
  set('handR', restLeg + rand(-0.1, 0.1), 0, rand(-0.35, -0.1));
  set('head', restArm + rand(-0.2, 0.2), rand(-0.35, 0.35), rand(-0.5, 0.5));    // head lolls
  set('torso', rand(-0.12, 0.12), 0, rand(-0.18, 0.18));
  set('hair', restArm + rand(-0.15, 0.15), 0, rand(-0.2, 0.2));                 // hair flops under gravity
  set('hood', restArm + rand(-0.1, 0.1), 0, 0); set('hoodTip', restArm + rand(-0.1, 0.1), 0, 0);
  set('padL', rand(0.1, 0.4), 0, rand(0.1, 0.4)); set('padR', rand(0.1, 0.4), 0, rand(-0.4, -0.1));
  return d;
}

/**
 * Bake a pre-settled "passed out" pose onto a rig and pre-simulate it so it
 * renders as a calm heap from the very first frame (used by the loading
 * screen). Unlike {@link initDeath} / {@link initCollapse}, the leg + torso
 * targets are constrained so the body settles FLAT and SPLAYED — the torso
 * and the legs can never curl back onto each other into a "folded in half"
 * heap. The thighs are kept extended (resting flat along the ground, not
 * folded up toward the chest), the shins stay roughly in line with the
 * thighs, the arms rest out to the sides, and the head lolls gently.
 *
 * Must be called with the rig already placed (feet at the desired rest Y,
 * `rig.group.userData.baseY` set to that Y). Uses the engine's own collapse
 * solver (mode `'lie'`) so the group ends up lying flat on its back.
 */
/**
 * Bake a static "passed out flat on the back" pose directly onto the rig's
 * node rotations and switch the rig to `mode = 'idle'` so the per-frame pose
 * solver leaves it alone. This is NOT a ragdoll — there is no spring
 * simulation, no gravity pendulum, no crumple. The pose is just hand-keyed
 * flat-on-back angles and stays there forever (the caller doesn't need to
 * call `updateRig`).
 *
 * Why static instead of the collapse solver? The collapse solver targets the
 * limbs' world-pitch at zero gravity-rest, which when the body lies on its
 * back (group.rotation.x = -π/2) means the thighs would target local x = π/2
 * — i.e. the legs point STRAIGHT UP from the hip, and any spring over-/
 * undershoot from there collapses the leg back over the torso. Hand-keying
 * the local rotations bypasses the solver entirely and gives the reliable
 * "drunk sprawled on the cobbles" pose the loading screen wants.
 */
export function bakePassedOut(rig: Rig): void {
  const p = rig.parts;
  // Lie flat on the back. Small per-instance variation so successive loads
  // don't all look identical, but kept tiny (±0.04 rad ≈ 2.3°) so the body
  // never tips onto its side or rolls over.
  rig.group.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.08;
  rig.group.rotation.z = (Math.random() - 0.5) * 0.08;
  rig.group.rotation.y = 0;
  rig.group.position.y = (rig.group.userData.baseY as number) ?? rig.group.position.y;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const set = (name: string, x: number, y: number, z: number) => {
    const m = p[name]; if (!m) return;
    m.rotation.set(x, y, z);
  };
  // Joint angles come from the `loading_passout` entry in POSE_PRESETS so
  // the pose editor (?pose) becomes the single source of truth: tweak a joint
  // in the editor → reload the game → the loading screen reflects it.
  const preset = POSE_PRESETS.find((x) => x.name === 'loading_passout')?.joints;
  if (preset) {
    // Torso first so head/hair/arm conversion (flat→local) is consistent.
    if (p.torso && preset.torso) p.torso.rotation.set(preset.torso.x, preset.torso.y, preset.torso.z);
    const tx = p.torso ? p.torso.rotation.x : 0;
    const ty = p.torso ? p.torso.rotation.y : 0;
    const tz = p.torso ? p.torso.rotation.z : 0;
    const isTorsoChild = (n: string) => n === 'head' || n === 'hair' || n === 'hood' || n === 'hoodTip' || n === 'armL' || n === 'armR';
    for (const name of Object.keys(preset)) {
      if (name === 'torso') continue;
      const obj = p[name]; if (!obj) continue;
      const j = preset[name];
      const c = isTorsoChild(name);
      obj.rotation.set(c ? j.x - tx : j.x, c ? j.y - ty : j.y, c ? j.z - tz : j.z);
    }
  } else {
    // Preset missing — fall back to the original hard-coded pose so the
    // loading screen still renders something sensible.
    set('legL', 0, 0, rand(0.18, 0.30));
    set('legR', 0, 0, rand(-0.30, -0.18));
    set('shinL', rand(0.05, 0.18), 0, 0);
    set('shinR', rand(0.05, 0.18), 0, 0);
    set('armL', 0, 0, rand(1.05, 1.25));
    set('armR', -Math.PI / 2, 0, rand(-0.15, 0.15));
    set('foreL', rand(-0.30, -0.10), 0, 0);
    set('foreR', rand(0.85, 1.05), 0, 0);
    set('handL', rand(-0.20, 0.05), 0, 0);
    set('handR', rand(-0.20, 0.05), 0, 0);
    set('torso', rand(-0.04, 0.04), 0, rand(-0.04, 0.04));
    const headYaw = (Math.random() < 0.5 ? -1 : 1) * rand(0.45, 0.75);
    set('head', 0, headYaw, 0);
    set('hair', 0, headYaw * 0.6, 0);
  }
  if (p.hood) set('hood', 0, 0, 0);
  if (p.hoodTip) set('hoodTip', 0, 0, 0);
  // Pads (shoulder pads on the player rig) follow the arms.
  set('padL', 0, 0, 1.15);
  set('padR', 0, 0, -1.15);
  // Lock the rig in the 'idle' rest branch with NO death state — this
  // guarantees `updateRig` will never touch the rotations again as long as
  // the caller doesn't switch the mode or call updateRig.
  rig.anim.death = undefined;
  rig.anim.mode = 'idle';
  rig.anim.t = 0;
  rig.anim.crouch = 0;
  rig.anim.flinch = 0;
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

  // 'getup': a short "crawl → kneel → stand" rise from the flat baked pose.
  // Drives the whole-body pitch back to upright with an easing curve and a
  // subtle overshoot, while the legs tuck then straighten and the head rises
  // last — a proper, readable get-up instead of an instant teleport upright.
  if (a.mode === 'getup') {
    const d = a.death;
    if (d) { a.death = undefined; rig.group.rotation.z = 0; }
    const t0 = a.getupStart ?? (a.getupStart = a.t);
    const T = Math.min(1, (a.t - t0) / 0.9);          // ~0.9s full rise
    const ease = 1 - Math.pow(1 - T, 3);              // cubic ease-out
    // whole body rotates from flat (-π/2) to upright (0)
    rig.group.rotation.x = -Math.PI / 2 * (1 - ease);
    rig.group.rotation.z *= (1 - ease);
    // sink then rise: deep crouch at the start, back to standing height
    const sink = Math.sin(Math.min(1, T * 1.4) * Math.PI) * 0.22;
    const HIP2 = P?.hip ?? 0.25;
    const yOff = -sink * HIP2 * 0.9;
    const baseY = (rig.group.userData.baseY as number) ?? rig.group.position.y;
    rig.group.position.y = baseY + yOff;
    // limbs: legs tuck while down, straighten as we rise; arms brace then drop
    const legBend = (1 - ease) * 1.3;
    const armBrace = Math.sin(Math.min(1, T * 1.1) * Math.PI) * 0.9;
    if (p.legL) p.legL.rotation.set(-legBend * 1.1, 0, 0);
    if (p.legR) p.legR.rotation.set(-legBend * 1.1, 0, 0);
    if (p.shinL) p.shinL.rotation.x = (1 - ease) * 1.2;
    if (p.shinR) p.shinR.rotation.x = (1 - ease) * 1.2;
    if (p.armL) p.armL.rotation.set(-armBrace * 0.8, 0, armBrace * 0.25);
    if (p.armR) p.armR.rotation.set(-armBrace * 0.8, 0, -armBrace * 0.25);
    if (p.foreL) p.foreL.rotation.x = -armBrace * 0.7;
    if (p.foreR) p.foreR.rotation.x = -armBrace * 0.7;
    if (p.handL) p.handL.rotation.set(0, 0, 0);
    if (p.handR) p.handR.rotation.set(0, 0, 0);
    if (p.head) p.head.rotation.set((1 - ease) * -0.25, 0, 0); // head lolls then levels
    if (p.torso) p.torso.rotation.set((1 - ease) * 0.3, 0, 0); // slight forward lean
    if (p.hair) p.hair.rotation.set(0, 0, 0);
    if (p.hood) p.hood.rotation.set(0, 0, 0);
    if (p.hoodTip) p.hoodTip!.rotation.set(0, 0, 0);
    a.crouch = 0; a.flinch = 0;
    // settle into full standing when done (caller flips to 'idle')
    a.bob = 0;
    return;
  }

  if (a.mode === 'dead' || a.mode === 'floor' || a.mode === 'lie') {
    const d = a.death ?? (a.death = (a.mode === 'dead' ? initDeath(rig) : initCollapse(rig, a.mode === 'lie')));
    const g = rig.group;
    const h = Math.min(dt, 1 / 30);                       // clamp step for stability
    const STIFF = 130, DAMP = 13;                         // under-damped → soft overshoot
    // whole-body topple + sink to the floor
    [g.rotation.x, d.gvx] = springStep(g.rotation.x, d.gtx, d.gvx, h, STIFF, DAMP);
    [g.rotation.z, d.gvz] = springStep(g.rotation.z, d.gtz, d.gvz, h, STIFF, DAMP);
    if (a.mode === 'dead') {
      [g.position.y, d.gvy] = springStep(g.position.y, d.gty, d.gvy, h, 90, 16);
      if (!d.impacted && Math.abs(g.rotation.x) >= Math.abs(d.gtx) * 0.7) d.impacted = true;
    }
    // per-joint crumple. On hierarchical rigs head/hair/hood/arms are children
    // of the torso, so their flat (world) target must be converted to local by
    // subtracting the torso's current pitch. Process torso first so its value
    // is up to date for the children.
    const hierD = !!rig.group.userData.hierarchyBuilt;
    const torsoChild = (n: string) => n === 'head' || n === 'hair' || n === 'hood' || n === 'hoodTip' || n === 'armL' || n === 'armR';
    if (hierD && p.torso && d.pt.torso) {
      const tv = d.pv.torso;
      [p.torso.rotation.x, tv.x] = springStep(p.torso.rotation.x, d.pt.torso.x, tv.x, h, STIFF, DAMP);
      [p.torso.rotation.y, tv.y] = springStep(p.torso.rotation.y, d.pt.torso.y, tv.y, h, STIFF, DAMP);
      [p.torso.rotation.z, tv.z] = springStep(p.torso.rotation.z, d.pt.torso.z, tv.z, h, STIFF, DAMP);
    }
    const torsoPitch = hierD && p.torso ? p.torso.rotation.x : 0;
    const gx = g.rotation.x;                       // body topple angle
    const GRAV = 9;                                // limbs (and hair) swing down under gravity
    // -Y limbs (legs, arms, hands) hang at world pitch 0; +Y limbs (hair) at π.
    const limbSign = (n: string) => (n.startsWith('leg') || n.startsWith('shin') || n.startsWith('arm') || n.startsWith('fore') || n.startsWith('hand')) ? -1 : 1;
    for (const name in d.pt) {
      if (hierD && name === 'torso') continue;   // already handled above
      const m = p[name]; if (!m) continue;
      const t = d.pt[name], v = d.pv[name];
      const lx = hierD && torsoChild(name) ? t.x - torsoPitch : t.x;
      [m.rotation.x, v.x] = springStep(m.rotation.x, lx, v.x, h, STIFF, DAMP);
      [m.rotation.y, v.y] = springStep(m.rotation.y, t.y, v.y, h, STIFF, DAMP);
      [m.rotation.z, v.z] = springStep(m.rotation.z, t.z, v.z, h, STIFF, DAMP);
      // gravity pendulum: pull each limb's WORLD pitch toward hanging straight
      // down (no sticking-up poses). +Y limbs (arms/hair) rest at world π,
      // -Y limbs (legs) at world 0; torque ∝ sin(worldPitch).
      if (name === 'legL' || name === 'legR' || name === 'shinL' || name === 'shinR' ||
          name === 'armL' || name === 'armR' || name === 'foreL' || name === 'foreR' ||
          name === 'handL' || name === 'handR' || name === 'hair') {
        const worldX = (hierD && torsoChild(name)) ? gx + torsoPitch + m.rotation.x : gx + m.rotation.x;
        v.x += limbSign(name) * GRAV * Math.sin(worldX) * h;
      }
    }
    // squash-and-stretch: decaying jiggle on death, gentle breathing when passed out
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

  rig.group.rotation.x = 0;
  const walking = a.mode === 'walk';
  const w = walking ? Math.sin(a.t * 11) : 0;
  // idle breathing: half the original speed (1.1 vs 2.2) with a per-rig random
  // phase so NPCs don't bop in lockstep. Lazily initialised on first frame.
  if (a.phase === undefined) a.phase = Math.random() * Math.PI * 2;
  const ph = a.phase;
  const idle = Math.sin((a.t + ph) * 1.1);

  // crouch pose: hips sink deep, knees bend, torso hunches forward, and the
  // forearms come up in a guarded sneaking stance (a proper low crouch rather
  // than a stiff lean). Feet stay planted.
  const cr = a.crouch ?? 0;
  const HIP = P?.hip ?? 0.25;
  let DROP = cr * 0.34;                                  // world units the hips sink
  let legScaleY = HIP > 0 ? Math.max(0.5, 1 - DROP / HIP) : 1;

  // base limb targets (idle / walk)
  let legLX = w * 0.75, legRX = -w * 0.75;
  let armLX = -w * 0.6 + idle * 0.05 + cr * 0.6;
  let armRX = w * 0.6 + idle * 0.05 + cr * 0.6;
  let torsoX = cr * 0.42, headX = -cr * 0.28;
  let hipY = HIP - DROP;
  const hasKnee = !!P && !!p.shinL;                       // two-bone limbs (player / NPC)
  let kneeL = 0.15 + cr * 0.5, kneeR = 0.15 + cr * 0.5;  // deep knee bend in crouch
  let elbowL = 0.2 + cr * 0.5, elbowR = 0.2 + cr * 0.5;  // forearms up, guarded
  let armLZ = 0, armRZ = 0;                                     // upper-arm lateral rotation (swings arm across the body)
  if (cr > 0) { armLZ = -cr * 0.35; armRZ = cr * 0.35; }        // tuck forearms in while crouching
  let elbowLZ = 0, elbowRZ = 0;                                 // elbow lateral (rotates the forearm across the chest)
  let wristL = 0, wristR = 0;                                   // wrist rotation (crossed-arms pose)
  // full 3-axis support (populated by pose presets / pose editor snippets)
  let torsoY = 0, torsoZ = 0, headY = 0, headZ = 0;
  let armLY = 0, armRY = 0, elbowLY = 0, elbowRY = 0;
  let wristLY = 0, wristLZ = 0, wristRY = 0, wristRZ = 0;
  let legLY = 0, legLZ = 0, legRY = 0, legRZ = 0;
  let kneeLY = 0, kneeLZ = 0, kneeRY = 0, kneeRZ = 0;
  let hipRotX = 0, hipRotY = 0, hipRotZ = 0;               // hip: rotates both legs together relative to torso

  // ── drink_anim: Greg's keyframed drinking animation (raise → sip → lower) ──
  // playClipOnRig writes all joint rotations directly from the clip; we set up
  // the sitting hip-sink (DROP) and apply the position cascading that depends
  // on it, then return early (skipping the pose-preset chain + rotation
  // application, which would overwrite the clip's rotations).
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

    // hip pivot sinks with DROP (legs ride it on hierarchical rigs)
    if (p.hip && p.hip.userData.baseY !== undefined) p.hip.position.y = p.hip.userData.baseY - DROP;
    if (!hasKnee) { p.legL.scale.y = legScaleY; p.legR.scale.y = legScaleY; }
    if (!hierD) { p.legL.position.y = hipY; p.legR.position.y = hipY; }

    // torso pivot sinks with DROP; breathing scale
    if (hierD && p.torso.userData.baseY !== undefined) p.torso.position.y = p.torso.userData.baseY + bob - DROP;
    else p.torso.position.y = (P?.torso ?? 0.78) + bob - DROP;
    p.torso.scale.y = 1 + idle * 0.02;

    // head/hair/hood ride the torso on hierarchical rigs (positions only;
    // rotations were set by playClipOnRig with flat→local conversion)
    if (hierD) {
      if (p.head.userData.baseY !== undefined) p.head.position.y = p.head.userData.baseY + hy;
      if (p.hair && p.hair.userData.baseY !== undefined) p.hair.position.y = p.hair.userData.baseY + (a.hairYOffset ?? 0);
    } else {
      p.head.position.y = (P?.head ?? 1.28) + bb - DROP + hy;
      p.armL.position.y = (P?.arm ?? 0.8) + bob - DROP;
      p.armR.position.y = (P?.arm ?? 0.8) + bob - DROP;
    }
    // eyes are group children (not reparented), so keep their absolute Y in sync
    const EO = P?.eye ?? 1.3;
    if (p.eyeL) { p.eyeL.position.y = EO + bb - DROP + hy; p.eyeR.position.y = EO + bb - DROP + hy; }

    // weapon: keep a staff upright if present (Greg has none in the cutscene)
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
    // Zero all pose-specific variables so unset ones don't keep stale defaults
    // (elbow=0.2, knee=0.15).  This makes the game + pose editor consistent
    // (both treat unset joints as zero).
    armLZ = 0; armRZ = 0;
    elbowL = 0; elbowR = 0;
    elbowLZ = 0; elbowRZ = 0;
    wristL = 0; wristR = 0;
    kneeL = 0; kneeR = 0;
    if (a.mode === 'sit') {                                 // left arm rests forward on the table (mug in hand)
      DROP += 0.20; legScaleY = Math.max(0.5, 1 - DROP / HIP);
      armLX = -1.35; armRX = -0.452;
      armRZ = 0.048;
      legLX = -1.492; legRX = -1.702;
      torsoX = 0.06; headX = -0.05; hipY = HIP - 0.22;
      kneeL = 1.368; kneeR = 1.688;
      elbowL = 0.15; elbowR = 0.128;
      elbowRZ = 0.148;
    } else if (a.mode === 'drink') {                        // raise the tankard (left hand) to the mouth
      DROP += 0.20; legScaleY = Math.max(0.5, 1 - DROP / HIP);
      armLX = -1.342; armLZ = -0.152; armRX = -0.452; armRZ = 0.048;
      headX = -0.05; torsoX = 0.06; hipY = HIP - 0.22;
      legLX = -1.492; legRX = -1.702; kneeL = 1.368; kneeR = 1.688;
      elbowL = -1.192; elbowLZ = 0.998; elbowR = 0.128; elbowRZ = 0.148;
    } else if (a.mode === 'crack') {                         // crack knuckles — fists meet at the chest, pumping
      torsoX = 0.06; headX = -0.05;
      armLX = -0.732; armLZ = -0.192; armRX = -1.552; armRZ = -0.212;
      elbowL = -1.3; elbowR = -0.842;
    } else if (a.mode === 'cross') {                         // arms folded across the chest
    armLX = -1.032; armRX = -1.192;
    armLZ = 0.128;  armRZ = 0.088;
    elbowL = -0.972; elbowR = -1.162;
    elbowLZ = 1.128; elbowRZ = -1.682;
    wristL = -0.412; wristR = 0.198;
    torsoX = -0.006; headX = -0.02; hipY = HIP;
    } else if (a.mode === 'sit_cross') {                   // sitting on ground, legs crossed
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
    } else if (a.mode === 'sleep') {                       // sleeping / lying on the ground
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
    } else if (a.mode === 'point') {                       // pointing with right arm
      armRX = -1.422; armRZ = -0.212;
      elbowL = -0.732; elbowLZ = -0.062;
    } else if (a.mode === 'wipe') {                        // barkeep wiping the counter in circles
      // deep lean forward & down so the hand reaches the counter surface
      torsoX = 0.55; headX = -0.35;
      // circular wipe driven by the LEFT arm (the side facing the counter,
      // since the barkeep is rotated PI/2). The shoulder rotates in X (pitch)
      // and Z (yaw) to trace the wiping circle; the elbow bends to plant
      // the hand (with rag) on the counter surface.
      const wipeT = a.t * 2.5;                             // wipe speed (rad/s)
      const wipeR = 0.16;                                  // circle radius (rad)
      armLX = -1.40 ;//+ Math.sin(wipeT) * wipeR;             // shoulder pitch: forward/down circle
      armLZ = -0.0 + Math.cos(wipeT) * wipeR;   
      armLY = 0.55 + Math.sin(wipeT) * wipeR;           // shoulder yaw: left/right circle
      elbowL = 0.25 + Math.cos(wipeT) * 0.08;             // elbow bent more to drop forearm/hand onto counter
      elbowLZ = 0.95;
      wristL = 0.5; wristLZ = 0;                             // wrist stays loose (rag drags)
      // right arm rests
      armRX = 0.08; armRZ = -0.1; elbowR = -0.3;
    }
  // idle: arms hang slightly forward (~10°) rather than straight down
  if (a.mode === 'idle') { armLX -= 0.1745; armRX -= 0.1745; }
  // attack swing (combat) — layered on top of the idle/pose
  if (a.lunge > 0) {
    const L = Math.sin(a.lunge * Math.PI);
    armRX = -L * 2.4; torsoX -= L * 0.14;                 // lean into the strike
    if (a.mode === 'idle' || a.mode === 'walk') legRX = -w * 0.6 - L * 0.5;
    elbowR = -L * 0.6;
  }

  rig.group.rotation.x = 0;

  // hierarchical rigs have a unified skeleton (buildHierarchy); flat rigs
  // (chibi/bat/skeleton) keep absolute rotations about the rig origin.
  const hier = !!rig.group.userData.hierarchyBuilt;

  // ── hip: rotate both legs together relative to the torso ──
  if (p.hip) {
    p.hip.rotation.set(hipRotX, hipRotY, hipRotZ);
    // the hip pivot sinks with DROP (sitting / sleeping)
    if (p.hip.userData.baseY !== undefined) p.hip.position.y = p.hip.userData.baseY - DROP;
  }

  // ── legs: swing the thigh, then bend the knee (relative) ──
  p.legL.rotation.x = legLX; p.legR.rotation.x = legRX;
  p.legL.rotation.y = legLY; p.legR.rotation.y = legRY;
  p.legL.rotation.z = legLZ; p.legR.rotation.z = legRZ;
  if (hasKnee) {
    // walking knees: bend the leg that is swinging forward (lift the foot)
    if (walking) { kneeL = 0.25 + Math.max(0, -w) * 0.7; kneeR = 0.25 + Math.max(0, w) * 0.7; }
    if (a.crouch > 0) { kneeL = kneeR = 0.2 + a.crouch * 1.3; }   // sink by bending, not scaling
    p.shinL.rotation.x = kneeL; p.shinR.rotation.x = kneeR;
    p.shinL.rotation.y = kneeLY; p.shinR.rotation.y = kneeRY;
    p.shinL.rotation.z = kneeLZ; p.shinR.rotation.z = kneeRZ;
    // On hierarchical rigs the legs ride the hip pivot (set above); only set
    // absolute leg positions on flat rigs.
    if (!hier) { p.legL.position.y = hipY; p.legR.position.y = hipY; }
  } else {
    p.legL.scale.y = legScaleY; p.legR.scale.y = legScaleY;
    if (!hier) { p.legL.position.y = hipY + Math.max(0, w) * 0.06; p.legR.position.y = hipY + Math.max(0, -w) * 0.06; }
  }

  // ── arms: swing the upper arm, then bend the elbow (relative) ──
  // On hierarchical rigs the arm pivots are children of the torso, so their
  // flat (world-space) target must be converted to local by subtracting the
  // torso's pitch. Flat rigs (chibi/bat/skeleton) keep the absolute value.
  const armLocal = hier ? (v: number) => v - torsoX : (v: number) => v;
  p.armL.rotation.x = armLocal(armLX); p.armR.rotation.x = armLocal(armRX);
  p.armL.rotation.y = armLY; p.armR.rotation.y = armRY;
  p.armL.rotation.z = armLZ; p.armR.rotation.z = armRZ;
  if (hasKnee && p.foreL) {
    p.foreL.rotation.x = elbowL + (a.forearmLOffset ?? 0);
    p.foreR.rotation.x = elbowR + (a.forearmROffset ?? 0);
    p.foreL.rotation.y = elbowLY; p.foreR.rotation.y = elbowRY;
    p.foreL.rotation.z = elbowLZ; p.foreR.rotation.z = elbowRZ;
    // wizard: keep the held staff vertical by counter-rotating the wrist
    const wizL = a.forearmLOffset ? -(armLX + elbowL + a.forearmLOffset) : 0;
    const wizR = a.forearmROffset ? -(armRX + elbowR + a.forearmROffset) : 0;
    if (p.wristL) { p.wristL.rotation.x = wristL + wizL; p.wristL.rotation.y = wristLY; p.wristL.rotation.z = wristLZ; }
    if (p.wristR) { p.wristR.rotation.x = wristR + wizR; p.wristR.rotation.y = wristRY; p.wristR.rotation.z = wristRZ; }
    if (p.handL) p.handL.rotation.x = 0; if (p.handR) p.handR.rotation.x = 0;   // hands ride the wrist
  } else {
    p.handL.rotation.x = armLX; p.handR.rotation.x = armRX;
  }

  // membranous wings (bats): flap on Z about the shoulder pivot instead of swinging on X
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
        weapon.rotation.x = 0;   // a staff is held upright, independent of the arm swing
      } else {
        const weaponBase = wkind === 'torch' ? 0.4 : 1.35;   // blade points FORWARD (+Z)
        // armR.rotation.x is local to torso on hierarchical rigs, so add torsoX
        // back to recover the world arm pitch the weapon should swing with.
        const armWorldX = (hasKnee && p.foreR ? p.foreR.rotation.x + p.armR.rotation.x : p.armR.rotation.x) + (hier ? torsoX : 0);
        weapon.rotation.x = weaponBase + armWorldX * 0.9;
      }
    }

  // hop monsters (mushrooms, frogs): a bigger walk bounce + squash-and-stretch
  // so they read as hopping, not waddling. Idle keeps the gentle breathing bob.
  const hop = rig.group.userData.hop ? 2.4 : 1;
  const bob = walking ? Math.abs(Math.sin(a.t * 11)) * 0.07 * hop : idle * 0.02;
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
  const hy = a.headYOffset ?? 0;   // persistent head-nudge (editor)

  // ── positions ──
  // On hierarchical rigs the head/hair/hood/arm pivots are children of the
  // torso (or head) and were placed at their correct LOCAL offsets by
  // buildHierarchy. Overwriting them with the flat-rig absolute Y heights
  // (measured from the rig origin) would yank them out of place. So on
  // hierarchical rigs we only reposition the torso pivot (child of group) and
  // the legs (children of group); the nested children ride their parent.
  // The torso pivot sits at the hip joint (baseY), NOT the mesh centre (TO).
  if (hier && p.torso.userData.baseY !== undefined) {
    p.torso.position.y = p.torso.userData.baseY + bob - DROP;
  } else {
    p.torso.position.y = TO + bob - DROP;
  }
  p.torso.scale.y = 1 + (walking && rig.group.userData.hop ? Math.sin(a.t * 22) * 0.06 : idle * 0.02);
  p.torso.rotation.x = torsoX;                            // hunch / lean
  p.torso.rotation.y = torsoY;                            // torso twist
  p.torso.rotation.z = torsoZ;                            // torso side-lean
  if (hier) {
    // head/hair/hood follow the torso; only apply the persistent editor nudges
    // and the flat→local rotation conversion. Positions stay at their
    // buildHierarchy local Y (stored in userData.baseY) plus any world-space
    // nudge (headYOffset / hairYOffset).
    p.head.rotation.x = headX - torsoX;                   // keep eyes forward
    p.head.rotation.y = headY - torsoY;
    p.head.rotation.z = headZ - torsoZ;
    if (p.head.userData.baseY !== undefined) p.head.position.y = p.head.userData.baseY + hy;
    if (p.hair) {
      p.hair.rotation.set(0, 0, 0);
      if (p.hair.userData.baseY !== undefined) p.hair.position.y = p.hair.userData.baseY + (a.hairYOffset ?? 0);
    }
    if (p.hood) { p.hood.rotation.set(0, 0, 0); p.hoodTip!.rotation.set(0, 0, 0); }
    // eyes are NOT reparented (stay group children), so keep their absolute
    // positioning in sync with the head's world Y.
    if (p.eyeL) { p.eyeL.position.y = EO + bb - DROP + hy; p.eyeR.position.y = EO + bb - DROP + hy; }
  } else {
    p.head.position.y = HO + bb - DROP + hy;
    p.head.rotation.x = headX;                            // keep eyes forward
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

// ─────────────────────────────────────────────────────────────
// equipment — layer voxel clothing / armor / hats onto a rig
// ─────────────────────────────────────────────────────────────
// The player rig is built "naked" (briefs only). This module adds wearable
// pieces on top by attaching small voxel meshes to the correct rig part, so
// they follow the body's animation (boots track the feet, gloves the hands,
// a helmet the head, …). Each piece is tracked in `rig.equipped` so it can be
// removed later (unequip / unequipAll) — e.g. Greg is dressed for the tavern
// flashback, then stripped back to his underwear when he wakes in the dungeon.
// ─────────────────────────────────────────────────────────────

/** grid pivot (cx, cy) for every rig part, so equipment voxels built in the
 *  part's LOCAL space line up 1:1 with the body voxels that part was built from. */
export const PART_PIVOTS: Record<string, { cx: number; cy: number }> = {
  torso: { cx: 0, cy: 45 },
  head: { cx: 0, cy: 64 },
  hair: { cx: 0, cy: 66 },
  legL: { cx: -4, cy: 34 }, legR: { cx: 4, cy: 34 },
  shinL: { cx: -4, cy: 22 }, shinR: { cx: 4, cy: 22 },
  armL: { cx: -10, cy: 55 }, armR: { cx: 10, cy: 55 },
  foreL: { cx: -10, cy: 43 }, foreR: { cx: 10, cy: 43 },
  handL: { cx: -10, cy: 31 }, handR: { cx: 10, cy: 31 },
  wristL: { cx: -10, cy: 31 }, wristR: { cx: 10, cy: 31 },
};

export type EquipStyle =
  | 'shirt' | 'leather' | 'chain' | 'plate'
  | 'hood' | 'helm' | 'cap' | 'bucket'
  | 'pants' | 'greaves' | 'boots' | 'bracers' | 'cloak' | 'belt';

export interface EquipVisual {
  slot: EquipSlot;
  color: number;
  style?: EquipStyle;
  /** magic infusion — enchant or high rarity: gem/trim color + glow accent */
  magic?: { color: number; glow: boolean };
  /** tier-driven detail 1..3: 1 plain, 2 studs/rivets, 3 gold trim + gems */
  detail?: number;
}

/** '#ff7a1f' → 0xff7a1f */
export function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** unlit bright material for enchanted gems — reads as glowing + blooms */
function gemMat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(color), emissiveIntensity: 0.85 });
}

/** glowing gem cluster (1–3 bright cubes) at a piece-local grid position */
function addGem(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual, x: number, y: number, z: number) {
  if (!def.magic) return;
  const c = def.magic.color;
  v.add(x - piv.cx, y - piv.cy, z, c, 0.02);
  v.add(x - piv.cx, y - piv.cy + 1, z, shade(c, 1.35), 0.02);
  v.add(x - piv.cx, y - piv.cy - 1, z, shade(c, 0.65), 0.02);
}

/** gold trim colour used at detail 3 (brass fittings, buckles, crest trim) */
const TRIM_GOLD = 0xd8b13a;

function inRound(x: number, z: number, x0: number, z0: number, x1: number, z1: number, r: number): boolean {
  const cx0 = x0 + r, cx1 = x1 - r, cz0 = z0 + r, cz1 = z1 - r;
  let dx = 0, dz = 0;
  if (x < cx0) dx = x - cx0; else if (x > cx1) dx = x - cx1;
  if (z < cz0) dz = z - cz0; else if (z > cz1) dz = z - cz1;
  return dx * dx + dz * dz <= r * r + 0.3;
}

function ringShell(
  vox: Vox, piv: { cx: number; cy: number },
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number,
  color: number, skip?: (x: number, y: number, z: number) => boolean,
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (!inRound(x, z, x0, z0, x1, z1, r)) continue;
        if (skip && skip(x, y, z)) continue;
        const enclosed =
          inRound(x + 1, z, x0, z0, x1, z1, r) &&
          inRound(x - 1, z, x0, z0, x1, z1, r) &&
          inRound(x, z + 1, x0, z0, x1, z1, r) &&
          inRound(x, z - 1, x0, z0, x1, z1, r);
        if (enclosed) continue;
        vox.add(x - piv.cx, y - piv.cy, z, color, 0.02);
      }
    }
  }
}

function buildChest(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  const C = def.color;
  const dark = shade(C, 0.78);
  const lit = shade(C, 1.15);
  const det = def.detail ?? 1;
  for (let y = 34; y <= 57; y++) {
    const t = (y - 37) / 18;
    const hx = Math.round(7 + t * 1.8);
    let c = C;
    if (def.style === 'plate') c = y % 3 === 0 ? dark : (y === 57 ? lit : C);   // banded plates
    else if (def.style === 'chain') c = y % 2 === 0 ? C : dark;                 // fine mail rings
    else if (y === 57) c = lit;                                                 // cloth/leather hem highlight
    ringShell(v, piv, -hx - 2, y, -7, hx + 2, y, 7, 2, c);
  }
  if (def.style === 'plate') {
    for (const s of [-1, 1]) {
      // pauldron plates with a lit top edge
      ringShell(v, piv, s * 9, 52, -5, s * 12, 56, 5, 2, dark);
      ringShell(v, piv, s * 9, 57, -5, s * 12, 58, 5, 2, lit);
    }
  } else if (def.style === 'leather') {
    // stitching: a darker line down the front
    for (let y = 38; y <= 54; y++) for (let x = -1; x <= 1; x += 2) v.add(x, y, 7, dark, 0.04);
  }
  if (det >= 3) {
    // gold waist trim
    ringShell(v, piv, -hx(42) - 2, 42, -7, hx(42) + 2, 42, 7, 2, TRIM_GOLD);
  }
}

// hx at a given row (shared with the loop above)
function hx(y: number): number {
  const t = (y - 37) / 18;
  return Math.round(7 + t * 1.8);
}

function buildLegs(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  const C = def.color;
  const dark = shade(C, 0.75);
  const det = def.detail ?? 1;
  ringShell(v, piv, piv.cx - 5, 22, -5, piv.cx + 5, 34, 5, 2, def.color);
  // hem shading + knee studs
  ringShell(v, piv, piv.cx - 5, 33, -5, piv.cx + 5, 34, 5, 2, dark);
  if (det >= 2) {
    v.add(piv.cx - 3, 26, 5, dark, 0.04);
    v.add(piv.cx + 3, 26, 5, dark, 0.04);
  }
}

function buildBoots(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  const C = def.color;
  const dark = shade(C, 0.62);
  const mid = shade(C, 0.88);
  const lit = shade(C, 1.25);
  // sole — dark, slightly wider than the foot
  ringShell(v, piv, piv.cx - 5, 0, -6, piv.cx + 5, 1, 7, 2, dark);
  // foot — rounded box, base leather (toe row handled below)
  ringShell(v, piv, piv.cx - 4, 1, -5, piv.cx + 4, 4, 6, 2, C);
  // toe — the two front rows in darker leather (the boot welt)
  ringShell(v, piv, piv.cx - 4, 1, 7, piv.cx + 4, 4, 8, 2, dark);
  // ankle wrap
  ringShell(v, piv, piv.cx - 4, 4, -4, piv.cx + 4, 8, 5, 2, C);
  // shaft — tapers up the shin with alternating seam rows
  for (let y = 8; y <= 17; y++) {
    const t = (y - 8) / 9;
    const r = Math.max(2, Math.round(4 - t * 1.3));
    ringShell(v, piv, piv.cx - r, y, -r, piv.cx + r, y, r + 1, 2, y % 2 === 0 ? C : mid);
  }
  // cuff — dark band at the top of the shaft
  ringShell(v, piv, piv.cx - 4, 18, -4, piv.cx + 4, 19, 4, 2, dark);
  // knee guard — lit plate at the front of the shaft
  for (let y = 15; y <= 18; y++) for (let x = -2; x <= 2; x++) v.add(x, y, 5, lit, 0.04);
  const det = def.detail ?? 1;
  if (det >= 2) {
    // cuff studs
    v.add(piv.cx - 3, 18, 4, dark, 0.05);
    v.add(piv.cx + 3, 18, 4, dark, 0.05);
    v.add(piv.cx - 3, 18, -4, dark, 0.05);
    v.add(piv.cx + 3, 18, -4, dark, 0.05);
  }
  if (det >= 3) {
    // brass buckle at the ankle
    v.add(piv.cx, 6, 6, TRIM_GOLD, 0.03);
    v.add(piv.cx, 7, 6, TRIM_GOLD, 0.03);
  }
}

function buildGloves(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  const C = def.color;
  const dark = shade(C, 0.75);
  const det = def.detail ?? 1;
  ringShell(v, piv, piv.cx - 3, 28, -3, piv.cx + 3, 34, 3, 2, C);
  // cuff band
  ringShell(v, piv, piv.cx - 3, 33, -3, piv.cx + 3, 34, 3, 2, dark);
  if (det >= 3) ringShell(v, piv, piv.cx - 3, 33, -3, piv.cx + 3, 33, 3, 2, TRIM_GOLD);
}

function buildBracers(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  const C = def.color;
  const dark = shade(C, 0.75);
  const det = def.detail ?? 1;
  ringShell(v, piv, piv.cx - 4, 37, -4, piv.cx + 4, 44, 4, 2, C);
  ringShell(v, piv, piv.cx - 4, 37, -4, piv.cx + 4, 38, 4, 2, dark);
  ringShell(v, piv, piv.cx - 4, 43, -4, piv.cx + 4, 44, 4, 2, dark);
  if (det >= 2) {
    v.add(piv.cx, 39, 4, dark, 0.05);
    v.add(piv.cx, 42, 4, dark, 0.05);
  }
  if (det >= 3) ringShell(v, piv, piv.cx - 4, 40, -4, piv.cx + 4, 40, 4, 2, TRIM_GOLD);
}

function buildCloak(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  const C = def.color;
  const dark = shade(C, 0.8);
  const det = def.detail ?? 1;
  // shoulders: a band across the back
  ringShell(v, piv, -9, 54, -6, 9, 58, 2, 2, C);
  // back panel sweeping down
  for (let y = 48; y <= 56; y++) {
    const t = (56 - y) / 8;   // 0 at top → 1 at bottom: taper in slightly
    const hx = Math.round(8 - t * 2);
    ringShell(v, piv, -hx, y, -8, hx, y, -5, 1, y % 2 === 0 ? C : dark);
  }
  if (det >= 3) {
    // embroidered hem
    for (let x = -6; x <= 6; x += 2) { v.add(x, 48, -8, TRIM_GOLD, 0.03); v.add(x, 48, -7, TRIM_GOLD, 0.03); }
  }
}

function buildHead(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  if (def.style === 'bucket') {
    // Wooden bucket worn as a helm. Tapered round walls (wider at the rim,
    // narrower at the neck) with vertical staves, two iron hoops, a CLOSED
    // wooden lid so the skull is hidden (it used to show through the open
    // top — and the exposed crown lit up bright), plus an iron handle arc.
    // A front eye-slit keeps Greg's view clear.
    const C = def.color;                       // wood
    const woodDk = shade(C, 0.7);
    const woodLt = shade(C, 1.14);
    const iron = 0x6f6f6f;
    const wallR = (y: number) => Math.round(7 + ((y - 59) / (72 - 59)) * 2); // 7→9
    const eye = (x: number, y: number, z: number) =>
      z >= 4 && Math.abs(x) <= 4 && y >= 60 && y <= 66;
    // ── tapered round walls (1-voxel shell) with vertical staves ──
    for (let y = 59; y <= 72; y++) {
      const R = wallR(y);
      for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
        const rr = x * x + z * z;
        if (rr > R * R || rr <= (R - 1) * (R - 1)) continue;
        if (eye(x, y, z)) continue;
        const stave = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 4)) % 2 === 0;
        v.add(x - piv.cx, y - piv.cy, z, stave ? C : woodDk, 0.02);
      }
    }
    // ── iron hoops (keep the eye-slit open) ──
    for (const hy of [61, 68]) {
      const R = wallR(hy);
      for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
        const rr = x * x + z * z;
        if (rr > R * R || rr <= (R - 1) * (R - 1)) continue;
        if (eye(x, hy, z)) continue;
        v.add(x - piv.cx, hy - piv.cy, z, iron, 0.02);
      }
    }
    // ── neck brim (dark wood ring at the chin) ──
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
      const rr = x * x + z * z;
      if (rr > 64 || rr <= 49) continue;
      if (eye(x, 58, z)) continue;
      v.add(x - piv.cx, 58 - piv.cy, z, woodDk, 0.02);
    }
    // ── closed lid (solid disc, caps the skull) ──
    for (const ly of [73, 74]) {
      for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) {
        if (x * x + z * z > 81) continue;
        const c = (x === 0 && z === 0) ? woodLt : woodDk;
        v.add(x - piv.cx, ly - piv.cy, z, c, 0.02);
      }
    }
    // ── iron handle arc over the top ──
    for (let a = 0; a <= 180; a += 12) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(9 * Math.cos(rad));
      const y = Math.round(73 + 4 * Math.sin(rad));
      v.add(x - piv.cx, y - piv.cy, 0, iron, 0.03);
    }
    return;
  }
  const C = def.color;
  const dark = shade(C, 0.72);
  const lit = shade(C, 1.22);
  const isCap = def.style === 'cap';
  const isHood = def.style === 'hood';
  const bot = isCap ? 64 : 58;          // brow line
  const top = isCap ? 70 : (isHood ? 74 : 73);
  const browFace = isCap ? 65 : 63;     // where the face opening ends
  const r0 = isCap ? 6 : 7;             // dome radius at the brow
  // skull dome — tapered rows closing toward the crown, alternating tone so
  // the headgear reads as banded metal / leather rather than a flat blob
  for (let y = bot; y <= top; y++) {
    const t = (y - bot) / (top - bot);
    const r = Math.max(isCap ? 2 : 3, Math.round(r0 - t * (r0 - (isCap ? 2 : 3))));
    const c = y === top ? lit : (y % 2 === 0 ? C : dark);
    ringShell(v, piv, -r, y, -r, r, y, r, 2, c, (_x, y2, z) => z > 3 && y2 < browFace);
  }
  // brim — a wider ring at the brow line (helm + cap; a hood has no brim)
  if (!isHood) {
    ringShell(v, piv, -9, bot - 1, -9, 9, bot - 1, 9, 2, dark, (_x, y2, z) => z > 4 && y2 < browFace);
  } else {
    // hood: a cowl drape behind the neck
    ringShell(v, piv, -9, bot - 1, -8, 9, bot + 4, -9, 1, dark);
  }
  // brow plate — a raised band across the forehead above the face opening
  for (let y = browFace - 2; y <= browFace; y++) for (let x = -3; x <= 3; x++) v.add(x - piv.cx, y - piv.cy, 7, lit, 0.04);
  const det = def.detail ?? 1;
  if (det >= 2 && !isHood) {
    // brim studs
    v.add(-8, bot - 1, 7, dark, 0.05);
    v.add(8, bot - 1, 7, dark, 0.05);
    v.add(-8, bot - 1, -7, dark, 0.05);
    v.add(8, bot - 1, -7, dark, 0.05);
  }
  if (!isCap && !isHood) {
    // crest fin — front-to-back ridge on top of the dome
    for (let y = top - 2; y <= top + 2; y++) for (let z = -3; z <= 3; z++) v.add(0 - piv.cx, y - piv.cy, z, det >= 3 ? TRIM_GOLD : dark, 0.04);
    // nose guard — a small plate at the brow center
    v.add(0 - piv.cx, browFace - 3, 7, lit, 0.04);
    v.add(0 - piv.cx, browFace - 4, 7, dark, 0.04);
  }
}

function buildAmulet(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  v.add(0 - piv.cx, 42 - piv.cy, 6, def.color, 0.02);
  v.add(0 - piv.cx, 43 - piv.cy, 6, shade(def.color, 0.8), 0.02);
}

function buildTrinket(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  // a small charm hanging at the belt line
  v.add(2 - piv.cx, 40 - piv.cy, 6, def.color, 0.02);
  v.add(2 - piv.cx, 39 - piv.cy, 6, shade(def.color, 0.8), 0.02);
  v.add(2 - piv.cx, 41 - piv.cy, 6, def.color, 0.02);
}

function buildBelt(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  // a leather band around the waist + a buckle at the front
  const C = def.color;
  const dark = shade(C, 0.75);
  const det = def.detail ?? 1;
  for (let y = 34; y <= 36; y++) {
    ringShell(v, piv, -8, y, -5, 8, y, 5, 2, C);
  }
  // buckle frame + tongue (gold at high detail, brass otherwise)
  const buck = det >= 3 ? TRIM_GOLD : 0xc9a94a;
  v.add(0 - piv.cx, 35 - piv.cy, 6, buck, 0.04);
  for (const sx of [-1, 1]) {
    v.add(sx - piv.cx, 34 - piv.cy, 6, dark, 0.04);
    v.add(sx - piv.cx, 35 - piv.cy, 6, dark, 0.04);
    v.add(sx - piv.cx, 36 - piv.cy, 6, dark, 0.04);
  }
  v.add(0 - piv.cx, 34 - piv.cy, 6, dark, 0.04);
  v.add(0 - piv.cx, 36 - piv.cy, 6, dark, 0.04);
}

function buildRing(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  for (let a = 0; a < 360; a += 45) {
    const rad = (Math.PI * a) / 180;
    const x = Math.round(piv.cx + 2 * Math.cos(rad));
    const z = Math.round(2 * Math.sin(rad));
    v.add(x - piv.cx, 30 - piv.cy, z, def.color, 0.02);
  }
}

function buildShield(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  ringShell(v, piv, -13, 40, -3, -11, 46, 3, 1, def.color);
}

function buildPiece(def: EquipVisual): { part: string; mesh: THREE.Mesh }[] {
  const out: { part: string; mesh: THREE.Mesh }[] = [];
  const mk = (part: string, build: (v: Vox, piv: { cx: number; cy: number }) => void, gem?: (v: Vox, piv: { cx: number; cy: number }) => void) => {
    const piv = PART_PIVOTS[part];
    if (!piv) return;
    const vox = new Vox(C_DETAIL, 1);   // must match the player rig's SUB so
    build(vox, piv);                    // equipment voxels are the same size
    out.push({ part, mesh: vox.mesh() });
    // enchanted gear carries a glowing gem (emissive material → blooms)
    if (gem && def.magic) {
      const gv = new Vox(C_DETAIL, 1);
      gem(gv, piv);
      const gm = gv.mesh();
      gm.material = gemMat(def.magic.color);
      gm.userData.magicGem = true;
      out.push({ part, mesh: gm });
    }
  };
  switch (def.slot) {
    case 'chest': mk('torso', (v, p) => buildChest(v, p, def), (v, p) => addGem(v, p, def, 0, 46, 7)); break;
    case 'legs': for (const s of ['L', 'R']) mk('leg' + s, (v, p) => buildLegs(v, p, def), (v, p) => addGem(v, p, def, 0, 29, 5)); break;
    case 'boots': for (const s of ['L', 'R']) mk('shin' + s, (v, p) => buildBoots(v, p, def), (v, p) => addGem(v, p, def, 0, 13, 5)); break;
    case 'gloves': for (const s of ['L', 'R']) mk('hand' + s, (v, p) => buildGloves(v, p, def), (v, p) => addGem(v, p, def, 0, 32, 3)); break;
    case 'arms': for (const s of ['L', 'R']) mk('fore' + s, (v, p) => buildBracers(v, p, def), (v, p) => addGem(v, p, def, 0, 40, 4)); break;
    case 'cloak': mk('torso', (v, p) => buildCloak(v, p, def), (v, p) => addGem(v, p, def, 0, 56, 6)); break;
    case 'head': mk('head', (v, p) => buildHead(v, p, def), (v, p) => addGem(v, p, def, 0, def.style === 'cap' ? 66 : 64, 7)); break;
    case 'amulet': mk('torso', (v, p) => buildAmulet(v, p, def)); break;
    case 'trinket': mk('torso', (v, p) => buildTrinket(v, p, def)); break;
    case 'belt': mk('torso', (v, p) => buildBelt(v, p, def)); break;
    case 'ring': for (const s of ['L', 'R']) mk('hand' + s, (v, p) => buildRing(v, p, def)); break;
    case 'offHand': mk('foreL', (v, p) => buildShield(v, p, def)); break;
    default: break;
  }
  return out;
}

/**
/** Find the body Mesh a rig part points at.
 *
 * For FLAT rigs (chibi/bat/skeleton/…) `rig.parts[name]` IS the body mesh, so
 * it's returned as-is. For the hierarchical humanoid rig, `rig.parts[name]`
 * points at a pivot Group that wraps the actual body mesh (see
 * `buildHierarchy`): the equipment is built in the body mesh's LOCAL grid
 * space (origin at the part's grid pivot, matching `PART_PIVOTS`), so it must
 * be attached to the body MESH — not the pivot Group — or it ends up offset
 * to the joint (hip/knee/wrist) instead of centred on the limb/torso.
 *
 * Returns the first Mesh descendant of `part` (depth-first), or `part` itself
 * if it is already a Mesh.
 */
function bodyMeshOf(part: THREE.Object3D): THREE.Object3D {
  if ((part as THREE.Mesh).isMesh) return part;
  let found: THREE.Object3D | null = null;
  part.traverse((o) => { if (!found && (o as THREE.Mesh).isMesh) found = o; });
  return found ?? part;
}

/** show/hide the rig's hair mesh — headgear covers it (bucket helm, caps…) */
function setHairVisible(rig: Rig, visible: boolean) {
  const p = rig.parts?.hair;
  if (!p) return;
  bodyMeshOf(p).visible = visible;
}

/** Equip a piece onto a rig (replacing any existing piece in the same slot). */
export function equip(rig: Rig, def: EquipVisual): void {
  unequip(rig, def.slot);
  // headgear hides the hair so it doesn't poke through the helmet
  if (def.slot === 'head') setHairVisible(rig, false);
  const pieces = buildPiece(def);
  const stored: THREE.Object3D[] = [];
  for (const { part, mesh } of pieces) {
    const target = rig.parts[part];
    if (!target) { mesh.geometry.dispose(); continue; }
    // Attach to the body MESH, not the pivot Group: equipment voxels are built
    // in the body mesh's local grid space (origin = PART_PIVOTS[part]), so they
    // only line up with the body when parented to the mesh itself. Parenting
    // to the hierarchy pivot Group would drop the gear to the joint (hip /
    // knee / wrist) and misdraw the shirt / pants / boots.
    bodyMeshOf(target).add(mesh);
    stored.push(mesh);
  }
  if (!rig.equipped) rig.equipped = {};
  rig.equipped[def.slot] = stored;
}

/** Remove a single equipped piece (by slot). */
export function unequip(rig: Rig, slot: EquipSlot): void {
  const arr = rig.equipped?.[slot];
  if (!arr) return;
  for (const o of arr) {
    o.parent?.remove(o);
    o.traverse((c: THREE.Object3D) => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  }
  if (rig.equipped) delete rig.equipped[slot];
  // restore the hair once no headgear is left
  if (slot === 'head' && !rig.equipped?.head?.length) setHairVisible(rig, true);
}

/** Strip every equipped piece from a rig. */
export function unequipAll(rig: Rig): void {
  if (!rig.equipped) return;
  for (const slot of Object.keys(rig.equipped) as EquipSlot[]) unequip(rig, slot);
}

/**
 * Convert a data Item into an EquipVisual for the voxel rig. Returns null for
 * items that have no wearable visual (weapons are handled by setWeapon,
 * consumables aren't equipped).
 */
export function itemToEquipVisual(item: Item, slotOverride?: string): EquipVisual | null {
  let slot: string | undefined =
    slotOverride ?? item.slot ?? (item.kind === 'armor' ? 'chest' : item.kind === 'weapon' ? 'weapon' : undefined);
  if (!slot) {
    const n = item.name.toLowerCase();
    if (n.includes('ring')) slot = 'ring';
    else if (n.includes('amulet')) slot = 'amulet';
    else return null;
  }
  if (slot.startsWith('ring')) slot = 'ring';   // ring1/ring2 share one visual slot
  if (slot === 'weapon') return null;
  const s = slot as EquipSlot;
  const n = item.name.toLowerCase();

  // ── material detection — drives the base color of every piece ──
  let mat: 'plate' | 'chain' | 'leather' | 'cloth' | 'wood' = 'leather';
  if (n.includes('plate')) mat = 'plate';
  else if (n.includes('chain')) mat = 'chain';
  else if (n.includes('leather') || n.includes('hide')) mat = 'leather';
  else if (n.includes('cloth') || n.includes('robe') || n.includes('tunic') || n.includes('garb') || n.includes('silk')) mat = 'cloth';
  else if (n.includes('wood') || n.includes('bucket')) mat = 'wood';
  const MATS: Record<string, number> = {
    plate: 0xb8bfc9,     // steel
    chain: 0x9aa0a8,     // mail
    leather: 0x6b4423,   // tanned hide
    cloth: 0x8a2b2b,     // dyed cloth (defaults red)
    wood: 0x8a6a42,
  };
  if (mat === 'cloth' && s === 'cloak') MATS.cloth = 0x5a4030;

  let color: number;
  let style: EquipStyle;
  switch (s) {
    case 'head':
      if (item._baseId === 'wooden_bucket') { color = 0x6b4423; style = 'bucket'; break; }
      style = mat === 'cloth' ? 'hood' : 'helm';
      color = mat === 'cloth' ? 0x5a3a4a : (mat === 'wood' ? 0x8a6a42 : MATS[mat]);
      break;
    case 'chest':
      style = mat === 'plate' ? 'plate' : mat === 'chain' ? 'chain' : mat === 'leather' ? 'leather' : 'shirt';
      color = MATS[mat];
      break;
    case 'legs': color = mat === 'plate' ? 0x9aa0a8 : MATS[mat]; style = 'pants'; break;
    case 'boots': color = MATS[mat]; style = 'boots'; break;
    case 'gloves': color = mat === 'plate' ? 0xb8bfc9 : (mat === 'chain' ? 0x9aa0a8 : MATS[mat]); style = 'leather'; break;
    case 'arms': color = mat === 'plate' ? 0xb8bfc9 : (mat === 'chain' ? 0x9aa0a8 : MATS[mat]); style = 'bracers'; break;
    case 'cloak': color = mat === 'cloth' ? 0x5a4030 : MATS[mat]; style = 'cloak'; break;
    case 'belt': color = 0x4a3520; style = 'belt'; break;
    case 'amulet':
    case 'ring': color = 0xffd700; style = 'shirt'; break;
    case 'trinket':
      if (n.includes('penny')) color = 0xd8b13a;
      else if (n.includes('whisker')) color = 0xe8e0cc;
      else if (n.includes('belt')) color = 0x4a3520;
      else color = 0x9a7b4f;
      style = 'shirt';
      break;
    default: color = MATS[mat]; style = 'shirt';
  }

  // ── magic infusion: enchant glows in its element colour; rare/epic items
  //    carry a rarity glint even without an enchant ──
  const RARITY: Record<string, number> = { uncommon: 0x5fae5f, rare: 0x5b8def, epic: 0xb06ae0 };
  let magic: { color: number; glow: boolean } | undefined;
  if (item.enchantId && ENCHANTS[item.enchantId]) {
    magic = { color: hexToNum(ENCHANTS[item.enchantId].color), glow: true };
  } else if (item.rarity && item.rarity !== 'common' && RARITY[item.rarity]) {
    magic = { color: RARITY[item.rarity], glow: true };
  }
  // jewellery pieces ARE the gem — dye them entirely
  if (magic && (s === 'amulet' || s === 'ring' || s === 'trinket')) color = magic.color;

  return { slot: s, color, style, magic, detail: Math.min(3, Math.max(1, item.tier ?? 1)) };
}
