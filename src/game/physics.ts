// ─────────────────────────────────────────────────────────────
// Physics — a thin, fail-safe wrapper over rapier3d-compat.
//
// Owns a single rapier World stepped once per frame by the engine. Bodies
// are rigid cubes/boxes synced to Three.js meshes. The engine uses this for
// thrown / dropped objects (weapons tumble, props topple); character rigs
// stay on the hand-rolled spring solver — rapier is only for loose bodies.
//
// Fail-safe: if rapier can't init (WASM blocked, etc.) the world stays null
// and every call no-ops, so the game degrades to the old behaviour instead
// of crashing.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export interface PhysicsBody {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
}

export class PhysicsWorld {
  world: RAPIER.World | null = null;
  ready = false;
  private bodies: PhysicsBody[] = [];
  private grounds: RAPIER.RigidBody[] = [];
  private initPromise: Promise<void> | null = null;

  /** lazy, idempotent init — call once at boot, again-safe anywhere */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        await RAPIER.init();
        this.world = new RAPIER.World({ x: 0, y: -14, z: 0 });
        this.ready = true;
      } catch (err) {
        console.warn('[physics] rapier failed to init — loose-body physics disabled', err);
        this.ready = false;
        this.world = null;
      }
    })();
    return this.initPromise;
  }

  /** spawn a dynamic cuboid body bound to `mesh` at `pos` with an initial
   *  linear + angular velocity. Returns null (and does nothing) if physics
   *  isn't ready — callers should fall back to their hand-rolled tween. */
  spawnDynamic(
    mesh: THREE.Object3D,
    halfExtents: { x: number; y: number; z: number },
    pos: THREE.Vector3,
    linvel: THREE.Vector3,
    angvel: THREE.Vector3,
  ): PhysicsBody | null {
    if (!this.ready || !this.world) return null;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinvel(linvel.x, linvel.y, linvel.z)
        .setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z })
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setDensity(1)
        .setFriction(0.5)
        .setRestitution(0.25),
      body,
    );
    const b: PhysicsBody = { body, mesh };
    this.bodies.push(b);
    return b;
  }

  /** advance the simulation by `dt` seconds and sync body → mesh transforms */
  step(dt: number) {
    if (!this.ready || !this.world) return;
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
    for (const b of this.bodies) {
      const t = b.body.translation();
      const r = b.body.rotation();
      b.mesh.position.set(t.x, t.y, t.z);
      b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  /** a static "floor patch" so dynamic bodies have something to land on.
   *  Spawned per-drop at the drop tile's floor height (terrain height varies). */
  spawnGround(pos: { x: number; y: number; z: number }, halfExtents: { x: number; y: number; z: number }) {
    if (!this.ready || !this.world) return;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z).setFriction(0.6),
      body,
    );
    this.grounds.push(body);
  }

  remove(body: PhysicsBody) {
    const idx = this.bodies.indexOf(body);
    if (idx >= 0) this.bodies.splice(idx, 1);
    try {
      this.world?.removeRigidBody(body.body);
    } catch {
      /* already removed */
    }
  }

  dispose() {
    for (const b of [...this.bodies]) this.remove(b);
    for (const g of this.grounds) {
      try {
        this.world?.removeRigidBody(g);
      } catch {
        /* already removed */
      }
    }
    this.grounds = [];
    this.bodies = [];
  }
}
