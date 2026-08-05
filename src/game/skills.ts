// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CONTENT FILE #1 — skills & unit roster.
// To add content: append a SkillDef / Unit here, zero engine
// changes needed. See EXPANSION_GUIDE.md § Content Authoring.
// ─────────────────────────────────────────────────────────────
import type { GridPos, SkillDef, Unit } from './types';
import type { Rect } from '../levels/levelTypes';
import { makeItem } from './items';
import { mulberry32 } from '../levels/gen/dungeonGen';

export const SKILLS: Record<string, SkillDef> = {
  quick_strike: {
    id: 'quick_strike', name: 'Bonus Strike', icon: '🔸', kind: 'melee',
    desc: 'A quick BONUS-action strike with your weapon (off-hand / second hit). Uses the equipped weapon\'s damage.',
    range: 1, aoeRadius: 0, cost: 'bonus', cooldown: 0,
    attackAbility: 'str', damageDice: '1d6', damageType: 'slashing',
    fxColor: 0xffd76b, fx: 'slash',
  },
  // ── Universal ────────────────────────────────────────────
  // basic weapon attack — ALWAYS available, whatever skills the player
  // picked (utility-only builds had no way to attack). The damage dice
  // come from the equipped weapon (combat.useSkill resolves them).
  attack: {
    id: 'attack', name: 'Attack', icon: '⚔️', kind: 'melee',
    desc: 'A basic weapon attack.',
    range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'str', damageDice: '1d4', damageType: 'bludgeoning',
    fxColor: 0xffe08a, fx: 'slash',
  },
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
  // ── floor 50 — utility / sewer-cellar skills ──
  shove: {
    id: 'shove', name: 'Shove', icon: '🫸', kind: 'melee',
    desc: 'Bonus action: shove an adjacent foe. Strength contest; on success they slide 1 tile away — into the wine press, the bath, or a wall (1d4 + Prone).',
    range: 1, aoeRadius: 0, cost: 'bonus', cooldown: 0,
    attackAbility: 'str', damageDice: '', damageType: 'bludgeoning',
    fxColor: 0x9aa0a8, fx: 'bash',
  },
  // ── floor 50 — Boss Rat ──
  gnaw: {
    id: 'gnaw', name: 'Gnaw', icon: '🐀', kind: 'melee',
    desc: 'A crash-out chomp. 1d6+2 piercing; CON save DC 12 or Bleeding.',
    range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'str', damageDice: '1d6+2', damageType: 'piercing',
    saveAbility: 'con', saveDC: 12, appliesCondition: 'bleeding', appliesRounds: 3,
    fxColor: 0xc0504a, fx: 'blood',
  },
  rat_summon: {
    id: 'rat_summon', name: 'Call the Nest', icon: '🐁', kind: 'buff',
    desc: 'Once per fight, below 75% HP: two Small Rats join the fray.',
    range: 0, aoeRadius: 0, cost: 'action', cooldown: 0, selfOnly: true,
    attackAbility: 'con', damageDice: '', damageType: 'piercing',
    summonId: 'small_rat', hpBelowPct: 0.75, oncePerFight: true,
    fxColor: 0x9a7a55, fx: 'buff',
  },
  frenzy: {
    id: 'frenzy', name: 'Frenzy', icon: '🔥', kind: 'buff', passive: true,
    desc: 'Below 50% HP, Baron Gnaw attacks twice per turn.',
    range: 0, aoeRadius: 0, cost: 'free', cooldown: 0, selfOnly: true,
    attackAbility: 'con', damageDice: '', damageType: 'piercing',
    hpBelowPct: 0.5, fxColor: 0xff2a18, fx: 'buff',
  },
  mother_summon: {
    id: 'mother_summon', name: 'More Mouths', icon: '🐀', kind: 'buff',
    desc: 'Summon a Baby Rat (max 4 alive). (CD 3 — every 3rd turn)',
    range: 0, aoeRadius: 0, cost: 'action', cooldown: 3, selfOnly: true,
    attackAbility: 'con', damageDice: '', damageType: 'piercing',
    summonId: 'baby_rat', fxColor: 0xd8b4a0, fx: 'buff',
  },
  // ── floor 50 — Gribnab the Soapy ──
  club_smash: {
    id: 'club_smash', name: 'Club Smash', icon: '🛁', kind: 'melee',
    desc: '2d4+2 bludgeoning; CON save DC 13 or Stunned.',
    range: 1, aoeRadius: 0, cost: 'action', cooldown: 0,
    attackAbility: 'str', damageDice: '2d4+2', damageType: 'bludgeoning',
    saveAbility: 'con', saveDC: 13, appliesCondition: 'stunned', appliesRounds: 1,
    fxColor: 0xffd6f0, fx: 'bash',
  },
  soap_splash: {
    id: 'soap_splash', name: 'Soap Splash', icon: '🫧', kind: 'aoe',
    desc: '1d6 bludgeoning to all foes within 2 tiles; they get Slippery.',
    range: 0, aoeRadius: 2, cost: 'action', cooldown: 2, selfCentered: true,
    attackAbility: 'str', damageDice: '1d6', damageType: 'bludgeoning',
    appliesCondition: 'slippery', appliesRounds: 2,
    fxColor: 0xffd6f0, fx: 'ice',
  },
  bubble_shield: {
    id: 'bubble_shield', name: 'Bubble Shield', icon: '🫧', kind: 'buff',
    desc: '+2 AC for 2 rounds. (CD 3)',
    range: 0, aoeRadius: 0, cost: 'bonus', cooldown: 3, selfOnly: true,
    attackAbility: 'con', damageDice: '', damageType: 'force',
    appliesCondition: 'shielded', appliesRounds: 2,
    fxColor: 0xbcd8ff, fx: 'buff',
  },
  duck_distraction: {
    id: 'duck_distraction', name: 'Rubber Duck Distraction', icon: '🦆', kind: 'buff',
    desc: 'SQUEAK! Everyone — friend and foe — is Distracted for 1 round. (CD 3)',
    range: 99, aoeRadius: 99, cost: 'action', cooldown: 3, selfCentered: true,
    attackAbility: 'cha', damageDice: '', damageType: 'force',
    appliesCondition: 'distracted', appliesRounds: 1,
    fxColor: 0xffe066, fx: 'buff',
  },
  bath_time: {
    id: 'bath_time', name: 'Bath Time', icon: '🛁', kind: 'buff',
    desc: 'Below 25% HP, once: Gribnab hops back in the tub and heals 2d8+4.',
    range: 0, aoeRadius: 0, cost: 'action', cooldown: 0, selfOnly: true,
    attackAbility: 'con', damageDice: '', damageType: 'force',
    healDice: '2d8+4', hpBelowPct: 0.25, oncePerFight: true,
    fxColor: 0x9ecbe0, fx: 'heal',
  },
  sovereign_sudds: {
    id: 'sovereign_sudds', name: 'Sovereign Sudds', icon: '👑', kind: 'buff',
    desc: 'Below 10% HP, once: all goblins deal +4 damage for 2 rounds.',
    range: 99, aoeRadius: 0, cost: 'action', cooldown: 0, allAllies: true,
    attackAbility: 'cha', damageDice: '', damageType: 'force',
    appliesCondition: 'enraged', appliesRounds: 2, hpBelowPct: 0.1, oncePerFight: true,
    fxColor: 0xffd23a, fx: 'buff',
  },
  totem_burst: {
    id: 'totem_burst', name: 'Totem Pulse', icon: '🪵', kind: 'aoe',
    desc: 'Each turn the totem pulses, dealing 2d6 force to nearby enemies.',
    range: 0, aoeRadius: 2, cost: 'action', cooldown: 0,
    attackAbility: 'wis', damageDice: '2d6', damageType: 'force',
    selfCentered: true, fxColor: 0x8a5a2a, fx: 'buff',
  },
};

