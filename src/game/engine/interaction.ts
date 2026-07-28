// ─────────────────────────────────────────────────────────────
// Interaction — pickTile, fog, hover, click handlers, NPC dialogue
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Combat } from '../combat';
import { SKILLS } from '../skills';
import type { GridPos, SkillDef, Unit } from '../types';
import { NPCS, type NPCDef } from '../npc';
import { makeItem } from '../items';
import { QUESTS } from '../quest';
import { unitWorld } from './visuals';
import { clearHighlights, showAoePreview, pingAt } from './targeting';

// ══ fog of war ══════════════════════════════════════════════
export function updateFog(engine: any, _dt: number) {
  if (!engine.explored.length || engine.phase === 'menu' || engine.busy) return;
  const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat?.living('party')[0];
  if (!leader) return;

  const radius = engine.torchLit ? engine.visionRadius + 5 : engine.visionRadius;
  const px = leader.pos.x, pz = leader.pos.z;
  const S = engine.explored.length;
  const x0 = Math.max(0, px - radius), x1 = Math.min(S - 1, px + radius);
  const z0 = Math.max(0, pz - radius), z1 = Math.min(S - 1, pz + radius);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const dist = Math.max(Math.abs(x - px), Math.abs(z - pz));
      if (dist <= radius && engine.world.isWalkable(x, z) && !engine.explored[x][z]) {
        engine.explored[x][z] = true;
      }
    }
  }

  const scanRadius = radius + 10;
  const sx0 = Math.max(0, px - scanRadius), sx1 = Math.min(S - 1, px + scanRadius);
  const sz0 = Math.max(0, pz - scanRadius), sz1 = Math.min(S - 1, pz + scanRadius);
  for (let x = sx0; x <= sx1; x++) {
    for (let z = sz0; z <= sz1; z++) {
      if (!engine.world.isWalkable(x, z)) continue;
      const key = `${x},${z}`;
      if (!engine.explored[x][z]) {
        if (!engine.fogCubes.has(key) && engine.fogGroup) {
          const g = new THREE.BoxGeometry(1.06, 12, 1.06);
          const m = new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false });
          const mesh = new THREE.Mesh(g, m);
          const wp = unitWorld(engine, { x, z });
          mesh.position.set(wp.x, wp.y + 3, wp.z);
          mesh.renderOrder = 5;
          engine.fogGroup.add(mesh);
          engine.fogCubes.set(key, mesh);
        }
      } else {
        const cube = engine.fogCubes.get(key);
        if (cube) { engine.fogGroup?.remove(cube); engine.fogCubes.delete(key); }
      }
    }
  }
}

// ══ tile picking ═══════════════════════════════════════════
export function pickTile(engine: any): GridPos | null {
  engine.ray.setFromCamera(engine.pointer, engine.iso.cam);
  const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat?.living('party')[0];
  const pickY = leader ? engine.world.heightAt(leader.pos.x, leader.pos.z) : 1;
  const origin = engine.ray.ray.origin;
  const dir = engine.ray.ray.direction;
  if (Math.abs(dir.y) < 1e-6) return null;
  const t = (pickY - origin.y) / dir.y;
  if (t < 0) return null;
  const hx = origin.x + dir.x * t;
  const hz = origin.z + dir.z * t;
  return engine.world.worldToTile(hx, hz);
}

// ══ hover ══════════════════════════════════════════════════
export function updateHover(engine: any) {
  engine.ray.setFromCamera(engine.pointer, engine.iso.cam);
  const unitHit = engine.ray.intersectObjects(engine.unitProxies, false)[0];
  let info: string | null = null;
  if (unitHit) {
    const u = engine.byId(unitHit.object.userData.unitId as string);
    if (u && u.alive) info = `${u.name} · ${u.title} — HP ${u.hp}/${u.maxHp} · AC ${u.ac}${u.conditions.length ? ' · ' + u.conditions.map((c: any) => c.name).join(', ') : ''}`;
  }
  if (!info) {
    const propHit = engine.ray.intersectObjects(engine.props.pickboxes, false)[0];
    const p = propHit ? engine.props.byId(propHit.object.userData.propId as string) : null;
    if (p) info = `${p.def.icon} ${p.def.name} — destructible`;
  }
  if (!info && engine.phase === 'explore' && !engine.combat.inCombat) {
    const tile = pickTile(engine);
    if (tile) {
      const trap = engine.trapManager.at(tile.x, tile.z);
      if (trap && trap.revealed) {
        const adj = engine.combat.living('party').some((u: any) => Combat.dist(u.pos, trap.pos) <= 1.5);
        info = `⚠ ${trap.def.icon} ${trap.def.name}${adj ? ' — click to disarm' : ''}`;
      }
    }
  }
  if (engine.targeting && !unitHit) {
    const tile = pickTile(engine);
    const s = SKILLS[engine.targeting];
    const a = engine.combat.active;
    if (tile && s && s.aoeRadius > 0 && !s.selfCentered && a) showAoePreview(engine, s, tile);
  }
  if (info !== engine.hoverInfo) { engine.hoverInfo = info; engine.emitSnapshot(); }
}

