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
import { attachVoxelView, addTicker, removeTicker } from './voxelView';

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
// floor-50 palette
const DUCK = 0xf2c14e;        // rubber duck
const BEAK = 0xf28c28;
const CHEESE = 0xffd75e;
const CHEESE_DARK = 0xd9a83c;
const MUSH_CAP = 0x8a4a2e;    // brown mushroom
const MUSH_STEM = 0xd8cfc0;
const GLOW = 0x7dd3fc;        // glowing mushroom / holy water
const WINE = 0x3a4a2e;        // dark green glass
const SUD = 0xffd9ec;         // soap suds
const SOAP_PINK = 0xff9ac0;
const SOAP_WHITE = 0xf0ece4;
const PAPER = 0xe8e0c8;
const FLESH = 0xd8a878;
const BONE = 0xe8e0d0;
const STEEL = 0x8a92a0;
const BRASS = 0xc9a227;
const RUBBER = 0xcf3a2e;      // plunger cup
const INK = 0x2a2a3a;

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
  const b = BASE_MODELS[item._baseId ?? ''];
  if (b) return b();
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

// ══ per-base item models (floor 50) ════════════════════════
// Every distinctive sewer-cellar item gets its own voxel shape instead of
// the generic kind fallback (a rubber duck is NOT a potion).

function modelDuck(): THREE.Group {
  const g = new THREE.Group();
  // body
  addVox(g, 0, 0, 0, DUCK); addVox(g, 0, 1, 0, DUCK);
  addVox(g, -1, 0, 0, shade(DUCK, 0.92)); addVox(g, 1, 0, 0, DUCK);
  addVox(g, 0, 0, 1, shade(DUCK, 0.85)); addVox(g, 0, 0, -1, shade(DUCK, 0.85));
  // head + beak
  addVox(g, 0, 2, 0, DUCK); addVox(g, 0, 2, 1, shade(DUCK, 0.9));
  addVox(g, 0, 1, 2, BEAK); addVox(g, 0, 2, 2, BEAK);
  // eye
  addVox(g, 1, 2, 1, INK);
  // tail nub
  addVox(g, -1, 1, 0, shade(DUCK, 0.95));
  return g;
}

function modelCheese(): THREE.Group {
  const g = new THREE.Group();
  // wedge 4×3×2 with a sloping top
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 4 - y; x++) {
      addVox(g, x, y, 0, y === 2 ? CHEESE_DARK : CHEESE);
      addVox(g, x, y, 1, shade(CHEESE, y === 2 ? 0.8 : 0.9));
    }
  }
  // holes
  addVox(g, 1, 1, 0, shade(CHEESE_DARK, 0.7)); addVox(g, 2, 0, 1, shade(CHEESE_DARK, 0.7));
  addVox(g, 0, 0, 0, shade(CHEESE_DARK, 0.7));
  return g;
}

function mushroom(glow: boolean): THREE.Group {
  const g = new THREE.Group();
  const cap = glow ? GLOW : MUSH_CAP;
  // stem
  addVox(g, 0, 0, 0, MUSH_STEM); addVox(g, 0, 1, 0, MUSH_STEM); addVox(g, 0, 2, 0, MUSH_STEM);
  // cap
  addVox(g, -1, 3, 0, cap); addVox(g, 0, 3, 0, shade(cap, 1.1)); addVox(g, 1, 3, 0, cap);
  addVox(g, -1, 3, 1, shade(cap, 0.85)); addVox(g, 0, 3, 1, shade(cap, 0.9)); addVox(g, 1, 3, 1, shade(cap, 0.85));
  addVox(g, -2, 4, 0, shade(cap, 0.95)); addVox(g, 2, 4, 0, shade(cap, 0.95));
  if (glow) { addVox(g, 0, 5, 0, shade(GLOW, 1.3)); addVox(g, 0, 3, 2, shade(GLOW, 1.2)); }
  return g;
}

