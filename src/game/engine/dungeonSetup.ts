// ─────────────────────────────────────────────────────────────
// Dungeon setup & interactables — setupDungeon, attachHeroTorch,
// updateDungeon, openIronDoor, pullLever, chests, keys, aggro
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Combat } from '../combat';
import { buildCharacter, setWeapon, type Rig } from '../characters';
import { buildIronDoor, buildGoldenChest, buildLever, buildRubble, buildStoneBath, buildWeaponRack } from '../dungeonProps';
import { FX } from '../particles';
import { makeItem, rollLootTable } from '../items';
import type { GridPos } from '../types';
import { NPCS } from '../npc';
import { unitWorld } from './visuals';
import { animateTo } from './cheats';

/** place a THREE.Group at a tile on the walkable floor */
function place(engine: any, g: THREE.Group, tile: GridPos, yOff = 0) {
  const wp = unitWorld(engine, tile);
  g.position.set(wp.x, wp.y + yOff, wp.z);
  // FIX: dungeon dressing goes into a tracked dressingGroup, NOT the raw
  // scene root, so the intro cutscene can hide it alongside worldGroup +
  // propsGroup. Without this, the boss bath + weapon rack + iron door + chests
  // leak through behind the tavern walls.
  if (!engine.dressingGroup) {
    engine.dressingGroup = new THREE.Group();
    engine.dressingGroup.name = 'dungeonDressing';
    engine.scene.add(engine.dressingGroup);
  }
  engine.dressingGroup.add(g);
}

/** test if a point falls inside a rectangular region */
function inRect(p: GridPos, r: { x0: number; z0: number; x1: number; z1: number }) {
  return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
}

