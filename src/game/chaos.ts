// ─────────────────────────────────────────────────────────────
// Floor chaos — seeded, authored vignettes placed per run.
// Layout/quests stay authored; this picks WHICH extra beats fire
// and WHERE, so two playthroughs diverge.
// Tones: scare (audio-first), absurd, ambush, serious.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { FX } from './particles';
import { makeItem } from './items';
import { SUMMON_TEMPLATES } from './skills';
import { PROP_TO_ITEM } from './improvised';
import type { GridPos, Unit } from './types';
import type { Interactable } from './engine/interactables';
import type { LevelDef } from '../levels/levelTypes';
import type { ParticleSystem } from './particles';

export type ChaosTone = 'scare' | 'absurd' | 'ambush' | 'serious';

interface ChaosBeat {
  id: string;
  tone: ChaosTone;
  rooms: string[];
  title: string;
  text: string;
  sfx: 'sting' | 'scream' | 'splash' | 'squeak' | 'roar' | 'none';
  spawn?: 'rats2' | 'leech' | 'goblin';
  grant?: string[];
}

/** Minimal engine surface the director touches. */
export interface ChaosHost {
  runSeed: number;
  flags: Set<string>;
  interactables: Interactable[];
  combat: {
    inCombat: boolean;
    living(team: 'party' | 'enemy'): Unit[];
    summon(unit: Unit, pos: GridPos): Unit | null;
    start(): unknown;
  };
  world: {
    waterTiles: boolean[][] | null;
    tileToWorld(x: number, z: number, out?: THREE.Vector3): THREE.Vector3;
    hidePropAt?(x: number, z: number): void;
  } | null;
  audio: {
    jumpScare?(v?: number): void;
    distantScream?(v?: number): void;
    waterStep?(v?: number): void;
    echoFoot?(v?: number): void;
    setAmbienceWet?(wet: boolean): void;
    splash(v?: number): void;
    squeak(v?: number): void;
    roar(v?: number): void;
  };
  iso: { shake: number };
  particles: ParticleSystem;
  busy?: boolean;
  cinematic?: boolean;
  gameWon?: boolean;
  bigMessage?: string | null;
  roomOf?(x: number, z: number): string | null;
  setFlag(flag: string): void;
  pushLog(text: string, kind?: string): void;
  narrate?(id: string, text: string, minMs?: number): Promise<void>;
  grantLoot(items: unknown[], gold: number): void;
  addUnit(u: Unit): void;
  enqueue(ev: unknown): void;
  emitSnapshot(): void;
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const BEATS: ChaosBeat[] = [
  {
    id: 'grate_slam', tone: 'scare', rooms: ['r3', 'r7', 'r11', 'r19'],
    title: 'The grate remembers you',
    text: 'A grate slams overhead. Something wet lands behind you. Nothing there. Then the dripping starts matching your heartbeat.',
    sfx: 'sting',
  },
  {
    id: 'pipe_voice', tone: 'scare', rooms: ['r8', 'r14', 'r11'],
    title: 'A pipe says your name',
    text: 'A scream travels the length of a pipe and comes out next to your ear. It is not an echo of you. It used your name.',
    sfx: 'scream',
  },
  {
    id: 'corpse_courtesy', tone: 'scare', rooms: ['r3', 'r7', 'r12', 'r23'],
    title: 'The body sits up',
    text: 'A body in the water sits up, looks at your underwear, and lies back down. It is done with this. You are not.',
    sfx: 'sting',
  },
  {
    id: 'torch_gutter', tone: 'scare', rooms: ['r3', 'r11', 'r15', 'r19'],
    title: 'The dark takes a turn',
    text: 'Your light gutters. In the dark, something breathes that is not you. The torch comes back embarrassed. The breathing does not leave.',
    sfx: 'sting',
  },
  {
    id: 'duck_court', tone: 'absurd', rooms: ['r6', 'r18', 'r20', 'r14'],
    title: 'The tribunal convenes',
    text: 'Three rubber ducks have formed a semicircle on a crate. They find you guilty of being sober-adjacent. Sentence: take one of them with you.',
    sfx: 'squeak', grant: ['rubber_duck'],
  },
  {
    id: 'towel_golem', tone: 'absurd', rooms: ['r6', 'r10', 'r14', 'r22'],
    title: 'A towel stands at attention',
    text: 'A wet towel stands up, salutes, and collapses. You may take it. It has served. It will serve again, poorly.',
    sfx: 'splash', grant: ['towel'],
  },
  {
    id: 'soap_rat', tone: 'absurd', rooms: ['r8', 'r13', 'r14'],
    title: 'A cleaner citizen',
    text: 'A pipe drips strawberry soap onto a passing rat. The rat is cleaner than you and it knows. It leaves a chunk as tribute. Or as an insult.',
    sfx: 'squeak', grant: ['soap_chunk'],
  },
  {
    id: 'bone_dice', tone: 'absurd', rooms: ['r15', 'r19', 'r6'],
    title: 'The game is still going',
    text: 'Skeleton hands are still mid-game. The dice say you should not have come. The dice are not wrong. One of them is a blessed penny.',
    sfx: 'none', grant: ['blessed_penny'],
  },
  {
    id: 'grate_rats', tone: 'ambush', rooms: ['r7', 'r11', 'r12'],
    title: 'The ceiling was occupied',
    text: 'The grate above you was not empty. It is empty now. The emptiness has teeth and it is on the floor with you.',
    sfx: 'squeak', spawn: 'rats2',
  },
  {
    id: 'leech_hug', tone: 'ambush', rooms: ['r7', 'r12', 'r23'],
    title: 'The water hugs back',
    text: 'The water hugs your calf. It has teeth. It would like to keep the calf. You would like to keep the calf. This is a negotiation.',
    sfx: 'splash', spawn: 'leech',
  },
  {
    id: 'lost_goblin', tone: 'ambush', rooms: ['r18', 'r20', 'r8'],
    title: 'Wrong door',
    text: 'A goblin rounds the corner looking for the latrine. He finds you instead. The silence is the longest anyone has been honest today.',
    sfx: 'roar', spawn: 'goblin',
  },
  {
    id: 'courier', tone: 'serious', rooms: ['r7', 'r12', 'r19', 'r23'],
    title: 'A letter home',
    text: 'A drowned courier still holds a letter. The ink ran, but not the last line: I am coming home. Tell her I kept the ring. The ring is gone. The promise is not.',
    sfx: 'none',
  },
  {
    id: 'tally', tone: 'serious', rooms: ['r15', 'r16', 'r19'],
    title: 'Forty-seven marks',
    text: 'Someone counted days on the wall. They stopped at forty-seven. The last mark is smaller. You do not add a forty-eighth.',
    sfx: 'none',
  },
  {
    id: 'agnes', tone: 'serious', rooms: ['r2', 'r16', 'r20'],
    title: 'A name under the waterline',
    text: 'A name is carved under the waterline. Agnes. The Hermit is not the only one missing a piece. You put your hand on the letters. They are cold. They were always cold.',
    sfx: 'none',
  },
];

const LARGE_ROOMS: Record<string, true> = { r5: true, r7: true, r12: true, r15: true, r23: true, r25: true };
const WATER_ROOMS: Record<string, true> = { r3: true, r7: true, r12: true, r23: true };

interface Pending {
  at: number;
  beat: ChaosBeat;
  pos: GridPos;
}

export class FloorChaos {
  private readonly host: ChaosHost;
  private readonly rng: () => number;
  private readonly assigned = new Map<string, ChaosBeat>();
  private pending: Pending | null = null;
  private lastPos: GridPos | null = null;
  private quiet = 0;
  private lastEvent = -999;
  private clock = 0;

