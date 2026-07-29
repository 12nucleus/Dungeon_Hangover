// ─────────────────────────────────────────────────────────────
// engine/sheep — standalone voxel sheep builder
// ═════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C = 0.11;
const tmpCol = new THREE.Color();

const WOOL = 0xf2efe6;    // body wool
const WOOL_HI = 0xffffff; // fresh puffs / tail / head cap
const DARK = 0x35302a;    // face, ears, legs
const EYE = 0xffffff;

/**
 * Build a sheep model — reusable field prop for tavern exterior cutscenes AND
 * any future outdoor/overworld scene. Caller scales via `.scale.setScalar(s)`
 * if a different size is needed (intro uses 0.45; the model is built at 1.0).
 *
 * Layout (voxel units, feet at y=0, facing +Z):
 *   legs y0..3 · body ellipsoid y~7 · head z+5..8 · tail z-6
 */
export function buildSheep(): THREE.Group {
  const geos: THREE.BufferGeometry[] = [];

  const vox = (x: number, y: number, z: number, color: number, jitter = 0.08) => {
    const g = new THREE.BoxGeometry(C, C, C);
    g.translate(x * C, y * C, z * C);
    tmpCol.setHex(color).multiplyScalar(1 - jitter / 2 + Math.random() * jitter);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  };
  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, j?: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) vox(x, y, z, c, j);
  };
  const ball = (cx: number, cy: number, cz: number, r: number, c: number, j?: number) => {
    for (let x = Math.ceil(cx - r); x <= Math.floor(cx + r); x++)
      for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y++)
        for (let z = Math.ceil(cz - r); z <= Math.floor(cz + r); z++) {
          const dx = (x - cx) / r, dy = (y - cy) / r, dz = (z - cz) / r;
          if (dx * dx + dy * dy + dz * dz <= 1.05) vox(x, y, z, c, j);
        }
  };

  // ── legs (dark, single columns, hooves at y=0) ──
  for (const [lx, lz] of [[-2, 3], [2, 3], [-2, -3], [2, -3]] as const)
    fill(lx, 0, lz, lx, 3, lz, DARK);

  // ── woolly body (fat ellipsoid) ──
  ball(0, 7, 0, 4, WOOL, 0.1);          // core — scaled out below via extra passes
  // stretch the body along z by layering two offset ellipsoids
  ball(0, 7, 2.5, 3.6, WOOL, 0.1);
  ball(0, 7, -2.5, 3.6, WOOL, 0.1);

  // ── wool puffs (the bumpy silhouette that says "sheep") ──
  ball(0, 10, 0, 2.2, WOOL_HI);         // top crest
  ball(-2.5, 9, 1.5, 1.7, WOOL_HI);
  ball(2.5, 9, -1, 1.7, WOOL_HI);
  ball(1.5, 9.5, 3, 1.5, WOOL);
  ball(-1.5, 9.5, -3, 1.5, WOOL);
  ball(-4, 6.5, 0, 1.4, WOOL);          // side puffs
  ball(4, 6.5, 1, 1.4, WOOL);

  // ── tail (small white puff at the back) ──
  ball(0, 7.5, -5.5, 1.2, WOOL_HI);

  // ── head (dark face at the front, +Z) ──
  fill(-1, 6, 5, 1, 9, 7, DARK);        // skull
  fill(-1, 5, 7, 1, 6, 8, DARK);        // muzzle (juts forward + down)
  vox(0, 5, 8, 0x1a1512);               // nose tip
  // eyes (white, set into the face)
  vox(-1, 8, 7, EYE, 0); vox(1, 8, 7, EYE, 0);
  // ears (dark, sticking out sideways)
  fill(2, 7, 5, 3, 8, 6, DARK);
  fill(-3, 7, 5, -2, 8, 6, DARK);
  // wool cap on top of the head
  ball(0, 9.5, 5, 1.8, WOOL_HI);

  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}
