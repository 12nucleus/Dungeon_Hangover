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
import { makeItem, type Item } from '@/game/items';
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

function buildWeaponModel(kind: string, accent: number, tier: number = 1): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'sword': {
      if (tier === 1) {
        // Worn Longsword — chipped, short, 3-wide guard
        addVox(g, 0, -1, 0, accent); addVox(g, 0, 0, 0, GRIP); addVox(g, 0, 1, 0, GRIP);
        addVox(g, -1, 2, 0, METAL_DARK); addVox(g, 0, 2, 0, METAL_DARK); addVox(g, 1, 2, 0, METAL_DARK);
        addVox(g, -1, 3, 0, METAL); addVox(g, 0, 3, 0, METAL); addVox(g, 1, 3, 0, METAL);
        addVox(g, -1, 4, 0, METAL); addVox(g, 0, 4, 0, METAL); addVox(g, 1, 4, 0, shade(METAL,0.9));
        addVox(g, 0, 5, 0, METAL); // chipped tip
        addVox(g, 0, 6, 0, shade(METAL,1.1));
      } else if (tier === 2) {
        // Fine Longsword — fuller, 5-wide curved guard, jewel pommel
        addVox(g, 0, -1, 0, shade(accent,1.2)); addVox(g, 0, 0, 0, GRIP); addVox(g, 0, 1, 0, GRIP);
        addVox(g, -2, 2, 0, METAL_DARK); addVox(g,-1,2,0,METAL_DARK); addVox(g,0,2,0,METAL_DARK); addVox(g,1,2,0,METAL_DARK); addVox(g,2,2,0,METAL_DARK);
        addVox(g, -1,3,0,METAL); addVox(g,0,3,0,shade(METAL,1.05)); addVox(g,1,3,0,METAL);
        addVox(g, -1,4,0,METAL); addVox(g,0,4,0,shade(METAL,1.08)); addVox(g,1,4,0,METAL);
        addVox(g, 0,5,0,METAL); addVox(g,0,6,0,METAL); addVox(g,0,7,0,METAL); addVox(g,0,8,0,shade(METAL,1.25));
        addVox(g, 0,-1,1, GOLD); // pommel gem
      } else {
        // Masterwork Greatblade — towering, winged, glowing rune-inlay
        addVox(g, 0,-2,0,GOLD); addVox(g,0,-1,0,GRIP); addVox(g,0,0,0,GRIP); addVox(g,0,-1,1,shade(GRIP,0.85));
        // wide winged crossguard
        addVox(g,-3,1,0,shade(METAL_DARK,0.9)); addVox(g,-2,1,0,METAL_DARK); addVox(g,-1,1,0,METAL); addVox(g,0,1,0,METAL_DARK); addVox(g,1,1,0,METAL); addVox(g,2,1,0,METAL_DARK); addVox(g,3,1,0,shade(METAL_DARK,0.9));
        addVox(g,-3,1,1,shade(METAL_DARK,0.8)); addVox(g,3,1,1,shade(METAL_DARK,0.8));
        addVox(g,-3,2,0,shade(METAL_DARK,0.8)); addVox(g,3,2,0,shade(METAL_DARK,0.8));
        // long blade with a gold fuller running its length
        for (let y=2;y<=12;y++){ addVox(g,-1,y,0,METAL); addVox(g,0,y,0,shade(METAL,1.12)); addVox(g,1,y,0,METAL); addVox(g,0,y,1, y%2?GOLD:shade(METAL,0.9)); }
        addVox(g,0,13,0,shade(METAL,1.45)); // bright tip
        addVox(g,0,1,1,GOLD); // guard jewel
      }
      break;
    }
    case 'dagger': {
      if (tier === 1) {
        // Rusty shiv — small, leaf, pitted
        addVox(g,0,0,0,GRIP); addVox(g,0,1,0,GRIP); addVox(g,-1,2,0,METAL_DARK); addVox(g,0,2,0,METAL_DARK); addVox(g,1,2,0,METAL_DARK);
        addVox(g,0,3,0,METAL); addVox(g,0,4,0,shade(METAL,0.9)); addVox(g,0,5,0,shade(METAL,1.1));
      } else if (tier === 2) {
        // Fine dagger — stiletto, narrow, blood groove
        addVox(g,0,-0.5,0,accent); addVox(g,0,0,0,GRIP); addVox(g,0,1,0,GRIP); addVox(g,-1,2,0,METAL_DARK); addVox(g,0,2,0,METAL_DARK); addVox(g,1,2,0,METAL_DARK);
        addVox(g,0,3,0,METAL); addVox(g,0,4,0,shade(METAL,1.1)); addVox(g,0,5,0,METAL); addVox(g,0,6,0,shade(METAL,1.25)); addVox(g,0,3,1,shade(METAL,0.85));
      } else {
        // Masterwork — long jeweled kukri, poison gem in pommel
        addVox(g,0,-2,0,GOLD); addVox(g,0,-1,0,shade(GRIP,1.1)); addVox(g,0,0,0,GRIP);
        addVox(g,-1,1,0,METAL_DARK); addVox(g,0,1,0,METAL_DARK); addVox(g,1,1,0,METAL_DARK);
        addVox(g,-1,2,0,METAL); addVox(g,0,2,0,METAL); addVox(g,1,2,0,shade(METAL,0.9));
        addVox(g,-1,3,0,METAL); addVox(g,0,3,0,shade(METAL,1.1)); addVox(g,1,3,0,METAL); addVox(g,2,3,0,METAL);
        addVox(g,0,4,0,METAL); addVox(g,1,4,0,shade(METAL,1.1)); addVox(g,2,4,0,METAL); addVox(g,3,4,0,shade(METAL,1.15));
        addVox(g,1,5,0,METAL); addVox(g,2,5,0,shade(METAL,1.2)); addVox(g,3,5,0,METAL); addVox(g,4,5,0,shade(METAL,1.3));
        addVox(g,2,6,0,shade(METAL,1.4)); // curled tip
        addVox(g,0,1,1,0x4ade80); // poison gem
      }
      break;
    }
    case 'club': {
      if (tier === 1) {
        addVox(g,0,0,0,GRIP); addVox(g,0,1,0,GRIP); addVox(g,0,2,0,GRIP);
        addVox(g,-1,3,0,accent); addVox(g,0,3,0,accent); addVox(g,1,3,0,accent);
        addVox(g,0,4,0,shade(accent,1.05));
      } else if (tier === 2) {
        // Spiked club — nails
        addVox(g,0,0,0,GRIP); addVox(g,0,1,0,GRIP); addVox(g,0,2,0,GRIP);
        addVox(g,-1,3,0,accent); addVox(g,0,3,0,accent); addVox(g,1,3,0,accent);
        addVox(g,-1,4,0,accent); addVox(g,0,4,0,accent); addVox(g,1,4,0,accent);
        addVox(g,0,5,0,accent); addVox(g,2,4,0,METAL); addVox(g,-2,4,0,METAL); addVox(g,0,4,1,METAL);
      } else {
        // Colossal Ogre Greatclub — long haft, massive studded head
        addVox(g,0,-1,0,GRIP); addVox(g,0,0,0,GRIP); addVox(g,0,1,0,GRIP);
        for(let y=2;y<=6;y++) addVox(g,0,y,0,accent);
        for(let y=7;y<=9;y++) for(let x=-1;x<=1;x++) addVox(g,x,y,0,accent);
        addVox(g,-1,8,1,shade(accent,0.8)); addVox(g,1,8,1,shade(accent,0.8)); addVox(g,0,9,1,shade(accent,1.1));
        addVox(g,0,3,1,METAL_DARK); addVox(g,0,5,1,METAL_DARK); // iron bands
        addVox(g,-1,7,0,shade(METAL,1.1)); addVox(g,1,9,0,shade(METAL,1.1)); // studs
      }
      break;
    }
    case 'mace': {
      if (tier === 1) {
        addVox(g,0,0,0,GRIP); addVox(g,0,1,0,GRIP); addVox(g,0,2,0,METAL_DARK);
        addVox(g,0,3,0,METAL); addVox(g,1,3,0,METAL); addVox(g,-1,3,0,METAL); addVox(g,0,3,1,shade(METAL,0.9));
        addVox(g,0,4,0,shade(METAL,1.15));
      } else if (tier === 2) {
        addVox(g,0,0,0,GRIP); addVox(g,0,1,0,GRIP); addVox(g,0,2,0,METAL_DARK);
        addVox(g,0,3,0,METAL); addVox(g,1,3,0,METAL); addVox(g,-1,3,0,METAL); addVox(g,0,3,1,METAL); addVox(g,0,3,-1,METAL);
        addVox(g,0,4,0,METAL); addVox(g,1,4,0,METAL); addVox(g,-1,4,0,METAL); addVox(g,0,4,1,METAL); addVox(g,0,4,-1,METAL);
        addVox(g,0,5,0,shade(METAL,1.3)); addVox(g,1,4,1,shade(METAL,1.2));
      } else {
        // Grand Morningstar — long haft, massive spiked head
        addVox(g,0,-2,0,GRIP); addVox(g,0,-1,0,GRIP); addVox(g,0,0,0,GRIP); addVox(g,0,1,0,METAL_DARK); addVox(g,0,1,1,METAL_DARK);
        for(let y=2;y<=6;y++) addVox(g,0,y,0,WOOD);
        // big spiked ball
        addVox(g,0,7,1,METAL); addVox(g,1,7,0,METAL); addVox(g,-1,7,0,METAL); addVox(g,0,7,-1,METAL);
        addVox(g,0,8,0,METAL); addVox(g,1,8,0,shade(METAL,1.1)); addVox(g,-1,8,0,shade(METAL,1.1)); addVox(g,0,8,1,shade(METAL,1.1)); addVox(g,0,8,-1,shade(METAL,1.1));
        addVox(g,2,7,0,METAL); addVox(g,-2,7,0,METAL); addVox(g,0,7,2,METAL); addVox(g,0,7,-2,METAL);
        addVox(g,0,9,0,shade(METAL,1.4)); // crown spike
      }
      break;
    }
    case 'staff': {
      if (tier === 1) {
        addVox(g,0,-2,0,METAL_DARK); for(let y=-1;y<=3;y++) addVox(g,0,y,0,WOOD);
        addVox(g,0,4,0,WOOD); addVox(g,0,4,1,shade(WOOD,0.85));
      } else if (tier === 2) {
        addVox(g,0,-3,0,METAL_DARK); for(let y=-2;y<=4;y++) addVox(g,0,y,0,WOOD);
        addVox(g,0,5,0,accent); addVox(g,1,5,0,shade(accent,0.7)); addVox(g,-1,5,0,shade(accent,0.7));
        addVox(g,0,5,1,shade(accent,0.75)); addVox(g,0,0,1,shade(WOOD,0.8));
      } else {
        // Archmage Staff — towering, crowned with a great glowing orb
        addVox(g,0,-5,0,METAL_DARK); for(let y=-4;y<=7;y++) addVox(g,0,y,0,y%2?WOOD:shade(WOOD,0.92));
        addVox(g,0,8,0,accent); addVox(g,1,8,0,shade(accent,0.7)); addVox(g,-1,8,0,shade(accent,0.7)); addVox(g,0,8,1,shade(accent,0.8));
        addVox(g,0,9,0,shade(accent,1.2)); addVox(g,1,9,0,shade(accent,0.8)); addVox(g,-1,9,0,shade(accent,0.8));
        addVox(g,0,10,0,GOLD); addVox(g,0,10,1,shade(GOLD,0.9));
        addVox(g,-1,7,0,GOLD); addVox(g,1,7,0,GOLD); // crown ring
      }
      break;
    }
    case 'bow': {
      const LIMB = WOOD, LIMB_D = shade(WOOD, 0.78), STR = 0xe8e0c8;
      if (tier === 1) {
        // Bent shortbow — simple, small
        addVox(g,0,1,0,GRIP); addVox(g,0,2,0,GRIP);
        addVox(g,0,3,0,LIMB); addVox(g,-1,4,0,LIMB); addVox(g,-1,5,0,LIMB_D);
        addVox(g,0,0,0,LIMB); addVox(g,-1,-1,0,LIMB);
        for(let y=-1;y<=5;y++) addVox(g,-1,y,1,shade(STR,0.9));
        addVox(g,1,1,0,WOOD); addVox(g,2,1,0,METAL);
      } else if (tier === 2) {
        // Fine yew — larger recurve, leather grip
        addVox(g,0,2,0,GRIP); addVox(g,0,3,0,GRIP); addVox(g,0,2,1,shade(GRIP,0.85));
        addVox(g,0,4,0,LIMB); addVox(g,-1,5,0,LIMB); addVox(g,-2,6,0,LIMB); addVox(g,-2,7,0,LIMB_D);
        addVox(g,0,1,0,LIMB); addVox(g,-1,0,0,LIMB); addVox(g,-2,-1,0,LIMB);
        for(let y=-1;y<=7;y++) addVox(g,-2,y,1,shade(STR,0.9));
        addVox(g,1,2,0,WOOD); addVox(g,2,2,0,WOOD); addVox(g,3,2,0,METAL);
      } else {
        // Masterwork Elven — towering deep recurve, gold inlay, nocked arrow
        addVox(g,0,3,0,GRIP); addVox(g,0,4,0,GRIP); addVox(g,0,3,1,shade(GRIP,0.85));
        addVox(g,0,5,0,GOLD); addVox(g,-1,6,0,LIMB); addVox(g,-2,7,0,LIMB); addVox(g,-3,8,0,LIMB); addVox(g,-3,9,0,LIMB_D); addVox(g,-3,10,0,LIMB_D);
        addVox(g,0,2,0,LIMB); addVox(g,-1,1,0,LIMB); addVox(g,-2,0,0,LIMB); addVox(g,-3,-1,0,LIMB); addVox(g,-3,-2,0,LIMB_D); addVox(g,-3,-3,0,LIMB_D);
        for(let y=-3;y<=10;y++) addVox(g,-3,y,1,shade(STR,0.92));
        addVox(g,-1,5,1,GOLD); addVox(g,-1,3,1,GOLD); addVox(g,-3,5,1,GOLD);
        addVox(g,1,3,0,WOOD); addVox(g,2,3,0,WOOD); addVox(g,3,3,0,METAL); addVox(g,4,3,0,shade(METAL,1.3)); addVox(g,5,3,0,0xff3a2e); // arrow + fletching
      }
      break;
    }
    case 'axe': {
      // sturdy haft + broad double-bit head
      addVox(g, 0, -1, 0, GRIP); addVox(g, 0, 0, 0, WOOD); addVox(g, 0, 1, 0, WOOD);
      addVox(g, 0, 2, 0, WOOD); addVox(g, 0, 3, 0, WOOD); addVox(g, 0, 2, 1, shade(WOOD, 0.85));
      addVox(g, -1, 4, 0, METAL_DARK); addVox(g, 0, 4, 0, METAL); addVox(g, 1, 4, 0, METAL_DARK);
      addVox(g, -2, 3, 0, METAL); addVox(g, -2, 4, 0, METAL); addVox(g, -2, 5, 0, shade(METAL, 0.9));
      addVox(g, -1, 5, 0, METAL); addVox(g, 0, 5, 0, METAL_DARK); addVox(g, -2, 2, 0, shade(METAL, 0.8));
      addVox(g, 2, 3, 0, METAL); addVox(g, 2, 4, 0, METAL); addVox(g, 2, 5, 0, shade(METAL, 0.9));
      addVox(g, 1, 5, 0, METAL); addVox(g, 2, 2, 0, shade(METAL, 0.8));
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

function addWeaponEnchantFx(g: THREE.Group, kind: string, enchantId?: string) {
  if (!enchantId) return;
  const ENCH_COLOR: Record<string, number> = { flaming: 0xff7a1f, frost: 0x7dd3fc, shocking: 0xfde047, poison: 0x4ade80, vital: 0x4ade80, warding: 0x93c5fd, swift: 0xf0abfc, keen: 0xf8fafc };
  const c = ENCH_COLOR[enchantId] ?? 0xffd76b;
  const tipY = kind === 'bow' ? 7 : kind === 'staff' ? 5 : kind === 'dagger' ? 7 : kind === 'axe' ? 5 : 8;
  const tipX = kind === 'bow' ? -2 : 0;
  if (enchantId === 'flaming') {
    // flame licks along the blade/edge, not just tip — visible even when spinning
    for (let y = 4; y <= tipY; y++) { addVox(g, tipX + 1, y, 0, y % 2 ? 0xff7a1f : 0xff3a1a); addVox(g, tipX + 1, y, 1, shade(0xff7a1f, 0.85)); }
    addVox(g, tipX, tipY + 1, 0, 0xffd76b); addVox(g, tipX, tipY + 2, 0, 0xfff3a0); addVox(g, tipX + 1, tipY + 1, 0, 0xff8c1a);
  } else if (enchantId === 'frost') {
    // ice crust + icicle
    for (let y = 3; y <= tipY; y++) { addVox(g, tipX - 1, y, 0, y % 2 ? 0x7dd3fc : 0xa3d9ff); addVox(g, tipX - 1, y, 1, shade(0x7dd3fc, 0.8)); }
    addVox(g, tipX, tipY + 1, 0, 0xcfefff); addVox(g, tipX, tipY + 2, 0, 0xe0f6ff);
  } else if (enchantId === 'shocking') {
    // lightning zig-zag
    addVox(g, tipX, 5, 0, 0xfde047); addVox(g, tipX + 1, 6, 0, 0xfff3a0); addVox(g, tipX, 7, 0, 0xfde047); addVox(g, tipX, 8, 0, 0xfff3a0); addVox(g, tipX, 8, 1, shade(0xfde047,0.8));
  } else if (enchantId === 'poison') {
    for (let y = 4; y <= 7; y++) addVox(g, tipX + 1, y, 0, y % 2 ? 0x4ade80 : 0x22c55e);
    addVox(g, tipX, tipY, 1, 0x4ade80);
  } else {
    addVox(g, tipX, tipY, 0, c); addVox(g, tipX, tipY + 1, 0, shade(c, 1.25));
    addVox(g, tipX + 1, tipY, 0, shade(c, 0.85)); addVox(g, tipX, tipY, 1, shade(c, 0.9));
  }
}

function hashId(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619; return h >>> 0; }
function buildDistinctWeapon(item: Item): THREE.Group {
  const kind = item._baseId === 'rusty_axe' ? 'axe' : (item.weaponKind ?? 'sword');
  const tier = item.tier;
  const g = buildWeaponModel(kind, 0xc9a227, tier);
  // baseId hash gives each weapon a subtle unique accent so even same kind/tier differ
  const h = hashId(item._baseId ?? item.name);
  const accent2 = [0xc9a227, 0x8a6a3a, 0x7a828e, 0x4a6a8a][h % 4];
  if (h % 5 === 0) addVox(g, 1, 2, 0, accent2);
  if (h % 7 === 0) addVox(g, -1, 2, 0, shade(accent2, 0.85));
  // floor49 fungal weapons get extra spore/mushroom voxels
  if (item._baseId === 'mushroom_staff') { addVox(g, 0, 6, 0, MUSH_CAP); addVox(g, 1, 6, 0, MUSH_STEM); }
  if (item._baseId === 'spore_dagger') { addVox(g, 0, 5, 1, 0x8a4a9e); addVox(g, 1, 5, 1, 0x6a3a8a); }
  if (item._baseId === 'vine_whip') { addVox(g, 2, 2, 0, 0x4a7a3a); addVox(g, 3, 2, 0, 0x5a8a4a); addVox(g, 4, 2, 0, 0x6a9a5a); }
  if (item._baseId === 'fungal_blade') { addVox(g, 1, 3, 0, 0x8a4a2e); addVox(g, 1, 4, 0, MUSH_CAP); }
  if (item._baseId === 'mycelial_staff') { addVox(g, 0, 6, 0, GLOW); addVox(g, 0, 7, 0, shade(GLOW, 1.3)); }
  addWeaponEnchantFx(g, kind, item.enchantId);
  return g;
}
function modelTravelerCloak(): THREE.Group {
  const g = new THREE.Group(); const C = 0x4a4a5a;
  for (let y = 0; y <= 2; y++) for (let x = -1; x <= 1; x++) addVox(g, x, y, 0, shade(C, 1 - y * 0.08));
  addVox(g, -1, 3, 0, C); addVox(g, 0, 3, 0, shade(C, 1.15)); addVox(g, 1, 3, 0, C);
  addVox(g, 0, 2, 1, BRASS); addVox(g, -1, 0, 1, shade(C, 0.7)); addVox(g, 1, 0, 1, shade(C, 0.7));
  return g;
}

function modelMushroomHat(): THREE.Group {
  const g = new THREE.Group();
  addVox(g, 0, 0, 0, MUSH_STEM); addVox(g, -1, 0, 0, MUSH_STEM); addVox(g, 1, 0, 0, MUSH_STEM);
  for (let x = -2; x <= 2; x++) addVox(g, x, 1, 0, x % 2 ? MUSH_CAP : shade(MUSH_CAP, 1.1));
  addVox(g, -1, 2, 0, MUSH_CAP); addVox(g, 0, 2, 0, shade(MUSH_CAP, 1.2)); addVox(g, 1, 2, 0, MUSH_CAP);
  addVox(g, -2, 1, 1, MUSH_STEM); addVox(g, 2, 1, 1, MUSH_STEM);
  return g;
}

function modelWaterloggedBoots(): THREE.Group {
  const g = modelBoot();
  addVox(g, 2, 1, 0, 0x3a7a9a); addVox(g, 3, 1, 0, 0x7dd3fc); addVox(g, 0, 4, 0, 0x7dd3fc);
  return g;
}

function buildDistinctArmor(item: Item): THREE.Group {
  const slot = item.slot ?? 'chest';
  const tier = item.tier;
  const h = hashId(item._baseId ?? item.name);
  const g = new THREE.Group();
  // base color per tier
  const pal = tier === 3 ? 0xb8bfc9 : tier === 2 ? 0x8a6a3a : 0x6b4423;
  const col = [pal, shade(pal,0.85), shade(pal,1.1)][h%3];
  const id = item._baseId ?? '';
  if (id === 'mushroom_cap') return modelMushroomHat();
  if (id === 'spore_crown') {
    const crown = modelCrown();
    addVox(crown, -1, 2, 0, 0x8a4a9e); addVox(crown, 1, 2, 0, 0x6a3a8a);
    addVox(crown, 0, 4, 0, GLOW); addVox(crown, -2, 3, 0, 0xb06ad0); addVox(crown, 2, 3, 0, 0xb06ad0);
    return crown;
  }
  if (id === 'vine_cloak') {
    const cloak = modelTravelerCloak();
    addVox(cloak, -1, 2, 0, 0x4a7a3a); addVox(cloak, 1, 1, 0, 0x5a8a4a);
    addVox(cloak, 0, 3, 1, 0x4a7a3a); addVox(cloak, 2, 0, 0, 0x6a9a5a);
    return cloak;
  }
  if (id === 'frog_skin_cloak') {
    const frog = new THREE.Group();
    const F1 = 0x4a9a4a, F2 = 0x77b84f, F3 = 0x2f6a35;
    for (let y = 0; y <= 3; y++) for (let x = -1; x <= 1; x++) addVox(frog, x, y, 0, (x + y) % 3 === 0 ? F2 : F1);
    addVox(frog, -1, 1, 1, F3); addVox(frog, 1, 2, 1, F3); addVox(frog, 0, 3, 1, 0xd8f0a0);
    return frog;
  }
  if (id === 'waterlogged_boots') return modelWaterloggedBoots();
  if (id === 'padded') {
    const padded = new THREE.Group(); const P = 0xcfc4a8;
    for (let y = 0; y <= 3; y++) for (let x = -1; x <= 1; x++) {
      addVox(padded, x, y, 0, y % 2 ? shade(P, 0.88) : P); addVox(padded, x, y, 1, shade(P, 0.72));
      if (y % 2 === 1) addVox(padded, x, y, 1, 0x8a7a5a);
    }
    return padded;
  }
  if (id === 'leather') {
    const leather = new THREE.Group(); const L = 0x6b4423;
    for (let y = 0; y <= 3; y++) { addVox(leather, -1, y, 0, L); addVox(leather, 0, y, 0, shade(L, 1.08)); addVox(leather, 1, y, 0, L); }
    addVox(leather, -1, 2, 1, 0x3f2616); addVox(leather, 0, 2, 1, BRASS); addVox(leather, 1, 2, 1, 0x3f2616);
    return leather;
  }
  if (id === 'chain' || id === 'chain_shirt') {
    const chain = new THREE.Group(); const C1 = 0xb5bcc5, C2 = 0x6f7884;
    for (let y = 0; y <= 3; y++) for (let x = -1; x <= 1; x++) {
      addVox(chain, x, y, 0, (x + y) % 2 ? C1 : C2); addVox(chain, x, y, 1, (x + y) % 2 ? C2 : shade(C1, 0.8));
    }
    addVox(chain, -2, 3, 0, C1); addVox(chain, 2, 3, 0, C1);
    return chain;
  }
  if (id === 'plate') {
    const plate = new THREE.Group(); const P = 0xc7d0db;
    // torso
    for (let y = 0; y <= 3; y++) for (let x = -1; x <= 1; x++) { addVox(plate, x, y, 0, P); addVox(plate, x, y, 1, shade(P, 0.78)); }
    // hip faulds (skirt)
    for (let x = -1; x <= 1; x++) { addVox(plate, x, -1, 0, shade(P, 0.9)); addVox(plate, x, -1, 1, shade(P, 0.7)); }
    // grand pauldrons
    addVox(plate, -2, 3, 0, P); addVox(plate, -2, 3, 1, shade(P, 0.78)); addVox(plate, -2, 4, 0, shade(P, 1.05)); addVox(plate, -2, 2, 0, shade(P, 0.95));
    addVox(plate, 2, 3, 0, P); addVox(plate, 2, 3, 1, shade(P, 0.78)); addVox(plate, 2, 4, 0, shade(P, 1.05)); addVox(plate, 2, 2, 0, shade(P, 0.95));
    // gold trim
    addVox(plate, -1, 0, 1, GOLD); addVox(plate, 1, 0, 1, GOLD); addVox(plate, 0, 3, 1, GOLD);
    // central ruby
    addVox(plate, 0, 2, 1, 0xff3a4e); addVox(plate, 0, 1, 1, shade(0xff3a4e, 1.2));
    // helm crest
    addVox(plate, 0, 4, 0, GOLD); addVox(plate, 0, 5, 0, shade(GOLD, 1.2));
    return plate;
  }
  if (slot === 'head') {
    // helmet — dome + visor
    addVox(g, -1,0,0,col); addVox(g,0,0,0,col); addVox(g,1,0,0,col);
    addVox(g,-1,0,1,shade(col,0.8)); addVox(g,0,0,1,shade(col,0.85)); addVox(g,1,0,1,shade(col,0.8));
    addVox(g,0,1,0,shade(col,1.15)); addVox(g,0,2,0,shade(col,1.25));
    if(tier===3){ addVox(g,1,1,0,GOLD); addVox(g,-1,1,0,GOLD); }
    if(item._baseId==='spore_crown') { addVox(g,0,3,0,0x8a4a9e); addVox(g,1,3,0,0x6a3a8a); }
  } else if (slot === 'arms') {
    // bracers — a pair of forearm guards, NOT a chest piece
    const strap = tier === 1 && item._baseId === 'rusty_bracers' ? METAL_DARK : col;
    for (let x = -1; x <= 1; x++) { addVox(g, x, 0, 0, col); addVox(g, x, 0, 1, shade(col, 0.8)); }
    for (let x = -1; x <= 1; x++) { addVox(g, x, 1, 0, shade(col, 1.1)); addVox(g, x, 1, 1, shade(col, 0.9)); }
    addVox(g, -2, 0, 0, strap); addVox(g, 2, 0, 0, strap);
    addVox(g, -2, 1, 0, shade(strap, 1.1)); addVox(g, 2, 1, 0, shade(strap, 1.1));
    if (item._baseId === 'rusty_bracers') addVox(g, 0, 2, 0, shade(METAL_DARK, 0.9));
  } else if (slot === 'boots' || slot === 'legs') {
    for(let y=1;y<=3;y++){ addVox(g,0,y,0,col); addVox(g,1,y,0,col); addVox(g,0,y,1,shade(col,0.8)); }
    addVox(g,2,0,0,col); addVox(g,3,0,0,shade(col,1.1)); addVox(g,-1,0,0,shade(col,0.85));
    if(tier===1 && item._baseId==='waterlogged_boots'){ addVox(g,0,1,1,0x7dd3fc); }
  } else if (slot === 'cloak' || slot === 'belt') {
    // cloak/belt — draped fabric
    addVox(g,-1,2,0,col); addVox(g,0,2,0,col); addVox(g,1,2,0,col);
    addVox(g,-1,1,0,shade(col,0.9)); addVox(g,0,1,0,shade(col,0.95)); addVox(g,1,1,0,shade(col,0.9));
    addVox(g,-1,0,0,shade(col,0.8)); addVox(g,1,0,0,shade(col,0.8));
    if(slot==='belt'){ addVox(g,0,1,1,GOLD); }
  } else {
    // chest — 3x4 with shoulder pads tier-scaled
    for(let y=0;y<=3;y++){ addVox(g,-1,y,0,shade(col,y===3?0.92:1)); addVox(g,0,y,0,col); addVox(g,1,y,0,shade(col,y===3?0.92:1)); }
    addVox(g,2,3,0,shade(col,0.95)); addVox(g,-2,3,0,shade(col,0.95));
    if(tier===3){ addVox(g,2,3,1,shade(col,0.8)); addVox(g,-2,3,1,shade(col,0.8)); addVox(g,0,3,1,shade(col,1.15)); }
  }
  // unique hash accent so same kind/tier but different baseId differ
  const acc = [GOLD, BRASS, 0x8a6a3a, 0x4a7a8a][h%4];
  if(h%5===0) addVox(g,2,2,0,acc);
  return g;
}
function buildDistinctConsumable(item: Item): THREE.Group {
  const n=item.name.toLowerCase();
  const h=hashId(item._baseId??item.name);
  // pick liquid/model per baseId
  if(n.includes('mushroom')||n.includes('cap')) return h%2? mushroom(true): mushroom(false);
  if(n.includes('fish')) { const g=new THREE.Group(); addVox(g,0,0,0,0x3a7a9a); addVox(g,1,0,0,0x9ad8ff); addVox(g,2,0,0,0x3a7a9a); addVox(g,1,1,0,0x5a9ac4); return g; }
  if(n.includes('heart')) { const g=new THREE.Group(); addVox(g,0,1,0,0xcf3a4e); addVox(g,1,1,0,0xcf3a4e); addVox(g,-1,1,0,0xcf3a4e); addVox(g,0,2,0,0xff5a6b); addVox(g,0,0,0,0x8a1a1a); return g; }
  if(n.includes('crystal')||n.includes('spore')&&n.includes('glowing')) { const g=new THREE.Group(); addVox(g,0,0,0,0x7dd3fc); addVox(g,0,1,0,0xa3d9ff); addVox(g,0,2,0,0xcfefff); return g; }
  const liquid = n.includes('heal')||n.includes('potion')?0x6ee7b7 : n.includes('poison')?0xbef264 : 0x7dd3fc;
  const g=buildConsumableModel(liquid);
  // add hash-driven bubble
  if(h%3===0) addVox(g,2,3,0,shade(liquid,1.2));
  return g;
}
void buildArmorModel; void buildTrinketModel; void buildConsumableModel;
function buildDistinctTrinket(item: Item): THREE.Group {
  const h=hashId(item._baseId??item.name);
  const g=new THREE.Group();
  // trinket kind based on name
  const n=item.name.toLowerCase();
  if(n.includes('ring')||n.includes('band')) return modelRing();
  if(n.includes('amulet')||n.includes('warding')) { addVox(g,0,1,0,0x93c5fd); addVox(g,0,0,0,GOLD); addVox(g,0,2,0,GOLD); return g; }
  if(n.includes('cloak')) return modelCloak();
  if(n.includes('belt')) return modelBelt();
  if(n.includes('whisker')) return modelWhisker();
  if(n.includes('penny')||n.includes('coin')) return modelPenny();
  // generic but hash-distinct coin stack with gem
  addVox(g,0,0,0,GOLD); addVox(g,0,1,0,GOLD); addVox(g,0,2,0,GOLD);
  const gem=[0x7dd3fc,0xff7a1f,0x4ade80,0xf0abfc][h%4];
  addVox(g,0,3,0,gem); addVox(g,1,3,0,shade(gem,0.8));
  return g;
}

// Model factories are evaluated lazily by BASE_MODELS, so constructing a
// template here is safe and keeps every registry entry data-driven.
function makeItemForModel(id: string): Item { return makeItem(id); }

function buildWoodenShieldModel(): THREE.Group {
  const g = new THREE.Group();
  const wood = 0x6b4a2e;
  for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) {
    if (Math.abs(x) + Math.abs(y) > 3) continue;
    addVox(g, x, y, 0, (x + y) % 2 ? wood : shade(wood, 0.82));
  }
  addVox(g, 0, 0, 1, METAL); addVox(g, 0, 1, 1, METAL_DARK);
  addVox(g, -2, 0, 0, METAL_DARK); addVox(g, 2, 0, 0, METAL_DARK);
  return g;
}

