# FLOOR 22 — THE COLLAPSING GALLERY

## FLOOR OVERVIEW

**Theme:** The Spire is starting to notice you. The floor collapses as you move.
**Mood:** Urgent. The floor is falling. The walls are falling. You are RUNNING.
**Ambient:** Cracking. Rumbling. The sound of STONE FALLING.
**Lighting:** Shifting. Dust. The floor is UNSTABLE.
**Soundtrack:** Cracking. Rumbling. The sound of COLLAPSE.

---

## FLOOR MAP

```
        ┌──────┐
        │  3   │
        │ART   │
        │GALLERY│
        └──┬───┘
           │
┌──────┐  ┌┴─────┐  ┌──────┐
│  1   │──│  2   │──│  4   │
│ENTRY │  │HALL  │  │EXIT  │
│      │  │      │  │ROOM  │
└──────┘  └──────┘  └──────┘
```

---

## ROOM BREAKDOWNS

### ROOM 1 — ENTRY
**Type:** Hub
**Contents:** Bonfire. A sign ("CAUTION: STRUCTURAL INSTABILITY"). A hard hat (wear: +3% physical resistance).
**Enemies:** None.
**Narrator on entry:** *"A gallery. A COLLAPSING gallery. The gallery is FALLING. The gallery is falling and the gallery is LOUD. The gallery is falling and the gallery is loud and the gallery is DANGEROUS. The gallery is falling and the gallery is loud and the gallery is dangerous and you have to RUN."*

---

### ROOM 2 — HALL
**Type:** Hazard + Combat
**Contents:**
- 2× Stone Golems (enemies — 12 HP each, 4 dmg, **Stone Shield**)
- Falling debris (random: 3 dmg)
- Cracks in the floor (fall: 4 dmg + **Prone**)
- A stone pillar (can be pushed: crush golems, 6 dmg)
**Enemies:** 2× Stone Golems.
**Narrator on entry:** *"The hall. The COLLAPSING hall. The hall is FALLING. The hall is falling and the hall is LOUD. The hall is falling and the hall is loud and the hall is DANGEROUS. The hall is falling and the hall is loud and the hall is dangerous and you have to RUN. The hall is falling and the hall is loud and the hall is dangerous and you have to run and you're SLOW. The hall is falling and the hall is loud and the hall is dangerous and you have to run and you're slow and you're in your UNDERWEAR. The hall is falling and the hall is loud and the hall is dangerous and you have to run and you're slow and you're in your underwear and you're PANICKING."*

---

### ROOM 3 — ART GALLERY
**Type:** Lore + Loot
**Contents:**
- Dwarven paintings (read: dwarven history)
- A painting of the Paragon (it's a CHILD)
- A painting of the Spire's creation (it's BEAUTIFUL and TERRIFYING)
- A chest (25 gold, **Dwarven Shield**)
**Enemies:** None.
**Narrator on entry:** *"Art. DWARVEN art. The art is BEAUTIFUL. The art is beautiful and the art is SAD. The art is beautiful and the art is sad and the art is the TRUTH. The art is beautiful and the art is sad and the art is the truth and the truth is the Paragon was a CHILD. The art is beautiful and the art is sad and the art is the truth and the truth is the Paragon was a child and the child TRIED. The art is beautiful and the art is sad and the art is the truth and the truth is the Paragon was a child and the child tried and the child FAILED. The art is beautiful and the art is sad and the art is the truth and the truth is the Paragon was a child and the child tried and the child failed and the child is STILL TRYING."*

---

### ROOM 4 — EXIT ROOM
**Type:** Exit + Rest
**Contents:**
- A safe room (the only stable room)
- A bonfire (lit — safe)
- A chest (20 gold, **Stability Boots**)
- The exit (staircase to Floor 21)
**Enemies:** None.
**Narrator on entry:** *"Safe. SAFE. The first safe you've felt in FLOORS. The first safe you've felt in floors and it's WELCOME. The first safe you've felt in floors and it's welcome and it's HEALING. The first safe you've felt in floors and it's welcome and it's healing and you want to STAY."

---

## ENCOUNTERS

### COLLAPSE (Room 2)
**Trigger:** Standing still too long.
**Description:** *"The floor FALLS. The floor falls UNDER YOU. The floor falls under you and you're FALLING. The floor falls under you and you're falling and the floor is GONE."*
**Effect:** 4 dmg + **Prone**. Moved 1D toward exit.
**Resolution:** Run or fall.

