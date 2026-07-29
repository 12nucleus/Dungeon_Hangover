// ─────────────────────────────────────────────────────────────
// equipment — layer voxel clothing / armor / hats onto a rig
// ─────────────────────────────────────────────────────────────
// The player rig is built "naked" (briefs only). This module adds wearable
// pieces on top by attaching small voxel meshes to the correct rig part, so
// they follow the body's animation (boots track the feet, gloves the hands,
// a helmet the head, …). Each piece is tracked in `rig.equipped` so it can be
// removed later (unequip / unequipAll) — e.g. Greg is dressed for the tavern
// flashback, then stripped back to his underwear when he wakes in the dungeon.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox, C_DETAIL, shade } from './vox';
import type { Rig } from './vox';
import type { EquipSlot } from '../types';
import type { Item } from '../items';

// Grid pivot (cx, cy) for every rig part, so equipment voxels built in the
// part's LOCAL space line up 1:1 with the body voxels that part was built from.
// (Mirrors the offsets used by rigPlayer.ts + limb.ts.)
export const PART_PIVOTS: Record<string, { cx: number; cy: number }> = {
  torso: { cx: 0, cy: 45 },
  head: { cx: 0, cy: 64 },
  hair: { cx: 0, cy: 66 },
  legL: { cx: -4, cy: 34 }, legR: { cx: 4, cy: 34 },
  shinL: { cx: -4, cy: 22 }, shinR: { cx: 4, cy: 22 },
  armL: { cx: -10, cy: 55 }, armR: { cx: 10, cy: 55 },
  foreL: { cx: -10, cy: 43 }, foreR: { cx: 10, cy: 43 },
  handL: { cx: -10, cy: 31 }, handR: { cx: 10, cy: 31 },
  wristL: { cx: -10, cy: 31 }, wristR: { cx: 10, cy: 31 },
};

export type EquipStyle =
  | 'shirt' | 'leather' | 'chain' | 'plate'
  | 'hood' | 'helm' | 'cap'
  | 'pants' | 'greaves' | 'boots';

export interface EquipVisual {
  slot: EquipSlot;
  color: number;
  style?: EquipStyle;
}

// ── low-level voxel helpers ──────────────────────────────────

/** true if (x,z) lies inside the rounded box [x0..x1]×[z0..z1] with corner radius r */
function inRound(x: number, z: number, x0: number, z0: number, x1: number, z1: number, r: number): boolean {
  const cx0 = x0 + r, cx1 = x1 - r, cz0 = z0 + r, cz1 = z1 - r;
  let dx = 0, dz = 0;
  if (x < cx0) dx = x - cx0; else if (x > cx1) dx = x - cx1;
  if (z < cz0) dz = z - cz0; else if (z > cz1) dz = z - cz1;
  return dx * dx + dz * dz <= r * r + 0.3;
}

/**
 * Add a 1-voxel-thick shell (the perimeter of a rounded box) into `vox`, in the
 * part's local grid space. `skip(x,y,z)` lets callers carve openings (e.g. a
 * helmet's face hole).
 */
function ringShell(
  vox: Vox, piv: { cx: number; cy: number },
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number,
  color: number, skip?: (x: number, y: number, z: number) => boolean,
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (!inRound(x, z, x0, z0, x1, z1, r)) continue;
        if (skip && skip(x, y, z)) continue;
        // keep only the outer surface: drop voxels whose 4 in-plane neighbours
        // are all still inside the rounded box (those are hidden interior).
        const enclosed =
          inRound(x + 1, z, x0, z0, x1, z1, r) &&
          inRound(x - 1, z, x0, z0, x1, z1, r) &&
          inRound(x, z + 1, x0, z0, x1, z1, r) &&
          inRound(x, z - 1, x0, z0, x1, z1, r);
        if (enclosed) continue;
        vox.add(x - piv.cx, y - piv.cy, z, color, 0.02);
      }
    }
  }
}

// ── per-slot builders ────────────────────────────────────────

function buildChest(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  const color = def.color;
  for (let y = 34; y <= 57; y++) {
    const t = (y - 37) / 18;
    const hx = Math.round(7 + t * 1.8);
    ringShell(v, piv, -hx - 2, y, -7, hx + 2, y, 7, 2, color);
  }
  if (def.style === 'plate') {
    for (const s of [-1, 1]) ringShell(v, piv, s * 9, 52, -5, s * 12, 56, 5, 2, color);
  }
}

function buildLegs(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  ringShell(v, piv, piv.cx - 5, 22, -5, piv.cx + 5, 34, 5, 2, def.color);
}

function buildBoots(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  ringShell(v, piv, piv.cx - 5, 0, -6, piv.cx + 5, 21, 7, 2, def.color);
}

function buildGloves(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  ringShell(v, piv, piv.cx - 3, 28, -3, piv.cx + 3, 34, 3, 2, def.color);
}

function buildHead(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  const topY = def.style === 'cap' ? 71 : 73;
  const botY = def.style === 'cap' ? 65 : 58;
  ringShell(v, piv, -7, botY, -7, 7, topY, 7, 2, def.color, (_x, y, z) => z > 3 && y < 64);
}

