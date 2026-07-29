// ─────────────────────────────────────────────────────────────
// Vox — basic building block for voxel models
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EquipSlot } from '../types';

export const C_CHIBI = 0.1;
export const C_NORMAL = 0.055;
export const C_DETAIL = 0.0285;
export const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const orbMat = new THREE.MeshLambertMaterial({ color: 0xa78bfa, emissive: 0x7c3aed, emissiveIntensity: 0.9 });
export const tmpCol = new THREE.Color();

export const METAL = 0xb8bfc9, METAL_DARK = 0x7a828e, DARK = 0x1a1a22;
export const TUSK = 0xf2ede0, BROW = 0x241a10, BOOT = 0x2c2620;

// tint a hex color by factor f (>1 lighten, <1 darken), clamped
export function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// Soft-body / ragdoll collapse state, created the first frame a rig dies.
export interface DeathState {
  gvx: number; gvz: number; gtx: number; gtz: number;
  gvy: number; gty: number;
  pv: Record<string, THREE.Vector3>;
  pt: Record<string, THREE.Vector3>;
  jelly: number;
  impacted: boolean;
}

export interface Rig {
  group: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  anim: {
    mode: 'idle' | 'walk' | 'dead' | 'sit' | 'floor' | 'lie' | 'drink' | 'drink_anim' | 'crack' | 'cross' | 'getup' | 'sit_cross' | 'sleep' | 'point' | 'wipe';
    t: number;
    lunge: number;
    flinch: number;
    lungeDir: THREE.Vector3;
    bob: number;
    crouch: number;
    /** random per-rig phase offset so idle breathing / arm sway isn't in lockstep */
    phase?: number;
    /** persistent vertical offset for the head assembly */
    headYOffset?: number;
    /** persistent vertical offset for the hair part */
    hairYOffset?: number;
    /** persistent rotation added to a forearm every frame */
    forearmLOffset?: number;
    forearmROffset?: number;
    death?: DeathState;
  };
  pivots?: {
    hip: number; torso: number; head: number; eye: number;
    hair: number; arm: number; hand: number; weapon: number;
    hood?: number; hoodTip?: number; pad?: number; knee?: number; elbow?: number; wrist?: number;
  };
  /** voxel equipment meshes attached via the equipment system, keyed by slot */
  equipped?: Partial<Record<EquipSlot, THREE.Object3D[]>>;
}

/** Convenience type for inline voxel builders used by beast/undead rigs. */
export type Build = (v: Vox) => void;

export class Vox {
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
    if (!this.geos.length) return new THREE.Mesh(new THREE.BufferGeometry(), bodyMat);
    const merged = mergeGeometries(this.geos, false)!;
    this.geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, bodyMat);
    m.castShadow = true;
    return m;
  }
  count() { return this.geos.length; }
}
