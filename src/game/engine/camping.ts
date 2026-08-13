// ─────────────────────────────────────────────────────────────
// Camping & inventory — toggleSneak, toggleTorch, lightBonfire,
// restAtBonfire, levelUp, respawn, equip/use items, skill tree.
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { setWeapon, equip, unequip, itemToEquipVisual } from '../characters';
import { FX } from '../particles';
import { effMaxHp, MAX_LEVEL, XP_THRESHOLDS } from '../stats';
import type { GridPos, EquipSlot } from '../types';
import { canUnlock, treeFor } from '../skilltree';
import { ITEM_BASES, type Item } from '../items';
import { unitWorld } from './visuals';
import { spawnBonfireFlame } from './gameFlow';

// ══ sneak / torch (called from React HUD) ═══════════════════
export function toggleSneak(engine: any) {
  if (engine.phase !== 'explore' || engine.combat.inCombat) return;
  engine.sneaking = !engine.sneaking;
  engine.audio.play('ui_click', 0.5);
  if (engine.sneaking) engine.pushLog('The party spreads out and moves silently...', 'system');
  else engine.pushLog('The party resumes a normal pace.', 'system');
  engine.emitSnapshot();
}

export function toggleTorch(engine: any) {
  // engine.toggleTorch() now EQUIPS/UNEQUIPS the torch in the hero's hand
  // (T) with previous-weapon memory — the single source of truth.
  engine.toggleTorch();
}

export function closeDialogue(engine: any) {
  engine.showDialogue = null;
  engine.emitSnapshot();
}

// ══ bonfire ═════════════════════════════════════════════════
export function lightBonfire(engine: any, idx = 0) {
  const spot = engine.bonfireSpots?.[idx] ?? engine.structures?.checkpoint ?? { x: 10, z: 10 };
  if (engine.bonfireLit && engine.bonfirePos?.x === spot.x && engine.bonfirePos?.z === spot.z) return;
  engine.bonfireLit = true;
  // kindling a fire moves the checkpoint (respawn + save) to THAT fire
  engine.bonfirePos = { ...spot };
  spawnBonfireFlame(engine);
  void engine.narrate(`f${engine.floorNumber}_bonfire`, engine.floorNumber === 49
    ? 'The bonfire catches. The warmth is immediate. The warmth is the first good thing to happen in this soggy, glowing, judgemental garden. The mushrooms watch it enviously. Fire is the only thing they fear — and they have a LOT of opinions about you having it.'
    : 'The bonfire catches. The warmth is immediate. The warmth is the first good thing that has happened to you since you woke up. The warmth is the first good thing that has happened to you in WEEKS.', 4600);
  engine.pushLog('The bonfire roars to life. This place feels safer now...', 'system');
  engine.audio.play('ui_click', 0.6);
  engine.audio.play('bonfire_lit', 1.0);
  engine.bigMessage = 'Bonfire Lit!';
  engine.emitSnapshot();
  setTimeout(() => {
    engine.bigMessage = null;
    engine.emitSnapshot();
  }, 2500);
  // auto-save to the active slot the moment a checkpoint is established
  engine.saveGame(engine.currentSlotId ?? undefined, 'Bonfire Lit');
}

export function restAtBonfire(engine: any, idx = 0) {
  if (!engine.bonfireLit || !engine.bonfirePos) return;
  // the checkpoint follows the fire you actually rest at
  const spot = engine.bonfireSpots?.[idx];
  if (spot) engine.bonfirePos = { ...spot };
  engine.audio.play('heal', 0.9);
  engine.restingAtBonfire = true;

  for (const u of engine.combat.units) {
    if (u.team !== 'party') continue;
    u.alive = true;
    u.unconscious = false;
    u.hp = effMaxHp(u);
    u.conditions = [];
    // resting at the bonfire fully resets action points (action/bonus/move)
    // and clears every skill cooldown so all skills are usable again
    u.hasAction = true;
    u.hasBonus = true;
    u.movementLeft = u.moveRange;
    u.cooldowns = {};
    (u as any).restedAtBonfire = true;
    // stand back up any knocked-out companion
    const v = engine.visuals.get(u.id);
    if (v) { v.rig.anim.mode = 'idle'; v.rig.anim.death = undefined; v.bar.style.display = ''; }
  }

  // NOTE: resting does NOT revive slain enemies or rebuild destroyed props —
  // the dungeon stays cleared (fixed bugs: respawning enemies after a rest,
  // and loot bags / destructibles popping back).

  // per-rest-cycle interactables refresh (straw mat, bunk)
  if (engine.flags) {
    engine.flags.delete('rest_mat_used');
    engine.flags.delete('rest_bunk_used');
  }
  engine.showBonfireUI = true;
  engine.pushLog('🔥 You rest at the bonfire. Your wounds close. The dungeon stirs...', 'system');
  engine.pushLog('Spend your XP here to level up, or change your skill loadout.', 'system');
  engine.bigMessage = 'Bonfire Rest';
  engine.emitSnapshot();
  setTimeout(() => {
    engine.bigMessage = null;
    engine.emitSnapshot();
  }, 2000);
  // resting re-establishes the checkpoint — keep the slot current
  engine.saveGame(engine.currentSlotId ?? undefined, 'Rested');
}

