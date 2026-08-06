# Refactoring & Fixes Plan — July 2026 (REVISED)

## Status

- **Tasks 1-2 (Wrist fix, Front wall):** DONE
- **Task 3 (characters.ts → `characters/`):** DONE — 13 files exist
- **Task 4 (cutscenes.ts → `cutscenes/`):** DONE — 6 files exist
- **Task 5 (engine.ts → `engine/`):** PARTIALLY DONE — all 15 sub-modules exist with extracted code, but monolithic `engine.ts` still has duplicated inline code. **This needs to be completed.**

---

## Task 5: Engine Refactoring — Detailed Implementation

### Overview

The monolithic `engine.ts` (4120 lines) contains all code inline. The 15 sub-modules under `./engine/` already contain the extracted logic. The goal is to:

1. Remove duplicated code sections from `engine.ts`
2. Import from `./engine/` sub-modules instead
3. Change all `private` fields that sub-modules access to `public` (sub-modules use `engine: any`)
4. Keep the `GameEngine` class as a thin orchestration shell (~1200 lines)

### Sub-Module Inventory (all already exist)

| Module | Exports |
|--------|---------|
| `IsoCamera.ts` | `IsoCamera` class |
| `voxelUtils.ts` | `VOX_C`, `extMat`, `extEmissiveMat`, `voxelMesh`, `voxelMeshC`, `extHalo`, `voxTree`, `voxBush`, `extGlow` |
| `visuals.ts` | `addUnit`, `unitWorld`, `dropWeapon`, `updateDroppedWeapons` |
| `dungeonSetup.ts` | `setupDungeon`, `attachHeroTorch`, `updateDungeon`, `pullLever`, `openSecretChest`, `openGoldenChest`, `winGame`, `grantKey`, `checkDungeonAggro`, `openIronDoor` |
| `combatAnimation.ts` | `animate`, `animMove`, `animMelee`, `smashProp`, `destroyProp`, `triggerTrap`, `disarmTrap`, `animProjectile`, `animSkillFx`, `flashLight`, `spawnFloater`, `refreshBar`, `spawnChest`, `checkCombatTrigger`, `enqueue`, `pump`, `grantLoot` |
| `interaction.ts` | `updateFog`, `pickTile`, `updateHover`, `setHoverInfoOnce`, `clickExplore`, `moveUnitAlong`, `closestWalkableAdjacent`, `clickCombat`, `trySmashInCombat`, `talkToNpc`, `dialogueChoice`, `executeDialogueAction`, `hasItemInInventory` |
| `targeting.ts` | `hotkeySkill`, `cancelTargeting`, `clearHighlights`, `paint`, `showMoveTiles`, `showTargeting`, `showAoePreview`, `pingAt` |
| `gameFlow.ts` | `startGame`, `enterDungeon`, `enterEditorMode`, `getEditorHandles`, `selectSkill`, `endTurn`, `continueAfterVictory`, `toggleMute`, `setSettings`, `setPaused`, `togglePause`, `deleteSlot`, `startNewGame`, `saveGame`, `loadGame`, `spawnBonfireFlame` |
| `camping.ts` | `toggleSneak`, `toggleTorch`, `closeDialogue`, `lightBonfire`, `restAtBonfire`, `closeBonfireUI`, `levelUpAtBonfire`, `respawn`, `toggleInventory`, `equipItem`, `unequipItem`, `toggleSkillTree`, `unlockNode`, `equipSkill`, `unequipSkill`, `useConsumable` |
| `input.ts` | `bindInput`, `onPointerMove`, `onPointerDown`, `onWheel`, `onKeyDown`, `onKeyUp`, `onResize` |
| `cheats.ts` | `debugWarpToBoss`, `executeCheatCommand`, `animateTo` |
| `tavern.ts` | `buildTavern`, `RX`, `ZB`, `ZF`, `WH` |
| `tavernExterior.ts` | `buildTavernExterior` |
| `sheep.ts` | `buildSheep` |

### What Gets DELETED from engine.ts (lines approximate)

