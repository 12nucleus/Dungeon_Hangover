// ─────────────────────────────────────────────────────────────
// Combat animation — animate, animMove, animMelee, smash/destroy prop,
// trap trigger/disarm, projectile, skill fx, floaters, combat trigger
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Combat } from '../combat';
import { CONDITIONS } from '../skills';
import { rollDice } from '../dice';
import { FX } from '../particles';
import { makeItem, rollLootTable } from '../items';
import type { GridPos, CombatEvent, SkillDef, Unit } from '../types';
import type { Item } from '../items';
import { unitWorld } from './visuals';
import { presentationForSkill } from '../skillRuntime';
import { clearHighlights, showMoveTiles } from './targeting';
import { grantKey } from './dungeonSetup';
import { offerLoot } from './loot';
import { GRIBNAB_BARKS, BARON_BARKS, EASTER_EGG_LINES, MAIN_QUEST_F50 } from '../../levels/floor50Text';

// art-designer contract: particles.ts gains FX.critBurst(ps, p). Guarded cast
// keeps the build green before the helper lands (no-op until then).
const fxCritBurst = (FX as Partial<typeof FX> & { critBurst?: (ps: unknown, p: THREE.Vector3) => void }).critBurst;

/** global animation speed multiplier — 1 = normal, 0.05 = 20× fast.
 *  Dev/spectator aid; wired to the engine as `setAnimScale`. */
let animScale = 1;
export function setAnimScale(s: number) { animScale = Math.max(0, s); }

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms * animScale));

