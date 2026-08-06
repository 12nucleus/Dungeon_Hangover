// ─────────────────────────────────────────────────────────────
// Destructible dungeon props — crates, barrels, vases, chests,
// sacks & urns. Geometry comes from the shared voxel-model library
// (voxelModels.mjs) so it matches the player's resolution and can
// be exported to .vox. Smashing them shatters into voxel debris,
// frees the tile and drops loot.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { VoxelWorld } from './world';
import type { GridPos } from './types';
import { rollLootTable, type Item, type LootSource } from './items';
import { DESTRUCTIBLE_BUILDERS } from './voxelModels.mjs';

export interface DestructibleDef {
  id: LootSource;      // also the loot-table source key
  name: string;        // display name, e.g. 'Crate'
  icon: string;        // emoji for logs / hover
  hp: number;
  model: string;       // key in DESTRUCTIBLE_BUILDERS
  palette: number[];   // debris burst colors (from the model)
}

function paletteOf(model: string): number[] {
  const b = DESTRUCTIBLE_BUILDERS[model];
  return b ? b(0.5).palette : [0x8d6238];
}

// ── prop definitions ─────────────────────────────────────────
export const DESTRUCTIBLE_DEFS: Record<string, DestructibleDef> = {
  crate: { id: 'crate', name: 'Crate', icon: '📦', hp: 8, model: 'crate', palette: paletteOf('crate') },
  barrel: { id: 'barrel', name: 'Barrel', icon: '🛢️', hp: 10, model: 'barrel', palette: paletteOf('barrel') },
  vase: { id: 'vase', name: 'Vase', icon: '🏺', hp: 4, model: 'vase', palette: paletteOf('vase') },
  chest_small: { id: 'chest', name: 'Small Chest', icon: '🧰', hp: 12, model: 'chest', palette: paletteOf('chest') },
  sack: { id: 'crate', name: 'Sack', icon: '💰', hp: 5, model: 'sack', palette: paletteOf('sack') },
  urn: { id: 'vase', name: 'Ash Urn', icon: '⚱️', hp: 4, model: 'urn', palette: paletteOf('urn') },
  // Greg's starter satchel at the dungeon wake — always drops the starting kit
  // (rusty dagger, lit torch, healing potion) via the 'starting' loot source.
  starting_bag: { id: 'starting', name: 'Bag of Supplies', icon: '🎒', hp: 3, model: 'sack', palette: paletteOf('sack') },
};

// ── placement (hand-authored) ────────────────────────────────
// Floor levels supply their own placement tables via LevelDef.destructibles;
// the table below is the default for levels that ship none (unused by the
// authored floor 50).
const SPOTS: [string, number, number][] = [];

export interface Destructible {
  id: string;
  def: DestructibleDef;
  pos: GridPos;
  hp: number;
  group: THREE.Group;
  pick: THREE.Mesh;
  alive: boolean;
}

const sharedMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const pickMat = new THREE.MeshBasicMaterial({ visible: false });
const _col = new THREE.Color();

export class DestructibleManager {
  readonly group = new THREE.Group();
  readonly list: Destructible[] = [];
  readonly pickboxes: THREE.Object3D[] = [];
  private seq = 0;
  private world: VoxelWorld;

  constructor(world: VoxelWorld, placements: [string, number, number][] = SPOTS) {
    this.world = world;
    for (const [defId, x, z] of placements) this.place(defId, x, z);
  }

  worldPos(p: Destructible, out = new THREE.Vector3()): THREE.Vector3 {
    this.world.tileToWorld(p.pos.x, p.pos.z, out);
    out.y += 0.5;
    return out;
  }

  byId(id: string) { return this.list.find((p) => p.id === id && p.alive) ?? null; }
  at(x: number, z: number) { return this.list.find((p) => p.alive && p.pos.x === x && p.pos.z === z) ?? null; }

  /** living props within Chebyshev radius of a tile */
  inBlast(center: GridPos, radius: number): Destructible[] {
    return this.list.filter((p) => p.alive
      && Math.max(Math.abs(p.pos.x - center.x), Math.abs(p.pos.z - center.z)) <= radius);
  }

