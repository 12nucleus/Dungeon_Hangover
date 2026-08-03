// ─────────────────────────────────────────────────────────────
// Interaction — pickTile, fog, hover, click handlers, NPC dialogue
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Combat } from '../combat';
import { SKILLS } from '../skills';
import type { GridPos, SkillDef, Unit } from '../types';
import { NPCS, type NPCDef, type DialogueAction, type ChoiceCondition } from '../npc';
import { makeItem } from '../items';
import { QUESTS } from '../quest';
import { unitWorld } from './visuals';
import { clearHighlights, showAoePreview, pingAt } from './targeting';

// ══ fog of war ══════════════════════════════════════════════
// One InstancedMesh covers EVERY unexplored tile map-wide (not just a
// window around the leader), so scrolled-away unexplored areas stay
// completely black. Matrices are rebuilt lazily only when tiles become
// explored (engine.fogDirty), keeping the per-frame cost at zero.
const fogDummy = new THREE.Object3D();

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
      // Reveal walkable tiles plus decorative tiles in the current vision
      // radius. Props can intentionally occupy blocked tiles (bonfires,
      // braziers), so those tiles must still become visible when nearby.
      const onSelf = x === px && z === pz;
      const hasDecor = (engine.world.exploredObjects ?? []).some((o: any) => o.x === x && o.z === z);
      if (dist <= radius && (onSelf || engine.world.isWalkable(x, z) || hasDecor) && !engine.explored[x][z]) {
        engine.explored[x][z] = true;
        engine.fogDirty = true;
      }
    }
  }

  // Lazy-create the full-map fog mesh (recreated fresh on every floor build).
  // IMPORTANT: the fog is a THIN flat slab resting on the floor, not a tall
  // column. Tall opaque boxes become black "pillars" when viewed edge-on and
  // block the whole room from grazing camera angles. A flat dark tile reads
  // as "unexplored black floor" from any angle without occluding the scene.
  if (!engine.fogMesh && engine.fogGroup) {
    const g = new THREE.BoxGeometry(1.08, 0.14, 1.08);
    // Dense opaque black slabs make unexplored rooms unreadable even when the
    // camera is panned/rotated across them.
    const m = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 1, transparent: false, depthWrite: true });
    const mesh = new THREE.InstancedMesh(g, m, S * S);
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    mesh.count = 0;
    engine.fogGroup.add(mesh);
    engine.fogMesh = mesh;
    engine.fogDirty = true;
  }

  // Rebuild instance matrices only when exploration actually changed.
  if (engine.fogDirty && engine.fogMesh) {
    engine.fogDirty = false;
    let n = 0;
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        if (engine.explored[x][z]) continue;
        // Only fog walkable floor tiles (walls are solid rock — capping them
        // with black boxes looks broken). The leader's own tile is included
        // as a safety net even if the grid flags it blocked.
        const onSelf = x === px && z === pz;
        if (!onSelf && !engine.world.isWalkable(x, z)) continue;
        // unitWorld().y is the tile CENTER (h + 0.5) where a unit stands;
        // the actual floor surface is ~h (floor voxel tops sit at h-0.04..h).
        // Rest the slab right on that surface so it reads as a dark patch of
        // floor, never a floating box. x/z come from unitWorld so the slab
        // stays aligned with the world offset convention.
        const wp = unitWorld(engine, { x, z });
        const floorY = engine.world.heightAt(x, z);
        fogDummy.position.set(wp.x, floorY + 0.03, wp.z);
        fogDummy.updateMatrix();
        engine.fogMesh.setMatrixAt(n, fogDummy.matrix);
        n++;
      }
    }
    engine.fogMesh.count = n;
    engine.fogMesh.instanceMatrix.needsUpdate = true;
  }
}

/** Hide all tile-owned decoration while its tile is unexplored. */
export function updateExploredVisibility(engine: any) {
  for (const entry of engine.world?.exploredObjects ?? []) {
    const visible = !!engine.explored?.[entry.x]?.[entry.z];
    entry.object.visible = true;
    entry.object.traverse((o: any) => {
      if (o.isLight) {
        const base = o.userData.fogBaseIntensity ?? o.intensity;
        o.userData.fogBaseIntensity = base;
        o.intensity = visible ? base : 0;
      }
      if (o.material?.isSpriteMaterial) {
        const base = o.userData.fogBaseOpacity ?? o.material.opacity;
        o.userData.fogBaseOpacity = base;
        o.material.opacity = visible ? base : 0;
      }
    });
  }
  for (const torch of engine.world?.torches ?? []) {
    const tile = engine.world.worldToTile(torch.pos.x, torch.pos.z);
    if (tile) torch.light.visible = !!engine.explored?.[tile.x]?.[tile.z];
  }
}