// ══ main animation loop ════════════════════════════════════
export async function animate(engine: any, ev: CombatEvent) {
  switch (ev.type) {
    case 'log': engine.pushLog(ev.text, ev.kind); await delay(25); break;
    case 'actionAnnounce': {
      // readability beat: banner up, camera leans to the caster, motes gather
      // in the skill colour, the cast cue sounds — then the action lands
      engine.showActionBanner?.('announce', ev.text, ev.sub, ev.cls);
      const caster = engine.byId(ev.unitId);
      if (caster) {
        engine.iso.focus?.(unitWorld(engine, caster.pos).clone().add(new THREE.Vector3(0, 0.9, 0)));
        if (ev.fxColor) FX.charge(engine.particles, unitWorld(engine, caster.pos), ev.fxColor);
      }
      playSkillCue(engine, ev.cue ?? 'arcane', 0.8);
      engine.emitSnapshot?.();
      await delay(820);
      break;
    }
    case 'move': await animMove(engine, ev.unitId, ev.path); break;
    case 'melee': await animMelee(engine, ev.unitId, ev.targetId, ev.audioCue); break;
    case 'projectile': await animProjectile(engine, ev); break;
    case 'skillfx': {
      await animSkillFx(engine, ev.skill, ev.at, ev.targets, ev.presentation ?? presentationForSkill(ev.skill));
      // Gribnab's phase-2 arsenal announces itself once per fight
      if ((ev.skill.id === 'soap_storm' || ev.skill.id === 'duck_swarm') && !engine.flags?.has('grib_bark_phase2')) {
        engine.setFlag?.('grib_bark_phase2');
        void (engine.bark?.('gribnab', 'bark_phase2', GRIBNAB_BARKS.phase2, 4200) ?? engine.narrate?.('f50_grib_phase2', GRIBNAB_BARKS.phase2, 4200));
      }
      break;
    }
    case 'damage': {
      const v = engine.visuals.get(ev.unitId);
      if (v) { v.rig.anim.flinch = 1; refreshBar(engine, ev.unitId); }
      // weapon strikes land here — blood + a per-damage-type impact give the
      // swing weight that animMelee no longer carries (so a whiff stays clean)
      if (ev.kind === 'slashing' || ev.kind === 'piercing' || ev.kind === 'bludgeoning') {
        const target = engine.byId(ev.unitId);
        if (target) {
          const wp = unitWorld(engine, target.pos).clone().add(new THREE.Vector3(0, 0.9, 0));
          FX.slash(engine.particles, wp);
          FX.blood(engine.particles, wp);
          engine.audio.hitImpact(ev.kind);
          engine.iso.shake = Math.max(engine.iso.shake, 0.14);
          await delay(45);
        }
      }
      if (ev.crit) {
        // big hit: heavy shake + burst + a brief hitstop + fullscreen flash
        engine.iso.shake = Math.max(engine.iso.shake ?? 0, 0.55);
        const target = engine.byId(ev.unitId);
        if (target && fxCritBurst) fxCritBurst(engine.particles, unitWorld(engine, target.pos).clone().add(new THREE.Vector3(0, 0.9, 0)));
        engine.critFlash = Date.now();
        engine.emitSnapshot?.();
        await delay(140);
      }
      await delay(90);
      // Gribnab parley + boss HP-threshold barks (first crossing, once per fight)
      engine.maybeParley?.(ev.unitId);
      barkOnHpThreshold(engine, ev.unitId);
      break;
    }
    case 'miss': {
      if (ev.why === 'block') engine.audio.block();
      else if (ev.why === 'dodge') engine.audio.dodge();
      else engine.audio.whiff();
      break;
    }
    case 'actionResult': {
      // the numbers beat: roll breakdown / outcome banner rides on top of the
      // strike; crits get the sting and a longer hold so the read lands
      engine.showActionBanner?.('result', ev.text, ev.sub, `result ${ev.outcome}`);
      engine.emitSnapshot?.();
      if (ev.outcome === 'crit') { engine.audio.critHit(); await delay(560); }
      else if (ev.outcome === 'miss') await delay(420);
      else await delay(380);
      break;
    }
    case 'block': {
      const bu = engine.byId(ev.unitId);
      if (bu) FX.buff(engine.particles, unitWorld(engine, bu.pos).add(new THREE.Vector3(0, 0.6, 0)));
      engine.audio.block();
      break;
    }
    case 'heal': {
      const u = engine.byId(ev.unitId);
      if (u) { FX.heal(engine.particles, unitWorld(engine, u.pos).add(new THREE.Vector3(0, 0.5, 0))); engine.audio.play('heal', 0.8); refreshBar(engine, ev.unitId); }
      await delay(110);
      break;
    }
    case 'revive': {
      // a knocked-out companion stands back up — switch to idle and leave the
      // death state for updateRig's "revived/reset" pass to fully undo.
      const v = engine.visuals.get(ev.unitId);
      const u = engine.byId(ev.unitId);
      if (v) {
        v.rig.anim.mode = 'idle';
        v.rig.anim.t = 0;
        v.rig.anim.crouch = 0;
        v.bar.style.display = '';
        v.dustDone = false;
      }
      if (u) { FX.buff(engine.particles, unitWorld(engine, u.pos).add(new THREE.Vector3(0, 0.5, 0))); engine.audio.play('heal', 0.8, 1.3); refreshBar(engine, ev.unitId); }
      await delay(120);
      break;
    }
    case 'float': spawnFloater(engine, ev.unitId, ev.text, ev.cls); await delay(60); break;
    case 'death': {
      const v = engine.visuals.get(ev.unitId);
      const slain = engine.byId(ev.unitId);
      if (v) {
        v.rig.anim.mode = 'dead'; v.rig.anim.t = 0;
        if (slain?.unconscious) {
          // knocked out, not dead — keep the bar visible (reads 0 HP) and hold
          // onto the weapon; the 'revive' event will stand them back up.
        } else {
          v.bar.style.display = 'none';
          dropWeapon(engine, v);
        }
      }
      engine.audio.play('sword_hit', 0.4, 0.6);
      if (slain?.dropKey) grantKey(engine, slain.dropKey);
      if (slain?.bossGroup || slain?.name === 'Baron Gnaw' || slain?.name === 'Gribnab') {
        engine.defeatedSpecialMobs.add(slain.id);
      }
      if (slain?.name === 'Gribnab') {
        engine.setFlag?.('gribnab_dead');
        engine.runStats.kills += 1;
        engine.pushLog('🛁 The Goblin King is dead. The bath is silent. The rubber ducks float, abandoned.', 'system');
        void (engine.bark?.('gribnab', 'bark_death', GRIBNAB_BARKS.death, 4800) ?? engine.narrate?.('f50_grib_death', GRIBNAB_BARKS.death, 4800));
        // The Longest Morning — Gribnab is dealt with (death path)
        engine.questLog?.progress?.('the_longest_morning');
        engine.pushLog?.(MAIN_QUEST_F50.stages.gribnabDown, 'system');
      }
      if (slain?.name === 'Baron Gnaw') {
        engine.setFlag?.('boss_rat_dead');
        void (engine.bark?.('baron_gnaw', 'bark_death', BARON_BARKS.death, 4200) ?? engine.narrate?.('f50_baron_death', BARON_BARKS.death, 4200));
      }
      if (slain?.name === 'The Spore Mother') {
        engine.setFlag?.('spore_mother_dead');
        engine.pushLog('The Spore Mother falls. The throne crumbles. The mushrooms DIM. You killed a dream. You killed a BEAUTIFUL dream. You had to. But it was beautiful.', 'system');
      }
      if (slain?.team === 'enemy' && slain?.name !== 'Gribnab') engine.runStats.kills += 1;
      // guaranteed item/gold drops (Baron Gnaw → finger + rusty key, Gribnab → loot)
      if (slain?.deathDrops) {
        const dd = slain.deathDrops;
        const items: Item[] = dd.itemIds ? dd.itemIds.map((itemId: string) => makeItem(itemId)) : [];
        // random pools draw `count` ids from each pool at kill time
        for (const r of dd.random ?? []) {
          const pool = r.pool ?? [];
          if (!pool.length) continue;
          for (let i = 0; i < (r.count ?? 1); i++) {
            items.push(makeItem(pool[Math.floor(Math.random() * pool.length)]));
          }
        }
        const gold = dd.gold ?? 0;
        if (items.length || gold) offerLoot(engine, `${slain.name}'s body`, items, gold);
        for (const it of items) engine.pushLog(`${slain.name} drops ${it.icon} ${it.name}!`, 'system');
        if (gold) engine.pushLog(`🪙 ${gold} gold clatters from the body.`, 'system');
      }
      // mold blobs: 25% spore burst — Nauseated to adjacent party members
      if (slain?.name === 'Mold Blob' && Math.random() < 0.25) {
        for (const p of engine.combat.living('party')) {
          if (Combat.dist(p.pos, slain.pos) <= 1 && !p.conditions.some((c: any) => c.id === 'nauseated')) {
            p.conditions.push({ id: 'nauseated', name: 'Nauseated', roundsLeft: 3 });
            engine.pushLog(`${p.name} breathes in the mold spores — Nauseated!`, 'system');
            spawnFloater(engine, p.id, '❄ Nauseated', 'debuff');
          }
        }
      }
      // bone rat reassembly is handled model-side in combat.ts onDeath so
      // the fight correctly continues instead of ending mid-revival.
      await delay(350);
      break;
    }
    case 'summon': {
      // a new unit fades in (boss summons, Scrag hostile path)
      const u = ev.unit;
      engine.addUnit(u);
      // Baron Gnaw's first nest-call barks once per fight
      if (ev.summonerId) {
        const sum = engine.byId(ev.summonerId);
        if (sum?.name === 'Baron Gnaw' && !engine.flags?.has('baron_summon_barked')) {
          engine.setFlag?.('baron_summon_barked');
          void (engine.bark?.('baron_gnaw', 'bark_summon', BARON_BARKS.summon, 4200) ?? engine.narrate?.('f50_baron_summon', BARON_BARKS.summon, 4200));
        }
      }
      const sv = engine.visuals.get(u.id);
      if (sv) {
        sv.rig.group.scale.set(0.01, 0.01, 0.01);
        const t0 = performance.now();
        const grow = () => {
          const k = Math.min(1, (performance.now() - t0) / 350);
          const s = 0.01 + (u.scheme.bulk ?? 1) * (1 - (1 - k) * (1 - k));
          sv.rig.group.scale.set(s, s, s);
          if (k < 1 && !engine.disposed) requestAnimationFrame(grow);
        };
        grow();
      }
      engine.audio.screech();
      await delay(350);
      break;
    }
    case 'turn': {
      const u = engine.byId(ev.unitId);
      if (u) {
        engine.iso.focus(unitWorld(engine, u.pos));
        clearHighlights(engine);
        // 3-phase combat: flash a big banner whenever the rotation crosses
        // from one team's phase to the other (party → enemy → party …).
        if (engine.lastTurnTeam !== u.team) {
          engine.lastTurnTeam = u.team;
          engine.phaseBanner = {
            text: u.team === 'party' ? '⚔ YOUR TURN' : '🐀 ENEMY PHASE',
            cls: u.team,
            id: (engine.phaseBannerId = (engine.phaseBannerId ?? 0) + 1),
            at: performance.now(),
          };
          engine.emitSnapshot();
        }
        const aiParty = u.team === 'party' && u.aiControlled;
        const downed = !u.alive || u.unconscious;
        // terrain summons (the shaman totem) auto-act: no move tiles, no player
        // input — they pulse once and the rotation advances past them.
        const isTotem = u.team === 'party' && !aiParty && !downed
          && !!u.knownSkills?.includes('totem_burst') && (u.moveRange ?? 6) === 0;
        if (u.team === 'party' && engine.phase === 'combat' && !aiParty && !downed && !isTotem) showMoveTiles(engine);
        // M8: enemy turns AND ai-controlled companions are driven by the AI —
        // resolve the full turn (skills + movement, then advance initiative)
        // right here so the turn actually resolves instead of stalling. Dead or
        // knocked-out units auto-advance past themselves (endTurn skips them).
        if ((u.team === 'enemy' || aiParty || downed || isTotem) && engine.combat.inCombat) {
          if (u.alive && !u.unconscious) {
            if (isTotem) {
              const pulse = engine.combat.useSkill(u, 'totem_burst', u.pos);
              if (pulse.length) engine.enqueue(pulse);
            } else {
              const aiEvents: CombatEvent[] = [];
              for (let i = 0; i < 8; i++) {
                const step = aiParty ? engine.combat.partyAiStep() : engine.combat.aiStep();
                if (!step) break;
                aiEvents.push(...step);
                if (!engine.combat.inCombat) break;   // combat may end mid-turn
              }
              if (aiEvents.length) engine.enqueue(aiEvents);
            }
          }
          engine.enqueue(engine.combat.endTurn());
        }
      }
      // enemy turns resolve snappier than party turns — the party's "YOUR
      // TURN" beat gets a beat of room, the enemy phase never drags.
      await delay(u.team === 'enemy' ? 60 : 170);
      break;
    }
    case 'phase': {
      // a stray phase event (late intro narration, endEarly, anything) must
      // never desync a live fight: while combat is active the only valid
      // phase is 'combat'. checkEnd/endEarly clear inCombat before emitting
      // explore/victory/defeat, so legitimate transitions still pass.
      if (engine.combat.inCombat && ev.phase !== 'combat') {
        engine.pushLog?.(`(phase ${ev.phase} ignored — fight in progress)`, 'system');
        break;
      }
      engine.phase = ev.phase;
      if (ev.phase === 'defeat') {
        engine.runStats.deaths += 1;
        // TPK juice: vignette + a random narrator line (once per defeat)
        engine.tpkVignette = true;
        const lineIdx = Math.floor(Math.random() * EASTER_EGG_LINES.tpk.length);
        void engine.narrate?.(`f50_tpk_${lineIdx + 1}`, EASTER_EGG_LINES.tpk[lineIdx], 5200);
        engine.emitSnapshot?.();
      }
      if (ev.phase === 'combat') {
        // fresh fight: the first party turn must re-fire the phase banner
        engine.lastTurnTeam = null;
        engine.phaseBanner = null;
        engine.audio.setMusicDucked(true);
        // the encounter theme takes over from the ambient loop — AAA adaptive crossfade
        engine.audio.setAdaptiveState?.('combat', 1.0);
        engine.audio.playMusic('music_combat');
        for (const [id, v] of engine.visuals) {
          const u = engine.byId(id);
          if (!u) continue;
          v.walker = null;
          if (u.alive) { v.rig.anim.mode = 'idle'; v.rig.group.position.copy(unitWorld(engine, u.pos)); }
        }
      }
      if (ev.phase === 'explore') {
        engine.phaseBanner = null;    // fight over — no stale phase flash
        engine.actionBanner = null;   // and no stale action banner either
        engine.hazardUsed?.clear();   // hazards reset per fight
        if (engine.tpkVignette) { engine.tpkVignette = false; engine.emitSnapshot?.(); }
        engine.audio.setMusicDucked(false);
        engine.audio.setAdaptiveState?.('explore', 1.4);
        if (engine.phase === 'explore') engine.audio.playMusic('music_ambient');  // back to the cellar
        // drops that piled up during the fight surface now
        engine.flushLootQueue?.();
      }
      await delay(200);
      break;
    }
    case 'dice': engine.showDiceRoll?.(ev.die, ev.total, ev.reason, 1400); break;
    case 'levelup': {
      const u = engine.byId(ev.unitId);
      if (u) {
        FX.levelup(engine.particles, unitWorld(engine, u.pos).add(new THREE.Vector3(0, 0.6, 0)));
        engine.audio.play('heal', 0.9, 1.3);
        spawnFloater(engine, ev.unitId, '⬆ LEVEL UP!', 'levelup');
      }
      await delay(450);
      break;
    }
    case 'shake': engine.iso.shake = Math.max(engine.iso.shake, ev.power); break;
  }
}