function modelBottle(color: number, liquid: number | null): THREE.Group {
  const g = new THREE.Group();
  // body
  addVox(g, -1, 0, 0, color); addVox(g, 1, 0, 0, color);
  addVox(g, -1, 1, 0, color); addVox(g, 1, 1, 0, color);
  addVox(g, -1, 2, 0, color); addVox(g, 1, 2, 0, color);
  addVox(g, 0, 0, 1, shade(color, 0.85)); addVox(g, 0, 1, 1, shade(color, 0.85)); addVox(g, 0, 2, 1, shade(color, 0.85));
  if (liquid != null) { addVox(g, 0, 0, 0, liquid); addVox(g, 0, 1, 0, liquid); }
  // neck + cork
  addVox(g, 0, 3, 0, color);
  addVox(g, 0, 4, 0, WOOD);
  return g;
}

function modelHolyWater(): THREE.Group {
  const g = modelBottle(GLASS, GLOW);
  // glowing cross on the glass
  addVox(g, 0, 3, 1, shade(GLOW, 1.4));
  addVox(g, -1, 2, 1, shade(GLOW, 1.2)); addVox(g, 1, 2, 1, shade(GLOW, 1.2));
  addVox(g, 0, 2, 1, shade(GLOW, 1.4)); addVox(g, 0, 1, 1, shade(GLOW, 1.2));
  return g;
}

function modelTankard(): THREE.Group {
  const g = new THREE.Group();
  // mug body
  for (let y = 0; y < 3; y++) {
    addVox(g, -1, y, 0, METAL_DARK); addVox(g, 0, y, 0, METAL); addVox(g, 1, y, 0, METAL_DARK);
    addVox(g, -1, y, 1, shade(METAL_DARK, 0.8)); addVox(g, 0, y, 1, shade(METAL, 0.85)); addVox(g, 1, y, 1, shade(METAL_DARK, 0.8));
  }
  // handle
  addVox(g, 2, 1, 0, METAL_DARK); addVox(g, 2, 2, 0, METAL_DARK); addVox(g, 2, 0, 0, METAL_DARK);
  // foam
  addVox(g, -1, 3, 0, 0xf0e6c8); addVox(g, 0, 3, 0, 0xf7efd8); addVox(g, 1, 3, 0, 0xf0e6c8);
  addVox(g, 0, 3, 1, 0xf0e6c8);
  return g;
}

function modelSoup(): THREE.Group {
  const g = new THREE.Group();
  // bowl
  for (let y = 0; y < 2; y++) {
    addVox(g, -1, y, 0, 0x8a6a4a); addVox(g, 0, y, 0, 0x9a7a5a); addVox(g, 1, y, 0, 0x8a6a4a);
    addVox(g, -1, y, 1, shade(0x8a6a4a, 0.8)); addVox(g, 0, y, 1, shade(0x9a7a5a, 0.85)); addVox(g, 1, y, 1, shade(0x8a6a4a, 0.8));
  }
  // steaming broth
  addVox(g, 0, 2, 0, 0xcfe8f5); addVox(g, 0, 3, 0, 0xd8f0fa);
  // spoon
  addVox(g, 1, 2, 1, METAL); addVox(g, 1, 3, 1, METAL);
  return g;
}

function modelBubbleBottle(): THREE.Group {
  const g = modelBottle(GLASS, SUD);
  // bubbles floating off
  addVox(g, 2, 3, 0, shade(SUD, 0.9)); addVox(g, -2, 4, 1, shade(SUD, 0.85));
  addVox(g, 2, 5, 1, shade(SUD, 0.95));
  return g;
}

function modelSoap(pink: boolean): THREE.Group {
  const g = new THREE.Group();
  const c = pink ? SOAP_PINK : SOAP_WHITE;
  addVox(g, -1, 0, 0, c); addVox(g, 0, 0, 0, shade(c, 1.05)); addVox(g, 1, 0, 0, c);
  addVox(g, -1, 0, 1, shade(c, 0.9)); addVox(g, 0, 0, 1, shade(c, 0.95)); addVox(g, 1, 0, 1, shade(c, 0.9));
  addVox(g, 0, 1, 0, shade(c, 1.1)); addVox(g, 0, 1, 1, shade(c, 0.95));
  if (pink) { addVox(g, 0, 2, 0, shade(SUD, 0.8)); addVox(g, 1, 2, 0, shade(SUD, 0.85)); }
  return g;
}

