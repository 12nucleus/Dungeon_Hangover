# FLOOR 50 — THE SEWER CELLAR

## FLOOR OVERVIEW

**Theme:** Sewers, mold, vermin, forgotten cellars. The bottom of everything.
**Mood:** Slapstick survival. You are a hungover idiot in underwear. The world is disgusting and you are its king.
**Ambient:** Dripping water. Distant squeaking. Occasional gurgling. The sound of your own stomach.
**Lighting:** Pitch black. Your torch is the only light source. Flickering. Fuel: 100 ticks (approx. 10 minutes real-time). Bonfires provide warm light in 3D radius.
**Soundtrack:** Muffled water drops. Scurrying. A low hum that might be wind or might be something breathing.

---

## FLOOR MAP

```
                         ┌──────┐
                         │  15  │
                         │BONE  │
                         │PIT   │
                         └──┬───┘
                            │
        ┌──────┐   ┌────────┴───────┐   ┌──────┐
        │  11  │───│       18       │───│  19  │
        │UPPER │   │  INTERSECTION  │   │COLLAPSED
        │SEWER │   └────────┬───────┘   │TUNNEL│
        └──┬───┘            │            └──┬───┘
           │                │               │
┌──────┐   ┌┴─────┐   ┌────┴────┐   ┌──────┴──────┐
│  13  │───│  8   │───│    9    │───│     20      │
│FUNGAL│   │PIPE  │   │GUARDED  │   │    WELL     │
│ALCOVE│   │JUNC  │   │  DOOR   │   │             │
└──┬───┘   └──┬───┘   └────┬────┘   └─────────────┘
   │          │            │
┌──┴───┐   ┌──┴───┐   ┌────┴────┐   ┌──────┐
│  16  │   │  14  │   │   10    │───│  21  │
│OTHER │   │MAINT │   │ANTE-    │   │GOBLIN│
│HERMIT│   │ROOM  │   │CHAMBER  │   │BARRACKS
└──────┘   └──────┘   └────┬────┘   └──┬───┘
                           │            │
┌──────┐   ┌──────┐   ┌────┴────┐   ┌──┴───┐
│  3   │───│  1   │───│    2    │   │  22  │
│SEWER │   │BONFIRE    │HERMIT   │   │ARMORY│
│TUNNEL│   │CELL  │   │CELL    │   └──────┘
└──┬───┘   └──────┘   └─────────┘      │
   │                                    │
┌──┴───┐                           ┌────┴────┐
│  4   │                           │   23    │
│RAT   │                           │FLOODED  │
│NURSERY                           │DEEP     │
└──┬───┘                           └────┬────┘
   │                                     │
┌──┴───┐   ┌──────┐   ┌──────┐   ┌─────┴────┐
│  5   │───│  6   │───│  7   │───│    24    │
│BOSS  │   │WINE  │   │FLOODED    │ANTE-     │
│RAT   │   │CELLAR│   │PASSAGE    │CHAMBER   │
└──────┘   └──────┘   └──────┘   └────┬─────┘
                                      │
                               ┌──────┴──────┐
                               │     25      │
                               │    BATH     │
                               │  CHAMBER    │
                               │  (GRIBNAB)  │
                               └─────────────┘
```

---

## ROOM BREAKDOWNS

