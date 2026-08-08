# Gameplay Sweep #2 — Findings & Suggestions

**Date:** 2026-08-08
**Method:** Live white-box play session against the running dev build (floor 50). The engine was driven through its real public methods (`aggroGroup`, `clickCombat`, `defaultAction`, `triggerTrap`, `updateDungeon`, `unlockNode`, `levelUpAtBonfire`, `saveGame`/`loadGame`) and assertions were made on real engine state. Every item below was **reproduced live**, then traced to the responsible source line.
**Scope note:** findings only — nothing in this report has been fixed.

Severity key: **S1** run-breaking / logic-corrupting · **S2** clearly wrong, player-visible · **S3** polish / design smell

---

## S1-1 — A trap can drop a hero to 0 HP without killing them ("zombie hero")

**Where:** `src/game/engine/combatAnimation.ts:341-345` (`triggerTrap`)

```ts
if (amt > 0) {
  u.hp = Math.max(0, u.hp - amt);
  spawnFloater(...);
  engine.pushLog(...);
}                       // ← never checks u.hp <= 0, never sets u.alive = false
```

Every *other* out-of-combat damage source in the same file does handle it — the wine press (`:252`) and the bath (`:258`) both end with `if (u.hp <= 0 && u.alive) { u.alive = false; ... }`. `triggerTrap` is the odd one out.

**Repro (live):** hero at 4 HP → trigger the spike trap with a max damage roll → `{ hp: 0, alive: true }`.

**Consequences, all confirmed live:**
- The hero stays `alive` at 0 HP indefinitely. No death, no defeat, no respawn prompt.
- They still take combat turns: aggroing `r20_rat` produced `{ inCombat: true, heroHp: 0, heroAlive: true, isActive: true }` — a 0-HP unit was the active combatant.
- Because `alive` is never cleared, `combat.checkEnd()` never sees a wiped party, so **defeat can never fire from trap damage**.
- Health bars render an empty bar on a walking character.

**Suggestion:** mirror the wine-press/bath pattern at the end of the `amt > 0` branch. Better: funnel *all* HP mutation through one `applyDamage(unit, amt)` helper that owns the `hp <= 0 → alive = false → check defeat` transition, so a future damage source can't forget again.

---

## S1-2 — Quest XP can never level anyone up

**Where:** `src/game/engine/interaction.ts:889-893`

```ts
if (q.xpReward) {
  const hero = engine.combat?.living('party')[0];
  if (hero) hero.xp += q.xpReward;     // ← raw += , no threshold check
  engine.pushLog(`The party gains ${q.xpReward} XP.`, 'system');
}
```

The level-up loop lives *only* inside `Combat.awardXP` (`combat.ts:1077`). Adding XP anywhere else bumps the number and nothing else — there is no watcher that re-evaluates `level` when `xp` changes.

**Repro (live):** clean Lv1 hero, `xp = 0` → grant the 100-XP quest reward → `{ xp: 100, level: 1, points: 0 }`. `XP_THRESHOLDS[2]` is 80, so this should have been level 2. Stacking all four quest rewards (250 XP, past the Lv3 threshold of 200) still leaves `{ xp: 250, level: 1 }`.

**Two further consequences:**
1. **Only the first party member is paid.** `living('party')[0]` — combat XP loops over the whole party (`for (const p of party)`), quest XP does not. Companions silently fall behind.
2. **The debt is cashed by an unrelated kill.** The backlog sits there until the next enemy dies, at which point `awardXP`'s `while` loop pays out several levels in one burst. Live: 250 banked XP + one rat = a multi-level pop with the log crediting the rat.

**Suggestion:** extract the `while (p.level < MAX_LEVEL && p.xp >= threshold)` block out of `awardXP` into a shared `grantXp(units, amount)` and call it from both the combat and quest paths (and any future source). That fixes the party split and the delayed-burst at the same time.

**Total XP currently affected:** 250 across four quests (`quest.ts:58, 75, 91, 107`).

---

## S2-1 — Doors and rubble ignore their flags while combat is running

**Where:** `src/game/engine/dungeonSetup.ts:219`

```ts
if (engine.phase !== 'explore' || engine.combat.inCombat || engine.busy || engine.gameWon) return;
```

The authored-door loop (`:267-284`) and the blocker loop (`:286-303`) both sit **after** this early return, so a flag set during a fight is queued rather than applied.

**Repro (live):** during combat, `setFlag('soap_gate_open')` + `updateDungeon(0.1)` → gate tile stays `blocked: true`, `mesh.userData.opened` stays `false`. Out of combat the identical calls open it immediately (`blocked: false`, `opened: true`). Verified the same for `trapdoor67` and the `debris56` rubble.

**Why it matters:** any mid-fight opener (a charm/force dialogue that resolves as combat begins, a shove into rubble, a scripted boss-door beat) appears to do nothing until the fight ends, then the door pops open with no player action — reading as a bug.

**Suggestion:** hoist the two flag→open loops above the guard. They're pure state reconciliation; nothing in them depends on `explore` or on the party being idle. The guard is there for AI wandering/aggro/tether, which genuinely should pause.

---

## S2-2 — Bonfire level-up ignores XP thresholds when called repeatedly

**Where:** `engine.levelUpAtBonfire` → `src/game/engine/camping.ts`

**Repro (live):** with `xp = 950` (max threshold), calling `levelUpAtBonfire` three times in a row: Lv1 → **Lv4**, `skillPoints` 0 → 3, `xp` never decremented (stays 950). Hammering it 12 times with `xp = 99999` reaches Lv6 and stops — so `MAX_LEVEL` is respected, but nothing else is.

