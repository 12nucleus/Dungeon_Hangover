// ─────────────────────────────────────────────────────────────
// Game flow — startGame, enterDungeon, enterEditorMode, selectSkill,
// endTurn, save/load, continueAfterVictory, toggleMute, etc.
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { skillById } from '../skillLookup';
import { setWeapon } from '../characters';
import { SaveManager, SettingsManager, SAVE_VERSION_NUMBER } from '../save';
import type { GameSettings, SaveData } from '../save';
import { unitWorld } from './visuals';
import { clearHighlights, showTargeting } from './targeting';
import { attachHeroTorch } from './dungeonSetup';
import { runTitleNarration } from '../cutscenes/index';

// ══ start / explore ════════════════════════════════════════
export function startGame(engine: any) {
  void engine.audio.init();
  engine.audio.resume();
  engine.applyAudioSettings();
  if (!engine.introPlayed) {
    engine.phase = 'menu';
    engine.busy = true;
    void engine.playTitleSequence();
    return;
  }
  engine.phase = 'explore';
  engine.selectedId = engine.combat.living('party')[0]?.id ?? null;
  engine.pushLog('You descend into the Warlord\'s Warren, torch in hand... (click to move, Q/E rotate, wheel zoom)', 'system');
  engine.emitSnapshot();
}

export function enterDungeon(engine: any) {
  void engine.audio.init();
  engine.audio.resume();
  engine.applyAudioSettings();
  if (!engine.titleExt || !engine.cutsceneHost) return;
  const ext = engine.titleExt;
  const prevBg = engine.titlePrevBg;
  engine.titleExt = null;
  engine.titlePrevBg = null;
  void runTitleNarration(engine.cutsceneHost, ext, prevBg);
}

export function enterEditorMode(engine: any) {
  void engine.audio.init();
  engine.applyAudioSettings();
  if (!engine.cutsceneHost) return;
  engine.editorMode = true;
  if (engine.titleExt) {
    engine.scene.remove(engine.titleExt);
    if (engine.titlePrevBg) { engine.scene.background = engine.titlePrevBg; engine.titlePrevBg = null; }
    engine.titleExt = null;
    engine.titleIdle = false;
  }
  engine.inTavern = true;
  engine.world.group.visible = false;
  engine.props.group.visible = false;
  for (const [, v] of engine.visuals) v.rig.group.visible = false;
  engine.tavern = engine._buildTavern();
  engine.scene.add(engine.tavern);
  engine.scene.fog = new THREE.Fog(0x140d08, 6, 26);
  const poi = (engine.tavern.userData as { poi?: Record<string, THREE.Vector3> }).poi;
  if (poi?.gregHead) {
    engine.iso.lerp = 2.0;
    engine.iso.desiredYaw = -Math.PI * 0.22;
    engine.iso.desiredPitch = 0.44;
    engine.iso.desiredDist = 5.4;
    engine.iso.focus(poi.gregHead);
  } else {
    engine.iso.lerp = 2.0;
    engine.iso.desiredYaw = -Math.PI * 0.22;
    engine.iso.desiredPitch = 0.44;
    engine.iso.desiredDist = 5.4;
    engine.iso.focus(new THREE.Vector3(0, 1, 1.1));
  }
  engine.busy = false;
  engine.introActive = false;
  engine.emitSnapshot();
}

export function getEditorHandles(engine: any) {
  if (!engine.editorFocusTarget) engine.editorFocusTarget = new THREE.Vector3(0, 1, 0);
  return {
    iso: engine.iso,
    tavern: engine.tavern,
    tavernActors: engine.tavernActors,
    tavernRigs: engine.tavernRigs,
    focusTarget: engine.editorFocusTarget,
    buildTavern: () => engine._buildTavern(),
    swapTavern: (g: THREE.Group) => {
      if (engine.tavern) engine.scene.remove(engine.tavern);
      engine.tavern = g;
      engine.scene.add(g);
      engine.tavernRigs = (g.userData as { rigs?: any[] }).rigs ?? [];
    },
  };
}

// ══ skill selection ════════════════════════════════════════
export function selectSkill(engine: any, skillId: string | null) {
  const active = engine.combat.active;
  if (!active || active.team !== 'party' || engine.busy) return;
  if (!skillId) { engine.cancelTargeting(); return; }
  if (engine.phase !== 'combat') {
    engine.setHoverInfoOnce('Skills can only be used in combat.');
    return;
  }
  const s = skillById(skillId);
  if (!s) { engine.setHoverInfoOnce('Unknown skill.'); return; }
  const deny = engine.combat.canUse(active, s);
  if (deny) { engine.setHoverInfoOnce(deny); return; }
  engine.audio.play('ui_click', 0.6);
  if (s.kind === 'buff' || s.selfCentered || s.selfOnly || s.allAllies) {
    engine.audio.play('dice', 0.7);
    engine.enqueue(engine.combat.useSkill(active, s.id, active.pos));
    return;
  }
  engine.targeting = skillId;
  showTargeting(engine, s, active);
  engine.emitSnapshot();
}