function modelKey(rust: boolean): THREE.Group {
  const g = new THREE.Group();
  const c = rust ? 0x9a6a3a : GOLD;
  const d = shade(c, 0.85);
  // bow (ring head)
  addVox(g, -1, 2, 0, c); addVox(g, 0, 2, 0, d);
  addVox(g, -2, 3, 0, c); addVox(g, -1, 3, 0, c); addVox(g, 0, 3, 0, c);
  addVox(g, -2, 2, 0, c);
  addVox(g, -1, 2, 1, d); addVox(g, -2, 2, 1, d); addVox(g, -2, 3, 1, d); addVox(g, -1, 3, 1, d); addVox(g, 0, 3, 1, d);
  // shaft (2 deep)
  addVox(g, 0, 1, 0, c); addVox(g, 0, 1, 1, d);
  addVox(g, 0, 0, 0, c); addVox(g, 0, 0, 1, d);
  addVox(g, 1, 0, 0, c); addVox(g, 1, 0, 1, d);
  addVox(g, 2, 0, 0, c); addVox(g, 2, 0, 1, d);
  // teeth
  addVox(g, 1, -1, 0, c); addVox(g, 2, -1, 0, c);
  return g;
}

function modelFinger(): THREE.Group {
  const g = new THREE.Group();
  const F = FLESH;
  // severed base — the gnawed bone end (2 tall × 2 wide)
  addVox(g, 0, 0, 0, BONE); addVox(g, 0, 1, 0, BONE);
  addVox(g, 0, 0, 1, shade(BONE, 0.9)); addVox(g, 0, 1, 1, shade(BONE, 0.9));
  // flesh shaft — three 2×2 segments
  for (let x = 1; x <= 3; x++) {
    addVox(g, x, 0, 0, F); addVox(g, x, 1, 0, F);
    addVox(g, x, 0, 1, shade(F, 0.9)); addVox(g, x, 1, 1, shade(F, 0.9));
  }
  // silver wedding band wrapped around the middle segment
  addVox(g, 2, 0, 2, METAL); addVox(g, 2, 1, 2, METAL);
  addVox(g, 2, 0, -1, METAL); addVox(g, 2, 1, -1, METAL);
  addVox(g, 2, 2, 0, METAL); addVox(g, 2, 2, 1, METAL);
  addVox(g, 2, -1, 0, METAL); addVox(g, 2, -1, 1, METAL);
  // taper toward the fingertip
  addVox(g, 4, 1, 0, F); addVox(g, 4, 1, 1, shade(F, 0.9));
  // rounded tip
  addVox(g, 5, 1, 0, shade(F, 1.15));
  return g;
}

function modelRing(): THREE.Group {
  const g = new THREE.Group();
  // gold band loop (2 tall, ring with a hole)
  for (let y = 0; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (x === 0 && z === 0) continue;   // the hole
      addVox(g, x, y, z, shade(GOLD, 0.95));
    }
  }
  // gem on top
  addVox(g, 0, 2, 0, 0x7dd3fc); addVox(g, 0, 2, 1, shade(0x7dd3fc, 1.2));
  return g;
}

function modelPenny(): THREE.Group {
  const g = new THREE.Group();
  // a flat gold disc (coin) — 3×3, one thick
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
    if (x === 0 && z === 0) { addVox(g, 0, 0, 0, shade(GOLD, 1.1)); continue; }
    addVox(g, x, 0, z, shade(GOLD, 0.92));
  }
  return g;
}

function modelWhisker(): THREE.Group {
  const g = new THREE.Group();
  const W = 0xe8e4da;
  // a thick, gently-curving whisker (2×2 cross-section)
  addVox(g, 0, 0, 0, W); addVox(g, 0, 0, 1, shade(W, 0.9));
  addVox(g, 1, 0, 0, W); addVox(g, 1, 0, 1, shade(W, 0.9));
  addVox(g, 2, 1, 0, W); addVox(g, 2, 1, 1, shade(W, 0.9));
  addVox(g, 3, 1, 0, W); addVox(g, 3, 1, 1, shade(W, 0.9));
  addVox(g, 4, 2, 0, shade(W, 1.05)); addVox(g, 4, 2, 1, shade(W, 0.95));
  addVox(g, 5, 2, 0, shade(W, 1.1));
  return g;
}