export function closeBonfireUI(engine: any) {
  engine.showBonfireUI = false;
  engine.restingAtBonfire = false;
  engine.emitSnapshot();
}

const SOBER_LINES: Record<number, string> = {
  2: "Your head clears. Slightly. The ringing is now a hum.",
  3: "You remember your name. It's Greg. Probably.",
  4: "Your hands stop shaking. You miss them already.",
  5: "Sober-ish. You can see the dungeon for what it is. It's worse.",
  6: "Stone cold sober. This is the worst thing that has ever happened to you.",
};

/** swap Greg's hungover condition as sobriety improves (L3 → mild, L5+ → gone) */
function recomputeHangover(u: any) {
  u.conditions = u.conditions.filter((c: any) => c.id !== 'hungover' && c.id !== 'hungover_mild');
  if (u.level < 3) {
    u.conditions.push({ id: 'hungover', name: 'Hungover', roundsLeft: 99 });
  } else if (u.level < 5) {
    u.conditions.push({ id: 'hungover_mild', name: 'Hungover (Mild)', roundsLeft: 99 });
  }
}

export function levelUpAtBonfire(engine: any, unitId: string) {
  const u = engine.byId(unitId);
  if (!u || u.team !== 'party' || !engine.restingAtBonfire) return;
  if (u.level >= MAX_LEVEL) {
    engine.setHoverInfoOnce('Stone cold sober — already at maximum level.');
    return;
  }
  // level-to-target: grant EVERY level the current XP supports in one call.
  // XP is cumulative and never spent, so a single-step version kept passing
  // the same threshold check on every call — three calls gave three levels.
  let leveled = 0;
  while (u.level < MAX_LEVEL && u.xp >= (XP_THRESHOLDS[u.level + 1] ?? Infinity)) {
    u.level++;
    // NO auto-hydration of the class pool — new skills come from the Skill
    // Tree (one skill point per level-up to spend there).
    u.maxHp += 6;
    u.hp = Math.min(effMaxHp(u), u.hp + 6);
    u.skillPoints += 1;
    // sobering up also grants an ability point (spend it in the Stats panel)
    u.abilityPoints = (u.abilityPoints ?? 0) + 1;
    recomputeHangover(u);
    leveled++;
    engine.pushLog(`⬆ ${u.name} reaches level ${u.level}! (+6 max HP, +1 skill point, +1 ability point — spend them in the Skill Tree & Stats panel)`, 'system');
  }
  if (!leveled) {
    const need = XP_THRESHOLDS[u.level + 1] ?? Infinity;
    engine.setHoverInfoOnce(`Need ${need} XP to level up (have ${u.xp}).`);
    return;
  }
  engine.audio.play('heal', 0.9, 1.3);
  const line = SOBER_LINES[u.level];
  if (line) void engine.narrate(`sober_${u.level}`, line, 3600);
  FX.levelup(engine.particles, unitWorld(engine, u.pos).add(new THREE.Vector3(0, 0.6, 0)));
  engine.emitSnapshot();
}

/** a free walkable tile next to the bonfire (the bonfire itself blocks) */
function bonfireStandingSpot(engine: any): GridPos {
  const b = engine.bonfirePos ?? engine.structures?.partySpawn;
  if (!b) return { x: 0, z: 0 };
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const tx = b.x + dx, tz = b.z + dz;
    if (engine.world.isWalkable(tx, tz) && !engine.world.blocked[tx]?.[tz]) return { x: tx, z: tz };
  }
  return { ...b };
}

