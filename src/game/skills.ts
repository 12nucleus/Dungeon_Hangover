// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CONTENT FILE #1 — skills & unit roster.
// To add content: append a SkillDef / Unit here, zero engine
// changes needed. See EXPANSION_GUIDE.md § Content Authoring.
// ─────────────────────────────────────────────────────────────
import type { SkillDef, Unit } from './types';
import { makeItem } from './items';

export const SKILLS: Record<string, SkillDef> = {
  // ── Fighter ──────────────────────────────────────────────
  slash: {
    id: 'slash', name: 'Slash', icon: '⚔️', kind: 'melee',
    desc: 'A reliable sword strike. 2d6+3 slashing.',
    range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'str', damageDice: '2d6+3', damageType: 'slashing',
    fxColor: 0xffe08a, fx: 'slash',
  },
  cleave: {
    id: 'cleave', name: 'Cleave', icon: '🪓', kind: 'aoe',
    desc: 'Sweeping arc hitting ALL enemies adjacent to you. 1d10+3 slashing each.',
    range: 0, aoeRadius: 1, cost: 'action', cooldown: 2,
    attackAbility: 'str', damageDice: '1d10+3', damageType: 'slashing',
    fxColor: 0xffb054, fx: 'slash', selfCentered: true,
  },
  shield_bash: {
    id: 'shield_bash', name: 'Shield Bash', icon: '🛡️', kind: 'melee',
    desc: 'Bonus-action slam. 1d6+3 bludgeoning.',
    range: 1, aoeRadius: 0, cost: 'bonus', cooldown: 2,
    attackAbility: 'str', damageDice: '1d6+3', damageType: 'bludgeoning',
    fxColor: 0xd7c9a8, fx: 'bash',
  },
  // ── Wizard ───────────────────────────────────────────────
  fireball: {
    id: 'fireball', name: 'Fireball', icon: '🔥', kind: 'aoe',
    desc: 'Hurl a bead of flame that explodes: 6d6 fire in a 2-tile blast. DEX save DC 14 for half.',
    range: 9, aoeRadius: 2, cost: 'action', cooldown: 3,
    attackAbility: 'int', damageDice: '6d6', damageType: 'fire',
    saveAbility: 'dex', saveDC: 14, projectile: true,
    fxColor: 0xff7a1f, fx: 'fire',
  },
  magic_missile: {
    id: 'magic_missile', name: 'Magic Missile', icon: '✨', kind: 'ranged',
    desc: 'Three unerring darts of force. 3d4+3 force, never misses.',
    range: 10, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'int', damageDice: '3d4+3', damageType: 'force', projectile: true,
    fxColor: 0xc084fc, fx: 'arcane',
  },
  frost_nova: {
    id: 'frost_nova', name: 'Frost Nova', icon: '❄️', kind: 'aoe',
    desc: 'Icy burst around you: 3d6 cold to all within 2 tiles. CON save DC 14 for half; failures are Slowed.',
    range: 0, aoeRadius: 2, cost: 'action', cooldown: 3,
    attackAbility: 'int', damageDice: '3d6', damageType: 'cold',
    saveAbility: 'con', saveDC: 14, selfCentered: true,
    fxColor: 0x7dd3fc, fx: 'ice', appliesCondition: 'slowed',
  },
  // ── Cleric ───────────────────────────────────────────────
  cure_wounds: {
    id: 'cure_wounds', name: 'Cure Wounds', icon: '💚', kind: 'heal',
    desc: 'Channel divine warmth into an ally. Restores 2d8+4 HP.',
    range: 6, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'wis', damageDice: '', damageType: 'radiant',
    healDice: '2d8+4', targetsAllies: true,
    fxColor: 0x5ee87a, fx: 'heal',
  },
  sacred_flame: {
    id: 'sacred_flame', name: 'Sacred Flame', icon: '🌟', kind: 'ranged',
    desc: 'Radiant fire descends on a foe. 2d8 radiant, DEX save DC 13 negates.',
    range: 8, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'wis', damageDice: '2d8', damageType: 'radiant',
    saveAbility: 'dex', saveDC: 13,
    fxColor: 0xfde68a, fx: 'holy',
  },
  bless: {
    id: 'bless', name: 'Bless', icon: '🙏', kind: 'buff',
    desc: 'Bonus action: all living allies add +1d4 to attack rolls for 3 rounds.',
    range: 99, aoeRadius: 0, cost: 'bonus', cooldown: 4,
    attackAbility: 'wis', damageDice: '', damageType: 'radiant',
    targetsAllies: true, appliesCondition: 'blessed',
    fxColor: 0x93c5fd, fx: 'buff',
  },
  // ── Skill-tree unlockables ────────────────────────────────
  power_strike: {
    id: 'power_strike', name: 'Power Strike', icon: '💥', kind: 'melee',
    desc: 'A crushing overhead blow. 3d6+3 slashing. (CD 2)',
    range: 1, aoeRadius: 0, cost: 'action', cooldown: 2,
    attackAbility: 'str', damageDice: '3d6+3', damageType: 'slashing',
    fxColor: 0xffb054, fx: 'slash',
  },
  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind', icon: '🌪️', kind: 'aoe',
    desc: 'Spin your weapon in a full circle: 2d6+3 slashing to ALL adjacent enemies. (CD 3)',
    range: 0, aoeRadius: 1, cost: 'action', cooldown: 3,
    attackAbility: 'str', damageDice: '2d6+3', damageType: 'slashing',
    fxColor: 0xffb054, fx: 'slash', selfCentered: true,
  },
  second_wind: {
    id: 'second_wind', name: 'Second Wind', icon: '❤️‍🔥', kind: 'heal',
    desc: 'Bonus action: catch your breath. Restore 1d10+5 HP. (CD 3)',
    range: 0, aoeRadius: 0, cost: 'bonus', cooldown: 3,
    attackAbility: 'con', damageDice: '', damageType: 'radiant',
    healDice: '1d10+5', selfOnly: true,
    fxColor: 0x5ee87a, fx: 'heal',
  },
  ice_lance: {
    id: 'ice_lance', name: 'Ice Lance', icon: '🧊', kind: 'ranged',
    desc: 'Hurl a spear of ice: 4d6 cold. CON save DC 14 for half; failures are Slowed. (CD 2)',
    range: 9, aoeRadius: 0, cost: 'action', cooldown: 2,
    attackAbility: 'int', damageDice: '4d6', damageType: 'cold',
    saveAbility: 'con', saveDC: 14, projectile: true, appliesCondition: 'slowed',
    fxColor: 0x7dd3fc, fx: 'ice',
  },
  chain_lightning: {
    id: 'chain_lightning', name: 'Chain Lightning', icon: '⚡', kind: 'ranged',
    desc: 'A crackling bolt of pure energy. 3d8+3 force. (CD 3)',
    range: 9, aoeRadius: 0, cost: 'action', cooldown: 3,
    attackAbility: 'int', damageDice: '3d8+3', damageType: 'force', projectile: true,
    fxColor: 0xfde047, fx: 'arcane',
  },
  arcane_shield: {
    id: 'arcane_shield', name: 'Arcane Shield', icon: '🔷', kind: 'buff',
    desc: 'Bonus action: shimmering barrier — +2 AC for 3 rounds. (CD 3)',
    range: 0, aoeRadius: 0, cost: 'bonus', cooldown: 3,
    attackAbility: 'int', damageDice: '', damageType: 'force',
    selfOnly: true, appliesCondition: 'shielded',
    fxColor: 0x93c5fd, fx: 'buff',
  },
  healing_word: {
    id: 'healing_word', name: 'Healing Word', icon: '💬', kind: 'heal',
    desc: 'Bonus action: a spoken prayer mends an ally at range. 1d8+4 HP.',
    range: 8, aoeRadius: 0, cost: 'bonus', cooldown: 0,
    attackAbility: 'wis', damageDice: '', damageType: 'radiant',
    healDice: '1d8+4', targetsAllies: true,
    fxColor: 0x5ee87a, fx: 'heal',
  },
  mass_heal: {
    id: 'mass_heal', name: 'Mass Heal', icon: '🌈', kind: 'heal',
    desc: 'A wave of divine light: ALL living allies restore 1d8+4 HP. (CD 3)',
    range: 99, aoeRadius: 0, cost: 'action', cooldown: 3,
    attackAbility: 'wis', damageDice: '', damageType: 'radiant',
    healDice: '1d8+4', targetsAllies: true, allAllies: true,
    fxColor: 0xfde68a, fx: 'holy',
  },
  guiding_bolt: {
    id: 'guiding_bolt', name: 'Guiding Bolt', icon: '🌠', kind: 'ranged',
    desc: 'A flash of divine light streaks to a foe. 4d6 radiant. (CD 1)',
    range: 9, aoeRadius: 0, cost: 'action', cooldown: 1,
    attackAbility: 'wis', damageDice: '4d6', damageType: 'radiant', projectile: true,
    fxColor: 0xfde68a, fx: 'holy',
  },
  // ── Enemies ──────────────────────────────────────────────
  scimitar: {
    id: 'scimitar', name: 'Scimitar', icon: '🗡️', kind: 'melee',
    desc: '1d6+2 slashing.', range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'str', damageDice: '1d6+2', damageType: 'slashing',
    fxColor: 0xffe08a, fx: 'slash',
  },
  shortbow: {
    id: 'shortbow', name: 'Shortbow', icon: '🏹', kind: 'ranged',
    desc: '1d6+2 piercing.', range: 8, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'dex', damageDice: '1d6+2', damageType: 'piercing', projectile: true,
    fxColor: 0xd8b46a, fx: 'arrow',
  },
  boss_club: {
    id: 'boss_club', name: 'Crushing Club', icon: '🔨', kind: 'melee',
    desc: '2d4+3 bludgeoning.', range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'str', damageDice: '2d4+3', damageType: 'bludgeoning',
    fxColor: 0xff9a3d, fx: 'bash',
  },
};