function modelLockpick(): THREE.Group {
  const g = new THREE.Group();
  // long thin shaft with a bent tip (2 deep)
  for (let x = 0; x <= 3; x++) { addVox(g, x, 0, 0, STEEL); addVox(g, x, 0, 1, shade(STEEL, 0.85)); }
  addVox(g, 3, 1, 0, STEEL); addVox(g, 3, 1, 1, shade(STEEL, 0.85));
  addVox(g, 4, 1, 0, STEEL); addVox(g, 4, 1, 1, shade(STEEL, 0.85));
  // wooden handle
  addVox(g, -1, 0, 0, WOOD); addVox(g, -1, 0, 1, shade(WOOD, 0.85));
  addVox(g, -1, 1, 0, WOOD); addVox(g, -1, 1, 1, shade(WOOD, 0.85));
  return g;
}

function modelLetter(): THREE.Group {
  const g = new THREE.Group();
  // folded paper
  addVox(g, -1, 0, 0, PAPER); addVox(g, 0, 0, 0, PAPER); addVox(g, 1, 0, 0, PAPER);
  addVox(g, -1, 0, 1, shade(PAPER, 0.9)); addVox(g, 0, 0, 1, shade(PAPER, 0.9)); addVox(g, 1, 0, 1, shade(PAPER, 0.9));
  addVox(g, 0, 1, 0, shade(PAPER, 0.95)); addVox(g, 0, 1, 1, shade(PAPER, 0.85));
  // wax seal
  addVox(g, 0, 2, 0, 0xcf3a4a); addVox(g, 0, 2, 1, 0xb83240);
  return g;
}

function modelBook(): THREE.Group {
  const g = new THREE.Group();
  // cover + pages
  addVox(g, -1, 0, 0, 0x3a4a6a); addVox(g, 0, 0, 0, 0x4a5a7a); addVox(g, 1, 0, 0, 0x3a4a6a);
  addVox(g, -1, 0, 1, 0x2e3c56); addVox(g, 0, 0, 1, PAPER); addVox(g, 1, 0, 1, 0x2e3c56);
  addVox(g, 0, 1, 0, 0x55648a); addVox(g, 0, 1, 1, PAPER);
  return g;
}

function modelWrench(): THREE.Group {
  const g = new THREE.Group();
  // handle (2 deep)
  for (let x = 0; x <= 3; x++) { addVox(g, x, 0, 0, METAL_DARK); addVox(g, x, 0, 1, shade(METAL_DARK, 0.85)); }
  // C-shaped jaw (2 deep)
  addVox(g, 4, 0, 0, METAL); addVox(g, 4, 0, 1, shade(METAL, 0.85));
  addVox(g, 4, 1, 0, METAL); addVox(g, 4, 1, 1, shade(METAL, 0.85));
  addVox(g, 5, 1, 0, METAL); addVox(g, 5, 1, 1, shade(METAL, 0.85));
  addVox(g, 4, -1, 0, METAL); addVox(g, 4, -1, 1, shade(METAL, 0.85));
  addVox(g, 5, -1, 0, METAL); addVox(g, 5, -1, 1, shade(METAL, 0.85));
  // greasy shine
  addVox(g, 1, 1, 0, shade(METAL_DARK, 1.2)); addVox(g, 2, 1, 0, shade(METAL_DARK, 1.2));
  return g;
}

function modelPlunger(): THREE.Group {
  const g = new THREE.Group();
  // handle
  addVox(g, 0, 0, 0, WOOD); addVox(g, 0, 1, 0, WOOD); addVox(g, 0, 2, 0, WOOD); addVox(g, 0, 3, 0, WOOD);
  // rubber cup
  addVox(g, -1, -1, 0, RUBBER); addVox(g, 0, -1, 0, RUBBER); addVox(g, 1, -1, 0, RUBBER);
  addVox(g, -1, -2, 0, shade(RUBBER, 0.85)); addVox(g, 0, -2, 0, shade(RUBBER, 0.85)); addVox(g, 1, -2, 0, shade(RUBBER, 0.85));
  addVox(g, -1, -1, 1, shade(RUBBER, 0.8)); addVox(g, 1, -1, 1, shade(RUBBER, 0.8));
  return g;
}

