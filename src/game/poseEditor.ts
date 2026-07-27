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
  { label: 'Hip', joints: ['hip'] },
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
    joints: { ...blankPose(), torso: j(0.06), head: j(-0.05), armL: j(-1.35), armR: j(-0.452, 0, 0.048), legL: j(-1.492), legR: j(-1.702), foreL: j(0.15), foreR: j(0.128, 0, 0.148), shinL: j(1.368), shinR: j(1.688) },
  },
  {
    name: 'drink', label: 'drink — raise the tankard',
    joints: { ...blankPose(), torso: j(0.06), head: j(-0.05), armL: j(-1.342, 0, -0.152), armR: j(-0.452, 0, 0.048), legL: j(-1.492), legR: j(-1.702), foreL: j(-1.192, 0, 0.998), foreR: j(0.128, 0, 0.148), shinL: j(1.368), shinR: j(1.688) },
  },
  {
    name: 'crack', label: 'crack — knuckles pump at the chest',
    joints: { ...blankPose(), torso: j(0.06), head: j(-0.05), armL: j(-0.732, 0, -0.192), armR: j(-1.552, 0, -0.212), foreL: j(-1.3), foreR: j(-0.842) },
  },
  {
    name: 'cross', label: 'cross — arms folded across chest',
    joints: { ...blankPose(), torso: j(-0.006), head: j(-0.02), armL: j(-1.032, 0, 0.128), armR: j(-1.192, 0, 0.088), foreL: j(-0.972, 0, 1.128), foreR: j(-1.162, 0, -1.682), wristL: j(-0.412), wristR: j(0.198) },
  },
  {
    name: 'sit_cross', label: 'sit_cross — sitting crossed-legged on ground',
    joints: { ...blankPose(), armL: j(-0.282, 0, -0.152), armR: j(-0.692, 0, 0.148), foreL: j(0.608, 0, 1.468), foreR: j(-0.082, 0, -1.232), legL: j(-1.532), legR: j(-1.442), shinL: j(1.258), shinR: j(0.648) },
  },
  {
    name: 'sleep', label: 'sleep — lying on ground',
    joints: { ...blankPose(), torso: j(-1.442, 1.188, 0), head: j(-1.274, 1.338, 0), hip: j(0.178, 0.048, -1.642), armL: j(-1.614, 0.278, -0.042), armR: j(1.586, 0, -0.102), foreL: j(-0.242, 0, 0.328), foreR: j(0.428, 0, -0.452), legL: j(-1.732, -0.562, 0), legR: j(-1.662, 0, 0), shinL: j(1.278, -0.172, 0), shinR: j(0.308, 0, 0) },
  },
  {
    name: 'point', label: 'point — pointing with right arm',
    joints: { ...blankPose(), armR: j(-1.422, 0, -0.212), foreL: j(-0.732, 0, -0.062) },
  },
];

export function blankPose(): PoseJoints {
  const z = () => ({ x: 0, y: 0, z: 0 });
  return {
    torso: z(), head: z(), hip: z(),
    armL: z(), armR: z(), foreL: z(), foreR: z(),
    legL: z(), legR: z(), shinL: z(), shinR: z(),
    handL: z(), handR: z(), wristL: z(), wristR: z(),
  };
}
/** shortcut joint ctor */
function j(x = 0, y = 0, z = 0): JointEuler { return { x, y, z }; }

/**
 * Write joint rotations to the dummy.  Joint values are in flat format
 * (matching updateRig).  Head/hair are children of torso internally, so
 * their values are converted from world→local before applying.
 */
export function applyPose(rig: Rig, joints: PoseJoints): void {
  const P = rig.parts;
  // apply torso first so its rotation is available for head/hair/arm conversion
  if (joints.torso && P.torso) {
    P.torso.rotation.set(joints.torso.x, joints.torso.y, joints.torso.z);
  }
  const tx = P.torso ? P.torso.rotation.x : 0;
  const ty = P.torso ? P.torso.rotation.y : 0;
  const tz = P.torso ? P.torso.rotation.z : 0;
  for (const name of Object.keys(joints)) {
    if (name === 'torso') continue;
    const obj = P[name];
    if (!obj) continue;
    const j = joints[name];
    // head/hair/hood/arms are children of torso: convert flat (world) → local
    // by subtracting the torso's rotation on each axis.
    const isTorsoChild = name === 'head' || name === 'hair' || name === 'hood' || name === 'hoodTip' || name === 'armL' || name === 'armR';
    obj.rotation.set(isTorsoChild ? j.x - tx : j.x, isTorsoChild ? j.y - ty : j.y, isTorsoChild ? j.z - tz : j.z);
  }
}