### ROOM 1 — THE BONFIRE CELL (Starting Room)
**Dimensions:** 4m × 4m. Stone walls. Low ceiling (2.2m). One iron gate (locked from outside).
**Type:** Safe zone / Tutorial
**Contents:**
- Bonfire (unlit — you must light it with your torch)
- A burlap sack containing: Rusty Dagger (1 dmg, 50% break chance on crit), 1× Health Potion (heals 15 HP), Torch (already in hand)
- A puddle of murky water (1D — can be drunk: 50% heal 5 HP, 50% **Nauseated**)
- A wooden bucket (can be used as weapon: 1 dmg, or helmet: +2% physical resistance, –10% accuracy)
- Scratches on the wall: "GREG WAS HERE" (you don't remember writing this)
**Lighting:** Pitch black until torch is lit. Bonfire provides warm light in 3D radius.
**Enemies:** None.
**Narrator on entry:** *"You wake up. You are lying on cold stone. You are wearing underwear. This is not how you thought today would go, and you once thought you'd marry a chandelier."*
**Narrator on standing:** *"You stand. The room spins. You are not sure if it's the hangover or the dungeon. Both, probably."*
**Narrator on examining the sack:** *"A sack. It contains a dagger that's seen better centuries, a potion of questionable provenance, and a torch. This is your inheritance. Spend it wisely."*
**Narrator on lighting bonfire:** *"The bonfire catches. The warmth is immediate. The warmth is the first good thing that has happened to you since you woke up. The warmth is the first good thing that has happened to you in WEEKS."*
**Interactions:**
- Light bonfire: Creates checkpoint. Restores full HP. Refreshes torch to 100.
- Drink puddle: Risk/reward. Narrator comments either way.
- Wear bucket: Narrator has SO many comments.
- Read wall scratches: *"You don't remember writing this. You don't remember ANYTHING. This is either amnesia or a really good night."*

---

### ROOM 2 — THE HERMIT'S CELL
**Dimensions:** 3m × 3m. Stone. One iron gate (locked from inside — you can open it now).
**Type:** NPC / Quest giver
**Contents:**
- The Hermit (NPC — see NPC section)
- A straw mat (resting here heals 5 HP, once per visit)
- A wooden cup (can be used as thrown weapon: 1 dmg)
- A small chest (locked — requires key from Boss Rat or lockpick)
**Lighting:** Dim. One candle (can be taken, provides light in 1D radius for 20 ticks).
**Enemies:** None.
**Narrator on entry:** *"There is an old man in the next cell. He is missing a finger. He is smiling. This is not reassuring."*
**Interactions:**
- Talk to Hermit: Starts main quest.
- Take candle: *"You take the candle. The Hermit doesn't mind. The Hermit has been in the dark for centuries. He's used to it."*
- Rest on mat: *"You lie on the straw mat. It smells like straw. It smells like a barn. It smells like HOME. You sleep for five minutes. It's the best five minutes of your life."*

---

### ROOM 3 — THE SEWER TUNNEL (East)
**Dimensions:** 2m wide, 8m long. Curved. Water flows east to west (ankle-deep, 1D).
**Type:** Combat
**Contents:**
- 3× Small Rats (enemies — 3 HP each, 1 dmg, flee at 1 HP)
- A floating barrel (can be pushed, used as cover, or broken for wood scraps)
- A skeleton in the water (loot: 5 gold, a ring worth 2 gold, a note: "The rat took my finger. Then it took my life. Priorities.")
**Lighting:** Dark. Torch required.
**Enemies:** 3× Small Rats.
**Narrator on entry:** *"The sewer tunnel stretches into darkness. Something squeaks. Something always squeaks."*
**Narrator on finding skeleton:** *"A skeleton. In the water. It's been here a while. It's wearing the same underwear as you. This is either a coincidence or a dress code."*
**Interactions:**
- Push barrel: Can be used to block rats or create cover.
- Search skeleton: Loot + lore note.
- Break barrel: Wood scraps (crafting material).

---

### ROOM 4 — THE RAT NURSERY
**Dimensions:** 5m × 5m. Circular. Walls are gnawed bone.
**Type:** Combat (swarm)
**Contents:**
- 1× Mother Rat (enemy — 8 HP, 2 dmg, summons 1 Small Rat per turn)
- 4× Baby Rats (enemies — 1 HP each, 0 dmg, but if they hit you, 10% chance of **Infected**)
- A nest made of cloth scraps (search: find a button, a coin, a tooth)
- A bone with meat on it (can be used as weapon: 2 dmg, or thrown: 3 dmg, one use)
**Lighting:** Very dark. Torch required.
**Enemies:** Mother Rat + babies.
**Narrator on entry:** *"This is where the rats raise their young. It is disgusting. It is also kind of impressive. The nursery has better structure than your last apartment."*
**Narrator on killing Mother Rat:** *"The mother rat is dead. The babies scatter. You feel nothing. You feel EVERYTHING. You are a monster. You are a PARENT'S WORST NIGHTMARE."*
**Interactions:**
- Throw bone: Distracts rats. They fight over it.
- Search nest: Minor loot.
- Use fire: Rats flee. But babies might burn. Narrator judges.

---

### ROOM 5 — THE BOSS RAT'S LAIR
**Dimensions:** 6m × 6m. High ceiling (3m). Bones everywhere.
**Type:** Boss arena
**Contents:**
- Boss Rat (mini-boss — see Boss section)
- The Hermit's Finger (on a small pedestal of bone, next to the Boss Rat)
- A pile of stolen items (loot after Boss Rat dies: random item from Floor 50 loot table)
- A tunnel leading to Room 6 (blocked by debris — requires 2+ Strength or tool to clear)
**Lighting:** Dark. Boss Rat's eyes glow red (creepy).
**Enemies:** Boss Rat.
**Narrator on entry:** *"The room smells like rat. Specifically, it smells like a rat that has never once considered bathing. In the center, on a little bone pedestal, is a finger. It has a ring on it. The rat is watching you. The rat is always watching."*
**Interactions:**
- Take finger: Boss Rat attacks immediately.
- Offer cheese (if you have it): Special pacification.
- Place offering on pedestal: Alternative resolution.

---

### ROOM 6 — THE COLLAPSED WINE CELLAR
**Dimensions:** 7m × 4m. Partially collapsed. Wine racks everywhere.
**Type:** Combat + Environmental
**Contents:**
- 2× Mold Blobs (enemies — 5 HP each, 1 dmg, on death: release spores, 25% chance **Nauseated**)
- 12× bottles of wine (6 are intact: consumable, heal 10 HP each; 6 are broken: can be used as improvised weapons, 2 dmg, one use)
- A wine press (can be used to crush enemies if shoved into it: 10 dmg, one use)
- A trapdoor leading down to Room 7 (locked — requires key from Room 5 or lockpick)
**Lighting:** Dim. Some bottles glow faintly (bioluminescent mold).
**Enemies:** 2× Mold Blobs.
**Narrator on entry:** *"A wine cellar. Most of the bottles are broken. The ones that aren't are probably poisoned. This is the best room you've seen so far."*
**Narrator on drinking wine:** *"You drink the wine. It's terrible. It's the best thing you've ever tasted. It's been fermenting for centuries. It's basically vinegar. You drink another."*
**Interactions:**
- Shove enemy into wine press: 10 dmg, one use, very satisfying.
- Drink wine: Heal 10 HP. But 6 bottles are poisoned (25% chance **Poisoned**).
- Break bottle: Improvised weapon.
- Open trapdoor: Requires key or lockpick.

---

### ROOM 7 — THE FLOODED PASSAGE
**Dimensions:** 2m wide, 10m long. Waist-deep water (2D).
**Type:** Combat + Hazard
**Contents:**
- 2× Sewer Leeches (enemies — 4 HP each, 1 dmg + **Bleeding** 1/turn for 2 turns)
- A submerged chest (requires swimming — hold breath for 3 turns. Loot: 15 gold, Rusty Key)
- A body (loot: Leather Boot, 5 gold, a note: "The soap is in the pipes. Don't ask why.")
- The Rusty Key (opens Room 2's chest and Room 10's door)
**Lighting:** Very dark. Water reflects torchlight.
**Enemies:** 2× Sewer Leeches.
**Narrator on entry:** *"The water is waist-deep and warm. You do not want to know why it's warm. Something brushes your leg. It's not a friend."*
**Narrator on finding body:** *"A body. Floating. It's been here a while. It's wearing armor. Good armor. You take the armor. The body doesn't mind. The body is DEAD."*
**Interactions:**
- Search body: Loot + lore note.
- Open submerged chest: Requires holding breath (3 turns underwater).
- Drain water (if you found the valve in Room 8): Water level drops to ankle-deep.

---

### ROOM 8 — THE PIPE JUNCTION
**Dimensions:** 4m × 4m × 4m (vertical — pipes go up and down).
**Type:** Puzzle + Exploration
**Contents:**
- A large pipe (can be climbed with 2+ Athletics or Plumber skill — leads to Room 14)
- A medium pipe (too small to enter — but you can reach in and pull out: a bar of soap! This is the **Goblin King's Soap**)
- A small pipe (water flows out — can be used to fill containers)
- A valve (can be turned with Plumber skill or wrench — stops water flow in Room 7)
- 1× Rat (enemy — 3 HP, 1 dmg)
**Lighting:** Dim. Pipes cast complex shadows.
**Enemies:** 1× Rat.
**Narrator on entry:** *"Pipes. Everywhere. One of them has soap in it. You don't know why. The dungeon doesn't explain itself. The dungeon is not your friend."*
**Narrator on finding soap:** *"You found soap. It's pink. It smells like strawberries. This is somehow the most disturbing thing you've found today, and you found a finger."*
**Interactions:**
- Reach into medium pipe: Find soap. But something might be IN the pipe...
- Turn valve: Drains Room 7. Makes it easier.
- Climb large pipe: Requires skill check. Leads to Room 14.
- Fill container: Water can be used later (Room 20, Room 17).

---

### ROOM 9 — THE GUARDED DOOR
**Dimensions:** 3m × 3m. One large iron door (locked). One goblin guard.
**Type:** Social / Quest gate
**Contents:**
- Goblin Guard "Scrag" (NPC — see NPC section)
- The Locked Door (requires soap to open — the guard won't let you through without it)
- A torch sconce (can be used as weapon: 2 dmg, one use)
- A sign on the door: "GRIBNAB'S BATH — KNOCK FIRST — SOAP REQUIRED"
**Lighting:** Bright. Two torches on the wall.
**Enemies:** None (unless you attack the guard).
**Narrator on entry:** *"A goblin stands in front of a large iron door. He looks bored. He looks like he's been standing here for years. He looks like he will stand here for years more."*
**Interactions:**
- Talk to Scrag: Social encounter. Requires soap OR charm OR violence.
- Show soap: He lets you through.
- Attack Scrag: Fight. He's tougher than he looks.
- Break door: Requires 2+ Strength or Plumber skill. Loud. Alerts rooms 10, 21, 22.

---

### ROOM 10 — THE GUARD'S ANTECHAMBER
**Dimensions:** 4m × 3m. Small. Cluttered.
**Type:** Rest + Social
**Contents:**
- A bunk bed (resting here heals 10 HP, once per visit)
- A footlocker (locked — Rusty Key from Room 7 opens it. Loot: 10 gold, Guard's Cap (+5% evasion), a love letter)
- A table with dice (can play dice with the guard if you have gold — gamble)
- A chamber pot (can be used as thrown weapon: 1 dmg, 50% chance **Disgusted** on target)
**Lighting:** Dim. One candle.
**Enemies:** None.
**Narrator on entry:** *"The guard's antechamber. It smells like goblin. Which is to say, it smells like someone tried to cover up a smell with a worse smell."*
**Narrator on reading love letter:** *"A love letter. It's addressed to Scrag. It's from someone named 'Bliss.' It's... it's very romantic. It's very GRAPHIC. You put it back. You put it back and you NEVER speak of it."*
**Interactions:**
- Rest: Heal 10 HP.
- Open footlocker: Requires key.
- Play dice: Gamble gold. Win or lose.
- Read letter: Lore. Narrator is uncomfortable.

---

### ROOM 11 — THE UPPER SEWER (North)
**Dimensions:** 2m wide, 6m long. Dry. Elevated.
**Type:** Combat + Exploration
**Contents:**
- 2× Small Rats (enemies — 3 HP each, 1 dmg)
- A ledge (can be climbed to reach Room 15 — requires 2+ Athletics)
- A nest (search: find 3× Rat Teeth — crafting material)
- A crack in the wall (peek through: see Room 12)
**Lighting:** Dark.
**Enemies:** 2× Small Rats.
**Narrator on entry:** *"The upper sewer. It's drier up here. The rats are smaller. The rats are always smaller when you're looking down at them."*
**Interactions:**
- Climb ledge: Leads to Room 15.
- Search nest: Crafting materials.
- Peek through crack: Scout Room 12 before entering.

---

### ROOM 12 — THE FLOODED RAT DEN
**Dimensions:** 5m × 5m. Knee-deep water. Connected to Room 11 via crack.
**Type:** Combat (ambush)
**Contents:**
- 1× Large Rat (enemy — 10 HP, 3 dmg, **Bleeding** on hit)
- 3× Small Rats (enemies — 3 HP each, 1 dmg)
- A floating corpse (loot: 8 gold, a ring, a note: "The Hermit lies. Trust no one. Especially not the one who smiles.")
- A drain (can be opened with Plumber skill — drains the water, makes the room easier)
**Lighting:** Very dark.
**Enemies:** Large Rat + Small Rats.
**Narrator on entry:** *"The water is brown. You tell yourself it's the sewer. You know it's not just the sewer."*
**Narrator on reading note:** *"A note. It says the Hermit lies. It says trust no one. It says ESPECIALLY not the one who smiles. The Hermit smiles. The Hermit is ALWAYS smiling."*
**Interactions:**
- Search corpse: Loot + lore note.
- Open drain: Plumber skill. Drains water.
- Ambush setup: If you peeked through crack in Room 11, you can set up an ambush instead.

---

### ROOM 13 — THE FUNGAL ALCOVE
**Dimensions:** 3m × 3m. Damp. Mushrooms everywhere.
**Type:** Puzzle + Hazard
**Contents:**
- 3× Glowing Mushrooms (can be eaten: heal 5 HP each, or used as light source: 1D radius, 30 ticks each)
- 1× Poison Mushroom (if eaten: **Poisoned**, 2 dmg/turn for 3 turns)
- A mushroom circle (if you sit in it: **Hallucinating** for 2 turns, but you see a hidden door to Room 16)
- A note on the wall: "The Hermit was here before the dungeon. The dungeon grew around him."
**Lighting:** Dim. Mushrooms glow faintly.
**Enemies:** None.
**Narrator on entry:** *"Mushrooms. Glowing mushrooms. In a dungeon. This is fine. Everything is fine. Eat the mushroom, Greg."*
**Narrator on sitting in circle:** *"You sit in the mushroom circle. The world SPINS. The world CHANGES. You see things. You see a DOOR. You see a door that wasn't there before. You see a door that's ALWAYS been there. You see a door that's WAITING."*
**Interactions:**
- Eat mushroom: Heal or poison. 50/50.
- Sit in circle: Hallucinate. See hidden door.
- Take mushroom: Light source or crafting.
- Read wall note: Lore. Hermit mystery deepens.

---

### ROOM 14 — THE PIPE MAINTENANCE ROOM
**Dimensions:** 3m × 3m. Full of tools.
**Type:** Loot + Utility
**Contents:**
- A wrench (weapon: 3 dmg, or tool for Plumber skills)
- A plunger (weapon: 2 dmg, 25% chance to **Stun**)
- A pipe fitting (can be worn as helmet: +5% physical resistance)
- A toolbox (contains: 3× Nails, 1× Wire, 1× Soap Chunk — partial soap, not enough for the guard)
- A ladder leading down to Room 8
**Lighting:** Dim.
**Enemies:** None.
**Narrator on entry:** *"A maintenance room. Tools. You don't know what most of them are for. You pick up a wrench. It feels right. This is the first time anything has felt right today."*
**Interactions:**
- Take wrench: Weapon + tool.
- Take plunger: Weapon + stun.
- Take pipe fitting: Armor.
- Take toolbox: Crafting materials + partial soap.

---

### ROOM 15 — THE BONE PIT
**Dimensions:** 6m × 6m. Deep pit (3m) filled with bones.
**Type:** Combat + Ritual
**Contents:**
- 1× Bone Rat (enemy — 12 HP, 2 dmg, reassembles once if killed unless you burn the bones)
- A skeleton (loot: 5 gold, a ribcage that can be worn as armor: +3% physical resistance)
- A bone pedestal (place an offering: if you place the Hermit's Finger here, the Bone Rat is friendly for 1 fight)
- A tunnel leading to Room 17 (hidden — requires finding the secret)
**Lighting:** Dark. Bones gleam.
**Enemies:** Bone Rat.
**Narrator on entry:** *"Bones. So many bones. You try not to think about where they came from. You fail."*
**Narrator on killing Bone Rat:** *"The Bone Rat falls. The bones rattle. The bones REASSEMBLE. The Bone Rat is back. The Bone Rat is ALWAYS back. You need fire. You need fire or you need to LEAVE."*
**Interactions:**
- Burn bones: Prevents reassembly. Requires fire source.
- Place finger on pedestal: Pacifies Bone Rat.
- Search skeleton: Loot.
- Find hidden tunnel: Perception check. Leads to Room 17.

---

### ROOM 16 — THE HIDDEN ROOM (The Other Hermit)
**Dimensions:** 3m × 3m. Hidden behind the mushroom circle in Room 13.
**Type:** NPC / Secret
**Contents:**
- The Other Hermit (NPC — see NPC section)
- A chest (unlocked — contains: 20 gold, **Hermit's Ring** (+5% XP), a note: "The first Hermit is the dungeon's heart. He doesn't know it. Don't tell him.")
- A mirror (look into it: you see yourself, but cleaner. +2% confidence. No mechanical effect.)
- A bed (resting here fully heals you, once per run)
**Lighting:** Warm. Candles everywhere.
**Enemies:** None.
**Narrator on entry:** *"A hidden room. Another old man. Also missing a finger. This is getting weird."*
**Interactions:**
- Talk to Other Hermit: Lore. Quest. Choice.
- Open chest: Loot.
- Look in mirror: Flavor.
- Rest: Full heal, once per run.

---

### ROOM 17 — THE STORAGE VAULT
**Dimensions:** 5m × 5m. Locked (requires Rusty Key from Room 7 or lockpick).
**Type:** Loot + Trap
**Contents:**
- 30 gold
- 2× Health Potions
- 1× **Moldy Cheese** (consumable: heal 15 HP, 50% chance **Nauseated**)
- 1× **Rusty Sword** (weapon: 4 dmg, 10% break chance)
- A note: "Gribnab's soap is his crown. Without it, he is nothing. With it, he is a very clean nothing."
- A pressure plate trap (step on it: darts fire from walls, 3 dmg, 50% chance **Poisoned**)
**Lighting:** Dark.
**Enemies:** None (but trap).
**Narrator on entry:** *"A vault. Gold. Potions. Cheese. This is the most beautiful room you've ever seen. You are very easily pleased."*
**Narrator on trap:** *"You stepped on something. Something clicked. Something is flying at your face. This is a DART. This dart is POISONED. This is a BAD day."*
**Interactions:**
- Disarm trap: Perception + Dexterity check.
- Open chest: Loot.
- Read note: Lore about Gribnab.

---

### ROOM 18 — THE INTERSECTION
**Dimensions:** 5m × 5m. Four-way intersection. Central hub.
**Type:** Hub + Puzzle
**Contents:**
- A compass rose on the floor (points to the exit — but only if you've been to Room 9)
- A fountain (dry — but if you pour water from Room 8 into it, it activates: heal 10 HP, once)
- 1× Small Rat (enemy — 3 HP, 1 dmg)
- A sign: "BATH THIS WAY →" with an arrow pointing to Room 9
**Lighting:** Dim. Torch sconces on walls.
**Enemies:** 1× Small Rat.
**Narrator on entry:** *"An intersection. You can go four ways. Three of them are bad. One of them is worse. Choose."*
**Interactions:**
- Pour water in fountain: Activate healing fountain.
- Read sign: Direction to boss.
- Examine compass: Points to exit (if discovered).

---

### ROOM 19 — THE COLLAPSED TUNNEL (Shortcut)
**Dimensions:** 2m wide, 4m long. Partially collapsed.
**Type:** Shortcut + Hazard
**Contents:**
- Debris (can be cleared with 2+ Strength or tool — creates shortcut to Room 1)
- A skeleton (loot: 3 gold, a note: "I almost made it back. The bonfire was right there.")
- A crack in the ceiling (look up: see stars. Or maybe they're crystals. You're not sure.)
**Lighting:** Very dark.
**Enemies:** None.
**Narrator on entry:** *"A collapsed tunnel. You can see the bonfire room through the gap. You can also see a skeleton. The skeleton is not moving. This is the preferred state for skeletons."*
**Interactions:**
- Clear debris: Creates shortcut to Room 1 (bonfire).
- Search skeleton: Loot + lore.
- Look up: Flavor. Stars or crystals?

---

### ROOM 20 — THE OLD WELL
**Dimensions:** 3m × 3m. Circular. A well in the center.
**Type:** Puzzle + Ritual
**Contents:**
- The Well (can be lowered down — leads to Room 7. Or you can drop something in: if you drop the Hermit's Finger, you get **Blessed** for 3 fights)
- A bucket (can be used as helmet: +3% physical resistance, or thrown: 1 dmg)
- A rope (can be used as whip: 2 dmg, or to climb)
- 1× Rat (enemy — 3 HP, 1 dmg)
**Lighting:** Dark. Well is darker.
**Enemies:** 1× Rat.
**Narrator on entry:** *"A well. It's deep. You drop a pebble. You don't hear it land. This is either very deep or very soft. You don't want to find out which."*
**Interactions:**
- Lower into well: Leads to Room 7.
- Drop finger: **Blessed** for 3 fights.
- Use rope: Climb or weapon.
- Use bucket: Helmet or thrown.

---

### ROOM 21 — THE GOBLIN BARRACKS
**Dimensions:** 6m × 4m. Bunk beds. Messy.
**Type:** Combat + Stealth
**Contents:**
- 2× Goblin Guards (enemies — 8 HP each, 3 dmg, **Shield Bash** 50% chance to **Stun**)
- A table with a map (study it: reveals Rooms 22–25)
- A footlocker (unlocked: 15 gold, **Goblin Spear** — weapon: 5 dmg, thrown: 6 dmg)
- A cooking pot (contains stew: heal 10 HP, once)
**Lighting:** Dim. Fire in a brazier.
**Enemies:** 2× Goblin Guards.
**Narrator on entry:** *"Goblin barracks. They have bunk beds. They have a cooking pot. They have a life. You have underwear. Perspective is important."*
**Interactions:**
- Fight: Direct combat.
- Stealth: Sneak past if you have Sneak skill.
- Study map: Reveals floor layout.
- Eat stew: Heal 10 HP.

---

### ROOM 22 — THE ARMORY
**Dimensions:** 4m × 4m. Weapons on walls.
**Type:** Loot + Combat
**Contents:**
- 1× Goblin Guard (enemy — 8 HP, 3 dmg)
- Weapon rack (choose one: **Rusty Axe** 5 dmg / **Rusty Spear** 4 dmg, thrown 5 dmg / **Rusty Mace** 5 dmg, 10% **Stun**)
- Armor rack (choose one: **Leather Vest** +5% physical resistance / **Chain Shirt** +7% physical resistance, –5% evasion)
- A note: "The King is in the bath. He is always in the bath. Do not disturb him. Unless you have soap. Then disturb him."
**Lighting:** Dim.
**Enemies:** 1× Goblin Guard.
**Narrator on entry:** *"An armory. Weapons. Armor. You are still in your underwear. This seems like an oversight."*
**Interactions:**
- Fight guard: Combat.
- Take weapon: Choose one.
- Take armor: Choose one.
- Read note: Lore.

---

### ROOM 23 — THE FLOODED DEEP
**Dimensions:** 6m × 6m. Waist-deep water. Deep.
**Type:** Combat + Environmental
**Contents:**
- 1× Giant Leech (enemy — 15 HP, 2 dmg + **Bleeding** 2/turn for 3 turns)
- 2× Sewer Leeches (enemies — 4 HP each, 1 dmg + **Bleeding**)
- A submerged altar (place an offering: if you place soap here, the water drains)
- A chest (submerged: 20 gold, **Waterlogged Book** — lore)
**Lighting:** Very dark. Water is opaque.
**Enemies:** Giant Leech + Leeches.
**Narrator on entry:** *"The water is deep. Something is moving under the surface. Something is always moving under the surface. You are not welcome here."*
**Interactions:**
- Fight leeches: Combat.
- Place soap on altar: Drains water. Easier fight.
- Open chest: Requires swimming.

---

### ROOM 24 — THE THRONE ROOM ANTECHAMBER
**Dimensions:** 5m × 5m. Ornate. Goblin banners.
**Type:** Combat + Social
**Contents:**
- 2× Goblin Guards (enemies — 8 HP each, 3 dmg)
- A banner (can be torn down and used as cloak: +5% evasion)
- A throne (small, goblin-sized — sitting on it: **Intimidated** but you gain **Goblin Respect** — goblins on this floor are neutral unless attacked)
- A door to Room 25 (the Bath Chamber — locked, requires soap or breaking down)
**Lighting:** Bright. Braziers.
**Enemies:** 2× Goblin Guards.
**Narrator on entry:** *"You are close. You can hear water. You can hear humming. The humming is off-key. The humming is always off-key."*
**Interactions:**
- Fight guards: Combat.
- Sit on throne: Gain **Goblin Respect**.
- Tear banner: Cloak.
- Open door: Requires soap or force.

---

### ROOM 25 — THE BATH CHAMBER (Gribnab's Lair)
**Dimensions:** 10m × 8m. Marble. Steam. A massive sunken tub in the center.
**Type:** Boss arena
**Contents:**
- Gribnab the Soapy (Boss — see Boss section)
- The Bath (steaming, pink water — can be used as environmental weapon: shove enemy in for 5 dmg + **Scalded**)
- 4× Rubber Ducks (can be squeezed: they squeak, distracting enemies for 1 turn. One use each.)
- A towel rack (towel can be used as whip: 1 dmg, or to blind: 50% **Blinded** for 1 turn)
- A bottle of bubble bath (can be poured on the floor: **Slippery** area, 2D radius, 3 turns)
- The Staircase to Floor 49 (behind the throne — locked until Gribnab is defeated)
**Lighting:** Bright. Candles everywhere. Steam diffuses light.
**Enemies:** Gribnab.
**Narrator on entry:** *"The Goblin King is in his bath. He is wearing a bath cap. He is surrounded by rubber ducks. He is singing. He is a goblin king and he is singing and you are in your underwear and this is your life now."*
**Interactions:**
- Fight Gribnab: Boss fight.
- Use bath: Environmental weapon.
- Squeeze duck: Distraction.
- Pour bubble bath: Create slippery area.
- Use towel: Weapon or blind.

---

## ENCOUNTERS (Non-Room-Specific)

### RAT AMBUSH (Random)
**Trigger:** Entering any sewer tunnel (Rooms 3, 7, 11, 12) without light.
**Description:** *"Something moves in the dark. Something with too many legs. Something with too many TEETH."*
**Enemies:** 2× Small Rats + 1× Large Rat.
**Resolution:** Fight or flee.

### SEWER FLOOD (Trap)
**Trigger:** Stepping on a loose tile in Room 7.
**Description:** *"The water rises. The water rises FAST. The water is at your knees. The water is at your waist. The water is ANGRY."*
**Effect:** 2 dmg + pushed 1D. Must swim to safety.
**Resolution:** Athletics check or take damage.

### MOLD SPORE CLOUD (Trap)
**Trigger:** Breaking a mushroom in Room 13 without caution.
**Description:** *"The mushroom EXPLODES. Not with fire. With SPORES. With a cloud of SPORES. You breathe them in. You breathe in TOO MANY spores."*
**Effect:** **Nauseated** (–1 accuracy) for 3 turns.
**Resolution:** Endure or use antidote.

### GOBLIN PATROL (Random)
**Trigger:** Entering Rooms 21, 22, or 24 after making noise.
**Description:** *"You hear footsteps. You hear GOBLIN footsteps. You hear goblin footsteps and goblin WHISPERING. They're looking for something. They're looking for YOU."*
**Enemies:** 1× Goblin Guard.
**Resolution:** Fight, hide, or talk.

---

## TRAPS

| Trap | Location | Trigger | Effect | Disarm |
|------|----------|---------|--------|--------|
| Dart Trap | Room 17 | Pressure plate | 3 dmg + 50% **Poisoned** | Perception + Dexterity |
| Sewer Flood | Room 7 | Loose tile | 2 dmg + pushed 1D | Perception |
| Mold Spore | Room 13 | Breaking mushroom | **Nauseated** 3 turns | Caution (don't break) |
| Tripwire | Room 11 | Wire at ankle height | **Prone** + 1 dmg | Perception |
| Falling Bucket | Room 1 | Opening gate | 1 dmg + **Dazed** | Perception |

---

## PUZZLES

### THE SOAP PUZZLE
**Location:** Rooms 8, 9, 23, 25
**Problem:** The Goblin King's guard won't let you through without soap.
**Solutions:**
1. Find soap in Room 8's medium pipe (intended).
2. Combine 3 Soap Chunks from Room 14's toolbox (crafting).
3. Find Premium Soap in Room 17's vault (if you have the key).
4. Break down the door (2+ Strength or Plumber skill).
5. Charm the guard (high charisma or specific skills).
**Narrator on solving:** *"You found soap. You beautiful, disgusting idiot. You found soap."*

### THE FINGER PUZZLE
**Location:** Rooms 2, 5, 15, 20
**Problem:** The Hermit wants his finger back. The Boss Rat has it.
**Solutions:**
1. Kill Boss Rat, take finger (intended).
2. Offer cheese to Boss Rat (pacification).
3. Place finger on bone pedestal in Room 15 (ritual — but you don't have it yet).
4. Drop finger in well (alternative — get **Blessed** but fail quest).
**Narrator on returning finger:** *"You return the finger. The Hermit cries. The Hermit LAUGHS. The Hermit puts the ring on. The ring FITS. The ring ALWAYS fit."*

### THE MUSHROOM CIRCLE PUZZLE
**Location:** Room 13
**Problem:** There's a hidden door. How do you find it?
**Solutions:**
1. Sit in the mushroom circle (hallucinate, see door).
2. Eat a glowing mushroom (same effect).
3. Use a perception skill (see door directly).
4. Have the Other Hermit with you (he knows).
**Narrator on finding door:** *"A door. A hidden door. A door that's been waiting. A door that's been WAITING FOR YOU."*

---

## HIDDEN FEATURES

### THE OTHER HERMIT (Room 16)
**Discovery:** Through mushroom circle in Room 13.
**Content:** NPC, lore, loot, rest.
**Significance:** Major lore reveal. Companion candidate.

### THE SHORTCUT (Room 19)
**Discovery:** Clear debris with 2+ Strength or tool.
**Content:** Direct path back to Room 1 (bonfire).
**Significance:** Fast travel. Essential for repeated runs.

### THE WELL CONNECTION (Room 20)
**Discovery:** Lower into well.
**Content:** Leads to Room 7.
**Significance:** Alternative path. Skip Rooms 8-18.

### THE COMPASS ROSE (Room 18)
**Discovery:** Examine floor after visiting Room 9.
**Content:** Points to exit.
**Significance:** Navigation aid.

---

## NPCs

### THE HERMIT (Room 2)
**Appearance:** Old man. Missing left ring finger. Straw-colored beard. Rags. Always smiling.
**Personality:** Cheerful. Cryptic. Knows more than he says. Genuinely kind but deeply strange.

**Dialogue — First Meeting:**
> **Hermit:** "Ah! You're awake! I was starting to think you'd sleep through the apocalypse. Again."
> **Greg:** "Where am I? Why am I in my underwear?"
> **Hermit:** "You're in the Spire of Regret. Floor 50. The bottom. As for the underwear — that's between you and whatever you did last night. I don't judge. I can't. I have no eyebrows."

**Dialogue — The Quest:**
> **Hermit:** "I need a favor. A rat took my finger. The big one, down the tunnel. It has a little bone pedestal — very tasteful, for a rat. The finger has my wedding ring on it. I want it back. I was married once. She left me. But the ring stays."
> **Greg:** "You want me to fight a giant rat. For your finger."
> **Hermit:** "I want you to fight a giant rat for my finger. Yes. I'll make it worth your while. I have things. Equipment. Knowledge. I know what's going on here. I know why you're at the bottom. I know why you're in your underwear. Well — I have theories about the underwear."

**Dialogue — After Returning the Finger:**
> **Hermit:** "You did it! You beautiful, half-naked idiot. Here — take this." *(Gives equipment.)* "Now listen. This place — the Spire — it's alive. It grows around regret. You're at the bottom because your regrets are the freshest. The higher you go, the older the regrets. The worse they get. At the top — Floor 1 — there's something that's been trying to be good for a very long time. And failing. Every day. For ten thousand years."
> **Greg:** "What is it?"
> **Hermit:** "I'll tell you when you get back down. If you get back down. Now go. And Greg? The goblin at the door? He wants soap. Find the soap. It's in the pipes. Don't ask why."

**Equipment Given:**
- **Tattered Cloak** (+5% evasion, –2% charisma)
- **Sturdy Boots** (+3% physical resistance)
- **Leather Belt** (+1 inventory slot)
- **5 Gold**
- **1× Health Potion**

---

### THE OTHER HERMIT (Room 16)
**Appearance:** Identical to first Hermit. Missing RIGHT ring finger. Always frowning.
**Personality:** Suspicious. Paranoid. But honest. Brutally honest.

**Dialogue:**
> **Other Hermit:** "You found me. Good. Or bad. Depends on which Hermit you've been talking to."
> **Greg:** "There are two of you?"
> **Other Hermit:** "There are always two of everything down here. I'm the one who tells the truth. He's the one who tells the story. Both are useful. Both are dangerous."
> **Greg:** "Which one are you?"
> **Other Hermit:** "I'm the one who's still missing his finger. He got his back, didn't he? Did he tell you where it came from? Did he tell you it was HIS rat? It wasn't his rat. It was the dungeon's rat. The dungeon gave it to him. The dungeon gives everyone what they regret."
> **Greg:** "What do you regret?"
> **Other Hermit:** "I trusted him. My brother. The other me. He said we could leave. He said there was a way. There wasn't. There isn't. But you — you might actually make it. You're too stupid to know you can't."
> **Greg:** "Is that a compliment?"
> **Other Hermit:** "It's an observation. Take this." *(Gives Hermit's Ring.)* "It'll help. And Greg? When you get to the top — don't trust the Paragon. Don't trust me. Don't trust yourself. Trust the chandelier."

---

### GOBLIN GUARD "SCRAG" (Room 9)
**Appearance:** Goblin in rusty armor. Spear. Bored expression. Name tag: "SCRAG."
**Personality:** Tired. Underpaid. Just wants soap.

**Dialogue — First Meeting:**
> **Scrag:** "Halt. State your business."
> **Greg:** "I need to get through."
> **Scrag:** "Everyone needs to get through. What do you have?"
> **Greg:** "I have a dagger."
> **Scrag:** "I have a spear. Next."
> **Greg:** "I have... gold?"
> **Scrag:** "Gold doesn't clean anything. Next."
> **Greg:** "What do you want?"
> **Scrag:** "Soap. The King wants soap. I want soap. Everyone wants soap. You bring me soap, you go through. No soap, no go. Those are the rules. I didn't make them. I just enforce them. Badly."

**Dialogue — With Soap:**
> **Scrag:** "Is that... is that soap? That's soap! That's beautiful soap! Give it here! Give it! ...Okay. You can go through. But knock first. The King hates being surprised. Well — he hates being surprised WITHOUT soap. With soap, he's only mildly annoyed. Knock first."

**Dialogue — Without Soap (Alternative):**
> **Scrag:** "No soap? Then no door. Unless you can break it. It's iron. You're in your underwear. I like your chances. I don't, actually. But it'll be funny to watch."

---

### GRIBNAB THE SOOPY (Room 25 — Boss)
**Appearance:** Goblin king. Large for a goblin (1.2m tall). Pink bath cap with rubber duck. Bubbles. Soap-crusted club. Crown made of soap bars.
**Personality:** Vain. Petty. Surprisingly philosophical. Loves baths more than power.

**Dialogue — Pre-Fight (knock + soap):**
> **Gribnab:** "Enter! You have soap? You do! Wonderful! Come in, come in! Don't mind the bubbles. Don't mind the ducks. Don't mind me. I am Gribnab, King of the Goblins, Lord of the Bath, Sovereign of Suds! And you are... in your underwear. Bold choice. I respect it."
> **Greg:** "I need to get through."
> **Gribnab:** "Through? Through to where? Up? There is no up. There is only the bath. The bath is forever. The bath is all. But you — you want to leave. They all want to leave. Fine. Fight me. If you win, the door opens. If I win, you join the bath. Forever. It's very warm."

**Dialogue — Pre-Fight (break door):**
> **Gribnab:** "You BROKE my door! That was a good door! That was an IRON door! Do you know how hard it is to get iron down here?! I am going to BATH you! I am going to bath you to DEATH!"

**Dialogue — Mid-Fight (50% HP):**
> **Gribnab:** "You fight well for someone in underwear! I am almost proud! Almost! But the bath demands a sacrifice! And you are IT!"

**Dialogue — Post-Fight (win):**
> **Gribnab:** "I... I lost. To a naked human. In my own bath. This is... this is the worst day of my life. And I once ate a live eel on a bet. Take the club. Take the crown. Take the ducks. Just... just let me keep the bath cap. Please. It's all I have left."

**Dialogue — Post-Fight (befriend):**
> **Gribnab:** "Wait. Wait. You're not going to kill me? You're... you're offering me a truce? A... a partnership? You want to rule the bath together? ...I've never had a partner. I've only had subjects. And rubber ducks. This is... this is nice. Okay. Okay! You can stay! We'll rule together! The bath will be OURS! ...You want to leave? You want to go UP? Fine. Fine! Take the club. Take the stairs. But come back. Come back and visit. I get lonely. The ducks don't talk back. Much."

---

## QUESTS

### MAIN QUEST: THE HERMIT'S FINGER
**Giver:** The Hermit (Room 2)
**Objective:** Retrieve the Hermit's finger from the Boss Rat (Room 5).
**Steps:**
1. Talk to Hermit. Get quest.
2. Navigate to Room 5 (through Rooms 3, 4 or 8, 14, etc.).
3. Defeat or pacify Boss Rat.
4. Take finger from bone pedestal.
5. Return to Hermit.
**Reward:** Starting equipment (cloak, boots, belt, 5 gold, potion). Lore about the Spire. Hint about soap.
**Failure States:**
- Kill Hermit: Quest fails. No starting equipment. Narrator is disappointed.
- Drop finger in well: Get **Blessed** but fail quest. Hermit is sad.
- Give finger to Other Hermit: Alternative path. Different rewards.

### SIDE QUEST 1: THE OTHER HERMIT
**Giver:** None (discover through Room 13's mushroom circle).
**Objective:** Find the Other Hermit in Room 16.
**Steps:**
1. Find Room 13.
2. Sit in mushroom circle or eat mushroom.
3. See hidden door.
4. Enter Room 16.
5. Talk to Other Hermit.
**Reward:** 20 gold, Hermit's Ring (+5% XP), lore about the Hermit and the Spire.
**Significance:** Major lore. Sets up Floor 1's Ending C.

### SIDE QUEST 2: CURSED GOLD
**Giver:** None (discover in Room 17's vault).
**Objective:** Find the cursed gold. Decide what to do with it.
**Steps:**
1. Find Room 17 (requires Rusty Key from Room 7).
2. Open vault. Find 30 gold.
3. Take gold: Inflicted with **Cursed** (–20% loot quality).
4. Donate gold to ghost on Floor 47: Remove curse, get **Blessed Penny** (+5% gold find).
**Reward:** Either 30 gold (with curse) or **Blessed Penny** (without curse).
**Significance:** Cross-floor quest. Connects Floor 50 to Floor 47.

### SIDE QUEST 3: THE SOAP CONUNDRUM
**Giver:** Implied by Hermit's hint.
**Objective:** Find soap to pass the guard in Room 9.
**Steps:**
1. Find soap in Room 8's medium pipe (easiest).
2. OR combine 3 Soap Chunks from Room 14.
3. OR find Premium Soap in Room 17.
4. OR break down the door.
5. OR charm the guard.
**Reward:** Access to Room 25 (boss). Progression.
**Significance:** Teaches problem-solving. Multiple solutions.

---

## BOSS: BOSS RAT (Room 5)

**HP:** 25
**Damage:** 4
**Armor:** 0
**Speed:** Fast (acts twice per 3 turns)

**Abilities:**
- **Gnaw:** 4 dmg, 25% chance **Bleeding** (2/turn for 3 turns)
- **Summon:** Once per fight, summons 2× Small Rats
- **Frenzy:** Below 50% HP, attacks twice per turn

**Phase 1 (100-50% HP):** Normal attacks. Uses Gnaw. Summons rats at 75% HP.
**Phase 2 (50-0% HP):** Frenzy. Attacks twice per turn. More aggressive.

**Drops:**
- Hermit's Finger (quest item)
- 10 gold
- Random loot table item

**Narrator on death:** *"The rat is dead. The finger is yours. You are holding a dead rat's trophy. This is your life now."*

---

## BOSS: GRIBNAB THE SOOPY (Room 25)

**HP:** 60
**Damage:** 6
**Armor:** 3 (from soap crust)
**Speed:** Medium

**Abilities:**
- **Club Smash:** 6 dmg, 25% chance **Stun**
- **Soap Splash:** 3 dmg to all targets in 2D radius, **Slippery** (50% fall chance) for 2 turns
- **Bubble Shield:** Gains +5 armor for 2 turns (3-turn cooldown)
- **Rubber Duck Distraction:** Throws a rubber duck. It squeaks. All enemies (including you) are **Distracted** (–10% accuracy) for 1 turn.
- **Bath Time:** Below 25% HP, Gribnab jumps in the bath. Heals 10 HP. Can only be pulled out with a grapple or Plumber skill.
- **Sovereign Sudds:** Below 10% HP, Gribnab's crown glows. All goblins on the floor are buffed (+20% damage) for 2 turns.

**Phase 1 (100-50% HP):** Club Smash, Soap Splash. Uses Bubble Shield defensively.
**Phase 2 (50-25% HP):** More aggressive. Uses Rubber Duck Distraction. Soap Splash every other turn.
**Phase 3 (25-0% HP):** Bath Time (heals). Sovereign Sudds (buffs goblins). Desperate.

**Drops:**
- **The Drowned Majesty** (Gribnab's Club — see Loot section)
- **Soap Crown** (see Loot section)
- 50 gold
- Staircase Key (unlocks Floor 49)

**Narrator on death:** *"The Goblin King is dead. The bath is silent. The rubber ducks float, abandoned. You are covered in soap and blood and you are still in your underwear. But you are alive. And that, somehow, is enough."*

---

## LOOT TABLE

### WEAPONS

| Name | Type | Damage | Effect | Requirement | Tier |
|------|------|--------|--------|-------------|------|
| Rusty Dagger | Dagger | 1 | 50% break chance on crit | None | 1 |
| Bone Club | Blunt | 2 | None | None | 1 |
| Wooden Bucket | Blunt/Helmet | 1 | As helmet: +2% phys resist, –10% accuracy | None | 1 |
| Broken Bottle | Slash | 2 | One use, **Bleeding** (1/turn, 2 turns) | None | 1 |
| Guard's Spear | Pierce | 4 | Thrown: 5 dmg | None | 1 |
| Rusty Axe | Slash | 5 | 10% break chance | None | 1 |
| Rusty Mace | Blunt | 5 | 10% **Stun** | None | 1 |
| Plunger | Blunt | 2 | 25% **Stun** | None | 1 |
| Wrench | Blunt | 3 | Tool for Plumber skills | None | 1 |
| The Drowned Majesty | Blunt | 8 | 15% **Slippery** on target, 5% chance to drop weapon | Level 3 | 3 |

### ARMOR

| Name | Type | Effect | Requirement | Tier |
|------|------|--------|-------------|------|
| Tattered Cloak | Body | +5% evasion, –2% charisma | None | 1 |
| Sturdy Boots | Feet | +3% physical resistance | None | 1 |
| Leather Vest | Body | +5% physical resistance | None | 1 |
| Chain Shirt | Body | +7% physical resistance, –5% evasion | None | 1 |
| Guard's Cap | Head | +5% evasion | None | 1 |
| Pipe Fitting Helmet | Head | +5% physical resistance | None | 1 |
| Ribcage Armor | Body | +3% physical resistance | None | 1 |
| Soap Crown | Head | +10% charisma, +5% goblin reputation, –5% dignity | Level 2 | 2 |

### CONSUMABLES

| Name | Effect | Requirement | Tier |
|------|--------|-------------|------|
| Health Potion | Heal 15 HP | None | 1 |
| Moldy Cheese | Heal 15 HP, 50% **Nauseated** | None | 1 |
| Glowing Mushroom | Heal 5 HP OR light source (1D, 30 ticks) | None | 1 |
| Poison Mushroom | **Poisoned** (2/turn, 3 turns) — can be weaponized | None | 1 |
| Sewer Water | 50% heal 5 HP, 50% **Nauseated** | None | 1 |
| Ghost Soup | Full heal + **Well Fed** (+5% all stats, 3 fights) | None | 2 |
| Dwarven Ale | +20% damage (1 turn), –20% accuracy | None | 2 |
| Holy Water | Remove all debuffs | None | 2 |
| Blessed Penny | +5% gold find (permanent) | None | 2 |

### QUEST / KEY ITEMS

| Name | Type | Effect | Requirement | Tier |
|------|------|--------|-------------|------|
| Hermit's Finger | Quest | Return to the Hermit | None | Quest |
| Hermit's Ring | Passive | +5% XP gain | None | 2 |
| Rusty Key | Key | Opens Room 2 chest, Room 10 door | None | Quest |
| Goblin Soap | Quest/Weapon | Opens Room 9 door. As weapon: 1 dmg, 100% **Slippery** | None | Quest |
| Soap Chunk | Crafting | Partial soap. Combine 3 for full bar. | None | 1 |
| Rat Whisker | Passive | +5% evasion | None | 1 |
| Bone Crown | Passive | +10% damage to beasts | None | 2 |
| Child's Tear | Consumable | Full heal | None | 2 |
| Tear Salve | Passive | +10% ice resistance | None | 1 |
| Wax Figurine | Consumable | Creates a decoy (lasts 2 turns) | None | 2 |
| Library Card | Passive | +10% XP gain | None | 2 |
| Auctioneer's Gavel | Passive | +5% gold from sales | None | 2 |
| Troll's Tear-Stained Pebble | Passive | +5% ice damage | None | 2 |
| Troll's Tooth | Passive | +5% physical damage | None | 2 |
| Dwarven Stein | Passive | +5% damage when below 50% HP | None | 2 |
| Architect's Compass | Passive | Reveals hidden doors | None | 3 |
| Miner's Helmet | Passive | +10% fire resistance | None | 2 |
| Kite String | Passive | +5% ranged damage | None | 1 |
| Glass Shard | Passive | +5% critical hit damage | None | 2 |
| Permit | Passive | +5% shop discounts | None | 2 |
| Jester's Bell | Consumable | Confuses all enemies (1 turn) | None | 2 |
| Tonsil Stone | Passive | +5% poison resistance | None | 1 |
| Stomach Acid Vial | Consumable | Corrosive damage (5 dmg, ignores armor) | None | 2 |
| War Drum | Consumable | Buffs all allies (+15% damage, 2 turns) | None | 2 |
| Goblin Map | Consumable | Reveals enemy positions (1 floor) | None | 1 |
| Love Letter | Flavor | No mechanical effect. But it's sad. | None | 1 |
| Note: "Gribnab's soap is his crown" | Lore | No mechanical effect. But it's important. | None | Quest |

---

## THE DROWNED MAJESTY (Gribnab's Club)

**Type:** Blunt Weapon (Two-Handed)
**Damage:** 8
**Requirement:** Level 3
**Tier:** 3 (Boss Drop)

**Effects:**
- **Sovereign Sudds:** 15% chance on hit to inflict **Slippery** on target (50% fall chance when moving, 2 turns)
- **Soap Crust:** The club is crusted with ancient soap. It never gets dirty. You do.
- **Slippery Grip:** 5% chance on attack to drop the weapon. It slides out of your hands. The narrator comments every time.
- **Bath Water Residue:** The club is always slightly wet. +5% damage to fire-type enemies (water beats fire). –5% damage to ice-type enemies (water freezes).

**Flavor Text:**
*"This club was the symbol of Gribnab's reign. It is made from the wood of a bathhouse that burned down three hundred years ago. It is crusted with the soap of a thousand baths. It smells like strawberries and tyranny. It is the most powerful weapon you have ever held. It is also very slippery."*

**Narrator on equip:** *"You picked up the Goblin King's club. It's wet. It's soapy. It's yours now. You are a naked man with a soapy club. This is your kingdom."*
**Narrator on dropping it:** *"You dropped the club. Again. This is the third time. The club is judging you. The club has seen better wielders. The club is not impressed."*

---

## THE SOAP CROWN

**Type:** Head Armor
**Requirement:** Level 2
**Tier:** 2 (Boss Drop)

**Effects:**
- **Goblin Respect:** +5% goblin reputation (goblins are neutral unless attacked)
- **Crown of Suds:** +10% charisma when dealing with goblins
- **Dignity Tax:** –5% dignity (no mechanical effect, but the narrator comments)
- **Soap Aroma:** You smell like strawberries. Enemies have a 5% chance to pause and sniff before attacking. (They lose 0.5 AP.)

**Flavor Text:**
*"A crown made entirely of soap bars. Each one is a different scent. Lavender. Eucalyptus. 'Mystery.' It is the crown of the Goblin King. It is ridiculous. It is also kind of majestic. Don't let Gribnab know I said that."*

---

## TRANSITIONS

### ARRIVAL
**How you get here:** You wake up. You don't remember how you got here. You don't remember ANYTHING. You are lying on cold stone. You are wearing underwear. There is a bonfire. There is a sack. There is a torch. There is a headache.
**Narrator:** *"You wake up. You are lying on cold stone. You are wearing underwear. This is not how you thought today would go, and you once thought you'd marry a chandelier."*

### DEPARTURE
**How you leave:** Defeat Gribnab. Take the Staircase Key. Unlock the staircase behind his throne. Climb.
**Narrator:** *"The staircase is cold. The staircase is stone. The staircase goes UP. You climb. You climb away from the bath. You climb away from the soap. You climb toward whatever comes next. You climb toward Floor 49. You climb toward the LIGHT."*

### CONNECTIONS
- **Floor 49:** The staircase leads up to the Fungal Grotto.
- **Floor 47:** The Cursed Gold side quest connects here (donate gold to ghost).
- **Floor 1:** The Hermit's story connects here (the Paragon).

---

## DESIGN NOTES

### DIFFICULTY TUNING
- **Floor 50 is the tutorial.** It should be beatable by a player who has never played a roguelite before.
- **Boss Rat** is the first real challenge. It teaches: positioning, summoning, status effects.
- **Gribnab** is the first "real" boss. It teaches: phases, environmental weapons, multi-target attacks.
- **Expected deaths:** 2-3 on first run. 0-1 on subsequent runs.

### TEACHING MOMENTS
- **Room 1:** Teaches movement, interaction, inventory.
- **Room 2:** Teaches NPC dialogue, quest acceptance.
- **Room 3:** Teaches basic combat (rats are weak).
- **Room 4:** Teaches swarm combat (many weak enemies).
- **Room 5:** Teaches boss mechanics (Boss Rat).
- **Room 6:** Teaches environmental weapons (wine press).
- **Room 7:** Teaches hazards (water, leeches).
- **Room 8:** Teaches exploration and puzzle-solving (soap).
- **Room 9:** Teaches social encounters (guard).
- **Room 13:** Teaches risk/reward (mushrooms).
- **Room 15:** Teaches persistence (Bone Rat reassembles).
- **Room 17:** Teaches trap awareness.
- **Room 25:** Teaches full boss mechanics (Gribnab).

### SECRETS
- **The Other Hermit:** Hidden behind mushroom circle. Major lore.
- **The Shortcut:** Room 19 to Room 1. Fast travel.
- **The Well Connection:** Room 20 to Room 7. Alternative path.
- **The Compass Rose:** Only works after visiting Room 9.
- **Pacification:** Boss Rat can be pacified with cheese. Gribnab can be befriended.

### NARRATOR TONE
- **Floor 50 is the funniest floor.** The narrator is at its most sarcastic, most judgmental, most HILARIOUS.
- **The narrator LOVES your failures.** The narrator LOVES when you die. The narrator LOVES when you make bad choices.
- **The narrator is QUIET when it matters.** When you find the Other Hermit. When you return the finger. When you befriend Gribnab. The narrator is quiet. Because some moments are too important for jokes.

---

## ITERATION ADDENDUM (writer stream)

### MAIN QUEST: THE LONGEST MORNING
**Spine:** wake → soap gate → Gribnab's door → Gribnab resolved → climb to the light.
**Five stage lines (narrator, second person, escalating absurdity):**
1. *start* — You wake on cold stone in your underwear. The world smells like soap and bad choices. Somewhere above you, the day is waiting. It can wait longer.
2. *gateOpen* — The goblin guard steps aside. The iron door groans open. The smell of strawberries and tyranny rolls over you like a wave. You are through.
3. *doorOpen* — The bath chamber door yields. Steam curls around your ankles. Somewhere in the pink water, a king is singing. He is always singing. He is terrible at it.
4. *gribnabDown* — The bath king is finished. The water is still. The rubber ducks drift in the silence like tiny, judgmental survivors. You did it. You beautiful, soapy idiot.
5. *departure* — The stairs go up. The stairs always go up. You climb away from the bath, away from the soap, toward whatever comes next. Your legs ache. Your dignity aches worse. But you climb.

### GRIBNAB PHASES AND BARKS
**Phase 1 (100-50% HP):** Club Smash, Soap Splash, Bubble Shield. Indignant host persona.
**Phase 2 (50-25% HP):** "The bath overflows" moment. Rubber Duck Distraction, Soap Splash every other turn. More aggressive.
**Phase 3 (25-0% HP):** Bath Time (heals in the tub). Sovereign Sudds (buffs goblins). Desperate.

**Mid-fight barks (all TTS-safe, indignant bath-king voice):**
- *hp75* — How DARE you track mud across my bath mat. That is a LIMITED EDITION bath mat.
- *hp50* — The bath overflows. The bath OVERFLOWS. Do you know how long it took to get the temperature just so.
- *hp25* — My bubbles. You are popping my BUBBLES. Each bubble had a NAME.
- *phase2* — Enough lukewarm hospitality. Now the water gets SERIOUS.
- *duckSummon* — To me, my ducks. TO ME. We have a situation and it is WEARING UNDERWEAR.
- *death* — I yield. I yield. The bath is yours. Just... just keep the cap. Please. It was a gift from the Suds himself. It is all I have. It is all I have EVER had.
- *bathTime* (×3) — "Bath time, little naked one. Hold still. This is going to be HUMILIATING." / "Into the water. The water heals. The water ALWAYS heals. The water is my MOTHER." / "You cannot fight a man in his bath. It is against the rules. I wrote the rules. They are VERY soapy rules."

**BARON GNAW (Boss Rat) narrator barks:**
- *summon* — The bath king calls, and Baron Gnaw ANSWERS. Mostly because he was promised snacks.
- *death* — Baron Gnaw collapses into a pile of wet fur and bad decisions. The bath is quieter now. The bath is ALWAYS quieter after the snacks arrive.

**Deepened Gribnab monologues (cutscene-timing safe, <= 420 chars each):** pre_fight_soap, pre_fight_door, final_taunt, and parley all expanded. Parley gained two flavor-only dialogue choices ("Tell me about the ducks." → new `ducks` node; "Why the bath?" → new `why_bath` node) using only `next`/`endConvo`. No new action types, no changed node ids, no changed existing actions.

### NEW ENEMY BEHAVIORS
- **Goblin Archer (r21/r24):** Ranged attacker. Stays back behind melee goblins. Shoots every other turn. Teaches the player to prioritize ranged threats and use cover.
- **Mold Spitter (r6):** Mold Blob variant. Ranged spore attack: 1 dmg + **Nauseated** (25% chance) for 2 turns. Forces the player to close distance or eat the nausea.
- **Tail Sweep (Gribnab, Phase 2):** Cone attack behind Gribnab. 4 dmg + **Prone**. Punishes players who flank him. Tells the player: the bath king has a tail, and it is NOT happy.

### THREE EASTER EGGS
1. **Duck Choir (r25 payoff):** If the player squeezed all four rubber ducks during the Gribnab fight AND collected every duck from the floor, the remaining ducks begin to sing after Gribnab falls. Narrator: "The rubber ducks begin to sing. It is not a song you know. It is not a song ANYONE knows. But the ducks are committed. The ducks are ALWAYS committed."
2. **Chandelier Callback (r24/r22/r25):** Each chamber has a chandelier (props already placed). Interacting in r24 triggers: "You look up at the chandelier. It glitters. It sways. You once thought you would marry a chandelier. Tonight, the chandelier looks back. It remembers." Ties directly to floor 1's "marry a chandelier" line (r1 narrator).
3. **Well Wish (r20):** Dropping the Blessed Penny (not the severed finger) into the old well triggers a wish. Success: "You toss a penny into the well. It flashes once, twice, and vanishes. Somewhere deep below, a wish is granted. It is probably not yours." Fail (no penny): "You have no penny to toss. The well stares back. The well has seen this before. The well is not impressed."

### TPK NARRATOR LINES (make death funny)
- *tpk_1* — Your party falls. All of you. In your underwear. At the bottom of a dungeon. The narrator would like you to know: this is the funniest thing that has ever happened.
- *tpk_2* — You are dead. The rats are already holding a meeting about who gets your socks. The meeting is surprisingly civil.
- *tpk_3* — Game over, Greg. The bath wins. The bath ALWAYS wins. But hey. You can try again. The dungeon has a sense of humor. It wants to see what you do next.

### SCRAG — BORED GUARD HUMANITY
New `bored` node (reached from `done`): "Bored. BORED. I have been standing in front of this door for six years. I have counted the stones in the wall. There are two hundred and fourteen. I have named twelve of them. That one is Colin. Colin is my best friend. Do not tell Colin I said that."