| Section | Lines | Replaced By |
|---------|-------|-------------|
| `IsoCamera` class | ~131–212 | `import { IsoCamera } from './engine/IsoCamera'` |
| voxel helpers (`VOX_C`, `extMat`, `voxelMesh`, `voxelMeshC`, `extHalo`, `voxTree`, `voxBush`, `extGlow`) | ~35–130 | `import { ... } from './engine/voxelUtils'` |
| `delay` const | ~35 | (moved to combatAnimation.ts, remove) |
| `addUnit` method | ~entire method | `import { addUnit } from './engine/visuals'` |
| `unitWorld` method | ~entire method | `import { unitWorld } from './engine/visuals'` |
| `dropWeapon` method | ~entire method | (now in visuals.ts, remove) |
| `updateDroppedWeapons` method | ~entire method | `import { updateDroppedWeapons } from './engine/visuals'` |
| `_buildTavern` method | ~entire method | Uses `buildTavern` from tavern.ts via cutscene host |
| `buildTavernExterior` method | ~entire method | `import { buildTavernExterior } from './engine/tavernExterior'` |
| `buildSheep` method | ~entire method | `import { buildSheep } from './engine/sheep'` |
| `buildCutsceneHost` method | ~entire method | (keep in engine.ts — uses closures over `self`) |
| All combat animation methods | hundreds of lines | `import { ... } from './engine/combatAnimation'` |
| All dungeon setup methods | hundreds of lines | `import { ... } from './engine/dungeonSetup'` |
| All interaction methods | hundreds of lines | `import { ... } from './engine/interaction'` |
| All game flow methods | hundreds of lines | `import { ... } from './engine/gameFlow'` |
| All camping methods | hundreds of lines | `import { ... } from './engine/camping'` |
| All input methods | ~entire methods | `import { ... } from './engine/input'` |
| All targeting methods | ~entire methods | `import { ... } from './engine/targeting'` |
| All cheat methods | ~entire methods | `import { ... } from './engine/cheats'` |

### What STAYS in engine.ts

| Section | Rationale |
|---------|-----------|
| `GameEngine` class declaration | Orchestration shell |
| All **fields** (made public) | Sub-modules access them via `engine: any` |
| `constructor` | Wires everything together |
| `onSnapshot` callback setter | Simple |
| `spawnUnits` method | Uses inline `createRoster` / `dungeonLevel` |
| `buildCutsceneHost` method | Uses closures over `self` — tightly coupled |
| `playBossCutscene` method | Uses `this.cutsceneDirector` |
| `showCine` / `clearCine` / `cineDelay` / `narrate` / `fadeTo` | Cutscene-specific helpers |
| `faceToward` / `walkRigTo` / `_walkTo` / `_updateMoveTileCache` / `spawnStars` / `splashBurst` / `waterPlink` / `launchMagicMissile` / `passOut` / `barmaidServe` | Visual/cutscene helpers |
| `update` method | Main loop — delegates to sub-modules |
| `pushLog` / `emitSnapshot` / `dispose` | Core lifecycle |
| `byId` / `inEnemyCone` | Simple helpers |
| All **React API wrappers** (thin delegation) | Public API surface |
| `applyAudioSettings` / `listSlots` / `getSlotMeta` / `maxSlots` / `hasSave` / `onIntroComplete` | Simple |
| `playTitleSequence` / `endTitleSequence` | Title/cutscene orchestration |

### Changes Needed: `private` → `public`

The sub-modules use `engine: any` to access engine fields. Changing visibility eliminates the need for the `engine: any` pattern and makes the refactor type-safe. All fields marked `private` that sub-modules access must become `public`.

