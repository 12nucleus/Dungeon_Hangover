// ─────────────────────────────────────────────────────────────
// Floor 50 content — per-run seeded content + verbatim narration.
//
// The macro-map is fixed (floor50.ts); everything RANDOM on floor 50
// comes from here: trap tiles (inside fixed room rects), destructible
// jitter, hidden-treasure tiles, poisoned-wine subset, puddle/mushroom
// outcomes, ambush triggers. Each picker is seeded by the run seed so a
// loaded save replays the exact same layout.
//
// Room ids follow the bible numbering: 'r1' … 'r25'.
// ─────────────────────────────────────────────────────────────
import type { GridPos } from '../game/types';
import type { Rect } from './levelTypes';
import { mulberry32 } from './gen/dungeonGen';

/** Narrator's first-entry line for each room (bible verbatim). */
export const ROOM_NARRATION: Record<string, string> = {
  r1: "You wake up. You are lying on cold stone. You are wearing underwear. This is not how you thought today would go, and you once thought you'd marry a chandelier.",
  r2: 'There is an old man in the next cell. He is missing a finger. He is smiling. This is not reassuring.',
  r3: 'The sewer tunnel stretches into darkness. Something squeaks. Something always squeaks.',
  r4: "This is where the rats raise their young. It is disgusting. It is also kind of impressive. The nursery has better structure than your last apartment.",
  r5: "The room smells like rat. Specifically, it smells like a rat that has never once considered bathing. In the center, on a little bone pedestal, is a finger. It has a ring on it. The rat is watching you. The rat is always watching.",
  r6: "A wine cellar. Most of the bottles are broken. The ones that aren't are probably poisoned. This is the best room you've seen so far.",
  r7: "The water is waist-deep and warm. You do not want to know why it's warm. Something brushes your leg. It's not a friend.",
  r8: "Pipes. Everywhere. One of them has soap in it. You don't know why. The dungeon doesn't explain itself. The dungeon is not your friend.",
  r9: "A goblin stands in front of a large iron door. He looks bored. He looks like he's been standing here for years. He looks like he will stand here for years more.",
  r10: "The guard's antechamber. It smells like goblin. Which is to say, it smells like someone tried to cover up a smell with a worse smell.",
  r11: "The upper sewer. It's drier up here. The rats are smaller. The rats are always smaller when you're looking down at them.",
  r12: "The water is brown. You tell yourself it's the sewer. You know it's not just the sewer.",
  r13: 'Mushrooms. Glowing mushrooms. In a dungeon. This is fine. Everything is fine. Eat the mushroom, Greg.',
  r14: "A maintenance room. Tools. You don't know what most of them are for. You pick up a wrench. It feels right. This is the first time anything has felt right today.",
  r15: "Bones. So many bones. You try not to think about where they came from. You fail.",
  r16: 'A hidden room. Another old man. Also missing a finger. This is getting weird.',
  r17: "A vault. Gold. Potions. Cheese. This is the most beautiful room you've ever seen. You are very easily pleased.",
  r18: "An intersection. You can go four ways. Three of them are bad. One of them is worse. Choose.",
  r19: "A collapsed tunnel. You can see the bonfire room through the gap. You can also see a skeleton. The skeleton is not moving. This is the preferred state for skeletons.",
  r20: "A well. It's deep. You drop a pebble. You don't hear it land. This is either very deep or very soft. You don't want to find out which.",
  r21: "Goblin barracks. They have bunk beds. They have a cooking pot. They have a life. You have underwear. Perspective is important.",
  r22: "An armory. Weapons. Armor. You are still in your underwear. This seems like an oversight.",
  r23: "The water is deep. Something is moving under the surface. Something is always moving under the surface. You are not welcome here.",
  r24: "You are close. You can hear water. You can hear humming. The humming is off-key. The humming is always off-key.",
  r25: "The Goblin King is in his bath. He is wearing a bath cap. He is surrounded by rubber ducks. He is singing. He is a goblin king and he is singing and you are in your underwear and this is your life now.",
};

/** pick `n` random walkable tiles inside a room rect (seeded, skip reserved). */
function pickTilesInRoom(
  rng: () => number,
  rect: Rect,
  n: number,
  walk: boolean[][],
  reserved: Set<string>,
): GridPos[] {
  const out: GridPos[] = [];
  const tries = new Set<string>();
  let guard = 0;
  while (out.length < n && guard++ < 400) {
    const x = rect.x0 + Math.floor(rng() * (rect.x1 - rect.x0 + 1));
    const z = rect.z0 + Math.floor(rng() * (rect.z1 - rect.z0 + 1));
    const k = `${x},${z}`;
    if (tries.has(k)) continue;
    tries.add(k);
    if (!walk[x]?.[z] || reserved.has(k)) continue;
    out.push({ x, z });
  }
  return out;
}

/**
 * Per-run trap tiles. Fixed per-room targets (bible TRAPS table) with the
 * exact tile re-rolled each run inside the room rect:
 *   darts → R17, snare (tripwire) → R11, spore → R13, flood → R7,
 *   spike ×2 → two of {R19, R21, R12}.
 */
export function floor50Traps(
  seed: number,
  rooms: Record<string, Rect>,
  walk: boolean[][],
  reserved: Set<string>,
): { defId: string; x: number; z: number }[] {
  const rng = mulberry32(seed ^ 0x71b3);
  const out: { defId: string; x: number; z: number }[] = [];
  const one = (roomId: string, defId: string) => {
    const rect = rooms[roomId];
    if (!rect) return;
    const t = pickTilesInRoom(rng, rect, 1, walk, reserved)[0];
    if (t) out.push({ defId, x: t.x, z: t.z });
  };
  one('r17', 'darts');
  one('r11', 'snare');
  one('r13', 'spore');
  one('r7', 'flood');
  const spikeRooms = ['r19', 'r21', 'r12'];
  // seeded shuffle of the candidate rooms, take 2
  for (let i = spikeRooms.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spikeRooms[i], spikeRooms[j]] = [spikeRooms[j], spikeRooms[i]];
  }
  for (const roomId of spikeRooms.slice(0, 2)) one(roomId, 'spike');
  return out;
}

