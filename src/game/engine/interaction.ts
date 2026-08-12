// ─────────────────────────────────────────────────────────────
// Interaction — pickTile, fog, hover, click handlers, NPC dialogue
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Combat, grantXp } from '../combat';
import { skillById } from '../skillLookup';
import type { CombatEvent, GridPos, SkillDef, Unit } from '../types';
import { NPCS, type NPCDef, type DialogueAction, type ChoiceCondition } from '../npc';
import { FX } from '../particles';
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

  // torch reveals a modest radius — rooms stay dark beyond the flame
  const radius = engine.torchLit ? engine.visionRadius + 2 : engine.visionRadius;
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
    // Tall opaque columns on UNEXPLORED FLOOR tiles. A column as tall as the
    // tallest wall hides rooms beyond it from every camera angle (a flat slab
    // let the camera see over low walls). Walls themselves are never fogged —
    // they're opaque voxels, and fogging them turned the explored room's own
    // walls into black monoliths.
    const g = new THREE.BoxGeometry(1.08, 4.8, 1.08);
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
        // Only unexplored WALKABLE tiles are fogged — the walls stay as
        // terrain. The leader's own tile is never fogged.
        const onSelf = x === px && z === pz;
        if (onSelf || !engine.world.isWalkable(x, z)) continue;
        const wp = unitWorld(engine, { x, z });
        const floorY = engine.world.heightAt(x, z);
        fogDummy.position.set(wp.x, floorY + 2.4, wp.z);
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
// Voxel-accurate DDA (Amanatides & Woo): the ray is walked tile by tile
// through the grid and the FIRST solid column it enters wins — a wall face
// returns the wall tile, never the floor behind it. The old plane
// intersection let clicks pass through walls/fog to tiles on the far side,
// which is what sent the hero wandering across the map.
export function pickTile(engine: any): GridPos | null {
  engine.ray.setFromCamera(engine.pointer, engine.iso.cam);
  const o = engine.ray.ray.origin;
  const d = engine.ray.ray.direction;
  const world = engine.world;
  if (!world?.heights?.length) return null;
  const S = world.heights.length;

  // column top (world y) for a tile. Real walls (cave_wall) rise to wallH;
  // prop-blocked FLOOR tiles (bonfire, brazier, rubble — stone tiles with
  // blocked=true) only get a prop-height column so rays passing above the
  // prop still reach the floor behind it.
  const colTop = (x: number, z: number): number => {
    const h = world.heights[x][z];
    if (world.blocked[x]?.[z]) {
      const isWall = world.topMat?.[x]?.[z] === 'cave_wall' || h >= 3;
      if (isWall) {
        const wh = world.wallH?.[x]?.[z];
        return (typeof wh === 'number' && wh > 0 ? wh : h) + 0.5;
      }
      return h + 1.7;
    }
    return h + 0.5;
  };

  let tx = Math.floor(o.x + S / 2);
  let tz = Math.floor(o.z + S / 2);
  const stepX = d.x > 0 ? 1 : -1;
  const stepZ = d.z > 0 ? 1 : -1;
  const tDeltaX = Math.abs(d.x) > 1e-9 ? Math.abs(1 / d.x) : Infinity;
  const tDeltaZ = Math.abs(d.z) > 1e-9 ? Math.abs(1 / d.z) : Infinity;
  // distance along the ray to the first tile boundary on each axis
  const boundX = (tx + (stepX > 0 ? 1 : 0) - S / 2);
  const boundZ = (tz + (stepZ > 0 ? 1 : 0) - S / 2);
  let tMaxX = Math.abs(d.x) > 1e-9 ? (boundX - o.x) / d.x : Infinity;
  let tMaxZ = Math.abs(d.z) > 1e-9 ? (boundZ - o.z) / d.z : Infinity;

  let tPrev = 0;
  for (let i = 0; i < 512; i++) {
    const tNext = Math.min(tMaxX, tMaxZ);
    if (world.inBounds(tx, tz)) {
      const top = colTop(tx, tz);
      const yA = o.y + d.y * Math.max(tPrev, 0);
      const yB = o.y + d.y * tNext;
      if (Math.min(yA, yB) <= top) return { x: tx, z: tz };
    }
    if (tNext > 260) return null;
    if (tMaxX < tMaxZ) { tPrev = tMaxX; tMaxX += tDeltaX; tx += stepX; }
    else { tPrev = tMaxZ; tMaxZ += tDeltaZ; tz += stepZ; }
  }
  return null;
}

