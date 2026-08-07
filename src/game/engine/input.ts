// ─────────────────────────────────────────────────────────────
// Input handling — pointer, keyboard, wheel, resize events
// Uses `engine: any` to avoid circular import + private field errors.
// ─────────────────────────────────────────────────────────────
import { SettingsManager } from '../save';

export function bindInput(engine: any) {
  const el = engine.renderer.domElement;
  el.addEventListener('pointermove', engine.onPointerMove);
  el.addEventListener('pointerdown', engine.onPointerDown);
  el.addEventListener('pointerup', () => { engine.fpDrag = false; });
  el.addEventListener('pointerleave', () => { engine.fpDrag = false; });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== el) engine.fpDrag = false;
  });
  el.addEventListener('wheel', engine.onWheel, { passive: false });
  el.addEventListener('contextmenu', (e: Event) => e.preventDefault());
  window.addEventListener('keydown', engine.onKeyDown);
  window.addEventListener('keyup', engine.onKeyUp);
  window.addEventListener('resize', engine.onResize);
  // keep the settings in sync when the user exits fullscreen with Esc (web API)
  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    if (isFs === !!engine.settings?.fullscreen) return;
    engine.settings.fullscreen = isFs;
    SettingsManager.save(engine.settings);
    engine.emitSnapshot?.();
  });
  // Tauri native fullscreen has no DOM fullscreenchange — sync via window resize.
  // (Native fullscreen is used in the desktop app so ESC never exits it and stays
  // available for cutscene skipping; the checkbox follows along on the way back.)
  if ((window as any).__TAURI_INTERNALS__) {
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().onResized(() => {
        void getCurrentWindow().isFullscreen().then((fs: boolean) => {
          if (fs === !!engine.settings?.fullscreen) return;
          engine.settings.fullscreen = fs;
          SettingsManager.save(engine.settings);
          engine.emitSnapshot?.();
        });
      });
    }).catch(() => { /* not in tauri */ });
  }
}

export function onPointerMove(engine: any, e: PointerEvent) {
  // first-person mouse look: pointer-locked (or dragging) deltas rotate the view
  if (engine.firstPerson) {
    const locked = document.pointerLockElement === engine.renderer.domElement;
    const dragging = engine.fpDrag;
    if (locked || dragging) {
      const sens = 0.0032;
      engine.fpYaw -= e.movementX * sens;
      engine.fpPitch = Math.max(-1.35, Math.min(1.35, engine.fpPitch - e.movementY * sens));
      return;
    }
  }
  const r = engine.renderer.domElement.getBoundingClientRect();
  engine.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  engine.updateHover();
}

export function onPointerDown(engine: any, e: PointerEvent) {
  if (engine.paused) return;
  if (e.button === 2) { cancelTargeting(engine); return; }
  // first-person: clicking the canvas grabs the mouse (pointer lock), and
  // drag-look as a fallback when the browser refuses the lock. Clicks never
  // move the hero in FP — W/S do that.
  if (engine.firstPerson && e.button === 0) {
    engine.fpDrag = true;
    try {
      const el = engine.renderer.domElement as HTMLCanvasElement;
      if (document.pointerLockElement !== el) {
        const p = el.requestPointerLock?.();
        if (p?.catch) p.catch(() => {});
      }
    } catch { /* pointer lock unavailable — drag-look still works */ }
    return;
  }
  if (engine.busy) return;
  // generous picking: direct ray hits first, then screen-space tolerance
  // (bonfire / NPCs / [E] prompts) — handled inside pickInteractable.
  const pick = pickInteractable(engine);
  const tile = pickTile(engine);
  if (engine.phase === 'explore') engine.clickExplore(pick, tile);
  else if (engine.phase === 'combat') engine.clickCombat(pick, tile);
}

export function onWheel(engine: any, e: WheelEvent) {
  e.preventDefault();
  engine.iso.zoom(e.deltaY * 0.012);
}