function modelTowel(): THREE.Group {
  const g = new THREE.Group();
  // folded stack
  for (let y = 0; y < 2; y++) {
    addVox(g, -1, y, 0, 0xd8c4a0); addVox(g, 0, y, 0, 0xe8d4b0); addVox(g, 1, y, 0, 0xd8c4a0);
    addVox(g, -1, y, 1, 0xc8b490); addVox(g, 0, y, 1, 0xd8c4a0); addVox(g, 1, y, 1, 0xc8b490);
  }
  addVox(g, 0, 2, 0, 0xf0e0c0);
  return g;
}

function modelRope(): THREE.Group {
  const g = new THREE.Group();
  const R = 0xc8a878, Rd = 0xb89a68;
  // coiled ring, 2 tall
  for (let y = 0; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (x === 0 && z === 0) continue;   // the coil's hole
      addVox(g, x, y, z, (x === 0 || z === 0) ? R : Rd);
    }
  }
  // a loose end trailing off
  addVox(g, 2, 0, 0, R); addVox(g, 2, 1, 0, Rd); addVox(g, 3, 0, 0, Rd);
  return g;
}

function modelBucket(): THREE.Group {
  const g = new THREE.Group();
  for (let y = 0; y < 2; y++) {
    addVox(g, -1, y, 0, WOOD); addVox(g, 1, y, 0, WOOD);
    addVox(g, -1, y, 1, shade(WOOD, 0.8)); addVox(g, 1, y, 1, shade(WOOD, 0.8));
    addVox(g, 0, y, 1, shade(WOOD, 0.85)); addVox(g, 0, y, 0, shade(WOOD, 1.05));
  }
  // metal band + handle
  addVox(g, -1, 2, 0, METAL_DARK); addVox(g, 1, 2, 0, METAL_DARK);
  addVox(g, 0, 3, 0, METAL_DARK); addVox(g, 0, 2, 1, METAL_DARK);
  return g;
}

function modelBrokenBottle(): THREE.Group {
  const g = new THREE.Group();
  // jagged shards around a broken base
  addVox(g, -1, 0, 0, WINE); addVox(g, 1, 0, 0, WINE); addVox(g, 0, 0, 1, WINE);
  addVox(g, -1, 1, 0, shade(WINE, 1.1)); addVox(g, 1, 1, 0, shade(WINE, 1.1)); addVox(g, 0, 1, 1, shade(WINE, 1.1));
  addVox(g, 0, 1, 0, shade(WINE, 1.2));
  // jagged neck
  addVox(g, -1, 2, 0, shade(WINE, 1.2)); addVox(g, 0, 3, 0, shade(WINE, 1.2)); addVox(g, 1, 2, 0, shade(WINE, 1.2));
  return g;
}

function modelBone(): THREE.Group {
  const g = new THREE.Group();
  // 2×2 shaft, three long
  for (let x = 0; x <= 2; x++) {
    addVox(g, x, 0, 0, BONE); addVox(g, x, 1, 0, BONE);
    addVox(g, x, 0, 1, shade(BONE, 0.92)); addVox(g, x, 1, 1, shade(BONE, 0.92));
  }
  // knobby ends (3×3 at both ends)
  for (const ex of [-1, 3]) {
    for (let y = -1; y <= 2; y++) for (let z = -1; z <= 2; z++) {
      addVox(g, ex, y, z, shade(BONE, 0.88));
    }
  }
  return g;
}

function modelSpear(): THREE.Group {
  const g = new THREE.Group();
  // shaft (2 deep)
  for (let y = 0; y <= 3; y++) { addVox(g, 0, y, 0, WOOD); addVox(g, 0, y, 1, shade(WOOD, 0.85)); }
  // leaf head
  addVox(g, 0, 4, 0, METAL); addVox(g, 0, 4, 1, shade(METAL, 0.85));
  addVox(g, -1, 5, 0, METAL); addVox(g, 0, 5, 0, shade(METAL, 1.1)); addVox(g, 1, 5, 0, METAL);
  addVox(g, -1, 5, 1, shade(METAL, 0.85)); addVox(g, 0, 5, 1, shade(METAL, 0.95)); addVox(g, 1, 5, 1, shade(METAL, 0.85));
  addVox(g, 0, 6, 0, shade(METAL, 1.2)); addVox(g, 0, 6, 1, shade(METAL, 1.05));
  return g;
}

