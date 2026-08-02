// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CONTENT FILE #1 — skills & unit roster.
// To add content: append a SkillDef / Unit here, zero engine
// changes needed. See EXPANSION_GUIDE.md § Content Authoring.
// ─────────────────────────────────────────────────────────────
import type { GridPos, SkillDef, Unit } from './types';
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
  // ── beasts & undead (dungeon) ─────────────────────────────
  bite: {
    id: 'bite', name: 'Bite', icon: '🐀', kind: 'melee',
    desc: '1d4+1 piercing.', range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'dex', damageDice: '1d4+1', damageType: 'piercing',
    fxColor: 0xc0504a, fx: 'blood',
  },
  rabid_bite: {
    id: 'rabid_bite', name: 'Rabid Bite', icon: '🦟', kind: 'melee',
    desc: 'A frothing, infectious bite. 1d6+2 piercing.', range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'dex', damageDice: '1d6+2', damageType: 'piercing',
    fxColor: 0xa33b2f, fx: 'blood',
  },
  bat_bite: {
    id: 'bat_bite', name: 'Fang Nip', icon: '🦇', kind: 'melee',
    desc: '1d4 piercing.', range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'dex', damageDice: '1d4', damageType: 'piercing',
    fxColor: 0x9a7bd0, fx: 'blood',
  },
  bat_screech: {
    id: 'bat_screech', name: 'Screech', icon: '📢', kind: 'ranged',
    desc: 'A piercing sonic shriek. 1d6 force. CON save DC 12 for half.',
    range: 5, aoeRadius: 0, cost: 'action', cooldown: 2,
    attackAbility: 'dex', damageDice: '1d6', damageType: 'force',
    saveAbility: 'con', saveDC: 12,
    fxColor: 0xb69cff, fx: 'arcane',
  },
  bone_strike: {
    id: 'bone_strike', name: 'Bone Strike', icon: '🦴', kind: 'melee',
    desc: 'A rattling swing of rusted steel. 1d8+2 slashing.', range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'str', damageDice: '1d8+2', damageType: 'slashing',
    fxColor: 0xd8d2be, fx: 'slash',
  },
  boss_smash: {
    id: 'boss_smash', name: 'Warlord Smash', icon: '💢', kind: 'aoe',
    desc: 'A ground-shaking sweep hitting all adjacent foes. 2d6+3 bludgeoning. (CD 2)',
    range: 0, aoeRadius: 1, cost: 'action', cooldown: 2,
    attackAbility: 'str', damageDice: '2d6+3', damageType: 'bludgeoning', selfCentered: true,
    fxColor: 0xff7a1f, fx: 'bash',
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
    // ── the party — one warrior, alone in the cave ──
    mkUnit({
      name: 'Greg', title: 'Human', team: 'party', klass: 'fighter', pos: { x: 10, z: 8 },
      level: 1, maxHp: 24, hp: 24, ac: 10,
      abilities: { str: 16, dex: 12, con: 14, int: 9, wis: 11, cha: 12 },
      knownSkills: ['slash', 'cleave', 'shield_bash'],
      scheme: { skin: 0xd9a066, cloth: 0xffffff, accent: 0xffeb3b, hair: 0x4a2f1a, hood: false, style: 'normal', naked: true },
      weapon: 'unarmed', xpValue: 0,
      equipment: {},
    }),
    // ── the goblin warband at the ruins ──
    mkUnit({
      name: 'Snik', title: 'Goblin Cutthroat', team: 'enemy', klass: 'goblin', pos: { x: 30, z: 30 },
      maxHp: 14, hp: 14, ac: 12,
      abilities: { str: 10, dex: 14, con: 10, int: 8, wis: 8, cha: 8 },
      knownSkills: ['scimitar'], moveRange: 6,
      scheme: { skin: 0x6f9c3f, cloth: 0x4a3a28, accent: 0x2e2418, hair: 0x1c1c1c, hood: false, orc: true, bulk: 0.85 },
      weapon: 'dagger', xpValue: 50,
      equipment: { weapon: makeItem('dagger1') },
    }),
    mkUnit({
      name: 'Grib', title: 'Goblin Archer', team: 'enemy', klass: 'goblin', pos: { x: 35, z: 25 },
      maxHp: 12, hp: 12, ac: 12,
      abilities: { str: 8, dex: 15, con: 10, int: 8, wis: 10, cha: 8 },
      knownSkills: ['shortbow'], moveRange: 6,
      scheme: { skin: 0x7da844, cloth: 0x39424e, accent: 0x232a33, hair: 0x1c1c1c, hood: true, orc: true, bulk: 0.85 },
      weapon: 'bow', xpValue: 50,
      equipment: { weapon: makeItem('bow1') },
    }),
    mkUnit({
      name: 'Zik', title: 'Goblin Archer', team: 'enemy', klass: 'goblin', pos: { x: 28, z: 35 },
      maxHp: 12, hp: 12, ac: 12,
      abilities: { str: 8, dex: 15, con: 10, int: 8, wis: 10, cha: 8 },
      knownSkills: ['shortbow'], moveRange: 6,
      scheme: { skin: 0x699636, cloth: 0x39322a, accent: 0x242019, hair: 0x1c1c1c, hood: true, orc: true, bulk: 0.85 },
      weapon: 'bow', xpValue: 50,
      equipment: { weapon: makeItem('bow1') },
    }),
    mkUnit({
      name: 'Boss Skar', title: 'Hobgoblin Boss', team: 'enemy', klass: 'goblin', pos: { x: 38, z: 32 },
      maxHp: 30, hp: 30, ac: 14,
      abilities: { str: 16, dex: 12, con: 14, int: 9, wis: 10, cha: 10 },
      knownSkills: ['boss_club'], moveRange: 5,
      scheme: { skin: 0xb06a3a, cloth: 0x5c2e2e, accent: 0x38231f, hair: 0x0f0f0f, hood: false, orc: true, bulk: 1.15 },
      weapon: 'club', xpValue: 150,
      equipment: { weapon: makeItem('club2') },
    }),
  ];
}

