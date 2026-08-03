// ─────────────────────────────────────────────────────────────
// Trap system — hidden floor hazards placed around the world.
// Revealed by passive perception, triggered by stepping on
// them, disarmed by adjacent party members.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { GridPos, DamageType } from './types';
import { VoxelWorld } from './world';

export interface TrapDef {
  id: string;
  name: string;
  icon: string;
  damageDice: string;
  damageType: DamageType;
  appliesCondition?: string;
  conditionRounds?: number;
}

export interface Trap {
  id: string;
  def: TrapDef;
  pos: GridPos;
  revealed: boolean;
  triggered: boolean;
  mesh?: THREE.Mesh;
}

export const TRAP_DEFS: Record<string, TrapDef> = {
  spike: { id: 'spike', name: 'Spike Trap', icon: '🕳️', damageDice: '2d6', damageType: 'piercing' },
  fire: { id: 'fire', name: 'Fire Trap', icon: '🔥', damageDice: '3d6', damageType: 'fire', appliesCondition: 'burning', conditionRounds: 2 },
  snare: { id: 'snare', name: 'Snare Trap', icon: '🪢', damageDice: '0', damageType: 'piercing', appliesCondition: 'rooted', conditionRounds: 2 },
  // ── floor 50 — sewer cellar traps ──
  darts: { id: 'darts', name: 'Dart Trap', icon: '🎯', damageDice: '2d6', damageType: 'piercing', appliesCondition: 'poisoned', conditionRounds: 3 },
  spore: { id: 'spore', name: 'Mold Spore Trap', icon: '🍄', damageDice: '0', damageType: 'poison', appliesCondition: 'nauseated', conditionRounds: 3 },
  flood: { id: 'flood', name: 'Sewer Flood', icon: '🌊', damageDice: '1d6', damageType: 'bludgeoning' },
};

/**
 * Placement table: [defId, x, z] — floor levels supply their own table
 * (the Warlord's Warren placements moved into floor50/engine init); the
 * generic defaults are kept for the original 7-room map path.
 */
export const TRAP_PLACEMENTS: [string, number, number][] = [];

export class TrapManager {
  traps: Trap[] = [];
  group = new THREE.Group();
  private world: VoxelWorld;

  constructor(world: VoxelWorld) {
    this.world = world;
  }

  /**
   * (Re)build the trap list from a placement table `[defId, x, z][]`.
   * Clears any previously placed traps first (idempotent — safe to call
   * again when a fresh run re-rolls trap tiles).
   */
  init(placements: [string, number, number][] = TRAP_PLACEMENTS) {
    this.traps = [];
    let tid = 0;
    for (const [defId, x, z] of placements) {
      const def = TRAP_DEFS[defId];
      if (!def) continue;
      this.traps.push({
        id: `trap_${tid++}`,
        def,
        pos: { x, z },
        revealed: false,
        triggered: false,
      });
    }
  }

  at(tx: number, tz: number): Trap | null {
    return this.traps.find((t) => t.pos.x === tx && t.pos.z === tz && !t.triggered) ?? null;
  }

  reveal(t: Trap) {
    if (t.revealed || t.triggered) return;
    t.revealed = true;
    const wp = this.tileWorld(t.pos);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8c00, transparent: true, opacity: 0.55, depthWrite: false });
    const geo = new THREE.PlaneGeometry(0.8, 0.8);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wp.x, wp.y + 0.04, wp.z);
    mesh.renderOrder = 1;
    this.group.add(mesh);
    t.mesh = mesh;
    // X icon floater
    const el = document.createElement('div');
    el.className = 'trap-marker';
    el.textContent = '⚠';
    el.style.cssText = `position:absolute;pointer-events:none;font-size:18px;color:#ff8c00;text-shadow:0 0 8px rgba(255,140,0,0.7);`;
    this.group.userData.trapEls ??= [];
    this.group.userData.trapEls.push({ el, wp: wp.clone() });
  }

  trigger(t: Trap, onDamage: (dice: string, type: DamageType, cond?: string, condRounds?: number) => void) {
    if (t.triggered) return;
    t.triggered = true;
    if (t.mesh) {
      this.group.remove(t.mesh);
      t.mesh.geometry.dispose();
      (t.mesh.material as THREE.Material).dispose();
      t.mesh = undefined;
    }
    if (t.def.damageDice !== '0' || t.def.appliesCondition) {
      onDamage(t.def.damageDice, t.def.damageType, t.def.appliesCondition, t.def.conditionRounds);
    }
  }

  revealCheck(p: GridPos, dist: number, wisMod: number, prof: number): Trap | null {
    for (const t of this.traps) {
      if (t.revealed || t.triggered) continue;
      const d = Math.max(Math.abs(p.x - t.pos.x), Math.abs(p.z - t.pos.z));
      if (d <= dist) {
        const roll = 1 + Math.floor(Math.random() * 20);
        const total = roll + wisMod + prof;
        if (total >= 14) {
          this.reveal(t);
          return t;
        }
      }
    }
    return null;
  }

  update(overlay: HTMLDivElement, cam: THREE.Camera, w: number, h: number) {
    const els = (this.group.userData.trapEls ?? []) as { el: HTMLDivElement; wp: THREE.Vector3 }[];
    for (const e of els) {
      const sp = e.wp.clone();
      sp.project(cam);
      if (sp.z > 1) { e.el.style.display = 'none'; continue; }
      e.el.style.display = 'block';
      e.el.style.transform = `translate(${(sp.x * 0.5 + 0.5) * w}px, ${(-sp.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`;
      if (!overlay.contains(e.el)) overlay.appendChild(e.el);
    }
  }

  private tileWorld(p: GridPos): THREE.Vector3 {
    const h = this.world.heightAt(p.x, p.z);
    return new THREE.Vector3(p.x - 23 + 0.5, h + 0.5, p.z - 23 + 0.5);
  }

  dispose() {
    for (const t of this.traps) {
      if (t.mesh) {
        this.group.remove(t.mesh);
        t.mesh.geometry.dispose();
        (t.mesh.material as THREE.Material).dispose();
      }
    }
    this.traps = [];
  }
}