  constructor(host: ChaosHost, seed: number) {
    this.host = host;
    this.rng = mulberry32(seed ^ 0xc0a5);
  }

  install(level: LevelDef) {
    this.placeBeats();
    this.installPickups(level);
  }

  private beatTaken(id: string): boolean {
    for (const b of this.assigned.values()) if (b.id === id) return true;
    return false;
  }

  private placeBeats() {
    const byTone: Record<ChaosTone, ChaosBeat[]> = { scare: [], absurd: [], ambush: [], serious: [] };
    for (const b of BEATS) byTone[b.tone].push(b);

    const plan: ChaosTone[] = ['scare', 'absurd', 'serious', 'ambush'];
    if (this.rng() < 0.55) plan.push('scare');
    if (this.rng() < 0.45) plan.push('absurd');
    if (this.rng() < 0.35) plan.push('ambush');
    if (this.rng() < 0.4) plan.push('serious');

    const takenRooms = new Set<string>();
    for (const tone of plan) {
      const left = byTone[tone].filter((b) => !this.beatTaken(b.id));
      if (!left.length) continue;
      const beat = left[Math.floor(this.rng() * left.length)];
      const rooms = beat.rooms.filter((r) => !takenRooms.has(r) && r !== 'r1' && r !== 'r25' && r !== 'r5');
      if (!rooms.length) continue;
      const room = rooms[Math.floor(this.rng() * rooms.length)];
      this.assigned.set(room, beat);
      takenRooms.add(room);
    }
  }