function modelSudsClub(): THREE.Group {
  const g = buildWeaponModel('club', 0x6b4a2e);
  // soap-crust suds on the head
  addVox(g, 1, 3, 1, SUD); addVox(g, 0, 4, 1, SUD); addVox(g, -1, 3, 1, shade(SUD, 0.9));
  addVox(g, 1, 2, 1, shade(SUD, 0.85)); addVox(g, 0, 3, 1, shade(SUD, 1.1));
  return g;
}

function modelCrown(): THREE.Group {
  const g = new THREE.Group();
  // band
  addVox(g, -1, 0, 0, GOLD); addVox(g, 0, 0, 0, shade(GOLD, 1.05)); addVox(g, 1, 0, 0, GOLD);
  addVox(g, -1, 0, 1, shade(GOLD, 0.85)); addVox(g, 0, 0, 1, shade(GOLD, 0.9)); addVox(g, 1, 0, 1, shade(GOLD, 0.85));
  // points
  addVox(g, -1, 1, 0, GOLD); addVox(g, 0, 1, 0, shade(GOLD, 1.1)); addVox(g, 1, 1, 0, GOLD);
  addVox(g, 0, 2, 0, shade(GOLD, 1.15));
  // a suds bubble on top
  addVox(g, 0, 3, 0, SUD);
  return g;
}

function modelCap(): THREE.Group {
  const g = new THREE.Group();
  // dome
  addVox(g, -1, 0, 0, 0x6a5a4a); addVox(g, 0, 0, 0, 0x7a6a5a); addVox(g, 1, 0, 0, 0x6a5a4a);
  addVox(g, -1, 0, 1, 0x5a4a3a); addVox(g, 0, 0, 1, 0x6a5a4a); addVox(g, 1, 0, 1, 0x5a4a3a);
  addVox(g, 0, 1, 0, 0x7a6a5a); addVox(g, -1, 1, 0, 0x6a5a4a); addVox(g, 1, 1, 0, 0x6a5a4a);
  // brim
  addVox(g, 0, -1, 0, 0x4a3a2a); addVox(g, -1, -1, 0, 0x4a3a2a); addVox(g, 1, -1, 0, 0x4a3a2a);
  addVox(g, 0, -1, 1, 0x3e3022); addVox(g, 0, -1, -1, 0x3e3022);
  return g;
}

function modelHelmet(): THREE.Group {
  const g = new THREE.Group();
  // dome
  addVox(g, -1, 0, 0, METAL_DARK); addVox(g, 0, 0, 0, METAL); addVox(g, 1, 0, 0, METAL_DARK);
  addVox(g, -1, 0, 1, shade(METAL_DARK, 0.8)); addVox(g, 0, 0, 1, shade(METAL, 0.85)); addVox(g, 1, 0, 1, shade(METAL_DARK, 0.8));
  addVox(g, 0, 1, 0, shade(METAL, 1.1)); addVox(g, -1, 1, 0, METAL_DARK); addVox(g, 1, 1, 0, METAL_DARK);
  addVox(g, 0, 2, 0, shade(METAL, 1.15));
  // pipe fitting (the plumber's touch)
  addVox(g, 1, 1, 1, BRASS); addVox(g, 2, 1, 1, BRASS); addVox(g, 2, 1, 2, BRASS);
  return g;
}

function modelRibcage(): THREE.Group {
  const g = new THREE.Group();
  // two ribs per side + spine
  addVox(g, -1, 0, 0, BONE); addVox(g, 0, 0, 0, BONE); addVox(g, 1, 0, 0, BONE);
  addVox(g, -1, 1, 0, BONE); addVox(g, 0, 1, 0, BONE); addVox(g, 1, 1, 0, BONE);
  addVox(g, -1, 2, 0, shade(BONE, 0.92)); addVox(g, 0, 2, 0, shade(BONE, 0.92)); addVox(g, 1, 2, 0, shade(BONE, 0.92));
  // arched ribs front
  addVox(g, -2, 0, 1, shade(BONE, 0.9)); addVox(g, 2, 0, 1, shade(BONE, 0.9));
  addVox(g, -2, 1, 1, shade(BONE, 0.9)); addVox(g, 2, 1, 1, shade(BONE, 0.9));
  addVox(g, -1, 0, 1, shade(BONE, 0.95)); addVox(g, 1, 0, 1, shade(BONE, 0.95));
  return g;
}

