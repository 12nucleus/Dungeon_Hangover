// ─────────────────────────────────────────────────────────────
// Surface system — the "everything is possible" layer.
//
// A sparse map of tile → elemental surface (oil / burning / wet / frozen /
// electrified). Surfaces REACT when a new one is applied on top of an old
// one (fire ignites oil, water douses fire, ice freezes water, lightning
// conducts through water…). This is pure data + reaction logic; the engine
// owns damage, FX and per-frame ticking so this stays decoupled from the
// scene graph (no circular imports).
// ─────────────────────────────────────────────────────────────

export type SurfaceKind = 'oil' | 'burning' | 'wet' | 'frozen' | 'electrified';

export interface SurfaceEntry {
  kind: SurfaceKind;
  ttl: number; // seconds remaining
}

/** default lifetime (seconds) for each surface, absent an explicit ttl */
const SURFACE_TTL: Record<SurfaceKind, number> = {
  oil: 60,
  burning: 4,
  wet: 45,
  frozen: 6,
  electrified: 2.5,
};

/** how much damage a unit standing on an active surface takes per tick */
export const SURFACE_DAMAGE: Partial<Record<SurfaceKind, number>> = {
  burning: 2,
  electrified: 3,
};

export interface SurfaceTile {
  x: number;
  z: number;
  kind: SurfaceKind;
}

/**
 * Reaction table: applying `incoming` onto a tile that is already `cur`
 * yields a new kind, or `null` to clear the tile entirely.
 *   burning + oil        → burning   (ignites)
 *   burning + wet        → null      (steam)
 *   burning + frozen     → wet       (melts)
 *   wet     + frozen     → frozen    (freezes)
 *   wet     + electrified→ electrified (conducts)
 */
function react(cur: SurfaceKind, incoming: SurfaceKind): SurfaceKind | null {
  if (incoming === 'burning') {
    if (cur === 'oil') return 'burning';
    if (cur === 'wet') return null;
    if (cur === 'frozen') return 'wet';
    return 'burning';
  }
  if (incoming === 'oil') {
    if (cur === 'burning') return 'burning';
    return 'oil';
  }
  if (incoming === 'wet') {
    if (cur === 'burning') return null;
    if (cur === 'electrified') return 'electrified';
    if (cur === 'frozen') return 'frozen';
    return 'wet';
  }
  if (incoming === 'electrified') {
    if (cur === 'wet') return 'electrified';
    return 'electrified';
  }
  if (incoming === 'frozen') {
    if (cur === 'wet') return 'frozen';
    if (cur === 'burning') return null;
    return 'frozen';
  }
  return incoming;
}

export class SurfaceSystem {
  private tiles = new Map<string, SurfaceEntry>();

  private static key(x: number, z: number): string {
    return `${x},${z}`;
  }

  get(x: number, z: number): SurfaceKind | null {
    return this.tiles.get(SurfaceSystem.key(x, z))?.kind ?? null;
  }

  has(x: number, z: number, kind?: SurfaceKind): boolean {
    const k = this.tiles.get(SurfaceSystem.key(x, z));
    if (!k) return false;
    return kind ? k.kind === kind : true;
  }

  /** apply a surface; runs the reaction table against whatever is already there */
  apply(x: number, z: number, kind: SurfaceKind, ttl?: number): void {
    const key = SurfaceSystem.key(x, z);
    const cur = this.tiles.get(key);
    const next = cur ? react(cur.kind, kind) : kind;
    if (next === null) {
      this.tiles.delete(key);
      return;
    }
    this.tiles.set(key, { kind: next, ttl: ttl ?? SURFACE_TTL[next] });
  }

  /** ignite everything in a radius (fire spell landing) — oil → burning, wet → steam */
  ignite(x: number, z: number, radius: number): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) > radius) continue;
        const k = SurfaceSystem.key(x + dx, z + dz);
        const cur = this.tiles.get(k);
        if (!cur) continue;
        if (cur.kind === 'oil' || cur.kind === 'burning') {
          this.tiles.set(k, { kind: 'burning', ttl: SURFACE_TTL.burning });
        } else if (cur.kind === 'wet') {
          this.tiles.delete(k); // doused → steam
        }
      }
    }
  }

  clear(x: number, z: number): void {
    this.tiles.delete(SurfaceSystem.key(x, z));
  }

  reset(): void {
    this.tiles.clear();
  }

  /**
   * Advance all surfaces by `dt` seconds. Returns the tiles still active
   * (expired ones are dropped). The engine uses this to spawn FX + apply
   * damage to units standing on burning / electrified ground.
   */
  tick(dt: number): SurfaceTile[] {
    const active: SurfaceTile[] = [];
    for (const [key, e] of this.tiles) {
      e.ttl -= dt;
      if (e.ttl <= 0) {
        this.tiles.delete(key);
        continue;
      }
      const [x, z] = key.split(',').map(Number);
      active.push({ x, z, kind: e.kind });
    }
    return active;
  }
}
