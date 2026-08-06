# Unified Rig System — Architecture Plan

## Problem

There are two rigging systems that produce different 3D hierarchies for the same
character, causing the pose‑editor preview to differ from the in‑game render for
poses that tilt the torso (e.g. `sleep` / `'snoozer'`).

| System | Where | Hierarchy | Rotation convention |
|--------|-------|-----------|-------------------|
| **Flat** | `characters.ts` — all `buildCharacter`/creature/builders; `updateRig`; death ragdoll; cutscene/weapon readback | All parts are siblings of `group`. Each rotates about the rig's hip (Y≈0). | `p.torso.rotation.x = torsoX` (absolute) |
| **Hierarchical** | `poseEditor.ts` `wrapPoseablePartJoints` + `applyPose` | Torso pivot at hip; head/hair/arms parented under torso; legs stay as group children. Limbs already have elbow/knee nesting via `buildLimb`. | `p.head.rotation.x = headX - torsoX` (local to torso) |

The pose editor emits flat‑format snippets (`torsoX`, `headX`, `armLX`, …) that
assume the editor's hierarchical skeleton.  `updateRig` pastes those same values
into a flat skeleton — so when `torsoX = -1.442` (`sleep` pose), the torso
reclines but the head, arms and hands stay vertical because they aren't parented
under it.

## Strategy

**Make the rigid parts of every human‑type rig hierarchical at build time, then
drive them with the same flat‑format joint values in all contexts.**  The flat
values (`torsoX`, `headX`, `armLX`, etc.) stay as the canonical representation.
The only things that change are **(a)** how the 3D hierarchy is assembled, and
**(b)** a one‑line subtraction per torso‑child when the flat value is written to
the 3D node.

This eliminates `wrapPoseablePartJoints` from the editor (it becomes a no‑op),
and the same `else if (a.mode === 'sleep') { … }` block produces identical
results in both the editor and the game.

---

## Target unified hierarchy

```
group  (rig.origin, Y=0 at ground)
├── torsoPivot   (at hip grid-Y 34 × C)     → parts.torso
│   ├── torsoMesh
│   ├── headPivot  (at neck grid-Y 56 × C)   → parts.head
│   │   └── headMesh
│   ├── hairPivot  (at crown grid-Y 70 × C)  → parts.hair
│   │   └── hairMesh
│   ├── hoodPivot / hoodTipPivot (optional)
│   ├── eyeL / eyeR  (stay meshes; position at head level)
│   ├── armLPivot  (at shoulder world pos)   → parts.armL
│   │   └── [existing 2‑bone limb from buildLimb]
│   │       ├── upperMesh
│   │       └── elbowJoint → foreLPivot  → parts.foreL
│   │           ├── lowerMesh
│   │           └── wristJoint → wristLPivot → parts.wristL
│   │               └── handMesh
│   ├── armRPivot  (mirror of armL)          → parts.armR
│   └── padL / padR  (optional shoulder pads, mesh children of arm pivots)
│
├── legLPivot  (at hip world pos)            → parts.legL
│   └── [existing 2‑bone limb from buildLimb]
│       ├── upperMesh
│       └── kneeJoint → shinLPivot           → parts.shinL
│           └── lowerMesh
├── legRPivot  (mirror of legL)              → parts.legR
└── weapon  (parented to handR, or group for non‑detailed rigs)
```

**Key points:**
- Torso, head, hair, arms are under the torso chain → they follow torso tilt.
- Legs stay as direct children of `group` (same as current editor).
- Limbs already have hierarchical elbow/knee/wrist nesting from `buildLimb`.
- The `parts` map always points to the **rotation pivot** (the Group immediately
  above the mesh/limb that should rotate independently).

---

## Change plan

### Phase 1 — Centralize hierarchy construction

Create one function in `characters.ts`:

```ts
function buildHierarchy(rig: Rig): void
```

