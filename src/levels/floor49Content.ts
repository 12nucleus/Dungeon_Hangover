// ─────────────────────────────────────────────────────────────
// FLOOR 49 — THE FUNGAL GROTTO content: room narration, traps,
// destructibles, hidden treasures, hazards and every interactable.
// Bible: docs/dungeon_hangover_bible/floors/FLOOR_49_FUNGAL_GROTTO.md
//
// VOICE: the narrator is in full Dungeon Crawler Carl mode — the
// grotto is beautiful and the narrator is slightly impressed, but
// still absolutely judging you. All lines are spoken via narrate()
// (f49_* ids) or dialogue (npc/<id>_<node>.mp3).
// ─────────────────────────────────────────────────────────────
import type { Interactable, GameEngineLike } from '../game/engine/interactables';
import { makeItem } from '../game/items';
import type { GridPos } from '../game/types';
import type { Rect } from './levelTypes';
import { mulberry32 } from './gen/dungeonGen';

/** Narrator's first-entry line for each room (18 rooms, one voice: judgement). */
export const ROOM_NARRATION: Record<string, string> = {
  r1: "You enter the Fungal Grotto. It glows. It's pretty. That's the trap. Pretty things, down here, are just ugly things with better marketing. There's a skeleton by the wall. He fell for it. You won't. Probably. You're already breathing the air, Greg, so the clock's running.",
  r2: "Spores. They're in the air. They're in your air. They're yours now. You didn't pay for them. You didn't ask for them. Congratulations, you're a homeowner. The previous owners left a cloud of sentient glitter and they are NOT coming back for it.",
  r3: "The vines move. The vines are alive. The vines reach for you the way a landlord reaches for a deposit — slowly, legally, with real enthusiasm. The last guy through here thought vines were, you know, plants. The last guy is now a trellis. He's doing great. He's structurally load-bearing.",
  r4: "A pool, underground, crystal clear. No filter, no chlorine, no supervision. It's a lawsuit waiting to happen and you are the plaintiff. Don't drink it. You're going to drink it. You're Greg. Drinking the unregulated water is, statistically, your whole deal.",
  r5: "Seven mushrooms in a ring, each a different color. This is either ancient ritual or a child's birthday party that got out of hand. Either answer is a problem. You weren't invited. Showing up without a gift is rude. Showing up and BEING the gift is, it turns out, the local custom.",
  r6: "The big room. The mushrooms here are older than your civilization and taller than your last landlord, which is saying something. They're watching you the way a library watches a man who can't read — patiently, with pity, taking notes. Yes. The mushrooms take notes. Did you think they were decorative?",
  r7: "The Spore Mother's throne. She built it. She grew it. She sat in it and DREAMED this entire floor into existence, which is more productive than anything you've done this year. She is the landlord here. You are the tenant who is six months behind and also holding a sword.",
  r8: "Three pools. One heals. One poisons. One shows you truths you didn't ask for. They look identical. There are no signs. No Yelp reviews. You could test them carefully. You could think. You're going to close your eyes and pick one like it's a claw machine, aren't you. You are. And you're gonna be wrong.",
  r9: "Knee-deep water. Cold. Something with a tongue is listening to you breathe and preparing notes. It's a frog. It's a very large frog. It has, and I cannot stress this enough, OPINIONS about your form. Your breathing form. The frog is a coach now. The frog saw a gap in the market.",
  r10: "A mushroom farm. Rows of glowing caps, standing at attention. Somewhere a farmer is proud. The farmer is a skeleton. The skeleton is wearing a mushroom as a hat. The hat is also a skeleton, spiritually. This is a vertically integrated deceased-agriculture operation. Very efficient.",
  r11: "The Rotting Tree. It is not a tree. It's a mushroom that wanted to be a tree so badly it spent four hundred years pretending. It almost made it. It's the most inspiring thing in the dungeon, and also the saddest, and also it's watching you. Three things can be true. The tree-mushroom knows this.",
  r12: "A picnic. Blanket, basket, little cups. Whoever sat down to eat never stood back up. The view is gorgeous. The view is, presumably, the last thing they saw, which makes the view an accomplice. The sandwiches are still here. The sandwiches have outlived their owner. The sandwiches are winning.",
  r13: "The nursery. Dozens of small mushrooms, glowing softly, all watching you with the wrong amount of innocence. These are the Spore Mother's children. She signed the door, 'KEEP OUT.' She underlined it. Twice. She drew a little frowny face. You went in anyway, because signs are for surfaces and you, my friend, are no longer on a surface.",
  r14: "One chest. In the middle of the room. Untouched. Unlocked. This is the dungeon's cleanest room and the dungeon's dirtiest trick. Nobody leaves a chest in the exact center of a perfectly clean room unless the chest IS the room's landlord and the rent is paid in YOU.",
  r15: "A graveyard. Every headstone has a mushroom growing on it, which is either poetry or recycling. The epitaphs are unkind. The epitaphs are accurate. The mushrooms are not grieving. They're buzzing. They're celebrating the close of a fiscal quarter. Greg. You're a quarter.",
  r16: "An echo chamber. Whatever you say, the room says back, louder, slower, meaner. It's like Twitter but with better acoustics. The crystals record everything. Say something stupid in here and it keeps it, replays it, and eventually improves upon it. You will say something stupid. They always do.",
  r17: "The Mycelial Highway. A glowing road that hums and goes exactly where you need to go, which is the most suspicious thing a road can do. Infrastructure, down here, does not happen by accident. Someone funded this. Someone expects a return. You are traffic. You are also revenue.",
  r18: "The Sleeping Giant. A mushroom the size of a duplex, snoring softly. Its dreams smell like the surface. If you wake it, it will be furious about the surface, about weather, about taxes. If you don't, you'll wonder forever. You're going to wake it. You're Greg. You touch things.",
};