export async function animMove(engine: any, unitId: string, path: GridPos[]) {
  const v = engine.visuals.get(unitId);
  if (!v || !path.length) return;
  const pts = path.map((t: GridPos) => unitWorld(engine, t));
  v.rig.anim.mode = 'walk';
  for (const p of pts) {
    const from = v.rig.group.position.clone();
    v.targetYaw = Math.atan2(p.x - from.x, p.z - from.z);
    const mu = engine.byId(unitId); if (mu) mu.facing = v.targetYaw;
    const dur = 105 * animScale;
    const t0 = performance.now();
    while (performance.now() - t0 < dur && !engine.disposed) {
      const k = (performance.now() - t0) / dur;
      v.rig.group.position.lerpVectors(from, p, k);
      v.rig.group.position.y += Math.sin(k * Math.PI) * 0.12;
      await delay(8);
    }
    v.rig.group.position.copy(p);
    if (Math.random() < 0.5) FX.dust(engine.particles, p.clone());
  }
  v.rig.anim.mode = 'idle';
  v.proxy.position.copy(v.rig.group.position).y += (v.proxy.userData.yOff as number) ?? 0.9;
  const u = engine.byId(unitId);
  if (u) {
    const dest = path[path.length - 1];
    const trap = engine.trapManager.at(dest.x, dest.z);
    // traps are for the adventurer — the dungeon's own rats/mobs never trip them
    if (trap && !trap.triggered && u.team !== 'enemy') void triggerTrap(engine, u, trap);
    // environmental hazards — shoved into the wine press / the bath tub
    if (engine.hazardTiles?.has(`${dest.x},${dest.z}`)) {
      const key = engine.hazardKind?.get(`${dest.x},${dest.z}`) ?? 'hazard';
      const usedKey = `hazard_${key}`;
      if (!engine.hazardUsed?.has(usedKey)) {
        engine.hazardUsed?.add(usedKey);
        if (key === 'wine_press') {
          u.hp = Math.max(0, u.hp - 10);
          spawnFloater(engine, u.id, '🪨 -10', 'dmg');
          engine.pushLog(`${u.name} is crushed by the wine press! 10 damage.`, 'hit');
          engine.iso.shake = Math.max(engine.iso.shake ?? 0, 0.3);
          if (u.hp <= 0 && u.alive) { u.alive = false; spawnFloater(engine, u.id, '💀', 'death'); }
        } else if (key === 'bath') {
          u.hp = Math.max(0, u.hp - 5);
          spawnFloater(engine, u.id, '♨ -5', 'dmg');
          if (!u.conditions.some((c: any) => c.id === 'scalded')) u.conditions.push({ id: 'scalded', name: 'Scalded', roundsLeft: 2 });
          engine.pushLog(`${u.name} lands in the steaming bath — 5 damage, Scalded!`, 'hit');
          if (u.hp <= 0 && u.alive) { u.alive = false; spawnFloater(engine, u.id, '💀', 'death'); }
        }
        engine.refreshBar?.(engine, u.id);
      }
    }
  }
}
export async function animMelee(engine: any, unitId: string, targetId: string, audioCue?: string) {
  const v = engine.visuals.get(unitId), tv = engine.visuals.get(targetId);
  if (!v || !tv) return;
  const vp = v.rig.group.position;
  const tp = tv.rig.group.position;
  v.targetYaw = Math.atan2(tp.x - vp.x, tp.z - vp.z);
  const au = engine.byId(unitId); if (au) au.facing = v.targetYaw;
  const dir = tp.clone().sub(vp).setY(0).normalize();
  const home = vp.clone();
  if (audioCue === 'impact') engine.audio.hitImpact('bludgeoning');
  else engine.audio.swing();
  v.rig.anim.lunge = 1;
  for (let k = 0; k <= 1 && !engine.disposed; k += 0.12) {
    vp.copy(home).addScaledVector(dir, Math.sin(k * Math.PI) * 0.5);
    await delay(16);
  }
  vp.copy(home);
}