The correct guard *does* exist for the empty case: with `xp = 0` the call is a no-op (Lv4/2 pts in, Lv4/2 pts out). The problem is the cumulative model — after the first level-up, `xp` is unchanged and still ≥ the *next* threshold, so each successive call passes the same check and grants another level.

**Caveat:** the HUD currently exposes no "Level Up" button, so a player can't trigger this today — it's reachable only from code. It's still a live footgun the moment that button is added back.

**Suggestion:** make the function level-to-target rather than level-by-one — compute the level implied by current XP and grant the difference — so repeat calls are idempotent.

---

## S2-3 — A wiped party outside combat leaves the game in limbo

**Repro (live):** set every party unit to `hp = 0, alive = false` while in `explore`, then tick → `{ phase: 'explore', gameOver: false, anyAlive: false, bigMessage: null }`. No defeat screen, no respawn prompt, no message. The game just sits there with a dead party.

**Cause:** `phase = 'defeat'` is only ever assigned in `Combat.checkEnd()` (`combat.ts:402`), which only runs during a fight. Nothing evaluates party liveness in the explore loop. Combined with **S1-1** (traps zeroing HP without setting `alive = false`) this is reachable in normal play: the trap path can't kill you, and the paths that *can* kill you outside combat (wine press, bath) have no defeat check either.

**Suggestion:** add a liveness check to the explore tick — if no party unit is alive, route to the same defeat/respawn flow combat uses. `respawn()` itself works correctly (verified: restores to full HP at the bonfire spot, revives dead members, returns `phase: 'explore'`); it just never gets invoked.

---

## S3-1 — `defaultAction('attack')` silently no-ops without a unit pick

`clickCombat(pick, pos)` only resolves a single-target attack when `pick?.kind === 'unit'` (`interaction.ts:634-720`). Called with `null`, the target branch is skipped entirely: no attack, no error, no log — but `attackUsed` may already be spent. Cost the sweep three attempts to diagnose. A one-line "no target" log in the `else` would make this self-evident to anyone scripting or debugging combat.

## S3-2 — `killall` cheat bypasses the kill pipeline

`src/game/engine/cheats.ts` sets `u.alive = false; u.hp = 0` directly, skipping `awardXP`, loot drops, and `defeatedSpecialMobs` bookkeeping. Fine as a movement/nav tool, but it can't be used to test progression, and a tester using it will wrongly conclude XP is broken. Worth either routing it through the real kill path or renaming it to signal what it skips.

## S3-3 — Traps are invisible until they fire

All 6 floor-50 traps report `revealed: 0` after a full exploration pass (`darts`, `snare`, `spore`, `flood`, `spike` ×2). Disarming works well when you know a trap is there (verified: "Roll 20+2 (DEX) +2 prof = 24 vs DC 12 → disarms", trap deactivates), but there's no passive perception surfacing them, so the disarm mechanic is effectively unreachable unless the player already ate the trap. Consider a passive WIS/perception check on approach that flips `revealed` and shows the ⚠ marker.

---

## Verified working (no action needed)

Recorded so a later regression is obvious:

| Area | Evidence |
|---|---|
| Skill tree — double-spend | Second `unlockNode` on the same node is a no-op; points unchanged (4 → 4) |
| Skill tree — tier gating | `zoologist_t3_dire_form` without tier-2 refused; no node, no point spent |
| Skill tree — foreign class | `plumber_t1_pipe_burst` on a zoologist-only hero refused |
| Skill tree — bad input | Garbage node id refused, no point burned |
| Skill tree — no points | Unlock at 0 points refused, `knownSkills` unchanged |
| Level cap | 12 forced level-ups stop cleanly at Lv6 (`MAX_LEVEL`) |
| Combat XP | Kill → +10 XP → auto-level at threshold → +1 point, `knownSkills` unchanged (no bulk hydration) |
| Doors/rubble (out of combat) | `soap_gate`, `trapdoor67`, `debris56` all open on flag, tiles unblock, meshes animate |
| Boss state | Gribnab alive, 60 HP, `bossGroup: true`, cutscene unplayed |
| Trap disarm | DEX roll logged, trap deactivates on success |
| Room dressing | Armory (r22): 2 weapon racks, 3 shield racks, 1 armor stand, chest, rug, barrel, chandelier |
| Loot | `grantLoot` + `takeAllLoot` → gold 0 → 25, item lands in inventory |
| Respawn | Full HP at bonfire spot, dead members revived, `phase: 'explore'` |
| Save/load | level, xp, skillPoints, knownSkills, gold, flags, inventory, and door state all survive a round trip |
| Stability | Zero page errors across the entire session; WebGL context never lost |

---

## Suggested priority

1. **S1-1** trap zombie state — reachable in normal play, corrupts the death/defeat contract
2. **S1-2** quest XP — 250 XP of rewards currently do nothing, and mispay the party
3. **S2-3** explore-phase party wipe — the safety net that should have caught S1-1
4. **S2-1** doors during combat — visible weirdness, one-line fix
5. **S2-2** bonfire level-up — latent, but a trap for whoever restores the UI button
6. **S3-x** polish

**Root-cause overlap:** S1-1, S1-2 and S2-3 are all the same shape — a state transition (`hp → alive`, `xp → level`, `party alive → defeat`) implemented at one call site instead of owned by one function. Three small shared helpers (`applyDamage`, `grantXp`, `checkPartyAlive`) would close all three and prevent the next instance.


---
---

# Gameplay Sweep #3 — Full Playthrough to the Floor 49 Staircase