// ─────────────────────────────────────────────────────────────
// DUNGEON ROSTER — beasts, undead & the bathing warlord boss.
// Spawn tiles are supplied by the maze generator (levels/dungeon.ts)
// so this stays free of hard-coded coordinates and no import cycle
// forms (dungeon.ts → skills.ts only).
// ─────────────────────────────────────────────────────────────
export interface DungeonSpawns {
  party: GridPos;
  rats: GridPos[];        // ROOM A — cave rats
  bats: GridPos[];        // ROOM B — cave bats (flying)
  skeletons: GridPos[];   // ROOM C — skeleton patrol
  hub: GridPos[];         // ROOM D — mixed; last tile's skeleton carries the iron key
  rabid: GridPos[];       // ROOM E — rabid rats
  secret?: GridPos;       // secret room guardian (optional)
  boss: GridPos;          // the warlord, in his bath
  bossGuards: GridPos[];  // undead honor-guard, wakes with the boss
  baronGnaw?: GridPos;    // named quest rat near hermit chamber
}

const ratScheme = { skin: 0x6b4a2f, cloth: 0x9a7a55, accent: 0xc79a9a, hair: 0x140f0f, hood: false, monster: 'rat' as const };
const rabidScheme = { skin: 0x7a3b2f, cloth: 0x9a5a4a, accent: 0xd88a76, hair: 0xff2a18, hood: false, monster: 'rat' as const, bulk: 1.1 };
const batScheme = { skin: 0x3a2f3a, cloth: 0x2a2230, accent: 0x5a4a60, hair: 0xffd23a, hood: false, monster: 'bat' as const };
const skelScheme = { skin: 0xd8d2be, cloth: 0x3a2f28, accent: 0x9a9a9a, hair: 0x8fe3ff, hood: false, monster: 'skeleton' as const };