/** spore traps in the field + a vine snare in the tunnel (seeded placement) */
export function floor49Traps(
  seed: number,
  rooms: Record<string, Rect>,
  walk: boolean[][],
  reserved: Set<string>,
): { defId: string; x: number; z: number }[] {
  const rng = mulberry32(seed ^ 0xf49);
  const out: { defId: string; x: number; z: number }[] = [];
  const freeSpot = (r: Rect): { x: number; z: number } | null => {
    for (let tries = 0; tries < 12; tries++) {
      const x = r.x0 + 1 + Math.floor(rng() * (r.x1 - r.x0 - 1));
      const z = r.z0 + 1 + Math.floor(rng() * (r.z1 - r.z0 - 1));
      if (!walk[x]?.[z]) continue;
      if (reserved.has(`${x},${z}`)) continue;
      return { x, z };
    }
    return null;
  };
  for (const id of ['r2', 'r2', 'r10']) {
    const r = rooms[id];
    if (!r) continue;
    const s = freeSpot(r);
    if (s) out.push({ defId: 'spore', ...s });
  }
  for (const id of ['r3', 'r11']) {
    const r = rooms[id];
    if (!r) continue;
    const midZ = (r.z0 + r.z1) >> 1;
    const x = (r.x0 + r.x1) >> 1;
    if (walk[x]?.[midZ]) out.push({ defId: 'snare', x, z: midZ });
  }
  return out;
}

/** destructibles: the Spore Mother's throne (smash it to weaken her) + spore sacs */
export function floor49Destructibles(
  seed: number,
  rooms: Record<string, Rect>,
  walk: boolean[][],
  reserved: Set<string>,
): { defId: string; x: number; z: number }[] {
  const rng = mulberry32(seed ^ 0xd49);
  const out: { defId: string; x: number; z: number }[] = [];
  const r7 = rooms.r7;
  if (r7) {
    // the throne — center of the boss room, on walkable ground
    const cx = (r7.x0 + r7.x1) >> 1, cz = (r7.z0 + r7.z1) >> 1;
    out.push({ defId: 'spore_throne', x: cx, z: cz });
    // 4 spore sacs around it
    const corners: [number, number][] = [
      [r7.x0 + 1, r7.z0 + 1], [r7.x1 - 1, r7.z0 + 1], [r7.x0 + 1, r7.z1 - 1], [r7.x1 - 1, r7.z1 - 1],
    ];
    for (const [x, z] of corners) {
      if (walk[x]?.[z] && !reserved.has(`${x},${z}`)) out.push({ defId: 'spore_sac', x, z });
    }
  }
  // a couple of harvestable sacs in the spore field (r2) + grotto (r6)
  for (const id of ['r2', 'r6']) {
    const r = rooms[id];
    if (!r) continue;
    for (let i = 0; i < 2; i++) {
      for (let tries = 0; tries < 10; tries++) {
        const x = r.x0 + 1 + Math.floor(rng() * (r.x1 - r.x0 - 1));
        const z = r.z0 + 1 + Math.floor(rng() * (r.z1 - r.z0 - 1));
        if (!walk[x]?.[z] || reserved.has(`${x},${z}`)) continue;
        out.push({ defId: 'spore_sac', x, z });
        break;
      }
    }
  }
  return out;
}

/** hidden treasure tiles (seeded) */
export function floor49HiddenTreasures(
  _seed: number,
  rooms: Record<string, Rect>,
  walk: boolean[][],
  reserved: Set<string>,
): GridPos[] {
  const out: GridPos[] = [];
  const spots: [string, number, number][] = [
    ['r2', 1, 4], ['r6', 3, 6], ['r8', 2, 1],
    ['r10', 3, 3], ['r15', 1, 3], ['r17', 2, 1],
  ];
  for (const [id, dx, dz] of spots) {
    const r = rooms[id];
    if (!r) continue;
    const x = r.x0 + dx, z = r.z0 + dz;
    if (walk[x]?.[z] && !reserved.has(`${x},${z}`)) out.push({ x, z });
  }
  return out;
}

/** no shove-hazards on this floor — the pools are interactables */
export function floor49Hazards(_rooms: Record<string, Rect>): { tile: GridPos; kind: 'wine_press' | 'bath' }[] {
  return [];
}

/**
 * The grotto's interactables. Every [R] prompt mirrors a visible voxel prop
 * (see floor49.ts prop placement).
 */
