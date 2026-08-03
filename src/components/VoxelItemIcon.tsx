// ─────────────────────────────────────────────────────────────
// VoxelItemIcon — renders a voxel representation of an item to a
// small offscreen THREE canvas (no emoji). Weapons get a real voxel
// blade/staff/bow; armor/trinkets/consumables get a stylised voxel
// shape. Self-contained (own renderer + loop), no GameEngine coupling.
//
// Richer-detail pass: voxel pitch halved (V = 0.5 world units) so each
// model carries roughly twice the resolution per axis — tapered blades,
// crossguards, flanged maces, recurve bows, potion bottles with visible
// liquid, pauldron'd chest pieces, and stacked coin piles. The camera is
// auto-framed from the model's bounding box so any density stays framed.
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
const V = 0.5;                       // voxel pitch (world units per grid step)
const METAL = 0xb8c0cc;
const METAL_DARK = 0x7a828e;
const WOOD = 0x6b4a2e;
const GRIP = 0x4a3421;
const GOLD = 0xffd76b;
const GLASS = 0xcfe8f5;

function shade(hex: number, f: number): number {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f);
  c.g = Math.min(1, c.g * f);
  c.b = Math.min(1, c.b * f);
  return c.getHex();
}

function addVox(g: THREE.Group, gx: number, gy: number, gz: number, color: number, s = 1) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(V * s, V * s, V * s),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(gx * V, gy * V, gz * V);
  m.castShadow = true;
  g.add(m);
}

