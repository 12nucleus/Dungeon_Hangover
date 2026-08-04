# Skills Audit — Balance Baseline

Computed via `node` over SkillDef population (skills.ts + classSkills.ts) for the audit.

## Population
- 705 total SkillDefs examined (40 `skills.ts` + 665 `classSkills.ts`).
- 465 active (240 passives excluded).
- After fixes from the audit: 465/465 cast cleanly with 0 crashes, 0 drawing-board, 0 harness-only "no-target"/"out-of-range", 0 harness noise (only correct-behavior "No corpses to raise" emitted by raise-dead skills on no corpses — accepted).

## Cost / cooldown / dice distributions
- `apCost`: peaks at 1 (75) → 2 (42) → 3 (22) → 4 (12) → 5 (28 ultimates).
- `cooldown`: peaks at 3 (123) → 4 (114) → 5 (64), with cd 7 reserved for capstone ultimate (`capstone_no_closing_time`).
- `kind`: melee 77, aoe 117, ranged 160, buff 101, heal 23.
- Common attack-scale (tier-1 / always-available active): `attack` 1d4, `slash` 2d6+3, `cleave` 1d10+3, `bite` 1d4+1, `bone_strike` 1d8+2. Range roughly 1d4–2d6+mod for a single-action single-target act.
- Reliable ranged tier-1 spell `magic_missile` 3d4+3 cd 0 — auto-cast. Bound indirectly by its `apCost` and limited tier-list availability.
- Ultimate-tier skills gated by cd5-7 + apCost 5.

## Fixes-done are inheritance-balanced
All 51 newly-wired skills use **existing** conditions already validated by the pre-fix combat math:
- `enraged` (+4 dmg) — used by Rage family. **DRIFT**: original spec said "+50% dmg"; current implementation rounds to flat +4 dmg. Slight underpower, mechanically functional.
- `fortified` (+3 AC) — used by Shield-fortify family. **DRIFT**: a few specs describe "+5 AC" (coverage_2, plumbers_rage); now mapped to `armored` (+5 AC now honored in effAC), matching desc.
- `inspired` (+2 atk/dmg), `shielded` (+2 AC), `stoneskin` (+4 AC), `lich_form` (immune physical/+2 dmg), `evading` (untargetable), `write_off` (50% DR), `clean()` utility.

The 51 newly-wired skills DO NOT introduce new damage modifiers beyond what `combat.ts:768-772`damage-modifier block already handles (intimidated -4, enraged +4, lich_form +2, inspired +2). Thus no new over/under-powered skill effect relative to existing tuned baseline.

## Known balance drift (resolved 2026-08-04)
1. **Rage family — RESOLVED**: the `+50%-dmg` self-rage skills (`cooking_rage`, `spirit_rage`, `beast_rage`, `plumbers_rage`, `beast_fury`) now apply the **`crash_out`** condition (`+50% damage dealt`, multiplicative) via the new condition wired into the damage-dealt block at combat.ts ~807 (`amount = Math.round(amount * 1.5)`). Previously they used flat `enraged` (+4). `cooking/spirit/beast_rage` route via the appliesCondition branch (`cond:'crash_out', appliesRounds:3`); `plumbers_rage`/`beast_fury` via switch cases. Party-wide `+30%` buffs (`the_toast_2`, `editorial_2`, `power_ballad_2`) and `coordinated_charge` keep flat `enraged`/`inspired` (multiplicative on all-allies would be too strong).
2. **Capital gains (`capital_gains`)** — implemented as +enraged (flat approximation); spec implied "+2 dmg per 50 gold held" — relies on `unit.gold` which is currently not tracked for party units. Mark as known-limited.
3. **Crowd_surf and the_herd use `applyDamage` directly** with hardcoded `rollDice('3d6').total` / `rollDice('4d6').total` (per the scout's plan). These bypass the standard attack roll (no roll-d20 to-hit, no miss chance) — balanced as guaranteed fixed AoE under their cd-4/cd-5 gating. In line with similar existing `frost_nova`/`whirlwind` (attack-style which use roll/range).
4. **`the_vows` indefinitely shield (99 rounds)** — effectively permanent party Shielded for a single cd5 cast. Possible snowball. Balanced by limited encounter length; flag for review.
5. **Cost audit (2026-08-04)**: 4 newly-wired skills lacked explicit `apCost`/`cost` (shim defaulted to action cost): `amortize` (apCost:1 action), `solder` (now `cost:'bonus'` — matches second_wind precedent), `souffle` (apCost:1 action), `midnight_snack` (apCost:1 action). All 38 path-B skills now carry an explicit cost.