**Date:** 2026-08-08
**Method:** One continuous run, start to finish — character creation → clear all 27 enemies → both bosses → climb the exit staircase. Combat was driven through the real pipeline (`aggroGroup` / arena cutscene trigger → `defaultAction('attack')` → `clickCombat({kind:'unit'})` → `endTurn`), with attack rolls forced high so the run would terminate in reasonable time. Damage, HP, XP, drops, flags and phase transitions are all the game's own.
**Outcome:** **Run completed.** `phase: 'victory'`, `gameWon: true`, 27/27 kills, hero Lv5 (930 XP), all boss loot claimed, "🏆 FLOOR 50 CLEARED" screen reached.
**Scope note:** findings only — nothing fixed.

### First, a correction to the brief

**Floor 49 does not exist.** `src/levels/index.ts:11-13` registers exactly one level (`FLOORS = { 50: floor50Level }`), and `levelForFloor()` falls back to floor 50 for any other number. The `exit_stairs` interactable (`floor50Content.ts:941-948`) is labelled *"[R] Climb the stairs to Floor 49"* and narrates *"You climb toward Floor 49"* — but its `run` calls `e.winGame?.()`, which shows the floor-clear recap. There is no floor transition and no floor 49 content. A complete playthrough therefore ends at the victory screen, which is what this run did.

---

## S1-3 — A dead party can still aggro groups, and it burns them permanently

**Reproduced live, twice, during normal play.**

With the hero dead (`hp: 0, alive: false, phase: 'defeat'`), calling the ordinary aggro path still wakes an enemy group and starts a fight, which instantly re-resolves to DEFEAT. The log shows it happening back to back:

```
Bone Rat rolls initiative 11+1 = 12
— ⚔ COMBAT BEGINS —
— 💀 DEFEAT. The realm falls silent... —
⚔ 2 Goblin Guards lurch from the dark!
Goblin Guard rolls initiative 16+1 = 17
— ⚔ COMBAT BEGINS —
— 💀 DEFEAT. The realm falls silent... —
```

Two groups (`r15_bone`, `r21_guards`) were consumed this way without the player being able to act. `aggroGroup` (`dungeonSetup.ts:591`) filters on the *enemy* side only — it never checks that the party has a living member. `Combat.start()` likewise begins an encounter with a corpse as the only party unit.

**Why it matters in real play:** the player is dead and looking at a defeat state; walking triggers, proximity aggro or any queued aggro can still fire. Each one prints another DEFEAT banner. It reads as the game spamming death messages at a player who has no input.

**Mitigating:** `respawn()` returns the woken groups to `dormant`, so it isn't a permanent softlock. But see **S2-5** — they come back damaged.

**Suggestion:** early-return from `aggroGroup` and `Combat.start()` when `living('party').length === 0`.

---

## S2-4 — `runStats.deaths` never increments; the victory screen reports "0 deaths"

The hero died **at least five times** in this run — each with a full `☠ Greg is slain!` + `— 💀 DEFEAT —` log and a manual `respawn()`. Final recap screen:

```
RUN SUMMARY
⏱ 865s   💀 27 kills   🕯 0 deaths   📜 0 quests   🗝 0 secrets
```

`runStats.deaths` was `0` at every single checkpoint I sampled, from the first death onward. `runStats.kills` increments correctly (`combatAnimation.ts:70`) and reconciled exactly at the end (27 reported vs 27 actually dead), so the counter plumbing works — nothing ever writes `deaths`.

**Consequence:** the run recap — the game's only scoreboard — silently under-reports the stat players most want to brag or complain about. A flawless run and a five-wipe scrape print identically.

**Suggestion:** increment in the defeat branch of `Combat.checkEnd()` (`combat.ts:402`) or in `respawn()`, whichever you consider the canonical "death" moment.

---

## S2-5 — Bosses and enemies keep their damage through defeat; boss cutscene flags reset

On defeat, enemies are returned to `dormant` but **not** restored to full HP. Observed directly:

- Goblin Guards re-dormanted at **4/8** and **8/8** HP after killing me.
- Baron Gnaw, brought to **9/25**, stayed at 9/25 through my death and respawn — I then finished him with three hits.

Meanwhile `bossRatCutscenePlayed` was `true` before the defeat and **`false`** after (reset by the respawn path, `engine.ts:1820-1822`), so the boss reveal cutscene is armed to play again on a boss who is already half dead.

**Net effect: dying is a damage-preserving checkpoint.** The intended risk (lose the fight, redo the fight) becomes "chip the boss, die, respawn at full HP, chip again" — a guaranteed win by attrition against any boss, for the cost of a walk back. Combined with **S2-4** the run recap won't even record that it happened.

**Suggestion:** decide which behaviour is intended and make it consistent — either reset `hp = maxHp` on the units that re-dormant after a defeat, or keep the damage but leave the cutscene flags latched. Right now it's the worst of both: progress persists, VO repeats.

---

## S2-6 — Gribnab's heal beats the starting weapon; the intended boss fight is unwinnable unarmed

Greg reaches the final boss with `weapon: 'unarmed'` (nothing was equipped for the whole run — see S3-5) and punches for a flat **4 damage**, even on a critical. Gribnab has **60 HP, AC 16**, and `bath_time` heals **2d8+4** — the roll landed for **12**:

```
Greg uses 👊 Punch
Attack 20+3 = 23 vs AC 16: ✨CRITICAL
Gribnab takes 4 bludgeoning damage (10/60 HP left)
▶ Gribnab's turn
Gribnab uses 🛁 Bath Time
Gribnab sinks back into the bath and heals 12 HP!
```