export function setHoverInfoOnce(engine: any, s: string) { engine.hoverInfo = s; engine.emitSnapshot(); }

// ══ click logic ════════════════════════════════════════════
export function clickExplore(engine: any, unitId: string | undefined, tile: GridPos | null, propId?: string) {
  if (propId) {
    const prop = engine.props.byId(propId);
    if (prop) {
      const near = engine.combat.living('party').find((u: any) => Combat.dist(u.pos, prop.pos) <= 1);
      if (near) { void engine.smashProp(near, prop); return; }
      const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat.living('party')[0];
      if (leader) {
        const adj = closestWalkableAdjacent(engine, prop.pos, leader);
        if (adj) {
          const path = engine.combat.pathTo(leader, adj.x, adj.z);
          if (path && path.length) {
            engine.pendingSmash = { unitId: leader.id, propId: prop.id };
            moveUnitAlong(engine, leader, path);
            engine.emitSnapshot();
            return;
          }
        }
      }
      setHoverInfoOnce(engine, `${prop.def.icon} Can't reach the ${prop.def.name}.`);
      return;
    }
  }
  if (unitId) {
    const u = engine.byId(unitId);
    if (u?.team === 'party') { engine.selectedId = u.id; engine.audio.play('ui_click'); engine.emitSnapshot(); return; }
  }

  const hermitProxy = engine.unitProxies.find((p: any) => p.userData.hermitNpc);
  if (!unitId && hermitProxy) {
    engine.ray.setFromCamera(engine.pointer, engine.iso.cam);
    const hit = engine.ray.intersectObjects(engine.unitProxies, false)[0];
    if (hit?.object === hermitProxy && engine.hermitPos) {
      const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat.living('party')[0];
      if (leader && Combat.dist(leader.pos, engine.hermitPos) <= 1.5) {
        talkToNpc(engine, 'hermit_merv');
      } else {
        setHoverInfoOnce(engine, 'Old Merv the hermit — get closer to talk.');
      }
      return;
    }
  }

  if (tile) {
    const trap = engine.trapManager.at(tile.x, tile.z);
    if (trap && trap.revealed) {
      const adj = engine.combat.living('party').find((u: any) => Combat.dist(u.pos, trap.pos) <= 1.5);
      if (adj) { void engine.disarmTrap(adj, trap); return; }
    }
  }
  const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat.living('party')[0];
  if (!leader || !tile) return;

  if (engine.bonfireGroup && engine.bonfireLit && engine.bonfirePos && tile && Combat.dist(leader.pos, engine.bonfirePos!) <= 1.5) {
    if (tile.x === engine.bonfirePos.x && tile.z === engine.bonfirePos.z) {
      engine.restAtBonfire();
      return;
    }
  }
  const cp = engine.structures?.checkpoint;
  if (engine.bonfireGroup && !engine.bonfireLit && cp && tile && tile.x === cp.x && tile.z === cp.z) {
    if (Combat.dist(leader.pos, tile) <= 1.5) {
      engine.lightBonfire();
      return;
    } else {
      setHoverInfoOnce(engine, 'An unlit bonfire. Move closer to kindle it.');
      return;
    }
  }

  const path = engine.combat.pathTo(leader, tile.x, tile.z);
  if (!path || !path.length) return;
  engine.audio.play('ui_click', 0.5);
  pingAt(engine, tile);
  moveUnitAlong(engine, leader, path);
  const followers = engine.combat.living('party').filter((u: any) => u.id !== leader.id);
  const dest = path[path.length - 1];
  const spots: GridPos[] = [
    { x: dest.x - 1, z: dest.z + 1 }, { x: dest.x + 1, z: dest.z + 1 },
    { x: dest.x - 1, z: dest.z - 1 }, { x: dest.x + 1, z: dest.z - 1 },
    { x: dest.x, z: dest.z + 2 },
  ];
  followers.forEach((f: any, i: number) => {
    const spot = spots.find((s) => engine.world.isWalkable(s.x, s.z) && !engine.combat.living('party').some((o: any) => o.id !== f.id && o.pos.x === s.x && o.pos.z === s.z)) ?? spots[i % spots.length];
    const fp = engine.combat.pathTo(f, spot.x, spot.z, 60);
    if (fp && fp.length) moveUnitAlong(engine, f, fp);
  });
  engine.selectedId = leader.id;
  engine.emitSnapshot();
}