export async function smashProp(engine: any, u: Unit, prop: any, skill?: SkillDef) {
  if (engine.busy) return;
  engine.busy = true;
  const v = engine.visuals.get(u.id);
  if (v) {
    const vp = v.rig.group.position;
    const tp = engine.props.worldPos(prop);
    v.targetYaw = Math.atan2(tp.x - vp.x, tp.z - vp.z);
    u.facing = v.targetYaw;
    const dir = tp.clone().sub(vp).setY(0).normalize();
    const home = vp.clone();
    v.rig.anim.lunge = 1;
    for (let k = 0; k <= 1 && !engine.disposed; k += 0.12) {
      vp.copy(home).addScaledVector(dir, Math.sin(k * Math.PI) * 0.5);
      await delay(16);
    }
    vp.copy(home);
  }
  engine.pushLog(`${u.name} smashes the ${prop.def.name}!`, 'hit');
  destroyProp(engine, prop);
  if (engine.combat.inCombat && skill) {
    if (skill.cost === 'action') u.hasAction = false;
    else if (skill.cost === 'bonus') u.hasBonus = false;
  }
  // a loot overlay owns busy while it's up — don't clobber it
  if (!engine.pendingLoot) engine.busy = false;
  engine.emitSnapshot();
}

export function destroyProp(engine: any, prop: any) {
  const wp = engine.props.worldPos(prop);
  if (prop.def.id === 'starting') {
    void engine.narrate('f50_sack', "A sack. It contains a dagger that's seen better centuries, a potion of questionable provenance, and a torch. This is your inheritance. Spend it wisely.", 4600);
  }
  // ── floor 49 — fungal grotto destructible hooks ──
  if (prop.def.id === 'spore_throne') {
    engine.setFlag?.('spore_throne_destroyed');
    engine.pushLog('The mushroom throne CRUMBLES! The Spore Mother howls — her mycelial network is severed!', 'system');
    // the mother is weakened: she loses max HP and her fight-start heal
    const mother = engine.combat.units.find((u: any) => u.name === 'The Spore Mother' && u.alive);
    if (mother) {
      mother.maxHp = Math.max(10, mother.maxHp - 15);
      mother.hp = Math.min(mother.hp, mother.maxHp);
      engine.pushLog('The Spore Mother staggers. She has lost her throne — and 15 of her hit points.', 'system');
    }
  }
  if (prop.def.id === 'spore_sac') {
    // the sac bursts: 2 poison damage to everyone adjacent + a poison cloud
    engine.pushLog('The spore sac POPS! A cloud of angry spores erupts!', 'system');
    const wp2 = engine.props.worldPos(prop);
    FX.debris(engine.particles, wp2.clone().add(new THREE.Vector3(0, 0.5, 0)), prop.def.palette, 20);
    for (const u of engine.combat.units) {
      if (!u.alive) continue;
      if (Math.abs(u.pos.x - (prop as any).pos.x) > 1 || Math.abs(u.pos.z - (prop as any).pos.z) > 1) continue;
      u.hp = Math.max(0, u.hp - 2);
      spawnFloater(engine, u.id, '💨 -2', 'dmg');
      engine.pushLog(`${u.name} is caught in the spore cloud! 2 poison damage.`, 'hit');
      if (u.hp <= 0 && u.alive) {
        u.alive = false;
        spawnFloater(engine, u.id, '💀', 'death');
      }
      if (Math.random() < 0.4 && u.team === 'party' && !u.conditions.some((c: any) => c.id === 'poisoned')) {
        u.conditions.push({ id: 'poisoned', name: 'Poisoned', roundsLeft: 2 });
        spawnFloater(engine, u.id, '❄ Poisoned', 'debuff');
      }
    }
    return;   // sacs drop nothing
  }
  const { items, gold } = engine.props.destroy(prop);
  // remember the prop is gone so rests / reloads keep the dungeon cleared
  engine.destroyedProps.add(prop.id);
  FX.debris(engine.particles, wp.clone().add(new THREE.Vector3(0, 0.35, 0)), prop.def.palette, 24);
  FX.dust(engine.particles, wp.clone());
  engine.audio.crumble(0.9);
  engine.iso.shake = Math.max(engine.iso.shake, 0.18);
  engine.pushLog(`${prop.def.icon} The ${prop.def.name} shatters!`, 'system');
  for (const it of items) engine.pushLog(`The ${prop.def.name} drops ${it.icon} ${it.name}.`, 'system');
  if (gold) engine.pushLog(`The ${prop.def.name} drops 🪙 ${gold} gold.`, 'system');
  offerLoot(engine, `The ${prop.def.name}`, items, gold);
  engine.emitSnapshot();
}