// ══ interactable picking (raycast + screen-space forgiveness) ═══════════
// Direct ray hits win first (units, destructible props). If nothing is hit,
// candidates whose projected screen position is within PICK_TOLERANCE_PX of
// the cursor are considered — this is what makes the bonfire, NPCs and [E]
// prompts clickable without pixel-perfect aim (BG3-style generous picking).
export interface InteractPick {
  kind: 'unit' | 'prop' | 'npc' | 'bonfire' | 'active';
  unitId?: string;
  propId?: string;
  /** which bonfire spot (index into engine.bonfireSpots) */
  idx?: number;
  npcId?: string;
  /** screen-space distance in px (0 = direct ray hit) */
  dist: number;
}

const PICK_TOLERANCE_PX = 42;
const pickProj = new THREE.Vector3();

export function pickInteractable(engine: any): InteractPick | null {
  engine.ray.setFromCamera(engine.pointer, engine.iso.cam);
  const unitHit = engine.ray.intersectObjects(engine.unitProxies, false)[0];
  if (unitHit) {
    const ud = unitHit.object.userData;
    if (ud.npcId) return { kind: 'npc', npcId: ud.npcId as string, dist: 0 };
    if (ud.unitId) return { kind: 'unit', unitId: ud.unitId as string, dist: 0 };
  }
  const propHit = engine.ray.intersectObjects(engine.props.pickboxes, false)[0];
  if (propHit) return { kind: 'prop', propId: propHit.object.userData.propId as string, dist: 0 };

  // screen-space forgiveness pass
  const r = engine.renderer.domElement.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const cx = ((engine.pointer.x + 1) / 2) * r.width;
  const cy = ((1 - engine.pointer.y) / 2) * r.height;
  let best: InteractPick | null = null;
  let bestD = PICK_TOLERANCE_PX;
  const consider = (world: THREE.Vector3, pick: Omit<InteractPick, 'dist'>) => {
    pickProj.copy(world).project(engine.iso.cam);
    if (pickProj.z > 1 || pickProj.z < -1) return; // behind the camera
    const sx = ((pickProj.x + 1) / 2) * r.width;
    const sy = ((1 - pickProj.y) / 2) * r.height;
    const d = Math.hypot(sx - cx, sy - cy);
    if (d <= bestD) { bestD = d; best = { ...pick, dist: d }; }
  };
  for (let bi = 0; bi < (engine.bonfireSpots?.length ?? 0); bi++) {
    const bp = engine.bonfireSpots[bi];
    const wp = engine.world.tileToWorld(bp.x, bp.z, new THREE.Vector3());
    wp.y += 0.6;
    consider(wp, { kind: 'bonfire', idx: bi });
  }
  const it = engine.activeInteractable;
  if (it) {
    const wp = engine.world.tileToWorld(it.pos.x, it.pos.z, new THREE.Vector3());
    wp.y += 0.6;
    consider(wp, { kind: 'active' });
  }
  for (const n of engine.npcs ?? []) {
    if (n.proxy) consider(n.proxy.position as THREE.Vector3, { kind: 'npc', npcId: n.npcId });
  }
  return best;
}

// ══ hover path preview (explore mode) ═══════════════════════
// A dotted preview of the exact route a click would take, plus a
// destination ring. Red ring = can't walk there. Recomputed only when the
// hovered tile changes (pathTo is a full BFS — never run it per frame).
function ensurePathPreview(engine: any) {
  if (engine.pathPreviewGroup) return;
  const g = new THREE.Group();
  const dotGeo = new THREE.CircleGeometry(0.085, 10);
  dotGeo.rotateX(-Math.PI / 2);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.85, depthWrite: false });
  engine.pathDots = [];
  for (let i = 0; i < 96; i++) {
    const m = new THREE.Mesh(dotGeo, dotMat);
    m.visible = false;
    m.renderOrder = 3;
    g.add(m);
    engine.pathDots.push(m);
  }
  const ringGeo = new THREE.RingGeometry(0.3, 0.44, 24);
  ringGeo.rotateX(-Math.PI / 2);
  engine.pathDestRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  engine.pathDestRing.visible = false;
  engine.pathDestRing.renderOrder = 3;
  g.add(engine.pathDestRing);
  engine.scene.add(g);
  engine.pathPreviewGroup = g;
}

