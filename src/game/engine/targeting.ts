// ─────────────────────────────────────────────────────────────
// Targeting & highlights — skill targeting, move tiles, aoe preview
// Uses `engine: any` to avoid circular import + private field errors.
// ─────────────────────────────────────────────────────────────
import { Combat } from '../combat';
import type { GridPos, SkillDef, Unit } from '../types';
import { unitWorld } from './visuals';

export function hotkeySkill(engine: any, i: number) {
  const a = engine.combat.active ?? engine.byId(engine.selectedId ?? '') ?? engine.combat.living('party')[0];
  if (!a || a.team !== 'party') return;
  const id = a.equippedSkills[i];
  if (id) engine.selectSkill(id);
}

export function cancelTargeting(engine: any) {
  if (!engine.targeting) return;
  engine.targeting = null;
  clearHighlights(engine);
  showMoveTiles(engine);
  engine.emitSnapshot();
}

export function clearHighlights(engine: any) {
  for (const h of engine.hlPool) { h.mesh.visible = false; h.cat = ''; }
}

export function paint(engine: any, tiles: GridPos[], cat: string) {
  let used = 0;
  for (const h of engine.hlPool) {
    if (used >= tiles.length) break;
    if (h.mesh.visible) continue;
    const t = tiles[used++];
    h.mesh.material = engine.hlMats[cat];
    h.mesh.position.copy(unitWorld(engine, t)).y += 0.03;
    h.mesh.visible = true;
    h.cat = cat;
  }
}
export function clearDanger(engine: any) {
  for (const h of engine.hlPool) {
    if (h.cat === 'danger') { h.mesh.visible = false; h.cat = ''; }
  }
}

export function showMoveTiles(engine: any) {
  const a = engine.combat.active;
  if (!a || a.team !== 'party' || engine.phase !== 'combat') return;
  engine.moveTiles = engine.combat.reachable(a, a.movementLeft);
  const tiles = [...engine.moveTiles.keys()].filter((k) => k !== `${a.pos.x},${a.pos.z}`).map((k: string) => {
    const [x, z] = k.split(',').map(Number);
    return { x, z };
  })
    // BG3: only tiles the unit can actually SEE are clickable — a wall of
    // fog or rock between you and the tile means you can't walk there blind
    .filter((t) => engine.hasLineOfSight?.(a.pos, t));
  paint(engine, tiles, 'move');
}

export function showTargeting(engine: any, s: SkillDef, u: Unit) {
  clearHighlights(engine);
  if (s.aoeRadius > 0) {
    const tiles: GridPos[] = [];
    for (let dx = -s.range; dx <= s.range; dx++) for (let dz = -s.range; dz <= s.range; dz++) {
      const x = u.pos.x + dx, z = u.pos.z + dz;
      if (engine.world.inBounds(x, z) && Combat.dist(u.pos, { x, z }) <= s.range) tiles.push({ x, z });
    }
    paint(engine, tiles, 'range');
  } else {
    const cat = s.targetsAllies ? 'ally' : 'aoe';
    const tiles = engine.combat.units
      .filter((t: any) => t.alive && (s.targetsAllies ? t.team === u.team : t.team !== u.team) && Combat.dist(u.pos, t.pos) <= s.range)
      .map((t: any) => t.pos);
    paint(engine, tiles, cat);
  }
}

export function showAoePreview(engine: any, s: SkillDef, center: GridPos) {
  showTargeting(engine, s, engine.combat.active!);
  const blast: GridPos[] = [];
  for (let dx = -s.aoeRadius; dx <= s.aoeRadius; dx++) for (let dz = -s.aoeRadius; dz <= s.aoeRadius; dz++) {
    const x = center.x + dx, z = center.z + dz;
    if (engine.world.inBounds(x, z)) blast.push({ x, z });
  }
  paint(engine, blast, 'aoe');
}

export function pingAt(engine: any, t: GridPos) {
  engine.clickPing.position.copy(unitWorld(engine, t)).y += 0.05;
  engine.clickPingT = 0;
}