function modelBoot(): THREE.Group {
  const g = new THREE.Group();
  const L = 0x5a3a22;        // leather
  const L_D = 0x4a3020;      // shaded leather
  const L_L = 0x6a4a2a;      // lit leather
  // shaft — 2 wide × 2 deep × 3 tall, rising from the ankle
  for (let y = 1; y <= 3; y++) {
    addVox(g, 0, y, 0, L_L); addVox(g, 1, y, 0, L);
    addVox(g, 0, y, 1, L_D); addVox(g, 1, y, 1, shade(L_D, 0.9));
  }
  // ankle / instep
  addVox(g, 0, 0, 0, L_L); addVox(g, 1, 0, 0, L);
  addVox(g, 0, 0, 1, L_D); addVox(g, 1, 0, 1, shade(L_D, 0.9));
  // toe box — extends forward (+X)
  addVox(g, 2, 0, 0, L); addVox(g, 3, 0, 0, L); addVox(g, 4, 0, 0, shade(L, 1.1));
  addVox(g, 2, 0, 1, L_D); addVox(g, 3, 0, 1, L_D); addVox(g, 4, 0, 1, shade(L_D, 0.85));
  // heel — kicks back (−X)
  addVox(g, -1, 0, 0, L_D); addVox(g, -1, 0, 1, shade(L_D, 0.85));
  // sole — dark, under the whole foot + heel
  for (let x = -1; x <= 4; x++) {
    addVox(g, x, -1, 0, 0x2e2012); addVox(g, x, -1, 1, 0x241810);
  }
  return g;
}

function modelBanner(): THREE.Group {
  const g = new THREE.Group();
  // pole
  addVox(g, 0, 0, 0, WOOD); addVox(g, 0, 1, 0, WOOD); addVox(g, 0, 2, 0, WOOD); addVox(g, 0, 3, 0, WOOD); addVox(g, 0, 4, 0, WOOD);
  // flag
  addVox(g, 1, 1, 0, 0x8a3a3a); addVox(g, 2, 1, 0, 0x9a4a4a); addVox(g, 3, 1, 0, 0x8a3a3a);
  addVox(g, 1, 2, 0, 0x9a4a4a); addVox(g, 2, 2, 0, 0xaa5a5a); addVox(g, 3, 2, 0, 0x9a4a4a);
  addVox(g, 1, 3, 0, 0x8a3a3a); addVox(g, 2, 3, 0, 0x9a4a4a);
  addVox(g, 1, 2, 1, 0x7a3030); addVox(g, 2, 2, 1, 0x8a3a3a);
  return g;
}

function modelTorch(): THREE.Group {
  const g = new THREE.Group();
  // handle
  addVox(g, 0, -1, 0, WOOD); addVox(g, 0, 0, 0, WOOD); addVox(g, 0, 1, 0, WOOD);
  // head wrap
  addVox(g, 0, 2, 0, 0x8a6a3a); addVox(g, -1, 2, 0, 0x7a5a2e); addVox(g, 1, 2, 0, 0x7a5a2e);
  // flame
  addVox(g, 0, 3, 0, 0xff9a2a); addVox(g, 0, 4, 0, 0xffc84a); addVox(g, 1, 3, 0, shade(0xff9a2a, 0.9));
  return g;
}

function modelCleaver(): THREE.Group {
  const g = new THREE.Group();
  const add = (x: number, y: number, c: number) => { addVox(g, x, y, 0, c); addVox(g, x, y, 1, shade(c, 0.85)); };
  // brutal wide blade (2 deep)
  add(-1, 0, METAL_DARK); add(0, 0, METAL); add(1, 0, METAL_DARK);
  add(-1, 1, METAL); add(0, 1, shade(METAL, 1.1)); add(1, 1, METAL);
  add(-1, 2, shade(METAL, 1.1)); add(0, 2, shade(METAL, 1.2)); add(1, 2, shade(METAL, 1.1));
  add(0, 3, shade(METAL, 1.3));
  // grip + pommel
  add(0, -1, GRIP); add(0, -2, GRIP); add(0, -3, 0x5a3a1e);
  // soap residue
  addVox(g, 0, 1, 2, SUD);
  return g;
}