export function hidePathPreview(engine: any) {
  for (const d of engine.pathDots ?? []) d.visible = false;
  if (engine.pathDestRing) engine.pathDestRing.visible = false;
}

function showDestRing(engine: any, tile: GridPos, color: number) {
  ensurePathPreview(engine);
  const ring = engine.pathDestRing!;
  const wp = unitWorld(engine, tile);
  ring.position.set(wp.x, engine.world.heightAt(tile.x, tile.z) + 0.55, wp.z);
  (ring.material as THREE.MeshBasicMaterial).color.setHex(color);
  ring.visible = true;
}

function refreshPathPreview(engine: any, tile: GridPos | null, suppressed: boolean) {
  hidePathPreview(engine);
  if (!tile || suppressed) return;
  const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat?.living('party')[0];
  if (!leader) return;
  const seen = !!engine.explored[tile.x]?.[tile.z];
  if (!engine.world.isWalkable(tile.x, tile.z)) {
    // walls/voids are always rendered → red "can't stand there" ring;
    // unexplored floor stays silent (you can't see it anyway)
    showDestRing(engine, tile, 0xef4444);
    return;
  }
  if (!seen) return;
  const path = engine.combat.pathTo(leader, tile.x, tile.z, 90);
  if (!path || !path.length) { showDestRing(engine, tile, 0xef4444); return; }
  ensurePathPreview(engine);
  const n = Math.min(path.length, engine.pathDots.length);
  for (let i = 0; i < n; i++) {
    const d = engine.pathDots[i];
    const wp = unitWorld(engine, path[i]);
    d.position.set(wp.x, engine.world.heightAt(path[i].x, path[i].z) + 0.54, wp.z);
    d.visible = true;
  }
  showDestRing(engine, path[path.length - 1], 0x9fdcff);
}

// ══ hover ══════════════════════════════════════════════════
export function updateHover(engine: any) {
  const explore = engine.phase === 'explore' && !engine.combat?.inCombat;
  const pick = pickInteractable(engine);
  let info: string | null = null;
  if (pick?.kind === 'unit' && pick.unitId) {
    const u = engine.byId(pick.unitId);
    if (u && u.alive) info = `${u.name} · ${u.title} — HP ${u.hp}/${u.maxHp} · AC ${u.ac}${u.conditions.length ? ' · ' + u.conditions.map((c: any) => c.name).join(', ') : ''}`;
  } else if (pick?.kind === 'npc' && pick.npcId) {
    info = `💬 ${NPCS[pick.npcId]?.name ?? 'A stranger'} — click to talk`;
  } else if (pick?.kind === 'prop' && pick.propId) {
    const p = engine.props.byId(pick.propId);
    if (p) info = `${p.def.icon} ${p.def.name} — destructible`;
  } else if (pick?.kind === 'bonfire') {
    const bp = engine.bonfireSpots?.[pick.idx ?? 0];
    const active = !!bp && engine.bonfirePos?.x === bp.x && engine.bonfirePos?.z === bp.z;
    info = active && engine.bonfireLit
      ? '🔥 Bonfire — click to walk over and rest'
      : '🔥 Unlit bonfire — click to walk over and kindle it';
  } else if (pick?.kind === 'active' && engine.activeInteractable) {
    info = engine.activeInteractable.label;
  }
  const needTile = explore || engine.targeting;
  const tile = needTile ? pickTile(engine) : null;
  if (!info && explore && tile) {
    const trap = engine.trapManager.at(tile.x, tile.z);
    if (trap && trap.revealed) {
      const adj = engine.combat.living('party').some((u: any) => Combat.dist(u.pos, trap.pos) <= 1.5);
      info = `⚠ ${trap.def.icon} ${trap.def.name}${adj ? ' — click to disarm' : ''}`;
    } else {
      // decor props (torches, braziers, the hermit's tent…) — hover label
      const eo = engine.world?.exploredObjects?.find((o: any) => o.x === tile.x && o.z === tile.z);
      const kind = eo?.object?.userData?.propKind as string | undefined;
      if (kind && PROP_HOVER[kind]) info = PROP_HOVER[kind];
    }
  }
  if (engine.targeting && pick?.kind !== 'unit') {
    const s = skillById(engine.targeting);
    const a = engine.combat.active;
    if (tile && s && s.aoeRadius > 0 && !s.selfCentered && a) showAoePreview(engine, s, tile);
  }

  // explore hover path preview — the exact route a click would walk
  if (explore && !engine.targeting && !engine.firstPerson && !engine.busy) {
    const key = tile ? `${tile.x},${tile.z}` : '';
    if (key !== engine.hoverPathKey) {
      engine.hoverPathKey = key;
      refreshPathPreview(engine, tile, pick !== null);
    }
  } else if (engine.hoverPathKey) {
    engine.hoverPathKey = '';
    hidePathPreview(engine);
  }

  // cursor feedback — pointer over anything clickable, crosshair while aiming
  const style = engine.renderer.domElement.style as CSSStyleDeclaration;
  const cursor = engine.targeting ? 'crosshair' : pick ? 'pointer' : 'default';
  if (style.cursor !== cursor) style.cursor = cursor;

  if (info !== engine.hoverInfo) { engine.hoverInfo = info; engine.emitSnapshot(); }
}