This is extracted/adapted from `wrapPoseablePartJoints` (poseEditor.ts).  It is
called **once, at the end of every rig builder** (right after all parts are added
to group).  A `rig.group.userData.hierarchyBuilt = true` flag prevents double‑
wrapping.

The function does:
1. Wrap `torso`/`head`/`hair` meshes in pivot groups at hip/neck/crown.
2. Wrap `armL`/`armR`/`legL`/`legR` limb groups in pivots at their world‑space
   shoulder/hip positions.
3. Add elbow/knee/wrist nested‑joint pivots (currently done inside the
   `fixLimbJoints` block of the editor).
4. Reparent `head`/`hair`/`armL`/`armR`/`hood`/`hoodTip` pivots under `torso`.
5. Reparent `padL`/`padR` under `armL`/`armR` pivots.

**Builders touched**: `buildCharacter()`, chibi‑orc builder, skeleton rig,
bat‑creature rig, cave‑rat rig, generic‑NPC builder.  (Bats set `userData.flap`
which overrides arm rotation — still works because it writes to `p.armL` pivot.)

The pose editor's `wrapPoseablePartJoints` becomes a guarded no‑op:

```ts
if (rig.group.userData.hierarchyBuilt) return;
```

### Phase 2 — Flat‑to‑local conversion in `updateRig`

After Phase 1, `updateRig` sets `p.torso.rotation.x = torsoX` but also sets
`p.head.rotation.x = headX` on a pivot that is now a **child** of torso.  The
head needs `headX - torsoX` to match the same absolute orientation.

Add conversion for these torso‑children:

| Part | Current (flat) | New (local to parent) |
|------|---------------|----------------------|
| `head` | `p.head.rotation.x = headX` | `p.head.rotation.x = headX - torsoX` |
| `hair` | `p.hair.rotation.x = headX` | `p.hair.rotation.x = 0` (follows head; no independent tilt in existing poses)  *see note* |
| `armL` | `p.armL.rotation.x = armLX` | `p.armL.rotation.x = armLX - torsoX` |
| `armR` | `p.armR.rotation.x = armRX` | `p.armR.rotation.x = armRX - torsoX` |
| `hood` | `p.hood.rotation.x = headX` | `p.hood.rotation.x = 0` |
| `hoodTip` | `p.hoodTip.rotation.x = headX` | `p.hoodTip.rotation.x = 0` |

*Note on hair*: In the editor's hierarchy, hair is parented to **head**, not
torso.  `p.hair.rotation.x = headX` was already writing to a child of head.
Since head now gets `headX - torsoX`, hair stays at 0 (follows head).  Verify
the `a.hairYOffset` path still works.

**Z‑axes** (forearm lateral, wrist Z) are NOT torso‑children in the hierarchy —
they stay as‑is.

### Phase 3 — Death ragdoll conversion

`initDeath()` and `initCollapse()` generate absolute‑space rotation targets for
all parts.  With the hierarchy, head/arm targets must be converted to local.

In the death update loop inside `updateRig` (lines ~1204‑1210), add the same
subtraction:

```ts
if (name === 'head' || name === 'hair' || name === 'armL' || name === 'armR'
    || name === 'hood' || name === 'hoodTip') {
  tx = targetX - torsoX;  // torsoX comes from the current frame's torso value or m.rotation.x
}
```

But since the death loop uses `d.pt[name].x` as the target and `m.rotation.x` as
current, we need to derive the torso rotation.  Simplest approach: convert the
**targets** at init‑time (inside `initDeath`/`initCollapse`) so the spring just
drives local angles.  Store torsoX as a separate field in the death targets, or
re‑derive it from `p.torso.rotation.x` at runtime.

**Recommended**: convert at **init time** — when `initDeath` creates the targets,
subtract the torso target from head/arm targets.  The spring then naturally
drives local rotation.

### Phase 4 — Fix read‑back consumers

Two places read `rotation.x` from flat parts and assume absolute values:

#### 4a. Cutscenes tankard angle (cutscenes.ts:255)