  private installPickups(level: LevelDef) {
    const candidates = level.props.filter((p) => PROP_TO_ITEM[p.kind]);
    const seen = new Set<string>();
    const picked: typeof candidates = [];
    const order = candidates.slice().sort((a, b) => (a.x * 13 + a.z) - (b.x * 13 + b.z));
    for (const p of order) {
      const tile = `${p.x},${p.z}`;
      if (seen.has(tile)) continue;
      if (this.rng() > 0.22 && picked.length > 8) continue;
      seen.add(tile);
      picked.push(p);
      if (picked.length >= 16) break;
    }
    const extras: Interactable[] = picked.map((p, i) => {
      const baseId = PROP_TO_ITEM[p.kind];
      const noun = p.kind.replace(/_/g, ' ');
      return {
        id: `pickup_${p.kind}_${i}`,
        pos: { x: p.x, z: p.z },
        radius: 1,
        label: `[R] Pick up the ${noun}`,
        once: true,
        run: (e) => {
          e.grantLoot([makeItem(baseId)], 0);
          this.host.world?.hidePropAt?.(p.x, p.z);
          e.pushLog(`You take the ${noun}. It will fit somewhere. Everything fits somewhere, if you are willing to be wrong.`, 'system');
        },
      };
    });
    if (extras.length) this.host.interactables = [...this.host.interactables, ...extras];
  }

  onRoomEnter(roomId: string, pos: GridPos) {
    if (this.host.combat.inCombat || this.host.busy || this.host.gameWon) return;
    const beat = this.assigned.get(roomId);
    if (!beat) return;
    if (this.host.flags.has(`chaos_${beat.id}`)) return;
    this.pending = { at: this.clock + 1.6, beat, pos };
  }

  tick(dt: number) {
    this.clock += dt;
    const leader = this.host.combat.living('party')[0];
    if (!leader || this.host.busy || this.host.cinematic || this.host.gameWon) return;

    this.stepAudio(leader.pos);

    if (this.pending && this.clock >= this.pending.at) {
      const p = this.pending;
      this.pending = null;
      if (!this.host.combat.inCombat) this.fire(p.beat, p.pos);
    }

    this.quiet += dt;
    if (this.quiet > 38 && this.clock - this.lastEvent > 22 && !this.host.combat.inCombat) {
      if (this.rng() < dt * 0.04) {
        this.host.audio.distantScream?.(0.55);
        this.host.pushLog('A scream, far down the pipe. Not yours. Not yet.', 'system');
        this.quiet = 0;
        this.lastEvent = this.clock;
      }
    }
  }

