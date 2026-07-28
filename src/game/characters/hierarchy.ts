// ─────────────────────────────────────────────────────────────
// buildHierarchy — unified hierarchical skeleton for humanoid rigs
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Rig } from './vox';

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
    pivot.userData.baseY = jointGy * C;
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

  group.updateMatrixWorld(true);
  for (const n of ['torso', 'head', 'hair', 'hood', 'hoodTip', 'armL', 'armR', 'hip']) {
    const o = P[n];
    if (o) o.userData.baseY = o.position.y;
  }

  group.userData.hierarchyBuilt = true;
}
