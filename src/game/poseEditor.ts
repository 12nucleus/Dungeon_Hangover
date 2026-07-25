/**
 * Standalone pose editor — ENTIRELY self-contained.
 *
 * No GameEngine, no cutscene host, no tavern, no audio. This module owns its
 * own minimal THREE.js scene (a floor disc + 3 lights), a spherical-orbit
 * camera, one "Greg" player dummy built directly from `buildCharacter`, and the
 * render loop. The React `PoseEditor.tsx` page mounts a <div>, calls
 * `createPoseStage(host)` to get the controller, drives the dummy's joints from
 * sliders via `applyPose`, reads pose presets, and snips out a paste-ready
 * `else if (a.mode === '<name>') { … }` block for `updateRig` in characters.ts.
 *
 * The ONLY game coupling is importing `buildCharacter` (so the dummy is the
 * exact same voxel model the real Greg uses). Everything else is local.
 */

import * as THREE from 'three';
import { buildCharacter } from './characters';
import type { Rig } from './characters';

// ─────────────────────────────────────────────────────────────
//  Joint state + snippet helpers (shared with the React panel)
// ─────────────────────────────────────────────────────────────

export interface JointEuler { x: number; y: number; z: number; }
export type PoseJoints = Record<string, JointEuler>;

export const JOINT_GROUPS: { label: string; joints: string[] }[] = [
  { label: 'Body', joints: ['torso', 'head'] },
  { label: 'Left arm',  joints: ['armL', 'foreL', 'wristL', 'handL'] },
  { label: 'Right arm', joints: ['armR', 'foreR', 'wristR', 'handR'] },
  { label: 'Left leg',  joints: ['legL', 'shinL'] },
  { label: 'Right leg', joints: ['legR', 'shinR'] },
];

export const POSE_PRESETS: { name: string; label: string; joints: PoseJoints }[] = [
  { name: 'blank', label: 'blank — zero pose', joints: blankPose() },
  {
    name: 'idle', label: 'idle — arms slightly forward',
    joints: { ...blankPose(), armL: j(-0.1745), armR: j(-0.1745) },
  },
  {
    name: 'sit', label: 'sit — left arm rests on table',
    joints: { ...blankPose(), torso: j(0.06), head: j(-0.05), armL: j(-1.35), armR: j(-0.25), legL: j(-1.582), legR: j(-1.702), foreL: j(0.15), foreR: j(0.128, 0, 0.148) },
  },
  {
    name: 'drink', label: 'drink — tankard to the mouth',
    joints: { ...blankPose(), torso: j(0.05), head: j(-0.16), armL: j(-2.35), armR: j(-0.25), legL: j(-1.2), legR: j(-1.2), foreL: j(-1.1), foreR: j(0.5) },
  },
  {
    name: 'cross', label: 'cross — arms folded across chest',
    joints: { ...blankPose(), torso: j(-0.006), head: j(-0.02), armL: j(-0.192, 0, 0.498), armR: j(-0.732, 0, -0.622), foreL: j(-1.622, 0, -3.002), foreR: j(-0.327, 0, 0.9), wristL: j(0.6), wristR: j(0.6) },
  },
  {
    name: 'crack', label: 'crack — knuckles pump at the chest',
    joints: { ...blankPose(), torso: j(0.06), head: j(-0.05), armL: j(-0.8, 0, 0.3), armR: j(-0.8, 0, -0.3), foreL: j(-1.3), foreR: j(-1.3) },
  },
];

export function blankPose(): PoseJoints {
  const z = () => ({ x: 0, y: 0, z: 0 });
  return {
    torso: z(), head: z(),
    armL: z(), armR: z(), foreL: z(), foreR: z(),
    legL: z(), legR: z(), shinL: z(), shinR: z(),
    handL: z(), handR: z(), wristL: z(), wristR: z(),
  };
}
/** shortcut joint ctor */
function j(x = 0, y = 0, z = 0): JointEuler { return { x, y, z }; }