/** Build the dungeon set dressing — iron door, bath, boss, chests, lever, rubble, hermit */
export function setupDungeon(engine: any, L: any) {
  // NOTE: do NOT call engine.disposeFloor() here. This function is
  // called from BOTH initial init (where there's no previous floor to
  // dispose) AND subsequent floor transitions (where the caller is
  // responsible for calling disposeFloor() first). Calling it here
  // unconditionally crashes initial init because disposeFloor() nils
  // out this.world and this.props mid-setup.
  const st = L.structures;
  if (!st) return;
  engine.structures = st;

  // iron door
  const axis: 'x' | 'z' = (engine.world.isWalkable(st.bossDoor.x - 1, st.bossDoor.z) || engine.world.isWalkable(st.bossDoor.x + 1, st.bossDoor.z)) ? 'z' : 'x';
  engine.ironDoor = buildIronDoor(axis);
  place(engine, engine.ironDoor, st.bossDoor);
  engine.world.blocked[st.bossDoor.x][st.bossDoor.z] = true;

  // warlord's bath
  place(engine, buildStoneBath(), st.bossBath);

  // weapon rack
  engine.weaponRack = buildWeaponRack();
  engine.weaponRack.rotation.y = -Math.PI / 2;
  place(engine, engine.weaponRack, { x: st.bossBath.x + 2, z: st.bossBath.z });
  engine.rackClub = (engine.weaponRack.userData.club as THREE.Object3D) ?? null;

  // boss starts lounging & unarmed
  const bossU = engine.combat.units.find((u: any) => u.bossGroup && u.dropKey === 'golden');
  const bv = bossU ? engine.visuals.get(bossU.id) : null;
  if (bossU && bv) {
    setWeapon(bv.rig, null, bossU.scheme.accent);
    bv.rig.anim.crouch = 1.15;
    bv.yaw = bv.targetYaw = -Math.PI / 2;
    bv.rig.group.rotation.y = bv.yaw;
  }

  // golden chest (boss reward) + secret room stash
  engine.goldenChest = buildGoldenChest();
  place(engine, engine.goldenChest, st.goldenChest, 0.02);
  engine.secretChestMesh = buildGoldenChest();
  place(engine, engine.secretChestMesh, st.secretChest, 0.02);

  // lever + rubble
  engine.leverMesh = buildLever();
  place(engine, engine.leverMesh, st.secretLever);
  for (const t of st.secretRubble) {
    const r = buildRubble(0.3 + t.x * 0.07 + t.z * 0.03);
    place(engine, r, t);
    engine.world.blocked[t.x][t.z] = true;
    engine.rubbleMeshes.push({ mesh: r, tile: t });
  }

  // Old Merv the hermit
  if (st.hermitChamber) {
    engine.hermitPos = { ...st.hermitChamber };
    const hermitScheme = NPCS.hermit_merv.scheme;
    const rig = buildCharacter(hermitScheme);
    const wp = unitWorld(engine, st.hermitChamber);
    rig.group.position.set(wp.x, wp.y, wp.z);
    rig.group.rotation.y = 0;
    rig.group.userData.baseY = wp.y;
    rig.anim.mode = 'idle';
    engine.scene.add(rig.group);
    engine.hermitRig = rig;

    const bb = new THREE.Box3().setFromObject(rig.group);
    const rigH = Math.max(0.7, isFinite(bb.max.y - bb.min.y) ? bb.max.y - bb.min.y : 1.8);
    const rigR = Math.max(0.45, Math.min(0.9, isFinite(bb.max.x - bb.min.x) ? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 0.15 : 0.5));
    const yOff = (isFinite(bb.min.y) ? bb.min.y - wp.y : 0) + rigH / 2;
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(rigR, rigR, rigH, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.userData.hermitNpc = true;
    proxy.position.copy(wp).y += yOff;
    engine.scene.add(proxy);
    engine.unitProxies.push(proxy);
  }
}

/** Mount a burning torch in the hero's off-hand */
export function attachHeroTorch(_engine: any, _rig: Rig) {
  // hero torch permanently removed — no-op stub
}

/** Per-frame dungeon logic — prop tweens, torch flicker, interactable proximity */
export function updateDungeon(engine: any, dt: number) {
  if (!engine.structures) return;
  const st = engine.structures;
  if (engine.propAnims.length) engine.propAnims = engine.propAnims.filter((fn: any) => !fn(dt));

  if (engine.heroLight) {
    engine.torchT += dt;
    engine.heroLight.intensity = 12.5 + Math.sin(engine.torchT * 13) * 1.6 + Math.sin(engine.torchT * 27) * 0.8;
    if (engine.heroTorchFlame) {
      const s = 1 + Math.sin(engine.torchT * 22) * 0.14 + Math.sin(engine.torchT * 41) * 0.07;
      engine.heroTorchFlame.scale.set(1, s, 1);
    }
  }

  if (engine.phase !== 'explore' || engine.combat.inCombat || engine.busy || engine.gameWon) return;
  const party = engine.combat.living('party');
  const adj = (t: GridPos) => party.some((p: any) => Combat.dist(p.pos, t) <= 1);

  if (engine.leverMesh && !engine.secretOpen && adj(st.secretLever)) pullLever(engine);
  if (engine.ironDoor && !engine.ironDoorOpen && adj(st.bossDoor)) {
    if (engine.hasIronKey) openIronDoor(engine);
    else engine.setHoverInfoOnce('A great iron door, locked tight. Somewhere a warden holds its key.');
  }
  if (engine.goldenChest && !engine.goldenChestOpen && adj(st.goldenChest)) {
    if (engine.hasGoldenKey) openGoldenChest(engine);
    else engine.setHoverInfoOnce('An ornate golden chest. Only a golden key will open it.');
  }
  if (engine.secretChestMesh && !engine.secretChestOpen && adj(st.secretChest)) openSecretChest(engine);
}

export function openIronDoor(engine: any) {
  if (!engine.structures || !engine.ironDoor) return;
  engine.ironDoorOpen = true;
  const st = engine.structures;
  engine.world.blocked[st.bossDoor.x][st.bossDoor.z] = false;
  engine.audio.unlock(); engine.audio.door();
  const d = engine.ironDoor;
  const y0 = d.position.y;
  animateTo(engine, () => d.position.y, (v: any) => { d.position.y = v; }, y0 + (d.userData.openY as number), 1.5);
  engine.pushLog('🔓 The iron key turns. The great door grinds down into the floor.', 'system');
  engine.bigMessage = 'The Iron Door Opens...';
  engine.emitSnapshot();
  setTimeout(() => { engine.bigMessage = null; engine.emitSnapshot(); }, 2200);
  setTimeout(() => { if (engine.ironDoor) { engine.scene.remove(engine.ironDoor); engine.ironDoor = null; } }, 1800);
}

export function pullLever(engine: any) {
  if (!engine.structures || !engine.leverMesh) return;
  engine.secretOpen = true;
  const l = engine.leverMesh;
  const handle = l.userData.handle as THREE.Group;
  animateTo(engine, () => handle.rotation.x, (v: any) => { handle.rotation.x = v; }, l.userData.pulledAngle as number, 0.4);
  engine.audio.lever();
  for (const r of engine.rubbleMeshes) {
    engine.world.blocked[r.tile.x][r.tile.z] = false;
    const g = r.mesh;
    FX.impactDust(engine.particles, g.position.clone().setY(g.position.y + 0.1), [0x6f6a78, 0x413d47]);
    animateTo(engine, () => g.scale.y, (v: any) => { g.scale.set(Math.max(0.01, v), Math.max(0.01, v), Math.max(0.01, v)); }, 0.01, 0.6);
  }
  engine.audio.play('sword_hit', 0.4, 0.4);
  setTimeout(() => { for (const r of engine.rubbleMeshes) engine.scene.remove(r.mesh); engine.rubbleMeshes = []; }, 900);
  engine.pushLog('🪨 With a grinding crash, the rubble collapses — a hidden passage lies open!', 'system');
  engine.bigMessage = 'Secret Passage Revealed!';
  engine.emitSnapshot();
  setTimeout(() => { engine.bigMessage = null; engine.emitSnapshot(); }, 2200);
}

export function openSecretChest(engine: any) {
  if (!engine.secretChestMesh) return;
  engine.secretChestOpen = true;
  const lid = engine.secretChestMesh.userData.lid as THREE.Group;
  animateTo(engine, () => lid.rotation.x, (v: any) => { lid.rotation.x = v; }, engine.secretChestMesh.userData.openAngle as number, 0.6);
  engine.audio.chestOpen();
  const { items, gold } = rollLootTable('secret');
  FX.levelup(engine.particles, engine.secretChestMesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
  grantLoot(engine, items, gold);
  engine.pushLog(`🗝️ The hidden stash holds: ${[...items.map((i: any) => `${i.icon} ${i.name}`), `🪙 ${gold} gold`].join(', ')}.`, 'system');
  engine.emitSnapshot();
}

export function openGoldenChest(engine: any) {
  if (!engine.goldenChest) return;
  engine.goldenChestOpen = true;
  const lid = engine.goldenChest.userData.lid as THREE.Group;
  animateTo(engine, () => lid.rotation.x, (v: any) => { lid.rotation.x = v; }, engine.goldenChest.userData.openAngle as number, 0.7);
  engine.audio.chestOpen(); engine.audio.bossSting();
  const { items, gold } = rollLootTable('goldenkey');
  FX.levelup(engine.particles, engine.goldenChest.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
  grantLoot(engine, items, gold);
  engine.pushLog(`👑 The golden chest bursts open: ${[...items.map((i: any) => `${i.icon} ${i.name}`), `🪙 ${gold} gold`].join(', ')}!`, 'system');
  winGame(engine);
}

export function winGame(engine: any) {
  engine.gameWon = true;
  engine.phase = 'victory';
  engine.audio.setDrums(false);
  engine.audio.setMusicDucked(false);
  engine.audio.play('victory', 0.95);
  engine.bigMessage = 'VICTORY — The Warlord\'s hoard is yours!';
  engine.emitSnapshot();
}

export function grantKey(engine: any, kind: 'iron' | 'golden') {
  const id = kind === 'iron' ? 'iron_key' : 'golden_key';
  const it = makeItem(id);
  engine.inventory.push(it);
  if (kind === 'iron') engine.hasIronKey = true; else engine.hasGoldenKey = true;
  engine.audio.unlock();
  engine.pushLog(`🗝️ You pry the ${it.name} from the fallen.`, 'system');
  engine.bigMessage = `${it.icon} ${it.name} obtained!`;
  engine.emitSnapshot();
  setTimeout(() => { if (engine.bigMessage?.includes(it.name)) { engine.bigMessage = null; engine.emitSnapshot(); } }, 2400);
}

export function checkDungeonAggro(engine: any) {
  if (!engine.structures || engine.phase !== 'explore' || engine.combat.inCombat || engine.busy || engine.gameWon) return;
  if (engine.aggroDisabled) return;
  if (performance.now() / 1000 < engine.introGraceUntil) return;
  const st = engine.structures;
  const party = engine.combat.living('party');
  if (!party.length) return;

  if (!engine.bossCutscenePlayed && party.some((p: any) => inRect(p.pos, st.bossRoom))) {
    engine.bossCutscenePlayed = true;
    void engine.playBossCutscene();
    return;
  }

  for (const f of engine.combat.units) {
    if (!f.alive || f.team !== 'enemy' || !f.dormant || f.bossGroup) continue;
    const range = (f.flying ? 5 : 4) - (engine.sneaking ? 2 : 0);
    for (const p of party) {
      if (Combat.dist(p.pos, f.pos) <= range || (!engine.sneaking && inEnemyCone(engine, p.pos, f))) {
        aggroGroup(engine, f.groupId);
        return;
      }
    }
  }
}

export function aggroGroup(engine: any, groupId: string | undefined) {
  const grp = engine.combat.units.filter((u: any) => u.alive && u.team === 'enemy' && u.dormant && u.groupId === groupId);
  if (!grp.length) return;
  for (const u of grp) u.dormant = false;
  const kind = grp[0].scheme.monster;
  if (kind === 'rat') engine.audio.squeak();
  else if (kind === 'bat') engine.audio.screech();
  else if (kind === 'skeleton') engine.audio.boneRattle();
  else engine.audio.roar();
  engine.pushLog(`⚔ ${grp.length} ${grp[0].title}${grp.length > 1 ? 's' : ''} lurch from the dark!`, 'system');
  engine.enqueue(engine.combat.start());
}

export function inEnemyCone(engine: any, p: GridPos, enemy: any): boolean {
  const dist = Combat.dist(p, enemy.pos);
  if (dist > 9) return false;
  if (!enemy.alive) return false;
  const cd = engine.enemyCones.find((c: any) => c.unitId === enemy.id);
  if (!cd) return false;
  const dx = p.x - enemy.pos.x, dz = p.z - enemy.pos.z;
  const angle = Math.atan2(dx, dz);
  let diff = angle - cd.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= 35 * Math.PI / 180;
}

export function grantLoot(engine: any, items: any[], gold: number) {
  engine.inventory.push(...items);
  engine.gold += gold;
  for (const it of items) engine.loot.push(`${it.icon} ${it.name}`);
  if (gold) engine.loot.push(`🪙 ${gold} gold`);
}