export function respawn(engine: any) {
  // dying BEFORE lighting the bonfire must not soft-lock the run — fall
  // back to the floor's spawn point
  const spot = bonfireStandingSpot(engine);
  engine.bonfirePos = engine.bonfirePos ?? engine.structures?.partySpawn ?? null;
  engine.phase = 'explore';
  engine.gameWon = false;
  engine.busy = false;
  engine.clearLoot?.();   // drops from the losing fight don't survive death
  engine.showDialogue = null;
  engine.dialogueNodeId = null;
  engine.combat.inCombat = false;
  engine.combat.phase = 'explore';
  engine.combat.turnOrder = [];
  engine.combat.activeIdx = 0;
  engine.combat.round = 1;

  // `living('party')` excludes dead Greg — iterate all party units so defeat
  // can actually recover the party. Each member gets its own walkable tile so
  // Greg + companions/summons don't stack on one spot (and an unconscious
  // companion wakes back up at the fire, not stranded at their old cell).
  const used = new Set<string>();
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2]];
  for (const u of engine.combat.units) {
    if (u.team !== 'party') continue;
    u.alive = true;
    u.unconscious = false;
    u.hp = effMaxHp(u);
    u.conditions = [];
    u.hasAction = true;
    u.hasBonus = true;
    u.movementLeft = u.moveRange;
    let pos: GridPos = { ...spot };
    for (const [dx, dz] of offsets) {
      const tx = spot.x + dx, tz = spot.z + dz;
      if (used.has(`${tx},${tz}`)) continue;
      if (engine.world.isWalkable(tx, tz) && !engine.world.blocked[tx]?.[tz]) { pos = { x: tx, z: tz }; break; }
    }
    used.add(`${pos.x},${pos.z}`);
    u.pos = pos;
    const v = engine.visuals.get(u.id);
    if (v) {
      const wp = unitWorld(engine, pos);
      v.rig.group.position.copy(wp);
      v.rig.group.userData.baseY = wp.y;
      v.rig.anim.mode = 'idle';
      v.rig.anim.death = undefined;
      v.rig.anim.t = 0;
      v.bar.style.display = '';
      v.dustDone = false;
    }
  }

  // NOTE: dead enemies are NOT revived here — kills persist across respawns
  // (bug fix: respawning re-populated the whole dungeon). Alive-but-aggroed
  // enemies are re-dormant below so the party can stand up in peace;
  // destroyed props stay destroyed (no resetAll).
  // a boss who survived the TPK mid-fight (e.g. Baron at 11/25) must be
  // re-fightable: re-dormant him and re-arm his cutscene, otherwise he is
  // un-aggroable forever (proximity skips bossGroups and the cutscene flag
  // is still set). Deferred bosses are already dormant — no-op for them.
  for (const u of engine.combat.units) {
    if (u.team !== 'enemy' || !u.alive || !u.bossGroup) continue;
    u.dormant = true;
    // dying is NOT a damage-preserving checkpoint: survivors of a lost
    // fight come back at full HP, so "chip the boss, die, respawn, chip
    // again" can't trivialise a boss. Kills still persist.
    u.hp = u.maxHp;
    u.conditions = [];
  }
  // an enemy that SURVIVED the losing fight must not keep aggro on the fresh
  // spawn either — re-dormant every alive non-boss enemy so the party can
  // actually stand back up at the bonfire. (The dead ones stay dead — only
  // living stragglers get the dormancy reset.)
  for (const u of engine.combat.units) {
    if (u.team !== 'enemy' || !u.alive || u.bossGroup) continue;
    u.dormant = true;
    u.hp = u.maxHp;
    u.conditions = [];
  }
  // short aggro suppression right after a respawn so the party isn't re-swarmed
  // the instant they stand up at the bonfire (same grace the intro uses).
  engine.aggroGraceUntil = performance.now() / 1000 + 3;
  // re-arm the boss reveal cutscenes ONLY while their boss is still alive — a
  // dead Baron/Gribnab must not replay the reveal VO on the next visit
  engine.bossRatCutscenePlayed = !engine.combat.units.some((u: any) => u.team === 'enemy' && u.name === 'Baron Gnaw' && u.alive);
  engine.gribnabCutscenePlayed = !engine.combat.units.some((u: any) => u.team === 'enemy' && u.name === 'Gribnab' && u.alive);
  engine.sporeMotherCutscenePlayed = !engine.combat.units.some((u: any) => u.team === 'enemy' && u.name === 'The Spore Mother' && u.alive);
  engine.selectedId = engine.combat.units.find((u: any) => u.team === 'party')?.id ?? null;
  // the party TELPORTED to the bonfire — the tactical camera only re-centers on
  // movement clicks, so snap it to the leader here or it stays staring at the
  // death spot across the map.
  {
    const leader = engine.combat.living('party')[0];
    if (leader) {
      const wp = unitWorld(engine, leader.pos);
      engine.iso.focus(wp);
      engine.iso.desiredTarget?.copy(wp);
      engine.iso.target.copy(wp);   // instant snap — no lerp drift from the old spot
    }
  }
  // Respawn always returns to the cellar ambience.
  engine.audio.setMusicDucked(false);
  engine.audio.playMusic('music_ambient');
  engine.pushLog('💀 Death is not the end. The bonfire restores you. The dungeon stirs...', 'system');
  engine.emitSnapshot();
}

