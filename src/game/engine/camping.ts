// ─────────────────────────────────────────────────────────────
// Camping & inventory — toggleSneak, toggleTorch, lightBonfire,
// restAtBonfire, levelUp, respawn, equip/use items, skill tree.
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { setWeapon } from '../characters';
import { FX } from '../particles';
import { effMaxHp } from '../stats';
import { canUnlock, treeFor } from '../skilltree';
import type { Item } from '../items';
import { unitWorld } from './visuals';
import { enqueue } from './combatAnimation';
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
  engine.torchLit = !engine.torchLit;
  engine.audio.play('ui_click', 0.4);
  engine.pushLog(
    engine.torchLit
      ? 'Torch lit — the cave walls flicker back into view.'
      : 'Torch extinguished — darkness swallows you.',
    'system',
  );
  engine.emitSnapshot();
}

export function closeDialogue(engine: any) {
  engine.showDialogue = null;
  engine.emitSnapshot();
}

// ══ bonfire ═════════════════════════════════════════════════
export function lightBonfire(engine: any) {
  if (!engine.bonfireGroup || engine.bonfireLit) return;
  engine.bonfireLit = true;
  engine.bonfirePos = engine.structures?.checkpoint
    ? { ...engine.structures.checkpoint }
    : { x: 10, z: 10 };
  spawnBonfireFlame(engine);
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

export function restAtBonfire(engine: any) {
  if (!engine.bonfireLit || !engine.bonfirePos) return;
  engine.audio.play('heal', 0.9);
  engine.restingAtBonfire = true;

  for (const u of engine.combat.living('party')) {
    u.hp = effMaxHp(u);
    u.conditions = [];
    (u as any).restedAtBonfire = true;
  }

  for (const u of engine.combat.units) {
    if (!u.alive && u.team === 'enemy' && !u.bossGroup && u.name !== 'Baron Gnaw') {
      if (engine.defeatedSpecialMobs.has(u.id)) continue;
      u.alive = true;
      u.hp = u.maxHp;
      (u as any).dormant = true;
      u.conditions = [];
      const v = engine.visuals.get(u.id);
      if (v) {
        v.rig.anim.mode = 'idle';
        v.rig.anim.t = 0;
        v.bar.style.display = '';
        (v as any).dustDone = false;
      }
    }
  }

  engine.props.resetAll();

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

export function levelUpAtBonfire(engine: any, unitId: string) {
  const u = engine.byId(unitId);
  if (!u || u.team !== 'party' || !engine.restingAtBonfire) return;
  if (u.level >= 5) {
    engine.setHoverInfoOnce('Already at maximum level.');
    return;
  }
  const threshold = u.level === 3 ? 300 : u.level === 4 ? 650 : 9999;
  if (u.xp < threshold) {
    engine.setHoverInfoOnce(`Need ${threshold} XP to level up (have ${u.xp}).`);
    return;
  }
  u.xp -= threshold;
  u.level++;
  u.maxHp += 6;
  u.hp = Math.min(effMaxHp(u), u.hp + 6);
  u.skillPoints += 1;
  engine.audio.play('heal', 0.9, 1.3);
  engine.pushLog(`⬆ ${u.name} reaches level ${u.level}! (+6 max HP, +1 skill point). You feel slightly less drunk.`, 'system');
  FX.levelup(engine.particles, unitWorld(engine, u.pos).add(new THREE.Vector3(0, 0.6, 0)));
  engine.emitSnapshot();
}

export function respawn(engine: any) {
  if (!engine.bonfireLit || !engine.bonfirePos) return;
  engine.phase = 'explore';
  for (const u of engine.combat.living('party')) {
    u.hp = effMaxHp(u);
    u.pos = { ...engine.bonfirePos };
    const v = engine.visuals.get(u.id);
    if (v) {
      const wp = engine.world.tileToWorld(engine.bonfirePos.x, engine.bonfirePos.z);
      v.rig.group.position.copy(wp);
      v.rig.anim.mode = 'idle';
    }
  }
  for (const u of engine.combat.units) {
    if (!u.alive && u.team === 'enemy' && !u.bossGroup && u.name !== 'Baron Gnaw') {
      if (engine.defeatedSpecialMobs.has(u.id)) continue;
      u.alive = true;
      u.hp = u.maxHp;
      (u as any).dormant = true;
      u.conditions = [];
      const v = engine.visuals.get(u.id);
      if (v) {
        v.rig.anim.mode = 'idle';
        v.rig.anim.t = 0;
        v.bar.style.display = '';
        (v as any).dustDone = false;
        const wp = unitWorld(engine, u.pos);
        v.rig.group.position.copy(wp);
      }
    }
  }
  engine.props.resetAll();
  engine.combat.inCombat = false;
  engine.selectedId = engine.combat.living('party')[0]?.id ?? null;
  engine.pushLog('💀 Death is not the end. The bonfire restores you. The dungeon stirs...', 'system');
  engine.emitSnapshot();
}

// ══ inventory / equipment (called from React HUD) ═══════════
export function toggleInventory(engine: any) {
  engine.showInventory = !engine.showInventory;
  engine.audio.play('ui_click', 0.6);
  engine.emitSnapshot();
}

export function equipItem(engine: any, unitId: string, itemId: string) {
  const u = engine.byId(unitId);
  const idx = engine.inventory.findIndex((i: Item) => i.id === itemId);
  if (!u || u.team !== 'party' || idx < 0) return;
  const item = engine.inventory[idx];
  if (item.kind === 'consumable') {
    engine.setHoverInfoOnce('Consumables are used, not equipped.');
    return;
  }
  let slot: string | null = item.slot ?? (item.kind === 'weapon' ? 'weapon' : item.kind === 'armor' ? 'chest' : null);
  if (!slot) {
    engine.setHoverInfoOnce('No valid slot for this item.');
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
  const old = (u.equipment as Record<string, Item | undefined>)[actualSlot];
  if (old) engine.inventory.push(old);
  (u.equipment as Record<string, Item | undefined>)[actualSlot] = item;
  if (actualSlot === 'weapon' && item.weaponKind) {
    u.weapon = item.weaponKind;
    const rig = engine.visuals.get(u.id)?.rig;
    if (rig) setWeapon(rig, item.weaponKind, u.scheme.accent);
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
  const idx = engine.inventory.findIndex((i: Item) => i.id === itemId);
  const u = engine.byId(unitId);
  if (idx < 0 || !u || !u.alive) return;
  const item = engine.inventory[idx];
  if (item.kind !== 'consumable') return;
  if (engine.combat.inCombat && engine.combat.active?.id !== u.id) {
    engine.setHoverInfoOnce(`${u.name} must wait for their turn.`);
    return;
  }
  if (engine.combat.inCombat && !u.hasBonus) {
    engine.setHoverInfoOnce('No bonus action left.');
    return;
  }
  engine.inventory.splice(idx, 1);
  engine.audio.play('heal', 0.5, 1.6);
  enqueue(engine, engine.combat.useConsumable(u, item, u.id));
}