export function floor49Interactables(seed: number, rooms: Record<string, Rect>): Interactable[] {
  const rng = mulberry32(seed ^ 0xf49c);
  const out: Interactable[] = [];
  const R = (id: string): Rect => rooms[id];

  const once = (id: string, x: number, z: number, label: string, body: (e: GameEngineLike) => void, radius = 2) => {
    out.push({ id, pos: { x, z }, radius, label, once: true, run: body });
  };
  const grant = (e: GameEngineLike, items: string[], gold = 0) => {
    e.grantLoot(items.map((id) => makeItem(id)), gold);
  };
  const leaderId = (e: GameEngineLike) => e.combat!.living('party')[0]?.id;

  // ── R1 — ENTRY HALL: the skeleton, harvestable glow caps, Myke the merchant ──
  {
    const r = R('r1');
    once('search_skeleton_r1', r.x0, r.z0, '[R] Search the skeleton', (e) => {
      grant(e, ['glowing_spore'], 8);
      e.pushLog('A corpse in fungus-crusted gear. 8 gold, one glowing-spore vial, and a note: "The mushrooms are not friendly. The mushrooms are NEVER friendly. — signed, a man who was right exactly once and then, regrettably, never." The man is the note now. The note is doing better.', 'system');
    });
    once('harvest_r1', r.x0 + 1, r.z1, '[R] Harvest the glowing mushrooms', (e) => {
      grant(e, ['glowing_mushroom', 'glowing_mushroom']);
      e.pushLog('You pluck two glowing mushrooms. They pulse, offended, like slow blinks from someone you owe money to. +2 Glowing Mushroom.', 'system');
    });
  }

  // ── R2 — SPORE FIELD: harvest caps (some explode!), breathe deep (quest!) ──
  {
    const r = R('r2');
    once('harvest_r2', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Harvest the mushroom caps', (e) => {
      // 6 caps; 2 are explosive (bible: disturb → 3 dmg + 50% Nauseated)
      const harvest = [
        { item: 'glowing_mushroom', boom: false },
        { item: 'glowing_mushroom', boom: false },
        { item: 'glowing_mushroom', boom: true },
        { item: 'moon_cap', boom: false },
        { item: 'glowing_mushroom', boom: false },
        { item: 'glowing_mushroom', boom: true },
      ];
      const picked: string[] = [];
      for (const h of harvest) {
        if (h.boom && rng() < 0.7) {
          e.damageGreg(3, 'spore explosion');
          e.pushLog('The mushroom EXPLODES. Not fire. Spores. A furious, airborne resentment in cloud form. You touched it without asking. The mushroom asked first. You ignored it. Now you are the lesson, and the lesson is in your sinuses.', 'hit');
          if (Math.random() < 0.5) e.applyCondition(leaderId(e), 'nauseated', 3);
        } else {
          picked.push(h.item);
        }
      }
      if (picked.length) {
        grant(e, picked);
        e.pushLog(`You salvage ${picked.length} mushrooms before the survivors stop glowing. They are not so much "harvested" as "traumatically relocated". The farm will remember. The farm has a list.`, 'system');
      }
    });
    // breathe deep — the START of Spore Madness (the narrator dares you)
    out.push({
      id: 'breathe_deep_r2', pos: { x: r.x0 + 1, z: r.z0 + 2 }, radius: 1,
      label: '[R] Breathe the spores deeply',
      visibleIf: (e) => !e.hasFlag('breathed_deep_r2'),
      run: (e) => {
        e.setFlag('breathed_deep_r2');
        e.startQuest('spore_madness');
        e.applyCondition(leaderId(e), 'hallucinating', 2);
        void e.narrate('f49_breathe', 'You breathe deep. The spores pour in like the second verse of a song you did not request. The world tilts. The walls go honest with you — too honest. They cover your posture, your credit, your odds. All three are bad. You are hallucinating now. Welcome to Spore Madness, the grotto\'s flagship wellness offering. The first class is free. All subsequent classes are also free, because you can never leave.', 5400);
      },
    });
  }

  // ── R3 — VINE TUNNEL: the glowing fruit, the trap, the hidden spore-wisdom shrine ──
  {
    const r = R('r3');
    once('eat_fruit_r3', r.x0, r.z1 - 1, '[R] Eat the glowing fruit', (e) => {
      e.healGreg(10);
      e.applyCondition(leaderId(e), 'hallucinating', 1);
      e.pushLog('The fruit is warm and tastes like the colour green, which is not a flavour but is being sold to you as one. +10 HP. The walls wave at you. The walls seem friendly. The walls are not friendly. The walls are landlords, Greg. Landlords wave.', 'system');
    });
    once('disarm_vine_trap_r3', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Disarm the vine trap (DEX)', (e) => {
      if (e.abilityCheck('dex', 12)) {
        e.deactivateTrap?.('snare');
        e.pushLog('You snip the trip-vine with surgical precision. The vine hangs limp. Somewhere a vine-manager nods slowly, takes a note, schedules a retraining. The vines respect a clean kill. They do not respect you. They respect the kill.', 'system');
      } else {
        e.damageGreg(3, 'vine trap');
        e.applyCondition(leaderId(e), 'rooted', 1);
        e.pushLog('The vines SNAP shut around your ankle. 3 damage, bound tight. Ah. The brochure. You didn\'t read the brochure. Nobody reads the brochure. The brochure is on a vine now. In retrospect, that was a hint. That was always a hint.', 'hit');
      }
    });
    // the spore-wisdom shrine — visible only to the hallucinating (Spore Madness end)
    out.push({
      id: 'spore_shrine_r3', pos: { x: r.x0 + 1, z: r.z0 + 2 }, radius: 2,
      label: '[R] Touch the hidden shrine',
      visibleIf: (e) => {
        if (e.questLog?.get('spore_madness')?.stage !== 'accepted' && e.questLog?.get('spore_madness')?.stage !== 'in_progress') return false;
        return (e.combat?.living('party')[0]?.conditions?.some?.((c: { id: string }) => c.id === 'hallucinating')) === true;
      },
      run: (e) => {
        e.completeQuest('spore_madness');
        e.setFlag('spore_wisdom');
        void e.narrate('f49_shrine', 'The shrine. A ring of quiet mushrooms, hidden where only hallucinating eyes could find it. You breathed the spores. You saw what they see. To them, you are now one of them — a registered spore-citizen, subject to their laws, protected by their indifference. Spore Wisdom: conditions fizzle against you twenty percent of the time. The spores respect their alumni. The spores also forget their alumni. It is mushrooms, Greg. There is a loyalty ceiling.', 5400);
        e.pushLog('🍄 Spore Wisdom gained: 20% of conditions fizzle against you. You are on the spores\' do-not-call list, which they consult roughly one in five times, because paperwork is not their strong suit.', 'system');
      },
    });
  }

  // ── R4 — HERMIT POOL: drink, the hidden chest, the mycologist turn-in.
  //    The Hermit Shroom himself is an NPC now — click him (he only talks
  //    while you are hallucinating). ──
  {
    const r = R('r4');
    const cx = (r.x0 + r.x1) >> 1, cz = (r.z0 + r.z1) >> 1;
    out.push({
      id: 'drink_pool_r4', pos: { x: cx, z: cz }, radius: 2,
      label: '[R] Drink the pool water',
      visibleIf: (e) => !e.hasFlag('pool_drank'),
      run: (e) => {
        e.setFlag('pool_drank');
        e.healGreg(15);
        e.applyCondition(leaderId(e), 'hallucinating', 2);
        void e.narrate('f49_drink_pool', 'You drink the water. You did not pay. You never pay. The world spins and re-negotiates its terms with you on the spot. A mushroom appears, currently shaped like an old man, currently talking. "Wow. You actually drank that," it says. "Bold. Reckless. I respect it." It does not respect it. It is a mushroom. It is doing a bit. You are now hallucinating, which down here just counts as reading the fine print.', 5400);
      },
    });
    // return the 5 glowing mushrooms → Mycologist's Request reward
    out.push({
      id: 'return_mushrooms_r4', pos: { x: r.x0, z: r.z1 }, radius: 2,
      label: '[R] Give the Hermit Shroom 5 Glowing Mushrooms',
      visibleIf: (e) => e.hasFlag('did_talk_hermit_r4') && e.hasItemInInventory('glowing_mushroom') && e.questLog?.get('mycologist_request')?.stage !== 'completed',
      run: (e) => {
        let given = 0;
        while (given < 5 && e.takeItem('glowing_mushroom')) given++;
        e.completeQuest('mycologist_request');
        e.pushLog('The Hermit Shroom inspects each mushroom with trembling gills. "Five," he says. "Perfect specimens. Science thanks you, fungus-friend. Science is also, full disclosure, three sheets to the wind." Science down here has a substance problem. Science down here has had a substance problem for several floors.', 'system');
      },
    });
    // the hidden chest — only visible while hallucinating
    out.push({
      id: 'hidden_chest_r4', pos: { x: r.x0 + 2, z: r.z0 + 1 }, radius: 2,
      label: '[R] Open the shimmering chest',
      visibleIf: (e) => e.hasFlag('pool_drank'),
      run: (e) => {
        grant(e, ['mushroom_cap', 'hallucinogenic_spore'], 25);
        e.pushLog('A chest you could NOT see sober. The hallucinations revealed it, the way a hangover reveals regrets. 25 gold, a Mushroom Cap, and a vial of the good stuff. The good stuff is, naturally, more hallucinogen. The whole economy down here is circular, and you are the circle.', 'system');
      },
    });
    once('harvest_moon_cap_r4', r.x0 + 3, r.z0 + 3, '[R] Harvest the Moon Cap', (e) => {
      grant(e, ['moon_cap']);
      e.pushLog('A Moon Cap — rare, luminous, worth real gold. It grows in moonlight it has never seen. It has never seen it because it works a hundred floors underground and is, frankly, lying. You pocket it gently. The Moon Cap has initiative, and you respect initiative.', 'system');
    });
  }

  // ── R5 — MUSHROOM CIRCLE: the offering (recruit Sporefriend), restore the seventh ──
  {
    const r = R('r5');
    const cx = (r.x0 + r.x1) >> 1, cz = (r.z0 + r.z1) >> 1;
    out.push({
      id: 'offering_r5', pos: { x: cx, z: cz }, radius: 2,
      label: '[R] Place a Glowing Mushroom in the offering bowl',
      visibleIf: (e) => e.hasItemInInventory('glowing_mushroom') && !e.hasFlag('sporefriend'),
      run: (e) => {
        e.takeItem('glowing_mushroom');
        e.setFlag('sporefriend');
        e.startQuest('mushroom_child');
        e.completeQuest('mushroom_child');
        void e.narrate('f49_offering', 'You place the mushroom in the bowl. The circle glows. A small mushroom bounces out, looks up at you, bounces again. It has decided. It has decided YOU. You have been adopted by a very small, very angry mushroom. The anger is because you are six feet of problems and it is six inches of spite. You match. Congratulations. You are a parent now. The paperwork is fungal.', 5400);
        e.pushLog('🍄 Sporefriend joins your party! It glows with loyalty and simmering resentment.', 'system');
        e.addCompanion?.('Sporefriend', 'Mushroom Child', { skin: 0xe8e0d0, cloth: 0xff8ac0, accent: 0xe8e0d0, hair: 0x2a2a3a, hood: false, monster: 'mushroom', bulk: 0.6 }, 15, { x: cx, z: cz });
      },
    });
    once('meditate_r5', cx + 2, cz, '[R] Sit in the circle and meditate', (e) => {
      e.healGreg(10);
      e.pushLog('You sit in the ring. The mushrooms hum in seven-part harmony, which is legally a choir. You breathe. +10 HP. For a moment, everything is fine. The moment passes. The choir pivots to your debt. They harmonize your debt. It is, regrettably, beautiful.', 'system');
    });
    once('harvest_circle_r5', r.x1, r.z1, '[R] Harvest the circle mushrooms', (e) => {
      grant(e, ['glowing_mushroom', 'glowing_mushroom', 'glowing_mushroom']);
      e.pushLog('You harvest the circle. The glow dims. The circle is now disappointed in you, which is worse than angry, because disappointment is the mushrooms\' love language. You are a mushroom thief. The mushrooms remember. The mushrooms remember everything. +3 Glowing Mushroom. Also three misdemeanor charges, emotionally.', 'system');
    });
    // Seven Is A Party — return the stolen Seventh Cap to complete the ring
    out.push({
      id: 'restore_seventh_r5', pos: { x: cx + 1, z: cz + 1 }, radius: 2,
      label: '[R] Place the Seventh Cap in the circle',
      visibleIf: (e) => e.hasItemInInventory('seventh_cap') && e.questLog?.get('seven_is_a_party')?.stage !== 'completed',
      run: (e) => {
        e.takeItem('seventh_cap');
        e.completeQuest('seven_is_a_party');
        // Sporefriend evolves — +5 max HP and a full heal, as celebration
        const sf = e.combat?.units.find((u) => u.name === 'Sporefriend');
        if (sf && sf.maxHp != null) { sf.maxHp += 5; sf.hp = sf.maxHp; }
        void e.narrate('f49_seventh', 'You place the Seventh Cap in the circle. The colors align. Seven mushrooms. Seven colors. Seven reasons to file an incident report. The circle hums like a festival that did not get a permit. You are invited. The small mushroom bounces so hard it achieves a low, respectful orbit. Growth. Real growth. The mushroom grows stronger. The mushroom is now your responsibility. Parenting is a verb.', 5400);
        e.pushLog('🎉 The circle is whole! Sporefriend grows stronger (+5 max HP) and glows with a pride that is, frankly, unearned but deeply felt. It is a mushroom. It is YOUR mushroom. You will never be free of it now. This is called love.', 'system');
      },
    });
  }

  // ── R6 — CENTRAL GROTTO: the crystal, the bed, the fragile bridge ──
  {
    const r = R('r6');
    once('take_crystal_r6', r.x0 + 4, r.z0 + 1, '[R] Take the glowing crystal', (e) => {
      grant(e, ['crystal_shard']);
      e.pushLog('The crystal is warm. It hums against your palm like a cat that has agreed, under protest, to be useful. A permanent light. The grotto\'s gift. Gifts from the grotto are tax-deductible. Please consult a spore. (+Crystal Shard)', 'system');
    });
    once('rest_bed_r6', r.x0 + 1, r.z1 - 1, '[R] Rest on the mushroom bed', (e) => {
      e.healGreg(10);
      e.pushLog('The mushroom bed cradles you. It is soft. It is alive. It breathes with you, which is either comforting or a breach of consent, depending on your therapist. +10 HP. You are now drowsy. The bed is not apologizing. The bed apologizes to no one. The bed is a manager.', 'system');
      e.applyCondition(leaderId(e), 'slowed', 1);
    });
    once('cross_bridge_r6', (r.x0 + r.x1) >> 1, r.z0, '[R] Cross the vine bridge', (e) => {
      if (Math.random() < 0.5) {
        e.damageGreg(2, 'fragile bridge');
        e.pushLog('The bridge sags. A plank gives way. You drop two feet onto your own dignity, which was not load-bearing. 2 damage. The bridge holds. Barely. The bridge is doing its best. The bridge is unionized and still doing its best.', 'hit');
      } else {
        e.pushLog('The bridge creaks and sways but holds, which the bridge announces with great personal pride. The vine rails hum with quiet menace. They are humming a song about you. It is not flattering. The bridge is the only thing here that told you the truth.', 'system');
      }
    });
  }

  // ── R7 — SPORE THRONE: pop the sacs, and after the mother falls — her tunnel ──
  {
    const r = R('r7');
    once('pop_sac_r7', r.x0 + 1, r.z0 + 1, '[R] Pop the spore sac', (e) => {
      e.damageGreg(2, 'spore sac');
      e.pushLog('You poke the sac. It POPS. A cloud of spores hits you in the face, which is exactly the facial the sac was saving for someone rude. 2 damage. The sac was the price of curiosity. The sac has been collecting that price for years. You paid retail.', 'hit');
    });
    // the hidden tunnel behind the throne — the mother's private way to the nursery
    out.push({
      id: 'throne_tunnel_r7', pos: { x: r.x1, z: r.z1 }, radius: 2,
      label: '[R] Enter the tunnel behind the throne',
      visibleIf: (e) => e.hasFlag('spore_mother_dead'),
      run: (e) => {
        const r8 = rooms.r8;
        const target = { x: r8.x0 + 2, z: r8.z0 + 1 };
        e.teleportParty?.(target);
        e.pushLog('Behind the throne, where the moss is worn smooth from commute, a tunnel. The mother used it to visit the nursery. It is small. It is quiet. It does not judge you for what you just did. It is the only thing in this grotto that does not. That is not a compliment. That is a structural observation.', 'system');
      },
    });
  }

  // ── R8 — DEEP POOLS: the three-pool puzzle ──
  {
    const r = R('r8');
    const pools: { id: string; x: number; z: number; label: string; kind: 'heal' | 'poison' | 'reveal' }[] = [
      { id: 'pool_heal', x: r.x0 + 1, z: r.z0 + 1, label: '[R] Drink from Pool 1 (blue)', kind: 'heal' },
      { id: 'pool_poison', x: r.x0 + 3, z: r.z0 + 2, label: '[R] Drink from Pool 2 (green)', kind: 'poison' },
      { id: 'pool_reveal', x: r.x1 - 1, z: r.z0 + 4, label: '[R] Drink from Pool 3 (purple)', kind: 'reveal' },
    ];
    for (const p of pools) {
      out.push({
        id: p.id, pos: { x: p.x, z: p.z }, radius: 2, label: p.label,
        visibleIf: (e) => !e.hasFlag(`did_${p.id}`),
        run: (e) => {
            e.setFlag(`did_${p.id}`);
          if (p.kind === 'heal') {
            e.healGreg(15);
            e.pushLog('Pool 1: crystal-sweet. Warmth floods you like a refund you did not expect and are not sure you deserve. +15 HP. The pool looks smug. The pool knew. The pool always knew.', 'system');
          } else if (p.kind === 'poison') {
            e.damageGreg(4, 'pool water');
            e.applyCondition(leaderId(e), 'poisoned', 3);
            e.pushLog('Pool 2: it tastes like regret and battery acid. 4 damage. You are Poisoned. The bubbles were a warning. The bubbles were, in retrospect, extremely clear. You do not read bubbles, Greg. This is a pattern.', 'hit');
          } else {
            e.applyCondition(leaderId(e), 'hallucinating', 2);
            e.pushLog('Pool 3: the world swims. You see the waterfall passage in r9 — it hides something. You see a shard of crystal under the pool floor. You see your own choices, reflected, from angles. The truth is a drug. You are, briefly, high on accountability.', 'system');
            e.setFlag('pool_reveal_seen');
          }
        },
      });
    }
    once('search_skeleton_r8', r.x1, r.z1 - 1, '[R] Search the submerged skeleton', (e) => {
      grant(e, ['waterlogged_boots'], 12);
      e.pushLog('A diver, long gone. 12 gold and Waterlogged Boots. They are still wet. They have been wet since before your species had opinions. The boots are a metaphor. Do not think about the boots. Think about the boots. You cannot stop thinking about the boots now.', 'system');
    });
    once('take_crystal_r8', r.x0, r.z1, '[R] Take the underwater crystal', (e) => {
      grant(e, ['crystal_shard']);
      e.pushLog('A second crystal. The grotto gives freely. The grotto does not miss what you take. The grotto counts, though. The grotto has a ledger. The grotto will reconcile, in fungi, at a time of its choosing. Everything is counted. You are on the list.', 'system');
    });
  }

  // ── R9 — FLOODED CAVE: the waterfall passage (the exit) + the floating chest ──
  {
    const r = R('r9');
    once('search_waterfall_r9', r.x0, midZ(r), '[R] Search behind the waterfall', (e) => {
      if (e.abilityCheck('wis', 12)) {
        e.setFlag('waterfall_found');
        void e.narrate('f49_waterfall', 'Behind the curtain of water, a stone staircase going up. The waterfall was hiding it. The waterfall is a terrible secret-keeper — it literally cannot stop talking — but an excellent shower. You found the way forward. You are dripping wet, standing behind a waterfall, having what can only be described as a moment. It is not your best moment. It is, however, your most on-brand moment.', 5400);
        e.pushLog('Behind the curtain of water — a stone staircase, going up!', 'system');
      } else {
        e.pushLog('You duck behind the waterfall and get soaked. Just rock. The water is very confident about being here. The water has never doubted itself for one second. The water has a LinkedIn. You are wet now. The water considers this a successful interaction.', 'system');
      }
    });
    once('open_chest_r9', r.x1 - 1, r.z1, '[R] Open the floating chest', (e) => {
      grant(e, ['frog_skin_cloak'], 18);
      e.pushLog('The chest bobs in the water, sealed with wax and optimism. 18 gold and a Frog Skin Cloak. It came off a very large frog. The frog is no longer with us. The frog had a beautiful singing voice. The frog is gone. The frog had debts. You inherited the cloak. The debts, mercifully, did not transfer. Life is strange. The frog would have wanted you to have it. The frog would have wanted a lot of things. The frog is gone.', 'system');
    });
    out.push({
      id: 'exit_stairs', pos: { x: r.x0 + 2, z: r.z0 + 1 }, radius: 2,
      label: '[R] Climb the stairs to Floor 48',
      visibleIf: (e) => e.hasFlag('waterfall_found') && e.hasFlag('spore_mother_dead'),
      run: (e) => {
        e.completeQuest('through_grotto');
        void e.narrate('f49_departure', 'The staircase is cold. The staircase is stone. The staircase goes UP. Behind you, the grotto dims. The mushrooms wave. Some of them are crying. Some of them are laughing. It is, genuinely, hard to tell with mushrooms — their facial situation is ongoing. You climb toward Floor 48. You climb toward the DREAMER. You climb because the mushrooms are already starting to gossip, and the gossip travels fast, and it is, I am told, not flattering.', 5800);
        e.winGame?.();
      },
    });
  }

  // ── R10 — SPORE FARM: harvest rows + the scarecrow (a skeleton in a mushroom hat) ──
  {
    const r = R('r10');
    once('harvest_farm_r10', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Harvest the farm rows', (e) => {
      grant(e, ['glowing_mushroom', 'glowing_mushroom', 'glowing_mushroom', 'moon_cap']);
      e.pushLog('You work the rows like a professional. Three glowing mushrooms and a Moon Cap. The farm approves of your technique. The farm has, technically, no eyes, but it is watching you in the way a quarterly report watches a division — coldly, and with numbers. The farm is impressed. The farm is always impressed. It\'s a farm.', 'system');
    });
    once('search_scarecrow_r10', r.x1 - 1, r.z0 + 1, '[R] Search the scarecrow', (e) => {
      grant(e, ['glowing_spore', 'mushroom_cap']);
      void e.narrate('f49_scarecrow', 'You search the scarecrow. It is a skeleton in a hat. The hat is a mushroom. There is a note pinned to its ribs: "Do not steal the mushroom hats. — the farm, probably." You take the hat anyway. The skeleton does not object. The skeleton is dead. The mushroom hat, however, is furious, and the mushroom hat has a note. The mushroom hat ALWAYS has a note. You are now wearing a furious note. This is your life now.', 5000);
    });
  }

  // ── R11 — THE ROTTING TREE: the hollow trunk holds the Seventh Cap ──
  {
    const r = R('r11');
    once('search_tree_r11', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Reach into the hollow trunk', (e) => {
      grant(e, ['seventh_cap', 'vine_fiber']);
      e.startQuest('seven_is_a_party');
      e.pushLog('You reach into the hollow trunk. It is warm. It is breathing. It is a mushroom that has been pretending to be a tree for four hundred years and it has been HOLDING something — a cap. A cap of impossible colour. The Seventh Cap. The tree gives it to you like a gift. The tree is a mushroom. The mushroom is sentimental. The mushroom has a retirement plan and it is YOU. Take the cap. Complete the circle. Fulfill the mushroom\'s life goals. This is your purpose now.', 'system');
    });
  }

  // ── R12 — THE PICNIC: an ancient lunch and a very old skeleton ──
  {
    const r = R('r12');
    once('search_picnic_r12', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Search the picnic basket', (e) => {
      grant(e, ['cave_fish_meat', 'cave_fish_meat'], 12);
      void e.narrate('f49_picnic', 'A picnic basket. A blanket. A tiny jar of something that used to be jam and is now a philosophical question. The adventurers who sat here are gone, but their lunch remains. You eat the bread. The bread is a thousand years old. The bread is IMMORTAL. The bread has outlived nations. You gain twelve gold and two cave fish. Do not ask how long the fish were in the basket. Do not ask the basket. The basket has seen things. The basket is not testifying. The basket invokes the fifth.', 5200);
    });
  }

  // ── R13 — SPORE NURSERY: the mother's journal, her stash, and a LOT of guilt ──
  {
    const r = R('r13');
    once('read_journal_r13', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Read the Spore Mother\'s journal', (e) => {
      grant(e, ['glowing_spore', 'glowing_spore', 'moon_cap']);
      e.runStats.secretsFound += 1;
      void e.narrate('f49_nursery', 'You read the Spore Mother\'s journal. It is written in a careful, motherly hand. "Baby 3 tried to grow legs today. So proud." That is page one. There are many pages. There are SO many pages. Every baby mushroom. Every milestone. Every near-miss with the waterfall. The last entry is from yesterday. It says: "Someone is coming. Someone always comes. This time I will keep the nursery safe. This time I will dream louder." You put the journal down. You feel like garbage. You still have to go fight her. You do not want to. You are going to anyway, because you are Greg, and Greg is a verb, and the verb is "ruins things."', 5800);
      e.pushLog('🗝 Secret found — the nursery behind the throne! (2 Glowing Spores + a Moon Cap)', 'system');
    });
    once('open_stash_r13', r.x1, r.z1, '[R] Open the mother\'s stash', (e) => {
      grant(e, ['glowing_spore', 'crystal_shard'], 20);
      e.pushLog('The stash: 20 gold, a glowing spore, a crystal shard. The mother\'s private savings. She was saving for a bigger nursery. She was saving for college, Greg. Mushroom college. It exists. It is competitive. You take it. The small mushrooms watch. The small mushrooms say nothing. The small mushrooms are better people than you. The small mushrooms know it. You know it. The mushrooms are keeping score.', 'system');
    });
  }

  // ── R14 — THE MIMIC DEN: one chest. In the middle. Open it. You know you want to. ──
  {
    const r = R('r14');
    const cx = (r.x0 + r.x1) >> 1, cz = (r.z0 + r.z1) >> 1;
    out.push({
      id: 'open_mimic_r14', pos: { x: cx, z: cz }, radius: 2,
      label: '[R] Open the chest',
      visibleIf: (e) => !e.hasFlag('mimic_sprung'),
      run: (e) => {
        e.setFlag('mimic_sprung');
        e.aggroGroup?.('r14_mimic');
        void e.narrate('f49_mimic', 'You open the chest. The chest opens BACK. The chest has teeth. The chest has a tongue. The chest has been waiting three hundred years for someone to do exactly what you just did, and the chest has a pension plan, and THIS is its retirement. Congratulations. You are the main course at the mimic\'s retirement party. The party has a theme. The theme is YOU. The dress code is "tender." You did not RSVP. The mimic does not care.', 5200);
      },
    });
    out.push({
      id: 'loot_mimic_r14', pos: { x: cx, z: cz }, radius: 2,
      label: '[R] Loot the mimic\'s guts',
      visibleIf: (e) => {
        if (!e.hasFlag('mimic_sprung')) return false;
        return e.combat?.units.some((u) => u.groupId === 'r14_mimic' && u.alive) === false;
      },
      run: (e) => {
        grant(e, ['fungal_blade', 'crystal_shard'], 30);
        e.pushLog('Inside the mimic: a Fungal Blade, a crystal shard, 30 gold, and a half-eaten adventurer\'s boot. The boot has a story. The boot is not telling. The boot is in witness protection. 30 gold and a Fungal Blade! The mimic\'s retirement fund is now your advance. This is called "upcycling." The dungeon calls it "Tuesday."', 'system');
      },
    });
  }

  // ── R15 — SPORE-GROUNDS: read the tombstones. Loot the groundskeeper. ──
  {
    const r = R('r15');
    once('search_graves_r15', r.x0 + 2, r.z0, '[R] Read the tombstones', (e) => {
      grant(e, ['vine_fiber', 'glowing_spore'], 8);
      e.pushLog('You read the tombstones. "Bert — eaten by the mushroom he trusted." "Sandra — trusted the mushroom." "Steve — did not trust the mushroom. The mushroom was offended. Eaten anyway." Trust is not a strategy down here. Neither is distrust. You find 8 gold and a vine fiber on the groundskeeper\'s grave. The mushrooms do not comment. The mushrooms are very good at not commenting. The mushrooms have media training. That is the scary part.', 'system');
    });
  }

  // ── R16 — ECHO CHAMBER: say something. It keeps it. Forever. ──
  {
    const r = R('r16');
    once('speak_echo_r16', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Say something to the chamber', (e) => {
      grant(e, ['crystal_shard']);
      void e.narrate('f49_echo', 'You say hello. The chamber says hello. And hello. And hello. And hello. Each one slower, louder, meaner — like a corporate read receipt that gained sentience and a grudge. You say something dumb. The chamber keeps it. Forever. The crystals shimmer with delight. Somewhere in the grotto, a mushroom laughs at you. The chamber pays you in crystal for your contribution. Your contribution is a shame. The crystal is real, though. Take the crystal. The shame is free.', 4800);
    });
  }

  // ── R17 — MYCELIAL HIGHWAY: take the road's "sun" ──
  {
    const r = R('r17');
    once('take_highway_crystal_r17', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Take the highway crystal', (e) => {
      grant(e, ['crystal_shard']);
      e.pushLog('You take the crystal. The highway dims, just a little. The highway hums a sad chord — it is a song about you. It is not a flattering song. The song has lyrics. The lyrics are about your gait. Your gait has been judged. The highway is free therapy if you listen wrong, and you always listen wrong. The crystal is yours. The song remains the highway\'s.', 'system');
    });
  }

  // ── R18 — THE SLEEPING GIANT: wake it. You know you want to. ──
  {
    const r = R('r18');
    const cx = (r.x0 + r.x1) >> 1, cz = (r.z0 + r.z1) >> 1;
    out.push({
      id: 'harvest_giant_r18', pos: { x: cx, z: cz }, radius: 2,
      label: '[R] Wake the Sleeping Giant',
      visibleIf: (e) => !e.hasFlag('giant_woke'),
      run: (e) => {
        e.setFlag('giant_woke');
        e.aggroGroup?.('r18_giant');
        void e.narrate('f49_giant_wake', 'You touch the giant mushroom. It stops snoring. One eye opens. It is the size of a dinner plate, and it is FULL of the surface it has never seen — full of sun, full of rain, full of whatever "weather" is. "Oh," it says, in a voice like falling trees and bad news, "so YOU are the one." The grotto holds its breath. You did this. You saw a sleeping mountain and decided it looked like it needed a comment. You woke the giant. The giant has opinions. The giant\'s first opinion is you.', 5400);
      },
    });
    out.push({
      id: 'loot_giant_r18', pos: { x: r.x0 + 4, z: r.z0 + 1 }, radius: 2,
      label: '[R] Take what the Giant was dreaming of',
      visibleIf: (e) => {
        if (!e.hasFlag('giant_woke')) return false;
        return e.combat?.units.some((u) => u.groupId === 'r18_giant' && u.alive) === false;
      },
      run: (e) => {
        grant(e, ['giant_cap', 'crystal_shard', 'crystal_shard'], 30);
        e.pushLog('The Giant\'s cap, two crystal shards, 30 gold. The Giant dreamed of the surface. You took its dream and converted it to loot at a very poor exchange rate. This is who you are. This is who you have always been. The Giant is gone. The Giant\'s dream is now your inventory. You are a dream-laundering operation with a sword. The crystals are nice, though.', 'system');
      },
    });
  }

  return out;
}

function midZ(r: Rect): number {
  return (r.z0 + r.z1) >> 1;
}