function buildWeaponModel(kind: string, accent: number): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'sword': {
      // pommel + grip + crossguard, then a blade that tapers 3→1 wide
      addVox(g, 0, -1, 0, accent);
      addVox(g, 0, 0, 0, GRIP);
      addVox(g, 0, 1, 0, GRIP);
      addVox(g, -2, 2, 0, METAL_DARK); addVox(g, -1, 2, 0, METAL_DARK);
      addVox(g, 0, 2, 0, METAL_DARK); addVox(g, 1, 2, 0, METAL_DARK); addVox(g, 2, 2, 0, METAL_DARK);
      addVox(g, -1, 3, 0, METAL); addVox(g, 0, 3, 0, METAL); addVox(g, 1, 3, 0, METAL);
      addVox(g, -1, 4, 0, METAL); addVox(g, 0, 4, 0, METAL); addVox(g, 1, 4, 0, METAL);
      addVox(g, 0, 5, 0, METAL); addVox(g, 1, 5, 0, METAL);
      addVox(g, 0, 6, 0, METAL);
      addVox(g, 0, 7, 0, METAL);
      addVox(g, 0, 8, 0, shade(METAL, 1.25));
      break;
    }
    case 'dagger': {
      // leaf-blade dagger with small guard
      addVox(g, 0, -1, 0, accent);
      addVox(g, 0, 0, 0, GRIP);
      addVox(g, 0, 1, 0, GRIP);
      addVox(g, -1, 2, 0, METAL_DARK); addVox(g, 0, 2, 0, METAL_DARK); addVox(g, 1, 2, 0, METAL_DARK);
      addVox(g, -1, 3, 0, METAL); addVox(g, 0, 3, 0, METAL); addVox(g, 1, 3, 0, METAL);
      addVox(g, 0, 4, 0, METAL); addVox(g, 1, 4, 0, METAL);
      addVox(g, 0, 5, 0, METAL); addVox(g, 1, 5, 0, METAL);
      addVox(g, 0, 6, 0, METAL);
      addVox(g, 0, 7, 0, shade(METAL, 1.25));
      break;
    }
    case 'club': {
      // gnarled cudgel: wrapped grip, knotted head
      addVox(g, 0, 0, 0, GRIP); addVox(g, 1, 0, 0, GRIP); addVox(g, -1, 0, 0, GRIP);
      addVox(g, 0, 1, 0, GRIP); addVox(g, 0, 2, 0, GRIP);
      addVox(g, -1, 3, 0, accent); addVox(g, 0, 3, 0, accent); addVox(g, 1, 3, 0, accent);
      addVox(g, -1, 4, 0, accent); addVox(g, 0, 4, 0, accent); addVox(g, 1, 4, 0, accent);
      addVox(g, 0, 5, 0, accent); addVox(g, 1, 5, 0, shade(accent, 0.85)); addVox(g, -1, 5, 0, shade(accent, 0.85));
      addVox(g, 0, 4, 1, shade(accent, 0.7)); addVox(g, 0, 4, -1, shade(accent, 0.7));
      break;
    }
    case 'mace': {
      // flanged war-mace: wrapped grip, octagonal flanged head
      addVox(g, 0, 0, 0, GRIP); addVox(g, 1, 0, 0, GRIP); addVox(g, -1, 0, 0, GRIP);
      addVox(g, 0, 1, 0, GRIP); addVox(g, 0, 2, 0, METAL_DARK);
      addVox(g, 0, 3, 0, METAL);
      addVox(g, 1, 3, 0, METAL); addVox(g, -1, 3, 0, METAL); addVox(g, 0, 3, 1, METAL); addVox(g, 0, 3, -1, METAL);
      addVox(g, 0, 4, 0, METAL);
      addVox(g, 1, 4, 0, METAL); addVox(g, -1, 4, 0, METAL); addVox(g, 0, 4, 1, METAL); addVox(g, 0, 4, -1, METAL);
      addVox(g, 1, 4, 1, shade(METAL, 1.2)); addVox(g, 1, 4, -1, shade(METAL, 1.2));
      addVox(g, -1, 4, 1, shade(METAL, 1.2)); addVox(g, -1, 4, -1, shade(METAL, 1.2));
      addVox(g, 0, 5, 0, shade(METAL, 1.3));
      break;
    }
    case 'staff': {
      // quarterstaff with crystal orb + metal ferrules
      addVox(g, 0, -4, 0, METAL_DARK);
      for (let y = -3; y <= 3; y++) addVox(g, 0, y, 0, WOOD);
      addVox(g, 0, 4, 0, accent);
      addVox(g, 1, 4, 0, shade(accent, 0.7)); addVox(g, -1, 4, 0, shade(accent, 0.7));
      addVox(g, 0, 4, 1, shade(accent, 0.7)); addVox(g, 0, 4, -1, shade(accent, 0.7));
      addVox(g, 1, 0, 0, shade(WOOD, 0.8)); addVox(g, -1, 0, 0, shade(WOOD, 0.8));
      addVox(g, 0, 1, 1, shade(WOOD, 0.9)); addVox(g, 0, -1, 1, shade(WOOD, 0.9));
      break;
    }
    case 'bow': {
      // recurve bow arc + wrapped grip
      addVox(g, -2, 0, 0, WOOD); addVox(g, -1, 0, 0, WOOD); addVox(g, 0, 0, 0, GRIP);
      addVox(g, 1, 0, 0, WOOD); addVox(g, 2, 0, 0, WOOD);
      addVox(g, -2, 1, 0, WOOD); addVox(g, -1, 1, 0, WOOD); addVox(g, 0, 1, 0, GRIP);
      addVox(g, 1, 1, 0, WOOD); addVox(g, 2, 1, 0, WOOD);
      addVox(g, -2, 2, 0, WOOD); addVox(g, -1, 2, 0, WOOD); addVox(g, 0, 2, 0, WOOD);
      addVox(g, 1, 2, 0, WOOD); addVox(g, 2, 2, 0, WOOD);
      addVox(g, -2, 3, 0, accent); addVox(g, -1, 3, 0, WOOD); addVox(g, 0, 3, 0, WOOD);
      addVox(g, 1, 3, 0, WOOD); addVox(g, 2, 3, 0, accent);
      break;
    }
    case 'torch': {
      // wooden handle + wrapping, flaming head with embers
      addVox(g, 0, 0, 0, WOOD); addVox(g, 0, 1, 0, WOOD); addVox(g, 0, 2, 0, WOOD); addVox(g, 0, 3, 0, WOOD);
      addVox(g, 1, 1, 0, GRIP); addVox(g, -1, 1, 0, GRIP); addVox(g, 0, 1, 1, GRIP); addVox(g, 0, 1, -1, GRIP);
      addVox(g, 0, 4, 0, 0x3a2a18);
      addVox(g, 1, 4, 0, 0xff8c1a); addVox(g, -1, 4, 0, 0xff8c1a);
      addVox(g, 0, 4, 1, 0xff8c1a); addVox(g, 0, 4, -1, 0xff8c1a);
      addVox(g, 0, 5, 0, 0xffb545);
      addVox(g, 1, 5, 0, 0xff8c1a); addVox(g, -1, 5, 0, 0xff8c1a);
      addVox(g, 0, 5, 1, 0xff8c1a); addVox(g, 0, 5, -1, 0xff8c1a);
      addVox(g, 0, 6, 0, 0xffd76b);
      addVox(g, 0, 7, 0, 0xfff3a0);
      break;
    }
    default: {
      // generic long blade
      addVox(g, 0, -1, 0, accent);
      addVox(g, 0, 0, 0, GRIP); addVox(g, 0, 1, 0, GRIP);
      addVox(g, -1, 2, 0, METAL_DARK); addVox(g, 0, 2, 0, METAL_DARK); addVox(g, 1, 2, 0, METAL_DARK);
      addVox(g, -1, 3, 0, METAL); addVox(g, 0, 3, 0, METAL); addVox(g, 1, 3, 0, METAL);
      addVox(g, 0, 4, 0, METAL); addVox(g, 1, 4, 0, METAL);
      addVox(g, 0, 5, 0, METAL);
      addVox(g, 0, 6, 0, METAL);
    }
  }
  return g;
}

