// ─────────────────────────────────────────────────────────────
// VoxelItemIcon — renders a voxel representation of an item to a
// small offscreen THREE canvas (no emoji). Weapons get a real voxel
// blade/staff/bow; armor/trinkets/consumables get a stylised voxel
// shape. Self-contained (own renderer + loop), no GameEngine coupling.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Item } from '@/game/items';

interface Props {
  item: Item;
  size?: number;
  spin?: boolean;   // slow auto-rotate (used by the inspect view)
}

// ── voxel model builders ─────────────────────────────────────
const METAL = 0xb8c0cc;
const METAL_DARK = 0x7a828e;
const WOOD = 0x6b4a2e;
const GRIP = 0x4a3421;

function addVox(g: THREE.Group, x: number, y: number, z: number, color: number, s = 1) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(s, s, s),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
}

function buildWeaponModel(kind: string, accent: number): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'sword':
      addVox(g, 0, 0, 0, GRIP); addVox(g, 0, 1, 0, METAL_DARK);
      addVox(g, 0, 2, 0, METAL); addVox(g, 0, 3, 0, METAL); addVox(g, 0, 4, 0, METAL);
      addVox(g, 0, 5, 0, METAL); addVox(g, 0, 6, 0, METAL);
      break;
    case 'dagger':
      addVox(g, 0, 0, 0, GRIP); addVox(g, 0, 1, 0, METAL);
      addVox(g, 0, 2, 0, METAL); addVox(g, 0, 3, 0, METAL);
      break;
    case 'club':
      addVox(g, 0, 0, 0, GRIP); addVox(g, 0, 1, 0, GRIP); addVox(g, 0, 2, 0, GRIP);
      addVox(g, 0, 3, 0, accent); addVox(g, 0, 4, 0, accent);
      break;
    case 'mace':
      addVox(g, 0, 0, 0, GRIP); addVox(g, 0, 1, 0, GRIP); addVox(g, 0, 2, 0, GRIP);
      addVox(g, 0, 3, 0, METAL); addVox(g, 0, 4, 0, METAL);
      addVox(g, 1, 3, 0, METAL); addVox(g, -1, 3, 0, METAL);
      addVox(g, 0, 3, 1, METAL); addVox(g, 0, 3, -1, METAL);
      break;
    case 'staff':
      addVox(g, 0, -2, 0, WOOD); addVox(g, 0, -1, 0, WOOD); addVox(g, 0, 0, 0, WOOD);
      addVox(g, 0, 1, 0, WOOD); addVox(g, 0, 2, 0, WOOD); addVox(g, 0, 3, 0, WOOD);
      addVox(g, 0, 4, 0, accent);
      break;
    case 'bow':
      addVox(g, 0, 0, 0, WOOD); addVox(g, 0, 1, 0, WOOD); addVox(g, 0, 2, 0, WOOD);
      addVox(g, 0, 3, 0, WOOD); addVox(g, 0, 4, 0, WOOD);
      addVox(g, 1, 0, 0, WOOD); addVox(g, 1, 4, 0, WOOD);
      break;
    case 'torch':
      addVox(g, 0, 0, 0, WOOD); addVox(g, 0, 1, 0, WOOD); addVox(g, 0, 2, 0, WOOD);
      addVox(g, 0, 3, 0, 0x3a2a18);
      addVox(g, 0, 4, 0, 0xffb545);
      break;
    default:
      addVox(g, 0, 0, 0, METAL); addVox(g, 0, 1, 0, METAL); addVox(g, 0, 2, 0, METAL);
  }
  return g;
}

function buildArmorModel(kind: string): THREE.Group {
  const g = new THREE.Group();
  const c = kind === 'plate' ? 0xb8bfc9 : kind === 'chain' ? 0x9aa0a8 : kind === 'leather' ? 0x6b4423 : 0xcfc4a8;
  // a stylised chest piece
  addVox(g, 0, 0, 0, c); addVox(g, 0, 1, 0, c); addVox(g, 0, 2, 0, c);
  addVox(g, 1, 0, 0, c); addVox(g, -1, 0, 0, c);
  addVox(g, 1, 1, 0, c); addVox(g, -1, 1, 0, c);
  return g;
}

function buildConsumableModel(): THREE.Group {
  const g = new THREE.Group();
  // a little potion bottle
  addVox(g, 0, 0, 0, 0x2a9ad0); addVox(g, 0, 1, 0, 0x2a9ad0);
  addVox(g, 0, 2, 0, 0x8a5a2a); addVox(g, 0, 3, 0, 0x8a5a2a);
  return g;
}

function buildTrinketModel(): THREE.Group {
  const g = new THREE.Group();
  addVox(g, 0, 0, 0, 0xffd76b); addVox(g, 0, 1, 0, 0xffd76b);
  addVox(g, 1, 0, 0, 0xffd76b); addVox(g, -1, 0, 0, 0xffd76b);
  return g;
}

function buildItemModel(item: Item): THREE.Group {
  if (item.kind === 'weapon') return buildWeaponModel(item.weaponKind ?? 'sword', 0xc9a227);
  if (item.kind === 'armor') return buildArmorModel(item.name.toLowerCase().includes('plate') ? 'plate' : item.name.toLowerCase().includes('chain') ? 'chain' : item.name.toLowerCase().includes('leather') ? 'leather' : 'shirt');
  if (item.kind === 'consumable') return buildConsumableModel();
  return buildTrinketModel();
}

export function VoxelItemIcon({ item, size = 40, spin = false }: Props) {
  const mount = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b12);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(2.4, 1.6, 2.8);
    camera.lookAt(0, 0.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.1);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe6c0, 1.4);
    key.position.set(2, 4, 2);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
    rim.position.set(-2, 1, -2);
    scene.add(rim);

    const model = buildItemModel(item);
    model.position.y = 0;
    scene.add(model);

    let raf = 0;
    let disposed = false;
    const loop = () => {
      if (disposed) return;
      if (spin) model.rotation.y += 0.02;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [item, size, spin]);

  return <div ref={mount} className="voxel-item-icon" style={{ width: size, height: size }} />;
}
