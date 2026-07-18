// ─────────────────────────────────────────────────────────────
// Destructible dungeon props — crates, barrels, vases & chests
// built from tiny voxel cubes (one InstancedMesh per prop) so they
// match the "everything is tiny cubes" art direction and can be
// smashed: AoE blasts and direct attacks shatter them into solid
// voxel debris, free their tile (world.blocked) and drop loot.
// Data-driven: add a def in DESTRUCTIBLE_DEFS + a spot in SPOTS.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { VoxelWorld } from './world';
import type { GridPos } from './types';
import { rollLootTable, type Item, type LootSource } from './items';

const CELL = 0.11; // mini-cube edge (world units) — 6 cells ≈ 0.66 tall

export interface DestructibleDef {
  id: LootSource;      // also the loot-table source key
  name: string;        // display name, e.g. 'Crate'
  icon: string;        // emoji for logs / hover
  hp: number;
  palette: number[];   // debris burst colors
  build: (v: Vox) => void;
}

// ── tiny voxel assembler ─────────────────────────────────────
interface Cell { x: number; y: number; z: number; c: number; }

export class Vox {
  cells: Cell[] = [];
  private col = new THREE.Color();

  /** add one mini-cube at grid coord (y up), with ±jitter lightness */
  add(x: number, y: number, z: number, color: number, jitter = 0.12) {
    const j = 1 - jitter / 2 + Math.random() * jitter;
    this.col.setHex(color).multiplyScalar(j);
    this.cells.push({ x, y, z, c: this.col.getHex() });
  }

  /** filled circle (disc) of radius r at row y */
  disc(y: number, r: number, color: number, jitter?: number) {
    const n = Math.ceil(r);
    for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
      if (Math.hypot(x, z) <= r) this.add(x, y, z, color, jitter);
    }
  }

  /** hollow ring of radius r at row y */
  ring(y: number, r: number, color: number, jitter?: number) {
    const n = Math.ceil(r);
    for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
      const d = Math.hypot(x, z);
      if (d <= r && d > r - 1.25) this.add(x, y, z, color, jitter);
    }
  }

  /** n×n×n hollow box; cells on 2+ boundary faces get frameColor */
  shell(n: number, color: number, frameColor: number) {
    const h = (n - 1) / 2;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
      const bx = x === 0 || x === n - 1, by = y === 0 || y === n - 1, bz = z === 0 || z === n - 1;
      if (!bx && !by && !bz) continue;
      this.add(x - h, y, z - h, (bx ? 1 : 0) + (by ? 1 : 0) + (bz ? 1 : 0) >= 2 ? frameColor : color);
    }
  }
}

// palette hexes mirror textures.ts (wood / clay / metal / gold)
const WOOD = 0x8d6238, WOOD_DARK = 0x5f3e22, WOOD_MID = 0x7a5230;
const CLAY = 0xa9603a, CLAY_DARK = 0x7e4426;
const IRON = 0x4a4d55, GOLD = 0xf5c542;

// ── prop definitions ─────────────────────────────────────────
export const DESTRUCTIBLE_DEFS: Record<string, DestructibleDef> = {
  crate: {
    id: 'crate', name: 'Crate', icon: '📦', hp: 8,
    palette: [WOOD, WOOD_DARK, WOOD_MID],
    build: (v) => v.shell(6, WOOD, WOOD_DARK),
  },
  barrel: {
    id: 'barrel', name: 'Barrel', icon: '🛢️', hp: 10,
    palette: [WOOD_MID, WOOD_DARK, IRON],
    build: (v) => {
      for (let y = 0; y < 7; y++) {
        const r = 2.1 + Math.sin((y / 6) * Math.PI) * 0.7; // bulge
        const band = y === 1 || y === 5;
        v.ring(y, r, band ? IRON : WOOD_MID);
      }
      v.disc(6, 1.5, WOOD_DARK); // lid
    },
  },
  vase: {
    id: 'vase', name: 'Vase', icon: '🏺', hp: 4,
    palette: [CLAY, CLAY_DARK],
    build: (v) => {
      const profile = [1.2, 2.0, 2.5, 2.5, 1.9, 1.1, 1.3]; // belly → neck → lip
      profile.forEach((r, y) => v.ring(y, r, y >= 5 ? CLAY_DARK : CLAY));
      v.disc(0, 1.2, CLAY_DARK); // base
    },
  },
  chest_small: {
    id: 'chest', name: 'Small Chest', icon: '🧰', hp: 12,
    palette: [WOOD_DARK, WOOD_MID, GOLD],
    build: (v) => {
      v.shell(5, WOOD_MID, WOOD_DARK);
      for (let x = -2; x <= 2; x++) v.add(x, 5, 0, GOLD, 0.05); // lid clasp row
      v.add(0, 2, -2, GOLD, 0.05); // lock
    },
  },
};

// ── placement (hand-authored) ────────────────────────────────
// Inside the ruins arena: crate clusters near the pillars, barrels
// along the broken north wall, vases in corners — plus a few props
// on the path from the party start up to the arena.
const SPOTS: [string, number, number][] = [
  ['crate', 30, 8], ['crate', 31, 8], ['crate', 30, 10],          // west pillar cluster
  ['crate', 40, 16], ['crate', 41, 16],                           // east pillar cluster
  ['barrel', 33, 7], ['barrel', 37, 7], ['barrel', 39, 7],        // along the north wall
  ['vase', 29, 8], ['vase', 41, 17], ['vase', 29, 16],            // corners
  ['chest_small', 35, 8],                                         // deeper in the ruins
  ['crate', 33, 30], ['barrel', 30, 25], ['vase', 36, 22],        // path from party start
];

export interface Destructible {
  id: string;
  def: DestructibleDef;
  pos: GridPos;
  hp: number;
  group: THREE.Group;
  pick: THREE.Mesh;
  alive: boolean;
}

const sharedGeo = new THREE.BoxGeometry(CELL * 0.96, CELL * 0.96, CELL * 0.96);
const sharedMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const pickGeo = new THREE.BoxGeometry(0.85, 0.95, 0.85);
const pickMat = new THREE.MeshBasicMaterial({ visible: false });

export class DestructibleManager {
  readonly group = new THREE.Group();
  readonly list: Destructible[] = [];
  readonly pickboxes: THREE.Object3D[] = [];
  private seq = 0;
  private world: VoxelWorld;

  constructor(world: VoxelWorld) {
    this.world = world;
    for (const [defId, x, z] of SPOTS) this.place(defId, x, z);
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

    const vox = new Vox();
    def.build(vox);
    const im = new THREE.InstancedMesh(sharedGeo, sharedMat, vox.cells.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    vox.cells.forEach((c, i) => {
      m4.makeTranslation(c.x * CELL, c.y * CELL + CELL / 2, c.z * CELL);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col.setHex(c.c));
    });
    im.castShadow = true;
    const g = new THREE.Group();
    g.add(im);
    this.worldPos({ pos: spot } as Destructible, g.position);
    this.group.add(g);

    const pick = new THREE.Mesh(pickGeo, pickMat);
    pick.position.copy(g.position).y += 0.45;
    const prop: Destructible = { id: `prop_${this.seq++}`, def, pos: spot, hp: def.hp, group: g, pick, alive: true };
    pick.userData.propId = prop.id;
    this.group.add(pick);
    this.pickboxes.push(pick);
    this.list.push(prop);
    this.world.blocked[spot.x][spot.z] = true;
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
}