export function moveUnitAlong(engine: any, u: Unit, path: GridPos[]) {
  const v = engine.visuals.get(u.id)!;
  const pts = path.map((t: GridPos) => unitWorld(engine, t));
  v.walker = { path: pts, idx: 0 };
  v.rig.anim.mode = 'walk';
  const dest = path[path.length - 1];
  u.pos = { ...dest };
  const trap = engine.trapManager.at(dest.x, dest.z);
  if (trap && !trap.triggered) engine.triggerTrap(u, trap);
  if (engine.followCam && u.team === 'party') {
    const wp = unitWorld(engine, u.pos);
    engine.iso.desiredTarget.set(wp.x, wp.y, wp.z);
  }
}

export function closestWalkableAdjacent(engine: any, pos: GridPos, leader: Unit): GridPos | null {
  const offsets = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  let best: GridPos | null = null;
  let bestDist = Infinity;
  for (const [dx, dz] of offsets) {
    const tx = pos.x + dx, tz = pos.z + dz;
    if (engine.world.isWalkable(tx, tz)) {
      const d = Math.abs(leader.pos.x - tx) + Math.abs(leader.pos.z - tz);
      if (d < bestDist) { bestDist = d; best = { x: tx, z: tz }; }
    }
  }
  return best;
}

export function clickCombat(engine: any, unitId: string | undefined, tile: GridPos | null, propId?: string) {
  const active = engine.combat.active;
  if (!active || active.team !== 'party') return;
  if (engine.targeting) {
    const s = SKILLS[engine.targeting];
    if (s.aoeRadius > 0 && !s.selfCentered) {
      if (tile && Combat.dist(active.pos, tile) <= s.range) {
        engine.audio.play('dice', 0.7);
        engine.enqueue(engine.combat.useSkill(active, s.id, tile));
        engine.targeting = null;
        clearHighlights(engine);
      }
      return;
    }
    if (unitId) {
      const t = engine.byId(unitId);
      if (t && t.alive && Combat.dist(active.pos, t.pos) <= s.range) {
        engine.audio.play('dice', 0.7);
        engine.enqueue(engine.combat.useSkill(active, s.id, t.id));
        engine.targeting = null;
        clearHighlights(engine);
        return;
      }
    }
    if (propId) trySmashInCombat(engine, active, propId, s);
    return;
  }
  if (unitId) {
    const t = engine.byId(unitId);
    if (t && t.alive && t.team === 'enemy') {
      const basic = active.equippedSkills.map((id: string) => SKILLS[id]).find((s: SkillDef) =>
        s.damageDice && !s.targetsAllies && !s.selfCentered && s.aoeRadius === 0 &&
        Combat.dist(active.pos, t.pos) <= Math.max(1, s.range) && !engine.combat.canUse(active, s));
      if (basic) {
        engine.audio.play('dice', 0.7);
        engine.enqueue(engine.combat.useSkill(active, basic.id, t.id));
      } else setHoverInfoOnce(engine, 'Out of reach — move closer or pick a skill.');
      return;
    }
  }
  if (propId) { trySmashInCombat(engine, active, propId); return; }
  if (tile && engine.moveTiles.has(`${tile.x},${tile.z}`)) {
    engine.enqueue(engine.combat.moveActiveTo(tile));
  }
}