export async function triggerTrap(engine: any, u: Unit, trap: any) {
  trap.revealed = true;
  engine.trapManager.trigger(trap, (dice: string, type: string, cond: string, condRounds: number) => {
    engine.audio.crumble(0.7);
    engine.iso.shake = Math.max(engine.iso.shake, 0.2);
    const dmg = dice !== '0' ? rollDice(dice) : null;
    const amt = dmg?.total ?? 0;
    if (amt > 0) {
      u.hp = Math.max(0, u.hp - amt);
      spawnFloater(engine, u.id, `⚠ -${amt}`, 'dmg');
      engine.pushLog(`${u.name} triggers ${trap.def.icon} ${trap.def.name}! Takes ${amt} ${type} damage.`, 'hit');
      // traps can kill OUT of combat — mirror the wine-press/bath guard so a
      // trap can never leave a 0-HP "zombie" hero (alive but dead, still
      // taking turns). The explore tick then routes the wipe to defeat.
      if (u.hp <= 0 && u.alive) {
        u.alive = false;
        spawnFloater(engine, u.id, '💀', 'death');
      }
    } else engine.pushLog(`${u.name} triggers ${trap.def.icon} ${trap.def.name}!`, 'system');
    if (cond && !u.conditions.some((c: any) => c.id === cond)) {
      const cn = CONDITIONS[cond]?.name ?? cond;
      u.conditions.push({ id: cond, name: cn, roundsLeft: condRounds ?? 2 });
      spawnFloater(engine, u.id, `❄ ${cn}`, 'debuff');
    }
    FX.debris(engine.particles, unitWorld(engine, u.pos).clone().add(new THREE.Vector3(0, 0.35, 0)), [0xff8c00, 0xcc6600, 0x884400], 16);
  });
  engine.emitSnapshot();
  await delay(200);
}

