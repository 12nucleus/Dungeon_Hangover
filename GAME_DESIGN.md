# Dungeon Hangover: 50 Floors of Regret

## Premise
A turn-based roguelite dungeon crawler, playable in **first-person** or **isometric** view (toggle anytime, same simulation underneath). You wake up at the bottom of a 50-floor dungeon in your underwear, nursing a splitting headache, holding a torch that's about to die. The only way out is up.

**Tone reference: Dungeon Crawler Carl.** Absurd litRPG humor, a snarky narrator who comments on your stupid decisions, ridiculous loot flavor text, slapstick violence (fighting a skeleton with a fish, tripping into your own bear trap), genuine stakes underneath the jokes. The comedy comes from the situation and the narrator's reaction to it — not from generic gags.

**Gameplay reference: Baldur's Gate 3.** Maximum interaction flexibility — environmental objects can be shoved, thrown, ignited, or used as weapons; skills can be applied outside combat to solve problems (persuade, intimidate, sneak, break things); positioning, verticality, and improvisation matter as much as raw stats.

## Player Progression — No Fixed Classes
There is no class select screen. Instead:
- Every level-up or major upgrade offers a **choice of skills/perks** pulled from multiple archetype pools (martial, arcane, trickery, survivalist, social) — the player builds their own hybrid over time.
- Equipment and consumables can **temporarily grant or reskin abilities** (an absurd item might teach you a skill as a side effect, on top of its stat bonuses).
- "Class" becomes an emergent label players describe after the fact ("I accidentally built a fire-throwing coward") rather than a locked-in choice at the start.
- This must stay consistent with the loot rules below: items with multiple effects (some good, some bad, some ridiculous) are one of the main levers for build variety, alongside level-up skill choices.

## Companions — Temporary, Quest-Bound
- Companions are recruited through specific quests or encounters, not from a permanent roster screen.
- Each companion has a reason to leave (their own arc resolves, they betray you, they get their own ending) — they are narrative-bound, not a permanent party slot.
- While in the party, companions can act in combat (AI-controlled or directable) and react to the world/dialogue in character-voiced barks, keeping with Pillar 3 (hand-authored dialogue, never generated at line-level).

## Visual Style
High-resolution voxel graphics — small, dense cubes (think highly detailed voxel art, not blocky Minecraft-scale), giving weight and physicality to destructible terrain, chunky loot, and slapstick physics (ragdolls, thrown objects, toppling braziers) while keeping a distinct, readable art identity.

## Core Pillars (binding for all phases — do not violate these for scope reasons)
1. **The headache that fades (Hangover debuff).** Starts severe, decays as you clear floors. Pure debuff, no upside — it's a timer on your competence, not a resource to manage.
2. **Light is life.** Torch burns down in real time; braziers can be lit or extinguished. Darkness cuts both ways — it hides monsters from you and hides you from monsters.
3. **Procedural chaos, authored soul.** Room layout, loot rolls, and enemy placement are generated. NPC dialogue, quests, and companion arcs are hand-written, never generated at line-level.
4. **Comedy from situation, not from jokes.** A half-naked hungover idiot fighting a skeleton with a fish is funny because of what's happening, and funnier because a narrator is judging you for it in real time.
5. **Every death is fair, never a waste.** Death returns you to the last bonfire. Gold, loot, and levels persist — only positional progress is lost.
6. **Flexibility over fixed builds.** No class walls, no "wrong" way to solve a room — skills, items, and environment combine freely (BG3-style), and the game should reward creative misuse of objects.

## Game Loop
```
Boot → Splash → Choose view (isometric / first-person, swappable anytime) → Enter Dungeon
  → Explore corridor (torch + dynamic lighting, fuel ticking down)
     — environmental interaction available at all times: shove, throw, ignite, break, climb
  → Bump enemy OR trigger encounter → Turn-based combat
       (Attack / Defend / Item / Skill / Environment / Wait — see Combat Spec below)
  → Enemy defeated → Loot drop (gold + item roll, narrator commentary on bad rolls)
  → Repeat until floor's boss trigger, or resolve a quest/companion encounter along the way
  → Scripted boss intro (voiced, non-skippable first time)
  → Boss fight
  → On boss death: staircase unlocks to next floor
  → On player death: respawn at last bonfire, keep gold/loot/levels, lose position
```

## Combat Spec
- Turn order: player (and any active companions) act, then all engaged enemies act, in a fixed initiative order shown on-screen.
- Actions per turn: **Attack** (weapon-dependent), **Defend** (halve incoming damage, no status resist), **Item**, **Skill** (from your leveled-up pool — offensive, utility, or social-adjacent tricks used mid-fight), **Environment** (shove an enemy into a brazier, drop a chandelier, kick over a barrel of oil), **Wait** (pass, slightly reduces incoming damage, recovers 1 Hangover tick early).
- Status effects modify turn resolution, not flavor text: Burning ticks damage at end of round; Cursed reduces loot roll quality on kill; Hallucinating randomizes your Attack's target.
- Environmental actions available in combat should mirror the ones available in exploration — same physics, same voxel objects, so nothing feels like a separate "combat-only" toolkit.

## Phased Scope

**Phase 1 — Vertical slice (build this first, make it good before expanding):**
- Floors 1–5, one dungeon theme.
- 8–10 enemy types, 1 handcrafted boss on floor 5.
- Hangover debuff, torch/brazier lighting, bonfire checkpoints.
- Both views (isometric + first-person) working from day one — this is a core identity feature, not a stretch goal.
- Classless leveling with a first pass at 3 skill pools (martial, arcane, trickery).
- One companion questline, fully arc'd (recruit → use in combat → resolve/depart), to prove the "temporary companion" pattern before scaling to more.
- 3 status effects (suggest Bleeding, Poisoned, Blessed).
- Loot: 3 of the eventual 10 tiers, multi-effect absurd naming system in place.
- One game mode (standard). Placeholder ambient audio, no narrator VO yet — text-based narrator barks are fine for the slice.

**Phase 2 — Content breadth (only after Phase 1 plays well):**
- Expand to 25 themes across acts, 100 enemies / 15 factions, all 50 bosses.
- Full skill pool roster (social/survivalist added), full companion roster with individual arcs.
- All 7 status effects, all 10 loot tiers.
- Hand-authored quests, vendors, encounters layered into the generated structure.
- Roguelite / story mode variants added to the menu.

**Phase 3 — Polish and voice:**
- Full narrator voice + TTS sub-voice acting (this is where "Dungeon Crawler Carl narrator" energy should really land).
- Procedural audio: drum loops, synthesized ambient drone layers reactive to floor depth/danger.
- Secret floors, hidden doors, drift mechanics.

## Loot Rules
- 10 tiers, scaling with dungeon depth.
- Items can carry multiple simultaneous effects — part beneficial, part detrimental, part ridiculous (e.g., +Strength / -Accuracy / Always Smells Like Fish), and can occasionally grant a temporary skill as a side effect.
- No item decay/durability loss.
- Naming and effect flavor must stay in-world absurd (Pillar 4), narrator-commented, not just randomly funny.

## Tone Note for Whoever/Whatever Builds This
Don't chase "original" and "funny" as instructions — they fall out of following the pillars correctly. The narrator should sound like it's genuinely reacting to your terrible choices in real time, the way Carl's system-voice does. If a joke could exist outside this dungeon (a pop culture reference, a generic pun), it's off-brand.