/**
 * Write the live joint rotations onto the dummy's parts.
 *
 * The joint values in `joints` are LOCAL rotations to apply at each joint — the exact
 * numbers that appear in `updateRig`'s pose presets.  Because the editor builds a
 * parent→child skeleton, those flat values must be converted into *local* rotations
 * (relative to the parent) before they are stamped onto each part.
 *
 * Because wrapPoseablePartJoints already (a) placed each part's pivot at its
 * anatomical joint and (b) linked parts into a parent→child skeleton, simply
 * writing each part's LOCAL rotation keeps every limb attached: rotating the
 * torso swings the head and arms with it, and each part spins about its own
 * joint.  Parts without an entry in `joints` are left untouched.
 */
export function applyPose(rig: Rig, joints: PoseJoints): void {
  const P = rig.parts;
  // The values in `joints` are LOCAL rotations to apply at each joint — exactly
  // what updateRig does in the game (e.g. p.armL.rotation.x = armLX).
  //
  // wrapPoseablePartJoints has already:
  //   (a) wrapped every rigid part in a pivot Group placed at its anatomical
  //       joint (hip / neck / crown), so rotation.set() pivots about the joint;
  //   (b) built a parent→child skeleton via Object3D.attach(), so rotating a
  //       parent carries its children.
  //
  // Therefore we simply set each part's LOCAL rotation directly.  NO world→local
  // quaternion math — that would force each part's WORLD rotation to equal the
  // joint value, which actively prevents children from following their parents
  // (the "limbs detach" bug).
  for (const name of Object.keys(joints)) {
    const obj = P[name];
    if (!obj) continue;
    const euler = joints[name];
    obj.rotation.set(euler.x, euler.y, euler.z);
  }
}

/**
 * Fix the dummy's pivot points and build a TRUE parent→child joint skeleton.
 *
 * The in-game rig has two problems for a standalone pose editor:
 * 1) Rigid parts (torso/head/hair) are bare Meshes.  Their rotation pivot is the
 *    mesh's geometric centre — not the anatomical joint.  Rotating the head, for
 *    example, spins it around its own centre instead of the neck.
 * 2) All parts are flat children of `group`.  Rotating the torso does NOT swing
 *    the head or arms — there is no scene-graph skeleton.
 *
 * This function does both:
 *   Step A — wrap each rigid part in a pivot Group placed at the part's
 *     *anatomical joint* (hip, neck, crown).  The mesh is reparented under the
 *     pivot with a compensating offset so it stays visually in place.  After this
 *     rotation.set() on parts[name] pivots at the joint.
 *   Step B — use THREE.Object3D.attach() to link the skeleton: head→torso,
 *     hair→head, armL→torso, armR→torso.  Rotating an ancestor now propagates.
 *
 * Limbs (armL/foreL/legL, etc.) are already correctly pivoted Groups from
 * buildLimb — they are left untouched by Step A.
 *
 * Grid-y reference (player rig, C_DETAIL = 0.0285):
 *   Hip  34   Torso centre 45   Neck 56   Head centre 64   Crown 70
 */