export function createDungeonRoster(sp: DungeonSpawns): Unit[] {
  uid = 0;
  const units: Unit[] = [];

  // ── the lone hero — naked except for white/yellow underwear (cloth+accent) ──
  units.push(mkUnit({
    name: 'Greg', title: 'Human', team: 'party', klass: 'fighter', pos: { ...sp.party },
    maxHp: 46, hp: 46, ac: 10, level: 4,
    abilities: { str: 16, dex: 12, con: 14, int: 9, wis: 11, cha: 12 },
    knownSkills: ['slash', 'cleave', 'shield_bash', 'power_strike'],
    scheme: { skin: 0xd9a066, cloth: 0xffffff, accent: 0xffeb3b, hair: 0x4a2f1a, hood: false, style: 'normal', naked: true },
    weapon: 'unarmed', xpValue: 0,
    equipment: {},
  }));

  const rat = (pos: GridPos, group: string) => mkUnit({
    name: `Cave Rat`, title: 'Giant Rat', team: 'enemy', klass: 'goblin', pos: { ...pos },
    maxHp: 8, hp: 8, ac: 12, level: 1,
    abilities: { str: 8, dex: 14, con: 9, int: 2, wis: 10, cha: 5 },
    knownSkills: ['bite'], moveRange: 7, xpValue: 15,
    scheme: { ...ratScheme }, weapon: 'dagger', dormant: true, groupId: group,
  });
  const rabid = (pos: GridPos, group: string) => mkUnit({
    name: 'Rabid Rat', title: 'Diseased Vermin', team: 'enemy', klass: 'goblin', pos: { ...pos },
    maxHp: 13, hp: 13, ac: 13, level: 2,
    abilities: { str: 12, dex: 15, con: 12, int: 2, wis: 8, cha: 4 },
    knownSkills: ['rabid_bite'], moveRange: 7, xpValue: 30,
    scheme: { ...rabidScheme }, weapon: 'dagger', dormant: true, groupId: group,
  });
  const bat = (pos: GridPos, group: string) => mkUnit({
    name: 'Cave Bat', title: 'Shrieking Bat', team: 'enemy', klass: 'goblin', pos: { ...pos },
    maxHp: 7, hp: 7, ac: 14, level: 1,
    abilities: { str: 6, dex: 16, con: 8, int: 3, wis: 12, cha: 6 },
    knownSkills: ['bat_bite', 'bat_screech'], moveRange: 8, xpValue: 18,
    scheme: { ...batScheme }, weapon: 'dagger', dormant: true, groupId: group, flying: true,
  });
  const skeleton = (pos: GridPos, group: string, weapon: 'sword' | 'mace', dropKey?: 'iron' | 'golden', boss = false) => mkUnit({
    name: 'Skeleton', title: dropKey === 'iron' ? 'Keybearer Skeleton' : 'Risen Skeleton', team: 'enemy', klass: 'goblin', pos: { ...pos },
    maxHp: 16, hp: 16, ac: 14, level: 2,
    abilities: { str: 14, dex: 10, con: 12, int: 4, wis: 8, cha: 5 },
    knownSkills: ['bone_strike'], moveRange: 5, xpValue: 45,
    scheme: { ...skelScheme }, weapon, dormant: true, groupId: group,
    equipment: { weapon: makeItem(weapon === 'mace' ? 'mace1' : 'sword1') },
    ...(dropKey ? { dropKey } : {}), ...(boss ? { bossGroup: true } : {}),
  });

  // ROOM A — three cave rats
  sp.rats.forEach((p) => units.push(rat(p, 'rats_a')));
  // ROOM B — three bats
  sp.bats.forEach((p) => units.push(bat(p, 'bats_b')));
  // ROOM C — skeleton patrol
  sp.skeletons.forEach((p, i) => units.push(skeleton(p, 'skels_c', i % 2 ? 'mace' : 'sword')));
  // ROOM D — hub: skeletons + a rat; the LAST tile's skeleton carries the iron key
  sp.hub.forEach((p, i) => {
    const last = i === sp.hub.length - 1;
    units.push(last ? skeleton(p, 'hub_d', 'sword', 'iron') : (i === 0 ? rat(p, 'hub_d') : skeleton(p, 'hub_d', 'mace')));
  });
  // ROOM E — rabid rats
  sp.rabid.forEach((p) => units.push(rabid(p, 'rabid_e')));
  // secret room guardian
  if (sp.secret) units.push(skeleton(sp.secret, 'secret_room', 'mace'));

  // ── THE BOSS — a brutal orc warlord, caught bathing ──
  units.push(mkUnit({
    name: 'Warlord Gorruk', title: 'The Bathing Tyrant', team: 'enemy', klass: 'goblin', pos: { ...sp.boss },
    maxHp: 66, hp: 66, ac: 16, level: 6,
    abilities: { str: 18, dex: 12, con: 16, int: 9, wis: 10, cha: 12 },
    knownSkills: ['boss_club', 'boss_smash'], moveRange: 5, xpValue: 350,
    scheme: { skin: 0x5f7a3a, cloth: 0x3a2a2a, accent: 0x2a1f1a, hair: 0x101010, hood: false, orc: true, bulk: 1.35 },
    weapon: 'club', dormant: true, bossGroup: true, dropKey: 'golden',
    equipment: { weapon: makeItem('club3') },
  }));
  // boss honor-guard (undead), wakes with the cutscene
  sp.bossGuards.forEach((p, i) => units.push(skeleton(p, 'boss_group', i % 2 ? 'mace' : 'sword', undefined, true)));

  // Baron Gnaw — named quest rat in a side tunnel near the hermit's chamber
  if (sp.baronGnaw) {
    units.push(mkUnit({
      name: 'Baron Gnaw', title: 'Finger-Thieving Rat', team: 'enemy', klass: 'goblin', pos: { ...sp.baronGnaw },
      maxHp: 16, hp: 16, ac: 13, level: 2,
      abilities: { str: 10, dex: 16, con: 12, int: 4, wis: 10, cha: 6 },
      knownSkills: ['rabid_bite'], moveRange: 7, xpValue: 40,
      scheme: { skin: 0x5a3a28, cloth: 0x8a6a4a, accent: 0xc79a9a, hair: 0xff2a18, hood: false, monster: 'rat' as const, bulk: 1.15 },
      weapon: 'dagger', dormant: true, groupId: 'baron_gnaw',
    }));
  }

  return units;
}