export function setHoverInfoOnce(engine: any, s: string) { engine.hoverInfo = s; engine.emitSnapshot(); }

/** hover labels for decor props (world props carry userData.propKind) */
const PROP_HOVER: Record<string, string> = {
  torch: '🕯 Wall torch — warm light',
  brazier: '🔥 Brazier — bright light',
  bonfire: '🔥 Bonfire — rest here',
  campfire: '🔥 Campfire — the Hermit\'s hearth',
  tent: '⛺ A canvas tent',
  bedroll: '🛏 A bedroll',
  bones: '🦴 Pile of old bones',
  webpile: '🕸 Cobwebs',
  rubble: '🪨 Rubble',
  mushroom: '🍄 Glowing mushrooms',
  crystal: '💎 Crystal',
  crystal_blue: '💎 Blue crystal',
  crystal_green: '💎 Green crystal',
  stalagmite: '🪨 Stalagmite',
  stalactite: '⬇ Stalactites above',
  crate: '📦 Supply crate',
  boulder: '🪨 Boulder',
  puddle: '💧 A murky puddle',
  bucket: '🪣 A wooden bucket',
  scratches: '🪨 Carved scratches in the stone',
  skeleton: '💀 A skeleton in the water',
  body: '💀 A floating body',
  mat: '🟫 A straw sleeping mat',
  wine_press: '🍇 A heavy wine press',
  wine_bottle: '🍾 A wine bottle',
  broken_bottle: '🍾 Broken glass',
  valve: '⚙ A pipe valve',
  pipe: '🛢 A large sewer pipe',
  sign: '🪧 A wooden sign',
  bunk: '🛏 A wooden bunk',
  footlocker: '🧰 A small footlocker',
  dice_table: '🎲 A low table',
  nest: '🪺 A shredded nest',
  drain: '🚰 An iron drain grate',
  wrench: '🔧 A heavy wrench',
  plunger: '🪠 A plunger',
  pipe_fitting: '🔩 A threaded pipe fitting',
  toolbox: '🧰 A metal toolbox',
  chest: '🧰 A chest',
  mirror: '🪞 A standing mirror',
  compass: '🧭 A compass rose in the floor',
  fountain: '⛲ A stone fountain',
  well: '🕳 An old well',
  cauldron: '🍲 A bubbling stew pot',
  weapon_rack: '🗡 A weapon rack',
  altar: '🪨 A stone altar',
  throne: '👑 A goblin throne',
  banner: '🚩 A hanging banner',
  duck: '🦆 A rubber duck',
  towel: '🧻 A rolled towel',
};

