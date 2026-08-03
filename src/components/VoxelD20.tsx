// ─────────────────────────────────────────────────────────────
// VoxelD20 — a REAL 3D voxel d20 for the dice-roll overlay.
// The icosahedron is voxel-sculpted (sampled on a grid, colored per
// face, two-tone like a classic d20) and tumbles with a RANDOM spin
// axis each roll, then settles. Self-contained renderer, no engine
// coupling (same pattern as VoxelItemIcon).
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** the 20 face normals of a unit icosahedron (THREE gives us the verts) */
const FACE_NORMALS: THREE.Vector3[] = (() => {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    out.push(new THREE.Vector3().addVectors(a, b).add(c).normalize());
  }
  return out;
})();

function buildD20Mesh(): THREE.Mesh {
  // voxel-sculpt the icosahedron: for every grid cell, project onto the
  // unit sphere, find its nearest face, and keep it if the sphere radius
  // at that direction fits inside the icosahedron's surface.
  const P = 0.42;              // voxel pitch
  const N = 17;                // cells across the grid (odd → center cell)
  const R = 1.0;               // icosahedron circumradius
  const DARK = 0x3a2a52, LIGHT = 0xe8d9a8, EDGE = 0xc9a227;
  const geos: THREE.BufferGeometry[] = [];
  const half = (N - 1) / 2;
  const tmp = new THREE.Color();

  for (let ix = -half; ix <= half; ix++) {
    for (let iy = -half; iy <= half; iy++) {
      for (let iz = -half; iz <= half; iz++) {
        const vx = (ix / half) * R, vy = (iy / half) * R, vz = (iz / half) * R;
        const len = Math.hypot(vx, vy, vz);
        if (len < 1e-6 || len > R * 1.02) continue;
        const d = new THREE.Vector3(vx / len, vy / len, vz / len);
        // nearest face
        let best = 0, bestDot = -Infinity;
        for (let f = 0; f < 20; f++) {
          const dot = d.dot(FACE_NORMALS[f]);
          if (dot > bestDot) { bestDot = dot; best = f; }
        }
        // surface radius along d = intersection with the face plane:
        // the face plane is at distance R*cos(maxAngle) from center
        const faceR = R * 0.809 / Math.max(0.35, bestDot);
        if (len > faceR) continue;
        // two-tone per face, edge faces brighter
        const edgeish = Math.abs(bestDot) < 0.68;
        tmp.setHex((best & 1) === 0 ? DARK : LIGHT);
        if (edgeish) tmp.lerp(new THREE.Color(EDGE), 0.45);
        tmp.multiplyScalar(0.82 + 0.25 * (len / R));
        const g = new THREE.BoxGeometry(P, P, P);
        g.translate(vx, vy, vz);
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geos.push(g);
      }
    }
  }
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  return new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

export function VoxelD20({ seed }: { seed: number }) {
  const mount = useRef<HTMLDivElement | null>(null);
  const seedRef = useRef(seed);
  seedRef.current = seed;

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const w = 150, h = 150;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
    camera.position.set(0, 0.25, 4.4);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.5);
    key.position.set(2.4, 3.2, 2.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7dd3fc, 0.7);
    rim.position.set(-3, -1, -2.5);
    scene.add(rim);

    const die = buildD20Mesh();
    die.scale.setScalar(0.85);
    scene.add(die);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(renderer.domElement);

    // ── random tumble: fresh spin axis + speeds every roll ──
    let rx = Math.random() * Math.PI * 2, ry = Math.random() * Math.PI * 2, rz = Math.random() * Math.PI * 2;
    let vx = (Math.random() - 0.5) * 16, vy = (Math.random() - 0.5) * 16, vz = (Math.random() - 0.5) * 16;
    const t0 = performance.now();
    const TUMBLE = 1500;
    let raf = 0;
    const loop = () => {
      const t = performance.now() - t0;
      const dt = Math.min(0.05, (performance.now() - (loop as any)._last) / 1000 || 0.016);
      (loop as any)._last = performance.now();
      if (t < TUMBLE) {
        const k = Math.max(0, 1 - t / TUMBLE);
        rx += vx * dt * k; ry += vy * dt * k; rz += vz * dt * k;
        die.rotation.set(rx, ry, rz);
        // landing bounce
        die.scale.setScalar(0.85 + Math.sin((t / TUMBLE) * Math.PI) * 0.08);
      } else {
        // settle: a lazy idle drift so the die feels alive
        ry += dt * 0.12;
        die.rotation.set(rx, ry, rz);
        die.scale.setScalar(0.85);
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      die.geometry.dispose();
      (die.material as THREE.Material).dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [seedRef.current]);

  return <div ref={mount} style={{ width: 150, height: 150 }} />;
}