export async function disarmTrap(engine: any, u: Unit, trap: any) {
  const dexMod = Math.floor((u.abilities.dex - 10) / 2);
  const roll = 1 + Math.floor(Math.random() * 20);
  const total = roll + dexMod + u.proficiency;
  engine.pushLog(`${u.name} attempts to disarm ${trap.def.icon} ${trap.def.name}... Roll ${roll}${dexMod >= 0 ? '+' : ''}${dexMod} (DEX) +${u.proficiency} prof = ${total} vs DC 12`, 'roll');
  if (total >= 12) {
    engine.pushLog(`${u.name} disarms the ${trap.def.name}!`, 'system');
    engine.audio.play('ui_click', 0.7);
    const goldReward = 3 + Math.floor(Math.random() * 8);
    offerLoot(engine, 'Disarmed trap', [], goldReward);
    spawnFloater(engine, u.id, '✔ Disarmed!', 'buff');
    // the trap is genuinely gone now — stepping on the tile is safe
    // (at() and the walker both skip triggered traps)
    trap.triggered = true;
    if (trap.mesh) {
      engine.trapManager.group.remove(trap.mesh);
      trap.mesh.geometry.dispose();
      (trap.mesh.material as THREE.Material).dispose();
      trap.mesh = undefined;
    }
    const els = engine.trapManager.group.userData.trapEls ?? [];
    engine.trapManager.group.userData.trapEls = els.filter((e: any) => {
      if (e.wp.x === trap.pos.x && e.wp.z === trap.pos.z) { e.el.remove(); return false; }
      return true;
    });
  } else {
    engine.pushLog(`${u.name} fumbles the disarm!`, 'system');
    await triggerTrap(engine, u, trap);
  }
  engine.emitSnapshot();
}

export async function animProjectile(engine: any, ev: any) {
  const v = engine.visuals.get(ev.unitId);
  const from = unitWorld(engine, ev.from).add(new THREE.Vector3(0, 1.2, 0));
  const to = unitWorld(engine, ev.to).add(new THREE.Vector3(0, 0.6, 0));
  if (v) {
    v.targetYaw = Math.atan2(to.x - v.rig.group.position.x, to.z - v.rig.group.position.z);
    const pu = engine.byId(ev.unitId); if (pu) pu.facing = v.targetYaw;
  }
  const mat = new THREE.MeshBasicMaterial({ color: ev.color });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mat);
  engine.scene.add(mesh);
  playSkillCue(engine, ev.audioCue ?? (ev.fx === 'arrow' ? 'ranged' : ev.fx === 'fire' ? 'fireball_cast' : 'arcane'), 0.75);
  const dur = ev.fx === 'arrow' ? 240 : 430;
  const t0 = performance.now();
  while (performance.now() - t0 < dur && !engine.disposed) {
    const k = (performance.now() - t0) / dur;
    mesh.position.lerpVectors(from, to, k);
    mesh.position.y += Math.sin(k * Math.PI) * (ev.fx === 'arrow' ? 0.6 : 2.2);
    FX.trail(engine.particles, mesh.position.clone(), ev.color);
    await delay(12);
  }
  engine.scene.remove(mesh);
  mat.dispose(); mesh.geometry.dispose();
  if (ev.fx === 'fire') { FX.explosion(engine.particles, to, 2); engine.audio.play('fireball_impact', 0.95); engine.iso.shake = Math.max(engine.iso.shake, 0.5); flashLight(engine, to, 0xff7a1f); }
  else if (ev.fx === 'arcane') FX.arcane(engine.particles, to);
  else { FX.blood(engine.particles, to); engine.audio.hitImpact('piercing'); }
}

function playSkillCue(engine: any, cue: string, volume: number, pitch = 1) {
  switch (cue) {
    case 'melee': engine.audio.swing(); break;
    case 'impact': engine.audio.hitImpact('bludgeoning'); break;
    case 'fire':
    case 'fireball_cast': engine.audio.play(cue === 'fire' ? 'fireball' : 'fireball_cast', volume, pitch); break;
    case 'ice': engine.audio.play('cast_ice', volume, pitch); break;
    case 'holy': engine.audio.play('cast_holy', volume, pitch); break;
    case 'heal': engine.audio.play('heal', volume, pitch); break;
    case 'buff': engine.audio.play('cast_buff', volume, pitch); break;
    case 'ranged': engine.audio.play('arrow', volume); break;
    default: engine.audio.play('cast_arcane', volume, pitch); break;
  }
}