function buildArmorModel(kind: string): THREE.Group {
  const g = new THREE.Group();
  const c = kind === 'plate' ? 0xb8bfc9 : kind === 'chain' ? 0x9aa0a8 : kind === 'leather' ? 0x6b4423 : 0xcfc4a8;
  // chest piece — 3 wide × 4 tall × 2 deep, with shoulder pauldrons
  for (let y = 0; y <= 3; y++) {
    addVox(g, -1, y, 0, shade(c, y === 3 ? 0.92 : 1));
    addVox(g, 0, y, 0, c);
    addVox(g, 1, y, 0, shade(c, y === 3 ? 0.92 : 1));
    addVox(g, -1, y, 1, shade(c, 0.8));
    addVox(g, 0, y, 1, shade(c, 0.85));
    addVox(g, 1, y, 1, shade(c, 0.8));
  }
  // pauldrons — flare out at the shoulders
  addVox(g, 2, 3, 0, shade(c, 0.95)); addVox(g, 2, 3, 1, shade(c, 0.8));
  addVox(g, -2, 3, 0, shade(c, 0.95)); addVox(g, -2, 3, 1, shade(c, 0.8));
  addVox(g, 2, 2, 0, shade(c, 0.85)); addVox(g, -2, 2, 0, shade(c, 0.85));
  // belt
  addVox(g, -1, 0, 0, 0x8a5a2a); addVox(g, 0, 0, 0, 0x8a5a2a); addVox(g, 1, 0, 0, 0x8a5a2a);
  // collar highlight
  addVox(g, 0, 3, 1, shade(c, 1.15));
  return g;
}

function buildConsumableModel(liquid: number): THREE.Group {
  const g = new THREE.Group();
  // potion bottle — glass shell with visible liquid core and cork
  addVox(g, -1, 0, 0, GLASS); addVox(g, 1, 0, 0, GLASS);
  addVox(g, -1, 1, 0, GLASS); addVox(g, 1, 1, 0, GLASS);
  addVox(g, -1, 2, 0, GLASS); addVox(g, 1, 2, 0, GLASS);
  addVox(g, 0, 0, 1, GLASS); addVox(g, 0, 1, 1, GLASS); addVox(g, 0, 2, 1, GLASS);
  // liquid inside
  addVox(g, 0, 0, 0, liquid); addVox(g, 0, 1, 0, liquid); addVox(g, 0, 2, 0, liquid);
  // neck + cork
  addVox(g, 0, 3, 0, GLASS);
  addVox(g, 0, 4, 0, WOOD);
  // glint highlight
  addVox(g, 1, 1, 1, shade(GLASS, 1.3));
  return g;
}

function buildTrinketModel(accent: number): THREE.Group {
  const g = new THREE.Group();
  // coin stack + scattered coins + gem on top
  addVox(g, 0, 0, 0, GOLD); addVox(g, 0, 1, 0, GOLD); addVox(g, 0, 2, 0, GOLD);
  addVox(g, 0, 0, 1, shade(GOLD, 0.85)); addVox(g, 0, 1, 1, shade(GOLD, 0.85)); addVox(g, 0, 2, 1, shade(GOLD, 0.85));
  addVox(g, 1, 0, 0, GOLD); addVox(g, -1, 0, 0, GOLD);
  addVox(g, 1, 1, 0, shade(GOLD, 0.9)); addVox(g, -1, 1, 0, shade(GOLD, 0.9));
  addVox(g, 1, 0, 1, shade(GOLD, 0.8)); addVox(g, -1, 0, 1, shade(GOLD, 0.8));
  addVox(g, 0, 3, 0, accent);
  addVox(g, 1, 3, 0, shade(accent, 0.75)); addVox(g, -1, 3, 0, shade(accent, 0.75));
  addVox(g, 0, 3, 1, shade(accent, 0.75));
  return g;
}

function buildItemModel(item: Item): THREE.Group {
  if (item.kind === 'weapon') return buildWeaponModel(item.weaponKind ?? 'sword', 0xc9a227);
  if (item.kind === 'armor') {
    const n = item.name.toLowerCase();
    const kind = n.includes('plate') ? 'plate' : n.includes('chain') ? 'chain' : n.includes('leather') ? 'leather' : 'shirt';
    return buildArmorModel(kind);
  }
  if (item.kind === 'consumable') {
    const n = item.name.toLowerCase();
    const liquid = n.includes('heal') || n.includes('potion')
      ? 0x6ee7b7
      : n.includes('antidote') || n.includes('poison')
        ? 0xbef264
        : 0x7dd3fc;
    return buildConsumableModel(liquid);
  }
  return buildTrinketModel(0x7dd3fc);
}

export function VoxelItemIcon({ item, size = 40, spin = false }: Props) {
  const mount = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b12);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

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
    // centre the model on its bounding box, then frame the camera on it so
    // denser models (this pass) and bigger models both fit with margin.
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.y -= center.y;
    model.position.z -= center.z;
    const size3 = box.getSize(new THREE.Vector3());
    const maxExt = Math.max(size3.x, size3.y, size3.z);
    const dist = Math.max(4, maxExt * 2.4);
    camera.position.set(dist * 0.72, dist * 0.5, dist * 0.95);
    camera.lookAt(0, 0, 0);
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