export function buildItemModel(item: Item): THREE.Group {
  const b = BASE_MODELS[item._baseId ?? ''];
  if (b) {
    const g = b();
    // even base-model specials (warlord_blade etc) still show their enchant tip
    const fxKind = item._baseId === 'rusty_axe' ? 'axe' : (item.weaponKind ?? 'sword');
    addWeaponEnchantFx(g, fxKind, item.enchantId);
    return g;
  }
  if (item.kind === 'weapon') return buildDistinctWeapon(item);
  if (item.kind === 'armor') return buildDistinctArmor(item);
  if (item.kind === 'consumable') return buildDistinctConsumable(item);
  return buildDistinctTrinket(item);
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

function modelRing(gem = 0x7dd3fc): THREE.Group {
  const g = new THREE.Group();
  // gold band loop (2 tall, ring with a hole)
  for (let y = 0; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (x === 0 && z === 0) continue;   // the hole
      addVox(g, x, y, z, shade(GOLD, 0.95));
    }
  }
  // gem on top
  addVox(g, 0, 2, 0, gem); addVox(g, 0, 2, 1, shade(gem, 1.2));
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
  // Gribnab's weapon is a broad, ceremonial bath-club, not a pink cube.
  const g = buildWeaponModel('club', 0x6b4a2e, 3);
  addVox(g, -1, 4, 1, SUD); addVox(g, 0, 5, 1, SUD); addVox(g, 1, 4, 1, shade(SUD, 0.9));
  addVox(g, -2, 4, 0, SUD); addVox(g, 2, 4, 0, SUD); addVox(g, 0, 6, 0, shade(SUD, 1.15));
  addVox(g, 0, 3, 1, SOAP_PINK); addVox(g, 0, 4, -1, SOAP_PINK);
  return g;
}