/** Destructible props — barrels, crates, sacks (fixed flavour, tiny jitter). */
export function floor50Destructibles(
  seed: number,
  rooms: Record<string, Rect>,
  walk: boolean[][],
  reserved: Set<string>,
): { defId: string; x: number; z: number }[] {
  const rng = mulberry32(seed ^ 0x51e7);
  const out: { defId: string; x: number; z: number }[] = [];
  const put = (roomId: string, defId: string) => {
    const rect = rooms[roomId];
    if (!rect) return;
    const t = pickTilesInRoom(rng, rect, 1, walk, reserved)[0];
    if (t) out.push({ defId, x: t.x, z: t.z });
  };
  put('r3', 'barrel');   // the floating barrel in the sewer tunnel
  put('r6', 'barrel');   // wine cellar barrel
  put('r10', 'crate');   // cluttered antechamber
  put('r22', 'crate');   // armory clutter
  return out;
}

/**
 * Six dead-end-ish hidden-treasure tiles inside rooms 12/16/19/20,
 * re-picked per run (seeded). The engine drops a small loot sparkle
 * on first visit.
 */
export function floor50HiddenTreasures(
  seed: number,
  rooms: Record<string, Rect>,
  walk: boolean[][],
  reserved: Set<string>,
): GridPos[] {
  const rng = mulberry32(seed ^ 0x22c9);
  const targets = ['r12', 'r16', 'r19', 'r20'];
  const out: GridPos[] = [];
  for (const roomId of targets) {
    const rect = rooms[roomId];
    if (!rect) continue;
    const n = roomId === 'r12' ? 2 : roomId === 'r16' ? 1 : roomId === 'r19' ? 2 : 1;
    out.push(...pickTilesInRoom(rng, rect, n, walk, reserved));
  }
  return out.slice(0, 6);
}

/**
 * Environmental hazard tiles (shove targets). wine_press: 10 dmg once
 * per fight; bath: 5 dmg + Scalded.
 */