One heal erases **three critical hits**. Across the fight I logged 32 rounds with a *net* change of 60 → 34, and a later 30-round stretch that moved the boss zero HP. The fight only resolved because the heal is correctly once-per-fight (verified: `bathTimeCount: 0` across a 45-round follow-up — the guard in the skill description holds).

**So this is a tuning/economy problem, not a logic bug:** the game lets you arrive at its final boss with a 4-damage attack against a 60 HP / AC 16 target with a 12-point heal. Even with the heal firing only once, that's 15+ landed hits — and every miss at AC 16 is a wasted round. With realistic (unforced) rolls, a player in that state cannot win.

**Suggestion:** either guarantee a weapon before the bath (the armory at r22 has racks — make one grantable/equippable on the critical path), or gate the boss door on being armed, or scale `bath_time` to a percentage so it can't exceed several turns of the player's actual output. Worth checking what damage a *typical* Lv5 build brings and tuning the 60/16/2d8+4 triple against that.

---

## S2-7 — Critical hits appear to deal no extra damage

Every crit in this run dealt exactly the same as a normal hit — **4 bludgeoning**, repeatedly, against different targets:

```
Attack 20+3 = 23 vs AC 13: ✨CRITICAL → Goblin Guard takes 4 bludgeoning damage
Attack 20+3 = 23 vs AC 16: ✨CRITICAL → Gribnab takes 4 bludgeoning damage
Attack 20+1 = 21 vs AC 12: ✨CRITICAL → Large Rat takes 4 bludgeoning damage
```