/**
 * Fix the dummy's pivot points so rotations pivot at anatomical joints.
 * Head/hair are reparented under torso for visual tracking; arms/legs stay
 * independent.  Joint values are flat (compatible with updateRig) — conversion
 * between world/local happens in fireJoint / applyPose.
 *
 * 1) Wrap rigid meshes in pivot Groups at the joint (hip/neck/crown).
 * 2) Wrap limb groups in pivots at actual shoulder/hip/elbow/knee/wrist.
 * 3) Reparent head/hair under torso so they follow torso tilt.
 *
 * Grid-y reference (player rig, C_DETAIL = 0.0285):
 *   Hip  34   Torso centre 45   Neck 56   Head centre 64   Crown 70
 */
export function wrapPoseablePartJoints(rig: Rig): void {
  // The unified hierarchy is now built inside the rig builders (buildHierarchy
  // in characters.ts). If it has already run, this is a no-op — kept for
  // backward compatibility with any caller that still invokes it.
  if (rig.group.userData.hierarchyBuilt) return;
  const group = rig.group;
  const P = rig.parts;
  const piv = rig.pivots;
  if (!piv) return;

  const C = piv.torso / 45;
  const HIP_GY = 34, NECK_GY = 56, CROWN_GY = 70;
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

  // ── Step B: reparent head/hair/arms under torso so they follow torso tilt ──
  // Joint values are flat (updateRig format). Conversion to local for children
  // of torso happens in applyPose (on write) and fireJoint (on read via world quat).
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
}

/** emit the paste-ready `else if (a.mode === '<name>') { ... }` block for updateRig.
 *  Outputs ALL x/y/z axes for every joint so the snippet is a complete
 *  representation of the pose (no silent zero-skipping). */
export function poseSnippet(name: string, joints: PoseJoints): string {
  const lines: string[] = [];
  lines.push(`} else if (a.mode === '${name}') {                         // ${name} pose`);
  const emit3 = (varX: string, varY: string, varZ: string, jx?: JointEuler) => {
    if (!jx) return;
    lines.push(`    ${varX} = ${fmt(jx.x)}; ${varY} = ${fmt(jx.y)}; ${varZ} = ${fmt(jx.z)};`);
  };
  // torso + head (full 3-axis)
  emit3('torsoX', 'torsoY', 'torsoZ', joints.torso);
  emit3('headX', 'headY', 'headZ', joints.head);
  // hip (full 3-axis)
  emit3('hipRotX', 'hipRotY', 'hipRotZ', joints.hip);
  // arms (full 3-axis)
  emit3('armLX', 'armLY', 'armLZ', joints.armL);
  emit3('armRX', 'armRY', 'armRZ', joints.armR);
  // elbows (full 3-axis)
  emit3('elbowL', 'elbowLY', 'elbowLZ', joints.foreL);
  emit3('elbowR', 'elbowRY', 'elbowRZ', joints.foreR);
  // wrists (full 3-axis)
  emit3('wristL', 'wristLY', 'wristLZ', joints.wristL);
  emit3('wristR', 'wristRY', 'wristRZ', joints.wristR);
  // legs (full 3-axis)
  emit3('legLX', 'legLY', 'legLZ', joints.legL);
  emit3('legRX', 'legRY', 'legRZ', joints.legR);
  // knees (full 3-axis)
  emit3('kneeL', 'kneeLY', 'kneeLZ', joints.shinL);
  emit3('kneeR', 'kneeRY', 'kneeRZ', joints.shinR);
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
  // Report joint rotation — children of torso read world quaternion for flat display
  const fireJoint = (joint: string) => {
    const o = subject.parts[joint] as THREE.Object3D | undefined;
    if (!o) return;
    if (joint === 'head' || joint === 'hair' || joint === 'hood' || joint === 'hoodTip' || joint === 'armL' || joint === 'armR') {
      const q = new THREE.Quaternion(); o.getWorldQuaternion(q);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      onJointChange.forEach((cb) => cb(joint, e.x, e.y, e.z));
    } else {
      onJointChange.forEach((cb) => cb(joint, o.rotation.x, o.rotation.y, o.rotation.z));
    }
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
