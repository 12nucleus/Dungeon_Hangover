// ─────────────────────────────────────────────────────────────
// engine/IsoCamera — isometric tactical camera rig
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { WORLD_SIZE } from '../world';

/**
 * Isometric tactical camera with yaw/pitch/dist/focus/box clamping.
 * Handles rotation, zoom, pan, cinematic easing, shake, and
 * optional AABB clamping for interior sets.
 */
export class IsoCamera {
  cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  desiredTarget = new THREE.Vector3();
  yaw = Math.PI * 0.25;
  desiredYaw = Math.PI * 0.25;
  dist = 15;
  desiredDist = 15;
  pitch = 0.96; // ~55°
  desiredPitch = 0.96;
  lerp = 7;     // easing speed — lowered during cinematics for slow, smooth moves
  shake = 0;
  // optional world-space AABB the *camera* is clamped inside (used to keep the
  // cinematic framed inside the small tavern set instead of clipping through walls)
  box: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number } | null = null;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(36, aspect, 0.1, 200);
  }
  rotate(dir: 1 | -1) { this.desiredYaw += (Math.PI / 4) * dir; }
  zoom(d: number) { this.desiredDist = THREE.MathUtils.clamp(this.desiredDist + d, 8, 30); }
  pan(dx: number, dz: number) {
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = new THREE.Vector3(f.z, 0, -f.x);
    this.desiredTarget.addScaledVector(r, dx).addScaledVector(f, dz);
    this.clampTarget();
  }
  focus(p: THREE.Vector3) { this.desiredTarget.copy(p); this.clampTarget(); }
  private clampTarget() {
    const m = WORLD_SIZE / 2 - 2;
    this.desiredTarget.x = THREE.MathUtils.clamp(this.desiredTarget.x, -m, m);
    this.desiredTarget.z = THREE.MathUtils.clamp(this.desiredTarget.z, -m, m);
  }
  update(dt: number) {
    const k = Math.min(1, dt * this.lerp);
    this.target.lerp(this.desiredTarget, k);
    this.yaw += (this.desiredYaw - this.yaw) * k;
    this.dist += (this.desiredDist - this.dist) * k;
    this.pitch += (this.desiredPitch - this.pitch) * k;
    const p = this.cam.position;
    p.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist,
    );
    if (this.shake > 0.002) {
      p.x += (Math.random() - 0.5) * this.shake;
      p.y += (Math.random() - 0.5) * this.shake;
      p.z += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.max(0, 1 - dt * 5);
    }
    if (this.box) {
      p.x = THREE.MathUtils.clamp(p.x, this.box.minX, this.box.maxX);
      p.z = THREE.MathUtils.clamp(p.z, this.box.minZ, this.box.maxZ);
      p.y = THREE.MathUtils.clamp(p.y, this.box.minY, this.box.maxY);
    }
    this.cam.lookAt(this.target);
  }
}
