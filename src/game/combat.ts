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
  /** provided by the engine: world rect (usually the unit's spawn room +
   *  margin) that enemy AI movement may not leave. Assigned at start() so
   *  every enemy carries its leash for the whole fight. */
  leashFor: ((u: Unit) => { x0: number; z0: number; x1: number; z1: number } | null) | null = null;
  constructor(world: VoxelWorld) { this.world = world; }

  get active(): Unit | null {
    if (!this.inCombat || !this.turnOrder.length) return null;
    return this.units.find((u) => u.id === this.turnOrder[this.activeIdx]) ?? null;
  }
  byId(id: string) { return this.units.find((u) => u.id === id) ?? null; }
  living(team: 'party' | 'enemy') { return this.units.filter((u) => u.alive && u.team === team); }

  private summonSeq = 0;

  /** BG3-style turn phase for the party's current turn:
   *  'walk' → 'action' → 'bonus' → end turn. Movement is usable in any phase;
   *  using an action skill advances to 'bonus', a bonus skill back to 'walk'. */
  turnMode: 'walk' | 'action' | 'bonus' = 'walk';

  /** unit ids of enemies that DIED during the current fight (most-recent last) —
   *  the raise-dead skills (reanimate / undead_army) resurrect from here */
  private corpses: string[] = [];

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
    // party-size cap: the player may field at most 6 (Greg + companions + summons)
    if (clone.team === 'party' && this.living('party').length >= 6) {
      return null as unknown as Unit;
    }
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
    if (this.inCombat) return []; // never merge a second fight into a live one
    // Deferred bosses only ever fight from their own arena: if one is somehow
    // still awake (aborted parley, a boss fight the party survived by leaving),
    // it must NOT be swept into a fight across the map. Re-dormant any
    // bossGroup unit far from the party — its cutscene wakes it again when
    // the party actually arrives.
    const party0 = this.living('party');
    if (party0.length) {
      for (const u of this.units) {
        if (u.team !== 'enemy' || !u.alive || !u.bossGroup || u.dormant) continue;
        if (!party0.some((p) => Combat.dist(p.pos, u.pos) <= 40)) u.dormant = true;
      }
    }
    this.surpriseRound = false;
    this.surpriseHits.clear();
    this.corpses = [];
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
    // BG3-style GROUPED phases: the whole party acts first (in initiative
    // order), then every enemy. The rotation wraps once per full round — the
    // only index wrap is enemy→party, so endTurn's `idx <= activeIdx` round
    // counter already ticks exactly once per phase cycle.
    const fighters = this.units.filter((u) => u.alive && !u.dormant);
    const byIni = (a: Unit, b: Unit) => b.initiative - a.initiative;
    // leash every enemy to its home room before the rotation starts: chase
    // and flee candidates in aiStep are filtered against it, so a mob group
    // can never pour into another room while a fight is live.
    for (const u of fighters) {
      if (u.team === 'enemy' && !u.leash) u.leash = this.leashFor?.(u) ?? undefined;
    }
    this.turnOrder = [
      ...fighters.filter((u) => u.team === 'party').sort(byIni),
      ...fighters.filter((u) => u.team === 'enemy').sort(byIni),
    ].map((u) => u.id);
    this.activeIdx = 0;
    ev.push({ type: 'log', text: '— ⚔ COMBAT BEGINS —', kind: 'system' });
    ev.push({ type: 'phase', phase: 'combat' });
    // Nothing to fight (e.g. a boss cutscene/aggro re-fires after the boss is
    // already dead, or the party is already down): end the fight immediately
    // instead of spinning the rotation on an empty board forever.
    ev.push(...this.checkEnd());
    if (!this.inCombat) return ev;
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
    // BG3-style phase progression starts at 'walk' on the party's turns
    if (u.team === 'party') this.turnMode = 'walk';
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
      if (!u.alive) {
        // died to DOT at turn start: still emit the turn event so the pump
        // auto-advances the rotation (the 'turn' handler skips dead units).
        ev.push({ type: 'turn', unitId: u.id, round: this.round });
        return ev;
      }
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
    // charmed: entranced — the unit skips its turn this round
    if (u.conditions.some((c) => c.id === 'charmed')) {
      u.hasAction = false; u.hasBonus = false; u.movementLeft = 0;
      ev.push({ type: 'log', text: `${u.name} is charmed — they gaze in wonder and do nothing.`, kind: 'system' });
      ev.push({ type: 'turn', unitId: u.id, round: this.round });
      return ev;
    }
    // prone: the unit stands back up at the start of its turn
    if (u.conditions.some((c) => c.id === 'prone')) {
      u.conditions = u.conditions.filter((c) => c.id !== 'prone');
    }
    // turnsLeft: terrain summons (totem / door_wall) fade when their
    // lifetime expires at their turn start. The unit dies (non-looting)
    // and the rotation advances past it.
    if (u.turnsLeft !== undefined) {
      u.turnsLeft -= 1;
      if (u.turnsLeft <= 0) {
        u.alive = false;
        ev.push({ type: 'log', text: `${u.name} fades away.`, kind: 'system' });
        ev.push({ type: 'death', unitId: u.id });
        ev.push({ type: 'turn', unitId: u.id, round: this.round });
        return ev;
      }
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
    // idempotent: the death chain calls checkEnd twice (onDeath + the
    // trailing call in useSkill) — only the first call may emit results.
    if (!this.inCombat) return [];
    const ev: CombatEvent[] = [];
    const party = this.living('party').length, foes = this.activeEnemies().length;
    if (party === 0 || foes === 0) {
      this.inCombat = false;
      if (foes === 0) {
        // Encounter cleared. The dungeon is a series of encounters, so we hand
        // control back to exploration; final victory is driven by the engine
        // (looting the golden chest). Per-kill loot has already dropped.
        // Alive stragglers (a reassembled bone rat, a surviving summon) must
        // re-dormant/fade here or they get swept into the NEXT fight by
        // combat.start(), silently merging two rooms' worth of enemies.
        // bossGroup units are deferred bosses — never touch them.
        for (const u of this.units) {
          if (u.team !== 'enemy' || !u.alive || u.bossGroup) continue;
          if (u.groupId) u.dormant = true;
          else u.alive = false; // summoned minions fade on victory
        }
        this.phase = 'explore';
        ev.push({ type: 'log', text: '— ✓ Area secured. —', kind: 'system' });
        ev.push({ type: 'phase', phase: 'explore' });
      } else {
        // TPK: surviving enemies retreat to their rooms (re-dormant) so the
        // player can retry the encounter — and so they can never leak into a
        // LATER fight via the next combat.start() (which sweeps up every
        // alive non-dormant enemy). Summoned minions fade with the defeat.
        // bossGroup units are deferred bosses — never touched.
        for (const u of this.units) {
          if (u.team !== 'enemy' || u.bossGroup) continue;
          if (u.groupId) u.dormant = true;
          else u.alive = false; // summoned minions fade on defeat
        }
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
    const from = { ...u.pos };
    u.movementLeft -= path.length;
    u.pos = { ...tile };
    const ev: CombatEvent[] = [{ type: 'move', unitId: u.id, path }];
    // BG3 Reaction: an adjacent foe lashes out as this unit leaves its reach
    ev.push(...this.provokedAttacks(u, from, tile));
    return ev;
  }

  /** BG3 Reaction / opportunity attack. When `mover` steps out of the reach of
   *  a living enemy that was adjacent to its start tile, that enemy takes a
   *  free melee strike (once per such enemy). Returns the events. */
  provokedAttacks(mover: Unit, from: GridPos, to: GridPos): CombatEvent[] {
    const ev: CombatEvent[] = [];
    const touched = new Set<string>();
    for (const foe of this.units) {
      if (!foe.alive || foe.team === mover.team || foe.bossGroup) continue;
      if (touched.has(foe.id)) continue;
      if (Combat.dist(from, foe.pos) <= 1.5 && Combat.dist(to, foe.pos) > 1.5) {
        touched.add(foe.id);
        ev.push(...this.reactionAttack(foe, mover));
      }
    }
    return ev;
  }

  /** a single free melee strike by `att` against `tgt` (leaving reach). */
  private reactionAttack(att: Unit, tgt: Unit): CombatEvent[] {
    const ev: CombatEvent[] = [];
    const wpn = att.equipment?.weapon;
    const dice = wpn?.damageDice ?? att.knownSkills.map((id) => skillById(id)).find((s) => s && s.damageDice)?.damageDice;
    if (!dice) return [];
    const bonus = abilityMod(att.abilities.str) + att.proficiency;
    const atk = rollD20(bonus);
    const tgtAC = effAC(tgt);
    const hit = atk.crit || (!atk.fumble && atk.total >= tgtAC);
    ev.push({
      type: 'log',
      text: `⚔ ${att.name} lashes out as ${tgt.name} moves away: ${atk.roll}${fmtMod(bonus)} vs AC ${tgtAC}: ${hit ? '✨CRIT' : hit ? 'HIT' : 'MISS'}`,
      kind: hit ? 'crit' : 'hit',
    });
    if (hit) {
      const amt = rollDice(dice).total;
      this.applyDamage(ev, tgt, amt, wpn?.damageType ?? 'slashing', atk.crit);
    }
    return ev;
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
    // BG3 phase advance: action → bonus (if any left), bonus → back to walk
    if (u.team === 'party' && (s.cost === 'action' || s.cost === 'bonus')) {
      this.turnMode = s.cost === 'bonus' ? 'walk' : (u.hasBonus ? 'bonus' : 'walk');
    }

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
      // hostile AoE: only enemies are targets (fireball also nicks the caster).
      // (was a precedence bug — `A || (B ? C : D)` kept every ally.)
      if (!s.targetsAllies) targets = targets.filter((t) => t.team !== u.team || (s.id === 'fireball' && t.id === u.id));
    } else if (typeof target === 'string') {
      const t = this.byId(target);
      if (!t || !t.alive) return [{ type: 'log', text: 'Invalid target.', kind: 'info' }];
      if (Combat.dist(u.pos, t.pos) > s.range) return [{ type: 'log', text: 'Target out of range.', kind: 'info' }];
      center = { ...t.pos };
      targets = [t];
      if (s.targetsAllies && t.team !== u.team) return [{ type: 'log', text: 'Must target an ally.', kind: 'info' }];
      if (!s.targetsAllies && t.team !== u.team && t.conditions.some((c) => c.id === 'evading')) return [{ type: 'log', text: `${t.name} is Evading — they cannot be targeted!`, kind: 'info' }];
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

    // buffs & summons — the whole family must never crash on a missing
    // appliesCondition (bless / arcane shield / reanimate / stone skin / …)
    if (s.kind === 'buff') {
    // ── raise-dead (Grave Caller / Mortician): rebuild this fight's fallen
    //    enemies as skeletons on the party's side ──
    if (s.raiseCorpses) {
      const targets = s.raiseCorpses === 'all'
        ? [...this.corpses]
        : (this.corpses.length ? [this.corpses[this.corpses.length - 1]] : []);
      if (!targets.length) {
        ev.push({ type: 'log', text: 'No corpses to raise — the dead have moved on.', kind: 'info' });
        return ev;
      }
      const raised: Unit[] = [];
      let refused = false;
      for (const cid of targets) {
        const corpse = this.byId(cid);
        if (!corpse) continue;
        const skel: Unit = JSON.parse(JSON.stringify(corpse));
        skel.team = 'party';
        skel.scheme = { ...skel.scheme, monster: 'skeleton', skin: 0xd8d2be, cloth: 0x3a2f28, accent: 0x9a9a9a, hair: 0x8fe3ff, bulk: 0.95 };
        skel.knownSkills = skel.knownSkills.filter((id) => id !== 'bone_strike').concat('bone_strike');
        skel.equipment = {};
        skel.name = 'Risen Skeleton';
        const unit = this.summon(skel, u.pos, u.id);
        if (!unit) { refused = true; continue; }   // party already at cap (max 6)
        raised.push(unit);
        ev.push({ type: 'summon', unit });
      }
      if (refused) ev.push({ type: 'log', text: 'The dead stir — but the party is at full strength (max 6).', kind: 'info' });
      ev.push({ type: 'log', text: `${raised.length} skeleton${raised.length > 1 ? 's' : ''} ${raised.length > 1 ? 'rise' : 'rises'} to serve!`, kind: 'system' });
      ev.push({ type: 'skillfx', skill: s, at: center, targets: raised.map((r) => r.id) });
      ev.push(...this.checkEnd());
      return ev;
    }

    // ── minion summons (spirits, beasts, ghouls, champions) ──
    if (s.summonId) {
      const tpl = SUMMON_TEMPLATES[s.summonId];
      if (!tpl) {
        ev.push({ type: 'log', text: `${s.name} fizzles — no minion template.`, kind: 'info' });
        return ev;
      }
      const count = s.summonCount ?? 1;
      let refused = false;
      for (let i = 0; i < count; i++) {
        const unit = this.summon(tpl(), u.pos, u.id);
        if (!unit) { refused = true; break; }   // party at cap (max 6)
        ev.push({ type: 'summon', unit });
        ev.push({ type: 'log', text: `${unit.name} answers the call!`, kind: 'system' });
      }
      if (refused) ev.push({ type: 'log', text: 'The call echoes, but the party is at full strength (max 6).', kind: 'info' });
      ev.push({ type: 'skillfx', skill: s, at: center, targets: this.living(u.team).map((t) => t.id) });
      ev.push(...this.checkEnd());
      return ev;
    }

    // condition buffs (bless / arcane shield / bubble shield / sovereign sudds)
    // — buff-kind only. Ranged skills with a rider condition (charm,
    // bleed, poison) flow to the attack-roll block so the hit/saves play.
    if (s.appliesCondition && s.kind === 'buff') {
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
    // ── utility skills (buff-kind, no raiseCorpses/summonId/appliesCondition):
    //    teleportation, movement, extra-action, intel, cleansing, toast,
    //    vow-bonding — none of them do HP damage so they never roll attack.
    const HARMFUL = new Set(['rooted', 'stunned', 'surprised', 'prone', 'bleeding', 'burning', 'poisoned', 'slowed', 'blind', 'hexed', 'cursed', 'corroding', 'wraith_form', 'dire_form', 'eldritch_form', 'lich_form', 'shadow_form', 'paralytic', 'frozen', 'distracted', 'debuff', 'panicked', 'frightened', 'asleep', 'marked', 'bleeding', 'infected', 'taunted', 'charmed']);
    const clean = (unit: Unit) => { unit.conditions = unit.conditions.filter((c) => !HARMFUL.has(c.id)); };
    const addCond = (unit: Unit, id: string, rounds: number) => {
      const cond = CONDITIONS[id];
      if (!cond) return;
      const existing = unit.conditions.find((c) => c.id === id);
      if (existing) existing.roundsLeft = Math.max(existing.roundsLeft ?? 0, rounds);
      else unit.conditions.push({ id, name: cond.name, roundsLeft: rounds });
      ev.push({ type: 'float', unitId: unit.id, text: `✨ ${cond.name}`, cls: 'buff' });
    };
    const giveExtra = (unit: Unit, n: number) => { unit.cooldowns['extra_action'] = (unit.cooldowns['extra_action'] ?? 0) + n; };
    switch (s.id) {
      // teleport + guaranteed-crit on next attack
      case 'shadow_step': {
        const tx = targets[0]?.pos ?? u.pos; u.pos = { ...tx }; u.sneak = true;
        ev.push({ type: 'log', text: `${u.name} vanishes into shadow — next attack is a guaranteed crit!`, kind: 'crit' });
        ev.push({ type: 'float', unitId: u.id, text: '🌑 Sneak', cls: 'buff' });
        break;
      }
      // self/ally movement refund (disengage, seating_shuffle)
      case 'disengage': u.movementLeft = (u.movementLeft ?? 0) + 3; ev.push({ type: 'log', text: `${u.name} slips away — 3 bonus movement.`, kind: 'system' }); ev.push({ type: 'float', unitId: u.id, text: '💨 +3 move', cls: 'buff' }); break;
      case 'seating_shuffle': for (const a of this.living(u.team)) { a.movementLeft = (a.movementLeft ?? 0) + 3; } ev.push({ type: 'log', text: 'The seating shifts — everyone gains 3 movement!', kind: 'system' }); break;
      // self/ally extra-action (scat, mise, jitter, encore, the_taste, toast)
      case 'scat': case 'mise': giveExtra(u, 1); ev.push({ type: 'log', text: `${u.name} ad-libs — +1 bonus action!`, kind: 'system' }); ev.push({ type: 'float', unitId: u.id, text: '⚡ +1 act', cls: 'buff' }); break;
      case 'jitter': giveExtra(u, 2); ev.push({ type: 'log', text: `${u.name} jitters — +2 bonus actions from the caffeine!`, kind: 'system' }); ev.push({ type: 'float', unitId: u.id, text: '⚡ +2 act', cls: 'buff' }); break;
      case 'encore': { const a = targets[0]; giveExtra(a, 1); ev.push({ type: 'log', text: `Encore! ${a.name} gains +1 action next turn.`, kind: 'system' }); ev.push({ type: 'float', unitId: a.id, text: '⚡ +1 act', cls: 'buff' }); break; }
      case 'the_taste': giveExtra(u, 1); addCond(u, 'inspired', 2); ev.push({ type: 'log', text: `${u.name} has the taste — +1 action and Inspired!`, kind: 'system' }); break;
      case 'toast': case 'the_toast': {
        for (const a of this.living(u.team)) { const h = Math.floor(effMaxHp(a) * 0.1); a.hp = Math.min(effMaxHp(a), a.hp + h); giveExtra(a, 1); }
        ev.push({ type: 'log', text: 'A toast! The party heals and gains +1 action.', kind: 'heal' }); break;
      }
      // cleanse + defensive riders (whitening, form_36b, palate_cleanser)
      case 'whitening': case 'form_36b': clean(u); ev.push({ type: 'log', text: `${u.name} is cleansed of ailments.`, kind: 'heal' }); ev.push({ type: 'float', unitId: u.id, text: '✨ Cleanse', cls: 'buff' }); break;
      case 'palate_cleanser': clean(u); addCond(u, 'fortified', 2); ev.push({ type: 'log', text: `${u.name} rinses the palate — cleansed and Fortified!`, kind: 'heal' }); break;
      // intel (xray grants sneak on the chosen enemy; spirit_sight/scout are passive-flavored侦察)
      case 'xray': { const t = targets[0]; if (t) ev.push({ type: 'log', text: `${t.name}: ${t.hp}/${effMaxHp(t)} HP, AC ${effAC(t)}, ${t.conditions.map((c) => c.name).join(', ') || 'no conditions'}.`, kind: 'info' }); u.sneak = true; ev.push({ type: 'float', unitId: u.id, text: '🎯 Identified + Sneak', cls: 'buff' }); break; }
      case 'spirit_sight': case 'scout': { const foes = this.living(u.team === 'party' ? 'enemy' : 'party'); ev.push({ type: 'log', text: `Spirits whisper — ${foes.length} foes: ${foes.map((f) => `${f.name} ${f.hp}/${effMaxHp(f)}hp`).join('; ')}.`, kind: 'info' }); ev.push({ type: 'float', unitId: u.id, text: '👁 Sighted', cls: 'buff' }); break; }
      // self-heal snack (appraisal little bite)
      case 'appraisal': { const h = Math.min(rollDice('2d4').total, effMaxHp(u) - u.hp); u.hp += h; ev.push({ type: 'log', text: `${u.name} appraises the snacks — a quick bite heals ${h}.`, kind: 'heal' }); ev.push({ type: 'float', unitId: u.id, text: `+${h}`, cls: 'heal' }); break; }
      // ally shielding + inspiration (rehearsal, vow)
      case 'rehearsal': { const a = targets[0]; addCond(a, 'shielded', 2); addCond(a, 'inspired', 2); ev.push({ type: 'log', text: `Rehearsal pays off — ${a.name} is Shielded and Inspired!`, kind: 'system' }); break; }
      case 'vow': { const a = targets[0]; addCond(u, 'shielded', 1); addCond(a, 'shielded', 1); u.vowPartner = a.id; a.vowPartner = u.id; ev.push({ type: 'log', text: `${u.name} and ${a.name} swear a vow — their wounds are shared.`, kind: 'system' }); break; }
      case 'venom_blade': addCond(u, 'inspired', 3); ev.push({type:'log', text:`${u.name}'s blade gleams with venom.`, kind:'system'}); break;
      case 'shadow_cloak': u.sneak = true; addCond(u, 'evading', 2); ev.push({type:'log', text:`${u.name} vanishes — Evading + sneaking.`, kind:'crit'}); break;
      case 'infusion': u.cooldowns['infusion_next'] = 1; ev.push({type:'log', text:'Next consumable is guaranteed success.', kind:'system'}); break;
      case 'power_ballad_2': for (const a of this.living(u.team)) { addCond(a, 'shielded', 3); addCond(a, 'inspired', 3); } ev.push({type:'log', text:'Ballad of Crash-Out — Shielded + Inspired all!', kind:'system'}); break;
      case 'power_crescendo': addCond(u, 'inspired', 3); ev.push({type:'log', text:`${u.name}'s song crescendoes — Inspired.`, kind:'system'}); break;
      case 'encore_all': for (const a of this.living(u.team)) giveExtra(a, 1); ev.push({type:'log', text:'Encore for everyone — +1 bonus action!', kind:'system'}); break;
      case 'spontaneous': { const pool = ['inspired','shielded','fortified','enraged']; const id = pool[Math.floor(Math.random()*pool.length)]; for (const a of this.living(u.team)) addCond(a, id, 3); ev.push({type:'log', text:`A spontaneous ${CONDITIONS[id].name} sweeps the party!`, kind:'system'}); break; }
      case 'full_coordination': for (const a of this.living(u.team)) giveExtra(a, 1); ev.push({type:'log', text:'Full coordination — +1 action all.', kind:'system'}); break;
      case 'perfect_rehearsal': for (const a of this.living(u.team)) giveExtra(a, 2); ev.push({type:'log', text:'Perfect rehearsal — +2 actions all!', kind:'system'}); break;
      case 'reception': for (const a of this.living(u.team)) giveExtra(a, 3); ev.push({type:'log', text:'The reception — +3 AP all!', kind:'system'}); break;
      case 'triple_espresso': giveExtra(u, 3); ev.push({type:'log', text:`${u.name} downs 3 espressos — +3 actions!`, kind:'system'}); ev.push({type:'float', unitId: u.id, text:'⚡+3', cls:'buff'}); break;
      case 'refill': { const a = targets[0]; if (a) { a.cooldowns = {}; ev.push({type:'log', text:`${a.name}'s cooldowns refreshed.`, kind:'system'}); ev.push({type:'float', unitId: a.id, text:'↻', cls:'buff'}); } break; }
      case 'encore_ultimate': for (const a of this.living(u.team)) { const onc = Object.keys(a.cooldowns).filter(k => k.startsWith('once_')); a.cooldowns = {}; onc.forEach(k => a.cooldowns[k] = 999); } ev.push({type:'log', text:'Encore Ult — all ally cooldowns reset!', kind:'system'}); break;
      case 'time_warp': giveExtra(u, 2); u.movementLeft = (u.movementLeft ?? 0) + effMove(u); ev.push({type:'log', text:`${u.name} warps time — +2 act + move refund!`, kind:'crit'}); break;
      case 'capstone_no_closing_time': giveExtra(u, 99); u.cooldowns['once_capstone'] = 999; ev.push({type:'log', text:'🏆 NO CLOSING TIME — unlimited turns!', kind:'crit'}); break;
      case 'crowd_surf': u.movementLeft = (u.movementLeft ?? 0) + effMove(u); for (const a of this.living(u.team)) addCond(a, 'inspired', 2); for (const t of this.living(u.team==='party'?'enemy':'party')) if (Combat.dist(t.pos, u.pos) <= 2) this.applyDamage(ev, t, rollDice('3d6').total, 'force', false); ev.push({type:'log', text:`${u.name} crowd-surfs!`, kind:'system'}); break;
      case 'final_song': for (const a of this.living(u.team)) { const h = Math.min(rollDice('6d8').total, effMaxHp(a) - a.hp); a.hp += h; addCond(a, 'inspired', 3); ev.push({type:'float', unitId: a.id, text:`+${h}`, cls:'heal'}); } ev.push({type:'log', text:'The Final Song — heal + Inspired all!', kind:'heal'}); break;
      case 'the_ultimate_plan': for (const a of this.living(u.team)) { const h = Math.min(rollDice('8d8').total, effMaxHp(a) - a.hp); a.hp += h; giveExtra(a, 1); ev.push({type:'float', unitId: a.id, text:`+${h}`, cls:'heal'}); } ev.push({type:'log', text:'Ultimate Plan — heal + action all!', kind:'heal'}); break;
      case 'banquet': for (const a of this.living(u.team)) { const h = Math.min(rollDice('6d8').total, effMaxHp(a) - a.hp); a.hp += h; giveExtra(a, 2); ev.push({type:'float', unitId: a.id, text:`+${h}`, cls:'heal'}); } ev.push({type:'log', text:'A banquet — heal + +2 actions all!', kind:'heal'}); break;
      case 'mega_banquet': for (const a of this.living(u.team)) { const h = Math.min(rollDice('8d8').total, effMaxHp(a) - a.hp); a.hp += h; addCond(a, 'fortified', 3); ev.push({type:'float', unitId: a.id, text:`+${h}`, cls:'heal'}); } ev.push({type:'log', text:'Mega banquet — heal + Fortified all!', kind:'heal'}); break;
      case 'the_herd': for (const t of this.living(u.team==='party'?'enemy':'party')) this.applyDamage(ev, t, rollDice('4d6').total, 'bludgeoning', false); ev.push({type:'log', text:'🐂 Stampede!', kind:'crit'}); break;
      case 'security': for (const t of this.living(u.team==='party'?'enemy':'party')) this.applyDamage(ev, t, rollDice('2d6').total, 'bludgeoning', false); ev.push({type:'log', text:'A bouncer tosses the room!', kind:'system'}); break;
      case 'capital_gains': addCond(u, 'enraged', 3); ev.push({type:'log', text:'Capital gains — Enraged!', kind:'system'}); break;
      case 'amortize': { const t = targets[0]; if (t) addCond(t, 'bleeding', 3); ev.push({type:'log', text:`${t?.name ?? 'Target'} amortizes — Bleeding!`, kind:'system'}); break; }
      case 'avatar': addCond(u, 'enraged', 3); addCond(u, 'lich_form', 3); ev.push({type:'log', text:`${u.name} ascends to Avatar form!`, kind:'crit'}); break;
      case 'plumbers_rage': addCond(u, 'crash_out', 3); addCond(u, 'armored', 3); ev.push({type:'log', text:`${u.name} plummets into rage — Crash Out + Armored!`, kind:'crit'}); break;
      case 'the_toast_2': for (const a of this.living(u.team)) { addCond(a, 'fortified', 3); addCond(a, 'enraged', 3); } ev.push({type:'log', text:'The Grand Toast — Fortified + Enraged all!', kind:'system'}); break;
      case 'the_vows': for (const a of this.living(u.team)) addCond(a, 'shielded', 99); ev.push({type:'log', text:'The Eternal Vows — party Shielded indefinitely!', kind:'system'}); break;
      case 'editorial_2': for (const a of this.living(u.team)) addCond(a, 'enraged', 3); ev.push({type:'log', text:'A scathing editorial — Enraged all!', kind:'system'}); break;
      case 'royal_wine': { const h = Math.min(rollDice('8d8').total, effMaxHp(u) - u.hp); u.hp += h; addCond(u, 'enraged', 3); ev.push({type:'float', unitId: u.id, text:`+${h}`, cls:'heal'}); ev.push({type:'log', text:`${u.name} downs royal wine — heal + Enraged!`, kind:'heal'}); break; }
      case 'revaluation': { const h = Math.min(rollDice('6d8').total, effMaxHp(u) - u.hp); u.hp += h; addCond(u, 'enraged', 3); ev.push({type:'float', unitId: u.id, text:`+${h}`, cls:'heal'}); ev.push({type:'log', text:`${u.name} revalues — heal + Enraged!`, kind:'heal'}); break; }
      case 'solder': { const h = Math.min(rollDice('3d8').total, effMaxHp(u) - u.hp); u.hp += h; ev.push({type:'float', unitId: u.id, text:`+${h}`, cls:'heal'}); ev.push({type:'log', text:`${u.name} solders wounds — +${h} HP.`, kind:'heal'}); break; }
      case 'souffle': { const a = targets[0]; if (a) { const h = Math.min(rollDice('4d8').total, effMaxHp(a) - a.hp); a.hp += h; addCond(a, 'shielded', 3); ev.push({type:'float', unitId: a.id, text:`+${h}`, cls:'heal'}); ev.push({type:'log', text:`${a.name} enjoys a soufflé — heal + Shielded!`, kind:'heal'}); } break; }
      case 'midnight_snack': { const h = Math.min(rollDice('2d8').total, effMaxHp(u) - u.hp); u.hp += h; giveExtra(u, 2); ev.push({type:'float', unitId: u.id, text:`+${h} heal +2 act`, cls:'heal'}); ev.push({type:'log', text:`${u.name} sneak-eats — heal + 2 actions!`, kind:'heal'}); break; }
      case 'beast_crashout': addCond(u, 'crash_out', 3); addCond(u, 'stoneskin', 3); ev.push({type:'log', text:`${u.name} crashes out — +50% dmg + Stone Skin!`, kind:'crit'}); break;
      case 'write_off': clean(u); ev.push({type:'log', text:`${u.name} writes everything off — cleansed!`, kind:'heal'}); ev.push({type:'float', unitId: u.id, text:'✨ Cleanse', cls:'buff'}); break;
      case 'steam_armor': addCond(u, 'shielded', 3); ev.push({type:'log', text:`${u.name} steams up — Shielded (dodge 3 turns).`, kind:'system'}); break;
      case 'rummage': giveExtra(u, 1); ev.push({type:'log', text:`${u.name} rummages around — finds a bonus action!`, kind:'system'}); ev.push({type:'float', unitId: u.id, text:'💨 +1 act', cls:'buff'}); break;
      default:
        ev.push({ type: 'log', text: `${s.name} fizzles — its effect is still on the drawing board.`, kind: 'info' });
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
      // quick_strike (bonus flourish) hits with the OFF-HAND weapon when a
      // real off-hand weapon is equipped (bucket in the left hand, etc.)
      let weapon = (s.kind === 'melee' || s.kind === 'ranged') ? u.equipment.weapon : undefined;
      if (s.id === 'quick_strike' && u.equipment.offHand?.kind === 'weapon') weapon = u.equipment.offHand;
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
          case 'wraith': case 'shadow_form': case 'dire_form': case 'eldritch_form': atkMod += 2; break;
          case 'inspired': atkMod += 2; break;
        }
      }
      // ── BG3 / 5e advantage & disadvantage (roll 2d20, take high/low) ──
      // disadvantage: blinded attacker, a ranged attacker with a foe on top of him, or low ground
      // advantage: target is Prone/Blinded, or the attacker on high ground / shrouded
      let adv: 'adv' | 'dis' | null = null;
      const isRanged = (s.kind === 'ranged') || (s.range > 1 && !s.selfCentered);
      const adjacentEnemy = this.units.some((f) => f.alive && f.team !== u.team && f.id !== t.id && Combat.dist(f.pos, u.pos) <= 1);
      const elev = (this.world?.heightAt(u.pos.x, u.pos.z) ?? 0) - (this.world?.heightAt(t.pos.x, t.pos.z) ?? 0);
      if (u.conditions.some((c) => c.id === 'blinded')) adv = 'dis';
      else if (isRanged && adjacentEnemy) adv = 'dis';
      else if (elev <= -1) adv = 'dis';                 // fighting from low ground
      else if (elev >= 1) adv = 'adv';                  // high-ground advantage
      else if (t.conditions.some((c) => c.id === 'prone') || t.conditions.some((c) => c.id === 'blinded')) adv = 'adv';
      const atk = rollD20(atkMod, blessed ? '1d4' : '', adv);
      const auto = s.id === 'magic_missile';
      // prone targets are easier to hit (+2)
      const tgtAC = effAC(t) - (t.conditions.some((x) => x.id === 'prone') ? 2 : 0);
      const surpriseCrit = this.surpriseRound && u.team === 'party' && this.surpriseHits.has(u.id) && !!diceExpr;
      if (surpriseCrit) this.surpriseHits.delete(u.id);
      // sneak (shadow_step / xray): promote to a guaranteed crit hit
      let sneakCrit = false;
      if (u.sneak) { sneakCrit = true; u.sneak = false; }
      const hit = auto || atk.crit || surpriseCrit || sneakCrit || (!atk.fumble && atk.total >= tgtAC);
      let crit = !auto && (atk.crit || surpriseCrit || sneakCrit);
      ev.push({
        type: 'log',
        text: auto
          ? `${s.name} strikes ${t.name} unerringly`
          : `Attack ${atk.roll}${fmtMod(atk.bonus)}${blessed ? `+${atk.extra}(bless)` : ''}${adv ? ` (${adv === 'adv' ? 'advantage' : 'disadvantage'})` : ''} = ${atk.total} vs AC ${tgtAC}: ${crit ? '✨CRITICAL' : hit ? 'HIT' : 'MISS'}`,
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
      if (u.conditions.some((x) => x.id === 'crash_out')) amount = Math.round(amount * 1.5); // +50% multiplicative
      if (u.conditions.some((x) => x.id === 'intimidated')) amount = Math.max(1, amount - 4);
      if (u.conditions.some((x) => x.id === 'enraged')) amount += 4;
      if (u.conditions.some((x) => x.id === 'lich_form')) amount += 2;
      if (u.conditions.some((x) => x.id === 'inspired')) amount += 2;
      if (sneakCrit) ev.push({ type: 'log', text: '🎯 Sneak attack — guaranteed crit!', kind: 'crit' });
      this.applyDamage(ev, t, amount, weapon?.damageType ?? s.damageType, crit);
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
      const isOffHandStrike = weapon === u.equipment.offHand;
      if (weapon?.fragile) {
        if (isOffHandStrike) u.equipment.offHand = undefined; else u.equipment.weapon = undefined;
        ev.push({ type: 'log', text: `The ${weapon.name} shatters on impact!`, kind: 'system' });
      }
      if (atk.fumble && weapon?.fumbleBreak && Math.random() < weapon.fumbleBreak) {
        if (isOffHandStrike) u.equipment.offHand = undefined; else u.equipment.weapon = undefined;
        ev.push({ type: 'log', text: `The ${weapon.name} snaps in your hands!`, kind: 'system' });
      }
      if (atk.fumble && weapon?.fumbleDrop && Math.random() < weapon.fumbleDrop) {
        const dropped = weapon;
        if (isOffHandStrike) u.equipment.offHand = undefined; else u.equipment.weapon = undefined;
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
    // lich form: immune to physical damage
    if (t.conditions.some((c) => c.id === 'lich_form')
        && (kind === 'slashing' || kind === 'piercing' || kind === 'bludgeoning')) {
      ev.push({ type: 'log', text: `${t.name}'s lich form shrugs off the ${kind} damage.`, kind: 'system' });
      ev.push({ type: 'float', unitId: t.id, text: 'IMMUNE', cls: 'dmg' });
      return;
    }
    // armor physResist (sturdy boots, pipe helmet, ribcage…) — physical only, min 1
    if (kind === 'slashing' || kind === 'piercing' || kind === 'bludgeoning') {
      const resist = effPhysResist(t);
      if (resist > 0) amount = Math.max(1, amount - resist);
    }
    // write_off: 50% damage reduction this turn
    if (t.conditions.some((c) => c.id === 'write_off')) amount = Math.floor(amount / 2);
    // vow: damage is shared with the partner ally (reciprocal — each takes half)
    if (t.vowPartner && amount > 0) {
      const partner = this.byId(t.vowPartner);
      if (partner && partner.alive && partner.id !== t.id) {
        const share = Math.max(1, Math.floor(amount / 2));
        amount = amount - share;
        partner.hp = Math.max(0, partner.hp - share);
        ev.push({ type: 'damage', unitId: partner.id, amount: share, kind, crit: false });
        ev.push({ type: 'float', unitId: partner.id, text: `🔗-${share}`, cls: 'dmg' });
        if (partner.hp <= 0 && partner.alive) ev.push(...this.onDeath(partner));
      }
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
    // Bone Rat: reassembles once unless burned. Decided here in the MODEL so
    // the fight never sees a premature area-secured (the old animation-layer
    // version revived the rat AFTER checkEnd had already ended the fight,
    // leaking an awake rat into the next room's combat).
    if (t.name === 'Bone Rat' && t.lastDamageKind !== 'fire' && !t.burnPrevented && !t.reassembledOnce) {
      t.reassembledOnce = true;
      t.hp = t.maxHp;
      t.conditions = [];
      out.push({ type: 'log', text: '🦴 The bones RATTLE. The Bone Rat reassembles!', kind: 'system' });
      out.push({ type: 'float', unitId: t.id, text: 'REASSEMBLED', cls: 'dmg' });
      return out;
    }
    t.alive = false;
    if (t.team === 'enemy' && this.inCombat) this.corpses.push(t.id);
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

  /** combat bonus action — hurl a consumable at a tile (range 6). An ally on
   *  the landing tile takes the item's normal effect at range (thrown potion
   *  splashes a heal); an enemy eats 1d4 glass plus the item's consume-cond.
   *  Costs the thrower's bonus action. The engine removes the item first. */
  throwItem(u: Unit, item: Item, tx: number, tz: number): CombatEvent[] {
    const ev: CombatEvent[] = [];
    if (!this.inCombat) return ev;
    let target: Unit | null = null, best = Infinity;
    for (const o of this.units) {
      if (!o.alive) continue;
      const d = Math.max(Math.abs(o.pos.x - tx), Math.abs(o.pos.z - tz));
      if (d < best) { best = d; target = o; }
    }
    if (!target) {
      ev.push({ type: 'log', text: 'The throw lands on empty floor.', kind: 'info' });
      u.hasBonus = false;
      return ev;
    }
    ev.push({ type: 'log', text: `${u.name} hurls ${item.icon} ${item.name} at ${target.name}!`, kind: 'info' });
    if (target.team === u.team) {
      // thrown into friendly hands — the item's normal drink/eat effect at range
      ev.push(...this.useConsumable(u, item, target.id));
    } else if (item.kind === 'weapon') {
      // a hurled weapon hits with its own dice (bucket! bottle! torch!)
      u.hasBonus = false;
      const wd = rollDice(item.damageDice ?? '1d4');
      this.applyDamage(ev, target, wd.total, item.damageType ?? 'bludgeoning', false);
      ev.push({ type: 'log', text: `${item.icon} ${item.name} thuds into ${target.name} for ${wd.total} ${item.damageType ?? 'bludgeoning'}!`, kind: 'hit' });
      if (item.onHitCondition && Math.random() < item.onHitCondition.chance) {
        const oc = item.onHitCondition;
        if (!target.conditions.some((x) => x.id === oc.id)) {
          target.conditions.push({ id: oc.id, name: CONDITIONS[oc.id]?.name ?? oc.id, roundsLeft: oc.rounds });
          ev.push({ type: 'float', unitId: target.id, text: `❄ ${CONDITIONS[oc.id]?.name ?? oc.id}`, cls: 'debuff' });
        }
      }
    } else {
      u.hasBonus = false;   // useConsumable pays this for the ally case
      this.applyDamage(ev, target, 1 + Math.floor(Math.random() * 4), 'bludgeoning', false);
      ev.push({ type: 'log', text: `${item.icon} shatters against ${target.name}!`, kind: 'hit' });
      if (item.consumeCondition && Math.random() < item.consumeCondition.chance) {
        const cc = item.consumeCondition;
        if (!target.conditions.some((x) => x.id === cc.id)) {
          target.conditions.push({ id: cc.id, name: CONDITIONS[cc.id]?.name ?? cc.id, roundsLeft: cc.rounds });
          ev.push({ type: 'float', unitId: target.id, text: `❄ ${CONDITIONS[cc.id]?.name ?? cc.id}`, cls: 'debuff' });
        }
      }
    }
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

    // ── 1. flee: below 30% HP (or a unit's fleesAtHp), back off. Fleeing is
    //    bounded so wounded enemies are catchable: only flee while a foe is
    //    close, and never cover more than FLEE_CAP tiles in one step.
    // room leash: movement (chase AND flee) stays inside the unit's rect.
    // Leashed units may step into their room's doorway but never across it,
    // so a fight in one room can't drag its mobs into a neighbouring one.
    const inLeash = (x: number, z: number) =>
      !u.leash || (x >= u.leash.x0 && x <= u.leash.x1 && z >= u.leash.z0 && z <= u.leash.z1);
    const hpPct = u.hp / effMaxHp(u);
    const shouldFlee = u.fleesAtHp !== undefined ? u.hp <= u.fleesAtHp : hpPct < 0.3;
    if (shouldFlee && u.movementLeft > 0) {
      const nearestFoe = foes.reduce((a, b) => Combat.dist(u.pos, a.pos) < Combat.dist(u.pos, b.pos) ? a : b);
      const FLEE_CAP = 3; // max tiles per flee — rats can't outrun the hero forever
      const nearestDist = Combat.dist(u.pos, nearestFoe.pos);
      if (nearestDist < 8) {       // already far enough away → stop running (stand to be hit)
        const reach = this.reachable(u, Math.min(u.movementLeft, FLEE_CAP));
        let best: GridPos[] | null = null; let bestD = -1;
        for (const [k, path] of reach) {
          if (!path.length) continue;
          const [x, z] = k.split(',').map(Number);
          if (!inLeash(x, z)) continue;
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
        if (!inLeash(x, z)) continue;
        const d = Combat.dist({ x, z }, nearest.pos);
        // melee: get as close as possible; ranged: hold at maxRange
        const ideal = wantsRange ? Math.max(2, maxRange - 1) : 1;
        const score = wantsRange ? -Math.abs(d - ideal) : -d;
        if (score > bestScore) { bestScore = score; best = path; }
      }
      if (best && best.length) {
        const dest = best[best.length - 1];
        const from = { ...u.pos };
        u.movementLeft -= best.length;
        u.pos = { ...dest };
        const ev: CombatEvent[] = [{ type: 'move', unitId: u.id, path: best }];
        ev.push(...this.provokedAttacks(u, from, dest));
        return ev;
      }
    }
    return null;
  }
}