export const CONDITIONS: Record<string, { name: string; desc: string }> = {
  blessed: { name: 'Blessed', desc: '+1d4 to attack rolls' },
  slowed: { name: 'Slowed', desc: 'Movement halved' },
  burning: { name: 'Burning', desc: 'Takes fire damage each round' },
  shielded: { name: 'Shielded', desc: '+2 AC' },
  surprised: { name: 'Surprised', desc: 'Skips first turn in combat' },
  rooted: { name: 'Rooted', desc: 'Cannot move' },
};

// ── unit factory ─────────────────────────────────────────────
let uid = 0;
function mkUnit(partial: Partial<Unit> & Pick<Unit, 'name' | 'title' | 'team' | 'klass' | 'pos' | 'scheme' | 'weapon' | 'knownSkills'>): Unit {
  return {
    id: `u${uid++}`,
    level: 3, xp: 0, skillPoints: 1, equipment: {},
    equippedSkills: [...(partial.knownSkills ?? [])], unlockedNodes: [], bonusAC: 0, bonusMove: 0,
    maxHp: 30, hp: 30, ac: 13,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    proficiency: 2, moveRange: 6,
    alive: true, cooldowns: {},
    hasAction: true, hasBonus: true, movementLeft: 6,
    initiative: 0, conditions: [], xpValue: 50,
    ...partial,
  } as Unit;
}