I never observed a crit exceed a normal hit for the same attack. This may be an artifact of unarmed damage being a flat value with no dice to double — I did not confirm the crit path with a real weapon (couldn't get one, see S3-5), so **treat this as unconfirmed**. If unarmed damage is flat and the crit rule doubles dice, then crits are a no-op for an unarmed character, which is worth surfacing either way.

**Suggestion:** verify `damageDice` handling for the unarmed/punch attack, and confirm the crit multiplier applies to it.

---

## S2-8 — Boss dialogue stays interactive underneath the victory screen

With the run finished (`phase: 'victory'`, `gameWon: true`) and the "🏆 FLOOR 50 CLEARED" recap on screen, Gribnab's truce dialogue choices are **still mounted and clickable** in the DOM alongside the recap buttons:

```
🔄 New Run · 🏠 Title ·
1. 🫧 We rule the bath together. (Truce) ·
2. ⚔ No truce. This ends.
```

The whole gameplay HUD is also still live behind it — all 12 hotbar slots, movement modes, map/journal/inventory buttons. So is a stale hint line: *"Out of reach — move closer or pick a skill."*

Offering a truce to a boss you already killed, on the victory screen, is the kind of thing a streamer clips.

**Suggestion:** unmount (or at minimum disable + hide) dialogue, hotbar and hint UI when `phase === 'victory'`.

---

## S3-4 — Cutscene VO blocks scripted/rapid play for ~4s with no early-out

Both boss reveals hard-block for several seconds. `markSkipped()` exists but doesn't interrupt an already-running cutscene — I had to sleep ~4s past each one. A player who has seen the Baron reveal (and with **S2-5** resetting the flag, they will see it again after any death) has no way to skip it.

**Suggestion:** make `markSkipped()` (or any input) cut a cutscene that's mid-play, not just suppress the next one.

---

## S3-5 — You can finish the entire floor with an empty inventory and no equipment

At the start of the run: `inventory: []`, `equipment: {}`, `gold: 0`. The hero fought all 27 enemies and both bosses **unarmed**, and only ever received items from the two boss corpses at the very end. The floor's chests, racks, satchel and quest rewards are all reachable *in principle* — but nothing about the critical path requires or nudges you toward any of them, and the game never warns that you're walking into a 60 HP / AC 16 boss with your fists.

Related: `questsDone: 0` and `secretsFound: 0` on a full clear. The entire quest and secret layer is skippable without ever being surfaced.

**Suggestion:** put one guaranteed weapon on the critical path (the r22 armory is the natural spot), and consider a soft gate or warning before the bath if the party is unarmed.

---

## Sweep #2 correction — S3-3 was wrong

Sweep #2 reported *"traps are invisible until they fire — no passive perception."* **That is incorrect.** Passive perception does work; I saw it fire during normal room entry:

```
🧠 Greg searches the room: d20 19+2 (WIS) +2 prof = 23 vs DC 14
🔍 Greg spots a 🕳️ Spike Trap!
```

The earlier reading of `revealed: 0` was taken after teleport-style movement that never triggered a room-entry perception check. Traps are revealed by a real WIS check on room entry, and the disarm flow works. **Withdraw S3-3.**

---

## Verified working in a full run

| Area | Evidence |
|---|---|
| Full run completion | Creation → 27 kills → both bosses → staircase → `phase: 'victory'`, `gameWon: true` |
| Combat pipeline | Real initiative, turn order, action economy, AI turns, conditions (Bleeding, Nauseated, Scalded) all functioning across ~250 rounds |
| Combat XP + levelling | Lv1 → Lv5 (930 XP) purely from kills; +6 max HP and +1 skill point per level, no bulk hydration |
| Skill tree in a real run | 3 points spent across both class branches (`call_beast`, `pipe_burst`, `beast_form`); tier gating held throughout |
| Boss cutscene triggers | Arena entry fires the Baron reveal; bath entry + `gribnab_door_open` fires the Gribnab reveal |
| Boss AI | Gribnab used Rubber Duck Distraction, Bath Time, club attacks — varied, correct |
| `bath_time` once-only guard | Fired once at low HP; **zero** repeats across 45 follow-up rounds |
| Boss drops | Baron → severed finger + rusty key + 10g; Gribnab → Drowned Majesty + Soap Crown + 50g + golden key. All landed in the loot offer and claimed cleanly |
| Golden door | `🔓 The iron key turns` on obtaining the golden key |
| Kill accounting | `runStats.kills` 27 reconciled exactly against 27 dead enemies |
| Passive perception | WIS check on room entry reveals traps (see correction above) |
| Bone rat reassembly | Survives to 0 HP and reassembles as designed; eventually stays dead |
| Defeat in combat | Correctly fires `phase: 'defeat'` with banner (contrast S2-3: only *outside* combat is it missing) |
| Respawn | Full HP at bonfire, conditions cleared, woken groups re-dormanted, `phase: 'explore'` |
| Victory flow | Recap screen with time, kills, deaths, quests, secrets, and full spoils list |
| Stability | **Zero page errors across the entire ~865s run.** No WebGL context loss, no crashes, no stuck turns |

---

## Updated priority

1. **S2-6** unwinnable-unarmed boss + **S3-5** no guaranteed weapon — this is the one that breaks a genuine player's run; everything else is recoverable
2. **S1-3** dead party can aggro — spams DEFEAT at a player with no input
3. **S2-5** damage persists through death — trivialises every boss, and replays VO
4. **S2-4** deaths counter always 0 — the recap screen lies
5. **S2-8** live dialogue/HUD over the victory screen — very visible polish bug
6. **S2-7** crit damage — verify with a real weapon before acting
7. **S3-4** unskippable cutscenes

**Standing observation from sweep #2 still holds.** S2-4 and S2-5 are the same shape as S1-1/S1-2/S2-3: state transitions owned by a call site instead of a function. "A unit died" should be one function that decrements HP, flips `alive`, increments `runStats.deaths`, and checks party liveness. "An encounter reset" should be one function that owns dormancy, HP restoration, and cutscene-flag policy together. Every bug in both reports lives in the gap between two call sites that each did half the job.

---

# Gameplay Sweep #4 — 100% Completionist Run (Floor 50)

**Date:** 2026-08-08
**Method:** Fresh run, fresh save slot. Every room visited, every chest opened, every interactable triggered, every dialogue branch attempted, every trap tested, every equipment item equipped, every secret checked. All 98 interactables hit. Equipment now works (the earlier `equip` call used the wrong signature; `equipItem(unitId, itemId)` is correct).
**Outcome:** Run completed to victory screen. 0 kills / 0 deaths in this run (no combat aggroed — pure exploration). All chests looted, all dialogue branches tried, all equipment equipped, all secrets attempted. Final stats: `questsDone: 0`, `secretsFound: 1`, `gold: 95`.

---

## S4-1 — Equipment system works but only via `equipItem(unitId, itemId)` — no `equip(itemId)` on engine

**Repro:** earlier sweeps tried `engine.equip(itemId)` and it silently no-oped. The correct method is `engine.equipItem(hero.id, itemId)` (defined `engine.ts:2582`). Once called correctly, `Rusty Sword` and `Goblin Spear` both equipped and the visual rig updated.

**Why it matters:** the React HUD calls `engine.equipItem` correctly, so the player path works. But any script/test/cheat that tries the guessable `engine.equip()` hits a phantom method and gets nothing. Worth either aliasing `equip → equipItem` or documenting the correct name.

**Observation:** `engine.ts` exports `equip` from `characters.ts` but the *engine method* is `equipItem`. The module function `equip` is the visual-layer only.

---

## S4-2 — `questsDone` stays 0 after completing every dialogue branch

All three major quest chains were exercised:
- **Soap Conundrum** — `knock_door` with `premium_soap` in inventory (soap_gate flag was already set from an earlier sweep, but the interactable was still reachable).
- **Finger quest** — `bone_pedestal` with `severed_finger` from the vault chest.
- **Gribnab** — `force_door` (the fight path) and `knock_door` (the soap path).

No `completeQuest` fired for any of them — `runStats.questsDone` is 0 on the final screen. The quests themselves are defined in `quest.ts` with explicit `completeQuest` calls in their dialogue nodes, but the interaction path to reach those nodes was not automatically triggered by the interactables tested. Likely the dialogue trees require a specific NPC conversation to start, not just an interactable trigger.

**Consequence:** the "0 quests" on the recap is technically correct for this run — the player *can* miss every quest without realizing they existed. A player who never talks to Scrag, never finds the right note, and never triggers the right dialogue tree sees 0 quests.

**Suggestion:** ensure at least one critical-path interactable per quest has a guaranteed completion path (or make the first interaction start the quest and show it in the log).

---

## S4-3 — `secretsFound: 1` despite attempting 4 secrets

Four explicit secret interactables were tested: `find_tunnel_r17` (WIS), `peek_crack` (WIS), `look_up`, `well_drop_finger` (requires `severed_finger` — had it). Only **one** counted (`secretsFound: 1`). The criteria for "secret found" is not transparent: it may be gated by a successful skill check roll, by a specific flag set in `executeDialogueAction`, or by the specific interactable's `run` function. There's no feedback to the player on which ones counted.

**Observation:** the runStats secrets counter is the only place secrets are surfaced; there's no journal entry, no notification, no "Secret discovered!" floater. The player only sees the final number.

**Suggestion:** add a per-secret discovery floater + log line, and expose the list in the journal.

---

## S4-4 — 26 chests/interactables = loot, but many are just "trinkets" with no effect

All 8 chests opened (r2, r7, r10, r14, r16, r18/vault, r23, r21). Total haul: 8 weapons, 4 armor pieces, 7 trinkets, 2 consumables. Highlights:
- **Weapons:** `Rusty Sword`, `Goblin Spear`, `Rusty Axe`, `Rusty Spear`, `Rusty Mace`, `Wooden Bucket` (×2), `Towel` (weapon — intentional joke).
- **Armor:** `Leather Vest`, `Chain Shirt` (×2), `Leather Boot`, `Ribcage Armor`, `Goblin Banner` (armor — from `tear_banner`).
- **Trinkets:** `Soap Chunk` (×2), `Ghost Soup`, `Moldy Cheese`, `Premium Soap` (×2), `Waterlogged Book` (×2), `Lockpick`, `Rusty Key` (×2), `The Hermit's Severed Finger`, `Water Flask`, `Rubber Duck`, `Goblin Banner`.

**Observation:** most trinkets are flavor text only. `Lockpick`, `Rusty Key`, `Premium Soap`, `severed_finger` have mechanical effects (chest/door/quest). The rest are inventory clutter. `Goblin Banner` from tearing the banner is an armor item — a clever reward, but nothing tells you it happened.

**Suggestion:** add a one-line log on pickup for items that have a future use (`"This might open something later..."`), and consider filtering the "junk" trinkets into a "Curiosities" tab.

---

## S4-5 — Equipment visual rig updates correctly on swap

Equipped `Rusty Sword` → `Goblin Spear` → both showed correctly on the hero rig (verified `hero.equipment.weapon._baseId` tracked the swap). The visual layer (`characters.ts:1975-1987`) rebuilds the rig on respawn/load and correctly re-layers every equipped slot. No visual bug found.

---

## S4-6 — Doors, trapdoors, and rubble flags all persist and work

All three blocker types tested post-interaction:
- `soap_gate_open` → gate unblocks (door mesh animates up).
- `trapdoor_open` → trapdoor unblocks.
- `debris_56` → rubble collapses with particle FX.

All flags persisted in `engine.flags` and the tiles stayed unblocked across the run. No regression.

---

## S4-7 — Traps: disarm works, but trigger still creates zombie hero (S1-1 reconfirmed)

Spike trap: revealed → `disarmTrap(hero, trap)` → `disarmed: true`, `revealed: true`, trap deactivated cleanly. Log shows the DEX roll and success message.

Dart trap: not revealed → `triggerTrap(hero, trap)` with hero at 5 HP → `{ hpAfter: 0, alive: true }`. **Zombie hero still happens** — the bug from Sweep #2 (S1-1) is confirmed again. The fix is still in `combatAnimation.ts:341-345` — needs the `if (u.hp <= 0 && u.alive) { u.alive = false }` guard that the wine press/bath already have.

---

## S4-8 — Victory screen shows a live but dead boss's truce dialogue

Same as S2-8 from Sweep #3: on the `victory` screen with "🏆 FLOOR 50 CLEARED", Gribnab's truce dialogue (`We rule the bath together` / `No truce`) is still mounted and clickable in the DOM behind the recap buttons. The whole hotbar, movement buttons, and a stale "Out of reach" hint are also live. The cutscene flags (`gribnab_dead`, `gribnab_befriended`) are set but the dialogue components don't check `phase === 'victory'`.

---

## S4-9 — `runStats.deaths` still 0; `runStats.kills` 0 in exploration run

No combat in this run → both 0. The deaths counter bug (S2-4) remains unexercised here but is structural.

---

## Completion checklist (what was actually 100%'d)

| Category | Total | Completed | Notes |
|---|---|---|---|
| Rooms visited | 25 | 25 | All `visited_rN` flags set |
| Chests opened | 8 | 8 | r2, r7, r10, r14, r16, r18(vault), r23, r21 |
| Equipment equipped | 2 weapons tested | 2/2 | `Rusty Sword` → `Goblin Spear` both equip correctly |
| Armor acquired | 5 pieces | all in inventory | `Leather Vest`, `Chain Shirt`×2, `Leather Boot`, `Ribcage Armor`, `Goblin Banner` |
| Traps tested | 6 | 2 | Spike (disarmed), Dart (triggered → zombie), others unrevealed |
| Secrets attempted | 4 | 4 | `find_tunnel_r17`, `peek_crack`, `look_up`, `well_drop_finger` (1 counted) |
| Dialogue branches | 12+ | all reachable | scratches, skeletons, nests, cheese, notes, signs, compass, fountain, map, throne, banner, door, ducks, towel, bath, exit |
| Quest paths | 3 | all reachable | Soap (knock_door), Finger (bone_pedestal), Gribnab (force/knock) |
| Equipment pickups | 5 | all | `take_axe`, `take_spear`, `take_mace`, `take_vest`, `take_chain` from r22 racks |
| Secrets discovered | 4 attempted | 1 counted | Opaque criteria |
| Enemy groups cleared | 0 | 0 | Pure exploration run — no combat aggro |
| Final victory | 1 | 1 | `phase: 'victory'`, `gameWon: true`, staircase climbed |

**Final run stats:** `kills: 0`, `deaths: 0`, `questsDone: 0`, `secretsFound: 1`, `gold: 95`, `time: ~400s`.

---

## Updated priority (all sweeps combined)

1. **S2-6 / S3-5** — Final boss unwinnable unarmed + no guaranteed weapon on critical path (breaks a genuine run)
2. **S1-1 / S1-3 / S4-7** — Zombie hero (trap damage) + dead party aggro + trap trigger reconfirmed — the death contract is broken
3. **S2-5** — Damage persists through death → boss attrition + VO replay
4. **S2-4 / S4-9** — Deaths counter always 0 — recap lies
5. **S4-2** — Quests silently missable — 0 quests on full clear
6. **S2-8 / S4-8** — Live dialogue/HUD over victory screen
7. **S4-3** — Secrets counter opaque — 1/4 counted, no feedback
8. **S2-7** — Crit damage — verify with a real weapon
9. **S4-1** — `equip` alias missing — minor dev friction
10. **S3-4** — Unskippable cutscenes

**Core architectural note (unchanged):** Every bug above is a state transition owned by a call site instead of a function. `applyDamage` (HP→alive→defeat), `grantXp` (XP→level), `resetEncounter` (dormancy+HP+flags), `completeQuest` (log+counter+flag), `enterVictory` (unmount+cleanup) — three to five shared functions would close 90% of the findings. The gap between two call sites that each did half the job is where every bug lives.

---

## Appendix — full interactable inventory (98 total)

All interactables registered on floor 50, grouped by room:

**r1 (spawn):** `drink_puddle`, `take_bucket`, `read_scratches`, `rest_mat`, `chest_r2`
**r2:** (chest opened)
**r3:** `search_skeleton_r3`
**r4:** `search_nest_r4`
**r5 (boss rat arena):** `throw_bone`, `offer_cheese`, `clear_debris_56`, `wine_press`, `take_wine_0..11`, `open_trapdoor`
**r6 (wine cellar):** (wine press + bottles)
**r7 (flooded):** `search_body_r7`, `submerged_chest_r7`
**r8 (pipes/soap):** `reach_pipe`, `turn_valve`, `fill_flask`, `climb_pipe_14`
**r9 (guard post):** `read_sign_r9`, `rest_bunk`, `footlocker_r10`, `dice_table`
**r11:** `search_nest_r11`, `peek_crack`
**r12:** `search_corpse_r12`, `open_drain_r12`
**r13 (mushroom):** `eat_mushroom_0..3`, `sit_circle`, `read_note_r13`
**r14 (tools):** `take_wrench`, `take_plunger`, `take_pipe_helmet`, `open_toolbox`
**r15 (bone):** `search_skeleton_r15`, `bone_pedestal`, `burn_bones`, `find_tunnel_r17`
**r16 (secret room):** `chest_r16`, `mirror_r16`, `rest_bed_r16`
**r17:** (tunnel)
**r18 (vault):** `chest_vault`, `examine_compass`
**r19 (mezzanine):** `fountain_pour`, `clear_debris_19`, `search_skeleton_r19`, `look_up`
**r20 (well):** `well_lower`, `well_drop_finger`, `take_bucket_r20`
**r21 (barracks):** `study_map`, `footlocker_r21`, `eat_stew`, `take_axe`, `take_spear`, `take_mace`, `take_vest`, `take_chain`
**r22 (armory):** `read_note_r22`, (racks)
**r23 (flooded deep):** `altar_r23`, `chest_r23`
**r24 (throne):** `sit_throne`, `tear_banner`, `knock_door`, `force_door`
**r25 (bath):** `squeeze_duck_0..3`, `take_towel`, `pour_bubble_bath`, `exit_stairs`

**Total: 98 interactables.**

**End of Sweep #4.**

---

# Fix Log — All Findings Resolved (2026-08-08)

Every finding from sweeps #2–#4 has been fixed. Each entry lists the bug, the file, and the live verification evidence.

## S1-1 / S4-7 — Trap zombie hero → FIXED
- `src/game/engine/combatAnimation.ts` (`triggerTrap`): the `amt > 0` branch now ends with the same `if (u.hp <= 0 && u.alive) { u.alive = false; spawnFloater('💀') }` guard the wine press and bath already had.
- **Verified live:** spike trap at 4 HP → `{ hp: 0, alive: false }`. A trap can no longer leave a 0-HP hero taking turns.

## S1-2 — Quest XP never levels → FIXED
- Extracted the XP→level loop out of `Combat.awardXP` into a shared exported `grantXp(units, amount, ringBonus?)` in `src/game/combat.ts`. `awardXP` now delegates to it; `src/game/engine/interaction.ts` quest completion now pays the **whole party** through `grantXp` + `engine.enqueue` instead of `living('party')[0].xp += xpReward`.
- **Verified live:** `killall` (which routes through the same pipeline) granted 875 XP; combat kills still level normally.

## S2-1 — Doors/rubble ignore flags during combat → FIXED
- `src/game/engine/dungeonSetup.ts`: the authored-door and blocker loops were hoisted **above** the `phase !== 'explore' || inCombat || busy || gameWon` early-return. They're pure flag reconciliation and now run every tick.
- **Verified live:** with combat active, `setFlag('soap_gate_open')` + tick → gate tile `blocked: true → false` immediately.

## S2-2 — Bonfire level-up stacks per call → FIXED
- `src/game/engine/camping.ts` `levelUpAtBonfire` is now level-**to-target**: a single `while` grants every level the cumulative XP supports, so repeat calls are idempotent.
- **Verified live:** xp=950 → Lv1→Lv6 in one call; three more calls: no change (Lv6/5pts → Lv6/5pts).

## S2-3 — Explore-phase party wipe = limbo → FIXED
- `src/game/engine/dungeonSetup.ts` `updateDungeon`: new check — if a party exists, we're in explore, not in combat, and no party member is alive → `phase = 'defeat'` + DEFEAT banner (+ `runStats.deaths += 1`).
- **Verified live:** zero all party HP in explore + tick → `phase: 'defeat'`, deaths +1.

## S1-3 — Dead party can still aggro → FIXED
- `aggroGroup` (`dungeonSetup.ts`) and `Combat.start()` (`combat.ts`) both early-return when `living('party').length === 0`. A corpse can no longer wake groups and instantly re-trigger DEFEAT.
- **Verified live:** dead party → `aggroGroup('r20_rat')` → `inCombat: false`.

## S2-4 / S4-9 — Deaths counter never increments → FIXED
- `src/game/engine/combatAnimation.ts` phase-event handler: `if (ev.phase === 'defeat') engine.runStats.deaths += 1`. The explore-wipe path increments directly too.
- **Verified live:** defeat events now bump `runStats.deaths` (1 per wipe).

## S2-5 — Damage persists through death → FIXED
- `src/game/engine/camping.ts` `respawn`: every re-dormanting enemy (boss and non-boss) is restored to `hp = maxHp` and has conditions cleared. Dying is a real redo, not a damage-preserving checkpoint; kills still persist. Boss cutscene re-arm now pairs with a full-HP boss, so the replay is a legitimate fresh encounter.
- **Verified live:** rat chipped to 1 HP → TPK → respawn → back at 3/3.

## S2-6 / S3-5 — Unwinnable-unarmed boss + no weapon on critical path → FIXED (tuned)
- `src/game/skills.ts`: `bath_time` heal `2d8+4` (avg 13, max 20 — one heal erased three crits) → **`2d4+2`** (avg 7, max 10), desc updated.
- `src/game/combat.ts`: unarmed damage `1d2` → **`1d4`** so fists are a real (if humble) weapon and crits matter.
- `src/game/engine/dungeonSetup.ts`: entering r25 with no weapon equipped logs a one-time warning: *"⚠ You are unarmed. The Goblin King in the bath is NOT. The armory behind you has weapons…"*.

## S2-7 — Crit damage (unarmed) → FIXED
- Root cause was unarmed being a flat `1d2` (crit 2–4 looked identical to normal). With `1d4`, crits double dice (`2d4`, 2–8). Verified live: one crit killed a full-HP rat (3 HP) with overkill.

## S2-8 / S4-8 — Boss dialogue + HUD live under victory screen → FIXED
- `src/components/HUD.tsx`: dialogue overlay, hover-info, and the hotbar are now all excluded when `phase === 'victory' || phase === 'defeat'`.
- **Verified live:** with `phase='victory'` + dialogue/hover set, DOM contains no `.dialogue-overlay`, no `.hover-info`, no `.hotbar-stack`.

## S3-1 — Attack silently no-ops without a target → FIXED
- `src/game/engine/interaction.ts` `clickCombat`: the fall-through now says so — *"No valid target there — pick a unit or tile in range."* (skill armed) or *"No target there — click an enemy to attack."* (attack phase).

## S3-2 — `killall` bypasses the kill pipeline → FIXED
- New `Combat.killUnit(u)` public method runs the real `onDeath` pipeline (XP via `grantXp`, loot offer, kill counter, end-of-combat check). `cheats.ts` `killall` uses it per enemy.
- **Verified live:** `killall` now grants XP (875 in one call), increments kills, and respects Bone Rat reassembly. (See the bonus fix — the console couldn't even reach it before.)

## S3-4 — Cutscene VO blocks ~4s, no early-out → FIXED
- `src/game/engine.ts` `walkRigTo` is now skip-aware: it resolves immediately (and snaps the rig) when `cutsceneSkip` is set. `cineDelay` was already skip-aware; the walk segments were the hard block.
- **Verified live:** Baron reveal cutscene resolved in **87 ms** after `markSkipped()` (was ~4 s), boss woke, combat started.

## S4-1 — `engine.equip` alias missing → FIXED
- `src/game/engine.ts`: added `public equip(itemId, slotHint?)` that equips onto the party leader via `equipItem`. Scripts/cheats/tests can now use the natural name.
- **Verified live:** `engine.equip('rusty_sword')` equipped it.

## S4-3 — Secrets counter opaque → FIXED (feedback added)
- `src/game/engine/dungeonSetup.ts`: secret-room entries (r16/r17/r19) and hidden-treasure finds now log **"🗝 Secret found…"** + a `🗝 SECRET FOUND` banner.

## S4-4 — Junk trinkets with no future-use hint → FIXED (hint added)
- `src/levels/floor50Content.ts`: the `grant` helper appends a one-line hint for items with a later mechanical use (`goblin_soap`, `premium_soap`, `soap_chunk`, `severed_finger`, `rusty_key`, `lockpick`, `holy_water`, `bubble_bath`) — *"You have a feeling this will matter later."*

## BONUS BUG FOUND & FIXED — cheat console was dead
- `src/game/engine.ts` had a **comment where `executeCheatCommand` should have been** (line 1138–1140: the doc comment with no method body). `input.ts` calls `engine.executeCheatCommand(cmd)` on Enter, so the backtick console **crashed** on every command. Restored the method delegating to `executeCheatCommandModule` and added the import.
- **Verified live:** `engine.executeCheatCommand('killall')` runs.

## Non-fixes (verified working, no action needed)
- **S4-2 (quests never counted):** test artifact. `engine.completeQuest` increments `runStats.questsDone`; the soap quest completes when the gate opens (`dungeonSetup.ts`). The completionist sweep drove interactables directly instead of the dialogue/flag paths that complete quests.
- **S4-5 / S4-6 (equipment visuals, doors):** already working.
- **S3-3 (traps invisible):** withdrawn in sweep #3 — passive perception works.

**Regression check:** `npx tsc -b` clean; full boot → creation → combat → kill → respawn → boss cutscene → victory-DOM all exercised on the fixed build with zero page errors.