// ══ tile picking ═══════════════════════════════════════════
// Iterative height refinement: we first intersect a flat plane at the
// leader's height to get a candidate tile, then re-intersect the ray at that
// tile's *actual* terrain height (world.heights is the single source of truth
// for the ground surface in both the voxel-terrain and fallback renderers).
// With the 55° perspective camera this converges to sub-tile accuracy in
// 2-3 passes on uneven floors — fixing the "pointer vs. clicked ground"
// offset.
export function pickTile(engine: any): GridPos | null {
  engine.ray.setFromCamera(engine.pointer, engine.iso.cam);
  const origin = engine.ray.ray.origin;
  const dir = engine.ray.ray.direction;
  if (Math.abs(dir.y) < 1e-6) return null;

  const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat?.living('party')[0];
  let pickY = leader ? engine.world.heightAt(leader.pos.x, leader.pos.z) : 1;

  let tile: GridPos | null = null;
  for (let i = 0; i < 3; i++) {
    const t = (pickY - origin.y) / dir.y;
    if (t < 0) return null;
    const hx = origin.x + dir.x * t;
    const hz = origin.z + dir.z * t;
    tile = engine.world.worldToTile(hx, hz);
    if (!tile) return null;
    const nextY = engine.world.heightAt(tile.x, tile.z);
    if (Math.abs(nextY - pickY) < 0.05) break;
    pickY = nextY;
  }
  return tile;
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

  // generic NPC registry (hermit, other hermit, Scrag, …)
  if (!unitId) {
    engine.ray.setFromCamera(engine.pointer, engine.iso.cam);
    const hit = engine.ray.intersectObjects(engine.unitProxies, false)[0];
    const npcId = hit?.object?.userData?.npcId as string | undefined;
    if (npcId) {
      const entry = engine.npcs?.find((n: any) => n.npcId === npcId);
      const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat.living('party')[0];
      if (entry && leader && Combat.dist(leader.pos, entry.pos) <= 1.5) {
        talkToNpc(engine, npcId);
      } else {
        setHoverInfoOnce(engine, `${NPCS[npcId]?.name ?? 'The figure'} — get closer to talk.`);
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
function visibleChoice(engine: any, c: { visibleIf?: ChoiceCondition }): boolean {
  const v = c.visibleIf;
  if (!v) return true;
  if (v.item && !hasItemInInventory(engine, v.item)) return false;
  if (v.flag && !engine.flags?.has(v.flag)) return false;
  if (v.notFlag && engine.flags?.has(v.notFlag)) return false;
  if (v.ability) {
    const g = engine.combat?.living('party')[0];
    if (!g) return false;
    const mod = Math.floor((g.abilities[v.ability.stat] - 10) / 2);
    if (g.abilities[v.ability.stat] + mod < v.ability.min) return false;
  }
  return true;
}

function runActions(engine: any, actions: DialogueAction[] | undefined, npc: NPCDef) {
  if (!actions) return;
  for (const a of actions) executeDialogueAction(engine, a, npc);
}

/** current dialogue node id (persists across clicks so trees can branch) */
function nodeIdFor(engine: any, npc: NPCDef): string {
  const questNode = engine.questLog.nodeFor(npc.id, hasItemInInventory(engine, 'severed_finger'));
  return engine.dialogueNodeId ?? questNode ?? npc.entryNode;
}

function presentNode(engine: any, npc: NPCDef, nodeId: string) {
  const node = npc.dialogue[nodeId];
  if (!node) { engine.showDialogue = null; engine.dialogueNodeId = null; engine.emitSnapshot(); return; }
  engine.dialogueNodeId = nodeId;
  // node-level actions fire when the node is presented (hermit's reward node, …)
  runActions(engine, node.actions ?? (node.action ? [node.action] : []), npc);
  engine.audio.play('ui_click', 0.6);
  engine.showDialogue = {
    npcId: npc.id,
    npcName: npc.name,
    text: node.text,
    caption: node.caption,
    choices: node.choices
      ?.filter((c) => visibleChoice(engine, c))
      .map((c: any, i: number) => ({ label: c.label, index: i })),
  };
  engine.emitSnapshot();
}

export function talkToNpc(engine: any, npcId: string) {
  const npc = NPCS[npcId];
  if (!npc) return;
  if (npcId === 'scrag' && !engine.flags?.has('met_scrag')) engine.setFlag('met_scrag');
  engine.dialogueNodeId = null;   // fresh conversation — resolve the quest-aware entry
  presentNode(engine, npc, nodeIdFor(engine, npc));
}

export function dialogueChoice(engine: any, npcId: string, choiceIndex: number) {
  const npc = NPCS[npcId];
  if (!npc) return;
  const nodeId = nodeIdFor(engine, npc);
  const node = npc.dialogue[nodeId];
  if (!node?.choices?.[choiceIndex]) {
    engine.showDialogue = null;
    engine.dialogueNodeId = null;
    engine.emitSnapshot();
    return;
  }
  const choice = node.choices[choiceIndex];
  runActions(engine, choice.actions ?? (choice.action ? [choice.action] : []), npc);
  if (choice.next && npc.dialogue[choice.next]) {
    presentNode(engine, npc, choice.next);
    return;
  }
  engine.showDialogue = null;
  engine.dialogueNodeId = null;
  engine.emitSnapshot();
}

export function executeDialogueAction(engine: any, action: DialogueAction, npc: NPCDef) {
  switch (action.type) {
    case 'giveItem': {
      if (action.itemId) {
        const it = makeItem(action.itemId);
        engine.inventory.push(it);
        engine.pushLog(`${npc.name} gives you ${it.icon} ${it.name}.`, 'system');
        engine.emitSnapshot();
      }
      break;
    }
    case 'takeItem': {
      if (action.itemId && engine.takeItem) engine.takeItem(action.itemId);
      else if (action.itemId) {
        const idx = engine.inventory.findIndex((i: any) => i.id === action.itemId || (i as any)._baseId === action.itemId);
        if (idx >= 0) engine.inventory.splice(idx, 1);
      }
      break;
    }
    case 'startQuest': {
      if (action.questId) {
        engine.questLog.start(action.questId);
        engine.pushLog(`📜 Quest started: ${QUESTS[action.questId]?.name ?? action.questId}`, 'system');
        engine.emitSnapshot();
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
        if (q.rewardGold) engine.addGold?.(q.rewardGold);
        if (q.xpReward) {
          const hero = engine.combat?.living('party')[0];
          if (hero) hero.xp += q.xpReward;
          engine.pushLog(`The party gains ${q.xpReward} XP.`, 'system');
        }
        engine.questLog.complete(action.questId);
        engine.pushLog(`📜 Quest complete: ${q.name}!`, 'system');
        engine.bigMessage = `Quest Complete: ${q.name}!`;
        engine.emitSnapshot();
        setTimeout(() => { engine.bigMessage = null; engine.emitSnapshot(); }, 2500);
      }
      break;
    }
    case 'setFlag': {
      if (action.flag) engine.setFlag(action.flag);
      break;
    }
    case 'gamble': {
      // Scrag's dice table: wager 5g, roll d20 vs hidden 3d6+2
      if (engine.gold < 5) { engine.setHoverInfoOnce('You need 5 gold to gamble.'); break; }
      engine.gold -= 5;
      const roll = 1 + Math.floor(Math.random() * 20);
      const house = (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6)) + 2;
      engine.pushLog(`🎲 You bet 5 gold. You roll ${roll}; the house rolls ${house}.`, 'roll');
      if (roll > house) {
        engine.gold += 10;
        engine.audio.play('dice', 0.7);
        engine.pushLog('🎉 You win 10 gold! The goblin across the table glares at the dice like they betrayed him.', 'system');
      } else {
        engine.pushLog('😔 The house wins. Your 5 gold is gone. The dice glint smugly.', 'system');
      }
      engine.emitSnapshot();
      break;
    }
    case 'bossParley': {
      if (engine.onBossParley) engine.onBossParley(action.outcome);
      break;
    }
    case 'endConvo': {
      engine.showDialogue = null;
      engine.dialogueNodeId = null;
      break;
    }
  }
}

export function hasItemInInventory(engine: any, baseId: string): boolean {
  return engine.inventory.some((i: any) => i.id === baseId || (i as any)._baseId === baseId || (baseId === 'severed_finger' && i.name.includes('Severed Finger')));
}
