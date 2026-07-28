// ─────────────────────────────────────────────────────────────
// engine/sheep — standalone sheep builder
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C = 0.11;
const woolMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const darkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const skinMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const tmpCol = new THREE.Color();

function addVox(g: THREE.Group, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: number) {
  const geos: THREE.BoxGeometry[] = [];
  for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++)
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++)
      for (let z = Math.ceil(cz - rz); z <= Math.floor(cz + rz); z++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
        if (dx * dx + dy * dy + dz * dz <= 1.05) {
          const gg = new THREE.BoxGeometry(C, C, C);
          gg.translate(x * C, y * C, z * C);
          const f = 0.92 + Math.random() * 0.12;
          tmpCol.setHex(color).multiplyScalar(f);
          const n = gg.attributes.position.count;
          const arr = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
          gg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
          geos.push(gg);
        }
      }
  if (!geos.length) return;
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((gg) => gg.dispose());
  const m = new THREE.Mesh(merged, color === 0xf2efe6 ? woolMat : (color === 0xc9b89a ? skinMat : darkMat));
  m.position.set(cx * C, cy * C, cz * C);
  m.castShadow = true;
  g.add(m);
}

/**
 * Build a sheep model — reusable field prop for tavern exterior cutscenes AND
 * any future outdoor/overworld scene. Caller scales via `.scale.setScalar(s)`
 * if a different size is needed (intro uses 0.45; the model is built at 1.0).
 */
export function buildSheep(): THREE.Group {
  const g = new THREE.Group();

  // ── four legs first so we can anchor the body on top of them ──
  // Legs: box voxels stacked from y=0 (ground) up to y=8 (where the body's
  // underside sits). Caller should leave the group at origin (y=0) so legs
  // stand on the ground.
  for (const [lx, lz] of [[5, 6], [-5, 6], [5, -6], [-5, -6]] as const) {
    for (let ly = 0; ly < 9; ly++) {
      const g2 = new THREE.BoxGeometry(C, C, C);
      g2.translate(lx * C, ly * C, lz * C);
      const n = g2.attributes.position.count;
      const arr = new Float32Array(n * 3);
      tmpCol.setHex(0x2a2622);
      for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
      g2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      const merged = mergeGeometries([g2], false)!;
      const m = new THREE.Mesh(merged, darkMat);
      m.castShadow = true; g.add(m);
    }
  }

  // ── body sits ON the legs: cy moved from 9.5 → 8 (top of legs is ly=8),
  //    ry reduced from 8 → 6 so body fits between leg-tops and the wool tufts. ──
  addVox(g, 0.5, 8, 0, 11, 6, 14, 0xf2efe6);
  // wool tufts — moved down by 1.5 to keep their world-y consistent
  for (const [dx, dy, dz] of [[6, 11.5, 5], [-6, 11.5, -3], [3, 13.5, -6], [-3, 12.5, 6], [4, 10.5, -5]] as const) {
    addVox(g, dx, dy, dz, 3, 3, 3, 0xf2efe6);
  }

  // head — also dropped by 1.5 so it stays attached to the body
  addVox(g, 0, 9.5, 12, 4, 4, 4, 0xc9b89a);
  // ears + eyes — shifted down by 1.5
  for (const s of [-1, 1]) {
    addVox(g, s * 3, 11.5, 12, 1, 2, 1, 0xc9b89a);
    for (let ey = 9.5; ey <= 10.5; ey++) {
      const g2 = new THREE.BoxGeometry(C * 0.8, C * 0.8, C * 0.8);
      g2.translate(s * 1.5 * C, ey * C, 15 * C);
      const n = g2.attributes.position.count;
      const arr = new Float32Array(n * 3);
      tmpCol.setHex(0x2a2622);
      for (let i = 0; i < n; i++) { arr[i * 3] = tmpCol.r; arr[i * 3 + 1] = tmpCol.g; arr[i * 3 + 2] = tmpCol.b; }
      g2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      const merged = mergeGeometries([g2], false)!;
      const m = new THREE.Mesh(merged, darkMat);
      g.add(m);
    }
  }
  return g;
}