export async function animSkillFx(engine: any, s: SkillDef, at: GridPos, targets: string[], presentation = presentationForSkill(s)) {
  const p = unitWorld(engine, at).add(new THREE.Vector3(0, 0.6, 0));
  playSkillCue(engine, presentation.castAudio, 0.85, presentation.pitch ?? 1);
  switch (s.fx) {
    case 'fire': FX.explosion(engine.particles, p, s.aoeRadius || 1); engine.iso.shake = Math.max(engine.iso.shake, presentation.shake ?? 0.5); flashLight(engine, p, presentation.flash ?? 0xff7a1f); break;
    case 'ice': FX.ice(engine.particles, p); engine.iso.shake = Math.max(engine.iso.shake, presentation.shake ?? 0.25); break;
    case 'holy': FX.holy(engine.particles, p); flashLight(engine, p, presentation.flash ?? 0xfde68a); break;
    case 'heal': FX.heal(engine.particles, p); break;
    case 'buff': for (const id of targets) { const u = engine.byId(id); if (u) FX.buff(engine.particles, unitWorld(engine, u.pos).add(new THREE.Vector3(0, 0.6, 0))); } break;
    case 'slash': FX.slash(engine.particles, p, s.fxColor); engine.iso.shake = Math.max(engine.iso.shake, presentation.shake ?? 0.2); break;
    default: FX.arcane(engine.particles, p); break;
  }
  if (s.aoeRadius > 0 && (s.fx === 'fire' || s.fx === 'ice')) for (const prop of engine.props.inBlast(at, s.aoeRadius)) destroyProp(engine, prop);
  if (engine.surfaces) {
    const rad = Math.max(1, s.aoeRadius || 0);
    if (s.fx === 'fire') engine.surfaces.ignite(at.x, at.z, rad);
    else if (s.fx === 'ice') for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) <= rad) engine.surfaces.apply(at.x + dx, at.z + dz, 'frozen');
  }
  await delay(380);
}

export function flashLight(engine: any, at: THREE.Vector3, color: number) {
  const l = new THREE.PointLight(color, 60, 16, 1.6);
  l.position.copy(at).y += 1;
  engine.scene.add(l);
  const t0 = performance.now();
  const fade = () => {
    const k = (performance.now() - t0) / 400;
    if (k >= 1 || engine.disposed) { engine.scene.remove(l); return; }
    l.intensity = 60 * (1 - k);
    requestAnimationFrame(fade);
  };
  fade();
}

export function spawnFloater(engine: any, unitId: string, text: string, cls: string) {
  const u = engine.byId(unitId);
  if (!u) return;
  const el = document.createElement('div');
  el.className = `fx-float ${cls}`;
  el.textContent = text;
  engine.overlay.appendChild(el);
  engine.floaters.push({ el, wp: unitWorld(engine, u.pos).add(new THREE.Vector3(0, 1.9, 0)), t: 0 });
}

export function refreshBar(engine: any, unitId: string) {
  const u = engine.byId(unitId);
  const v = engine.visuals.get(unitId);
  if (!u || !v) return;
  v.barFill.style.width = `${Math.max(0, (u.hp / Math.max(1, u.maxHp)) * 100)}%`;
}

export function spawnChest(engine: any) {
  const boss = engine.combat.units.find((u: any) => u.name === 'Boss Skar');
  const at = boss ? boss.pos : { x: 34, z: 10 };
  const g = new THREE.Group();
  const gold = new THREE.MeshLambertMaterial({ color: 0x8a5a1e });
  const trim = new THREE.MeshLambertMaterial({ color: 0xf5c542, emissive: 0x7a5a10, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.55), gold);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.22, 0.59), trim);
  lid.position.y = 0.32;
  body.castShadow = lid.castShadow = true;
  g.add(body, lid);
  g.position.copy(unitWorld(engine, at)).y += 0.25;
  engine.scene.add(g);
  engine.chest = g;
  engine.pushLog('✨ A gilded chest appears among the ruins!', 'system');
}

export function checkCombatTrigger(engine: any) {
  if (engine.structures) { engine.checkDungeonAggro(); return; }
  if (engine.phase !== 'explore' || engine.combat.inCombat) return;
  const party = engine.combat.living('party');
  const foes = engine.combat.living('enemy');
  if (!party.length || !foes.length) return;

  if (!engine.sneaking) {
    for (const p of party) for (const f of foes) {
      if (Combat.dist(p.pos, f.pos) <= 6) {
        engine.pushLog('⚠ Ambush! Goblins pour from the ruins!', 'system');
        engine.audio.play('fireball', 0.35, 0.5);
        engine.enqueue(engine.combat.start());
        return;
      }
    }
  }

  for (const p of party) {
    for (const f of foes) {
      if (!inEnemyCone(engine, p.pos, f)) continue;
      if (!engine.sneaking) {
        engine.pushLog(`⚠ ${f.name} spots ${p.name}!`, 'system');
        engine.audio.play('fireball', 0.35, 0.5);
        engine.enqueue(engine.combat.start());
        return;
      }
      let em = engine.detectionMeter.get(f.id);
      if (!em) { em = new Map(); engine.detectionMeter.set(f.id, em); }
      const dist = Combat.dist(p.pos, f.pos);
      const rate = (1 - dist / 9) * 0.12;
      const cur = (em.get(p.id) ?? 0) + rate;
      em.set(p.id, cur);
      if (cur >= 1) {
        engine.pushLog(`⚠ ${f.name} detects ${p.name}!`, 'system');
        engine.audio.play('fireball', 0.35, 0.5);
        engine.enqueue(engine.combat.startDetection(true));
        return;
      }
    }
  }

  if (engine.chest) {
    const cp = engine.chest.position;
    for (const p of party) {
      const wp = unitWorld(engine, p.pos);
      if (wp.distanceTo(cp) < 1.6) {
        engine.scene.remove(engine.chest);
        engine.chest = null;
        const { items, gold, lootRoll } = rollLootTable('chest');
        if (lootRoll !== undefined) engine.showDiceRoll?.('d20', lootRoll, 'Treasure quality');
        engine.audio.play('victory', 0.6, 1.4);
        FX.levelup(engine.particles, cp);
        engine.pushLog(`You pry open the chest: ${[...items.map((i: any) => `${i.icon} ${i.name}`), `🪙 ${gold} gold`].join(', ')}.`, 'system');
        offerLoot(engine, 'Chest', items, gold);
        engine.emitSnapshot();
        break;
      }
    }
  }
}