Fields accessed by sub-modules (must become public):
`renderer`, `composer`, `scene`, `iso`, `world`, `props`, `particles`, `combat`, `audio`, `visuals`, `droppedWeapons`, `pickables`, `unitProxies`, `ray`, `pointer`, `hlPool`, `hlGroup`, `hlMats`, `ring`, `clickPing`, `clickPingT`, `phase`, `selectedId`, `targeting`, `moveTiles`, `queue`, `eventQueue`, `busy`, `floaters`, `log`, `logSeq`, `loot`, `inventory`, `gold`, `showInventory`, `showSkillTree`, `questLog`, `hermitPos`, `showDialogue`, `sneaking`, `crouchLerp`, `torchLit`, `torchLight`, `bonfireGroup`, `bonfirePos`, `bonfireLit`, `defeatedSpecialMobs`, `showBonfireUI`, `restingAtBonfire`, `pendingSmash`, `bigMessage`, `cinematic`, `settings`, `currentSlotId`, `paused`, `hoverInfo`, `keys`, `enemyCones`, `playerCone`, `coneGeo`, `playerConeGeo`, `detectionMeter`, `trapManager`, `disposed`, `raf`, `lastT`, `chest`, `structures`, `heroLight`, `heroTorchFlame`, `torchT`, `ironDoor`, `goldenChest`, `secretChestMesh`, `leverMesh`, `weaponRack`, `rackClub`, `rubbleMeshes`, `propAnims`, `ironDoorOpen`, `secretOpen`, `goldenChestOpen`, `secretChestOpen`, `bossCutscenePlayed`, `introPlayed`, `introActive`, `titleIdle`, `introSkipped`, `bossCineActive`, `cutsceneSkip`, `tavern`, `tavernRigs`, `tavernActors`, `inTavern`, `fadeEl`, `hasIronKey`, `hasGoldenKey`, `gameWon`, `explored`, `fogGroup`, `fogCubes`, `visionRadius`, `followCam`, `aggroDisabled`, `showFullMap`, `consoleOpen`, `consoleInput`, `godMode`, `introGraceUntil`, `cutsceneDirector`, `cutsceneHost`, `titleExt`, `titlePrevBg`, `splashAudioHandler`, `cutsceneHost`, `editorMode`, `editorFocusTarget`

### New Import Block for engine.ts

```typescript
// External
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Core game systems (still needed inline)
import { VoxelWorld } from './world';
import { dungeonLevel } from '../levels/dungeon';
import { ParticleSystem, FX } from './particles';
import { buildCharacter, updateRig, setWeapon, type Rig } from './characters';
import { Combat } from './combat';
import { createRoster } from './skills';
import { AudioManager } from './audio';
import { DestructibleManager } from './destructibles';
import { SaveManager, SettingsManager, type GameSettings, type SaveSlotMeta } from './save';
import { TrapManager } from './traps';
import type { CombatEvent, GamePhase, GridPos, LogEntry, SkillDef, UISnapshot, Unit } from './types';
import type { Item } from './items';
import { QuestLog } from './quest';
import { CutsceneDirector, setupTitleScene, type CutsceneHost } from './cutscenes';

// Engine sub-modules
import { IsoCamera } from './engine/IsoCamera';
import { VOX_C, extMat, extEmissiveMat, voxelMesh, voxelMeshC, extHalo, extGlow } from './engine/voxelUtils';
import { addUnit, unitWorld, dropWeapon, updateDroppedWeapons } from './engine/visuals';
import { buildTavern } from './engine/tavern';
import { buildTavernExterior } from './engine/tavernExterior';
import { buildSheep } from './engine/sheep';
import { setupDungeon, attachHeroTorch, updateDungeon, checkDungeonAggro } from './engine/dungeonSetup';
import { smashProp, checkCombatTrigger, enqueue } from './engine/combatAnimation';
import { updateFog, clickExplore, clickCombat, moveUnitAlong, dialogueChoice, trySmashInCombat } from './engine/interaction';
import { startGame, enterDungeon, enterEditorMode, getEditorHandles, selectSkill, endTurn, continueAfterVictory, toggleMute, setSettings, setPaused as setPausedModule, deleteSlot, startNewGame, saveGame, loadGame } from './engine/gameFlow';
import { toggleSneak, toggleTorch, closeDialogue, lightBonfire, restAtBonfire, closeBonfireUI, levelUpAtBonfire, respawn, toggleInventory, equipItem, unequipItem, toggleSkillTree, unlockNode, equipSkill, unequipSkill, useConsumable } from './engine/camping';
import { hotkeySkill } from './engine/targeting';
import { debugWarpToBoss, executeCheatCommand, animateTo } from './engine/cheats';
import { bindInput as bindInputModule, onPointerMove as onPointerMoveModule, onPointerDown as onPointerDownModule, onWheel as onWheelModule, onKeyDown as onKeyDownModule, onKeyUp as onKeyUpModule, onResize as onResizeModule } from './engine/input';
```

