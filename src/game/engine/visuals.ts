// ─────────────────────────────────────────────────────────────
// engine/visuals — unit visual creation, weapon dropping, cutscene host
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { GameEngine } from '../engine';
import { buildCharacter } from '../characters';
import type { Unit, GridPos } from '../types';
import type { UnitVisual } from '../engine';

/** Create a unit's visual rig, proxy hitbox, and HP bar overlay */
export function addUnit(engine: GameEngine, u: Unit) {
  const rig = buildCharacter(u.scheme, u.weapon);
  const wp = unitWorld(engine, u.pos);
  rig.group.position.copy(wp);
  rig.group.userData.baseY = wp.y;
  rig.group.rotation.y = u.team === 'party' ? Math.PI : 0;
  engine.scene.add(rig.group);

  // Size the (invisible) click hitbox to the rig's real bounds
  const bb = new THREE.Box3().setFromObject(rig.group);
  const rigH = Math.max(0.7, isFinite(bb.max.y - bb.min.y) ? bb.max.y - bb.min.y : 1.8);
  const rigR = Math.max(0.45, Math.min(0.9,
    isFinite(bb.max.x - bb.min.x) ? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 0.15 : 0.5));
  const yOff = (isFinite(bb.min.y) ? bb.min.y - wp.y : 0) + rigH / 2;
  const proxy = new THREE.Mesh(
    new THREE.CylinderGeometry(rigR, rigR, rigH, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  proxy.userData.unitId = u.id;
  proxy.userData.yOff = yOff;
  proxy.position.copy(wp).y += yOff;
  engine.scene.add(proxy);
  engine.unitProxies.push(proxy);

  const bar = document.createElement('div');
  bar.className = 'unit-bar';
  bar.innerHTML = `<div class="ub-name">${u.name}</div><div class="ub-hp ${u.team}"><i></i></div>`;
  engine.overlay.appendChild(bar);
  const barFill = bar.querySelector('i') as HTMLElement;

  engine.visuals.set(u.id, { rig, proxy, bar, barFill, walker: null, yaw: rig.group.rotation.y, targetYaw: rig.group.rotation.y });
}

/** Convert a grid tile to world position — delegates to the world's canonical
 *  tile mapping (VoxelWorld.tileToWorld, offset by half a tile in Y so a rig's
 *  feet rest on the floor surface). MUST stay identical to engine.unitWorld,
 *  which uses WORLD_SIZE / 2 — the old hardcoded `-60` (half of a 120-wide
 *  grid) put every walker target / rig offset 15 tiles up-right, so clicking
 *  a floor tile sent Greg bolting through the wall. */
export function unitWorld(engine: GameEngine, p: GridPos): THREE.Vector3 {
  const wp = engine.world.tileToWorld(p.x, p.z, new THREE.Vector3());
  wp.y += 0.5;
  return wp;
}

/** Detach a dying unit's held weapon and let it tumble to the floor */
export function dropWeapon(engine: GameEngine, v: UnitVisual) {
  const wpn = v.rig.parts.weapon as unknown as THREE.Object3D | undefined;
  if (!wpn || !wpn.parent) return;
  const baseY = (v.rig.group.userData.baseY as number) ?? wpn.getWorldPosition(new THREE.Vector3()).y;
  engine.scene.attach(wpn);
  const dir = Math.random() * Math.PI * 2, spd = 0.8 + Math.random() * 1.2;
  engine.droppedWeapons.push({
    obj: wpn,
    vx: Math.cos(dir) * spd,
    vz: Math.sin(dir) * spd,
    vy: 1.5 + Math.random() * 1.8,
    spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
    restY: baseY + 0.04,
    settled: false,
  });
  delete (v.rig.parts as { weapon?: THREE.Mesh }).weapon;
}

/** Simple gravity + tumble + bounce for dropped weapons */
export function updateDroppedWeapons(engine: GameEngine, dt: number) {
  for (const d of engine.droppedWeapons) {
    if (d.settled) continue;
    d.vy -= 14 * dt;
    d.obj.position.x += d.vx * dt;
    d.obj.position.z += d.vz * dt;
    d.obj.position.y += d.vy * dt;
    d.obj.rotation.x += d.spin.x * dt;
    d.obj.rotation.y += d.spin.y * dt;
    d.obj.rotation.z += d.spin.z * dt;
    if (d.obj.position.y <= d.restY) {
      d.obj.position.y = d.restY;
      if (d.vy < -1.6) {
        d.vy = -d.vy * 0.32; d.vx *= 0.45; d.vz *= 0.45; d.spin.multiplyScalar(0.4);
      } else {
        d.vy = 0; d.vx = 0; d.vz = 0;
        d.obj.rotation.set(Math.PI / 2, d.obj.rotation.y, 0);
        d.settled = true;
      }
    }
  }
}