```ts
const ax = (armL?.rotation.x ?? 0) + (foreL?.rotation.x ?? 0);
mug.rotation.x = -ax;
```

With hierarchy: `foreL` is a child of `armL`, so their rotations are already
composed in world space.  Replace with world‑quaternion read:

```ts
const armQ = new THREE.Quaternion();
armL?.getWorldQuaternion(armQ);
const foreQ = new THREE.Quaternion();
foreL?.getWorldQuaternion(foreQ);
const mugQ = armQ.clone().multiply(foreQ);
const mugEuler = new THREE.Euler().setFromQuaternion(mugQ);
mug.rotation.x = -mugEuler.x;
```

#### 4b. Weapon staff / blade orientation (characters.ts:1362‑1365)

```ts
weapon.rotation.x = weaponBase + (p.foreR.rotation.x + p.armR.rotation.x) * 0.9;
```

Same fix — read world quaternion and extract X angle.  (Weapon is parented to
`handR` which is nested under `armR` → `foreR` → `wristR` → `handR`.)

### Phase 5 — Editor decoupling

After Phase 1, `wrapPoseablePartJoints` is a guarded no‑op.  `applyPose` already
does the `j.x - tx` conversion (line 102) — this stays and should match the
game's new conversion.

**Remove from the editor:**
- The call to `wrapPoseablePartJoints` in `createPoseStage` (poseEditor.ts ~310)
  → replace with `if (!rig.group.userData.hierarchyBuilt) buildHierarchy(rig)`
  (imported from characters.ts).
- The `fireJoint` world‑quaternion readback (poseEditor.ts:345‑360) still works
  because it reads world‑space orientation and presents flat values — the
  conversion is the inverse of applyPose.  Verify no change needed.

---

## What does NOT change

- **All pose constants** (`torsoX`, `armLX`, `elbowL`, `kneeL`, etc.) — unchanged.
- **All `else if (a.mode === '…')` blocks** in `updateRig` — unchanged (values
  stay flat‑format).
- **Idle / walk / crouch / combat lunge** layering — unchanged (these modify the
  flat variables before the final `p.xxx.rotation.x =` writes).
- **Non‑humanoid rigs** (bat flap, sheep) — the `userData.flap` flag overrides
  arm rotation, same as now.
- **`getup` mode** — `rig.group.rotation.x` is handled before limb code, unchanged.
- **`a.headYOffset` / `a.hairYOffset` / `a.forearmLOffset`** — unchanged.

## Regression verification

| Feature | Verification |
|---------|-------------|
| Pose editor — all presets render correctly | Visual match between editor slider panel and 3D viewport |
| In‑game `sleep` (snoozer) — torso + head + arms aligned | Thorax connects to head, arms lie on ground naturally |
| All other poses (`sit`, `drink`, `crack`, `cross`, `sit_cross`, `point`) | No visual regression in tavern NPCs |
| Combat lunge/swing | Weapon arc unchanged |
| Death ragdoll | Corpse crumples naturally, body topples to floor |
| Pass‑out / lie collapse | Body settles flat, limbs splay correctly |
| Cutscene Greg tankard | Mug stays level during drink animation |
| Wizard staff vertical lock | Staff remains upright during arm swing |
| Bat creature wing flap | Wing‑Z flapping unchanged |
| Bone skeleton death | Skeleton collapses correctly |
| Sheep | Unaffected |

---

## Implementation order

1. Extract `buildHierarchy()` from `wrapPoseablePartJoints` logic into `characters.ts`.
2. Call `buildHierarchy()` at end of each rig builder.
3. Guard poseEditor's `wrapPoseablePartJoints` to skip already‑built rigs.
4. Add flat‑to‑local subtraction in `updateRig` for head/arm/hair/hood.
5. Convert death ragdoll targets to local in `initDeath`/`initCollapse`.
6. Fix cutscene mug readback (world quaternion).
7. Fix weapon orientation readback (world quaternion).
8. Verify all 11 pose presets + death + combat in both editor and game.