### React API Wrappers (thin delegation methods to keep in class)

```typescript
// gameFlow
startGame() { startGame(this); }
enterDungeon() { enterDungeon(this); }
enterEditorMode() { enterEditorMode(this); }
getEditorHandles() { return getEditorHandles(this); }
selectSkill(skillId: string | null) { selectSkill(this, skillId); }
endTurn() { endTurn(this); }
continueAfterVictory() { continueAfterVictory(this); }
toggleMute() { return toggleMute(this); }
setSettings(s: GameSettings) { setSettings(this, s); }
setPaused(b: boolean) { setPausedModule(this, b); }
startNewGame(slotId: string) { startNewGame(this, slotId); }
loadGame(slotId: string): boolean { return loadGame(this, slotId); }
saveGame(slotId?: string, label?: string) { saveGame(this, slotId, label); }
deleteSlot(slotId: string) { deleteSlot(this, slotId); }

// camping
toggleSneak() { toggleSneak(this); }
toggleTorch() { toggleTorch(this); }
closeDialogue() { closeDialogue(this); }
lightBonfire() { lightBonfire(this); }
restAtBonfire() { restAtBonfire(this); }
closeBonfireUI() { closeBonfireUI(this); }
levelUpAtBonfire(unitId: string) { levelUpAtBonfire(this, unitId); }
respawn() { respawn(this); }
toggleInventory() { toggleInventory(this); }
equipItem(unitId: string, itemId: string) { equipItem(this, unitId, itemId); }
unequipItem(unitId: string, slot: string) { unequipItem(this, unitId, slot); }
toggleSkillTree() { toggleSkillTree(this); }
unlockNode(unitId: string, nodeId: string) { unlockNode(this, unitId, nodeId); }
equipSkill(unitId: string, skillId: string) { equipSkill(this, unitId, skillId); }
unequipSkill(unitId: string, skillId: string) { unequipSkill(this, unitId, skillId); }
useConsumable(itemId: string, unitId: string) { useConsumable(this, itemId, unitId); }

// interaction
clickExplore(unitId: string | undefined, tile: GridPos | null, propId?: string) { clickExplore(this, unitId, tile, propId); }
clickCombat(unitId: string | undefined, tile: GridPos | null, propId?: string) { clickCombat(this, unitId, tile, propId); }
dialogueChoice(npcId: string, choiceIndex: number) { dialogueChoice(this, npcId, choiceIndex); }
moveUnitAlong(u: Unit, path: GridPos[]) { moveUnitAlong(this, u, path); }
trySmashInCombat(active: Unit, propId: string, preferred?: SkillDef) { trySmashInCombat(this, active, propId, preferred); }

// targeting
hotkeySkill(i: number) { hotkeySkill(this, i); }

// cheats
debugWarpToBoss() { debugWarpToBoss(this); }
executeCheatCommand(cmd: string) { executeCheatCommand(this, cmd); }

// input
onPointerMove = (e: PointerEvent) => onPointerMoveModule(this, e);
onPointerDown = (e: PointerEvent) => onPointerDownModule(this, e);
onWheel = (e: WheelEvent) => onWheelModule(this, e);
onKeyDown = (e: KeyboardEvent) => onKeyDownModule(this, e);
onKeyUp = (e: KeyboardEvent) => onKeyUpModule(this, e);
onResize = () => onResizeModule(this);
```

### Critical: Methods That Must Stay Inline (Not in Sub-modules)

These methods use `this` closures or are otherwise tightly coupled to the class:

1. **`buildCutsceneHost()`** — Creates cutscene host adapter with closures over `self`
2. **`spawnUnits()`** — Inline orchestration
3. **`showCine()` / `clearCine()` / `cineDelay()` / `narrate()` / `fadeTo()`** — Small helpers
4. **`faceToward()` / `walkRigTo()` / `_walkTo()`** — Visual helpers using `this`
5. **`spawnStars()` / `splashBurst()` / `waterPlink()` / `launchMagicMissile()` / `passOut()` / `barmaidServe()`** — Particle/cutscene helpers
6. **`update()`** — Main loop (delegates to sub-module functions like `updateFog(this, dt)`, `checkCombatTrigger(this)`, etc.)
7. **`pushLog()` / `emitSnapshot()` / `dispose()`** — Core lifecycle
8. **`byId()` / `inEnemyCone()`** — Inline helpers
9. **`_buildTavern()`** — Wraps imported `buildTavern()` with closures
10. **`playTitleSequence()` / `endTitleSequence()`** — Title orchestration

### Runtime Dependencies

The sub-modules call methods on engine as properties (e.g., `engine.checkDungeonAggro()`). These must be available:

- `engine.checkDungeonAggro` — MUST import for `checkCombatTrigger` (combatAnimation.ts:341)
- `engine._buildTavern` — MUST define as method (gameFlow.ts:59,89)
- `engine.cancelTargeting` — from targeting.ts (input.ts calls it)
- `engine.setHoverInfoOnce` — from interaction.ts
- `engine.setHoverInfoOnce` — set on engine directly in constructor?

**IMPORTANT:** `checkDungeonAggro` is called on the engine instance from `combatAnimation.ts`, NOT just imported. The import is needed but the method wire-up is needed too. Since it's imported, it can't be a class method. The sub-module uses `engine.checkDungeonAggro()` as a dynamic access. We need to ensure this function is somehow attached.

**APPROACH:** Keep `checkDungeonAggro` in the import list and also set up a method in the class:
```typescript
checkDungeonAggro() { checkDungeonAggro(this); }
```

**`_buildTavern`:** This wraps the imported `buildTavern` with closures over `self`:
```typescript
_buildTavern() {
  const self = this;
  return buildTavern(self.propAnims, (rig, x, z, ry, mode, key, y = 0) => {
    rig.group.position.set(x, y, z);
    rig.group.rotation.y = ry;
    rig.anim.mode = mode;
    self.tavernRigs.push(rig);
    if (key) self.tavernActors[key] = rig;
    self.scene.add(rig.group);
  });
}
```

---

## Execution Checklist

### Step 1: Change All `private` → `public`
Replace every `private` field keyword with `public` in the GameEngine class.

### Step 2: Remove Duplicated Code Blocks
Delete these sections (keeping the functions that still need to be inline):
- IsoCamera class (lines ~130–212)
- Voxel helper constants and functions (lines ~35–130)
- `delay` const
- All combat animation methods EXCEPT the wrappers
- All dungeon setup methods
- All interaction methods
- All game flow methods
- All camping methods  
- All targeting methods
- All input methods
- All cheat methods
- `addUnit`, `unitWorld`, `dropWeapon`, `updateDroppedWeapons` methods

### Step 3: Add New Imports
Add the import block shown above, plus keep any needed external imports.

### Step 4: Add React API Wrappers
Add the thin delegation methods shown above.

### Step 5: Fix `_buildTavern` Method
Rewrite using imported `buildTavern` from `./engine/tavern`.

### Step 6: Add `checkDungeonAggro` Bridge Method
```typescript
checkDungeonAggro() { checkDungeonAggro(this); }
```

### Step 7: Run `npx tsc --noEmit` + Fix Remaining Errors

### Step 8: Run `npm run build` + Test Runtime

---

## Risk Mitigation

1. **Make a backup:** `cp src/game/engine.ts src/game/engine.ts.backup` before starting
2. **Work incrementally:** Remove one section, add its import, test compilation
3. **Keep `buildCutsceneHost()` inline** — it creates a closure adapter that sub-modules don't touch directly
4. **Keep `update()` inline** — the main loop is the orchestration glue