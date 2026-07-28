// ─────────────────────────────────────────────────────────────
// engine/voxelUtils — standalone voxel helper functions
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Voxel } from '../voxelModels.mjs';

// ── shared materials ──
export const VOX_C = 0.055;
export const extMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const extEmissiveMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const tmpCol = new THREE.Color();

/**
 * Build a merged vertex-coloured mesh from voxel data (grid-based, VOX_C cube size).
 */
export function voxelMesh(voxels: Voxel[], emissive = false): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  for (const vx of voxels) {
    const g = new THREE.BoxGeometry(VOX_C, VOX_C, VOX_C);
    g.translate(vx.x * VOX_C, vx.y * VOX_C, vx.z * VOX_C);
    tmpCol.setHex(vx.c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  const m = new THREE.Mesh(merged, emissive ? extEmissiveMat : extMat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * Build a merged vertex-coloured mesh at an arbitrary cube size, BOTTOM-anchored.
 * Grid y = the voxel's lower face (a voxel at gy occupies world y in [gy*cube, (gy+1)*cube]).
 */
export function voxelMeshC(voxels: Voxel[], cube: number, emissive = false): THREE.Mesh {
  if (!voxels.length) return new THREE.Mesh(new THREE.BufferGeometry(), emissive ? extEmissiveMat : extMat);
  const geos: THREE.BufferGeometry[] = [];
  for (const vx of voxels) {
    const g = new THREE.BoxGeometry(cube, cube, cube);
    g.translate(vx.x * cube, (vx.y + 0.5) * cube, vx.z * cube);
    tmpCol.setHex(vx.c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  const m = new THREE.Mesh(merged, emissive ? extEmissiveMat : extMat);
  m.castShadow = !emissive; m.receiveShadow = true;
  return m;
}

// additive halo texture for windows / light glows
let extHaloTex: THREE.Texture | null = null;
export function extHalo(): THREE.Texture {
  if (extHaloTex) return extHaloTex;
  const s = 64;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = s;
  const ctx = cvs.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,200,120,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  extHaloTex = new THREE.CanvasTexture(cvs);
  return extHaloTex;
}

/**
 * Build a voxel tree (trunk + layered foliage) into a shared Vox store.
 */
export function voxTree(v: any, tx: number, tz: number, sc: number, trunk: number, trunkD: number, leaf: number, leafHi: number) {
  const h = Math.round(16 * sc);
  for (let y = 0; y < h; y++) {
    const r = y < 3 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
      if (dx * dx + dz * dz <= r * r + 0.5) v.add(tx + dx, y, tz + dz, (y % 3 === 0) ? trunkD : trunk);
  }
  const fy = h;
  v.ellipsoid(tx, fy + 1, tz, Math.round(5 * sc), Math.round(2 * sc), Math.round(5 * sc), leaf);
  v.ellipsoid(tx, fy + 5, tz, Math.round(4 * sc), Math.round(2 * sc), Math.round(4 * sc), leafHi);
  v.ellipsoid(tx, fy + 9, tz, Math.round(3 * sc), Math.round(2 * sc), Math.round(3 * sc), leaf);
  v.ellipsoid(tx, fy + 13, tz, Math.round(2 * sc), Math.round(2 * sc), Math.round(2 * sc), leafHi);
}

/**
 * Build a voxel bush (rounded) into a shared Vox store.
 */
export function voxBush(v: any, bx: number, bz: number, r: number, bush: number, bushHi: number) {
  v.ellipsoid(bx, 1, bz, r, Math.round(r * 0.5), r, bush);
  v.ellipsoid(bx + 1, 2, bz, Math.round(r * 0.5), Math.round(r * 0.3), Math.round(r * 0.5), bushHi);
}

/**
 * A glowing point with a soft additive sprite halo + warm light (for windows / candle)
 */
export function extGlow(g: THREE.Group, color: number, x: number, y: number, z: number, lightI = 1.0, lightDist = 7, haloScale = 0.9) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: extHalo(), color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  spr.scale.setScalar(haloScale);
  spr.position.set(x, y, z);
  g.add(spr);
  const l = new THREE.PointLight(color, lightI, lightDist, 1.6);
  l.position.set(x, y, z);
  g.add(l);
}
