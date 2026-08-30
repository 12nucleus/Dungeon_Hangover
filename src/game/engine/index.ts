// ─────────────────────────────────────────────────────────────
// Engine sub-module barrel — re-exports everything from ./engine/*
// Note: `clearHighlights` (targeting.ts), `openIronDoor` (dungeonSetup.ts),
// and `grantLoot` (combatAnimation.ts) are the canonical versions.
// Duplicate exports from other modules are intentionally omitted here.
// ─────────────────────────────────────────────────────────────
export { IsoCamera } from './IsoCamera';
export { VOX_C, extMat, extEmissiveMat, voxelMesh, voxelMeshC, extHalo, voxTree, voxBush, extGlow } from './voxelUtils';
export { RX, ZB, ZF, WH, buildTavern } from './tavern';
export { buildTavernExterior } from './tavernExterior';
export { buildSheep } from './sheep';
export { addUnit, unitWorld, dropWeapon, updateDroppedWeapons } from './visuals';
export { debugWarpToBoss, executeCheatCommand, animateTo } from './cheats';
export { hotkeySkill, cancelTargeting, clearHighlights, paint, showMoveTiles, showTargeting, showAoePreview, pingAt } from './targeting';
export { bindInput, onPointerMove, onPointerDown, onWheel, onKeyDown, onKeyUp, onResize } from './input';
export { updateFog, pickTile, updateHover, setHoverInfoOnce, clickExplore, moveUnitAlong, closestWalkableAdjacent, clickCombat, trySmashInCombat, talkToNpc, dialogueChoice, executeDialogueAction, hasItemInInventory } from './interaction';
export { setupDungeon, attachHeroTorch, updateDungeon, pullLever, openSecretChest, openGoldenChest, winGame, grantKey, checkDungeonAggro, openIronDoor } from './dungeonSetup';
export { animate, animMove, animMelee, smashProp, destroyProp, triggerTrap, disarmTrap, animProjectile, animSkillFx, flashLight, spawnFloater, refreshBar, spawnChest, checkCombatTrigger, enqueue, pump } from './combatAnimation';
export { offerLoot, flushLootQueue, takeAllLoot, takeLootItem, leaveLootItem, dismissLoot, clearLoot } from './loot';
export { startGame, enterDungeon, enterEditorMode, getEditorHandles, selectSkill, endTurn, toggleMute, setSettings, setPaused, togglePause, deleteSlot, startNewGame, saveGame, loadGame, spawnBonfireFlame } from './gameFlow';
export { toggleSneak, toggleTorch, closeDialogue, lightBonfire, restAtBonfire, closeBonfireUI, levelUpAtBonfire, respawn, toggleInventory, equipItem, unequipItem, toggleSkillTree, unlockNode, resetSkillBuild, equipSkill, unequipSkill, useConsumable } from './camping';
