// ─────────────────────────────────────────────────────────────
// Dungeon setup & interactables — setupDungeon, attachHeroTorch,
// updateDungeon, openIronDoor, pullLever, chests, keys, aggro
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Combat } from '../combat';
import { buildCharacter, setWeapon, updateRig, type Rig } from '../characters';
import { buildIronDoor, buildGoldenChest, buildLever, buildRubble, buildStoneBath, buildWeaponRack } from '../dungeonProps';
import { FX } from '../particles';
import { makeItem, rollLootTable } from '../items';
import type { GridPos } from '../types';
import type { LevelDef } from '../../levels/levelTypes';
import { NPCS } from '../npc';
import { SUMMON_TEMPLATES } from '../skills';
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

/** Build the dungeon set dressing — iron door, bath, boss, chests, lever, rubble, hermit */
export function setupDungeon(engine: any, L: LevelDef) {
  // NOTE: do NOT call engine.disposeFloor() here. This function is
  // called from BOTH initial init (where there's no previous floor to
  // dispose) AND subsequent floor transitions (where the caller is
  // responsible for calling disposeFloor() first). Calling it here
  // unconditionally crashes initial init because disposeFloor() nils
  // out this.world and this.props mid-setup.
  const st = L.structures;
  if (!st) return;
  engine.structures = st;

  // Greg's starter satchel — placed on a free tile right next to where he wakes.
  // Smashing it (click) grants the starting kit: rusty dagger, torch, potion.
  {
    const near = [
      { x: st.partySpawn.x + 1, z: st.partySpawn.z },
      { x: st.partySpawn.x - 1, z: st.partySpawn.z },
      { x: st.partySpawn.x, z: st.partySpawn.z + 1 },
      { x: st.partySpawn.x, z: st.partySpawn.z - 1 },
    ];
    const bagSpot = near.find((t) => engine.world.inBounds(t.x, t.z) && !engine.world.blocked[t.x][t.z] && engine.world.isWalkable(t.x, t.z));
    if (bagSpot) engine.props.placeAt('starting_bag', bagSpot.x, bagSpot.z);
  }

  // iron door(s): the boss door + any authored doors (soap gate, trapdoor)
  const axis: 'x' | 'z' = (engine.world.isWalkable(st.bossDoor.x - 1, st.bossDoor.z) || engine.world.isWalkable(st.bossDoor.x + 1, st.bossDoor.z)) ? 'z' : 'x';
  engine.ironDoor = buildIronDoor(axis);
  place(engine, engine.ironDoor, st.bossDoor);
  engine.world.blocked[st.bossDoor.x][st.bossDoor.z] = true;
  for (const d of st.doors ?? []) {
    const mesh = buildIronDoor(d.axis);
    place(engine, mesh, d.pos);
    engine.world.blocked[d.pos.x][d.pos.z] = true;
    engine.doorMeshes.push({ id: d.id, pos: { ...d.pos }, flag: d.openedByFlag, mesh });
  }

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

  // lever + rubble (Warren path) + authored blockers (floor 50)
  engine.leverMesh = buildLever();
  place(engine, engine.leverMesh, st.secretLever);
  for (const t of st.secretRubble) {
    const r = buildRubble(0.3 + t.x * 0.07 + t.z * 0.03);
    place(engine, r, t);
    engine.world.blocked[t.x][t.z] = true;
    engine.rubbleMeshes.push({ mesh: r, tile: t });
  }
  for (const b of st.blockers ?? []) {
    for (const t of b.tiles) {
      const mesh = b.kind === 'secretDoor'
        ? buildIronDoor('z')
        : buildRubble(0.3 + t.x * 0.07 + t.z * 0.03);
      place(engine, mesh, t);
      engine.world.blocked[t.x][t.z] = true;
      engine.blockerMeshes.push({ id: b.id, kind: b.kind, flag: b.openedByFlag, tile: { ...t }, mesh });
    }
  }

  // hand-authored NPCs (hermit, other hermit, Scrag) — generic registry
  engine.npcs = [];
  for (const n of st.npcs ?? []) {
    const npc = NPCS[n.npcId];
    if (!npc) continue;
    const rig = buildCharacter(npc.scheme);
    const wp = unitWorld(engine, n.pos);
    rig.group.position.set(wp.x, wp.y, wp.z);
    rig.group.rotation.y = 0;
    rig.group.userData.baseY = wp.y;
    rig.anim.mode = 'idle';
    engine.scene.add(rig.group);

    const bb = new THREE.Box3().setFromObject(rig.group);
    const rigH = Math.max(0.7, isFinite(bb.max.y - bb.min.y) ? bb.max.y - bb.min.y : 1.8);
    const rigR = Math.max(0.45, Math.min(0.9, isFinite(bb.max.x - bb.min.x) ? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 0.15 : 0.5));
    const yOff = (isFinite(bb.min.y) ? bb.min.y - wp.y : 0) + rigH / 2;
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(rigR, rigR, rigH, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.userData.npcId = n.npcId;
    proxy.position.copy(wp).y += yOff;
    engine.scene.add(proxy);
    engine.unitProxies.push(proxy);
    engine.npcs.push({ npcId: n.npcId, pos: { ...n.pos }, rig, proxy });
  }

  // authored room lookup + narration (floor 50)
  engine.roomOf = L.roomOf ?? null;
  engine.roomNarration = L.roomNarration ?? null;
  if (engine.roomOf) engine.setFlag?.('visited_r1');   // arrival narration covers R1
  // register per-run interactables from the level
  if (L.makeInteractables) engine.registerInteractables?.(L.makeInteractables(engine.runSeed ?? 0));
  else engine.registerInteractables?.([]);
  // environmental hazard tiles (wine press / bath tub shove targets)
  engine.hazardTiles = new Set((L.hazards ?? []).map((h) => `${h.tile.x},${h.tile.z}`));
  engine.hazardKind = new Map((L.hazards ?? []).map((h) => [`${h.tile.x},${h.tile.z}`, h.kind]));
  engine.hazardUsed = new Set();
  // per-run hidden treasures
  engine.hiddenTreasures = L.makeHiddenTreasures ? L.makeHiddenTreasures(engine.runSeed ?? 0) : [];
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

  // ── idle patrolling (M8): dormant mobs wander their room ──
  // They keep their home tile as an anchor, pick a random walkable spot a
  // few tiles away, and stroll over using the same walker animation as the
  // player. The moment aggro fires (checkDungeonAggro) the walker is
  // cleared by the combat 'phase' event and they fight in place.
  const S = engine.world.heights.length;
  for (const f of engine.combat.living('enemy')) {
    if (!f.dormant || f.bossGroup) continue;          // boss waits for his cutscene
    if (f.patrolT === undefined) f.patrolT = 0;
    f.patrolT -= dt;
    const v = engine.visuals.get(f.id);
    if (v?.walker) continue;                          // already mid-leg
    if (f.patrolT > 0) continue;
    f.patrolT = 4 + Math.random() * 6;                // pause before the next leg
    if (!f.home) f.home = { ...f.pos };
    for (let tries = 0; tries < 10; tries++) {
      const tx = f.home.x + Math.round((Math.random() - 0.5) * 7);
      const tz = f.home.z + Math.round((Math.random() - 0.5) * 7);
      if (tx < 0 || tz < 0 || tx >= S || tz >= S) continue;
      if (!engine.world.isWalkable(tx, tz)) continue;
      if (Math.abs(engine.world.heightAt(tx, tz) - engine.world.heightAt(f.home.x, f.home.z)) > 1) continue;
      if (party.some((p: any) => Combat.dist(p.pos, { x: tx, z: tz }) <= 1)) continue;
      const path = engine.combat.pathTo(f, tx, tz, 10);
      if (path && path.length >= 2) {
        engine.moveUnitAlong(f, path);
        break;
      }
    }
  }

  if (engine.leverMesh && !engine.secretOpen && adj(st.secretLever)) pullLever(engine);
  // boss door: iron key (Warren) or the level's open flag (floor 50)
  if (engine.ironDoor && !engine.ironDoorOpen) {
    const openCond = st.bossDoorOpenFlag ? engine.flags.has(st.bossDoorOpenFlag) : engine.hasIronKey;
    if (openCond) openIronDoor(engine);
  }
  if (engine.goldenChest && !engine.goldenChestOpen && adj(st.goldenChest)) {
    if (engine.hasGoldenKey) openGoldenChest(engine);
    else engine.setHoverInfoOnce('An ornate golden chest. Only a golden key will open it.');
  }
  // floor 50: the vault chest is an interactable (cursed gold) — skip the generic path
  if (engine.secretChestMesh && !engine.secretChestOpen && adj(st.secretChest) && !engine.structures?.rooms) openSecretChest(engine);

  // ── authored doors: slide open when their flag is set ──
  for (const d of engine.doorMeshes) {
    if (d.mesh.userData.opened || !engine.flags.has(d.flag)) continue;
    d.mesh.userData.opened = true;
    if (d.flag === 'soap_gate_open') {
      // the soap conundrum resolves however the gate opened (soap, force, charm)
      if (!engine.questLog?.get('soap_conundrum')) engine.questLog?.start('soap_conundrum');
      if (engine.questLog?.get('soap_conundrum')?.stage !== 'completed') {
        engine.completeQuest?.('soap_conundrum');
        engine.pushLog('🧼 The gate swings open. The soap conundrum is solved.', 'system');
      }
    }
    engine.world.blocked[d.pos.x][d.pos.z] = false;
    engine.audio.door();
    const y0 = d.mesh.position.y;
    animateTo(engine, () => d.mesh.position.y, (v: any) => { d.mesh.position.y = v; }, y0 + (d.mesh.userData.openY as number), 1.2);
    const mesh = d.mesh;
    setTimeout(() => { if (mesh.parent) mesh.parent.remove(mesh); }, 1500);
  }
  // ── blockers: rubble collapses / secret doors slide when flag set ──
  for (const b of engine.blockerMeshes) {
    if (b.mesh.userData.opened || !engine.flags.has(b.flag)) continue;
    b.mesh.userData.opened = true;
    engine.world.blocked[b.tile.x][b.tile.z] = false;
    if (b.kind === 'rubble') {
      engine.audio.crumble(0.7);
      const g = b.mesh;
      FX.impactDust(engine.particles, g.position.clone().setY(g.position.y + 0.1), [0x6f6a78, 0x413d47]);
      animateTo(engine, () => g.scale.y, (v: any) => { g.scale.set(Math.max(0.01, v), Math.max(0.01, v), Math.max(0.01, v)); }, 0.01, 0.6);
      setTimeout(() => { if (g.parent) g.parent.remove(g); }, 700);
    } else {
      engine.audio.door();
      const y0 = b.mesh.position.y;
      animateTo(engine, () => b.mesh.position.y, (v: any) => { b.mesh.position.y = v; }, y0 + (b.mesh.userData.openY as number), 1.2);
      const mesh = b.mesh;
      setTimeout(() => { if (mesh.parent) mesh.parent.remove(mesh); }, 1500);
    }
  }

  // ── NPC rigs idle ──
  for (const n of engine.npcs) {
    if (n.rig) updateRig(n.rig, dt, 1);
  }

  // ── Scrag hostile path: attacked → he becomes a goblin guard ──
  if (engine.flags?.has('scrag_hostile') && !engine.flags.has('scrag_hostile_done') && !engine.combat.inCombat && !engine.busy) {
    engine.setFlag('scrag_hostile_done');
    const scrag = engine.npcs.find((n: any) => n.npcId === 'scrag');
    if (scrag) {
      if (scrag.rig?.group?.parent) scrag.rig.group.parent.remove(scrag.rig.group);
      if (scrag.proxy?.parent) scrag.proxy.parent.remove(scrag.proxy);
      scrag.rig = null;
      scrag.proxy = null;
      const guard = SUMMON_TEMPLATES.goblin_guard();
      guard.name = 'Scrag';
      guard.title = 'Furious Goblin Guard';
      guard.groupId = 'scrag_hostile';
      guard.dormant = false;
      engine.combat.summon(guard, scrag.pos);
      engine.addUnit(guard);
      engine.pushLog('⚔ Scrag drops the bored act. He was ALWAYS ready for this.', 'system');
      engine.enqueue(engine.combat.start());
    }
  }

  // ── interactables: nearest visible prompt ──
  engine.updateInteractables();

  // ── room-entry narration (first entry per room, skip during combat) ──
  const leader = party[0];
  if (engine.roomOf && engine.roomNarration && leader && !engine.combat.inCombat) {
    const roomId = engine.roomOf(leader.pos.x, leader.pos.z);
    if (roomId && !engine.flags.has(`visited_${roomId}`)) {
      engine.setFlag(`visited_${roomId}`);
      if (['r16', 'r17', 'r19'].includes(roomId)) engine.runStats.secretsFound += 1;
      const text = engine.roomNarration[roomId];
      if (text) void engine.narrate(`f50_room_${roomId}`, text, 5200);
      maybeAmbush(engine, roomId, leader.pos);
    }
  }

  // ── hidden treasures: first step onto a seeded tile → sparkle + loot ──
  if (leader && engine.hiddenTreasures?.length) {
    const k = `${leader.pos.x},${leader.pos.z}`;
    const idx = engine.hiddenTreasures.findIndex((t: any) => `${t.x},${t.z}` === k);
    if (idx >= 0 && !engine.flags.has(`ht_${idx}`)) {
      engine.setFlag(`ht_${idx}`);
      engine.runStats.secretsFound += 1;
      FX.levelup(engine.particles, unitWorld(engine, leader.pos).clone().add(new THREE.Vector3(0, 0.6, 0)));
      const gold = 2 + Math.floor(Math.random() * 6);
      grantLoot(engine, [], gold);
      engine.pushLog(`✨ You kick something under the muck — ${gold} gold!`, 'system');
    }
  }
}

/**
 * Floor-50 ambushes: entering a dark sewer tunnel (3/7/11/12) with the
 * torch OFF has a 50% (seeded) chance to summon a rat pack; entering the
 * goblin rooms (21/22/24) after making noise summons a patrol. One per room.
 */
function maybeAmbush(engine: any, roomId: string, pos: GridPos) {
  if (engine.combat.inCombat || engine.busy || engine.gameWon) return;
  const seed = (engine.runSeed ?? 0) ^ roomId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const roll = ((seed * 1103515245 + 12345) >>> 16) % 100;
  const torchOff = !engine.torchLit || engine.torchFuel <= 0;
  const darkRooms = ['r3', 'r7', 'r11', 'r12'];
  if (darkRooms.includes(roomId) && torchOff && roll < 50) {
    engine.pushLog('Something moves in the dark. Something with too many teeth.', 'system');
    void engine.narrate('f50_ambush', 'Something moves in the dark. Something with too many legs. Something with too many TEETH.', 3800);
    for (let i = 0; i < 2; i++) {
      const rat = SUMMON_TEMPLATES.small_rat();
      engine.combat.summon(rat, pos);
      engine.addUnit(rat);
    }
    const big = SUMMON_TEMPLATES.small_rat();
    big.name = 'Large Rat';
    big.title = 'Den Tyrant';
    big.maxHp = 10; big.hp = 10; big.ac = 12; big.xpValue = 30;
    big.scheme = { ...big.scheme, bulk: 1.25 };
    big.onHit = { condition: 'bleeding', chance: 1, rounds: 2, saveAbility: 'con', saveDC: 10 };
    engine.combat.summon(big, pos);
    engine.addUnit(big);
    engine.enqueue(engine.combat.start());
    return;
  }
  if (['r21', 'r22', 'r24'].includes(roomId) && engine.flags.has('made_noise')) {
    engine.pushLog('You hear goblin footsteps. They\'re looking for YOU.', 'system');
    void engine.narrate('f50_patrol', 'You hear footsteps. You hear GOBLIN footsteps. They\'re looking for something. They\'re looking for YOU.', 3800);
    const guard = SUMMON_TEMPLATES.goblin_guard();
    engine.combat.summon(guard, pos);
    engine.addUnit(guard);
    engine.enqueue(engine.combat.start());
  }
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
  // no winGame here on floor 50 — the staircase behind Gribnab's bath is the exit
}

/** Floor Complete — the run recap screen (stats + New Run / Title). */
export function winGame(engine: any) {
  engine.gameWon = true;
  engine.phase = 'victory';
  engine.audio.setDrums(false);
  engine.audio.setMusicDucked(false);
  engine.audio.play('victory', 0.95);
  const s = engine.runStats ?? { kills: 0, deaths: 0, questsDone: 0, secretsFound: 0, startedAt: Date.now() };
  engine.pushLog('🏆 Floor 50 cleared — The Sewer Cellar conquered!', 'system');
  engine.bigMessage = `FLOOR 50 CLEARED — ${Math.max(0, Math.round((Date.now() - s.startedAt) / 1000))}s, ${s.kills} kills, ${s.deaths} deaths, ${s.questsDone} quests, ${s.secretsFound} secrets`;
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

// legacy module-level aggro — the canonical version lives on GameEngine
// (engine.ts checkDungeonAggro), which handles the floor-50 boss arenas.
export function checkDungeonAggro(engine: any) {
  if (typeof engine.checkDungeonAggro === 'function') { engine.checkDungeonAggro(); return; }
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
  // scouted through the R11 crack → the R12 den is caught flat-footed
  const surprise = groupId === 'r12_rats' && engine.flags?.has('scouted_12');
  engine.enqueue(surprise ? engine.combat.startDetection(true) : engine.combat.start());
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