export function trySmashInCombat(engine: any, active: Unit, propId: string, preferred?: SkillDef) {
  const prop = engine.props.byId(propId);
  if (!prop) return;
  const usable = (s: SkillDef) => s.damageDice && !s.targetsAllies && !s.selfCentered && s.aoeRadius === 0
    && Combat.dist(active.pos, prop.pos) <= Math.max(1, s.range) && !engine.combat.canUse(active, s);
  const skill = (preferred && usable(preferred)) ? preferred
    : active.equippedSkills.map((id: string) => SKILLS[id]).find(usable);
  if (skill) {
    engine.audio.play('dice', 0.7);
    engine.targeting = null;
    clearHighlights(engine);
    void engine.smashProp(active, prop, skill);
  } else setHoverInfoOnce(engine, 'Out of reach — move closer or pick a skill.');
}

// ══ NPC dialogue ═══════════════════════════════════════════
export function talkToNpc(engine: any, npcId: string) {
  const npc = NPCS[npcId];
  if (!npc) return;
  const questNode = engine.questLog.nodeFor(npcId, hasItemInInventory(engine, 'severed_finger'));
  const nodeId = questNode ?? npc.entryNode;
  const node = npc.dialogue[nodeId];
  if (!node) return;
  engine.audio.play('ui_click', 0.6);
  engine.showDialogue = {
    npcId,
    npcName: npc.name,
    text: node.text,
    caption: node.caption,
    choices: node.choices?.map((c: any, i: number) => ({ label: c.label, index: i })),
  };
  engine.emitSnapshot();
}

export function dialogueChoice(engine: any, npcId: string, choiceIndex: number) {
  const npc = NPCS[npcId];
  if (!npc) return;
  const questNode = engine.questLog.nodeFor(npcId, hasItemInInventory(engine, 'severed_finger'));
  const nodeId = questNode ?? npc.entryNode;
  const node = npc.dialogue[nodeId];
  if (!node?.choices?.[choiceIndex]) {
    engine.showDialogue = null;
    engine.emitSnapshot();
    return;
  }
  const choice = node.choices[choiceIndex];
  if (choice.action) executeDialogueAction(engine, choice.action, npc);
  if (choice.next) {
    const nextNode = npc.dialogue[choice.next];
    if (nextNode) {
      engine.showDialogue = {
        npcId,
        npcName: npc.name,
        text: nextNode.text,
        caption: nextNode.caption,
        choices: nextNode.choices?.map((c: any, i: number) => ({ label: c.label, index: i })),
      };
      if (nextNode.action) executeDialogueAction(engine, nextNode.action, npc);
      engine.emitSnapshot();
      return;
    }
  }
  engine.showDialogue = null;
  engine.emitSnapshot();
}

export function executeDialogueAction(engine: any, action: { type: string; itemId?: string; questId?: string }, npc: NPCDef) {
  switch (action.type) {
    case 'giveItem': {
      if (action.itemId) {
        const it = makeItem(action.itemId);
        engine.inventory.push(it);
        engine.pushLog(`${npc.name} gives you ${it.icon} ${it.name}.`, 'system');
      }
      break;
    }
    case 'startQuest': {
      if (action.questId) {
        engine.questLog.start(action.questId);
        engine.pushLog(`📜 Quest started: ${QUESTS[action.questId]?.name ?? action.questId}`, 'system');
      }
      break;
    }
    case 'completeQuest': {
      if (action.questId) {
        const q = QUESTS[action.questId];
        if (!q) break;
        if (q.requiredItemId) {
          const idx = engine.inventory.findIndex((i: any) => i.id === q.requiredItemId || (i as any)._baseId === q.requiredItemId);
          if (idx >= 0) engine.inventory.splice(idx, 1);
        }
        for (const rid of q.rewardItemIds) {
          const it = makeItem(rid);
          engine.inventory.push(it);
          engine.pushLog(`${npc.name} gives you ${it.icon} ${it.name}.`, 'system');
        }
        engine.questLog.complete(action.questId);
        engine.pushLog(`📜 Quest complete: ${q.name}!`, 'system');
        engine.bigMessage = `Quest Complete: ${q.name}!`;
        engine.emitSnapshot();
        setTimeout(() => { engine.bigMessage = null; engine.emitSnapshot(); }, 2500);
      }
      break;
    }
    case 'endConvo': {
      engine.showDialogue = null;
      break;
    }
  }
}

export function hasItemInInventory(engine: any, baseId: string): boolean {
  return engine.inventory.some((i: any) => i.id === baseId || (i as any)._baseId === baseId || (baseId === 'severed_finger' && i.name.includes('Severed Finger')));
}