  private stepAudio(pos: GridPos) {
    const moved = !this.lastPos || this.lastPos.x !== pos.x || this.lastPos.z !== pos.z;
    if (!moved) return;
    this.lastPos = { x: pos.x, z: pos.z };
    const wet = !!this.host.world?.waterTiles?.[pos.x]?.[pos.z];
    const roomId = this.host.roomOf?.(pos.x, pos.z) ?? null;
    if (wet) {
      this.host.audio.waterStep?.(0.7 + this.rng() * 0.25);
      const wp = this.worldPos(pos);
      if (wp) FX.waterSplash(this.host.particles, wp);
    } else if (roomId && LARGE_ROOMS[roomId] && this.rng() < 0.35) {
      this.host.audio.echoFoot?.(0.45);
    }
    this.host.audio.setAmbienceWet?.(!!(roomId && WATER_ROOMS[roomId]));
  }

  private fire(beat: ChaosBeat, pos: GridPos) {
    this.host.setFlag(`chaos_${beat.id}`);
    this.lastEvent = this.clock;
    this.quiet = 0;

    const wp = this.worldPos(pos) ?? new THREE.Vector3();
    if (beat.sfx === 'sting') this.host.audio.jumpScare?.(1);
    else if (beat.sfx === 'scream') this.host.audio.distantScream?.(0.9);
    else if (beat.sfx === 'splash') this.host.audio.splash(0.85);
    else if (beat.sfx === 'squeak') this.host.audio.squeak(0.9);
    else if (beat.sfx === 'roar') this.host.audio.roar(0.55);

    globalThis.setTimeout(() => {
      this.host.iso.shake = Math.max(this.host.iso.shake, beat.tone === 'scare' ? 0.55 : 0.22);
      if (beat.tone === 'scare') FX.scareFlash(this.host.particles, wp);
      else FX.motes(this.host.particles, wp, beat.tone === 'serious' ? 0x8aa0b8 : 0xf0c070);
    }, 180);

    this.host.bigMessage = beat.title;
    this.host.emitSnapshot();
    globalThis.setTimeout(() => {
      if (this.host.bigMessage === beat.title) {
        this.host.bigMessage = null;
        this.host.emitSnapshot();
      }
    }, 2200);

    this.host.pushLog(beat.text, 'system');
    void this.host.narrate?.(`chaos_${beat.id}`, beat.text, 4200);

    if (beat.grant?.length) {
      this.host.grantLoot(beat.grant.map((id) => makeItem(id)), 0);
    }
    if (beat.spawn && !this.host.combat.inCombat) {
      globalThis.setTimeout(() => this.spawn(beat.spawn!, pos), 420);
    }
  }

  private spawn(kind: NonNullable<ChaosBeat['spawn']>, pos: GridPos) {
    if (this.host.combat.inCombat || this.host.busy) return;
    const add = (unit: Unit) => {
      this.host.combat.summon(unit, pos);
      this.host.addUnit(unit);
    };
    if (kind === 'rats2') {
      add(SUMMON_TEMPLATES.small_rat());
      add(SUMMON_TEMPLATES.small_rat());
    } else if (kind === 'leech') {
      const l = SUMMON_TEMPLATES.small_rat();
      l.name = 'Sewer Leech';
      l.title = 'Uninvited Hug';
      l.onHit = { condition: 'bleeding', chance: 1, rounds: 2, saveAbility: 'con', saveDC: 10 };
      add(l);
    } else {
      add(SUMMON_TEMPLATES.goblin_guard());
    }
    this.host.enqueue(this.host.combat.start());
  }

  private worldPos(pos: GridPos): THREE.Vector3 | null {
    if (!this.host.world) return null;
    return this.host.world.tileToWorld(pos.x, pos.z).clone().add(new THREE.Vector3(0, 1.1, 0));
  }
}