// ══ inventory / equipment (called from React HUD) ═══════════
export function toggleInventory(engine: any) {
  engine.showInventory = !engine.showInventory;
  engine.audio.play('ui_click', 0.6);
  engine.emitSnapshot();
}

export function equipItem(engine: any, unitId: string, itemId: string, slotHint?: string) {
  const u = engine.byId(unitId);
  const idx = engine.inventory.findIndex((i: Item) => i.id === itemId || (i._baseId && i._baseId === itemId));
  if (!u || u.team !== 'party' || idx < 0) return;
  const item = engine.inventory[idx];
  if (item.kind === 'consumable') {
    engine.setHoverInfoOnce('Consumables are used, not equipped.');
    return;
  }
  // legacy saves: items made before `slot` was persisted lack it — recover
  // the intended slot from the base template so boots stay boots instead of
  // falling through to the armor→'chest' default.
  let nativeSlot: string | null = item.slot ?? (item._baseId ? ITEM_BASES[item._baseId]?.slot ?? null : null)
    ?? (item.kind === 'weapon' ? 'weapon' : item.kind === 'armor' ? 'chest' : null);
  if (!nativeSlot) {
    // legacy saves: ring/amulet trinkets predate explicit slots — infer from the name
    const n = item.name.toLowerCase();
    if (n.includes('ring')) nativeSlot = 'ring';
    else if (n.includes('amulet')) nativeSlot = 'amulet';
  }
  if (!nativeSlot) {
    engine.setHoverInfoOnce('No valid slot for this item.');
    return;
  }
  // paper-doll clicks may override the native slot when the item allows it
  // (the bucket is a weapon that also fits off-hand / head; any one-handed
  // weapon can be held in the off hand for dual-wielding)
  let slot: string = nativeSlot;
  if (slotHint && slotHint !== nativeSlot) {
    const allowed = (item.altSlots ?? []).includes(slotHint as EquipSlot)
      || (item.kind === 'weapon' && !item.twoHanded && slotHint === 'offHand');
    if (allowed) slot = slotHint;
  }
  // two-handed main weapon + off-hand item → refuse (both hands busy)
  if (slot === 'offHand' && u.equipment.weapon?.twoHanded) {
    engine.setHoverInfoOnce(`${u.equipment.weapon.name} needs both hands — put it away first.`);
    return;
  }
  let actualSlot: string = slot;
  if (slot === 'ring') {
    if (!u.equipment.ring1) actualSlot = 'ring1';
    else if (!u.equipment.ring2) actualSlot = 'ring2';
    else {
      engine.setHoverInfoOnce('Both ring slots are full. Unequip a ring first.');
      return;
    }
  }
  engine.inventory.splice(idx, 1);
  // equipping a two-handed main weapon frees the off hand
  if (slot === 'weapon' && item.twoHanded && u.equipment.offHand) {
    engine.inventory.push(u.equipment.offHand);
    const rig = engine.visuals.get(u.id)?.rig;
    if (rig) unequip(rig, 'offHand');
    u.equipment.offHand = undefined;
    engine.pushLog(`${u.name} stows their off-hand item to wield ${item.name} with both hands.`, 'system');
  }
  const old = (u.equipment as Record<string, Item | undefined>)[actualSlot];
  if (old) engine.inventory.push(old);
  (u.equipment as Record<string, Item | undefined>)[actualSlot] = item;
  if (actualSlot === 'weapon' && item.weaponKind) {
    u.weapon = item.weaponKind;
    const rig = engine.visuals.get(u.id)?.rig;
    if (rig) setWeapon(rig, item.weaponKind, u.scheme.accent);
    // the torch never burns out — equipping one just lights it if it was stowed
    if (item.weaponKind === 'torch' && !engine.torchLit) {
      engine.torchLit = true;
      engine.pushLog('🔦 The fresh torch flares to life.', 'system');
    }
  } else if (actualSlot !== 'weapon') {
    // layer the worn piece onto the voxel rig (clothes/armor/hats/…)
    const rig = engine.visuals.get(u.id)?.rig;
    if (rig) {
      const vis = itemToEquipVisual(item, actualSlot);
      if (vis) equip(rig, vis);
    }
  }
  engine.audio.play('ui_click', 0.7);
  engine.pushLog(`${u.name} equips ${item.icon} ${item.name}.`, 'system');
  engine.emitSnapshot();
}

