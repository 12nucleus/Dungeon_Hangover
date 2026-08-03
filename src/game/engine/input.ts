// ─────────────────────────────────────────────────────────────
// Input handling — pointer, keyboard, wheel, resize events
// Uses `engine: any` to avoid circular import + private field errors.
// ─────────────────────────────────────────────────────────────

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
  engine.ray.setFromCamera(engine.pointer, engine.iso.cam);
  const unitHit = engine.ray.intersectObjects(engine.unitProxies, false)[0];
  const propHit = engine.ray.intersectObjects(engine.props.pickboxes, false)[0];
  const tile = pickTile(engine);

  if (engine.phase === 'explore') {
    // clicking an active interactable's tile triggers it (puddle, chest, valve…)
    const it = engine.activeInteractable;
    if (it && !propHit && tile && Math.max(Math.abs(it.pos.x - tile.x), Math.abs(it.pos.z - tile.z)) <= it.radius) {
      engine.triggerActiveInteractable();
      return;
    }
    engine.clickExplore(unitHit?.object.userData.unitId, tile, propHit?.object.userData.propId);
  } else if (engine.phase === 'combat') engine.clickCombat(unitHit?.object.userData.unitId, tile, propHit?.object.userData.propId);
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
  if (k === 'q' && !cutscene) engine.iso.rotate(1);
  if (k === 'e' && !cutscene) engine.iso.rotate(-1);
  if (k === 'r' && !cutscene) {
    // interact with the active prompt (puddle, chest, valve…)
    if (engine.activeInteractable && engine.phase === 'explore' && !engine.combat.inCombat) engine.triggerActiveInteractable();
    else engine.setHoverInfoOnce('Nothing to interact with here.');
    return;
  }
  if (k === 'j' && engine.phase !== 'menu') { engine.toggleQuestLog(); return; }
  if (k === 'i' && engine.phase !== 'menu') { engine.toggleInventory(); return; }
  if (k === 'k' && engine.phase !== 'menu') { engine.toggleSkillTree(); return; }
  if (k === 'c' && engine.phase === 'explore' && !engine.combat.inCombat) { engine.toggleSneak(); return; }
  if (k === 't') { engine.toggleTorch(); return; }
  if (k === 'v') { engine.followCam = !engine.followCam; engine.pushLog(`Follow camera ${engine.followCam ? 'ON' : 'OFF'}`, 'system'); engine.emitSnapshot(); return; }
  if (k === 'm') { engine.showFullMap = !engine.showFullMap; engine.emitSnapshot(); return; }
  if (k === 'p' && engine.phase === 'explore' && !engine.combat.inCombat) { engine.toggleFirstPerson(); return; }
  if (k === 'b') { engine.debugWarpToBoss(); return; }
  if (k === 'escape') {
    if (engine.busy && (engine.introActive || engine.bossCineActive)) {
      engine.introSkipped = true;
      engine.cutsceneSkip = true;
      engine.cutsceneDirector?.requestSkip();
      return;
    }
    // Esc closes the dialogue overlay first — pausing under it is confusing
    if (engine.showDialogue) { engine.closeDialogue(); return; }
    if (engine.showInventory) { engine.showInventory = false; engine.emitSnapshot(); return; }
    if (engine.showSkillTree) { engine.showSkillTree = false; engine.emitSnapshot(); return; }
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
  const w = engine.container.clientWidth, h = engine.container.clientHeight;
  engine.renderer.setSize(w, h);
  engine.composer.setSize(w, h);
  engine.iso.cam.aspect = w / h;
  engine.iso.cam.updateProjectionMatrix();
}

// ── cross-module helpers ──

import { unitWorld } from './visuals';
import { cancelTargeting } from './targeting';
import { pickTile } from './interaction';
