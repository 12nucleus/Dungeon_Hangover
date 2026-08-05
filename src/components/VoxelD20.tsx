// A clean, low-poly d20 for the rare roll overlay.
// The die is deliberately faceted rather than voxel-sculpted: the old sampled
// cube volume produced lumpy silhouettes and noisy shading at this scale.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function buildD20Mesh(): { die: THREE.Mesh; edge: THREE.LineSegments } {
  const geometry = new THREE.IcosahedronGeometry(1.08, 0);
  const palette = [0x6d3f8e, 0x8f5aa8, 0x4b2d6d, 0xc28a32, 0x9e6d28];
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < geometry.attributes.position.count; i += 3) {
    color.setHex(palette[(i / 3) % palette.length]);
    for (let j = 0; j < 3; j++) {
      const k = (i + j) * 3;
      colors[k] = color.r;
      colors[k + 1] = color.g;
      colors[k + 2] = color.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const die = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.18,
    flatShading: true,
  }));
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 18),
    new THREE.LineBasicMaterial({ color: 0xf6d477, transparent: true, opacity: 0.82 }),
  );
  edge.scale.setScalar(1.002);
  return { die, edge };
}

export function VoxelD20({ seed }: { seed: number }) {
  const mount = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const size = 164;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.set(0, 0.05, 4.2);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xfff1ce, 0x171326, 1.7));
    const key = new THREE.DirectionalLight(0xffe8ae, 2.2);
    key.position.set(2.5, 3.5, 3.2);
    scene.add(key);
    const rim = new THREE.PointLight(0x8c5cff, 1.8, 8);
    rim.position.set(-2.5, 0.5, -2.5);
    scene.add(rim);

    const { die, edge } = buildD20Mesh();
    scene.add(die, edge);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    // Stable per-roll motion: a fast, eased tumble followed by a readable
    // settle instead of the previous random angular-velocity snap.
    let state = seed >>> 0;
    const rand = () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6));
    const finish = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35 + rand() * 0.35, -0.45 + rand() * 0.7, 0.15 + rand() * 0.35));
    const tumble = new THREE.Quaternion().setFromAxisAngle(axis, (3.2 + rand() * 1.2) * Math.PI * 2);
    const spinEnd = start.clone().multiply(tumble);
    const t0 = performance.now();
    const duration = 1050;
    let raf = 0;
    const ease = (t: number) => t < 0.72 ? (t / 0.72) ** 0.72 : 1 - ((1 - t) / 0.28) ** 2;
    const loop = () => {
      const elapsed = performance.now() - t0;
      const t = Math.min(1, elapsed / duration);
      const q = new THREE.Quaternion();
      if (t < 0.72) {
        q.copy(start).slerp(spinEnd, ease(t / 0.72));
      } else {
        q.copy(spinEnd).slerp(finish, ease((t - 0.72) / 0.28));
      }
      die.quaternion.copy(q);
      edge.quaternion.copy(q);
      const bounce = t < 1 ? Math.sin(Math.min(1, t) * Math.PI) * 0.075 : 0;
      die.scale.setScalar(1 + bounce);
      edge.scale.setScalar(1.002 + bounce);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      die.geometry.dispose();
      (die.material as THREE.Material).dispose();
      edge.geometry.dispose();
      (edge.material as THREE.Material).dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [seed]);

  return <div ref={mount} style={{ width: 164, height: 164 }} />;
}