function inEnemyCone(engine: any, p: GridPos, enemy: any): boolean {
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

/** drop a weapon from a dying unit's visual — tumble it via rapier physics
 *  (with a hand-rolled ballistic fallback if physics isn't ready) */
function dropWeapon(engine: any, v: any) {
  const wpn = v.rig.parts.weapon as unknown as THREE.Object3D | undefined;
  if (!wpn || !wpn.parent) return;
  const baseY = (v.rig.group.userData.baseY as number) ?? wpn.getWorldPosition(new THREE.Vector3()).y;
  engine.scene.attach(wpn);
  const dir = Math.random() * Math.PI * 2, spd = 0.8 + Math.random() * 1.2;
  const vx = Math.cos(dir) * spd, vz = Math.sin(dir) * spd, vy = 1.5 + Math.random() * 1.8;
  const spin = new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  const restY = baseY + 0.04;

  // try physics first — real gravity + tumble + a floor patch to land on
  let physicsOwned = false;
  if (engine.physics?.ready) {
    const bb = new THREE.Box3().setFromObject(wpn);
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    engine.physics.spawnGround(
      { x: center.x, y: baseY - 0.02, z: center.z },
      { x: 3, y: 0.05, z: 3 },
    );
    const body = engine.physics.spawnDynamic(
      wpn,
      { x: Math.max(0.06, size.x / 2), y: Math.max(0.06, size.y / 2), z: Math.max(0.06, size.z / 2) },
      center,
      new THREE.Vector3(vx, vy, vz),
      spin,
    );
    physicsOwned = !!body;
  }

  // keep the mesh in droppedWeapons so disposeFloor still removes + disposes
  // it; settled:true lets the hand-rolled loop skip physics-owned weapons.
  engine.droppedWeapons.push({
    obj: wpn,
    vx: physicsOwned ? 0 : vx,
    vz: physicsOwned ? 0 : vz,
    vy: physicsOwned ? 0 : vy,
    spin: physicsOwned ? new THREE.Vector3() : spin,
    restY,
    settled: physicsOwned,
  });
  delete (v.rig.parts as { weapon?: THREE.Mesh }).weapon;
}

/** enqueue events for sequential playback — kicks off the pump so the
 *  queue actually drains (the refactor dropped this wiring; without it
 *  combat events never animate and enemy turns never resolve). */
export function enqueue(engine: any, events: CombatEvent[]) {
  engine.eventQueue.push(...events);
  void pump(engine);
}

/** boss HP-threshold barks — Gribnab's 75/50/25% lines fire once per fight on
 *  the first crossing of each threshold (hp only moves down, so the deepest
 *  newly-reached threshold wins on a big hit). Baron Gnaw's summon bark lives
 *  beside the 'summon' event instead (it needs the summoner context). */
function barkOnHpThreshold(engine: any, unitId: string) {
  const u = engine.byId(unitId);
  if (!u || !u.alive || u.team !== 'enemy') return;
  if (u.name !== 'Gribnab') return;
  const pct = u.hp / Math.max(1, u.maxHp);
  if (pct <= 0.25 && !engine.flags?.has('grib_bark_25')) {
    engine.setFlag?.('grib_bark_25');
    void (engine.bark?.('gribnab', 'bark_hp25', GRIBNAB_BARKS.hp25, 4200) ?? engine.narrate?.('f50_grib_25', GRIBNAB_BARKS.hp25, 4200));
  } else if (pct <= 0.5 && !engine.flags?.has('grib_bark_50')) {
    engine.setFlag?.('grib_bark_50');
    void (engine.bark?.('gribnab', 'bark_hp50', GRIBNAB_BARKS.hp50, 4200) ?? engine.narrate?.('f50_grib_50', GRIBNAB_BARKS.hp50, 4200));
  } else if (pct <= 0.75 && !engine.flags?.has('grib_bark_75')) {
    engine.setFlag?.('grib_bark_75');
    void (engine.bark?.('gribnab', 'bark_hp75', GRIBNAB_BARKS.hp75, 4200) ?? engine.narrate?.('f50_grib_75', GRIBNAB_BARKS.hp75, 4200));
  }
}

/** pump the event queue — play one event at a time */
export async function pump(engine: any) {
  if (engine.pumping) return;
  engine.pumping = true;
  while (engine.eventQueue.length && !engine.disposed) {
    const ev = engine.eventQueue.shift()!;
    try {
      await animate(engine, ev);
    } catch (err) {
      // one bad event must never wedge the queue: log it and move on
      console.error('[combatAnimation] event failed:', ev?.type, err);
      engine.pushLog?.(`(a ${ev?.type ?? 'combat'} event hiccuped — the fight continues)`, 'system');
    }
  }
  // queue drained: if it's still the player's turn, refresh the move-range
  // highlight. Actions used to wipe the tiles and never bring them back,
  // leaving "how far can I still go?" invisible mid-turn.
  const act = engine.combat?.active;
  if (engine.combat?.inCombat && engine.phase === 'combat'
      && act?.team === 'party' && !act.aiControlled && act.alive && !act.unconscious) {
    showMoveTiles(engine);
  }
  engine.pumping = false;
}
