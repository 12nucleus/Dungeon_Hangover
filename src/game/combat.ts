// ─────────────────────────────────────────────────────────────
// Combat core — PURE LOGIC, no rendering. Every public method
// returns CombatEvent[]; engine.ts animates them in order.
// This separation is what makes the game LLM-extensible:
// rules live here, presentation lives in engine.ts.
// ─────────────────────────────────────────────────────────────
import type { CombatEvent, GridPos, SkillDef, Unit, GamePhase } from './types';
import { SKILLS, CONDITIONS } from './skills';
import { rollD20, rollDice, abilityMod, fmtMod } from './dice';
import { VoxelWorld } from './world';
import { ENCHANTS, rollLootTable, type Item } from './items';
import { effAC, effMove, effMaxHp, effAtkBonus, XP_THRESHOLDS, MAX_LEVEL } from './stats';

export class Combat {
  units: Unit[] = [];
  turnOrder: string[] = [];
  activeIdx = 0;
  round = 1;
  inCombat = false;
  phase: GamePhase = 'explore';
  surpriseRound = false;
  surpriseHits: Set<string> = new Set();
  /** cheat: when true, party members take no damage */
  godMode = false;

  private world: VoxelWorld;
  constructor(world: VoxelWorld) { this.world = world; }

  get active(): Unit | null {
    if (!this.inCombat || !this.turnOrder.length) return null;
    return this.units.find((u) => u.id === this.turnOrder[this.activeIdx]) ?? null;
  }
  byId(id: string) { return this.units.find((u) => u.id === id) ?? null; }
  living(team: 'party' | 'enemy') { return this.units.filter((u) => u.alive && u.team === team); }
  /** enemies that are actually part of the CURRENT fight (aggroed, i.e. not dormant) */
  activeEnemies() { return this.units.filter((u) => u.alive && u.team === 'enemy' && !u.dormant); }

  // ── pathfinding (BFS, 4-dir, budget-limited) ──────────────
  private occupied(x: number, z: number, except?: string): boolean {
    return this.units.some((u) => u.alive && u.id !== except && u.pos.x === x && u.pos.z === z);
  }