export const CONDITIONS: Record<string, { name: string; desc: string }> = {
  blessed: { name: 'Blessed', desc: '+1d4 to attack rolls' },
  slowed: { name: 'Slowed', desc: 'Movement halved' },
  burning: { name: 'Burning', desc: 'Takes 1d6 fire damage each round' },
  shielded: { name: 'Shielded', desc: '+2 AC' },
  surprised: { name: 'Surprised', desc: 'Skips first turn in combat' },
  rooted: { name: 'Rooted', desc: 'Cannot move' },

  // ── floor 50 — sewer cellar conditions ──
  poisoned: { name: 'Poisoned', desc: 'Takes 1d4 poison damage each round' },
  bleeding: { name: 'Bleeding', desc: 'Takes 1d4 damage each round' },
  infected: { name: 'Infected', desc: 'Takes 1 damage each round until cured' },
  scalded: { name: 'Scalded', desc: 'Takes 1d4 fire damage each round' },
  nauseated: { name: 'Nauseated', desc: '−1 to attack rolls' },
  dazed: { name: 'Dazed', desc: '−2 to attack rolls (1 round)' },
  stunned: { name: 'Stunned', desc: 'Skips their turn' },
  prone: { name: 'Prone', desc: 'Attackers get +2 to hit you; you stand at turn start' },
  blinded: { name: 'Blinded', desc: '−5 to attack rolls' },
  disgusted: { name: 'Disgusted', desc: '−2 to attack rolls' },
  intimidated: { name: 'Intimidated', desc: '−4 damage dealt (min 1)' },
  distracted: { name: 'Distracted', desc: '−2 to attack rolls' },
  slippery: { name: 'Slippery', desc: '50% chance to slip and fall Prone when moving' },
  hallucinating: { name: 'Hallucinating', desc: '−2 to attack rolls (you are fighting the wallpaper)' },
  well_fed: { name: 'Well Fed', desc: '+1 to attack rolls, +1 AC' },
  hungover: { name: 'Hungover', desc: '−2 to attack rolls (sobers with level)' },
  hungover_mild: { name: 'Hungover (Mild)', desc: '−1 to attack rolls' },
  cursed: { name: 'Cursed', desc: 'Loot quality downgraded one step' },
  enraged: { name: 'Enraged', desc: '+4 damage dealt' },
  crash_out: { name: 'Crash Out', desc: '+50% damage dealt (multiplicative)' },

  // ── class-form buffs (buffs branch of useSkill) ──
  stoneskin: { name: 'Stone Skin', desc: '+4 AC' },
  armored: { name: 'Armored', desc: '+5 AC' },
  wraith: { name: 'Wraith Form', desc: 'Phases through harm: +2 AC, +2 attack' },
  lich_form: { name: 'Lich Form', desc: 'Immune to physical damage, +2 damage dealt' },
  spirit_form: { name: 'Spirit Form', desc: '+1 attack' },
  beast_form: { name: 'Beast Form', desc: '+1 attack' },
  dire_form: { name: 'Dire Form', desc: '+2 attack' },
  eldritch_form: { name: 'Eldritch Form', desc: '+2 attack' },
  shadow_form: { name: 'Shadow Form', desc: '+2 attack' },
  kings_lounge: { name: "King's Lounge", desc: '+2 damage dealt' },

  // ── skills-audit conditions (tier-1 utility skills) ──
  charmed: { name: 'Charmed', desc: 'Entranced — skips their turn' },
  fortified: { name: 'Fortified', desc: '+3 AC' },
  inspired: { name: 'Inspired', desc: '+2 attack rolls, +2 damage dealt' },
  write_off: { name: 'Written Off', desc: 'Takes 50% less damage this turn' },
  evading: { name: 'Evading', desc: 'Cannot be targeted by single-target attacks' },
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
  // Template stats are the pre-creation baseline; confirmCharacterCreation
  // resets the hero to Lv1 / 0 XP / 24 HP once the player picks classes, so
  // these values only matter if creation is somehow skipped.
  units.push(mkUnit({
    name: 'Greg', title: 'Human', team: 'party', klass: 'fighter', pos: { ...sp.party },
    maxHp: 24, hp: 24, ac: 10, level: 1, xp: 0,
    abilities: { str: 16, dex: 12, con: 14, int: 9, wis: 11, cha: 12 },
    knownSkills: [],
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

// ─────────────────────────────────────────────────────────────
// FLOOR 50 ROSTER — the sewer cellar's denizens.
// Positions = room rect centers + seeded ±1 jitter. All enemies spawn
// `dormant` with a per-room groupId so the existing proximity-aggro works
// unchanged. Spawn tiles are supplied by levels/floor50.ts.
// ─────────────────────────────────────────────────────────────

export interface Floor50Spawns {
  party: GridPos;
  /** world-coord rects of every room that holds enemies */
  rooms: Record<string, Rect>;
  bossRatLair: Rect;
  bossBathTile: GridPos;
}

/** factory templates for summoned minions (Combat.summon clones them) */
export const SUMMON_TEMPLATES: Record<string, () => Unit> = {
  small_rat: () => mkSummon({
    name: 'Small Rat', title: 'Nest Rat', team: 'enemy', klass: 'goblin', pos: { x: 0, z: 0 },
    maxHp: 3, hp: 3, ac: 11, level: 1,
    abilities: { str: 8, dex: 14, con: 9, int: 2, wis: 10, cha: 5 },
    knownSkills: ['bite'], moveRange: 7, xpValue: 10, fleesAtHp: 1,
    scheme: { ...ratScheme }, weapon: 'dagger',
  }),
  baby_rat: () => mkSummon({
    name: 'Baby Rat', title: 'Nursery Squeaker', team: 'enemy', klass: 'goblin', pos: { x: 0, z: 0 },
    maxHp: 1, hp: 1, ac: 10, level: 1,
    abilities: { str: 4, dex: 13, con: 8, int: 2, wis: 8, cha: 4 },
    knownSkills: ['bite'], moveRange: 6, xpValue: 5,
    onHit: { condition: 'infected', chance: 0.1, rounds: 99, saveAbility: 'con', saveDC: 10 },
    scheme: { ...ratScheme, bulk: 0.55 }, weapon: 'dagger',
  }),
  goblin_guard: () => mkSummon({
    name: 'Goblin Guard', title: 'Goblin Guard', team: 'enemy', klass: 'goblin', pos: { x: 0, z: 0 },
    maxHp: 8, hp: 8, ac: 13, level: 2,
    abilities: { str: 12, dex: 13, con: 11, int: 8, wis: 9, cha: 8 },
    knownSkills: ['scimitar', 'shield_bash', 'shove'], moveRange: 6, xpValue: 30,
    scheme: { skin: 0x6f9c3f, cloth: 0x4a3a28, accent: 0x2e2418, hair: 0x1c1c1c, hood: false, orc: true, bulk: 0.9 },
    weapon: 'sword', equipment: { weapon: makeItem('goblin_spear') },
  }),

  // ── party-side minions (spirit / beast / ghoul / champion summons) ──
  spirit_ally: () => mkSummon({
    name: 'Spirit Ally', title: 'Wandering Spirit', team: 'party', klass: 'goblin', pos: { x: 0, z: 0 },
    maxHp: 10, hp: 10, ac: 13, level: 2,
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 12, cha: 10 },
    knownSkills: ['bone_strike', 'shove'], moveRange: 6, xpValue: 0,
    scheme: { skin: 0xc084fc, cloth: 0x6a4a9a, accent: 0xe0c0ff, hair: 0x3a2a5a, hood: false, bulk: 0.9, style: 'chibi' },
    weapon: 'dagger',
  }),
  beast_ally: () => mkSummon({
    name: 'Beast Ally', title: 'Called Beast', team: 'party', klass: 'goblin', pos: { x: 0, z: 0 },
    maxHp: 14, hp: 14, ac: 12, level: 2,
    abilities: { str: 14, dex: 14, con: 12, int: 4, wis: 10, cha: 6 },
    knownSkills: ['bite', 'shove'], moveRange: 7, xpValue: 0,
    scheme: { ...ratScheme, bulk: 1.2, monster: 'rat' },
    weapon: 'dagger',
  }),
  ghoul_minion: () => mkSummon({
    name: 'Ghoul Minion', title: 'Ravenous Ghoul', team: 'party', klass: 'goblin', pos: { x: 0, z: 0 },
    maxHp: 18, hp: 18, ac: 13, level: 3,
    abilities: { str: 14, dex: 12, con: 13, int: 5, wis: 8, cha: 5 },
    knownSkills: ['bone_strike', 'shove'], moveRange: 5, xpValue: 0,
    scheme: { skin: 0x8a9c6a, cloth: 0x4a5a3a, accent: 0xc0d0a0, hair: 0x2a3a1a, hood: false, bulk: 1.1, monster: 'skeleton' },
    weapon: 'sword',
  }),
  undead_champion: () => mkSummon({
    name: 'Undead Champion', title: 'Mega Reanimate', team: 'party', klass: 'goblin', pos: { x: 0, z: 0 },
    maxHp: 30, hp: 30, ac: 14, level: 3,
    abilities: { str: 16, dex: 10, con: 14, int: 4, wis: 8, cha: 5 },
    knownSkills: ['bone_strike', 'shove'], moveRange: 5, xpValue: 0,
    scheme: { skin: 0xd8d2be, cloth: 0x3a2f28, accent: 0x9a9a9a, hair: 0x8fe3ff, hood: false, bulk: 1.3, monster: 'skeleton' },
    weapon: 'sword',
  }),
  // ── skills-audit: party-side terrain summons (lifetime = turnsLeft) ──
  totem: () => mkSummon({
    name: 'Spirit Totem', title: 'Channeling Totem', team: 'party', klass: 'goblin', pos: { x: 0, z: 0 },
    maxHp: 5, hp: 5, ac: 18, level: 1,
    abilities: { str: 8, dex: 8, con: 10, int: 8, wis: 12, cha: 6 },
    knownSkills: ['totem_burst'], moveRange: 0, xpValue: 0, turnsLeft: 3, dormant: false,
    scheme: { skin: 0x8a5a2a, cloth: 0x5a3a1a, accent: 0xe8b46a, hair: 0x3a2a1a, hood: false, bulk: 0.8, monster: 'rat' },
    weapon: 'dagger',
  }),
  door_wall: () => mkSummon({
    name: 'The Door', title: 'Conjured Wall', team: 'party', klass: 'goblin', pos: { x: 0, z: 0 },
    maxHp: 30, hp: 30, ac: 16, level: 1,
    abilities: { str: 10, dex: 6, con: 16, int: 6, wis: 6, cha: 6 },
    knownSkills: [], moveRange: 0, xpValue: 0, turnsLeft: 2, dormant: false,
    scheme: { skin: 0x8a5a2a, cloth: 0x5a3a1a, accent: 0xe8b46a, hair: 0x3a2a1a, hood: false, bulk: 1, monster: 'skeleton' },
    weapon: 'dagger',
  }),
};

/** summon helper — same shape as mkUnit but with a fresh-summon flag */
let summonUid = 100000;
function mkSummon(partial: Partial<Unit> & Pick<Unit, 'name' | 'title' | 'team' | 'klass' | 'pos' | 'scheme' | 'weapon' | 'knownSkills'>): Unit {
  return {
    ...mkUnit({ ...partial, knownSkills: partial.knownSkills ?? [] }),
    id: `sum${summonUid++}`,
  };
}

const ratSmallScheme = { skin: 0x6b4a2f, cloth: 0x9a7a55, accent: 0xc79a9a, hair: 0x140f0f, hood: false, monster: 'rat' as const };
const leechScheme = { skin: 0x5a2a3a, cloth: 0x3a1a28, accent: 0x9a4a5a, hair: 0x1a0a12, hood: false, monster: 'rat' as const };
const giantLeechScheme = { skin: 0x7a3a4a, cloth: 0x4a2230, accent: 0xc06070, hair: 0x2a0f18, hood: false, monster: 'rat' as const, bulk: 1.2 };
const moldScheme = { skin: 0x6a8a4a, cloth: 0x4a5a3a, accent: 0x9ac070, hair: 0x2a3a1a, hood: false, style: 'chibi' as const };
const boneRatScheme = { skin: 0xd8d2be, cloth: 0x4a3a2a, accent: 0x9a9a9a, hair: 0x8fe3ff, hood: false, monster: 'rat' as const, bulk: 1.05 };
const goblinGuardScheme = { skin: 0x6f9c3f, cloth: 0x4a3a28, accent: 0x2e2418, hair: 0x1c1c1c, hood: false, orc: true, bulk: 0.9 };
const gribnabScheme = { skin: 0x7a9c4a, cloth: 0x4a6a8a, accent: 0xff9ac0, hair: 0x101010, hood: false, orc: true, bulk: 1.2 };

/**
 * Build the full Floor 50 roster. `seed` drives the ±1 spawn jitter so a
 * loaded run replays the same enemy positions.
 */
export function createFloor50Roster(sp: Floor50Spawns, seed: number): Unit[] {
  uid = 0;
  summonUid = 100000;
  const rng = mulberry32(seed ^ 0xfeed5);
  const jitter = () => {
    const dx = Math.round(rng() * 2 - 1), dz = Math.round(rng() * 2 - 1);
    return { dx, dz };
  };
  const center = (r: Rect): GridPos => ({ x: (r.x0 + r.x1) >> 1, z: (r.z0 + r.z1) >> 1 });
  const spot = (r: Rect): GridPos => {
    const c = center(r);
    const { dx, dz } = jitter();
    return { x: c.x + dx, z: c.z + dz };
  };
  const units: Unit[] = [];

  // ── the party — Greg, hungover at the bottom of everything ──
  units.push(mkUnit({
    name: 'Greg', title: 'Human', team: 'party', klass: 'fighter', pos: { ...sp.party },
    maxHp: 24, hp: 24, ac: 10, level: 1, xp: 0,
    abilities: { str: 16, dex: 12, con: 14, int: 9, wis: 11, cha: 12 },
    knownSkills: ['shove'],
    conditions: [{ id: 'hungover', name: CONDITIONS.hungover.name, roundsLeft: 99 }],
    scheme: { skin: 0xd9a066, cloth: 0xffffff, accent: 0xffeb3b, hair: 0x4a2f1a, hood: false, style: 'normal', naked: true },
    weapon: 'unarmed', xpValue: 0, equipment: {},
  }));

  const smallRat = (r: Rect, group: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const p = spot(r);
      units.push(mkUnit({
        name: 'Small Rat', title: 'Sewer Rat', team: 'enemy', klass: 'goblin', pos: p,
        maxHp: 3, hp: 3, ac: 11, level: 1,
        abilities: { str: 8, dex: 14, con: 9, int: 2, wis: 10, cha: 5 },
        knownSkills: ['bite'], moveRange: 7, xpValue: 10, fleesAtHp: 1,
        scheme: { ...ratSmallScheme }, weapon: 'dagger', dormant: true, groupId: group,
      }));
    }
  };
  const rat = (r: Rect, group: string) => {
    const p = spot(r);
    units.push(mkUnit({
      name: 'Rat', title: 'Sewer Rat', team: 'enemy', klass: 'goblin', pos: p,
      maxHp: 3, hp: 3, ac: 11, level: 1,
      abilities: { str: 8, dex: 14, con: 9, int: 2, wis: 10, cha: 5 },
      knownSkills: ['bite'], moveRange: 7, xpValue: 10, fleesAtHp: 1,
      scheme: { ...ratSmallScheme }, weapon: 'dagger', dormant: true, groupId: group,
    }));
  };
  const leech = (r: Rect, group: string) => {
    const p = spot(r);
    units.push(mkUnit({
      name: 'Sewer Leech', title: 'Blood-Sipping Leech', team: 'enemy', klass: 'goblin', pos: p,
      maxHp: 4, hp: 4, ac: 10, level: 1,
      abilities: { str: 6, dex: 12, con: 10, int: 2, wis: 8, cha: 4 },
      knownSkills: ['bite'], moveRange: 5, xpValue: 15,
      onHit: { condition: 'bleeding', chance: 1, rounds: 2, saveAbility: 'con', saveDC: 10 },
      scheme: { ...leechScheme }, weapon: 'dagger', dormant: true, groupId: group,
    }));
  };
  const goblinGuard = (r: Rect, group: string) => {
    const p = spot(r);
    units.push(mkUnit({
      name: 'Goblin Guard', title: 'Goblin Guard', team: 'enemy', klass: 'goblin', pos: p,
      maxHp: 8, hp: 8, ac: 13, level: 2,
      abilities: { str: 12, dex: 13, con: 11, int: 8, wis: 9, cha: 8 },
      knownSkills: ['scimitar', 'shield_bash', 'shove'], moveRange: 6, xpValue: 30,
      scheme: { ...goblinGuardScheme }, weapon: 'sword', dormant: true, groupId: group,
      equipment: { weapon: makeItem('goblin_spear') },
    }));
  };

  // R3 — the sewer tunnel beside spawn is deliberately EMPTY: the player's
  // first fight should come on their terms (Room 4 nursery), not from mobs
  // camping the room next to the bonfire. The tunnel keeps its interactables
  // (skeleton, barrel) and can still roll the torch-off ambush.
  // R4 — the nursery: mother + 2 babies (nerfed — Greg's first fight should
  // be winnable at Lv1 with limited abilities: no endless summoning, and the
  // babies' permanent 'infected' rider is removed so a few bites don't doom
  // the run). Loot: rats drop only XP (no items) by design — Baron Gnaw is
  // the sole loot rat.
  units.push(mkUnit({
    name: 'Mother Rat', title: 'Matriarch of the Nursery', team: 'enemy', klass: 'goblin', pos: spot(sp.rooms.r4),
    maxHp: 6, hp: 6, ac: 11, level: 2,
    abilities: { str: 10, dex: 13, con: 12, int: 4, wis: 10, cha: 6 },
    knownSkills: ['bite', 'mother_summon'], moveRange: 6, xpValue: 25,
    scheme: { ...ratSmallScheme, bulk: 1.2 }, weapon: 'dagger', dormant: true, groupId: 'r4_nursery',
  }));
  for (let i = 0; i < 2; i++) {
    units.push(mkUnit({
      name: 'Baby Rat', title: 'Nursery Squeaker', team: 'enemy', klass: 'goblin', pos: spot(sp.rooms.r4),
      maxHp: 1, hp: 1, ac: 10, level: 1,
      abilities: { str: 4, dex: 13, con: 8, int: 2, wis: 8, cha: 4 },
      knownSkills: ['bite'], moveRange: 6, xpValue: 5,
      scheme: { ...ratSmallScheme, bulk: 0.55 }, weapon: 'dagger', dormant: true, groupId: 'r4_nursery',
    }));
  }
  // R5 — Boss Rat, Baron Gnaw (woken by the arena cutscene)
  units.push(mkUnit({
    name: 'Baron Gnaw', title: 'The Boss Rat', team: 'enemy', klass: 'goblin', pos: center(sp.bossRatLair),
    maxHp: 25, hp: 25, ac: 13, level: 3,
    abilities: { str: 14, dex: 16, con: 13, int: 4, wis: 10, cha: 6 },
    knownSkills: ['gnaw', 'rat_summon', 'frenzy'], moveRange: 7, xpValue: 150,
    scheme: { skin: 0x5a3a28, cloth: 0x8a6a4a, accent: 0xff2a18, hair: 0x140f0f, hood: false, monster: 'rat' as const, bulk: 1.3 },
    weapon: 'dagger', dormant: true, bossGroup: true, groupId: 'baron_gnaw',
    deathDrops: { itemIds: ['severed_finger', 'rusty_key'], gold: 10 },
  }));
  // R6 — mold blobs
  for (let i = 0; i < 2; i++) {
    units.push(mkUnit({
      name: 'Mold Blob', title: 'Living Wine Mold', team: 'enemy', klass: 'goblin', pos: spot(sp.rooms.r6),
      maxHp: 5, hp: 5, ac: 10, level: 1,
      abilities: { str: 8, dex: 8, con: 10, int: 2, wis: 8, cha: 3 },
      knownSkills: ['bite'], moveRange: 4, xpValue: 20,
      scheme: { ...moldScheme }, weapon: 'dagger', dormant: true, groupId: 'r6_mold',
    }));
  }
  // R7 — sewer leeches
  leech(sp.rooms.r7, 'r7_leeches');
  leech(sp.rooms.r7, 'r7_leeches');
  // R8 / R20 — lone rats
  rat(sp.rooms.r8, 'r8_rat');
  rat(sp.rooms.r20, 'r20_rat');
  // R11 — two small rats
  smallRat(sp.rooms.r11, 'r11_rats', 2);
  // R12 — ambush pack: large rat + 3 small rats
  units.push(mkUnit({
    name: 'Large Rat', title: 'Den Tyrant', team: 'enemy', klass: 'goblin', pos: spot(sp.rooms.r12),
    maxHp: 10, hp: 10, ac: 12, level: 2,
    abilities: { str: 12, dex: 14, con: 11, int: 3, wis: 9, cha: 5 },
    knownSkills: ['bite'], moveRange: 7, xpValue: 30,
    onHit: { condition: 'bleeding', chance: 1, rounds: 2, saveAbility: 'con', saveDC: 10 },
    scheme: { ...ratSmallScheme, bulk: 1.25 }, weapon: 'dagger', dormant: true, groupId: 'r12_rats',
  }));
  smallRat(sp.rooms.r12, 'r12_rats', 3);
  // R15 — the bone rat (reassembles once unless burned)
  units.push(mkUnit({
    name: 'Bone Rat', title: 'Skeletal Vermin', team: 'enemy', klass: 'goblin', pos: center(sp.rooms.r15),
    maxHp: 12, hp: 12, ac: 13, level: 2,
    abilities: { str: 12, dex: 13, con: 12, int: 3, wis: 9, cha: 5 },
    knownSkills: ['bite'], moveRange: 6, xpValue: 50,
    scheme: { ...boneRatScheme }, weapon: 'dagger', dormant: true, groupId: 'r15_bone',
  }));
  // R21 / R22 / R24 — goblin guards
  goblinGuard(sp.rooms.r21, 'r21_guards');
  goblinGuard(sp.rooms.r21, 'r21_guards');
  goblinGuard(sp.rooms.r22, 'r22_guard');
  goblinGuard(sp.rooms.r24, 'r24_guards');
  goblinGuard(sp.rooms.r24, 'r24_guards');
  // R23 — giant leech + 2 sewer leeches
  units.push(mkUnit({
    name: 'Giant Leech', title: 'The Flooded Deep\'s Ruler', team: 'enemy', klass: 'goblin', pos: spot(sp.rooms.r23),
    maxHp: 15, hp: 15, ac: 12, level: 3,
    abilities: { str: 13, dex: 11, con: 13, int: 3, wis: 8, cha: 4 },
    knownSkills: ['bite'], moveRange: 5, xpValue: 40,
    onHit: { condition: 'bleeding', chance: 1, rounds: 3, saveAbility: 'con', saveDC: 11 },
    scheme: { ...giantLeechScheme }, weapon: 'dagger', dormant: true, groupId: 'r23_leeches',
  }));
  leech(sp.rooms.r23, 'r23_leeches');
  leech(sp.rooms.r23, 'r23_leeches');
  // R25 — Gribnab the Soapy
  units.push(mkUnit({
    name: 'Gribnab', title: 'The Soapy', team: 'enemy', klass: 'goblin', pos: { ...sp.bossBathTile },
    maxHp: 60, hp: 60, ac: 16, level: 5,
    abilities: { str: 16, dex: 11, con: 14, int: 10, wis: 10, cha: 14 },
    knownSkills: ['club_smash', 'soap_splash', 'bubble_shield', 'duck_distraction', 'bath_time', 'sovereign_sudds'],
    moveRange: 5, xpValue: 300, bathPos: { ...sp.bossBathTile },
    scheme: { ...gribnabScheme }, weapon: 'club', dormant: true, bossGroup: true, dropKey: 'golden',
    deathDrops: { itemIds: ['drowned_majesty', 'soap_crown'], gold: 50 },
  }));

  return units;
}