function modelGoldenKey(): THREE.Group {
  const g = new THREE.Group();
  // ornate key with a large crown-shaped bow and stepped teeth
  for (let y = 0; y <= 2; y++) addVox(g, 0, y, 0, GOLD);
  addVox(g, -1, 2, 0, GOLD); addVox(g, 1, 2, 0, GOLD); addVox(g, 0, 3, 0, shade(GOLD, 1.2));
  addVox(g, 0, 1, 1, shade(GOLD, 0.8)); addVox(g, 1, 0, 0, GOLD); addVox(g, 2, 0, 0, GOLD); addVox(g, 2, 1, 0, GOLD);
  addVox(g, 3, 0, 0, shade(GOLD, 1.2)); addVox(g, 3, -1, 0, GOLD);
  return g;
}

function modelIronKey(): THREE.Group {
  const g = modelKey(true);
  addVox(g, 0, 3, 0, METAL_DARK); addVox(g, 1, 3, 0, METAL); addVox(g, 1, 4, 0, METAL_DARK);
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
  // long, brutal wide blade (2 deep)
  for (let y = 0; y <= 6; y++) {
    add(-1, y, y >= 5 ? METAL_DARK : METAL); add(0, y, shade(METAL, 1.08)); add(1, y, y >= 5 ? METAL_DARK : METAL);
  }
  // thick spine
  add(-1, 7, METAL_DARK); add(0, 7, shade(METAL, 1.15)); add(1, 7, METAL_DARK);
  // gold inlay down the blade
  addVox(g, 0, 2, 1, GOLD); addVox(g, 0, 3, 1, shade(GOLD, 0.9)); addVox(g, 0, 4, 1, GOLD);
  // grip + pommel
  add(0, -1, GRIP); add(0, -2, GRIP); add(0, -3, GRIP); add(0, -4, 0x5a3a1e);
  // soap residue blobs
  addVox(g, 1, 5, 2, SUD); addVox(g, -1, 3, 2, shade(SUD, 0.85)); addVox(g, 0, 6, 2, SOAP_PINK);
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

// ── distinctness pass: every base id must read as a different silhouette ──
function modelRustySword(): THREE.Group {
  const RUST = 0x8a5a3a, RUST_D = 0x6a3f25;
  const g = new THREE.Group();
  addVox(g, 0, -1, 0, 0x5a3a1e); addVox(g, 0, 0, 0, GRIP); addVox(g, 0, 1, 0, GRIP);
  addVox(g, -1, 2, 0, RUST_D); addVox(g, 0, 2, 0, RUST_D); addVox(g, 1, 2, 0, RUST_D);
  addVox(g, -1, 3, 0, RUST); addVox(g, 0, 3, 0, shade(RUST, 1.05)); addVox(g, 1, 3, 0, RUST);
  addVox(g, -1, 4, 0, RUST); addVox(g, 0, 4, 0, RUST); addVox(g, 1, 4, 0, shade(RUST, 0.9));
  addVox(g, 0, 5, 0, shade(RUST, 1.1)); addVox(g, 0, 6, 0, RUST_D);
  addVox(g, 1, 3, 1, RUST_D); addVox(g, -1, 4, 1, shade(RUST, 0.8)); // pitting
  return g;
}

function modelRustyMace(): THREE.Group {
  const RUST = 0x8a5a3a, RUST_D = 0x6a3f25;
  const g = new THREE.Group();
  addVox(g, 0, 0, 0, GRIP); addVox(g, 0, 1, 0, GRIP); addVox(g, 0, 2, 0, RUST_D);
  addVox(g, 0, 3, 0, RUST); addVox(g, 1, 3, 0, RUST); addVox(g, -1, 3, 0, RUST); addVox(g, 0, 3, 1, shade(RUST, 0.9));
  addVox(g, 0, 4, 0, shade(RUST, 1.1));
  addVox(g, 1, 4, 0, RUST_D); addVox(g, -1, 4, 0, RUST_D); // pitting
  return g;
}

function modelAxe(): THREE.Group { return buildWeaponModel('axe', 0x6b4a2e, 1); }

function modelChainShirt(): THREE.Group {
  const g = new THREE.Group(); const C1 = 0xb5bcc5, C2 = 0x6f7884;
  for (let y = 0; y <= 2; y++) for (let x = -1; x <= 1; x++) {
    addVox(g, x, y, 0, (x + y) % 2 ? C1 : C2); addVox(g, x, y, 1, (x + y) % 2 ? C2 : shade(C1, 0.8));
  }
  addVox(g, -1, 3, 0, C1); addVox(g, 1, 3, 0, C1); // shoulder straps only (sleeveless)
  return g;
}

function modelTatteredCloak(): THREE.Group {
  const g = new THREE.Group(); const C = 0x55604a;
  addVox(g, -1, 2, 0, shade(C, 0.9)); addVox(g, 0, 2, 0, C); addVox(g, 1, 2, 0, shade(C, 0.9));
  addVox(g, -1, 1, 0, shade(C, 0.8)); addVox(g, 0, 1, 0, shade(C, 0.85)); addVox(g, 1, 1, 0, shade(C, 0.8));
  addVox(g, -1, 0, 0, shade(C, 0.7)); addVox(g, 1, 0, 0, shade(C, 0.7));
  addVox(g, 0, 0, 1, shade(C, 1.2)); addVox(g, 0, 1, 1, shade(C, 1.1)); // torn lining
  addVox(g, -2, 0, 0, shade(C, 0.7)); addVox(g, 2, 1, 0, shade(C, 0.8)); // ragged edges
  return g;
}

function modelGreaterPotion(): THREE.Group {
  const g = buildConsumableModel(0x9af0c0);
  addVox(g, -1, 3, 0, GOLD); addVox(g, 1, 3, 0, GOLD); addVox(g, 0, 5, 0, shade(GOLD, 0.9)); // banded neck + seal
  return g;
}

function modelToelessBoot(): THREE.Group {
  const g = new THREE.Group();
  const L = 0x5a3a22, L_D = 0x4a3020, L_L = 0x6a4a2a;
  for (let y = 1; y <= 3; y++) { addVox(g, 0, y, 0, L_L); addVox(g, 1, y, 0, L); addVox(g, 0, y, 1, L_D); addVox(g, 1, y, 1, shade(L_D, 0.9)); }
  addVox(g, 0, 0, 0, L_L); addVox(g, 1, 0, 0, L); addVox(g, 0, 0, 1, L_D); addVox(g, 1, 0, 1, shade(L_D, 0.9));
  addVox(g, 2, 0, 0, L); addVox(g, 2, 0, 1, L_D); // short toe stub
  addVox(g, 3, 0, 0, 0xd8a878); addVox(g, 4, 0, 0, 0xd8a878); // bare foot poking out
  addVox(g, -1, 0, 0, L_D); addVox(g, -1, 0, 1, shade(L_D, 0.85));
  for (let x = -1; x <= 2; x++) { addVox(g, x, -1, 0, 0x2e2012); addVox(g, x, -1, 1, 0x241810); }
  return g;
}

function modelSturdyBoot(): THREE.Group {
  const g = modelBoot();
  addVox(g, 0, 3, 1, METAL); addVox(g, 1, 3, 1, METAL_DARK); addVox(g, 4, 0, 0, METAL_DARK); // studs + heel plate
  return g;
}

function modelGoblinSpear(): THREE.Group {
  const g = new THREE.Group(); const wood = 0x7a4a2a;
  for (let y = 0; y <= 3; y++) { addVox(g, 0, y, 0, wood); addVox(g, 0, y, 1, shade(wood, 0.85)); }
  const head = 0x9aa0a8;
  addVox(g, 0, 4, 0, head); addVox(g, 0, 4, 1, shade(head, 0.85));
  addVox(g, -1, 5, 0, head); addVox(g, 0, 5, 0, shade(head, 1.1)); addVox(g, 1, 5, 0, head);
  addVox(g, -1, 5, 1, shade(head, 0.85)); addVox(g, 0, 5, 1, shade(head, 0.95)); addVox(g, 1, 5, 1, shade(head, 0.85));
  addVox(g, 0, 6, 0, shade(head, 1.2)); addVox(g, 0, 6, 1, shade(head, 1.05));
  addVox(g, -2, 4, 0, head); addVox(g, 2, 4, 0, head); // crude barbs
  return g;
}

function modelSoapChunk(): THREE.Group {
  const c = SOAP_PINK;
  const g = new THREE.Group();
  addVox(g, 0, 0, 0, c); addVox(g, 1, 0, 0, shade(c, 0.95));
  addVox(g, 0, 0, 1, shade(c, 0.9)); addVox(g, 1, 0, 1, shade(c, 0.85));
  addVox(g, 0, 1, 0, shade(c, 1.05)); // a broken half-bar
  return g;
}

function modelPoisonMushroom(): THREE.Group {
  const g = new THREE.Group(); const cap = 0x3a2a4a;
  addVox(g, 0, 0, 0, MUSH_STEM); addVox(g, 0, 1, 0, MUSH_STEM); addVox(g, 0, 2, 0, MUSH_STEM);
  addVox(g, -1, 3, 0, cap); addVox(g, 0, 3, 0, shade(cap, 1.1)); addVox(g, 1, 3, 0, cap);
  addVox(g, -1, 3, 1, shade(cap, 0.85)); addVox(g, 0, 3, 1, shade(cap, 0.9)); addVox(g, 1, 3, 1, shade(cap, 0.85));
  addVox(g, -1, 4, 0, 0xe8e0e0); addVox(g, 1, 4, 0, 0xe8e0e0); addVox(g, 0, 4, 1, 0xe8e0e0); // toxic spots
  return g;
}

function modelMoonCap(): THREE.Group {
  const g = new THREE.Group(); const cap = 0xbcd0e8;
  addVox(g, 0, 0, 0, MUSH_STEM); addVox(g, 0, 1, 0, MUSH_STEM); addVox(g, 0, 2, 0, MUSH_STEM);
  addVox(g, -1, 3, 0, cap); addVox(g, 0, 3, 0, shade(cap, 1.1)); addVox(g, 1, 3, 0, cap);
  addVox(g, -1, 3, 1, shade(cap, 0.85)); addVox(g, 0, 3, 1, shade(cap, 0.9)); addVox(g, 1, 3, 1, shade(cap, 0.85));
  addVox(g, -2, 4, 0, shade(cap, 0.95)); addVox(g, 2, 4, 0, shade(cap, 0.95)); addVox(g, 0, 4, 0, shade(GLOW, 1.2));
  return g;
}

function modelGiantCap(): THREE.Group {
  const g = new THREE.Group(); const cap = 0x8a4a2e;
  addVox(g, 0, 0, 0, MUSH_STEM); addVox(g, 0, 1, 0, MUSH_STEM); addVox(g, 0, 2, 0, MUSH_STEM); addVox(g, 0, 3, 0, MUSH_STEM);
  for (let x = -2; x <= 2; x++) addVox(g, x, 4, 0, x % 2 ? cap : shade(cap, 1.1));
  for (let x = -1; x <= 1; x++) addVox(g, x, 5, 0, shade(cap, 1.05));
  addVox(g, -2, 4, 1, shade(cap, 0.85)); addVox(g, 0, 4, 1, shade(cap, 0.9)); addVox(g, 2, 4, 1, shade(cap, 0.85));
  addVox(g, 0, 6, 0, shade(cap, 1.2));
  return g;
}

function modelCrystal(): THREE.Group {
  const g = new THREE.Group(); const c = 0x7dd3fc;
  addVox(g, 0, 0, 0, shade(c, 0.85)); addVox(g, 0, 0, 1, shade(c, 0.7));
  addVox(g, 0, 1, 0, c); addVox(g, 0, 1, 1, shade(c, 0.9));
  addVox(g, -1, 2, 0, shade(c, 1.1)); addVox(g, 0, 2, 0, c); addVox(g, 1, 2, 0, shade(c, 1.1)); addVox(g, 0, 2, 1, c);
  addVox(g, 0, 3, 0, shade(c, 1.3));
  return g;
}

function modelGlowSpore(): THREE.Group {
  const g = modelBottle(GLASS, GLOW);
  addVox(g, 0, 4, 0, 0x3a2a18); addVox(g, 0, 3, 1, shade(GLOW, 1.4)); addVox(g, 0, 2, 1, shade(GLOW, 1.2));
  return g;
}

function modelSatchel(): THREE.Group {
  const g = new THREE.Group(); const C = 0x6b4a2e;
  for (let y = 0; y <= 1; y++) for (let x = -1; x <= 1; x++) { addVox(g, x, y, 0, C); addVox(g, x, y, 1, shade(C, 0.8)); }
  addVox(g, 0, 2, 0, shade(C, 1.1)); addVox(g, 0, 2, 1, shade(C, 0.9));
  addVox(g, -1, 2, 0, shade(C, 0.9)); addVox(g, 1, 2, 0, shade(C, 0.9));
  addVox(g, -1, 1, 1, shade(C, 0.7)); addVox(g, 1, 1, 1, shade(C, 0.7));
  addVox(g, 0, 3, 0, BRASS); addVox(g, 2, 1, 0, shade(C, 0.85)); addVox(g, -2, 1, 0, shade(C, 0.85)); // strap + pockets
  return g;
}

function modelTongue(): THREE.Group {
  const g = new THREE.Group(); const T = 0xd86a7a, T_D = 0xb04a5a;
  for (let x = 0; x <= 4; x++) { addVox(g, x, 0, 0, x % 2 ? T : T_D); addVox(g, x, 0, 1, shade(T_D, 0.9)); }
  addVox(g, 4, 1, 0, T); addVox(g, 4, 1, 1, shade(T, 0.9)); addVox(g, -1, 0, 0, shade(T_D, 0.8));
  return g;
}

function modelFiber(): THREE.Group {
  const g = new THREE.Group(); const V1 = 0x4a7a3a, V2 = 0x6a9a4a;
  addVox(g, 0, 0, 0, V1); addVox(g, 1, 0, 1, V2); addVox(g, 2, 1, 0, V1); addVox(g, 3, 1, 1, V2);
  addVox(g, 4, 2, 0, V1); addVox(g, 5, 2, 1, V2); addVox(g, 6, 1, 0, V1); addVox(g, 7, 1, 1, V2);
  addVox(g, 8, 0, 0, V1); addVox(g, 8, 0, 1, V2);
  return g;
}

function modelSeventhCap(): THREE.Group {
  const g = new THREE.Group();
  addVox(g, 0, 0, 0, MUSH_STEM); addVox(g, 0, 1, 0, MUSH_STEM); addVox(g, 0, 2, 0, MUSH_STEM);
  const cols = [0xff6b6b, 0xffd76b, 0x6bff8a, 0x6bd3ff, 0xb06ad0, 0xff6bd3];
  let i = 0;
  for (let x = -2; x <= 2; x++) { addVox(g, x, 3, 0, cols[i % cols.length]); i++; addVox(g, x, 3, 1, shade(cols[i % cols.length], 0.8)); }
  addVox(g, -1, 4, 0, cols[2]); addVox(g, 0, 4, 0, cols[4]); addVox(g, 1, 4, 0, cols[1]);
  return g;
}

const BASE_MODELS: Record<string, () => THREE.Group> = {
  // Tiered weapon families: each tier uses a different silhouette recipe.
  sword1: () => buildWeaponModel('sword', 0xc9a227, 1),
  sword2: () => buildWeaponModel('sword', 0xc9a227, 2),
  sword3: () => buildWeaponModel('sword', 0xc9a227, 3),
  dagger1: () => buildWeaponModel('dagger', 0xc9a227, 1),
  dagger2: () => buildWeaponModel('dagger', 0xc9a227, 2),
  dagger3: () => buildWeaponModel('dagger', 0xc9a227, 3),
  bow1: () => buildWeaponModel('bow', 0xc9a227, 1),
  bow2: () => buildWeaponModel('bow', 0xc9a227, 2),
  bow3: () => buildWeaponModel('bow', 0xc9a227, 3),
  mace1: () => buildWeaponModel('mace', 0xc9a227, 1),
  mace2: () => buildWeaponModel('mace', 0xc9a227, 2),
  mace3: () => buildWeaponModel('mace', 0xc9a227, 3),
  club1: () => buildWeaponModel('club', 0x6b4a2e, 1),
  club2: () => buildWeaponModel('club', 0x6b4a2e, 2),
  club3: () => buildWeaponModel('club', 0x6b4a2e, 3),
  staff1: () => buildWeaponModel('staff', 0xc9a227, 1),
  staff2: () => buildWeaponModel('staff', 0xc9a227, 2),
  staff3: () => buildWeaponModel('staff', 0xc9a227, 3),

  // Core armor recipes.
  padded: () => buildDistinctArmor(makeItemForModel('padded')),
  leather: () => buildDistinctArmor(makeItemForModel('leather')),
  chain: () => buildDistinctArmor(makeItemForModel('chain')),
  plate: () => buildDistinctArmor(makeItemForModel('plate')),
  amulet: () => buildDistinctTrinket(makeItemForModel('amulet')),
  cloak: () => buildDistinctTrinket(makeItemForModel('cloak')),
  leather_vest: () => buildDistinctArmor(makeItemForModel('leather_vest')),
  chain_shirt: modelChainShirt,
  leather_bracers: () => buildDistinctArmor(makeItemForModel('leather_bracers')),
  rusty_bracers: () => buildDistinctArmor(makeItemForModel('rusty_bracers')),
  wooden_shield: buildWoodenShieldModel,
  spore_crown: () => buildDistinctArmor(makeItemForModel('spore_crown')),
  mushroom_cap: () => buildDistinctArmor(makeItemForModel('mushroom_cap')),
  vine_cloak: () => buildDistinctArmor(makeItemForModel('vine_cloak')),
  frog_skin_cloak: () => buildDistinctArmor(makeItemForModel('frog_skin_cloak')),
  waterlogged_boots: () => buildDistinctArmor(makeItemForModel('waterlogged_boots')),

  // Remaining weapon bases get explicit recipes too.
  rusty_sword: modelRustySword,
  rusty_axe: modelAxe,
  rusty_mace: modelRustyMace,
  mushroom_staff: () => buildDistinctWeapon(makeItemForModel('mushroom_staff')),
  spore_dagger: () => buildDistinctWeapon(makeItemForModel('spore_dagger')),
  vine_whip: () => buildDistinctWeapon(makeItemForModel('vine_whip')),
  fungal_blade: () => buildDistinctWeapon(makeItemForModel('fungal_blade')),
  mycelial_staff: () => buildDistinctWeapon(makeItemForModel('mycelial_staff')),

  potion: () => buildDistinctConsumable(makeItemForModel('potion')),
  potion_greater: modelGreaterPotion,
  moon_cap: modelMoonCap,
  spore_heart: () => buildDistinctConsumable(makeItemForModel('spore_heart')),
  hallucinogenic_spore: () => buildDistinctConsumable(makeItemForModel('hallucinogenic_spore')),
  cave_fish_meat: () => buildDistinctConsumable(makeItemForModel('cave_fish_meat')),
  giant_cap: modelGiantCap,
  mycologist_satchel: modelSatchel,
  vine_fiber: modelFiber,
  frog_tongue: modelTongue,
  seventh_cap: modelSeventhCap,
  crystal_shard: modelCrystal,
  glowing_spore: modelGlowSpore,

  rubber_duck: modelDuck,
  moldy_cheese: modelCheese,
  glowing_mushroom: () => mushroom(true),
  poison_mushroom: modelPoisonMushroom,
  wine_bottle: () => modelBottle(WINE, 0x8a2a2a),
  holy_water: modelHolyWater,
  dwarven_ale: modelTankard,
  ghost_soup: modelSoup,
  bubble_bath: modelBubbleBottle,
  sewer_water_flask: () => modelBottle(GLASS, 0x6a7a4a),
  water_flask: () => modelBottle(GLASS, 0x7dd3fc),
  goblin_soap: () => modelSoap(true),
  soap_chunk: modelSoapChunk,
  premium_soap: () => modelSoap(false),
  iron_key: modelIronKey,
  golden_key: modelGoldenKey,
  rusty_key: () => modelKey(true),
  severed_finger: modelFinger,
  hermits_ring: () => modelRing(0xffd76b),
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
  goblin_spear: modelGoblinSpear,
  drowned_majesty: modelSudsClub,
  soap_crown: modelCrown,
  guards_cap: modelCap,
  pipe_helmet: modelHelmet,
  ribcage_armor: modelRibcage,
  sturdy_boots: modelSturdyBoot,
  leather_boot: modelBoot,
  toeless_boots: modelToelessBoot,
  goblin_banner: modelBanner,
  torch1: modelTorch,
  warlord_blade: modelCleaver,
  leather_belt: modelBelt,
  tattered_cloak: modelTatteredCloak,
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
    // Keep a *minimum* frame distance so small/common items render small and
    // genuinely epic (tier-3) gear, which is physically larger, reads as larger.
    const dist = Math.max(4, maxExt * 1.5);
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