  /** place a destructible of `defId` at (x, z), nudging to a free walkable tile. */
  placeAt(defId: string, x: number, z: number) {
    this.place(defId, x, z);
  }

  private place(defId: string, x: number, z: number) {
    const def = DESTRUCTIBLE_DEFS[defId];
    if (!def) return;
    // nudge off tiles already blocked by trees/rocks/pillars
    let spot: GridPos | null = null;
    outer: for (let r = 0; r <= 2 && !spot; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const nx = x + dx, nz = z + dz;
        if (this.world.inBounds(nx, nz) && !this.world.blocked[nx][nz] && !this.at(nx, nz)) { spot = { x: nx, z: nz }; break outer; }
      }
    }
    if (!spot) return;

    const model = DESTRUCTIBLE_BUILDERS[def.model](0.35 + (this.seq % 5) * 0.13);
    const CELL = model.cube;
    const geo = new THREE.BoxGeometry(CELL * 0.96, CELL * 0.96, CELL * 0.96);
    const im = new THREE.InstancedMesh(geo, sharedMat, model.voxels.length);
    const m4 = new THREE.Matrix4();
    let maxY = 0;
    model.voxels.forEach((c, i) => {
      m4.makeTranslation(c.x * CELL, c.y * CELL + CELL / 2, c.z * CELL);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, _col.setHex(c.c));
      if (c.y > maxY) maxY = c.y;
    });
    im.castShadow = true;
    im.receiveShadow = true;
    const g = new THREE.Group();
    g.add(im);
    this.worldPos({ pos: spot } as Destructible, g.position);
    this.group.add(g);

    const topH = (maxY + 1) * CELL;
    const pickGeo = new THREE.BoxGeometry(1.35, Math.max(0.9, topH), 1.35);   // generous hit box (clicking crates should be easy)
    const pick = new THREE.Mesh(pickGeo, pickMat);
    pick.position.copy(g.position).y += topH / 2;
    const prop: Destructible = { id: `prop_${this.seq++}`, def, pos: spot, hp: def.hp, group: g, pick, alive: true };
    pick.userData.propId = prop.id;
    this.group.add(pick);
    this.pickboxes.push(pick);
    this.list.push(prop);
    this.world.blocked[spot.x][spot.z] = true;
  }

  resetAll() {
    for (const p of this.list) {
      if (!p.alive) {
        p.alive = true;
        this.group.add(p.group, p.pick);
        this.pickboxes.push(p.pick);
        this.world.blocked[p.pos.x][p.pos.z] = true;
      }
    }
  }

  /** silent removal (no loot, no FX) — used to restore destroyed props on load */
  removeById(id: string) {
    const p = this.byId(id);
    if (!p) return;
    p.alive = false;
    this.group.remove(p.group, p.pick);
    const pi = this.pickboxes.indexOf(p.pick);
    if (pi >= 0) this.pickboxes.splice(pi, 1);
    this.world.blocked[p.pos.x][p.pos.z] = false;
  }

  /** remove from scene, unblock tile, roll the loot table */
  destroy(p: Destructible): { items: Item[]; gold: number } {
    if (!p.alive) return { items: [], gold: 0 };
    p.alive = false;
    this.group.remove(p.group, p.pick);
    const pi = this.pickboxes.indexOf(p.pick);
    if (pi >= 0) this.pickboxes.splice(pi, 1);
    this.world.blocked[p.pos.x][p.pos.z] = false;
    return rollLootTable(p.def.id);
  }

  /**
   * Tear down every prop's GPU resources and clear the manager so the
   * next floor can rebuild from scratch. Called by GameEngine.disposeFloor().
   * After dispose() the manager is unusable — construct a new one.
   */
  dispose() {
    // Walk every prop group + pick mesh, dispose their geometry/material.
    for (const p of this.list) {
      p.group.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat.dispose());
        }
      });
      if (p.pick.geometry) p.pick.geometry.dispose();
      // pickMat is shared — don't dispose
    }
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.list.length = 0;
    this.pickboxes.length = 0;
  }
}
