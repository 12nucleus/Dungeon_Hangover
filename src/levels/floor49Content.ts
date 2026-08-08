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
  r1: "You enter the Fungal Grotto. It's beautiful. It's glowing. It's ALIVE. It's also judging you. You can tell. The mushrooms have opinions, and one of them is about your posture. Whatever. You're here. You're breathing. The mushrooms hate that.",
  r2: "The spores. Everywhere. You can see them because they are literally in your face. You can breathe them. You probably shouldn't. You're going to anyway, because you're you, and 'you' is the word for 'a person who breathes the spores.'",
  r3: "The vines move. The vines are alive. The vines are not your friends. I know, I know — 'vines are plants, plants are chill.' That's what the LAST guy thought. The last guy is mulch. The vines are NEVER your friends.",
  r4: "A pool. Crystal clear. Underground. This is fine. Everything is fine. Do not drink the water. Do not even LOOK at the water. Look at the water, Greg. Drink the water, Greg. You know you want to. You KNOW you want to.",
  r5: "Seven mushrooms. Seven colors. Seven is a MAGIC number. This is either a ritual or a party. Either way, you're not invited. Unless you bring a mushroom. Then you're the main course AND the entertainment.",
  r6: "The central grotto. The HEART of the fungal forest. The mushrooms here are bigger. Older. Wiser. WATCHING. It's like walking into a library where every librarian is a mushroom and every book is a judgment.",
  r7: "The throne. The Spore Mother. The thing that rules this garden. The thing that dreams this garden. The thing that IS this garden. Also, technically, the thing that wrote 'meat' in her diary. You read that. You can't unread that.",
  r8: "Three pools. Three choices. One heals. One poisons. One shows you the truth. You don't know which is which. You could test them. You could be smart. You're going to guess, aren't you. You're going to guess, and you're going to be wrong, and it's going to be FANTASTIC.",
  r9: "Water. Knee-deep. Cold. Something is moving in it. Something with legs. Something with a tongue. Something that has watched every one of your mistakes today and has a FIVE-STAR review prepared.",
  r10: "A mushroom farm. Rows and rows of glowing caps, all standing at attention like tiny soldiers. Somewhere, a farmer is proud. The farmer is a skeleton. The skeleton is wearing a hat. The hat is a mushroom.",
  r11: "The Rotting Tree. It's not a tree. It's a mushroom that wanted to be a tree so badly it practiced for four hundred years. It almost made it. The hollow trunk is full of secrets, and the kind of quiet that means something is definitely watching you.",
  r12: "A picnic. A full, untouched picnic. Blanket, basket, little cups. The only thing missing is whoever was supposed to be eating it. They are, presumably, fertilizer now. The view is beautiful. The view is the last thing they saw.",
  r13: "The nursery. Small mushrooms. Dozens of them. They glow like tiny lanterns, and they're all watching you with the wrong amount of innocence. These are the Spore Mother's children. She loved them. She loved them so much she put a sign on the door. The sign says 'keep out.' You kept out. For once. Mostly.",
  r14: "A treasure room. A single chest. In the middle of the floor. Untouched. Unlocked. Practically glowing with 'open me.' Nobody leaves a chest in the middle of a room unless they're lazy, careless, or the chest is ALIVE. This chest has been very patient. This chest has DREAMS.",
  r15: "The spore-grounds. A graveyard for adventurers who trusted the wrong mushroom. Every tombstone has a mushroom growing on it. The mushrooms are not mourning. The mushrooms are celebrating a job well done.",
  r16: "The echo chamber. Every sound you make comes back to you, repeated, layered, judgmental. Say something dumb in here and you'll hear it for the rest of your life. The crystals are recording. This is the grotto's Twitter.",
  r17: "The mycelial highway. The grotto's own road system, built from the dreams of mushrooms. It glows green and gold. It hums. It goes exactly where you need it to go. That is suspicious. Everything in this grotto is suspicious. But at least the walk is nice.",
  r18: "The Sleeping Giant. A mushroom the size of a house, snoring softly. Its dreams smell like the surface. If you wake it up, it will be VERY angry about the surface. If you don't wake it up, you'll wonder forever. You're going to wake it up. Of course you're going to wake it up.",
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
      e.pushLog('An adventurer in mushroom-crusted gear. 8 gold and a glowing spore vial. A note, still legible: "The mushrooms are NOT friendly. The mushrooms are NEVER friendly. — signed, someone who was wrong once and then never again."', 'system');
    });
    once('harvest_r1', r.x0 + 1, r.z1, '[R] Harvest the glowing mushrooms', (e) => {
      grant(e, ['glowing_mushroom', 'glowing_mushroom']);
      e.pushLog('You pluck two glowing mushrooms. They pulse gently, offended. +2 Glowing Mushroom.', 'system');
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
          e.pushLog('The mushroom EXPLODES. Not with fire. With spores. With a cloud of VERY ANGRY spores. This is the mushroom\'s revenge. This is what happens when you touch a mushroom without asking. The mushroom asked. You ignored it. Rude.', 'hit');
          if (Math.random() < 0.5) e.applyCondition(leaderId(e), 'nauseated', 3);
        } else {
          picked.push(h.item);
        }
      }
      if (picked.length) {
        grant(e, picked);
        e.pushLog(`You salvage ${picked.length} mushrooms before the caps stop glowing. The farm will remember this.`, 'system');
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
        void e.narrate('f49_breathe', 'You breathe deep. The spores pour in. The world tilts. The walls become very honest with you — TOO honest. They tell you about your posture. They are right. You are hallucinating now. Welcome to Spore Madness. It is the best quest in the grotto, and you are already failing it.', 5400);
      },
    });
  }

  // ── R3 — VINE TUNNEL: the glowing fruit, the trap, the hidden spore-wisdom shrine ──
  {
    const r = R('r3');
    once('eat_fruit_r3', r.x0, r.z1 - 1, '[R] Eat the glowing fruit', (e) => {
      e.healGreg(10);
      e.applyCondition(leaderId(e), 'hallucinating', 1);
      e.pushLog('The fruit is warm and tastes like the colour green. +10 HP. The walls are waving at you now. The walls seem nice. The walls are NOT nice.', 'system');
    });
    once('disarm_vine_trap_r3', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Disarm the vine trap (DEX)', (e) => {
      if (e.abilityCheck('dex', 12)) {
        e.deactivateTrap?.('snare');
        e.pushLog('You snip the trip-vine with surgical precision. The trap hangs, harmless. The vines respect the hustle.', 'system');
      } else {
        e.damageGreg(3, 'vine trap');
        e.applyCondition(leaderId(e), 'rooted', 1);
        e.pushLog('The vines SNAP shut around your ankle! 3 damage, and you are bound tight. The vines are not your friends. They never were. They said so in the brochure.', 'hit');
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
        void e.narrate('f49_shrine', 'The shrine. A ring of quiet mushrooms, hidden where only hallucinating eyes can find it. You breathed the spores. You saw what they see. The shrine pulses once — a blessing. Spore Wisdom: the spores recognize one of their own. They will leave you alone more often now. Mostly. It is mushrooms. There is a limit.', 5400);
        e.pushLog('🍄 Spore Wisdom gained: 20% of conditions fizzle against you. The spores respect their alumni.', 'system');
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
        void e.narrate('f49_drink_pool', 'You drink the water. The world spins. The world changes. You see things. You see a mushroom. The mushroom is an OLD MAN. The mushroom is talking to you. The mushroom says: "Wow. You really drank that. Bold. Reckless. I like it." The mushroom is lying. It is a mushroom. It does not like anything.', 5400);
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
        e.pushLog('The Hermit Shroom inspects each mushroom with trembling gills. "Five. PERFECT specimens. Science thanks you, fungus-friend. Science is very drunk."', 'system');
      },
    });
    // the hidden chest — only visible while hallucinating
    out.push({
      id: 'hidden_chest_r4', pos: { x: r.x0 + 2, z: r.z0 + 1 }, radius: 2,
      label: '[R] Open the shimmering chest',
      visibleIf: (e) => e.hasFlag('pool_drank'),
      run: (e) => {
        grant(e, ['mushroom_cap', 'hallucinogenic_spore'], 25);
        e.pushLog('A chest you could NOT see before. The hallucinations revealed it. 25 gold, a Mushroom Cap, and a vial of the good stuff. The good stuff is, of course, more hallucinogen. It is a lifestyle.', 'system');
      },
    });
    once('harvest_moon_cap_r4', r.x0 + 3, r.z0 + 3, '[R] Harvest the Moon Cap', (e) => {
      grant(e, ['moon_cap']);
      e.pushLog('A Moon Cap — rare, luminous, and worth real gold. It only grows in moonlight it has never seen. It is very proud of that. You pocket it gently.', 'system');
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
        void e.narrate('f49_offering', 'You place the mushroom in the bowl. The circle glows. A small mushroom bounces out of the circle, looks up at you, and bounces once. Twice. It has decided. I have been adopted by a very small, very angry mushroom. The anger is because I am six feet tall and it is six inches. We have a lot in common.', 5400);
        e.pushLog('🍄 Sporefriend joins your party! It glows with loyalty and simmering resentment.', 'system');
        e.addCompanion?.('Sporefriend', 'Mushroom Child', { skin: 0xe8e0d0, cloth: 0xff8ac0, accent: 0xe8e0d0, hair: 0x2a2a3a, hood: false, monster: 'mushroom', bulk: 0.6 }, 15);
      },
    });
    once('meditate_r5', cx + 2, cz, '[R] Sit in the circle and meditate', (e) => {
      e.healGreg(10);
      e.pushLog('You sit in the ring. The mushrooms hum in seven-part harmony. You breathe. +10 HP. For a moment, everything is fine. The moment passes. The mushrooms start humming about your debt to society.', 'system');
    });
    once('harvest_circle_r5', r.x1, r.z1, '[R] Harvest the circle mushrooms', (e) => {
      grant(e, ['glowing_mushroom', 'glowing_mushroom', 'glowing_mushroom']);
      e.pushLog('You harvest the circle. The glow DIMS. The circle is sad now. You are a mushroom thief. The mushrooms will remember this. The mushrooms remember EVERYTHING. +3 Glowing Mushroom.', 'system');
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
        void e.narrate('f49_seventh', 'You place the Seventh Cap in the circle. The colors align. The mushrooms light up like a festival. Seven mushrooms. Seven colors. Seven friends, reunited at last. The circle hums. The party begins. You are invited. You were ALWAYS invited. The small mushroom bounces so hard it levitates.', 5400);
        e.pushLog('🎉 The circle is whole! Sporefriend grows stronger (+5 max HP) and glows with pride. It is a mushroom. It is YOUR mushroom.', 'system');
      },
    });
  }

  // ── R6 — CENTRAL GROTTO: the crystal, the bed, the fragile bridge ──
  {
    const r = R('r6');
    once('take_crystal_r6', r.x0 + 4, r.z0 + 1, '[R] Take the glowing crystal', (e) => {
      grant(e, ['crystal_shard']);
      e.pushLog('The crystal is WARM. It hums against your palm. A permanent light — the grotto\'s gift. (+Crystal Shard)', 'system');
    });
    once('rest_bed_r6', r.x0 + 1, r.z1 - 1, '[R] Rest on the mushroom bed', (e) => {
      e.healGreg(10);
      e.pushLog('The mushroom bed cradles you. It is soft. It is alive. It is breathing WITH you. +10 HP — but you feel drowsy... The bed is not apologizing. The bed does not apologize.', 'system');
      e.applyCondition(leaderId(e), 'slowed', 1);
    });
    once('cross_bridge_r6', (r.x0 + r.x1) >> 1, r.z0, '[R] Cross the vine bridge', (e) => {
      if (Math.random() < 0.5) {
        e.damageGreg(2, 'fragile bridge');
        e.pushLog('The bridge SAGS. A plank gives way. You drop 2 feet onto your dignity. 2 damage. The bridge holds. Barely. The bridge is doing its best. The bridge deserves a raise.', 'hit');
      } else {
        e.pushLog('The bridge creaks and sways, but you cross it. The vine rails hum with quiet menace. They are humming a song about you. It is not flattering.', 'system');
      }
    });
  }

  // ── R7 — SPORE THRONE: pop the sacs, and after the mother falls — her tunnel ──
  {
    const r = R('r7');
    once('pop_sac_r7', r.x0 + 1, r.z0 + 1, '[R] Pop the spore sac', (e) => {
      e.damageGreg(2, 'spore sac');
      e.pushLog('You poke the sac. It POPS. A cloud of spores hits you in the face. 2 damage. The sac was the price of curiosity. The sac was happy to collect.', 'hit');
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
        e.pushLog('Behind the throne, where the moss is worn smooth, a tunnel. The mother used it to visit the nursery. The tunnel is small. The tunnel is quiet. The tunnel does not judge you for what you just did. The tunnel is the only thing in this grotto that does not.', 'system');
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
            e.pushLog('Pool 1: crystal-sweet. Warmth floods through you. +15 HP. The pool looks smug, like it knew you would pick it by accident.', 'system');
          } else if (p.kind === 'poison') {
            e.damageGreg(4, 'pool water');
            e.applyCondition(leaderId(e), 'poisoned', 3);
            e.pushLog('Pool 2: it TASTES like regret and battery acid. 4 damage, and you are Poisoned. The bubbles were a warning. You should learn to read bubbles.', 'hit');
          } else {
            e.applyCondition(leaderId(e), 'hallucinating', 2);
            e.pushLog('Pool 3: the world swims. You see the waterfall passage in r9 — it hides something. And you see a shard of crystal under the pool floor... The truth is a drug. You are high on truth.', 'system');
            e.setFlag('pool_reveal_seen');
          }
        },
      });
    }
    once('search_skeleton_r8', r.x1, r.z1 - 1, '[R] Search the submerged skeleton', (e) => {
      grant(e, ['waterlogged_boots'], 12);
      e.pushLog('A diver, long gone. 12 gold and Waterlogged Boots. They are still wet. They will always be wet. The boots are a metaphor. Do not think about the boots.', 'system');
    });
    once('take_crystal_r8', r.x0, r.z1, '[R] Take the underwater crystal', (e) => {
      grant(e, ['crystal_shard']);
      e.pushLog('A second crystal. The grotto gives freely — it does not miss what you take. It counts, though. Everything is counted.', 'system');
    });
  }

  // ── R9 — FLOODED CAVE: the waterfall passage (the exit) + the floating chest ──
  {
    const r = R('r9');
    once('search_waterfall_r9', r.x0, midZ(r), '[R] Search behind the waterfall', (e) => {
      if (e.abilityCheck('wis', 12)) {
        e.setFlag('waterfall_found');
        void e.narrate('f49_waterfall', 'Behind the curtain of water, a stone staircase, going up. The waterfall was hiding it. The waterfall is a terrible secret-keeper but an excellent shower. You found the way forward. You beautiful, dripping idiot. You found it.', 5400);
        e.pushLog('Behind the curtain of water — a stone staircase, going up!', 'system');
      } else {
        e.pushLog('You duck behind the waterfall and get soaked. Just rock. The water is very confident about being here. The water has never doubted itself for one second.', 'system');
      }
    });
    once('open_chest_r9', r.x1 - 1, r.z1, '[R] Open the floating chest', (e) => {
      grant(e, ['frog_skin_cloak'], 18);
      e.pushLog('The chest bobs in the water, sealed with wax. 18 gold and a Frog Skin Cloak. It came off a very large frog. The frog is no longer with us. The frog had a beautiful singing voice. The frog is gone. Life is strange.', 'system');
    });
    out.push({
      id: 'exit_stairs', pos: { x: r.x0 + 2, z: r.z0 + 1 }, radius: 2,
      label: '[R] Climb the stairs to Floor 48',
      visibleIf: (e) => e.hasFlag('waterfall_found') && e.hasFlag('spore_mother_dead'),
      run: (e) => {
        e.completeQuest('through_grotto');
        void e.narrate('f49_departure', 'The staircase is cold. The staircase is stone. The staircase goes UP. Behind you, the grotto dims. The mushrooms wave. Some of them are crying. Some of them are laughing. It is hard to tell with mushrooms. You climb toward Floor 48. You climb toward the DREAMER. You climb because that is what you do.', 5800);
        e.winGame?.();
      },
    });
  }

  // ── R10 — SPORE FARM: harvest rows + the scarecrow (a skeleton in a mushroom hat) ──
  {
    const r = R('r10');
    once('harvest_farm_r10', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Harvest the farm rows', (e) => {
      grant(e, ['glowing_mushroom', 'glowing_mushroom', 'glowing_mushroom', 'moon_cap']);
      e.pushLog('You work the rows like a professional. Three glowing mushrooms and a Moon Cap. The farm approves of your technique. The farm has no technique. The farm is impressed anyway.', 'system');
    });
    once('search_scarecrow_r10', r.x1 - 1, r.z0 + 1, '[R] Search the scarecrow', (e) => {
      grant(e, ['glowing_spore', 'mushroom_cap']);
      void e.narrate('f49_scarecrow', 'You search the scarecrow. It is a skeleton in a hat. The hat is a mushroom. There is a note pinned to its ribs: "Do not steal the mushroom hats. — the farm, probably." You take the hat anyway. The skeleton does not object. The skeleton is DEAD. The mushroom hat, however, is FURIOUS.', 5000);
    });
  }

  // ── R11 — THE ROTTING TREE: the hollow trunk holds the Seventh Cap ──
  {
    const r = R('r11');
    once('search_tree_r11', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Reach into the hollow trunk', (e) => {
      grant(e, ['seventh_cap', 'vine_fiber']);
      e.startQuest('seven_is_a_party');
      e.pushLog('You reach into the hollow trunk. It is warm. It is breathing. It is a mushroom pretending to be a tree, and it has been holding something for you — a cap. A cap of impossible colour. The Seventh Cap. The tree gives it to you like a gift. The tree is a mushroom. The mushroom is sentimental.', 'system');
    });
  }

  // ── R12 — THE PICNIC: an ancient lunch and a very old skeleton ──
  {
    const r = R('r12');
    once('search_picnic_r12', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Search the picnic basket', (e) => {
      grant(e, ['cave_fish_meat', 'cave_fish_meat'], 12);
      void e.narrate('f49_picnic', 'A picnic basket. A blanket. A tiny jar of something that used to be jam. The adventurers who sat here are gone, but their lunch remains. You eat the bread. The bread is a thousand years old. The bread is IMMORTAL. You gain twelve gold and two cave fish. Do not ask how long the fish were in the basket. Do not ask the basket. The basket has seen things.', 5200);
    });
  }

  // ── R13 — SPORE NURSERY: the mother's journal, her stash, and a LOT of guilt ──
  {
    const r = R('r13');
    once('read_journal_r13', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Read the Spore Mother\'s journal', (e) => {
      grant(e, ['glowing_spore', 'glowing_spore', 'moon_cap']);
      e.runStats.secretsFound += 1;
      void e.narrate('f49_nursery', 'You read the Spore Mother\'s journal. It is written in a careful, motherly hand: "Baby 3 tried to grow legs today. So proud. Note to self: do not let Baby 3 near the waterfall." The last entry is from yesterday. It says: "Someone is coming. Someone always comes. This time I will keep the nursery safe. This time I will dream louder." You put the journal down. You feel like garbage. You still have to go fight her. That is what you do.', 5800);
      e.pushLog('🗝 Secret found — the nursery behind the throne! (2 Glowing Spores + a Moon Cap)', 'system');
    });
    once('open_stash_r13', r.x1, r.z1, '[R] Open the mother\'s stash', (e) => {
      grant(e, ['glowing_spore', 'crystal_shard'], 20);
      e.pushLog('The stash: 20 gold, a glowing spore, a crystal shard. The mother\'s private savings. She was saving for a bigger nursery. You take it. The small mushrooms watch. The small mushrooms say nothing. The small mushrooms are better people than you.', 'system');
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
        void e.narrate('f49_mimic', 'You open the chest. The chest opens BACK. The chest has teeth. The chest has a tongue. The chest has been waiting three hundred years for someone to do exactly what you just did. Congratulations. You are the main course at the mimic\'s retirement party.', 5200);
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
        e.pushLog('Inside the mimic: a Fungal Blade, a crystal shard, 30 gold, and a half-eaten adventurer\'s boot. The boot has a story. The boot is not telling. 30 gold and a Fungal Blade!', 'system');
      },
    });
  }

  // ── R15 — SPORE-GROUNDS: read the tombstones. Loot the groundskeeper. ──
  {
    const r = R('r15');
    once('search_graves_r15', r.x0 + 2, r.z0, '[R] Read the tombstones', (e) => {
      grant(e, ['vine_fiber', 'glowing_spore'], 8);
      e.pushLog('You read the tombstones. "Bert — eaten by the mushroom he trusted." "Sandra — trusted the mushroom." "Steve — did NOT trust the mushroom. The mushroom was offended. Eaten anyway." You find 8 gold and a vine fiber on the groundskeeper\'s grave. The mushrooms do not comment. The mushrooms are very good at not commenting.', 'system');
    });
  }

  // ── R16 — ECHO CHAMBER: say something. It keeps it. Forever. ──
  {
    const r = R('r16');
    once('speak_echo_r16', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Say something to the chamber', (e) => {
      grant(e, ['crystal_shard']);
      void e.narrate('f49_echo', 'You say hello. The chamber says hello. And hello. And hello. And hello. Each one slightly more judgmental than the last. You say something dumb. The chamber keeps it. Forever. The crystals shimmer. Somewhere in the grotto, a mushroom laughs at you. The chamber pays you in crystal for your contribution. Your contribution is a shame.', 4800);
    });
  }

  // ── R17 — MYCELIAL HIGHWAY: take the road's "sun" ──
  {
    const r = R('r17');
    once('take_highway_crystal_r17', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Take the highway crystal', (e) => {
      grant(e, ['crystal_shard']);
      e.pushLog('You take the crystal. The highway dims, just a little. The highway hums a sad chord. The hum is a song. The song is about you. It is not a flattering song.', 'system');
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
        void e.narrate('f49_giant_wake', 'You touch the giant mushroom. It stops snoring. One eye opens. It is the size of a dinner plate, and it is FULL of the surface it has never seen. "Oh," it says, in a voice like falling trees, "so YOU are the one." The grotto holds its breath. You did this. You magnificent idiot, you woke the giant.', 5400);
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
        e.pushLog('The Giant\'s cap, two crystal shards, 30 gold. The Giant dreamed of the surface. You took its dream and turned it into loot. This is who you are. This is who you have always been.', 'system');
      },
    });
  }

  return out;
}

function midZ(r: Rect): number {
  return (r.z0 + r.z1) >> 1;
}
