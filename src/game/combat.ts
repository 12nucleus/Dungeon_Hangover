// ─────────────────────────────────────────────────────────────
// Combat core — PURE LOGIC, no rendering. Every public method
// returns CombatEvent[]; engine.ts animates them in order.
// This separation is what makes the game LLM-extensible:
// rules live here, presentation lives in engine.ts.
// ─────────────────────────────────────────────────────────────
import type { CombatEvent, GridPos, SkillDef, Unit, GamePhase, DamageType } from './types';
import { CONDITIONS, SUMMON_TEMPLATES } from './skills';
import { skillById } from './skillLookup';
import { rollD20, rollDice, abilityMod, fmtMod } from './dice';
import { VoxelWorld } from './world';
import { ENCHANTS, rollLootTable, type Item } from './items';
import { effAC, effMove, effMaxHp, effAtkBonus, effPhysResist, hangoverPenalty, XP_THRESHOLDS, MAX_LEVEL } from './stats';
import { classPoolSkillIdsForLevel } from './classSkills';

/** damage-over-time by condition id (ticked at the start of the carrier's turn) */
const DOT_BY_ID: Record<string, { dice: string; type: DamageType }> = {
  burning: { dice: '1d6', type: 'fire' },
  poisoned: { dice: '1d4', type: 'poison' },
  bleeding: { dice: '1d4', type: 'piercing' },
  infected: { dice: '1', type: 'poison' },
  scalded: { dice: '1d4', type: 'fire' },
};

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

  private summonSeq = 0;

  /**
   * Place a fresh copy of `template` on the nearest free walkable tile to
   * `near` and join it to the fight (inserted right after the summoner in
   * initiative). Works outside combat too — the caller decides when to
   * `start()` the fight. The engine animates the summon event.
   */
  summon(template: Unit, near: GridPos, summonerId?: string): Unit {
    const clone: Unit = JSON.parse(JSON.stringify(template));
    clone.id = `summon_${this.summonSeq++}`;
    clone.alive = true;
    clone.hp = clone.maxHp;
    clone.dormant = false;
    clone.bossGroup = false;
    clone.conditions = [];
    clone.cooldowns = {};
    clone.hasAction = true;
    clone.hasBonus = true;
    clone.movementLeft = effMove(clone);
    // nearest free walkable tile to `near`
    let best: GridPos | null = null;
    let bestD = Infinity;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = near.x + dx, z = near.z + dz;
      if (!this.world.isWalkable(x, z) || this.occupied(x, z)) continue;
      const d = Math.abs(x - near.x) + Math.abs(z - near.z);
      if (d < bestD) { bestD = d; best = { x, z }; }
    }
    clone.pos = best ?? { ...near };
    this.units.push(clone);
    if (this.inCombat) {
      const idx = summonerId ? this.turnOrder.indexOf(summonerId) : -1;
      if (idx >= 0) this.turnOrder.splice(idx + 1, 0, clone.id);
      else this.turnOrder.push(clone.id);
    }
    return clone;
  }
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
    let partyIni: { total: number } | null = null;
    for (const u of this.units) {
      if (!u.alive || u.dormant) continue;
      const r = rollD20(abilityMod(u.abilities.dex));
      u.initiative = r.total + r.roll / 100; // tiebreak by raw roll
      ev.push({ type: 'log', text: `${u.name} rolls initiative ${r.roll}${fmtMod(abilityMod(u.abilities.dex))} = ${r.total}`, kind: 'roll' });
      if (u.team === 'party' && !partyIni) partyIni = r;
    }
    // one dice overlay for the party's opening roll
    if (partyIni) ev.push({ type: 'dice', die: 'd20', total: partyIni.total, reason: 'Initiative (DEX)' });
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

    // damage-over-time: applied before decrement so the condition still
    // deals its damage on the round it expires
    for (const c of [...u.conditions]) {
      const dot = c.dot ?? DOT_BY_ID[c.id];
      if (!dot) continue;
      const dmg = rollDice(dot.dice);
      u.hp = Math.max(0, u.hp - dmg.total);
      ev.push({ type: 'damage', unitId: u.id, amount: dmg.total, kind: dot.type, crit: false });
      ev.push({ type: 'float', unitId: u.id, text: `☠ -${dmg.total}`, cls: 'dmg' });
      ev.push({ type: 'log', text: `${u.name} suffers ${dmg.total} ${dot.type} damage (${c.name})`, kind: 'hit' });
      if (u.hp <= 0 && u.alive) ev.push(...this.onDeath(u));
      if (!u.alive) return ev;
    }

    for (const c of u.conditions) c.roundsLeft--;
    u.conditions = u.conditions.filter((c) => c.roundsLeft > 0);
    if (u.conditions.some((c) => c.id === 'surprised')) {
      u.conditions = u.conditions.filter((c) => c.id !== 'surprised');
      // strip all resources so the surprised unit can't act (enemies too)
      u.hasAction = false; u.hasBonus = false; u.movementLeft = 0;
      ev.push({ type: 'log', text: `${u.name} is surprised and skips their turn!`, kind: 'system' });
      ev.push({ type: 'turn', unitId: u.id, round: this.round });
      return ev;
    }
    // stunned: skips the turn entirely (like surprised)
    if (u.conditions.some((c) => c.id === 'stunned')) {
      u.conditions = u.conditions.filter((c) => c.id !== 'stunned');
      u.hasAction = false; u.hasBonus = false; u.movementLeft = 0;
      ev.push({ type: 'log', text: `${u.name} is stunned and skips their turn!`, kind: 'system' });
      ev.push({ type: 'turn', unitId: u.id, round: this.round });
      return ev;
    }
    // prone: the unit stands back up at the start of its turn
    if (u.conditions.some((c) => c.id === 'prone')) {
      u.conditions = u.conditions.filter((c) => c.id !== 'prone');
      ev.push({ type: 'log', text: `${u.name} clambers back to their feet.`, kind: 'system' });
    }
    u.hasAction = true;
    u.hasBonus = true;
    u.movementLeft = effMove(u);
    if (u.conditions.some((c) => c.id === 'slowed')) u.movementLeft = Math.ceil(u.movementLeft / 2);
    if (u.conditions.some((c) => c.id === 'rooted')) u.movementLeft = 0;
    // frenzy passive: below 50% HP the carrier acts twice this turn (the
    // extra action is granted in useSkill after the first action skill)
    const hasFrenzy = u.equippedSkills.includes('frenzy') || u.knownSkills.includes('frenzy');
    if (hasFrenzy && u.hp / effMaxHp(u) < 0.5) u.cooldowns['frenzy_extra'] = 1;
    else delete u.cooldowns['frenzy_extra'];
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

  /** end combat early without victory/defeat (Gribnab truce) */
  endEarly(): CombatEvent[] {
    this.inCombat = false;
    this.phase = 'explore';
    return [
      { type: 'log', text: '— ☮ The fight ends. —', kind: 'system' },
      { type: 'phase', phase: 'explore' },
    ];
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
    // slippery (soap splash / bubble bath): 50% to slip mid-step and end the move
    if (u.conditions.some((c) => c.id === 'slippery') && Math.random() < 0.5) {
      u.movementLeft = 0;
      u.conditions = u.conditions.filter((c) => c.id !== 'slippery');
      u.conditions.push({ id: 'prone', name: CONDITIONS.prone.name, roundsLeft: 1 });
      return [
        { type: 'log', text: `${u.name} slips on the soap and lands hard!`, kind: 'system' },
        { type: 'float', unitId: u.id, text: 'Prone!', cls: 'debuff' },
      ];
    }
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
    if (s.oncePerFight && (u.cooldowns[`once_${s.id}`] ?? 0) > 0) return 'Already used this fight.';
    return null;
  }

  /** targets = explicit tile (AoE) or unit id (single). Returns events or throws string reason. */
  useSkill(u: Unit, skillId: string, target: GridPos | string): CombatEvent[] {
    // the universal 'attack' skill takes its dice from the equipped weapon
    // (fists if unarmed) so a weaponless/utility build can always fight
    let s: SkillDef | undefined = skillById(skillId);
    if (skillId === 'attack') {
      const w = u.equipment?.weapon as { damageDice?: string; damageType?: string; icon?: string; name?: string } | undefined;
      s = {
        ...(s ?? { id: 'attack', name: 'Attack', icon: '⚔️', kind: 'melee', desc: 'A basic weapon attack.', range: 1, aoeRadius: 0, cost: 'action', cooldown: 0, attackAbility: 'str', damageDice: '1d4', damageType: 'bludgeoning', fxColor: 0xffe08a, fx: 'slash' }),
        damageDice: w?.damageDice ?? '1d2',
        damageType: (w?.damageType as DamageType) ?? 'bludgeoning',
        icon: w?.icon ?? '👊',
        name: w ? `Attack (${w.name ?? 'weapon'})` : 'Punch',
      } as SkillDef;
    }
    if (!s || (skillId !== 'attack' && !u.equippedSkills.includes(skillId))) return [];
    const deny = this.canUse(u, s);
    if (deny) return [{ type: 'log', text: deny, kind: 'info' }];

    // resolve targets
    let center: GridPos;
    let targets: Unit[] = [];
    if (s.id === 'duck_distraction') {
      // Gribnab's duck: EVERYONE is distracted (both teams)
      center = { ...u.pos };
      targets = this.units.filter((t) => t.alive);
    } else if (s.selfOnly) {
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

    const ev: CombatEvent[] = [];
    ev.push({ type: 'log', text: `${u.name} uses ${s.icon} ${s.name}`, kind: 'info' });

    // pay costs
    if (s.cost === 'action') {
      u.hasAction = false;
      // frenzy: the carrier's extra action is granted after its first action
      if (u.cooldowns['frenzy_extra']) {
        delete u.cooldowns['frenzy_extra'];
        u.hasAction = true;
        ev.push({ type: 'log', text: `${u.name} is FRENZIED — they act again!`, kind: 'system' });
      }
    }
    if (s.cost === 'bonus') u.hasBonus = false;
    if (s.cooldown > 0) u.cooldowns[s.id] = s.cooldown + 1; // +1 because it ticks at next turn start
    if (s.oncePerFight) u.cooldowns[`once_${s.id}`] = 999;

    // ── shove: a contested shove, resolved here (no attack roll) ──
    if (s.id === 'shove') {
      const t = targets[0];
      if (!t) return ev;
      const atk = rollD20(abilityMod(u.abilities.str));
      const dc = 10 + abilityMod(t.abilities.str);
      ev.push({ type: 'dice', die: 'd20', total: atk.total, reason: 'Shove (STR)' });
      ev.push({ type: 'log', text: `${u.name} shoves ${t.name}: STR ${atk.roll}${fmtMod(atk.bonus)} vs DC ${dc}`, kind: 'roll' });
      if (atk.total < dc) {
        ev.push({ type: 'float', unitId: t.id, text: 'Holds!', cls: 'miss' });
        ev.push({ type: 'log', text: `${t.name} holds their ground.`, kind: 'info' });
        ev.push(...this.checkEnd());
        return ev;
      }
      // displace 1 tile directly away from the attacker
      const dx = Math.sign(t.pos.x - u.pos.x), dz = Math.sign(t.pos.z - u.pos.z);
      const dest = { x: t.pos.x + dx, z: t.pos.z + dz };
      if (dx !== 0 || dz !== 0) {
        if (this.world.isWalkable(dest.x, dest.z) && !this.occupied(dest.x, dest.z) && Math.abs(this.world.heightAt(dest.x, dest.z) - this.world.heightAt(t.pos.x, t.pos.z)) <= 1) {
          t.pos = { ...dest };
          ev.push({ type: 'move', unitId: t.id, path: [dest] });
          ev.push({ type: 'float', unitId: t.id, text: '🫸 Shoved!', cls: 'dmg' });
          ev.push({ type: 'log', text: `${u.name} shoves ${t.name} one tile away!`, kind: 'hit' });
        } else {
          // slammed against a wall / into a crate
          const thud = rollDice('1d4');
          ev.push({ type: 'log', text: `${t.name} slams into the wall!`, kind: 'hit' });
          this.applyDamage(ev, t, thud.total, 'bludgeoning', false);
          if (t.alive && !t.conditions.some((x) => x.id === 'prone')) {
            t.conditions.push({ id: 'prone', name: CONDITIONS.prone.name, roundsLeft: 1 });
            ev.push({ type: 'float', unitId: t.id, text: 'Prone!', cls: 'debuff' });
          }
        }
      } else {
        ev.push({ type: 'log', text: `${t.name} is pushed back!`, kind: 'system' });
      }
      ev.push(...this.checkEnd());
      return ev;
    }

    // ── summons (boss minions): clone the template onto a free tile ──
    if (s.summonId) {
      const tpl = SUMMON_TEMPLATES[s.summonId];
      if (!tpl) return ev;
      const count = s.id === 'rat_summon' ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const unit = this.summon(tpl(), u.pos, u.id);
        ev.push({ type: 'summon', unit });
        ev.push({ type: 'log', text: `${unit.name} scurries in from the dark!`, kind: 'system' });
      }
      ev.push({ type: 'skillfx', skill: s, at: center, targets: this.living(u.team).map((t) => t.id) });
      ev.push(...this.checkEnd());
      return ev;
    }

    // ── bath_time: Gribnab hops back in the tub and heals ──
    if (s.id === 'bath_time') {
      if (u.bathPos) {
        u.pos = { ...u.bathPos };
        ev.push({ type: 'move', unitId: u.id, path: [{ ...u.bathPos }] });
      }
      const heal = rollDice(s.healDice!);
      const amt = Math.min(heal.total, effMaxHp(u) - u.hp);
      u.hp += amt;
      ev.push({ type: 'skillfx', skill: s, at: center, targets: [u.id] });
      ev.push({ type: 'heal', unitId: u.id, amount: amt });
      ev.push({ type: 'log', text: `${u.name} sinks back into the bath and heals ${amt} HP!`, kind: 'heal' });
      ev.push(...this.checkEnd());
      return ev;
    }

    // duck distraction: applies to every living unit, both teams
    if (s.id === 'duck_distraction') {
      for (const t of targets) {
        if (!t.conditions.some((c) => c.id === s.appliesCondition)) {
          t.conditions.push({ id: s.appliesCondition!, name: CONDITIONS[s.appliesCondition!].name, roundsLeft: s.appliesRounds ?? 1 });
        }
        ev.push({ type: 'float', unitId: t.id, text: '🦆 SQUEAK!', cls: 'debuff' });
      }
      ev.push({ type: 'skillfx', skill: s, at: center, targets: targets.map((t) => t.id) });
      ev.push({ type: 'log', text: 'The duck squeaks. Everyone flinches.', kind: 'system' });
      ev.push(...this.checkEnd());
      return ev;
    }

    // buffs (bless / arcane shield / bubble shield / sovereign sudds)
    if (s.kind === 'buff') {
      for (const ally of (s.selfOnly ? [u] : this.living(u.team))) {
        if (!ally.conditions.some((c) => c.id === s.appliesCondition)) {
          ally.conditions.push({ id: s.appliesCondition!, name: CONDITIONS[s.appliesCondition!].name, roundsLeft: s.appliesRounds ?? 3 });
        } else {
          ally.conditions.find((c) => c.id === s.appliesCondition)!.roundsLeft = s.appliesRounds ?? 3;
        }
        ev.push({ type: 'float', unitId: ally.id, text: `✨ ${CONDITIONS[s.appliesCondition!]?.name ?? 'Buff'}`, cls: 'buff' });
      }
      ev.push({ type: 'skillfx', skill: s, at: center, targets: this.living(u.team).map((t) => t.id) });
      ev.push(...this.checkEnd());
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
      // ── condition modifiers on the attack roll (floor 50) ──
      let atkMod = abilityMod(u.abilities[s.attackAbility]) + u.proficiency + keen;
      for (const c of u.conditions) {
        switch (c.id) {
          case 'nauseated': atkMod -= 1; break;
          case 'dazed': case 'disgusted': case 'distracted': case 'hallucinating': atkMod -= 2; break;
          case 'blinded': atkMod -= 5; break;
          case 'hungover': atkMod -= hangoverPenalty(u.level); break;
          case 'hungover_mild': atkMod -= 1; break;
          case 'well_fed': atkMod += 1; break;
        }
      }
      const atk = rollD20(atkMod, blessed ? '1d4' : '');
      const auto = s.id === 'magic_missile';
      // prone targets are easier to hit (+2)
      const tgtAC = effAC(t) - (t.conditions.some((x) => x.id === 'prone') ? 2 : 0);
      const surpriseCrit = this.surpriseRound && u.team === 'party' && this.surpriseHits.has(u.id) && !!diceExpr;
      if (surpriseCrit) this.surpriseHits.delete(u.id);
      const hit = auto || atk.crit || surpriseCrit || (!atk.fumble && atk.total >= tgtAC);
      const crit = !auto && (atk.crit || surpriseCrit);
      // dice overlay — every real attack roll (magic missile is unerring)
      if (!auto) {
        ev.push({ type: 'dice', die: 'd20', total: atk.total, reason: `${s.name} vs AC ${tgtAC}` });
      }
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
      // damage-dealt modifiers (intimidated / enraged / dwarven ale)
      if (u.conditions.some((x) => x.id === 'intimidated')) amount = Math.max(1, amount - 4);
      if (u.conditions.some((x) => x.id === 'enraged')) amount += 4;
      this.applyDamage(ev, t, amount, s.damageType, crit);
      // skill rider condition on a landed hit (soap splash → slippery, …)
      if (t.alive && s.appliesCondition && !t.conditions.some((x) => x.id === s.appliesCondition)) {
        t.conditions.push({ id: s.appliesCondition, name: CONDITIONS[s.appliesCondition].name, roundsLeft: s.appliesRounds ?? 2 });
        ev.push({ type: 'float', unitId: t.id, text: `❄ ${CONDITIONS[s.appliesCondition].name}`, cls: 'debuff' });
      }
      // weapon on-hit condition + fragile / fumble break / fumble drop
      if (t.alive && weapon?.onHitCondition && Math.random() < weapon.onHitCondition.chance) {
        t.conditions.push({ id: weapon.onHitCondition.id, name: CONDITIONS[weapon.onHitCondition.id]?.name ?? weapon.onHitCondition.id, roundsLeft: weapon.onHitCondition.rounds });
        ev.push({ type: 'float', unitId: t.id, text: `❄ ${CONDITIONS[weapon.onHitCondition.id]?.name ?? weapon.onHitCondition.id}`, cls: 'debuff' });
      }
      // monster on-hit rider (leech bleeding, baby-rat infected)
      if (t.alive && u.onHit && Math.random() < u.onHit.chance) {
        let applies = true;
        if (u.onHit.saveAbility) {
          const sv = rollD20(abilityMod(t.abilities[u.onHit.saveAbility]));
          applies = sv.total < (u.onHit.saveDC ?? 12);
          ev.push({ type: 'save', unitId: t.id, success: !applies, total: sv.total });
        }
        if (applies && !t.conditions.some((x) => x.id === u.onHit!.condition)) {
          t.conditions.push({ id: u.onHit!.condition, name: CONDITIONS[u.onHit!.condition]?.name ?? u.onHit!.condition, roundsLeft: u.onHit!.rounds });
          ev.push({ type: 'float', unitId: t.id, text: `❄ ${CONDITIONS[u.onHit!.condition]?.name ?? u.onHit!.condition}`, cls: 'debuff' });
        }
      }
      if (weapon?.fragile) {
        u.equipment.weapon = undefined;
        ev.push({ type: 'log', text: `The ${weapon.name} shatters on impact!`, kind: 'system' });
      }
      if (atk.fumble && weapon?.fumbleBreak && Math.random() < weapon.fumbleBreak) {
        u.equipment.weapon = undefined;
        ev.push({ type: 'log', text: `The ${weapon.name} snaps in your hands!`, kind: 'system' });
      }
      if (atk.fumble && weapon?.fumbleDrop && Math.random() < weapon.fumbleDrop) {
        const dropped = u.equipment.weapon;
        u.equipment.weapon = undefined;
        ev.push({ type: 'log', text: `You dropped the ${dropped?.name ?? 'weapon'}! It slides out of your soapy hands.`, kind: 'system' });
      }
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

  private applyDamage(ev: CombatEvent[], t: Unit, amount: number, kind: DamageType, crit: boolean) {
    if (this.godMode && t.team === 'party') return;   // cheat: party takes no damage
    // armor physResist (sturdy boots, pipe helmet, ribcage…) — physical only, min 1
    if (kind === 'slashing' || kind === 'piercing' || kind === 'bludgeoning') {
      const resist = effPhysResist(t);
      if (resist > 0) amount = Math.max(1, amount - resist);
    }
    t.hp = Math.max(0, t.hp - amount);
    t.lastDamageKind = kind;
    ev.push({ type: 'damage', unitId: t.id, amount, kind, crit });
    ev.push({ type: 'float', unitId: t.id, text: `${crit ? '💥' : ''}-${amount}`, cls: crit ? 'crit' : 'dmg' });
    ev.push({ type: 'log', text: `${t.name} takes ${amount} ${kind} damage (${t.hp}/${effMaxHp(t)} HP left)`, kind: crit ? 'crit' : 'hit' });
    if (t.hp <= 0 && t.alive) ev.push(...this.onDeath(t));
  }

  /** shared death pipeline: corpse flag, XP, loot, end-of-combat check */
  private onDeath(t: Unit): CombatEvent[] {
    const out: CombatEvent[] = [];
    if (!t.alive) return out;
    t.alive = false;
    out.push({ type: 'death', unitId: t.id });
    out.push({ type: 'log', text: `☠ ${t.name} is slain!`, kind: 'death' });
    if (t.team === 'enemy') {
      out.push(...this.awardXP(t));
      const src = t.bossGroup ? 'boss'
        : t.scheme.monster === 'skeleton' ? 'undead'
        : (t.scheme.monster === 'rat' || t.scheme.monster === 'bat') ? 'beast'
        : 'goblin';
      const drop = rollLootTable(src);
      if (drop.items.length || drop.gold) out.push({ type: 'loot', items: drop.items, gold: drop.gold });
    }
    out.push(...this.checkEnd());
    return out;
  }

  /** every living party member gains the slain enemy's xpValue; level up on thresholds */
  private awardXP(slain: Unit): CombatEvent[] {
    const ev: CombatEvent[] = [];
    const party = this.living('party');
    if (!party.length || !slain.xpValue) return ev;
    // the Hermit's Ring (+5% XP) multiplies gains for its wearer
    const ringBonus = (p: Unit) => {
      const ring = p.equipment.ring1 ?? p.equipment.ring2;
      return ring?._baseId === 'hermits_ring' ? 1.05 : 1;
    };
    const gained = Math.round(slain.xpValue * ringBonus(party[0]));
    ev.push({ type: 'log', text: `The party gains ${gained} XP.`, kind: 'system' });
    for (const p of party) {
      p.xp += Math.round(slain.xpValue * ringBonus(p));
      while (p.level < MAX_LEVEL && p.xp >= (XP_THRESHOLDS[p.level + 1] ?? Infinity)) {
        p.level++;
        // hydrate the class pool: skills the hero has now reached the level
        // for become known (tier-1 at Lv2, tier-2 at Lv3, tier-3+ at Lv4)
        for (const sid of classPoolSkillIdsForLevel(p.classes ?? [], p.level)) {
          if (!p.knownSkills.includes(sid)) p.knownSkills.push(sid);
        }
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
    if (item.kind !== 'consumable') return ev;
    const t = this.byId(targetId);
    if (!t || !t.alive || t.team !== u.team) return [{ type: 'log', text: 'Invalid target.', kind: 'info' }];
    if (this.inCombat) {
      if (!u.hasBonus) return [{ type: 'log', text: 'No bonus action left', kind: 'info' }];
      u.hasBonus = false;
    }
    ev.push({ type: 'log', text: `${u.name} uses ${item.icon} ${item.name}`, kind: 'info' });
    // heal — numeric expressions ('15', '99') heal that many; dice roll otherwise
    if (item.healDice && item.healDice !== '0') {
      const m = item.healDice.match(/^\d+$/);
      const total = m ? parseInt(m[0], 10) : rollDice(item.healDice).total;
      const amt = Math.min(total, effMaxHp(t) - t.hp);
      t.hp += amt;
      ev.push({ type: 'heal', unitId: t.id, amount: amt });
      ev.push({ type: 'log', text: `${t.name} heals ${amt} HP.`, kind: 'heal' });
    }
    // cleanses: strip every condition
    if (item.cleanses && t.conditions.length) {
      const stripped = t.conditions.map((c) => c.name).join(', ');
      t.conditions = [];
      ev.push({ type: 'log', text: `${t.name} is cleansed! (${stripped})`, kind: 'heal' });
      ev.push({ type: 'float', unitId: t.id, text: '✨ Cleansed', cls: 'buff' });
    }
    // chance condition on the drinker (moldy cheese, wine, sewer water…)
    if (item.consumeCondition && Math.random() < item.consumeCondition.chance) {
      const cc = item.consumeCondition;
      if (!t.conditions.some((x) => x.id === cc.id)) {
        t.conditions.push({ id: cc.id, name: CONDITIONS[cc.id]?.name ?? cc.id, roundsLeft: cc.rounds });
        ev.push({ type: 'float', unitId: t.id, text: `❄ ${CONDITIONS[cc.id]?.name ?? cc.id}`, cls: 'debuff' });
      }
    }
    // flat condition riders that always land (dwarven ale, bubble bath, duck)
    if (item._baseId === 'dwarven_ale') {
      if (!t.conditions.some((x) => x.id === 'enraged')) t.conditions.push({ id: 'enraged', name: CONDITIONS.enraged.name, roundsLeft: 1 });
      if (!t.conditions.some((x) => x.id === 'dazed')) t.conditions.push({ id: 'dazed', name: CONDITIONS.dazed.name, roundsLeft: 1 });
      ev.push({ type: 'log', text: `${t.name} feels a surge of dwarven courage (and regret).`, kind: 'system' });
    }
    if (item._baseId === 'bubble_bath') {
      if (!t.conditions.some((x) => x.id === 'slippery')) t.conditions.push({ id: 'slippery', name: CONDITIONS.slippery.name, roundsLeft: 2 });
      ev.push({ type: 'log', text: `${t.name} pours bubble bath at their feet. The floor gleams.`, kind: 'system' });
    }
    if (item._baseId === 'rubber_duck') {
      for (const foe of this.living('enemy')) {
        if (foe.alive && !foe.conditions.some((x) => x.id === 'distracted')) {
          foe.conditions.push({ id: 'distracted', name: CONDITIONS.distracted.name, roundsLeft: 1 });
        }
      }
      ev.push({ type: 'log', text: 'SQUEAK! The enemies flinch.', kind: 'system' });
    }
    ev.push(...this.checkEnd());
    return ev;
  }

  // ── enemy AI: one step per call (the 'turn' animator drives these) ──
  // Behaviors (M8): weak-target focus, AoE on clusters, ranged kiting,
  // low-HP retreat, no wasted movement, adaptation via last-hit memory.
  aiStep(): CombatEvent[] | null {
    const u = this.active;
    if (!u || u.team !== 'enemy' || !u.alive) return null;
    const foes = this.living('party');
    if (!foes.length) return null;

    const hasMelee = u.equippedSkills.some((id) => {
      const s = skillById(id);
      return s && (s.kind === 'melee' || (s.selfCentered && s.aoeRadius > 0));
    });
    const maxRange = u.equippedSkills.reduce((m, id) => {
      const s = skillById(id);
      return s ? Math.max(m, s.range) : m;
    }, 1);
    // keep a safe ranged distance when we only have ranged tools
    const wantsRange = !hasMelee && maxRange > 1;

    // ── 1. flee: below 30% HP (or a unit's fleesAtHp), back off to the
    // farthest safe reachable tile
    const hpPct = u.hp / effMaxHp(u);
    const shouldFlee = u.fleesAtHp !== undefined ? u.hp <= u.fleesAtHp : hpPct < 0.3;
    if (shouldFlee && u.movementLeft > 0) {
      const nearestFoe = foes.reduce((a, b) => Combat.dist(u.pos, a.pos) < Combat.dist(u.pos, b.pos) ? a : b);
      const reach = this.reachable(u, u.movementLeft);
      let best: GridPos[] | null = null; let bestD = -1;
      for (const [k, path] of reach) {
        if (!path.length) continue;
        const [x, z] = k.split(',').map(Number);
        const d = Combat.dist({ x, z }, nearestFoe.pos);
        if (d > bestD) { bestD = d; best = path; }
      }
      if (best && best.length) {
        const dest = best[best.length - 1];
        u.movementLeft -= best.length;
        u.pos = { ...dest };
        return [{ type: 'move', unitId: u.id, path: best }];
      }
    }

    // ── 2. act: pick the best skill for the situation ──
    // prefer a damaging skill that hits the most foes (AoE on clusters);
    // otherwise focus-fire the weakest living party member.
    const usable = u.equippedSkills
      .map((id) => skillById(id))
      .filter((s): s is SkillDef => {
        if (!s) return false;
        if (s.passive) return false;                       // passives are never cast
        if (this.canUse(u, s)) return false;               // cost/cooldown/once-per-fight
        const pct = u.hp / effMaxHp(u);
        if (s.hpBelowPct !== undefined && pct > s.hpBelowPct) return false;  // boss gates
        if (s.hpAbovePct !== undefined && pct < s.hpAbovePct) return false;
        return true;
      });

    // summon first when the gate is met (boss rats call for help at 75%)
    const summonSkill = usable.find((s) => s.summonId);
    if (summonSkill) {
      if (summonSkill.summonId === 'baby_rat') {
        const babies = this.units.filter((x) => x.alive && x.team === 'enemy' && x.name === 'Baby Rat').length;
        if (babies >= 4) { /* nest is full — fall through */ }
        else return this.useSkill(u, summonSkill.id, u.id);
      } else {
        return this.useSkill(u, summonSkill.id, u.id);
      }
    }

    // AoE: self-centered sweep hits the most foes; else find a center
    for (const s of usable) {
      if (s.selfCentered && s.aoeRadius > 0) {
        const hits = foes.filter((f) => Combat.dist(f.pos, u.pos) <= s.aoeRadius);
        if (hits.length >= 2) return this.useSkill(u, s.id, u.pos);
        if (hits.length === 1) return this.useSkill(u, s.id, u.pos);
      }
      if (s.aoeRadius > 0 && !s.selfCentered) {
        // find the best single center: max foes caught
        let bestC: GridPos | null = null; let bestN = 0;
        for (const f of foes) {
          if (Combat.dist(u.pos, f.pos) > s.range) continue;
          const n = foes.filter((t) => Combat.dist(t.pos, f.pos) <= s.aoeRadius).length;
          if (n > bestN) { bestN = n; bestC = { ...f.pos }; }
        }
        if (bestC && bestN >= 2) return this.useSkill(u, s.id, bestC);
      }
    }
    // single-target: prefer the weakest foe in range; if our ranged attack
    // has a cooldown, fall back to moving closer and biting.
    for (const s of usable) {
      if (s.selfCentered) continue;
      const inRange = foes.filter((f) => Combat.dist(u.pos, f.pos) <= Math.max(1, s.range));
      if (!inRange.length) continue;
      if (s.targetsAllies || s.selfOnly || s.kind === 'buff' || s.kind === 'heal') continue;
      const target = inRange.reduce((a, b) => a.hp <= b.hp ? a : b);
      return this.useSkill(u, s.id, target.id);
    }
    // buffs/heals: only when hurt or as a fallback so the turn isn't wasted
    for (const s of usable) {
      if (!(s.kind === 'buff' || s.kind === 'heal' || s.selfOnly || s.targetsAllies)) continue;
      if (s.kind === 'heal' && hpPct > 0.55) continue;
      return this.useSkill(u, s.id, s.selfOnly || s.allAllies ? u.id : this.living(u.team)[0]?.id ?? u.id);
    }

    // ── 3. move: close distance (or kite for ranged-only units) ──
    if (u.movementLeft > 0) {
      // slippery: 50% to slip and end the turn prone
      if (u.conditions.some((c) => c.id === 'slippery') && Math.random() < 0.5) {
        u.movementLeft = 0;
        u.conditions = u.conditions.filter((c) => c.id !== 'slippery');
        u.conditions.push({ id: 'prone', name: CONDITIONS.prone.name, roundsLeft: 1 });
        return [
          { type: 'log', text: `${u.name} slips on the soap and lands hard!`, kind: 'system' },
          { type: 'float', unitId: u.id, text: 'Prone!', cls: 'debuff' },
        ];
      }
      const nearest = foes.reduce((a, b) => Combat.dist(u.pos, a.pos) < Combat.dist(u.pos, b.pos) ? a : b);
      const reach = this.reachable(u, u.movementLeft);
      let best: GridPos[] | null = null; let bestScore = -Infinity;
      for (const [k, path] of reach) {
        if (!path.length) continue;
        const [x, z] = k.split(',').map(Number);
        const d = Combat.dist({ x, z }, nearest.pos);
        // melee: get as close as possible; ranged: hold at maxRange
        const ideal = wantsRange ? Math.max(2, maxRange - 1) : 1;
        const score = wantsRange ? -Math.abs(d - ideal) : -d;
        if (score > bestScore) { bestScore = score; best = path; }
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