export function unequipItem(engine: any, unitId: string, slot: string) {
  const u = engine.byId(unitId);
  if (!u || u.team !== 'party') return;
  const item = (u.equipment as Record<string, Item | undefined>)[slot];
  if (!item) return;
  (u.equipment as Record<string, Item | undefined>)[slot] = undefined;
  engine.inventory.push(item);
  if (slot === 'weapon') {
    const rig = engine.visuals.get(u.id)?.rig;
    if (rig) setWeapon(rig, null, u.scheme.accent);
  }
  engine.audio.play('ui_click', 0.5);
  engine.pushLog(`${u.name} unequips ${item.icon} ${item.name}.`, 'system');
  engine.emitSnapshot();
}

// ══ skill tree (called from React HUD) ═════════════════════
export function toggleSkillTree(engine: any) {
  if (!engine.showBonfireUI && !engine.gameWon) {
    engine.setHoverInfoOnce('You can only access the skill tree while resting at a bonfire.');
    return;
  }
  engine.showSkillTree = !engine.showSkillTree;
  engine.audio.play('ui_click', 0.6);
  engine.emitSnapshot();
}

export function unlockNode(engine: any, unitId: string, nodeId: string) {
  const u = engine.byId(unitId);
  if (!u || u.team !== 'party') return;
  const tree = treeFor(u);
  const node = tree.find((n: any) => n.id === nodeId);
  if (!node) return;
  const reason = canUnlock(u, node);
  if (reason) {
    engine.setHoverInfoOnce(reason);
    return;
  }
  u.skillPoints -= node.cost;
  u.unlockedNodes.push(node.id);
  if (node.unlockSkill && !u.knownSkills.includes(node.unlockSkill)) {
    u.knownSkills.push(node.unlockSkill);
    if (u.equippedSkills.length < 12 && !u.equippedSkills.includes(node.unlockSkill)) {
      u.equippedSkills.push(node.unlockSkill);
    }
  }
  if (node.passive) {
    const p = node.passive;
    if (p.stat === 'str' || p.stat === 'dex' || p.stat === 'con' || p.stat === 'int' || p.stat === 'wis' || p.stat === 'cha') {
      u.abilities[p.stat] += p.amount;
    } else if (p.stat === 'maxHp') {
      u.maxHp += p.amount;
      u.hp = Math.min(u.hp + p.amount, u.maxHp);
    } else if (p.stat === 'ac') {
      u.bonusAC += p.amount;
    } else if (p.stat === 'move') {
      u.bonusMove += p.amount;
    }
  }
  engine.pushLog(`${u.name} learns ${node.name} from the ${node.branch} branch!`, 'system');
  engine.audio.play('heal', 0.9, 1.3);
  engine.emitSnapshot();
}

export function equipSkill(engine: any, unitId: string, skillId: string) {
  if (engine.combat.inCombat) return;
  const u = engine.byId(unitId);
  if (!u || !u.knownSkills.includes(skillId) || u.equippedSkills.includes(skillId) || u.equippedSkills.length >= 12) return;
  u.equippedSkills.push(skillId);
  engine.audio.play('ui_click', 0.5);
  engine.emitSnapshot();
}

export function unequipSkill(engine: any, unitId: string, skillId: string) {
  if (engine.combat.inCombat) return;
  const u = engine.byId(unitId);
  if (!u || !u.equippedSkills.includes(skillId) || u.equippedSkills.length <= 1) return;
  u.equippedSkills = u.equippedSkills.filter((s: string) => s !== skillId);
  engine.audio.play('ui_click', 0.5);
  engine.emitSnapshot();
}

/** drink a potion — self-target; in combat only on the drinker's turn (bonus action) */
export function useConsumable(engine: any, itemId: string, unitId: string) {
  // NOTE: the canonical implementation lives on GameEngine (engine.ts).
  // This module-level twin is kept as the barrel export; the holy-water
  // cure logic now lives in the engine method so the Inventory panel path
  // (engine.useConsumable) completes the cursed-gold quest.
  engine.useConsumable(itemId, unitId);
}