export function floor50Hazards(rooms: Record<string, Rect>): { tile: GridPos; kind: 'wine_press' | 'bath' }[] {
  const out: { tile: GridPos; kind: 'wine_press' | 'bath' }[] = [];
  const press = rooms.r6;
  if (press) out.push({ tile: { x: press.x0 + 1, z: press.z0 }, kind: 'wine_press' });
  const bath = rooms.r25;
  if (bath) {
    const cx = (bath.x0 + bath.x1) >> 1, cz = (bath.z0 + bath.z1) >> 1;
    for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) {
      out.push({ tile: { x, z }, kind: 'bath' });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// INTERACTABLES — the walk-up-and-press-E content for every room.
// Positions are WORLD coordinates (map-local + OFFSET, baked into
// `rooms` rects). Each entry is a small (e, pos) → Interactable.
// ─────────────────────────────────────────────────────────────
import type { Interactable, GameEngineLike } from '../game/engine/interactables';
import { rollLootTable, makeItem } from '../game/items';

const hasAnySoap = (e: GameEngineLike) =>
  e.hasItemInInventory('goblin_soap') || e.hasItemInInventory('premium_soap') || e.hasItemInInventory('soap_chunk');

const consumeAnySoap = (e: GameEngineLike) => {
  for (const id of ['goblin_soap', 'premium_soap', 'soap_chunk']) {
    if (e.hasItemInInventory(id)) { e.takeItem(id); return id; }
  }
  return null;
};

/** a soap-keyed gate: the door opens if the player has soap OR the
 *  str/plumber force path succeeded (both feed soap_gate_open). */
const isPlumber = (e: GameEngineLike) => e.hasClassSkill('plumber');

/** count how many of a flag family are set (e.g. gamble_1..3) */
function flagCount(e: GameEngineLike, prefix: string): number {
  let n = 0;
  for (const f of e.flags) if (f.startsWith(prefix)) n++;
  return n;
}

/**
 * Build every floor-50 interactable. `seed` picks the seeded outcomes
 * (puddle, poison mushroom patch, ambush odds). Runs once per New Game.
 */
export function floor50Interactables(seed: number, rooms: Record<string, Rect>): Interactable[] {
  const rng = mulberry32(seed ^ 0xb0b);
  const out: Interactable[] = [];
  const R = (id: string): Rect => rooms[id];

  // helper: one-shot interactable that narrates + optionally runs a body
  const once = (id: string, x: number, z: number, label: string, body: (e: GameEngineLike) => void, radius = 2) => {
    out.push({ id, pos: { x, z }, radius, label, once: true, run: body });
  };
  const narr = (id: string, text: string) => (e: GameEngineLike) => {
    void e.narrate(id, text, 4200);
    e.pushLog(text, 'info');
  };
  const grant = (e: GameEngineLike, items: string[], gold = 0) => {
    e.grantLoot(items.map((id) => makeItem(id)), gold);
    // one-line "this will matter later" hint on quest/key items so the
    // player knows a pickup isn't flavour junk (QA sweep #4 finding).
    for (const id of items) {
      const hint = QUEST_ITEM_HINTS[id];
      if (hint) e.pushLog(hint, 'system');
    }
  };

  /** items with a later mechanical use — hint on pickup so they don't read as junk. */
  const QUEST_ITEM_HINTS: Record<string, string> = {
    goblin_soap: '🧼 The goblin soap. You have a feeling this will matter later.',
    premium_soap: '🧼 The premium soap. Fancy. Definitely going to matter later.',
    soap_chunk: '🧼 A chunk of soap. You have a feeling this will matter later.',
    severed_finger: '🖐️ A severed finger with a ring. Someone is missing this.',
    rusty_key: '🗝️ A rusty key. It looks important.',
    lockpick: '🔓 A lockpick. You hear distant locks clicking with anticipation.',
    holy_water: '💧 Holy water. The vault chest feels lighter just looking at it.',
    bubble_bath: '🫧 Bubble bath. Slippery. Pour it at your feet.',
  };

  // ── R1 — the bonfire cell ──
  {
    const r = R('r1');
    const puddleDrunk = rng() < 0.5;
    once('drink_puddle', r.x0 + 1, r.z0, '[R] Drink from the puddle', (e) => {
      if (puddleDrunk) {
        e.healGreg(5);
        void e.narrate('f50_puddle', "You drink. It's cold, it's brown, and it tastes like a decision. You feel... better? The puddle had one job.", 3600);
      } else {
        e.applyCondition(e.combat!.living('party')[0].id, 'nauseated', 3);
        void e.narrate('f50_puddle_bad', "You drink. It's cold, it's brown, and it tastes like a decision. Your stomach files an immediate protest. Nauseated.", 3600);
      }
    });
    once('take_bucket', r.x0, r.z0 + 2, '[R] Take the wooden bucket', (e) => {
      grant(e, ['wooden_bucket']);
      e.pushLog('A bucket. As a weapon it\'s mostly a statement. The narrator has SO many comments.', 'system');
    });
    once('read_scratches', r.x0 + 2, r.z0 + 2, '[R] Read the wall scratches', narr('f50_scratches', "You don't remember writing this. You don't remember ANYTHING. This is either amnesia or a really good night."));
  }

  // ── R2 — the hermit's cell ──
  {
    const r = R('r2');
    out.push({
      id: 'rest_mat', pos: { x: r.x1, z: r.z0 }, radius: 2,
      label: '[R] Rest on the straw mat',
      visibleIf: (e) => !e.hasFlag('rest_mat_used'),
      once: true,
      run: (e) => {
        e.healGreg(5);
        e.setFlag('rest_mat_used');
        void e.narrate('f50_mat', "You lie on the straw mat. It smells like straw. It smells like a barn. It smells like HOME. You sleep for five minutes. It's the best five minutes of your life.", 4200);
      },
    });
    out.push({
      id: 'chest_r2', pos: { x: r.x1, z: r.z1 }, radius: 2,
      label: '[R] Open the small chest',
      visibleIf: (e) => !e.hasFlag('chest_r2_open'),
      run: (e) => {
        const keyed = e.hasItemInInventory('rusty_key') || e.hasItemInInventory('lockpick');
        if (!keyed) {
          e.setHoverInfoOnce('Locked. The Rusty Key (or a lockpick) will open it.');
          return;
        }
        e.setFlag('chest_r2_open');
        const { items, gold, lootRoll } = rollLootTable('chest');
        if (lootRoll !== undefined) e.showDiceRoll?.('d20', lootRoll, 'Treasure quality');
        e.grantLoot(items, gold);
        e.pushLog(`🗝️ The chest opens: ${[...items.map((i: any) => `${i.icon} ${i.name}`), `🪙 ${gold} gold`].join(', ')}.`, 'system');
      },
    });
  }

  // ── R3 — the sewer tunnel ──
  {
    const r = R('r3');
    once('search_skeleton_r3', r.x1, r.z0, '[R] Search the skeleton in the water', (e) => {
      void e.narrate('f50_skeleton', "A skeleton. In the water. It's been here a while. It's wearing the same underwear as you. This is either a coincidence or a dress code.", 4200);
      grant(e, ['lockpick'], 2);
      e.pushLog('The skeleton holds a lockpick and 2 gold. Its note is waterlogged: "The rat took my finger. Then it took my life. Priorities."', 'system');
    });
  }

  // ── R4 — the rat nursery ──
  {
    const r = R('r4');
    once('search_nest_r4', r.x0, r.z0, '[R] Search the nest', (e) => {
      grant(e, ['soap_chunk'], 1);
      e.pushLog('The nest holds a button, a coin, and — buried deep — a SOAP CHUNK. The rats have been stealing from the King.', 'system');
    });
    out.push({
      id: 'throw_bone', pos: { x: r.x1, z: r.z1 }, radius: 2,
      label: '[R] Throw the rat bone into the nursery',
      visibleIf: (e) => e.hasItemInInventory('rat_bone'),
      run: (e) => {
        e.takeItem('rat_bone');
        if (e.combat?.inCombat) {
          for (const foe of e.combat.units.filter((u: any) => u.alive && u.groupId === 'r4_nursery')) {
            e.applyCondition(foe.id, 'distracted', 2);
          }
          e.pushLog('You fling the bone into the fray. The rats hesitate — Distracted!', 'system');
        } else {
          const babies = e.combat!.units.filter((u: any) => u.alive && u.name === 'Baby Rat');
          for (const baby of babies.slice(0, 2)) {
            baby.alive = false;
            const v = e.visuals?.get(baby.id);
            if (v) { v.rig.anim.mode = 'dead'; v.bar.style.display = 'none'; }
          }
          void e.narrate('f50_bone', 'The rats devolve into a squeaking, fur-flying brawl over the bone. Two of them do not get up. The nursery judges you.', 4200);
        }
      },
    });
  }

  // ── R5 — the boss rat's lair ──
  {
    const r = R('r5');
    out.push({
      id: 'offer_cheese', pos: { x: (r.x0 + r.x1) >> 1, z: r.z0 + 2 }, radius: 2,
      label: '[R] Offer the moldy cheese to the Boss Rat',
      visibleIf: (e) => e.hasItemInInventory('moldy_cheese') && !e.hasFlag('boss_pacified') && !e.hasFlag('boss_rat_dead'),
      run: (e) => {
        e.takeItem('moldy_cheese');
        e.setFlag('boss_pacified');
        const baron = e.combat!.units.find((u: any) => u.name === 'Baron Gnaw');
        if (baron) {
          baron.dormant = true;
          e.combat!.turnOrder = e.combat!.turnOrder.filter((id: string) => id !== baron.id);
        }
        grant(e, ['severed_finger', 'rusty_key']);
        void e.narrate('f50_cheese', 'The Boss Rat considers the cheese. The Boss Rat accepts the cheese. The Boss Rat gives you the finger — the Hermit\'s finger — and the rusty key, as tribute. A fair trade. A quiet beat.', 5200);
      },
    });
    out.push({
      id: 'clear_debris_56', pos: { x: r.x1 + 1, z: r.z0 + 2 }, radius: 2,
      label: '[R] Clear the debris (STR)',
      visibleIf: (e) => !e.hasFlag('debris_56'),
      run: (e) => {
        if (e.abilityCheck('str', 10)) {
          e.setFlag('debris_56');
          e.pushLog('🪨 You heave the debris aside — the passage to Room 6 is open!', 'system');
        } else {
          e.pushLog('The debris does not budge. It has been here longer than you have been hungover.', 'system');
        }
      },
    });
  }

  // ── R6 — the collapsed wine cellar ──
  {
    const r = R('r6');
    const press = { x: r.x0 + 1, z: r.z0 };
    out.push({
      id: 'wine_press', pos: press, radius: 2,
      label: '[R] Examine the wine press',
      visibleIf: (e) => !e.combat?.inCombat,
      run: narr('f50_press', 'A wine press. Big, rusty, and hungry. If only you could shove someone into it. (Shove them in combat!)'),
    });
    // 6 wine bottles + 6 broken bottles scattered around the cellar
    const spots: [number, number][] = [
      [r.x0, r.z0 + 2], [r.x0 + 2, r.z1], [r.x0 + 3, r.z0 + 1],
      [r.x1 - 1, r.z1], [r.x1, r.z0], [r.x0 + 4, r.z1 - 1],
      [r.x0 + 1, r.z1], [r.x1 - 1, r.z0 + 1], [r.x0 + 5, r.z0],
      [r.x1, r.z1 - 1], [r.x0 + 2, r.z0], [r.x0 + 4, r.z0 + 2],
    ];
    spots.forEach(([x, z], i) => {
      const isWine = i % 2 === 0;
      once(`take_wine_${i}`, x, z, isWine ? '[R] Take a bottle of wine' : '[R] Take a broken bottle', (e) => {
        if (isWine) {
          grant(e, ['wine_bottle']);
          void e.narrate('f50_wine', "You take the wine. It's been fermenting for centuries. It's basically vinegar. You'll drink it anyway.", 3200);
        } else {
          grant(e, ['broken_bottle']);
          e.pushLog('A broken bottle. One good swing and it\'s gone — but what a swing.', 'system');
        }
      });
    });
    out.push({
      id: 'open_trapdoor', pos: { x: r.x1, z: r.z0 }, radius: 2,
      label: '[R] Open the trapdoor',
      visibleIf: (e) => !e.hasFlag('trapdoor_open'),
      run: (e) => {
        const keyed = e.hasItemInInventory('rusty_key') || e.hasItemInInventory('lockpick');
        if (!keyed) {
          e.setHoverInfoOnce('Locked. The Rusty Key or a lockpick will open it.');
          return;
        }
        e.setFlag('trapdoor_open');
        void e.narrate('f50_trapdoor', "The trapdoor groans open. Water glints below — the flooded passage, Room 7.", 3200);
      },
    });
  }

  // ── R7 — the flooded passage ──
  {
    const r = R('r7');
    once('search_body_r7', r.x0, r.z0, '[R] Search the floating body', (e) => {
      void e.narrate('f50_body', "A body. Floating. It's been here a while. It's wearing armor. Good armor. You take the armor. The body doesn't mind. The body is DEAD.", 4200);
      grant(e, ['chain_shirt', 'leather_boot'], 5);
      e.pushLog('A note pinned to the boot: "The soap is in the pipes. Don\'t ask why."', 'system');
    });
    out.push({
      id: 'submerged_chest_r7', pos: { x: r.x1, z: r.z0 + 1 }, radius: 2,
      label: '[R] Open the submerged chest',
      visibleIf: (e) => !e.hasFlag('chest_r7_open'),
      run: (e) => {
        if (!e.hasFlag('water_drained') && !e.abilityCheck('con', 12)) {
          const dmg = 1 + Math.floor(Math.random() * 4);
          e.damageGreg(dmg, 'hold-breath');
          e.pushLog('You hold your breath too long. The water wins. Try again.', 'system');
          return;
        }
        e.setFlag('chest_r7_open');
        grant(e, ['holy_water'], 15);
        e.pushLog('The chest yields 15 gold and a flask of HOLY WATER. The saint on the flask looks smug.', 'system');
      },
    });
  }

  // ── R8 — the pipe junction ──
  {
    const r = R('r8');
    once('reach_pipe', r.x1 - 1, r.z0 + 1, '[R] Reach into the medium pipe', (e) => {
      grant(e, ['goblin_soap']);
      if (Math.random() < 0.25) {
        e.applyCondition(e.combat!.living('party')[0].id, 'bleeding', 2);
        void e.narrate('f50_soap', "You found soap. It's pink. It smells like strawberries. Something in the pipe bit you for your trouble — you're Bleeding. This is somehow the most disturbing thing you've found today, and you found a finger.", 5200);
      } else {
        void e.narrate('f50_soap_clean', "You found soap. It's pink. It smells like strawberries. This is somehow the most disturbing thing you've found today, and you found a finger.", 4600);
      }
    });
    out.push({
      id: 'turn_valve', pos: { x: r.x0, z: r.z0 + 2 }, radius: 2,
      label: '[R] Turn the valve',
      visibleIf: (e) => !e.hasFlag('water_drained'),
      run: (e) => {
        if (isPlumber(e) || e.abilityCheck('str', 12)) {
          e.setFlag('water_drained');
          e.deactivateTrap?.('flood');
          void e.narrate('f50_valve', 'The valve turns with a groan that echoes like a dying whale. Somewhere, the water level drops. Room 7 just got friendlier.', 4200);
        } else {
          e.pushLog('The valve will not turn. It has opinions about your grip strength.', 'system');
        }
      },
    });
    out.push({
      id: 'fill_flask', pos: { x: r.x0 + 1, z: r.z1 }, radius: 2,
      label: '[R] Fill the flask',
      visibleIf: (e) => flagCount(e, 'flask_fill_') < 3,
      run: (e) => {
        e.setFlag(`flask_fill_${flagCount(e, 'flask_fill_')}`);
        grant(e, ['water_flask']);
        e.pushLog('You fill the flask with pipe water. It\'s... probably fine.', 'system');
      },
    });
    out.push({
      id: 'climb_pipe_14', pos: { x: r.x0 + 1, z: r.z0 - 1 }, radius: 2,
      label: '[R] Climb the large pipe (STR/Plumber)',
      visibleIf: (e) => !e.hasFlag('pipe_climbed'),
      run: (e) => {
        if (isPlumber(e) || e.abilityCheck('str', 10)) {
          e.setFlag('pipe_climbed');
          e.pushLog('You haul yourself up the pipe. Room 14, the maintenance room, is open.', 'system');
        } else {
          e.pushLog('The pipe is slick. You get halfway up and reconsider your life choices.', 'system');
        }
      },
    });
  }

  // ── R9 — the guarded door ──
  {
    const r = R('r9');
    once('read_sign_r9', r.x0, r.z0, '[R] Read the sign on the door', narr('f50_sign', 'The sign reads: "GRIBNAB\'S BATH — KNOCK FIRST — SOAP REQUIRED". Someone has written "please" in smaller letters underneath. Someone has crossed out "please".'));
  }

  // ── R10 — the guard's antechamber ──
  {
    const r = R('r10');
    out.push({
      id: 'rest_bunk', pos: { x: r.x1, z: r.z0 }, radius: 2,
      label: '[R] Rest on the bunk',
      visibleIf: (e) => !e.hasFlag('rest_bunk_used'),
      once: true,
      run: (e) => {
        e.healGreg(10);
        e.setFlag('rest_bunk_used');
        e.pushLog('The bunk is lumpy and smells like goblin. You sleep like the dead. +10 HP.', 'system');
      },
    });
    out.push({
      id: 'footlocker_r10', pos: { x: r.x0, z: r.z0 + 1 }, radius: 2,
      label: '[R] Open the footlocker',
      visibleIf: (e) => !e.hasFlag('footlocker_r10_open'),
      run: (e) => {
        const keyed = e.hasItemInInventory('rusty_key') || e.hasItemInInventory('lockpick');
        if (!keyed) {
          e.setHoverInfoOnce('Locked. The Rusty Key or a lockpick will open it.');
          return;
        }
        e.setFlag('footlocker_r10_open');
        grant(e, ['guards_cap', 'love_letter'], 10);
        void e.narrate('f50_letter', "A love letter. It's addressed to Scrag. It's from someone named 'Bliss.' It's... it's very romantic. It's very GRAPHIC. You put it back. You put it back and you NEVER speak of it.", 4600);
      },
    });
    out.push({
      id: 'dice_table', pos: { x: (r.x0 + r.x1) >> 1, z: r.z1 }, radius: 2,
      label: '[R] Gamble at the dice table (5 gold)',
      visibleIf: (e) => flagCount(e, 'gamble_') < 3 && e.gold >= 5,
      run: (e) => {
        e.setFlag(`gamble_${flagCount(e, 'gamble_')}`);
        e.addGold(-5);
        e.playSfx('dice', 0.7);
        const roll = 1 + Math.floor(Math.random() * 20);
        const house = (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6)) + 2;
        e.pushLog(`🎲 You bet 5 gold. You roll ${roll}; the house rolls ${house}.`, 'roll');
        if (roll > house) {
          e.addGold(10);
          e.pushLog('🎉 You win 10 gold! The dice glint smugly — at the house, this time.', 'system');
        } else {
          e.pushLog('😔 The house wins. Your 5 gold is gone. The dice glint smugly.', 'system');
        }
      },
    });
  }

  // ── R11 — the upper sewer ──
  {
    const r = R('r11');
    once('search_nest_r11', r.x0, r.z1, '[R] Search the nest', (e) => {
      grant(e, ['soap_chunk']);
      e.pushLog('The nest holds three rat teeth and — bless the rats — a SOAP CHUNK.', 'system');
    });
    once('peek_crack', r.x1, r.z0, '[R] Peek through the crack in the wall', (e) => {
      e.setFlag('scouted_12');
      void e.narrate('f50_crack', 'Through the crack: a flooded room. Rats. A large one with opinions. You now have the drop on them — they\'ll be Surprised when you fight.', 4000);
    });
  }

  // ── R12 — the flooded rat den ──
  {
    const r = R('r12');
    once('search_corpse_r12', r.x0, r.z0, '[R] Search the floating corpse', (e) => {
      grant(e, ['rat_whisker'], 8);
      void e.narrate('f50_corpse', "A note: 'The Hermit lies. Trust no one. Especially not the one who smiles.' The Hermit smiles. The Hermit is ALWAYS smiling.", 4200);
    });
    out.push({
      id: 'open_drain_r12', pos: { x: r.x1, z: r.z1 }, radius: 2,
      label: '[R] Open the drain (Plumber)',
      visibleIf: (e) => !e.hasFlag('drain_open'),
      run: (e) => {
        if (isPlumber(e)) {
          e.setFlag('drain_open');
          e.pushLog('You wrench the drain open. The water churns away. The den rats will fight slow — Slowed at combat start.', 'system');
        } else {
          e.pushLog('The drain is seized. A wrench, or a Plumber\'s touch, would fix that.', 'system');
        }
      },
    });
  }

  // ── R13 — the fungal alcove ──
  {
    const r = R('r13');
    // 4 mushroom patches — one (seeded) is the poison mushroom
    const poisonIdx = Math.floor(rng() * 4);
    const patches: [number, number][] = [
      [r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1],
    ];
    patches.forEach(([x, z], i) => {
      once(`eat_mushroom_${i}`, x, z, i === poisonIdx ? '[R] Eat the mushroom' : '[R] Eat the glowing mushroom', (e) => {
        if (i === poisonIdx) {
          e.applyCondition(e.combat!.living('party')[0].id, 'poisoned', 3);
          void e.narrate('f50_poison_mush', 'That one was NOT glowing. Why was it not glowing. The dungeon laughs. Poisoned.', 3600);
        } else {
          e.healGreg(5);
          grant(e, ['glowing_mushroom']);
          e.pushLog('You eat the glowing mushroom. It tastes like regret with a hint of nutmeg. +5 HP. (One for the road, too.)', 'system');
        }
      });
    });
    once('sit_circle', (r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1, '[R] Sit in the mushroom circle', (e) => {
      e.applyCondition(e.combat!.living('party')[0].id, 'hallucinating', 2);
      e.setFlag('mushroom_door');
      void e.narrate('f50_circle', "You sit in the mushroom circle. The world SPINS. The world CHANGES. You see things. You see a DOOR. A door that's ALWAYS been there. A door that's WAITING.", 4600);
    });
    once('read_note_r13', r.x0, (r.z0 + r.z1) >> 1, '[R] Read the note on the wall', narr('f50_note13', 'The wall note reads: "The Hermit was here before the dungeon. The dungeon grew around him."'));
  }

  // ── R14 — pipe maintenance ──
  {
    const r = R('r14');
    once('take_wrench', r.x0, r.z0, '[R] Take the wrench', (e) => {
      grant(e, ['wrench']);
      void e.narrate('f50_wrench', "You pick up a wrench. It feels right. This is the first time anything has felt right today.", 3600);
    });
    once('take_plunger', r.x1, r.z0, '[R] Take the plunger', (e) => {
      grant(e, ['plunger']);
      e.pushLog('The plunger. The most feared weapon in any sewer. 25% chance to stun.', 'system');
    });
    once('take_pipe_helmet', r.x0, r.z1, '[R] Take the pipe fitting', (e) => {
      grant(e, ['pipe_helmet']);
      e.pushLog('A pipe fitting. It fits your head. It\'s a helmet now. −1 physical damage taken.', 'system');
    });
    once('open_toolbox', (r.x0 + r.x1) >> 1, r.z1, '[R] Open the toolbox', (e) => {
      grant(e, ['soap_chunk'], 2);
      e.pushLog('The toolbox holds nails, wire, and — a SOAP CHUNK. Partial soap. Not enough for the guard. Or maybe it is. Who knows.', 'system');
    });
  }

  // ── R15 — the bone pit ──
  {
    const r = R('r15');
    once('search_skeleton_r15', r.x0, r.z0, '[R] Search the skeleton', (e) => {
      grant(e, ['ribcage_armor'], 5);
      e.pushLog('The skeleton yields 5 gold and a ribcage. It fits like a dream. A bony, hygienically questionable dream.', 'system');
    });
    out.push({
      id: 'bone_pedestal', pos: { x: (r.x0 + r.x1) >> 1, z: r.z0 + 1 }, radius: 2,
      label: '[R] Place the severed finger on the bone pedestal',
      visibleIf: (e) => e.hasItemInInventory('severed_finger') && !e.hasFlag('finger_pedestal'),
      run: (e) => {
        e.setFlag('finger_pedestal');
        const boneRat = e.combat!.units.find((u: any) => u.name === 'Bone Rat' && u.alive);
        if (boneRat) {
          boneRat.dormant = true;
          e.combat!.turnOrder = e.combat!.turnOrder.filter((id: string) => id !== boneRat.id);
          e.setFlag('bone_rat_pacified');
        }
        const greg = e.combat!.living('party')[0];
        if (greg) e.applyCondition(greg.id, 'blessed', 99);
        void e.narrate('f50_pedestal', 'The bones go quiet. The Bone Rat bows its skull — an ally for this fight. You feel blessed. The narrator is quiet. Some moments are too important for jokes.', 4800);
      },
    });
    out.push({
      id: 'burn_bones', pos: { x: r.x1, z: r.z0 + 1 }, radius: 2,
      label: '[R] Burn the bones',
      visibleIf: (e) => !e.hasFlag('bones_burned'),
      run: (e) => {
        e.setFlag('bones_burned');
        const boneRat = e.combat!.units.find((u: any) => u.name === 'Bone Rat') as any;
        if (boneRat) boneRat.burnPrevented = true;
        e.pushLog('You torch the bone pile. The Bone Rat will NOT be coming back. Fire solves everything.', 'system');
      },
    });
    out.push({
      id: 'find_tunnel_r17', pos: { x: r.x1, z: r.z0 }, radius: 2,
      label: '[R] Search for the hidden tunnel (WIS)',
      visibleIf: (e) => !e.hasFlag('vault_tunnel'),
      run: (e) => {
        const keyed = e.hasItemInInventory('rusty_key') || e.hasItemInInventory('lockpick');
        if (!keyed) {
          e.setHoverInfoOnce('Even if you find the tunnel, the vault grate needs the Rusty Key or a lockpick.');
          return;
        }
        if (e.abilityCheck('wis', 12)) {
          e.setFlag('vault_tunnel');
          e.pushLog('The bones shift under your fingers — a hidden tunnel to the vault! But the grate needs its key... the interactable will handle that.', 'system');
        } else {
          e.pushLog('You paw at the bones. The bones paw back. Nothing.', 'system');
        }
      },
    });
  }

  // ── R16 — the hidden room ──
  {
    const r = R('r16');
    once('chest_r16', r.x1, r.z1, '[R] Open the chest', (e) => {
      grant(e, ['ghost_soup'], 20);
      e.pushLog('The chest holds 20 gold and a bowl of GHOST SOUP. It\'s warm. It should not be warm. It is not yours.', 'system');
    });
    once('mirror_r16', r.x0, r.z0, '[R] Look in the mirror', narr('f50_mirror', 'You look in the mirror. You see yourself, but cleaner. The mirror is a liar. You respect the hustle.'));
    out.push({
      id: 'rest_bed_r16', pos: { x: (r.x0 + r.x1) >> 1, z: r.z1 }, radius: 2,
      label: '[R] Rest in the bed',
      visibleIf: (e) => !e.hasFlag('rest_bed_used'),
      once: true,
      run: (e) => {
        e.setFlag('rest_bed_used');
        const greg = e.combat!.living('party')[0];
        if (greg) { greg.hp = greg.maxHp; e.emitSnapshot(); }
        e.pushLog('A real bed. Four posts. Actual sheets. You sleep like a person who is not at the bottom of a dungeon. Full heal.', 'system');
      },
    });
  }

  // ── R17 — the storage vault (cursed gold) ──
  {
    const r = R('r17');
    out.push({
      id: 'chest_vault', pos: { x: (r.x0 + r.x1) >> 1, z: (r.z0 + r.z1) >> 1 }, radius: 2,
      label: '[R] Open the vault chest',
      visibleIf: (e) => !e.hasFlag('vault_opened'),
      run: (e) => {
        e.setFlag('vault_opened');
        e.runStats!.secretsFound += 1;
        grant(e, ['moldy_cheese', 'rusty_sword', 'premium_soap'], 30);
        const greg = e.combat!.living('party')[0];
        if (greg) e.applyCondition(greg.id, 'cursed', 99);
        e.startQuest('cursed_gold');
        void e.narrate('f50_vault', "The gold glows with an oily light. The moment your hand touches it, the glow crawls up your arm. CURSED. Your loot will be worse until you break it. A note inside: 'Gribnab's soap is his crown. Without it, he is nothing. With it, he is a very clean nothing.'", 5600);
      },
    });
  }

  // ── R18 — the intersection ──
  {
    const r = R('r18');
    out.push({
      id: 'examine_compass', pos: { x: (r.x0 + r.x1) >> 1, z: r.z0 }, radius: 2,
      label: '[R] Examine the compass rose',
      visibleIf: (e) => e.hasFlag('met_scrag') && !e.hasFlag('compass_active'),
      run: (e) => {
        e.setFlag('compass_active');
        void e.narrate('f50_compass', 'The compass rose shimmers. It points to the exit — past Scrag, past the King, past the bath. Now you know the way.', 3800);
      },
    });
    out.push({
      id: 'fountain_pour', pos: { x: (r.x0 + r.x1) >> 1, z: r.z1 }, radius: 2,
      label: '[R] Pour water into the fountain',
      visibleIf: (e) => e.hasItemInInventory('water_flask') && !e.hasFlag('fountain_done'),
      run: (e) => {
        e.setFlag('fountain_done');
        e.takeItem('water_flask');
        e.healGreg(10);
        void e.narrate('f50_fountain', 'The fountain burbles to life. The water is... clean? That\'s new. +10 HP.', 3200);
      },
    });
  }

  // ── R19 — the collapsed tunnel (shortcut) ──
  {
    const r1 = R('r1');
    out.push({
      id: 'clear_debris_19', pos: { x: r1.x0 + 2, z: r1.z1 + 1 }, radius: 2,
      label: '[R] Clear the debris (STR)',
      visibleIf: (e) => !e.hasFlag('shortcut_open'),
      run: (e) => {
        if (isPlumber(e) || e.abilityCheck('str', 10)) {
          e.setFlag('shortcut_open');
          void e.narrate('f50_shortcut', 'The rubble grinds apart. A tunnel — a SHORTCUT — winds away into the dark. Somewhere up there, soap waits.', 3600);
        } else {
          e.pushLog('The debris holds. It has been holding for years. It will hold for years more.', 'system');
        }
      },
    });
    const r = R('r19');
    once('search_skeleton_r19', r.x0, r.z0, '[R] Search the skeleton', (e) => {
      grant(e, [], 3);
      void e.narrate('f50_skeleton19', "A skeleton near the gap. Its note: 'I almost made it back. The bonfire was right there.' You take the 3 gold. The skeleton doesn't mind.", 3800);
    });
    once('look_up', r.x1, r.z0, '[R] Look up through the crack', narr('f50_look_up', 'Through the crack in the ceiling: stars. Or crystals. Or a very large eye. You decide it\'s stars.'));
  }

  // ── R20 — the old well ──
  {
    const r = R('r20');
    out.push({
      id: 'well_lower', pos: { x: (r.x0 + r.x1) >> 1, z: r.z0 }, radius: 2,
      label: '[R] Lower into the well',
      run: (e) => {
        const r7 = R('r7');
        const dest = { x: r7.x0 + 5, z: r7.z0 + 1 };
        if (!e.hasItemInInventory('rope')) {
          const dmg = 1 + Math.floor(Math.random() * 4);
          e.damageGreg(dmg, 'the well floor');
        }
        e.teleportGreg?.(dest);
        void e.narrate('f50_well', 'Down you go. The well is a throat. The throat swallows. You land in waist-deep water — Room 7, the flooded passage.', 3600);
      },
    });
    out.push({
      id: 'well_drop_finger', pos: { x: (r.x0 + r.x1) >> 1, z: r.z1 }, radius: 2,
      label: '[R] Drop the severed finger into the well',
      visibleIf: (e) => e.hasItemInInventory('severed_finger') && !e.hasFlag('finger_in_well'),
      run: (e) => {
        e.setFlag('finger_in_well');
        e.takeItem('severed_finger');
        const greg = e.combat!.living('party')[0];
        if (greg) e.applyCondition(greg.id, 'blessed', 99);
        e.questLog.fail('hermit_finger');
        void e.narrate('f50_well_finger', 'The finger drops. The ring flashes once, twice, and is gone. You feel blessed. The Hermit does not. The quest is failed.', 4400);
      },
    });
    once('take_bucket_r20', r.x0, (r.z0 + r.z1) >> 1, '[R] Take the bucket', (e) => {
      grant(e, ['wooden_bucket']);
      e.pushLog('A bucket from the well. A helmet? A weapon? A statement? Yes.', 'system');
    });
  }

  // ── R21 — goblin barracks ──
  {
    const r = R('r21');
    out.push({
      id: 'study_map', pos: { x: r.x0, z: r.z1 }, radius: 2,
      label: '[R] Study the map',
      visibleIf: (e) => !e.hasFlag('map_studied'),
      run: (e) => {
        e.setFlag('map_studied');
        for (const rid of ['r22', 'r23', 'r24', 'r25']) {
          const rect = rooms[rid];
          if (rect) e.exploreRect?.(rect);
        }
        e.pushLog('The goblin map reveals the floor ahead: armory, flooded deep, throne antechamber, and the BATH. The bath is circled. Twice.', 'system');
      },
    });
    once('footlocker_r21', r.x1, r.z0, '[R] Open the footlocker', (e) => {
      grant(e, ['goblin_spear'], 15);
      e.pushLog('The footlocker holds 15 gold and a GOBLIN SPEAR. Crude, sharp, and smug about it.', 'system');
    });
    once('eat_stew', (r.x0 + r.x1) >> 1, r.z0, '[R] Eat the stew', (e) => {
      e.healGreg(10);
      e.pushLog('The stew is... edible. That is the best you can say. +10 HP.', 'system');
    });
  }

  // ── R22 — the armory ──
  {
    const r = R('r22');
    const rackUsed = (e: GameEngineLike) => e.hasFlag('rack_axe') || e.hasFlag('rack_spear') || e.hasFlag('rack_mace');
    out.push({
      id: 'take_axe', pos: { x: r.x0, z: r.z0 }, radius: 2,
      label: '[R] Take the Rusty Axe from the rack',
      visibleIf: (e) => !rackUsed(e),
      run: (e) => { e.setFlag('rack_axe'); grant(e, ['rusty_axe']); e.pushLog('The Rusty Axe. Mostly rust, technically an axe.', 'system'); },
    });
    out.push({
      id: 'take_spear', pos: { x: r.x0 + 1, z: r.z0 }, radius: 2,
      label: '[R] Take the Rusty Spear from the rack',
      visibleIf: (e) => !rackUsed(e),
      run: (e) => { e.setFlag('rack_spear'); grant(e, ['rusty_spear']); e.pushLog('The Rusty Spear. Pointy end, rusted end, middle is a mystery.', 'system'); },
    });
    out.push({
      id: 'take_mace', pos: { x: r.x0 + 2, z: r.z0 }, radius: 2,
      label: '[R] Take the Rusty Mace from the rack',
      visibleIf: (e) => !rackUsed(e),
      run: (e) => { e.setFlag('rack_mace'); grant(e, ['rusty_mace']); e.pushLog('The Rusty Mace. 10% chance to rattle a brain. Yours included.', 'system'); },
    });
    out.push({
      id: 'take_vest', pos: { x: r.x0, z: r.z1 }, radius: 2,
      label: '[R] Take the Leather Vest from the rack',
      visibleIf: (e) => !e.hasFlag('armor_rack_done'),
      run: (e) => { e.setFlag('armor_rack_done'); grant(e, ['leather_vest']); e.pushLog('The Leather Vest. +1 AC, goblin-grade stitching.', 'system'); },
    });
    out.push({
      id: 'take_chain', pos: { x: r.x0 + 1, z: r.z1 }, radius: 2,
      label: '[R] Take the Chain Shirt from the rack',
      visibleIf: (e) => !e.hasFlag('armor_rack_done'),
      run: (e) => { e.setFlag('armor_rack_done'); grant(e, ['chain_shirt']); e.pushLog('The Chain Shirt. +2 AC, rings of questionable provenance.', 'system'); },
    });
    once('read_note_r22', r.x1, (r.z0 + r.z1) >> 1, '[R] Read the note', narr('f50_note22', 'The note reads: "The King is in the bath. He is always in the bath. Do not disturb him. Unless you have soap. Then disturb him."'));
  }

  // ── R23 — the flooded deep ──
  {
    const r = R('r23');
    out.push({
      id: 'altar_r23', pos: { x: r.x0, z: r.z0 }, radius: 2,
      label: '[R] Place soap on the altar',
      visibleIf: (e) => hasAnySoap(e) && !e.hasFlag('water_drained'),
      run: (e) => {
        consumeAnySoap(e);
        e.setFlag('water_drained');
        e.deactivateTrap?.('flood');
        void e.narrate('f50_altar', 'The altar drinks the soap. The water drains away with a wet, disappointed sigh. The deep is shallow now. (You used your soap on the altar — the gate will need another way.)', 4600);
      },
    });
    out.push({
      id: 'chest_r23', pos: { x: r.x1, z: r.z1 }, radius: 2,
      label: '[R] Open the submerged chest',
      visibleIf: (e) => !e.hasFlag('chest_r23_open'),
      run: (e) => {
        if (!e.hasFlag('water_drained') && !e.abilityCheck('con', 12)) {
          const dmg = 1 + Math.floor(Math.random() * 4);
          e.damageGreg(dmg, 'hold-breath');
          e.pushLog('The water disagrees with your lungs. Try again.', 'system');
          return;
        }
        e.setFlag('chest_r23_open');
        grant(e, ['waterlogged_book'], 20);
        e.pushLog('The chest yields 20 gold and a WATERLOGGED BOOK. The ink has mostly run. What survives is a recipe for stew and a poem about a duck.', 'system');
      },
    });
  }

  // ── R24 — throne antechamber ──
  {
    const r = R('r24');
    once('sit_throne', (r.x0 + r.x1) >> 1, r.z0, '[R] Sit on the goblin throne', (e) => {
      e.setFlag('goblin_respect');
      void e.narrate('f50_throne', 'You sit on the goblin throne. It is exactly goblin-sized, which is to say deeply uncomfortable. But the goblins SEE. You have their respect. They will not attack unless provoked.', 4200);
    });
    once('tear_banner', r.x0, r.z1, '[R] Tear down the banner', (e) => {
      grant(e, ['goblin_banner']);
      e.pushLog('You tear down the throne-room banner. +1 AC. It smells like a parade.', 'system');
    });
    out.push({
      id: 'knock_door', pos: { x: r.x1, z: r.z0 + 1 }, radius: 2,
      label: '[R] Knock on Gribnab\'s door (soap)',
      visibleIf: (e) => !e.hasFlag('gribnab_door_open') && hasAnySoap(e),
      run: (e) => {
        consumeAnySoap(e);
        e.setFlag('gribnab_door_open');
        e.setFlag('knocked');
        e.pushLog('You knock. The humming stops. A voice like damp velvet: "ENTER! You have SOAP! Wonderful!"', 'system');
      },
    });
    out.push({
      id: 'force_door', pos: { x: r.x1, z: r.z0 + 1 }, radius: 2,
      label: '[R] Force the door',
      visibleIf: (e) => !e.hasFlag('gribnab_door_open') && !hasAnySoap(e),
      run: (e) => {
        if (isPlumber(e) || e.abilityCheck('str', 14)) {
          e.setFlag('gribnab_door_open');
          e.setFlag('door_forced');
          e.setFlag('made_noise');
          void e.narrate('f50_forced', 'The iron door shrieks and gives. Somewhere inside, a goblin king is going to be VERY upset about this.', 3400);
        } else {
          e.pushLog('You bounce off the iron door. The door does not bounce.', 'system');
        }
      },
    });
  }

  // ── R25 — the bath chamber ──
  {
    const r = R('r25');
    const duckSpots: [number, number][] = [
      [r.x0 + 2, r.z0 + 3], [r.x0 + 4, r.z0 + 5], [r.x1 - 2, r.z0 + 2], [r.x1 - 1, r.z0 + 6],
    ];
    duckSpots.forEach(([x, z], i) => {
      once(`squeeze_duck_${i}`, x, z, '[R] Take a rubber duck', (e) => {
        grant(e, ['rubber_duck']);
        e.playSfx('screech', 0.4);
        e.pushLog('SQUEAK. The duck is taken. The duck is magnificent.', 'system');
      });
    });
    once('take_towel', r.x0, r.z0, '[R] Take the towel', (e) => {
      grant(e, ['towel']);
      e.pushLog('A towel from the King\'s rack. Whip-crack! 50% chance to blind on a hit.', 'system');
    });
    once('pour_bubble_bath', (r.x0 + r.x1) >> 1, r.z0 + 1, '[R] Take the bubble bath', (e) => {
      grant(e, ['bubble_bath']);
      e.pushLog('A bottle of bubble bath. Pour it at your feet for Slippery — the floor gleams with menace.', 'system');
    });
    out.push({
      id: 'exit_stairs', pos: { x: r.x0 + 4, z: r.z1 }, radius: 2,
      label: '[R] Climb the stairs to Floor 49',
      visibleIf: (e) => e.hasFlag('gribnab_dead') || e.hasFlag('gribnab_befriended'),
      run: (e) => {
        void e.narrate('f50_departure', 'The staircase is cold. The staircase is stone. The staircase goes UP. You climb away from the bath. You climb away from the soap. You climb toward Floor 49. You climb toward the LIGHT.', 5600);
        // real floor transition — the run continues one floor up
        e.goToFloor?.(49);
      },
    });
  }

  return out;
}