export function endTurn(engine: any) {
  if (engine.phase !== 'combat' || engine.busy) return;
  const a = engine.combat.active;
  if (!a || a.team !== 'party') return;
  engine.audio.play('ui_click', 0.7);
  engine.targeting = null;
  clearHighlights(engine);
  engine.enqueue(engine.combat.endTurn());
}

// ══ game state ═════════════════════════════════════════════
export function continueAfterVictory(engine: any) {
  engine.phase = 'explore';
  engine.pushLog('The shrine falls quiet. The realm is yours to wander.', 'system');
  engine.emitSnapshot();
}

export function toggleMute(engine: any) {
  const m = engine.audio.toggleMute();
  engine.settings.muted = m;
  SettingsManager.save(engine.settings);
  engine.emitSnapshot();
  return m;
}

export function setSettings(engine: any, s: GameSettings) {
  engine.settings = { ...s };
  SettingsManager.save(engine.settings);
  engine.applyAudioSettings();
  engine.emitSnapshot();
}

export function setPaused(engine: any, b: boolean) {
  if (engine.paused === b) return;
  engine.paused = b;
  if (b) engine.keys.clear();
  engine.emitSnapshot();
}

export function togglePause(engine: any) {
  if (engine.phase === 'menu') return;
  setPaused(engine, !engine.paused);
}

// ══ save / load ════════════════════════════════════════════
export function deleteSlot(engine: any, slotId: string) {
  SaveManager.delete(slotId);
  if (engine.currentSlotId === slotId) engine.currentSlotId = null;
}

export function startNewGame(engine: any, slotId: string) {
  engine.currentSlotId = slotId;
  engine.clearLoot?.();   // a fresh run starts with no loot offers
  enterDungeon(engine);
}

export function saveGame(engine: any, slotId?: string, label?: string) {
  const id = slotId ?? engine.currentSlotId;
  if (!id) return;
  const data: SaveData = {
    version: SAVE_VERSION_NUMBER,
    slotId: id,
    name: label ?? partyName(engine),
    timestamp: Date.now(),
    floor: engine.floorNumber ?? 50,
    units: engine.combat.units.map((u: any) => clone(u)),
    gold: engine.gold,
    inventory: engine.inventory.map((i: any) => clone(i)),
    questStates: engine.questLog.statesEntries(),
    bonfirePos: engine.bonfirePos ? { ...engine.bonfirePos } : null,
    bonfireLit: engine.bonfireLit,
    defeatedSpecialMobs: [...engine.defeatedSpecialMobs],
    explored: engine.explored.map((r: any) => [...r]),
    combat: {
      turnOrder: [...engine.combat.turnOrder],
      activeIdx: engine.combat.activeIdx,
      round: engine.combat.round,
      inCombat: engine.combat.inCombat,
      phase: engine.combat.phase,
    },
    selectedId: engine.selectedId,
    phase: engine.phase,
    flags: engine.flags ? [...engine.flags] : [],
    runSeed: engine.runSeed,
    runStats: engine.runStats ? { ...engine.runStats } : undefined,
  };
  SaveManager.save(id, data);
  engine.pushLog('💾 Game saved.', 'system');
  engine.bigMessage = 'Game Saved';
  engine.emitSnapshot();
  setTimeout(() => {
    if (engine.bigMessage === 'Game Saved') { engine.bigMessage = null; engine.emitSnapshot(); }
  }, 1500);
}