export function onKeyDown(engine: any, e: KeyboardEvent) {
  const k = e.key.toLowerCase();

  // cheat console (backtick)
  if (k === '`' || k === '~') {
    e.preventDefault();
    engine.consoleOpen = !engine.consoleOpen;
    engine.consoleInput = '';
    if (!engine.consoleOpen) engine.keys.clear();
    engine.emitSnapshot();
    return;
  }
  if (engine.consoleOpen) {
    e.preventDefault();
    if (k === 'escape') { engine.consoleOpen = false; engine.consoleInput = ''; engine.emitSnapshot(); return; }
    if (k === 'backspace') { engine.consoleInput = engine.consoleInput.slice(0, -1); engine.emitSnapshot(); return; }
    if (k === 'enter') {
      const cmd = engine.consoleInput.trim().toLowerCase();
      engine.consoleOpen = false; engine.consoleInput = '';
      engine.executeCheatCommand(cmd);
      engine.emitSnapshot();
      return;
    }
    if (e.key.length === 1) {
      engine.consoleInput += e.key;
      engine.emitSnapshot();
    }
    return;
  }

  if (engine.paused && k !== 'escape') { e.preventDefault(); return; }
  engine.keys.add(k);
  const cutscene = engine.busy && (engine.introActive || engine.bossCineActive);
  // Q/E rotate the iso camera; in first person they turn the view instead
  // (handled per-frame in the engine update loop via engine.keys)
  if (k === 'q' && !cutscene && !engine.firstPerson) engine.iso.rotate(1);
  if (k === 'e' && !cutscene && !engine.firstPerson) engine.iso.rotate(-1);
  if (k === 'r' && !cutscene) {
    // interact with the active prompt (puddle, chest, valve…)
    if (engine.activeInteractable && engine.phase === 'explore' && !engine.combat.inCombat) engine.triggerActiveInteractable();
    else engine.setHoverInfoOnce('Nothing to interact with here.');
    return;
  }
  if (k === 'j' && engine.phase !== 'menu') { engine.toggleQuestLog(); return; }
  if (k === 'i' && engine.phase !== 'menu') { engine.toggleInventory(); return; }
  if (k === 'k' && engine.phase !== 'menu') { engine.toggleSkillTree(); return; }
  if (k === 'u' && engine.phase !== 'menu') { engine.toggleStats(); return; }
  if (k === 'c' && engine.phase === 'explore' && !engine.combat.inCombat) { engine.toggleSneak(); return; }
  if (k === 't') { engine.toggleTorch(); return; }
  if (k === 'v') { engine.followCam = !engine.followCam; engine.pushLog(`Follow camera ${engine.followCam ? 'ON' : 'OFF'}`, 'system'); engine.emitSnapshot(); return; }
  if (k === 'm') { engine.showFullMap = !engine.showFullMap; engine.emitSnapshot(); return; }
  if (k === 'p' && engine.phase === 'explore' && !engine.combat.inCombat) { engine.toggleFirstPerson(); return; }
  if (k === 'b') { engine.debugWarpToBoss(); return; }
  if (k === 'escape') {
    if (engine.busy && (engine.introActive || engine.bossCineActive || (engine.phase === 'menu' && engine.titleExt))) {
      engine.introSkipped = true;
      engine.cutsceneSkip = true;
      engine.cutsceneDirector?.requestSkip();
      return;
    }
    // Esc closes the dialogue overlay first — pausing under it is confusing
    if (engine.showDialogue) { engine.closeDialogue(); return; }
    if (engine.showInventory) { engine.showInventory = false; engine.emitSnapshot(); return; }
    if (engine.showStats) { engine.showStats = false; engine.emitSnapshot(); return; }
    if (engine.showQuestLog) { engine.showQuestLog = false; engine.emitSnapshot(); return; }
    if (engine.showSkillTree) { engine.showSkillTree = false; engine.emitSnapshot(); return; }
    // Esc leaves first person before it pauses — exiting FP also releases
    // the pointer lock, so the cursor is back for the pause menu
    if (engine.firstPerson) { engine.toggleFirstPerson(); return; }
    if (engine.targeting) { cancelTargeting(engine); return; }
    engine.togglePause();
    return;
  }
  if (k === ' ' || k === 'enter') {
    e.preventDefault();
    if (engine.busy && (engine.introActive || engine.bossCineActive)) { engine.cutsceneDirector?.requestSkip(); return; }
    engine.endTurn();
  }
  if (k === 'f') { const a = engine.combat?.active ?? engine.byId(engine.selectedId ?? ''); if (a) engine.iso.focus(unitWorld(engine, a.pos)); }
  if (k === '0') engine.hotkeySkill(9);
  else if (k === '-') engine.hotkeySkill(10);
  else if (k === '=') engine.hotkeySkill(11);
  else if (/^[1-9]$/.test(k)) engine.hotkeySkill(parseInt(k, 10) - 1);
}

export function onKeyUp(engine: any, e: KeyboardEvent) {
  engine.keys.delete(e.key.toLowerCase());
}

export function onResize(engine: any) {
  engine.applyDisplaySettings();
}

// ── cross-module helpers ──

import { unitWorld } from './visuals';
import { cancelTargeting } from './targeting';
import { pickTile, pickInteractable } from './interaction';