function modelBelt(): THREE.Group {
  const g = new THREE.Group();
  const L = 0x6a4a2a;
  // loop (ring) of leather, 2 tall, with a hole
  for (let y = 0; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (x === 0 && z === 0) continue;   // the hole
      addVox(g, x, y, z, (x === 0 || z === 0) ? L : shade(L, 0.85));
    }
  }
  // brass buckle in the hole
  addVox(g, 0, 0, 0, BRASS); addVox(g, 0, 1, 0, shade(BRASS, 0.9));
  return g;
}

function modelCloak(): THREE.Group {
  const g = new THREE.Group();
  // shoulders + draping fabric
  addVox(g, -1, 2, 0, 0x5a5a6a); addVox(g, 0, 2, 0, 0x6a6a7a); addVox(g, 1, 2, 0, 0x5a5a6a);
  addVox(g, -1, 1, 0, 0x4a4a5a); addVox(g, 0, 1, 0, 0x5a5a6a); addVox(g, 1, 1, 0, 0x4a4a5a);
  addVox(g, -1, 0, 0, 0x3a3a4a); addVox(g, 0, 0, 0, 0x4a4a5a); addVox(g, 1, 0, 0, 0x3a3a4a);
  addVox(g, -1, 2, 1, 0x4a4a5a); addVox(g, 0, 2, 1, 0x5a5a6a); addVox(g, 1, 2, 1, 0x4a4a5a);
  addVox(g, 0, 1, 1, 0x4a4a5a); addVox(g, 0, 3, 0, 0x7a7a8a);
  return g;
}

const BASE_MODELS: Record<string, () => THREE.Group> = {
  rubber_duck: modelDuck,
  moldy_cheese: modelCheese,
  glowing_mushroom: () => mushroom(true),
  poison_mushroom: () => mushroom(false),
  wine_bottle: () => modelBottle(WINE, 0x8a2a2a),
  holy_water: modelHolyWater,
  dwarven_ale: modelTankard,
  ghost_soup: modelSoup,
  bubble_bath: modelBubbleBottle,
  sewer_water_flask: () => modelBottle(GLASS, 0x6a7a4a),
  water_flask: () => modelBottle(GLASS, 0x7dd3fc),
  goblin_soap: () => modelSoap(true),
  soap_chunk: () => modelSoap(true),
  premium_soap: () => modelSoap(false),
  iron_key: () => modelKey(false),
  golden_key: () => modelKey(false),
  rusty_key: () => modelKey(true),
  severed_finger: modelFinger,
  hermits_ring: modelRing,
  ring: modelRing,
  blessed_penny: modelPenny,
  rat_whisker: modelWhisker,
  lockpick: modelLockpick,
  love_letter: modelLetter,
  waterlogged_book: modelBook,
  wrench: modelWrench,
  plunger: modelPlunger,
  towel: modelTowel,
  rope: modelRope,
  wooden_bucket: modelBucket,
  broken_bottle: modelBrokenBottle,
  rat_bone: modelBone,
  rusty_spear: modelSpear,
  goblin_spear: modelSpear,
  drowned_majesty: modelSudsClub,
  soap_crown: modelCrown,
  guards_cap: modelCap,
  pipe_helmet: modelHelmet,
  ribcage_armor: modelRibcage,
  sturdy_boots: modelBoot,
  leather_boot: modelBoot,
  toeless_boots: modelBoot,
  goblin_banner: modelBanner,
  torch1: modelTorch,
  warlord_blade: modelCleaver,
  leather_belt: modelBelt,
  tattered_cloak: modelCloak,
};

export function VoxelItemIcon({ item, size = 40, spin = false }: Props) {
  const mount = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    // ONE shared WebGL context for every icon (per-icon contexts evict the
    // game canvas in Chrome/WebView2 — see voxelView.ts)
    const view = attachVoxelView(host, size, size);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b12);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

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

    view.renderOnce(scene, camera);
    let ticker: (() => void) | null = null;
    if (spin) {
      ticker = () => { model.rotation.y += 0.02; view.renderOnce(scene, camera); };
      addTicker(ticker);
    }

    return () => {
      if (ticker) removeTicker(ticker);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      view.dispose();
    };
  }, [item, size, spin]);

  return <div ref={mount} className="voxel-item-icon" style={{ width: size, height: size }} />;
}