### DEBRIS FALL (Room 2)
**Trigger:** Random.
**Description:** *"Something FALLS. Something falls from the CEILING. Something falls from the ceiling and something is HEAVY. Something falls from the ceiling and something is heavy and something is a ROCK."*
**Effect:** 3 dmg.
**Resolution:** Dodge or take damage.

### STONE GOLEM AMBUSH (Room 2)
**Trigger:** Stepping on a crack.
**Description:** *"The stone MOVES. The stone moves and the stone is ALIVE. The stone moves and the stone is alive and the stone is ANGRY."*
**Enemies:** 2× Stone Golems.
**Resolution:** Fight or flee.

---

## QUESTS

### MAIN QUEST: THROUGH THE GALLERY
**Objective:** Navigate the collapsing gallery. Reach Floor 21.
**Steps:** Enter → Run → Survive → Exit.

### SIDE QUEST 1: THE SPRINT
**Giver:** None (discover in Room 2).
**Objective:** Run. Don't stop. Reach the exit.
**Reward:** **Sprint Wisdom** (+10% speed, permanent). 15 gold.

### SIDE QUEST 2: THE CAREFUL PATH
**Giver:** None (discover in Room 2).
**Objective:** Move slowly. Find hidden rooms.
**Reward:** **Patience Wisdom** (+10% Perception, permanent). 20 gold.

### SIDE QUEST 3: THE FALL
**Giver:** None (discover in Room 2).
**Objective:** Fall through the floor. You land on Floor 21 early.
**Reward:** Skip Floor 22's boss. 10 gold.

---

## BOSS: THE COLLAPSE (Room 2)

**HP:** 30
**Damage:** 5
**Armor:** 3
**Speed:** Slow

**Abilities:**
- **Debris Fall:** 5 dmg, 25% **Prone**.
- **Floor Collapse:** All in 2D radius: fall (4 dmg + **Prone**).
- **Stone Fist:** 5 dmg, 20% **Stun**.
- **Rumble:** All in 2D radius: **Frightened** 2 turns.

**Drops:**
- **Stability Boots** (Feet: +5% physical resistance, immune to **Prone**)
- **Stone Heart** (consumable: +15% physical resistance, 3 fights)
- 25 gold
- **Dwarven Shield** (Shield: +7% physical resistance)

**Narrator on death:** *"The Collapse falls. The Collapse falls and the gallery is STILL. The Collapse falls and the gallery is still and the floor is SOLID. The Collapse falls and the gallery is still and the floor is solid and you are... you are SAFE. You are safe and you are STANDING. You are safe and you are standing and you are on SOLID GROUND. You are safe and you are standing and you are on solid ground and you are WELCOME."*

---

## LOOT TABLE

| Name | Type | Damage | Effect | Tier |
|------|------|--------|--------|------|
| Stone Hammer | Blunt | 5 | 20% **Prone** | 2 |
| Dwarven Shield | Shield | — | +7% physical resist | 2 |
| Stability Boots | Feet | — | +5% phys resist, immune **Prone** | 2 |
| Stone Heart | Consumable | — | +15% phys resist | 2 |
| Hard Hat | Head | — | +3% physical resist | 1 |

---

## TRANSITIONS

### ARRIVAL
**Narrator:** *"You climb. You climb away from the bar. You climb toward something UNSTABLE. You climb toward something that SOUNDS like CRACKING."*

### DEPARTURE
**Narrator:** *"The exit room leads to a passage. You climb. You climb away from the collapse. You climb toward Floor 21."*

---

## DESIGN NOTES

- **Floor 22 is MEDIUM.** The Collapse is tough. The environment is the challenge.
- **Teaches:** Speed. Hazard navigation. Environmental awareness.
- **Secrets:** The Art Gallery in Room 3. The Safe Room in Room 4.
- **Narrator:** "The floor is FALLING, Greg. The floor is FALLING. The floor is falling and you're FALLING. The floor is falling and you're falling and you have to RUN. The floor is falling and you're falling and you have to run and you're SLOW. The floor is falling and you're falling and you have to run and you're slow and you're in your UNDERWEAR. The floor is falling and you're falling and you have to run and you're slow and you're in your underwear and you're PANICKING. The floor is falling and you're falling and you have to run and you're slow and you're in your underwear and you're panicking and you're RUNNING. The floor is falling and you're falling and you have to run and you're slow and you're in your underwear and you're panicking and you're running and you're GOING TO MAKE IT."