function buildAmulet(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  v.add(0 - piv.cx, 42 - piv.cy, 6, def.color, 0.02);
  v.add(0 - piv.cx, 43 - piv.cy, 6, shade(def.color, 0.8), 0.02);
}

function buildRing(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  for (let a = 0; a < 360; a += 45) {
    const rad = (Math.PI * a) / 180;
    const x = Math.round(piv.cx + 2 * Math.cos(rad));
    const z = Math.round(2 * Math.sin(rad));
    v.add(x - piv.cx, 30 - piv.cy, z, def.color, 0.02);
  }
}

function buildShield(v: Vox, piv: { cx: number; cy: number }, def: EquipVisual) {
  ringShell(v, piv, -13, 40, -3, -11, 46, 3, 1, def.color);
}

// ── public API ───────────────────────────────────────────────

/** Build the voxel mesh(es) for one equipment piece, attached to the right part(s). */
function buildPiece(def: EquipVisual): { part: string; mesh: THREE.Mesh }[] {
  const out: { part: string; mesh: THREE.Mesh }[] = [];
  const mk = (part: string, build: (v: Vox, piv: { cx: number; cy: number }) => void) => {
    const piv = PART_PIVOTS[part];
    if (!piv) return;
    const vox = new Vox(C_DETAIL, 1);
    build(vox, piv);
    out.push({ part, mesh: vox.mesh() });
  };
  switch (def.slot) {
    case 'chest': mk('torso', (v, p) => buildChest(v, p, def)); break;
    case 'legs': for (const s of ['L', 'R']) mk('leg' + s, (v, p) => buildLegs(v, p, def)); break;
    case 'boots': for (const s of ['L', 'R']) mk('shin' + s, (v, p) => buildBoots(v, p, def)); break;
    case 'gloves': for (const s of ['L', 'R']) mk('hand' + s, (v, p) => buildGloves(v, p, def)); break;
    case 'head': mk('head', (v, p) => buildHead(v, p, def)); break;
    case 'amulet': mk('torso', (v, p) => buildAmulet(v, p, def)); break;
    case 'ring': for (const s of ['L', 'R']) mk('hand' + s, (v, p) => buildRing(v, p, def)); break;
    case 'offHand': mk('foreL', (v, p) => buildShield(v, p, def)); break;
    default: break;
  }
  return out;
}

/** Equip a piece onto a rig (replacing any existing piece in the same slot). */
export function equip(rig: Rig, def: EquipVisual): void {
  unequip(rig, def.slot);
  const pieces = buildPiece(def);
  const stored: THREE.Object3D[] = [];
  for (const { part, mesh } of pieces) {
    const target = rig.parts[part];
    if (!target) { mesh.geometry.dispose(); continue; }
    target.add(mesh);
    stored.push(mesh);
  }
  if (!rig.equipped) rig.equipped = {};
  rig.equipped[def.slot] = stored;
}

/** Remove a single equipped piece (by slot). */
export function unequip(rig: Rig, slot: EquipSlot): void {
  const arr = rig.equipped?.[slot];
  if (!arr) return;
  for (const o of arr) {
    o.parent?.remove(o);
    o.traverse((c: THREE.Object3D) => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  }
  if (rig.equipped) delete rig.equipped[slot];
}

/** Strip every equipped piece from a rig. */
export function unequipAll(rig: Rig): void {
  if (!rig.equipped) return;
  for (const slot of Object.keys(rig.equipped) as EquipSlot[]) unequip(rig, slot);
}

/**
 * Convert a data Item into an EquipVisual for the voxel rig. Returns null for
 * items that have no wearable visual (weapons are handled by setWeapon, cloaks
 * have no EquipSlot, consumables aren't equipped).
 */
export function itemToEquipVisual(item: Item, slotOverride?: string): EquipVisual | null {
  let slot: string | undefined =
    slotOverride ?? item.slot ?? (item.kind === 'armor' ? 'chest' : item.kind === 'weapon' ? 'weapon' : undefined);
  if (!slot) {
    const n = item.name.toLowerCase();
    if (n.includes('ring')) slot = 'ring';
    else if (n.includes('amulet')) slot = 'amulet';
    else return null;
  }
  if (slot === 'weapon' || slot === 'cloak') return null;
  const s = slot as EquipSlot;
  const n = item.name.toLowerCase();
  let color = 0x9aa0a8;
  let style: EquipStyle = 'shirt';
  if (item.kind === 'armor') {
    if (n.includes('plate')) { color = 0xb8bfc9; style = 'plate'; }
    else if (n.includes('chain')) { color = 0x9aa0a8; style = 'chain'; }
    else if (n.includes('leather')) { color = 0x6b4423; style = 'leather'; }
    else { color = 0xcfc4a8; style = 'shirt'; }
  } else if (s === 'head') { color = 0x6b4423; style = 'helm'; }
  else if (s === 'legs') { color = 0x4a3b2a; style = 'pants'; }
  else if (s === 'boots') { color = 0x4a3b2a; style = 'boots'; }
  else if (s === 'gloves') { color = 0x6b4423; style = 'leather'; }
  else if (s === 'amulet' || s === 'ring') { color = 0xffd700; style = 'shirt'; }
  return { slot: s, color, style };
}
