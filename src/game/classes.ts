// ─────────────────────────────────────────────────────────────
// CLASSES — the 15 design-bible class pools used by character
// creation. Pure data (lore, pros/cons, portrait recipe, and the
// Tier-1 skill ids offered as starting choices). Skill definitions
// themselves live in classSkills.ts (the all-50-per-class data).
// ─────────────────────────────────────────────────────────────
import type { ClassDef } from './types';

export const CLASSES: ClassDef[] = [
  {
    id: 'bar_bouncer', name: 'Bar Bouncer', icon: '🚪',
    tagline: '"You\'re Not On The List"',
    role: 'Melee lockdown · single-target control · battlefield denial',
    lore: "Greg was never a bouncer. A PATRON. The kind bouncers remember. Bounced from The Dirty Mug fourteen times. A perfect record. But being bounced fifty times means you LEARN how a bouncer thinks, how they MOVE, where they look and where they DON'T. Every bouncer has a tell — a shift of weight, a glance, a moment of hesitation. And if you're fast enough, small enough, and STUPID enough, you can get past ANYONE.",
    pros: ['Grapple / shove / physically deny actions', 'Locks down one enemy at a time', 'Stubborn, belligerent, surprisingly effective'],
    cons: ['Focuses on one target — weak vs swarms', 'Short range, all-melee', 'Position-dependent'],
    portrait: { scheme: { skin: 0xd9a066, cloth: 0x2a2a35, accent: 0xc9a227, hair: 0x1c1c1c, hood: false, style: 'normal', bulk: 1.1 }, weapon: 'club' },
    tier1Skills: ['velvet_rope', 'id_check', 'stool_smash', 'drunk_tank'],
  },
  {
    id: 'gutter_rogue', name: 'Gutter Rogue', icon: '🗡️',
    tagline: '"Nothing Personal. Actually, It Is."',
    role: 'Dirty fighter · bleed · steal · trap · stealth',
    lore: "Grew up in the alleys behind The Dirty Mug. Lived in the alley, eating what the tavern threw away. Learned to steal before learning to walk. Learned to lie before learning to talk. Learned to FIGHT DIRTY before learning to fight at all.",
    pros: ['High burst + bleed', 'Sneak / trap / steal options', 'Uses dirty tricks other builds can\'t'],
    cons: ['Frail — low HP', 'Needs setup / positioning', 'Weak in head-on slugfests'],
    portrait: { scheme: { skin: 0xc98f5a, cloth: 0x3a2c22, accent: 0x8a1f1f, hair: 0x0f0f0f, hood: true, style: 'normal', bulk: 0.95 }, weapon: 'dagger' },
    tier1Skills: ['cheap_shot', 'bleed_out', 'pick_pocket', 'shadow_step'],
  },
  {
    id: 'karaoke_bard', name: 'Karaoke Bard', icon: '🎤',
    tagline: '"It\'s Not About The Voice, It\'s About The FEELING."',
    role: 'Ally buff · enemy debuff · charm',
    lore: "Has never been able to sing. Sang at a cousin's wedding once — THREE people cried. Not from joy. From PAIN. Sang at The Dirty Mug's weekly karaoke night and the BARTENDER asked to stop. Bartenders NEVER ask. But the feeling? The feeling lands.",
    pros: ['Buff allies and debuff enemies', 'Charm / control utility', 'High charisma synergy'],
    cons: ['Weak direct damage', 'Buffs need allies to shine', 'Low survivability'],
    portrait: { scheme: { skin: 0xe0a879, cloth: 0x7a1f9a, accent: 0xf5c542, hair: 0x2a0f3a, hood: false, style: 'normal', bulk: 1.0 }, weapon: 'unarmed' },
    tier1Skills: ['power_chord', 'off_key', 'encore', 'stage_fright'],
  },
  {
    id: 'sommelier', name: 'Sommelier', icon: '🍷',
    tagline: '"Notes Of Oak And Poor Life Choices."',
    role: 'Identify buffs · potion crafting · debuff pairing',
    lore: "Once drank wine from a BOX. Called it 'mature.' Paired it with CHEESE CRACKERS. The Dirty Mug served box wine as their 'house red' and called it 'rustic.' The ANTITHESIS of a sommelier. Everything a sommelier DESPISES — and yet, knows exactly how to pair it.",
    pros: ['Identify enemy weaknesses', 'Potion / consumable boosts', 'Debuff pairing'],
    cons: ['Low raw damage', 'Consumable-dependent', 'Setup-heavy'],
    portrait: { scheme: { skin: 0xdc9e66, cloth: 0x6b1f1f, accent: 0xc9a227, hair: 0x2a1a0f, hood: false, style: 'normal', bulk: 1.0 }, weapon: 'unarmed' },
    tier1Skills: ['vintage', 'pairing', 'cork_popper', 'palate_cleanser'],
  },
  {
    id: 'barista', name: 'Barista', icon: '☕',
    tagline: '"I Haven\'t Slept In Six Floors."',
    role: 'Extra actions · critical hits · speed',
    lore: "Worked at a coffee shop called 'Bean There Done That.' Hated it. Hated the customers. Hated the espresso machine. Hated the BEANS. But the caffeine? The caffeine is REAL. Speed-obsessed, jittery, and operating on fumes and pure spite.",
    pros: ['Extra actions', 'Crit-fishing', 'Fastest in the fight'],
    cons: ['Burns out / fragile', 'Relies on tempo', 'Low raw durability'],
    portrait: { scheme: { skin: 0xdb9f6a, cloth: 0x5a2d0f, accent: 0x8a6a2a, hair: 0x3a2410, hood: false, style: 'normal', bulk: 0.95 }, weapon: 'unarmed' },
    tier1Skills: ['double_shot', 'over_heat', 'jitter', 'froth'],
  },
  {
    id: 'accountant', name: 'Accountant', icon: '🧾',
    tagline: '"You\'ve Been... Fiddling The Books."',
    role: 'Debuff stacking · conditional damage · gold interaction',
    lore: "Did taxes once. Learned that EVERYONE is fiddling the books. Became an accountant — the kind who shows up at audits with a briefcase full of VENDETTA. Numbers don't LIE. People lie. Goblins lie. But numbers? Numbers are HONEST.",
    pros: ['Stack debuffs', 'Conditional % damage', 'Gold synergy'],
    cons: ['Needs debuffs to shine', 'Low burst', 'Wind-up time'],
    portrait: { scheme: { skin: 0xd5a06a, cloth: 0x33333d, accent: 0xc9c9d0, hair: 0x1a1a1a, hood: false, style: 'normal', bulk: 1.0 }, weapon: 'unarmed' },
    tier1Skills: ['audit', 'discrepancy', 'deduction', 'fine_print'],
  },
  {
    id: 'dentist', name: 'Dentist', icon: '🦷',
    tagline: '"This Will Hurt Me More Than You. No, Actually, Just You."',
    role: 'Precision damage · status application · bleeding',
    lore: "Went to the dentist once. The dentist said 'You have SEVENTEEN cavities.' The dentist said 'You drink ENERGY DRINKS and eat CANDY for BREAKFAST.' Said 'It's called BREAKFAST OF CHAMPIONS.' The dentist said 'It's called BREAKFAST OF HOLES.' Learned precision. Learned the drill.",
    pros: ['Accurate strikes', 'Bleeding + binds', 'Single-target focus'],
    cons: ['Single-target only', 'Low AoE', 'Melee range'],
    portrait: { scheme: { skin: 0xd8a06a, cloth: 0xe8e8ea, accent: 0x2a9ad0, hair: 0x1f1f1f, hood: false, style: 'normal', bulk: 1.0 }, weapon: 'dagger' },
    tier1Skills: ['drill', 'cavity', 'floss', 'xray'],
  },
  {
    id: 'plumber', name: 'Plumber', icon: '🔧',
    tagline: '"Where\'s Your Shut-Off Valve?"',
    role: 'Environment manipulator · unclog · burst pipes · pressure',
    lore: "Fixed a toilet once. The toilet EXPLODED. Learned something: water is POWER. Water is PRESSURE. Water is DESTRUCTION. Manipulates the environment, bursts pipes, and turns the battlefield into a hazard.",
    pros: ['Environment control', 'AoE via pipes/water', 'Displacement'],
    cons: ['Needs terrain', 'Weak in open rooms', 'Setup-heavy'],
    portrait: { scheme: { skin: 0xd79a62, cloth: 0x2a3a6a, accent: 0xc9a227, hair: 0x1a1a1a, hood: false, style: 'normal', bulk: 1.05 }, weapon: 'mace' },
    tier1Skills: ['pipe_burst', 'plunge', 'wrench', 'pressure'],
  },
  {
    id: 'wedding_planner', name: 'Wedding Planner', icon: '💒',
    tagline: '"EVERYONE Has A Processional Order."',
    role: 'Multi-target buffs · positioning · chaos coordinator',
    lore: "Once planned a wedding. The cake collapsed. The groom cried. The bride's aunt started a FIGHT. But learned something: chaos is just PLANNING that hasn't been SCHEDULED yet. Buffs whole groups, arranges positions, makes allies work as one.",
    pros: ['Multi-target buffs', 'Positioning control', 'Team synergy'],
    cons: ['Weak solo', 'Low personal damage', 'Allies-dependent'],
    portrait: { scheme: { skin: 0xe0a879, cloth: 0xe8dcc8, accent: 0xd24a4a, hair: 0x3a1a0f, hood: false, style: 'normal', bulk: 1.0 }, weapon: 'unarmed' },
    tier1Skills: ['seating_chart', 'rehearsal', 'centerpiece', 'vow'],
  },
  {
    id: 'tabloid_reporter', name: 'Tabloid Reporter', icon: '📰',
    tagline: '"EXCLUSIVE: LOCAL IDIOT DOOMED."',
    role: 'Reveal weaknesses · spread panic · debuff via headlines',
    lore: "Once wrote for 'The Dirty Mug Gazette,' a newsletter that Nobody read. The article was titled 'LOCAL MAN PROPOSES TO CHANDELIER — CHANDELIER SAYS YES.' Most-read issue in Gazette history. Reveals enemy weaknesses and spreads PANIC through scandal.",
    pros: ['Reveal enemy stats', 'Panic / fear debuffs', 'Info advantage'],
    cons: ['Low direct damage', 'Debuffs over time', 'Frail'],
    portrait: { scheme: { skin: 0xcf9a62, cloth: 0x4a4a52, accent: 0xd24a1f, hair: 0x1a1a1a, hood: false, style: 'normal', bulk: 1.0 }, weapon: 'unarmed' },
    tier1Skills: ['headline', 'expose', 'scoop', 'gossip'],
  },
  {
    id: 'haunted_chef', name: 'Haunted Chef', icon: '🍳',
    tagline: '"It\'s Not Poisoned. It\'s Just... Assertive."',
    role: 'Food as weapon/heal · cooking · food effects',
    lore: "Can't cook. Has NEVER been able to cook. Once burned WATER. Once set fire to a SANDWICH. But keeps trying, because of believing that if enough SALT and enough HOPE are added, anything becomes FOOD. Haunted by the ingredients that refuse to behave.",
    pros: ['Food-based heals', 'Consumable damage', 'Fun combos'],
    cons: ['Consumable-dependent', 'Unpredictable', 'Low consistency'],
    portrait: { scheme: { skin: 0xdb9a62, cloth: 0x8a5a2a, accent: 0xf5c542, hair: 0x1a0f0a, hood: false, style: 'normal', bulk: 1.05 }, weapon: 'mace' },
    tier1Skills: ['burnt_offer', 'soup', 'salt', 'mise'],
  },
  {
    id: 'shaman', name: 'Shaman', icon: '🥁',
    tagline: '"The Spirits Say You Smell."',
    role: 'Persistent AoE · spirit companion · cursing',
    lore: "Attended a spiritual retreat thinking it was a BEER FESTIVAL. Drank the ceremonial tea. SAW spirits. Became a shaman — not a GOOD shaman, the kind who shows up with a RATTLE and a DREAM and a COMPLETE DISREGARD for spiritual PROTOCOL. The spirits are ALWAYS angry. But they're USEFUL.",
    pros: ['Persistent AoE', 'Spirit companion', 'Curse enemies'],
    cons: ['Spirits are unreliable', 'Slow setup', 'Mystical fluff'],
    portrait: { scheme: { skin: 0xb0703a, cloth: 0x5a3a1a, accent: 0x2a9ad0, hair: 0x1a1a1a, hood: false, style: 'normal', bulk: 1.0, orc: true }, weapon: 'staff' },
    tier1Skills: ['spirit_rattle', 'hex', 'summon_spirit', 'totem'],
  },
  {
    id: 'zoologist', name: 'Zoologist', icon: '🐾',
    tagline: '"Fascinating. It\'s Trying To Eat Me."',
    role: 'Creature tamer · form-shifter · turn enemies into allies',
    lore: "Visited a zoo for the RESTAURANT. Accidentally entered the LION ENCLOSURE. The lion looked back. Looked at the lion. Said 'Fascinating.' The lion was CONSIDERING. Turns enemies into allies, tames beasts, and shifts forms.",
    pros: ['Tame / charm creatures', 'Beast forms', 'Utility summons'],
    cons: ['Weak vs non-beasts', 'Summon-dependent', 'Frail alone'],
    portrait: { scheme: { skin: 0xc98f5a, cloth: 0x3a5a2a, accent: 0x8a6a2a, hair: 0x2a1a0f, hood: false, style: 'normal', bulk: 1.0 }, weapon: 'bow' },
    tier1Skills: ['call_beast', 'observe', 'tame', 'pounce'],
  },
  {
    id: 'insurance_adjuster', name: 'Insurance Adjuster', icon: '📋',
    tagline: '"That\'s Not Covered Under Your Plan."',
    role: 'Risk assessor · fine print trap · conditional buffs',
    lore: "Once filed a claim for 'emotional damages sustained during chandelier proposal.' The insurance company said 'chandeliers are NOT covered.' Said 'THIS chandelier said YES.' The insurance company said 'STILL not covered.' Assesses risk, exploits fine print, and turns conditions into profit.",
    pros: ['Conditional counters', 'Fine-print traps', 'Defensive buffs'],
    cons: ['Requires conditions', 'Reactive playstyle', 'Low burst'],
    portrait: { scheme: { skin: 0xd5a06a, cloth: 0x2a2a35, accent: 0x2a9ad0, hair: 0x1a1a1a, hood: false, style: 'normal', bulk: 1.0 }, weapon: 'unarmed' },
    tier1Skills: ['risk_assessment', 'deductible', 'fine_print', 'appraisal'],
  },
  {
    id: 'mortician', name: 'Mortician', icon: '🕯️',
    tagline: '"You\'re Not Dead Enough. Let Me Help."',
    role: 'Death exploiter · undead control · heal off kills',
    lore: "Once worked at a funeral home because the cafeteria was thought to be OPEN TO THE PUBLIC. It wasn't. The cafeteria was for THE DEAD. Ate lunch with THE DEAD for THREE WEEKS before anyone noticed. Exploits death, controls the undead, and heals off every kill.",
    pros: ['Heal off kills', 'Reanimate dead', 'Death synergy'],
    cons: ['Requires kills to snowball', 'Creepy/situational', 'Weak early'],
    portrait: { scheme: { skin: 0xb8b8c0, cloth: 0x1a1a22, accent: 0x6a8a6a, hair: 0x0f0f0f, hood: false, style: 'normal', bulk: 1.0 }, weapon: 'mace' },
    tier1Skills: ['grave_marker', 'embalm', 'reanimate', 'last_rites'],
  },
];

export const CLASS_MAP: Record<string, ClassDef> = Object.fromEntries(
  CLASSES.map((c) => [c.id, c]),
);

/** All class ids in display order. */
export const CLASS_IDS = CLASSES.map((c) => c.id);

/** Resolve a class def by id (safe). */
export function classById(id: string): ClassDef | undefined {
  return CLASS_MAP[id];
}
