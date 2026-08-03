// ─────────────────────────────────────────────────────────────
// Cheat console — press ` to open, type a command, press Enter
// Uses `engine: any` to avoid circular import + private field errors.
// Engine internals will be made public in step 6 (engine.ts rewrite).
// ─────────────────────────────────────────────────────────────
import { SKILLS } from '../skills';
import type { GridPos } from '../types';
import { unitWorld } from './visuals';

/** TEMP DEBUG (press B): open the iron door, teleport the party just inside
 *  the boss room and fire the bathing-tyrant cutscene on demand. */
export function debugWarpToBoss(engine: any) {
  if (!engine.structures || engine.phase === 'menu' || engine.gameWon) return;
  const st = engine.structures;

  engine.combat.inCombat = false;
  engine.targeting = null;
  clearHighlights(engine);
  engine.busy = false;
  engine.phase = 'explore';
  engine.bossCutscenePlayed = true;

  if (engine.ironDoor && !engine.ironDoorOpen) openIronDoor(engine);
  else engine.world.blocked[st.bossDoor.x][st.bossDoor.z] = false;

  const spots: GridPos[] = [{ x: 31, z: 37 }, { x: 31, z: 39 }, { x: 32, z: 38 }, { x: 33, z: 39 }];
  engine.combat.living('party').forEach((u: any, i: number) => {
    const t = spots[i % spots.length];
    u.pos = { ...t };
    const v = engine.visuals.get(u.id);
    if (v) {
      const wp = unitWorld(engine, t);
      v.rig.group.position.copy(wp);
      v.rig.anim.mode = 'idle';
      v.proxy.position.copy(wp).y += (v.proxy.userData.yOff as number) ?? 0.9;
    }
  });

  engine.pushLog('🐞 [debug] Warped into the boss room — playing cutscene…', 'system');
  engine.selectedId = engine.combat.living('party')[0]?.id ?? engine.selectedId;
  engine.emitSnapshot();
  void playBossCutscene(engine);
}

/** parse & execute a console command string */
export function executeCheatCommand(engine: any, cmd: string) {
  if (!cmd) return;
  const parts = cmd.split(/\s+/);
  const op = parts[0];
  const arg = parts[1];
  const hero = engine.combat.living('party')[0];
  const reply = (msg: string) => { engine.pushLog(`> ${msg}`, 'system'); engine.bigMessage = msg; };

  switch (op) {
    case 'noaggro':
      engine.aggroDisabled = !engine.aggroDisabled;
      reply(`Aggro ${engine.aggroDisabled ? 'DISABLED' : 'ENABLED'}`);
      break;
    case 'godmode':
    case 'god':
      engine.godMode = !engine.godMode;
      engine.combat.godMode = engine.godMode;
      reply(`God mode ${engine.godMode ? 'ON' : 'OFF'}`);
      break;
    case 'superhero':
      if (hero) {
        hero.maxHp = 999; hero.hp = 999; hero.ac = 30;
        hero.abilities = { str: 30, dex: 30, con: 30, int: 30, wis: 30, cha: 30 };
        hero.knownSkills = Object.keys(SKILLS);
        hero.equippedSkills = Object.keys(SKILLS).slice(0, 12);
        hero.level = 20; hero.proficiency = 6; hero.moveRange = 99;
        reply('SUPERHERO! Stats maxed, all skills unlocked.');
      }
      break;
    case 'heal':
      for (const u of engine.combat.living('party')) { u.hp = u.maxHp; }
      reply('Party fully healed!');
      break;
    case 'killall':
      for (const u of engine.combat.units) { if (u.team === 'enemy') { u.alive = false; u.hp = 0; } }
      reply('All enemies slain!');
      break;
    case 'boss1':
    case 'boss':
      debugWarpToBoss(engine);
      reply('Warping to boss…');
      break;
    case 'gold':
      const amt = parseInt(arg ?? '1000', 10);
      engine.gold += isNaN(amt) ? 1000 : amt;
      reply(`+${amt} gold (total: ${engine.gold})`);
      break;
    case 'levelup':
      if (hero) {
        hero.level += 1; hero.skillPoints += 1;
        hero.maxHp += 10; hero.hp = hero.maxHp;
        reply(`Level up! Now level ${hero.level}.`);
      }
      break;
    case 'reveal':
      for (let x = 0; x < engine.explored.length; x++)
        for (let z = 0; z < engine.explored[x].length; z++)
          engine.explored[x][z] = true;
      if (engine.fogMesh) engine.fogMesh.count = 0;
      engine.fogDirty = true;
      reply('Map revealed — fog of war cleared!');
      break;
    case 'help':
      reply('Commands: noaggro, godmode, superhero, heal, killall, boss, gold [amt], levelup, help');
      break;
    default:
      reply(`Unknown command: "${op}". Type "help" for available commands.`);
      break;
  }
  engine.emitSnapshot();
  setTimeout(() => { if (engine.bigMessage) { engine.bigMessage = null; engine.emitSnapshot(); } }, 2500);
}

// ── helper re-exports (shared across engine modules) ──

export function clearHighlights(engine: any) {
  for (const h of engine.hlPool) { h.mesh.visible = false; h.cat = ''; }
}

export function openIronDoor(engine: any) {
  if (!engine.structures || !engine.ironDoor) return;
  engine.ironDoorOpen = true;
  const st = engine.structures;
  engine.world.blocked[st.bossDoor.x][st.bossDoor.z] = false;
  engine.audio.unlock(); engine.audio.door();
  const d = engine.ironDoor;
  const y0 = d.position.y;
  animateTo(engine, () => d.position.y, (v) => { d.position.y = v; }, y0 + (d.userData.openY as number), 1.5);
  engine.pushLog('🔓 The iron key turns. The great door grinds down into the floor.', 'system');
  engine.bigMessage = 'The Iron Door Opens...';
  engine.emitSnapshot();
  setTimeout(() => { engine.bigMessage = null; engine.emitSnapshot(); }, 2200);
  setTimeout(() => { if (engine.ironDoor) { engine.scene.remove(engine.ironDoor); engine.ironDoor = null; } }, 1800);
}

export function animateTo(engine: any, get: () => number, set: (v: number) => void, target: number, dur: number) {
  let t = 0; const start = get();
  engine.propAnims.push((dt: number) => {
    t = Math.min(dur, t + dt);
    const k = dur > 0 ? t / dur : 1;
    set(start + (target - start) * k);
    return t >= dur;
  });
}

async function playBossCutscene(engine: any) {
  if (!engine.cutsceneDirector) return;
  await engine.cutsceneDirector.play('gribnab');
}