function wrapPoseablePartJoints(rig: Rig): void {
  const group = rig.group;
  const P = rig.parts;
  const piv = rig.pivots;
  if (!piv) return;

  // get the cube size (C) from the rig's pivots
  const C = piv.torso / 45;            // TORSO_G = 45
  const HIP_GY = 34, NECK_GY = 56, CROWN_GY = 70;
  // known grid centres (from partInfo in builds)
  const TORSO_CY = 45, HEAD_CY = 64, HAIR_CY = 66;

  // ── Step A: wrap rigid parts in pivot groups at anatomical joints ──
  const wrapMesh = (name: string, jointGy: number, meshGy: number) => {
    const mesh = P[name];
    if (!mesh || (mesh as THREE.Object3D).type !== 'Mesh') return;
    const pivot = new THREE.Group();
    pivot.position.set(0, jointGy * C, 0);
    group.add(pivot);
    mesh.parent?.remove(mesh);
    mesh.position.set(mesh.position.x, (meshGy - jointGy) * C, mesh.position.z);
    pivot.add(mesh);
    P[name] = pivot;                   // future rotation calls hit the pivot
  };
  wrapMesh('torso', HIP_GY, TORSO_CY);    // pivot at hips
  wrapMesh('head',  NECK_GY, HEAD_CY);    // pivot at neck
  wrapMesh('hair',  CROWN_GY, HAIR_CY);   // pivot at crown (NOTE: re-parented under head below)
  // hood / hoodTip (if the dummy has them — player rig doesn't, but humanoid might)
  if (P.hood)   wrapMesh('hood',   CROWN_GY, HAIR_CY + 2);
  if (P.hoodTip) wrapMesh('hoodTip', CROWN_GY, HAIR_CY + 4);

  // ── Step A2: fix the LIMB pivots (the actual detachment bug) ──
  // buildLimb() places each limb's group origin on the body CENTRELINE (x = 0)
  // and offsets the mesh to the side (x = cx*C).  So rotating a limb spins it
  // around the spine, not the shoulder/hip — the limb appears to fly off the
  // body.  Wrap each limb in a pivot Group placed at the TRUE joint (where the
  // mesh actually sits) so rotation.set() pivots about the shoulder/hip.
  // Object3D.attach() preserves the limb's world pose while re-parenting.
  const wrapLimb = (name: string) => {
    const upper = P[name] as THREE.Group | undefined;
    if (!upper || (upper as THREE.Object3D).type !== 'Group') return;
    group.updateMatrixWorld(true);
    const up = new THREE.Vector3();
    upper.getWorldPosition(up);                       // (0, cyUpper*C, 0)
    // the joint x is where the limb mesh really is (cx*C), not the centreline 0
    let jointX = up.x;
    const um = upper.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
    if (um) { const mp = new THREE.Vector3(); um.getWorldPosition(mp); jointX = mp.x; }
    const pivot = new THREE.Group();
    pivot.position.set(jointX, up.y, 0);              // pivot exactly at the joint
    group.add(pivot);
    pivot.attach(upper);                              // keeps the mesh exactly where it is
    P[name] = pivot;                                  // future rotation hits the joint pivot
  };
  wrapLimb('armL'); wrapLimb('armR');
  wrapLimb('legL'); wrapLimb('legR');

  // ── Step A3: fix the NESTED joints (elbow/knee + wrist) ──
  // The same centreline-vs-joint bug exists one level down: buildLimb puts the
  // `lower` (forearm/shin) and `wrist` groups on the centreline (x = 0) while
  // their meshes sit at x = cx*C.  So rotating the forearm/shin/wrist spins them
  // around the spine, detaching them.  Wrap each nested joint in a pivot placed
  // at the mesh (the true elbow/knee/wrist) and re-parent via attach().
  const wrapNestedJoint = (parent: THREE.Object3D, child: THREE.Object3D, partKey: string) => {
    parent.updateMatrixWorld(true);
    const cm = child.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
    const wp = new THREE.Vector3();
    if (cm) cm.getWorldPosition(wp); else child.getWorldPosition(wp);   // joint = mesh world position
    // parent is NOT at the world origin, so convert the world joint position into
    // parent's LOCAL space before adding the pivot — otherwise the pivot lands far away.
    const local = parent.worldToLocal(wp.clone());
    const pivot = new THREE.Group();
    pivot.position.copy(local);
    parent.add(pivot);
    pivot.attach(child);                              // preserves child's world pose
    if (partKey) P[partKey] = pivot;                 // future rotation hits this joint
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

  // ── Step B: build the skeleton hierarchy ──
  // After Step A all parts are children of `group` again.  Using attach()
  // preserves each child's world transform while moving it under the new parent.
  group.updateMatrixWorld(true);
  const rep = (childName: string, parentName: string) => {
    const child = P[childName] as THREE.Object3D | undefined;
    const newParent = P[parentName] as THREE.Object3D | undefined;
    if (!child || !newParent || child.parent === newParent) return;
    newParent.attach(child);
  };
  rep('head', 'torso');
  rep('hair', 'head');                // hair now a child of *head*, so it follows the head
  if (P.hood)   rep('hood',   'head');
  if (P.hoodTip) rep('hoodTip', 'head');
  if (P.padL) rep('padL', 'torso');
  if (P.padR) rep('padR', 'torso');
  rep('armL', 'torso');              // carries foreL→wristL→handL
  rep('armR', 'torso');              // carries foreR→wristR→handR

  group.updateMatrixWorld(true);
}

/** emit the paste-ready `else if (a.mode === '<name>') { ... }` block for updateRig */
export function poseSnippet(name: string, joints: PoseJoints): string {
  const lines: string[] = [];
  lines.push(`} else if (a.mode === '${name}') {                         // ${name} pose`);
  const emit = (varName: string, jx?: JointEuler, axis: 'x' | 'y' | 'z' = 'x') => {
    if (!jx) return;
    const v = axis === 'x' ? jx.x : axis === 'y' ? jx.y : jx.z;
    if (v === 0) return;
    lines.push(`    ${varName} = ${fmt(v)};`);
  };
  emit('torsoX', joints.torso, 'x'); emit('headX', joints.head, 'x');
  emit('armLX', joints.armL, 'x'); emit('armLZ', joints.armL, 'z');
  emit('armRX', joints.armR, 'x'); emit('armRZ', joints.armR, 'z');
  emit('elbowL', joints.foreL, 'x'); emit('elbowLZ', joints.foreL, 'z');
  emit('elbowR', joints.foreR, 'x'); emit('elbowRZ', joints.foreR, 'z');
  emit('wristL', joints.wristL, 'x'); emit('wristR', joints.wristR, 'x');
  emit('legLX', joints.legL, 'x'); emit('legRX', joints.legR, 'x');
  emit('kneeL', joints.shinL, 'x'); emit('kneeR', joints.shinR, 'x');
  lines.push('  }');
  return lines.join('\n');
}

export function copySnippet(text: string): void {
  try { if (navigator.clipboard?.writeText) { void navigator.clipboard.writeText(text); return; } } catch { /* fallthrough */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  } catch { /* ignore */ }
}

function fmt(n: number, p = 3): string { const s = n.toFixed(p); return s.replace(/\.?0+$/, ''); }

// ─────────────────────────────────────────────────────────────
//  Standalone THREE scene + orbit camera + render loop
// ─────────────────────────────────────────────────────────────

export interface PoseStageHandles {
  /** the Greg dummy rig — drive it with applyPose(h.subject, joints). */
  subject: Rig;
  /** orbit camera control (degrees). The panel wires these to sliders. */
  camera: { yaw: number; pitch: number; dist: number; set: (yaw: number, pitch: number, dist: number) => void };
  /** subscribe to camera changes (e.g. WASD orbit) so the sliders stay in sync. returns an unsubscribe. */
  onCamChange: (cb: (yaw: number, pitch: number, dist: number) => void) => () => void;
  /** subscribe to live joint edits (sliders OR click-drag) so the panel stays in sync */
  onJointChange: (cb: (joint: string, x: number, y: number, z: number) => void) => () => void;
  /** the joint currently grabbed by click-drag (or null). panel highlights its sliders. */
  grabbed: () => string | null;
  /** teardown — cancel the RAF loop + dispose renderer/scene. */
  dispose: () => void;
}

/**
 * Build the standalone pose-editor stage inside a host <div>.
 * Returns a controller the React page uses to drive the dummy + camera.
 */
export function createPoseStage(host: HTMLDivElement): PoseStageHandles {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14110d);
  scene.fog = new THREE.Fog(0x14110d, 9, 28);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  host.appendChild(renderer.domElement);

  // camera — simple spherical orbit (no IsoCamera dependency)
  const cam = {
    yaw: -Math.PI * 0.25,       // radians around Y
    pitch: 0.55,                // radians above horizon
    dist: 4.2,                  // distance from target
    target: new THREE.Vector3(0, 0.95, 0),   // aim at the torso
  };
  const camera = new THREE.PerspectiveCamera(36, host.clientWidth / host.clientHeight, 0.1, 100);

  const setCam = (yaw: number, pitch: number, dist: number) => {
    cam.yaw = yaw; cam.pitch = THREE.MathUtils.clamp(pitch, 0.05, 1.45); cam.dist = THREE.MathUtils.clamp(dist, 1.5, 12);
  };

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.15); key.position.set(3, 6, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6688aa, 0.55);  rim.position.set(-4, 3, -3); scene.add(rim);

  // floor disc
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6, 48),
    new THREE.MeshLambertMaterial({ color: 0x261f18 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // the Greg dummy — exact same model the in-game Greg uses
  const subject = buildCharacter({
    skin: 0xf0d9b5, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a,
    hood: false, style: 'normal',
  });
  // ── pivot-wrap poseable parts so they rotate AT THEIR JOINTS ──
  // The rig exposes some parts as bare voxel meshes (torso/head/hair) positioned
  // at their joint centre, and others as nested groups (arms/legs already pivot
  // at the shoulder/hip). Rotating a bare mesh spins it around its own voxel
  // centre — which is only the joint by luck. So we wrap each poseable part in a
  // Group placed at the part's current world position, reparent the part into it
  // (compensating the offset), and replace parts[name] with that pivot group. Now
  // rotation.set() on the group spins the part about a stable joint anchor.
  wrapPoseablePartJoints(subject);
  subject.group.rotation.y = Math.PI * 0.18;   // turn slightly so the pose reads
  scene.add(subject.group);

  // ── WASD camera control ── (A/D yaw, W/S pitch, Q/E or R/F zoom)
  const keys = new Set<string>();
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const k = e.key.toLowerCase();
    if (['a', 'd', 'w', 's', 'q', 'e', 'r', 'f'].includes(k)) {
      if (down) keys.add(k); else keys.delete(k);
      e.preventDefault();
    }
  };
  const keyDown = onKey(true), keyUp = onKey(false);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  const onCamChange = new Set<(y: number, p: number, d: number) => void>();
  const fireCamChange = () => onCamChange.forEach((cb) => cb(cam.yaw, cam.pitch, cam.dist));
  const onJointChange = new Set<(joint: string, x: number, y: number, z: number) => void>();
  // read the LOCAL rotation of a part and fan it out as euler x/y/z.
  // We report the local rotation (not world) because the joint values in the
  // pose are local rotations — this keeps the sliders and the click-drag in
  // sync with what applyPose writes back.
  const fireJoint = (joint: string) => {
    const o = subject.parts[joint] as THREE.Object3D | undefined;
    if (!o) return;
    onJointChange.forEach((cb) => cb(joint, o.rotation.x, o.rotation.y, o.rotation.z));
  };

  // ── click-to-grab a limb, drag to rotate it ──
  // We pick the topmost poseable part under the cursor; while dragging we convert
  // pointer delta into euler-delta X (vertical drag) and Y (horizontal drag) on
  // the grabbed joint. The 'grabbed' name is exposed so the panel can highlight
  // the matching sliders.
  let grabbedName: string | null = null;
  const grabSensitivity = 0.01;   // radians per pixel ~ a smooth feel
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const poseableNames = new Set(Object.keys(subject.parts));
  const partUnderPointer = () => {
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(subject.group, true);
    for (const h of hits) {
      // walk up to find the ancestor that is a named poseable part
      let ob: THREE.Object3D | null = h.object;
      while (ob && ob !== subject.group) {
        // the part is registered in subject.parts by name; find it
        for (const name of poseableNames) {
          if (subject.parts[name] === ob) return name;
        }
        ob = ob.parent;
      }
    }
    return null;
  };
  const pointerPos = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };
  let lastPx = 0, lastPy = 0;
  const onPointerDown = (e: PointerEvent) => {
    pointerPos(e);
    const name = partUnderPointer();
    if (name) {
      grabbedName = name;
      lastPx = e.clientX; lastPy = e.clientY;
      renderer.domElement.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!grabbedName) return;
    const dx = e.clientX - lastPx, dy = e.clientY - lastPy;
    lastPx = e.clientX; lastPy = e.clientY;
    const o = subject.parts[grabbedName];
    if (o) {
      o.rotation.x += dy * grabSensitivity;
      o.rotation.y += dx * grabSensitivity;
      fireJoint(grabbedName);
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (grabbedName) { grabbedName = null; renderer.domElement.releasePointerCapture?.(e.pointerId); }
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', onPointerUp);

  // render loop
  let raf = 0; let disposed = false;
  const clock = new THREE.Clock();
  const tick = () => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    // gentle idle breathing on the dummy torso so it doesn't look frozen-dead.
    // The torso part is now a pivot Group (from wrapMesh); the actual mesh is
    // its first child — scale that so the breathing doesn't stretch the children.
    const breathe = Math.sin(performance.now() * 0.002) * 0.01;
    const torsoPivot = subject.parts.torso;
    if (torsoPivot && torsoPivot.children[0]) {
      (torsoPivot.children[0] as THREE.Mesh).scale.y = 1 + breathe;
    }
    // WASD camera (apply held keys each frame; fan out changes to sliders)
    const orbit = 1.6 * dt, zoom = 4.0 * dt;
    let changed = false;
    if (keys.has('a')) { cam.yaw += orbit; changed = true; }
    if (keys.has('d')) { cam.yaw -= orbit; changed = true; }
    if (keys.has('w')) { cam.pitch = THREE.MathUtils.clamp(cam.pitch + orbit, 0.05, 1.45); changed = true; }
    if (keys.has('s')) { cam.pitch = THREE.MathUtils.clamp(cam.pitch - orbit, 0.05, 1.45); changed = true; }
    if (keys.has('q') || keys.has('r')) { cam.dist = THREE.MathUtils.clamp(cam.dist - zoom, 1.5, 12); changed = true; }
    if (keys.has('e') || keys.has('f')) { cam.dist = THREE.MathUtils.clamp(cam.dist + zoom, 1.5, 12); changed = true; }
    if (changed) fireCamChange();
    void dt;
    // camera
    const p = camera.position;
    p.set(
      cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      cam.target.y + Math.sin(cam.pitch) * cam.dist,
      cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    );
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
  };
  tick();

  // keep the canvas sized to its host on resize
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (w < 1 || h < 1) return;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  });
  ro.observe(host);

  const dispose = () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('keyup', keyUp);
    const el = renderer.domElement;
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointerleave', onPointerUp);
    renderer.dispose();
    if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else if (mat) mat.dispose();
    });
  };

  return {
    subject,
    camera: { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, set: setCam },
    /** subscribe to camera changes (e.g. WASD orbit) so the sliders stay in sync */
    onCamChange: (cb) => { onCamChange.add(cb); return () => onCamChange.delete(cb); },
    /** subscribe to live joint edits (sliders OR click-drag) so the panel stays in sync */
    onJointChange: (cb) => { onJointChange.add(cb); return () => onJointChange.delete(cb); },
    grabbed: () => grabbedName,
    dispose,
  };
}