// ══ click logic ════════════════════════════════════════════
/** bonfire: forgiving click — walk up and kindle/rest automatically on arrival */
function bonfireClick(engine: any, leader: Unit | null, idx = 0) {
  const bp = engine.bonfireSpots?.[idx] ?? engine.bonfirePos;
  if (!bp || !leader) return;
  const active = engine.bonfirePos?.x === bp.x && engine.bonfirePos?.z === bp.z;
  if (Combat.dist(leader.pos, bp) <= 1.5) {
    if (active && engine.bonfireLit) engine.restAtBonfire(idx); else engine.lightBonfire(idx);
    return;
  }
  const adj = closestWalkableAdjacent(engine, bp, leader);
  if (adj) {
    const path = engine.combat.pathTo(leader, adj.x, adj.z);
    if (path && path.length) {
      engine.pendingBonfire = { action: active && engine.bonfireLit ? 'rest' : 'light', idx };
      engine.audio.play('ui_click', 0.5);
      pingAt(engine, adj);
      moveUnitAlong(engine, leader, path);
      engine.selectedId = leader.id;
      engine.emitSnapshot();
      return;
    }
  }
  setHoverInfoOnce(engine, '🔥 Can\'t find a way to the bonfire.');
}

/** NPC: walk adjacent, then open the dialogue automatically on arrival */
function npcClick(engine: any, leader: Unit | null, npcId: string) {
  const entry = engine.npcs?.find((n: any) => n.npcId === npcId);
  if (!entry || !leader) return;
  if (Combat.dist(leader.pos, entry.pos) <= 1.5) { talkToNpc(engine, npcId); return; }
  const adj = closestWalkableAdjacent(engine, entry.pos, leader);
  if (adj) {
    const path = engine.combat.pathTo(leader, adj.x, adj.z);
    if (path && path.length) {
      engine.pendingTalk = npcId;
      engine.audio.play('ui_click', 0.5);
      pingAt(engine, adj);
      moveUnitAlong(engine, leader, path);
      engine.selectedId = leader.id;
      engine.emitSnapshot();
      return;
    }
  }
  setHoverInfoOnce(engine, `${NPCS[npcId]?.name ?? 'The figure'} — can't find a way to them.`);
}

/**
 * Walk click — BG3 rules: you may only plot a route to tiles you can SEE
 * (explored) and STAND on (walkable). Clicking a wall/fog/void snaps to the
 * closest reachable explored tile within 3 (never to the far side of a
 * wall), and anything deeper is refused with a message instead of sending
 * the hero wandering across the map.
 */
function walkClick(engine: any, leader: Unit, tile: GridPos) {
  const seenOk = (x: number, z: number) => engine.world.isWalkable(x, z) && !!engine.explored[x]?.[z];
  let dest: GridPos | null = null;
  let path: GridPos[] | null = null;
  if (seenOk(tile.x, tile.z)) {
    const p = engine.combat.pathTo(leader, tile.x, tile.z, 90);
    if (p && p.length) { dest = tile; path = p; }
  }
  if (!dest) {
    // spiral out from the clicked tile — nearest explored+walkable+reachable
    let bestScore = Infinity;
    for (let r = 1; r <= 3; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const tx = tile.x + dx, tz = tile.z + dz;
          if (!seenOk(tx, tz)) continue;
          const p = engine.combat.pathTo(leader, tx, tz, 90);
          if (!p || !p.length) continue;
          const score = r * 1000 + p.length;
          if (score < bestScore) { bestScore = score; dest = { x: tx, z: tz }; path = p; }
        }
      }
      if (dest) break;
    }
  }
  if (!dest || !path) {
    const dark = !engine.explored[tile.x]?.[tile.z];
    setHoverInfoOnce(engine, dark ? '🌑 Unscouted darkness — move closer first.' : '🧱 Can\'t walk there — that\'s a wall.');
    return;
  }
  engine.audio.play('ui_click', 0.5);
  pingAt(engine, dest);
  moveUnitAlong(engine, leader, path);
  const followers = engine.combat.living('party').filter((u: any) => u.id !== leader.id);
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