export function loadGame(engine: any, slotId: string): boolean {
  const data = SaveManager.load(slotId);
  if (!data) return false;
  engine.currentSlotId = slotId;
  engine.clearLoot?.();   // loot offers aren't persisted — drop stale ones

  if (engine.titleExt) { engine.scene.remove(engine.titleExt); engine.titleExt = null; }
  if (engine.titlePrevBg) { engine.scene.background = engine.titlePrevBg; engine.titlePrevBg = null; }
  if (engine.tavern) { engine.scene.remove(engine.tavern); engine.tavern = null; }
  engine.titleIdle = false;

  engine.combat.units = data.units.map((u: any) => clone(u));
  engine.gold = data.gold;
  engine.inventory = data.inventory.map((i: any) => clone(i));
  engine.questLog.load(data.questStates);
  engine.bonfirePos = data.bonfirePos ? { ...data.bonfirePos } : null;
  engine.bonfireLit = data.bonfireLit;
  engine.defeatedSpecialMobs = new Set(data.defeatedSpecialMobs);
  engine.explored = data.explored.map((r: any) => [...r]);
  if (data.flags) engine.flags = new Set(data.flags);
  if (data.runSeed) engine.runSeed = data.runSeed;
  if (data.runStats) engine.runStats = { ...engine.runStats, ...data.runStats };
  if (data.floor) engine.floorNumber = data.floor;
  engine.combat.turnOrder = [...data.combat.turnOrder];
  engine.combat.activeIdx = data.combat.activeIdx;
  engine.combat.round = data.combat.round;
  engine.combat.inCombat = data.combat.inCombat;
  engine.combat.phase = data.combat.phase;
  engine.selectedId = data.selectedId;
  engine.phase = data.phase;

  engine.world.group.visible = true;
  engine.props.group.visible = true;
  repositionAllVisuals(engine);
  if (engine.bonfireLit) spawnBonfireFlame(engine);

  engine.introPlayed = true;
  engine.introActive = false;
  engine.introSkipped = false;
  engine.inTavern = false;
  engine.busy = false;
  engine.cinematic = false;
  engine.clearCine();
  engine.fadeTo(0);
  engine.iso.lerp = 7;
  void engine.audio.init();
  engine.audio.resume();
  engine.applyAudioSettings();
  engine.audio.stopTavernMusic();
  engine.audio.playMusic('music_ambient');

  const hero = engine.combat.living('party')[0];
  if (hero) {
    const hv = engine.visuals.get(hero.id);
    if (hv) {
      hv.rig.anim.crouch = 0; hv.rig.anim.flinch = 0;
      hv.rig.group.rotation.set(0, Math.PI, 0);
      hv.yaw = hv.targetYaw = Math.PI;
      if (hero.weapon) setWeapon(hv.rig, hero.weapon, hero.scheme.accent);
      if (!engine.heroLight) attachHeroTorch(engine, hv.rig);
    }
    engine.iso.box = null;
    const hp = unitWorld(engine, hero.pos);
    engine.iso.focus(hp);
    engine.iso.target.copy(hp);
  }
  engine.selectedId = engine.selectedId ?? hero?.id ?? null;

  engine.pushLog('Save loaded — welcome back, adventurer.', 'system');
  engine.emitSnapshot();
  return true;
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function partyName(engine: any): string {
  const leader = engine.combat.living('party')[0];
  return leader ? leader.name : 'Adventurer';
}

function repositionAllVisuals(engine: any) {
  for (const [id, v] of engine.visuals) {
    const u = engine.byId(id);
    if (!u) continue;
    const wp = unitWorld(engine, u.pos);
    v.rig.group.position.copy(wp);
    v.rig.group.userData.baseY = wp.y;
    v.rig.group.visible = true;
    v.rig.anim.mode = u.alive ? 'idle' : 'dead';
    v.rig.anim.t = 0;
    v.yaw = v.targetYaw = u.team === 'party' ? Math.PI : 0;
    v.rig.group.rotation.y = v.yaw;
    v.bar.style.display = u.alive ? 'block' : 'none';
  }
}

export function spawnBonfireFlame(engine: any) {
  if (!engine.bonfireGroup) return;
  if (engine.bonfireGroup.getObjectByName('bf_light')) return;
  const FLAME_COLOR = 0xffb545;
  const CORE_COLOR = 0xff7a1f;
  engine.bonfireGroup.userData.lit = true;
  const flameMat = new THREE.MeshLambertMaterial({ color: FLAME_COLOR, emissive: CORE_COLOR, emissiveIntensity: 0.9 });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const e = new THREE.Euler();
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + 0.3;
    const sx = Math.cos(angle) * 0.12;
    const sz = Math.sin(angle) * 0.12;
    e.set(i * 0.2, angle, 0);
    m4.compose(new THREE.Vector3(sx, 0.42, sz), q.setFromEuler(e), sc.set(0.20, 0.36, 0.10));
    const im = new THREE.InstancedMesh(geo, flameMat, 1);
    im.setMatrixAt(0, m4);
    im.name = 'bf_flame';
    engine.bonfireGroup.add(im);
  }
  const light = new THREE.PointLight(0xff9540, 26, 16, 1.7);
  light.position.set(0, 0.7, 0);
  light.name = 'bf_light';
  engine.bonfireGroup.add(light);
}