  reachable(unit: Unit, budget: number): Map<string, GridPos[]> {
    const key = (x: number, z: number) => `${x},${z}`;
    const seen = new Map<string, GridPos[]>();
    const q: { x: number; z: number; d: number; path: GridPos[] }[] = [
      { x: unit.pos.x, z: unit.pos.z, d: 0, path: [] },
    ];
    seen.set(key(unit.pos.x, unit.pos.z), []);
    while (q.length) {
      const c = q.shift()!;
      if (c.d >= budget) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, nz = c.z + dz;
        if (!this.world.isWalkable(nx, nz)) continue;
        if (this.occupied(nx, nz, unit.id)) continue;
        const nh = this.world.heightAt(nx, nz), ch = this.world.heightAt(c.x, c.z);
        if (Math.abs(nh - ch) > 1) continue; // can't climb 2+ blocks in a step
        const k = key(nx, nz);
        if (seen.has(k)) continue;
        const path = [...c.path, { x: nx, z: nz }];
        seen.set(k, path);
        q.push({ x: nx, z: nz, d: c.d + 1, path });
      }
    }
    return seen;
  }

  /** full BFS ignoring budget — used for exploration & AI approach */
  pathTo(unit: Unit, tx: number, tz: number, maxLen = 200): GridPos[] | null {
    const key = (x: number, z: number) => `${x},${z}`;
    const prev = new Map<string, string>();
    const q: GridPos[] = [{ ...unit.pos }];
    prev.set(key(unit.pos.x, unit.pos.z), '');
    while (q.length) {
      const c = q.shift()!;
      if (c.x === tx && c.z === tz) {
        const path: GridPos[] = [];
        let k = key(tx, tz);
        while (prev.get(k)) {
          const [x, z] = k.split(',').map(Number);
          path.unshift({ x, z });
          k = prev.get(k)!;
        }
        return path.length <= maxLen ? path : null;
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, nz = c.z + dz;
        if (!this.world.isWalkable(nx, nz)) continue;
        if (this.occupied(nx, nz, unit.id)) continue;
        if (Math.abs(this.world.heightAt(nx, nz) - this.world.heightAt(c.x, c.z)) > 1) continue;
        const k = key(nx, nz);
        if (prev.has(k)) continue;
        prev.set(k, key(c.x, c.z));
        q.push({ x: nx, z: nz });
      }
    }
    return null;
  }

  static dist(a: GridPos, b: GridPos) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z)); // Chebyshev = 5e diagonal-friendly
  }

  // ── combat lifecycle ───────────────────────────────────────
  start(): CombatEvent[] {
    this.surpriseRound = false;
    this.surpriseHits.clear();
    const ev: CombatEvent[] = [];
    this.inCombat = true;
    this.phase = 'combat';
    this.round = 1;
    for (const u of this.units) {
      if (!u.alive || u.dormant) continue;
      const r = rollD20(abilityMod(u.abilities.dex));
      u.initiative = r.total + r.roll / 100; // tiebreak by raw roll
      ev.push({ type: 'log', text: `${u.name} rolls initiative ${r.roll}${fmtMod(abilityMod(u.abilities.dex))} = ${r.total}`, kind: 'roll' });
    }
    this.turnOrder = this.units.filter((u) => u.alive && !u.dormant).sort((a, b) => b.initiative - a.initiative).map((u) => u.id);
    this.activeIdx = 0;
    ev.push({ type: 'log', text: '— ⚔ COMBAT BEGINS —', kind: 'system' });
    ev.push({ type: 'phase', phase: 'combat' });
    ev.push(...this.beginTurn());
    return ev;
  }

  /** Start combat from stealth detection — enemies get Surprised */
  startDetection(surprise: boolean): CombatEvent[] {
    const ev = this.start();
    if (surprise) {
      this.surpriseRound = true;
      this.surpriseHits = new Set(this.living('party').map((p) => p.id));
      for (const u of this.units) {
        if (u.alive && u.team === 'enemy') {
          u.conditions.push({ id: 'surprised', name: CONDITIONS.surprised.name, roundsLeft: 1 });
        }
      }
      ev.push({ type: 'log', text: '⚡ Surprise round! Party catches enemies off guard!', kind: 'system' });
    }
    return ev;
  }

  private beginTurn(): CombatEvent[] {
    const u = this.active!;
    const ev: CombatEvent[] = [];
    // tick cooldowns & conditions (happen at start of turn regardless)
    for (const k of Object.keys(u.cooldowns)) if (u.cooldowns[k] > 0) u.cooldowns[k]--;
    for (const c of u.conditions) c.roundsLeft--;
    u.conditions = u.conditions.filter((c) => c.roundsLeft > 0);
    if (u.conditions.some((c) => c.id === 'surprised')) {
      u.conditions = u.conditions.filter((c) => c.id !== 'surprised');
      ev.push({ type: 'log', text: `${u.name} is surprised and skips their turn!`, kind: 'system' });
      ev.push({ type: 'turn', unitId: u.id, round: this.round });
      return ev;
    }
    u.hasAction = true;
    u.hasBonus = true;
    u.movementLeft = effMove(u);
    if (u.conditions.some((c) => c.id === 'slowed')) u.movementLeft = Math.ceil(u.movementLeft / 2);
    if (u.conditions.some((c) => c.id === 'rooted')) u.movementLeft = 0;
    ev.push({ type: 'turn', unitId: u.id, round: this.round });
    ev.push({ type: 'log', text: `▶ ${u.name}'s turn`, kind: 'system' });
    return ev;
  }

  endTurn(): CombatEvent[] {
    const ev: CombatEvent[] = [];
    if (!this.inCombat) return ev;
    // find next living
    for (let i = 1; i <= this.turnOrder.length; i++) {
      const idx = (this.activeIdx + i) % this.turnOrder.length;
      const u = this.byId(this.turnOrder[idx])!;
      if (!u.alive) continue;
      if (idx <= this.activeIdx) this.round++;
      this.activeIdx = idx;
      break;
    }
    ev.push(...this.beginTurn());
    return ev;
  }

  private checkEnd(): CombatEvent[] {
    const ev: CombatEvent[] = [];
    const party = this.living('party').length, foes = this.activeEnemies().length;
    if (party === 0 || foes === 0) {
      this.inCombat = false;
      if (foes === 0) {
        // Encounter cleared. The dungeon is a series of encounters, so we hand
        // control back to exploration; final victory is driven by the engine
        // (looting the golden chest). Per-kill loot has already dropped.
        this.phase = 'explore';
        ev.push({ type: 'log', text: '— ✓ Area secured. —', kind: 'system' });
        ev.push({ type: 'phase', phase: 'explore' });
      } else {
        this.phase = 'defeat';
        ev.push({ type: 'log', text: '— 💀 DEFEAT. The realm falls silent... —', kind: 'system' });
        ev.push({ type: 'phase', phase: 'defeat' });
      }
    }
    return ev;
  }

  // ── movement ──────────────────────────────────────────────
  moveActiveTo(tile: GridPos): CombatEvent[] {
    const u = this.active;
    if (!u || u.team !== 'party') return [];
    const paths = this.reachable(u, u.movementLeft);
    const path = paths.get(`${tile.x},${tile.z}`);
    if (!path || !path.length) return [];
    u.movementLeft -= path.length;
    u.pos = { ...tile };
    return [{ type: 'move', unitId: u.id, path }];
  }

  // ── skill use (player) ─────────────────────────────────────
  canUse(u: Unit, s: SkillDef): string | null {
    if (!u.alive) return 'dead';
    if (s.cost === 'action' && !u.hasAction) return 'No action left';
    if (s.cost === 'bonus' && !u.hasBonus) return 'No bonus action left';
    if ((u.cooldowns[s.id] ?? 0) > 0) return `Cooldown: ${u.cooldowns[s.id]} round(s)`;
    return null;
  }

  /** targets = explicit tile (AoE) or unit id (single). Returns events or throws string reason. */
  useSkill(u: Unit, skillId: string, target: GridPos | string): CombatEvent[] {
    const s = SKILLS[skillId];
    if (!s || !u.equippedSkills.includes(skillId)) return [];
    const deny = this.canUse(u, s);
    if (deny) return [{ type: 'log', text: deny, kind: 'info' }];

    // resolve targets
    let center: GridPos;
    let targets: Unit[] = [];
    if (s.selfOnly) {
      center = { ...u.pos };
      targets = [u];
    } else if (s.allAllies) {
      center = { ...u.pos };
      targets = this.living(u.team);
    } else if (s.selfCentered) {
      center = { ...u.pos };
      targets = this.units.filter((t) => t.alive && t.team !== u.team && Combat.dist(t.pos, u.pos) <= s.aoeRadius);
      if (!targets.length) return [{ type: 'log', text: 'No enemies in range.', kind: 'info' }];
    } else if (s.aoeRadius > 0 && typeof target !== 'string') {
      center = target;
      if (Combat.dist(u.pos, center) > s.range) return [{ type: 'log', text: 'Target out of range.', kind: 'info' }];
      targets = this.units.filter((t) => t.alive && Combat.dist(t.pos, center) <= s.aoeRadius);
      if (!s.targetsAllies) targets = targets.filter((t) => t.team !== u.team || s.id === 'fireball' ? t.id !== u.id : true);
    } else if (typeof target === 'string') {
      const t = this.byId(target);
      if (!t || !t.alive) return [{ type: 'log', text: 'Invalid target.', kind: 'info' }];
      if (Combat.dist(u.pos, t.pos) > s.range) return [{ type: 'log', text: 'Target out of range.', kind: 'info' }];
      center = { ...t.pos };
      targets = [t];
      if (s.targetsAllies && t.team !== u.team) return [{ type: 'log', text: 'Must target an ally.', kind: 'info' }];
      if (!s.targetsAllies && t.team === u.team && s.kind !== 'buff') return [{ type: 'log', text: 'Must target an enemy.', kind: 'info' }];
    } else {
      return [{ type: 'log', text: 'No target selected.', kind: 'info' }];
    }

    // pay costs
    if (s.cost === 'action') u.hasAction = false;
    if (s.cost === 'bonus') u.hasBonus = false;
    if (s.cooldown > 0) u.cooldowns[s.id] = s.cooldown + 1; // +1 because it ticks at next turn start

    const ev: CombatEvent[] = [];
    ev.push({ type: 'log', text: `${u.name} uses ${s.icon} ${s.name}`, kind: 'info' });

    // buffs (bless / arcane shield): apply to allies (or self), done
    if (s.kind === 'buff') {
      for (const ally of (s.selfOnly ? [u] : this.living(u.team))) {
        if (!ally.conditions.some((c) => c.id === s.appliesCondition)) {
          ally.conditions.push({ id: s.appliesCondition!, name: CONDITIONS[s.appliesCondition!].name, roundsLeft: 3 });
        } else {
          ally.conditions.find((c) => c.id === s.appliesCondition)!.roundsLeft = 3;
        }
        ev.push({ type: 'float', unitId: ally.id, text: '✨ Blessed', cls: 'buff' });
      }
      ev.push({ type: 'skillfx', skill: s, at: center, targets: this.living(u.team).map((t) => t.id) });
      return ev;
    }

    // heals (single ally / self / whole party)
    if (s.kind === 'heal') {
      for (const t of targets) {
        const heal = rollDice(s.healDice!);
        const amt = Math.min(heal.total, effMaxHp(t) - t.hp);
        t.hp += amt;
        ev.push({ type: 'skillfx', skill: s, at: center, targets: targets.map((x) => x.id) });
        ev.push({ type: 'heal', unitId: t.id, amount: amt });
        ev.push({ type: 'log', text: `${t.name} heals ${amt} HP (${heal.expr}: [${heal.rolls.join(',')}])`, kind: 'heal' });
      }
      return ev;
    }

    // attacks
    const needsProjectile = !!s.projectile;
    if (s.kind === 'melee') ev.push({ type: 'melee', unitId: u.id, targetId: targets[0].id });
    else if (needsProjectile) ev.push({ type: 'projectile', unitId: u.id, from: u.pos, to: center, color: s.fxColor, fx: s.fx });
    else ev.push({ type: 'skillfx', skill: s, at: center, targets: targets.map((t) => t.id) });

    for (const t of targets) {
      // saving-throw skills: half or negate
      if (s.saveAbility) {
        const save = rollD20(abilityMod(t.abilities[s.saveAbility]));
        const success = save.total >= (s.saveDC ?? 12);
        ev.push({ type: 'save', unitId: t.id, success, total: save.total });
        ev.push({ type: 'log', text: `${t.name} ${s.saveAbility.toUpperCase()} save ${save.total} vs DC ${s.saveDC}: ${success ? 'SUCCESS' : 'FAIL'}`, kind: 'roll' });
        const dmg = rollDice(s.damageDice);
        let amount = dmg.total;
        if (s.id === 'sacred_flame' && success) amount = 0;
        else if (success) amount = Math.floor(amount / 2);
        if (!success && s.appliesCondition && !t.conditions.some((c) => c.id === s.appliesCondition)) {
          t.conditions.push({ id: s.appliesCondition, name: CONDITIONS[s.appliesCondition].name, roundsLeft: 2 });
          ev.push({ type: 'float', unitId: t.id, text: `❄ ${CONDITIONS[s.appliesCondition].name}`, cls: 'debuff' });
        }
        if (amount <= 0) {
          ev.push({ type: 'float', unitId: t.id, text: 'Resisted!', cls: 'miss' });
          continue;
        }
        this.applyDamage(ev, t, amount, s.damageType, false);
        continue;
      }
      // attack-roll skills
      // weapon attacks use the equipped weapon's dice; skill = the "move"
      const weapon = (s.kind === 'melee' || s.kind === 'ranged') ? u.equipment.weapon : undefined;
      const diceExpr = weapon?.damageDice ?? s.damageDice;
      const ench = weapon?.enchantId ? ENCHANTS[weapon.enchantId] : undefined;
      const blessed = u.conditions.some((c) => c.id === 'blessed');
      const keen = weapon ? effAtkBonus(u) : 0;
      const atk = rollD20(abilityMod(u.abilities[s.attackAbility]) + u.proficiency + keen, blessed ? '1d4' : '');
      const auto = s.id === 'magic_missile';
      const tgtAC = effAC(t);
      const surpriseCrit = this.surpriseRound && u.team === 'party' && this.surpriseHits.has(u.id) && !!diceExpr;
      if (surpriseCrit) this.surpriseHits.delete(u.id);
      const hit = auto || atk.crit || surpriseCrit || (!atk.fumble && atk.total >= tgtAC);
      const crit = !auto && (atk.crit || surpriseCrit);
      ev.push({
        type: 'log',
        text: auto
          ? `${s.name} strikes ${t.name} unerringly`
          : `Attack ${atk.roll}${fmtMod(atk.bonus)}${blessed ? `+${atk.extra}(bless)` : ''} = ${atk.total} vs AC ${tgtAC}: ${crit ? '✨CRITICAL' : hit ? 'HIT' : 'MISS'}`,
        kind: crit ? 'crit' : hit ? 'hit' : 'miss',
      });
      if (!hit) {
        ev.push({ type: 'float', unitId: t.id, text: 'Miss', cls: 'miss' });
        continue;
      }
      const dmg = rollDice(diceExpr);
      let amount = dmg.total;
      if (crit) amount += rollDice(diceExpr.replace(/[+-]\d+$/, '')).total; // double the dice
      this.applyDamage(ev, t, amount, s.damageType, crit);
      // enchantment rider: extra elemental damage + frost slow
      if (ench?.elemDice && t.alive) {
        const extra = rollDice(ench.elemDice);
        ev.push({ type: 'log', text: `${ench.prefix} ${weapon!.name} burns for +${extra.total} ${ench.elemType!} damage`, kind: 'hit' });
        this.applyDamage(ev, t, extra.total, ench.elemType!, false);
      }
      if (ench?.slowChance && t.alive && Math.random() < ench.slowChance && !t.conditions.some((c) => c.id === 'slowed')) {
        t.conditions.push({ id: 'slowed', name: CONDITIONS.slowed.name, roundsLeft: 2 });
        ev.push({ type: 'float', unitId: t.id, text: '❄ Slowed', cls: 'debuff' });
      }
    }
    ev.push(...this.checkEnd());
    return ev;
  }

  private applyDamage(ev: CombatEvent[], t: Unit, amount: number, kind: import('./types').DamageType, crit: boolean) {
    if (this.godMode && t.team === 'party') return;   // cheat: party takes no damage
    t.hp = Math.max(0, t.hp - amount);
    ev.push({ type: 'damage', unitId: t.id, amount, kind, crit });
    ev.push({ type: 'float', unitId: t.id, text: `${crit ? '💥' : ''}-${amount}`, cls: crit ? 'crit' : 'dmg' });
    ev.push({ type: 'log', text: `${t.name} takes ${amount} ${kind} damage (${t.hp}/${effMaxHp(t)} HP left)`, kind: crit ? 'crit' : 'hit' });
    if (t.hp <= 0 && t.alive) {
      t.alive = false;
      ev.push({ type: 'death', unitId: t.id });
      ev.push({ type: 'log', text: `☠ ${t.name} is slain!`, kind: 'death' });
      if (t.team === 'enemy') {
        ev.push(...this.awardXP(t));
        const src = t.bossGroup ? 'boss'
          : t.scheme.monster === 'skeleton' ? 'undead'
          : (t.scheme.monster === 'rat' || t.scheme.monster === 'bat') ? 'beast'
          : 'goblin';
        const drop = rollLootTable(src);
        if (drop.items.length || drop.gold) ev.push({ type: 'loot', items: drop.items, gold: drop.gold });
      }
      ev.push(...this.checkEnd());
    }
  }

  /** every living party member gains the slain enemy's xpValue; level up on thresholds */
  private awardXP(slain: Unit): CombatEvent[] {
    const ev: CombatEvent[] = [];
    const party = this.living('party');
    if (!party.length || !slain.xpValue) return ev;
    ev.push({ type: 'log', text: `The party gains ${slain.xpValue} XP.`, kind: 'system' });
    for (const p of party) {
      p.xp += slain.xpValue;
      while (p.level < MAX_LEVEL && p.xp >= (XP_THRESHOLDS[p.level] ?? Infinity)) {
        p.level++;
        p.maxHp += 6;
        p.hp = Math.min(effMaxHp(p), p.hp + 6);
        p.skillPoints += 1;
        ev.push({ type: 'levelup', unitId: p.id });
        ev.push({ type: 'log', text: `⬆ ${p.name} reaches level ${p.level}! (+6 max HP, +1 skill point)`, kind: 'system' });
      }
    }
    return ev;
  }

  /** drink a consumable (bonus action in combat; free in explore). Engine removes the item first. */
  useConsumable(u: Unit, item: Item, targetId: string): CombatEvent[] {
    const ev: CombatEvent[] = [];
    if (item.kind !== 'consumable' || !item.healDice) return ev;
    const t = this.byId(targetId);
    if (!t || !t.alive || t.team !== u.team) return [{ type: 'log', text: 'Invalid target.', kind: 'info' }];
    if (this.inCombat) {
      if (!u.hasBonus) return [{ type: 'log', text: 'No bonus action left', kind: 'info' }];
      u.hasBonus = false;
    }
    const heal = rollDice(item.healDice);
    const amt = Math.min(heal.total, effMaxHp(t) - t.hp);
    t.hp += amt;
    ev.push({ type: 'log', text: `${u.name} drinks ${item.icon} ${item.name}`, kind: 'info' });
    ev.push({ type: 'heal', unitId: t.id, amount: amt });
    ev.push({ type: 'log', text: `${t.name} heals ${amt} HP (${heal.expr}: [${heal.rolls.join(',')}])`, kind: 'heal' });
    return ev;
  }

  // ── enemy AI: one step per call (engine paces the calls) ──
  /** returns events for one AI action, or null when the unit is done */
  aiStep(): CombatEvent[] | null {
    const u = this.active;
    if (!u || u.team !== 'enemy' || !u.alive) return null;
    const foes = this.living('party');
    if (!foes.length) return null;

    // pick best usable skill against best target
    const usable = u.equippedSkills.map((id) => SKILLS[id]).filter((s) => !this.canUse(u, s));
    const inRange = (s: SkillDef) => foes.filter((f) => Combat.dist(u.pos, f.pos) <= Math.max(1, s.range));
    for (const s of usable) {
      const cands = inRange(s);
      if (!cands.length) continue;
      const target = cands.sort((a, b) => a.hp - b.hp)[0];
      return this.useSkill(u, s.id, target.id);
    }
    // approach nearest foe
    if (u.movementLeft > 0) {
      const nearest = foes.sort((a, b) => Combat.dist(u.pos, a.pos) - Combat.dist(u.pos, b.pos))[0];
      // find walkable tile adjacent-ish to target reachable within budget
      const reach = this.reachable(u, u.movementLeft);
      let best: GridPos[] | null = null;
      let bestD = Infinity;
      for (const [k, path] of reach) {
        if (!path.length) continue;
        const [x, z] = k.split(',').map(Number);
        const d = Combat.dist({ x, z }, nearest.pos);
        if (d < bestD) { bestD = d; best = path; }
      }
      if (best && best.length) {
        const dest = best[best.length - 1];
        u.movementLeft -= best.length;
        u.pos = { ...dest };
        return [{ type: 'move', unitId: u.id, path: best }];
      }
    }
    return null;
  }
}