export function clickExplore(engine: any, pick: InteractPick | null, tile: GridPos | null) {
  // jump-mode: the click is a hop target (budget-2 move)
  if (engine.jumpMode && tile) {
    engine.jumpMode = false;
    const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat.living('party')[0];
    if (leader) {
      const path = engine.combat.reachable(leader, 2).get(`${tile.x},${tile.z}`);
      if (path && path.length) {
        engine.audio.play('sword_hit', 0.4, 1.5);
        moveUnitAlong(engine, leader, path);
      } else {
        engine.setHoverInfoOnce('Can\'t jump there — too far or blocked.');
      }
    }
    engine.emitSnapshot();
    return;
  }
  const leader = engine.byId(engine.selectedId ?? '') ?? engine.combat.living('party')[0];

  // ── bonfire: forgiving click — walk up and kindle/rest automatically ──
  if (pick?.kind === 'bonfire') { bonfireClick(engine, leader, pick.idx ?? 0); return; }

  // ── active proximity prompt ([E] …): click on/near it triggers it ──
  const it = engine.activeInteractable;
  if (it && (pick?.kind === 'active' || (tile && Math.max(Math.abs(it.pos.x - tile.x), Math.abs(it.pos.z - tile.z)) <= it.radius))) {
    engine.triggerActiveInteractable();
    return;
  }

  // ── destructible props: smash, or walk adjacent and smash on arrival ──
  if (pick?.kind === 'prop' && pick.propId) {
    const prop = engine.props.byId(pick.propId);
    if (prop) {
      const near = engine.combat.living('party').find((u: any) => Combat.dist(u.pos, prop.pos) <= 1);
      if (near) { void engine.smashProp(near, prop); return; }
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

  // ── party select ──
  if (pick?.kind === 'unit' && pick.unitId) {
    const u = engine.byId(pick.unitId);
    if (u?.team === 'party') { engine.selectedId = u.id; engine.audio.play('ui_click'); engine.emitSnapshot(); return; }
  }

  // ── NPCs: walk up and talk ──
  if (pick?.kind === 'npc' && pick.npcId) { npcClick(engine, leader, pick.npcId); return; }

  // ── revealed traps: adjacent click disarms ──
  if (tile) {
    const trap = engine.trapManager.at(tile.x, tile.z);
    if (trap && trap.revealed) {
      const adj = engine.combat.living('party').find((u: any) => Combat.dist(u.pos, trap.pos) <= 1.5);
      if (adj) { void engine.disarmTrap(adj, trap); return; }
    }
  }

  // ── walk ──
  if (!leader || !tile) return;
  walkClick(engine, leader, tile);
}

export function moveUnitAlong(engine: any, u: Unit, path: GridPos[]) {
  const v = engine.visuals.get(u.id)!;
  const pts = path.map((t: GridPos) => unitWorld(engine, t));
  // the walker advances BOTH the rig and u.pos tile by tile (see the walker
  // loop in engine.update) — mid-walk clicks, proximity checks (bonfire,
  // NPCs, aggro) and traps all read u.pos, so it must never jump ahead.
  v.walker = { path: pts, tiles: path.map((t) => ({ x: t.x, z: t.z })), idx: 0 };
  v.rig.anim.mode = 'walk';
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

export function clickCombat(engine: any, pick: InteractPick | null, tile: GridPos | null) {
  const unitId = pick?.kind === 'unit' ? pick.unitId : undefined;
  const propId = pick?.kind === 'prop' ? pick.propId : undefined;
  const active = engine.combat.active;
  if (!active || active.team !== 'party') return;
  // jump-mode: the click is a hop target (budget-2 move, costs movement)
  if (engine.jumpMode && tile) {
    engine.jumpMode = false;
    const path = engine.combat.reachable(active, 2).get(`${tile.x},${tile.z}`);
    if (path && path.length) {
      engine.audio.play('sword_hit', 0.4, 1.5);
      FX.dust(engine.particles, unitWorld(engine, active.pos).clone());
      engine.enqueue(engine.combat.moveActiveTo(tile));
    } else {
      engine.setHoverInfoOnce('Can\'t jump there — too far or blocked.');
    }
    engine.emitSnapshot();
    return;
  }
  if (engine.targeting && typeof engine.targeting === 'string' && engine.targeting.startsWith('THROW:')) {
    const itemId = engine.targeting.slice(6);
    const aim = tile ?? (unitId ? engine.byId(unitId)?.pos ?? null : null);
    engine.targeting = null;
    clearHighlights(engine);
    if (aim) engine.throwConsumable(itemId, aim.x, aim.z);
    else setHoverInfoOnce(engine, 'Throw at a unit or tile.');
    engine.emitSnapshot();
    return;
  }
  if (engine.targeting) {
    const s = skillById(engine.targeting);
    if (s && s.aoeRadius > 0 && !s.selfCentered) {
      if (tile && Combat.dist(active.pos, tile) <= s.range) {
        engine.audio.play('dice', 0.7);
        engine.enqueue(engine.combat.useSkill(active, s.id, tile));
        engine.targeting = null;
        clearHighlights(engine);
      }
      return;
    }
    if (unitId && s) {
      const t = engine.byId(unitId);
      if (t && t.alive && Combat.dist(active.pos, t.pos) <= s.range) {
        // BG3: no attacking through walls — line of sight required
        if (!engine.hasLineOfSight?.(active.pos, t.pos)) {
          engine.setHoverInfoOnce(`No line of sight to ${t.name}.`);
          return;
        }
        engine.audio.play('dice', 0.7);
        engine.enqueue(engine.combat.useSkill(active, s.id, t.id));
        engine.targeting = null;
        clearHighlights(engine);
        return;
      }
    }
    if (propId && s) trySmashInCombat(engine, active, propId, s);
    return;
  }

  // ══ FREE-FLOW combat (overhaul) ══════════════════════════════
  // No phase gating: clicking an enemy swings the basic attack whenever it
  // is still available (auto-setting the turnMode ring to match), and
  // clicking a tile moves whenever movement is left. Armed skills resolve
  // first (the targeting block above); everything routes through the same
  // canUse/useSkill paths — attackUsed/hasAction/hasBonus semantics are
  // untouched. Fallbacks: an out-of-range attack click closes the gap with
  // the remaining movement and attacks if the approach lands in reach.
  if (unitId) {
    const t = engine.byId(unitId);
    if (t && t.alive && t.team === 'enemy') {
      if (!engine.hasLineOfSight?.(active.pos, t.pos)) {
        engine.setHoverInfoOnce(`No line of sight to ${t.name}.`);
        return;
      }
      const basic = skillById('attack');
      const attackReady = !!basic && !engine.combat.canUse(active, basic);
      const inReach = basic ? Combat.dist(active.pos, t.pos) <= Math.max(1, basic.range) : false;
      if (attackReady && inReach) {
        engine.combat.turnMode = 'action';
        engine.audio.play('dice', 0.7);
        engine.enqueue(engine.combat.useSkill(active, basic.id, t.id));
        engine.emitSnapshot();
        return;
      }
      if (attackReady && active.movementLeft > 0 && basic) {
        // out of reach — approach the best reachable tile, then attack if
        // the approach brings the target into range. moveActiveTo mutates
        // pos up front, so the follow-up attack resolves against the new spot.
        const reach = engine.combat.reachable(active, active.movementLeft);
        let best: GridPos | null = null;
        let bestD = Infinity;
        for (const [k, path] of reach) {
          if (!path.length) continue;
          const [x, z] = k.split(',').map(Number);
          const d = Combat.dist({ x, z }, t.pos);
          if (d < bestD) { bestD = d; best = { x, z }; }
        }
        if (best && bestD <= Math.max(1, basic.range)) {
          const moveEvents = engine.combat.moveActiveTo(best);
          let attackEvents: CombatEvent[] = [];
          if (!engine.combat.canUse(active, basic)) {
            engine.combat.turnMode = 'action';
            attackEvents = engine.combat.useSkill(active, basic.id, t.id);
          }
          engine.audio.play('dice', 0.7);
          engine.enqueue([...moveEvents, ...attackEvents]);
          engine.emitSnapshot();
          return;
        }
      }
      if (attackReady) setHoverInfoOnce(engine, `${t.name} is out of reach — move closer or pick a skill.`);
      else setHoverInfoOnce(engine, 'Already used your basic attack this turn.');
      return;
    }
  }
  if (propId) { trySmashInCombat(engine, active, propId); return; }
  if (tile) {
    // recompute reachability fresh — moveTiles is a turn-start cache and can
    // go stale after the first move; reachable() is exactly what moveActiveTo
    // validates against, so the click always matches the move.
    const reach = active.movementLeft > 0 ? engine.combat.reachable(active, active.movementLeft) : null;
    const inReach = !!reach?.get(`${tile.x},${tile.z}`);
    if (inReach) {
      engine.combat.turnMode = 'walk';
      engine.enqueue(engine.combat.moveActiveTo(tile));
      engine.emitSnapshot();
      return;
    }
    if (active.movementLeft <= 0) setHoverInfoOnce(engine, 'No movement left this turn.');
  }
  // nothing matched — say so instead of silently eating the click. A
  // skill was armed but no valid target was hit, or the click landed on
  // ground that can't be reached.
  if (engine.targeting) setHoverInfoOnce(engine, 'No valid target there — pick a unit or tile in range.');
  else setHoverInfoOnce(engine, 'No target there — click an enemy to attack.');
}

export function trySmashInCombat(engine: any, active: Unit, propId: string, preferred?: SkillDef) {
  const prop = engine.props.byId(propId);
  if (!prop) return;
  const usable = (s: SkillDef) => !!s.damageDice && !s.targetsAllies && !s.selfCentered && s.aoeRadius === 0
    && Combat.dist(active.pos, prop.pos) <= Math.max(1, s.range) && !engine.combat.canUse(active, s);
  const skill = (preferred && usable(preferred)) ? preferred
    : active.equippedSkills.map((id: string) => skillById(id)).find((s: SkillDef | undefined): s is SkillDef => !!s && usable(s));
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
  if (v.item && (v.minCount ?? 1) > 1) {
    const have = engine.inventory.reduce((n: number, i: any) => n + (i.id === v.item || (i as any)._baseId === v.item ? 1 : 0), 0);
    if (have < (v.minCount ?? 1)) return false;
  }
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
  const target = engine.dialogueNodeId ?? questNode ?? npc.entryNode;
  // a quest node that doesn't exist in the tree (authoring gap — e.g. Scrag's
  // missing 'done') must never brick the NPC: fall back to the entry node
  return npc.dialogue[target] ? target : npc.entryNode;
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
    // keep RAW choice indices: dialogueChoice indexes node.choices directly,
    // so hidden (visibleIf) choices must not shift the numbering
    choices: node.choices
      ?.map((c: any, rawIdx: number) => ({ c, rawIdx }))
      .filter(({ c }) => visibleChoice(engine, c))
      .map(({ c, rawIdx }) => ({ label: c.label, index: rawIdx })),
  };
  engine.speakDialogue?.(npc.id, nodeId);
  engine.emitSnapshot();
}

export function talkToNpc(engine: any, npcId: string) {
  const npc = NPCS[npcId];
  if (!npc) return;
  // turn the NPC to face the party leader so dialogue feels like the NPC is
  // actually talking to the player
  const leader = engine.combat?.living?.('party')?.[0];
  if (leader && engine.npcs) {
    const rec = engine.npcs.find((n: any) => n.npcId === npcId);
    if (rec?.rig?.group) {
      const lw = engine.unitWorld?.(leader.pos);
      const sw = engine.unitWorld?.(rec.pos ?? rec.rig.group.position);
      if (lw && sw) {
        // these NPC rigs aren't combat units — nothing overwrites their yaw,
        // so setting it once here is enough to make them face the player.
        rec.rig.group.rotation.y = Math.atan2(lw.x - sw.x, lw.z - sw.z);
      }
    }
  }
  if (npcId === 'scrag' && !engine.flags?.has('met_scrag')) engine.setFlag('met_scrag');
  engine.stopDialogueVo?.();
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
  engine.stopDialogueVo?.();
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
          // quest XP goes through the SAME xp→level engine combat uses, so
          // the reward actually levels the party up (and pays every member,
          // not just the leader).
          const party = engine.combat?.living('party');
          if (party?.length) {
            const ev = grantXp(party, q.xpReward);
            engine.enqueue(ev);
            engine.pushLog(`The party gains ${q.xpReward} XP.`, 'system');
          }
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
      engine.showDiceRoll?.('d20', roll, 'Gambling');
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
    case 'openShop': {
      if (engine.openShop) engine.openShop(npc.name);
      break;
    }
    case 'bossParley': {
      if (engine.onBossParley) engine.onBossParley(action.outcome);
      break;
    }
    case 'joinCompanion': {
      if (engine.joinCompanion) engine.joinCompanion(action.npcId);
      break;
    }
    case 'leaveCompanion': {
      if (engine.dismissCompanion) engine.dismissCompanion();
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