export function createRoster(): Unit[] {
  uid = 0;
  return [
    // ── the party ──
    mkUnit({
      name: 'Kael', title: 'Human Fighter', team: 'party', klass: 'fighter', pos: { x: 33, z: 37 },
      maxHp: 38, hp: 38, ac: 16,
      abilities: { str: 16, dex: 12, con: 14, int: 9, wis: 11, cha: 12 },
      knownSkills: ['slash', 'cleave', 'shield_bash'],
      scheme: { skin: 0xd9a066, cloth: 0x8c2f2f, accent: 0x5a5f6b, hair: 0x3a2a18, hood: false },
      weapon: 'sword', xpValue: 0,
      equipment: { weapon: makeItem('sword1'), armor: makeItem('padded') },
    }),
    mkUnit({
      name: 'Lyra', title: 'Elven Wizard', team: 'party', klass: 'wizard', pos: { x: 31, z: 39 },
      maxHp: 24, hp: 24, ac: 12,
      abilities: { str: 8, dex: 14, con: 12, int: 17, wis: 13, cha: 11 },
      knownSkills: ['fireball', 'magic_missile', 'frost_nova'],
      scheme: { skin: 0xe8c39a, cloth: 0x3b2d5c, accent: 0x7c5cbf, hair: 0xd9d3c0, hood: true },
      weapon: 'staff', xpValue: 0,
      equipment: { weapon: makeItem('staff1'), trinket: makeItem('cloak') },
    }),
    mkUnit({
      name: 'Brannoc', title: 'Dwarven Cleric', team: 'party', klass: 'cleric', pos: { x: 35, z: 39 },
      maxHp: 32, hp: 32, ac: 15,
      abilities: { str: 13, dex: 9, con: 15, int: 10, wis: 16, cha: 12 },
      knownSkills: ['cure_wounds', 'sacred_flame', 'bless'],
      scheme: { skin: 0xc98f5e, cloth: 0x8a6d1f, accent: 0xd9b84a, hair: 0xa34d1c, hood: false, bulk: 0.92 },
      weapon: 'mace', xpValue: 0,
      equipment: { weapon: makeItem('mace1'), armor: makeItem('chain') },
    }),
    // ── the goblin warband at the ruins ──
    mkUnit({
      name: 'Snik', title: 'Goblin Cutthroat', team: 'enemy', klass: 'goblin', pos: { x: 33, z: 12 },
      maxHp: 14, hp: 14, ac: 12,
      abilities: { str: 10, dex: 14, con: 10, int: 8, wis: 8, cha: 8 },
      knownSkills: ['scimitar'], moveRange: 6,
      scheme: { skin: 0x6f9c3f, cloth: 0x4a3a28, accent: 0x2e2418, hair: 0x1c1c1c, hood: false, orc: true, bulk: 0.85 },
      weapon: 'dagger', xpValue: 50,
      equipment: { weapon: makeItem('dagger1') },
    }),
    mkUnit({
      name: 'Grib', title: 'Goblin Archer', team: 'enemy', klass: 'goblin', pos: { x: 30, z: 9 },
      maxHp: 12, hp: 12, ac: 12,
      abilities: { str: 8, dex: 15, con: 10, int: 8, wis: 10, cha: 8 },
      knownSkills: ['shortbow'], moveRange: 6,
      scheme: { skin: 0x7da844, cloth: 0x39424e, accent: 0x232a33, hair: 0x1c1c1c, hood: true, orc: true, bulk: 0.85 },
      weapon: 'bow', xpValue: 50,
      equipment: { weapon: makeItem('bow1') },
    }),
    mkUnit({
      name: 'Zik', title: 'Goblin Archer', team: 'enemy', klass: 'goblin', pos: { x: 38, z: 9 },
      maxHp: 12, hp: 12, ac: 12,
      abilities: { str: 8, dex: 15, con: 10, int: 8, wis: 10, cha: 8 },
      knownSkills: ['shortbow'], moveRange: 6,
      scheme: { skin: 0x699636, cloth: 0x39322a, accent: 0x242019, hair: 0x1c1c1c, hood: true, orc: true, bulk: 0.85 },
      weapon: 'bow', xpValue: 50,
      equipment: { weapon: makeItem('bow1') },
    }),
    mkUnit({
      name: 'Boss Skar', title: 'Hobgoblin Boss', team: 'enemy', klass: 'goblin', pos: { x: 34, z: 8 },
      maxHp: 30, hp: 30, ac: 14,
      abilities: { str: 16, dex: 12, con: 14, int: 9, wis: 10, cha: 10 },
      knownSkills: ['boss_club'], moveRange: 5,
      scheme: { skin: 0xb06a3a, cloth: 0x5c2e2e, accent: 0x38231f, hair: 0x0f0f0f, hood: false, orc: true, bulk: 1.15 },
      weapon: 'club', xpValue: 150,
      equipment: { weapon: makeItem('club2') },
    }),
  ];
}
