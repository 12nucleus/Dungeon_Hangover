// ─────────────────────────────────────────────────────────────
// engine/tavern — interior tavern builder ("The Dirty Mug")
// ═════════════════════════════════════════════════════════════
// Single source of truth for the intro-cutscene tavern interior.
// The engine's `_buildTavern()` is a thin wrapper around this.

import * as THREE from 'three';
import { Vox } from '../voxelModels.mjs';
import { voxelMeshC } from './voxelUtils';
import { buildCharacter, type Rig } from '../characters';
import type { ParticleSystem } from '../particles';

// ── tavern constants (grid coords; CUBE = 0.11 world units per voxel) ──
export const RX = 42;      // half-width  (~4.6 world)
export const ZB = -35;     // back wall   (~-3.85)
export const ZF = 43;      // front wall  (~4.7)
export const WH = 33;      // wall height (~3.6)

/** Everything the builder needs from the engine, passed in as callbacks so
 *  this module stays free of any GameEngine dependency. */
export interface TavernHooks {
  propAnims: ((dt: number) => boolean)[];
  particles: ParticleSystem;
  /** register a placed NPC rig with the engine (tavernRigs / tavernActors) */
  register: (rig: Rig, key?: string) => void;
  spawnDrunkStars: (rig: Rig) => void;
  /** ?debug editor mode — drops a dummy "Greg" at his intro seat */
  editorMode: boolean;
}

/**
 * Build the full interior tavern set: walls (ALL FOUR — the front wall has
 * the door + two windows the bouncer guards), floor, fixtures, NPCs, lighting.
 * Returns a single Group with a `poi` userData record of world-space camera
 * interest points used by the intro cutscene.
 */
export function buildTavern(hooks: TavernHooks): THREE.Group {
  const g = new THREE.Group();
  const CUBE = 0.11;
  const v = new Vox();     // lit voxels     (Lambert / vertex colours)
  const ev = new Vox();    // emissive voxels (flames, candles, embers)

  // -- palette (weathered, dingy - an old inn long past its prime) --
  const WOOD = 0x5a3e26, WOOD_D = 0x3a2818, WOOD_M = 0x4a3320, WOOD_L = 0x6e4e30, GRAIN = 0x2c1c10;
  const STONE = 0x4a4540, STONE_D = 0x33302c, SOOT = 0x18130f;
  const IRON = 0x26241f;
  const CLOTH_R = 0x7a2230, CLOTH_B = 0x2e5a7a;
  const BOTTLE = [0x3a6b2a, 0x6b3a2a, 0x2a4a6b, 0x6b2a55, 0x8a7a2a, 0x2a6b5a];
  const GLASS = 0xbfae8a;
  const WGLOW = 0xffcf7a;

  // per-voxel colour jitter -> organic wood/stone grain
  const jit = (c: number, amt = 0.14) => {
    const f = 1 - amt / 2 + Math.random() * amt;
    const r = Math.min(255, ((c >> 16) & 255) * f) | 0;
    const gg = Math.min(255, ((c >> 8) & 255) * f) | 0;
    const b = Math.min(255, (c & 255) * f) | 0;
    return (r << 16) | (gg << 8) | b;
  };

  // -- grid helpers (all coords are INTEGER voxels) --
  const box = (s: Vox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, amt = 0.14) => {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) s.add(x, y, z, jit(c, amt));
  };
  const cyl = (s: Vox, cx: number, cz: number, y0: number, y1: number, r: number, c: number, amt = 0.12) => {
    for (let y = y0; y <= y1; y++)
      for (let x = Math.ceil(cx - r); x <= Math.floor(cx + r); x++)
        for (let z = Math.ceil(cz - r); z <= Math.floor(cz + r); z++) {
          const dx = (x - cx) / r, dz = (z - cz) / r;
          if (dx * dx + dz * dz <= 1.05) s.add(x, y, z, jit(c, amt));
        }
  };
  const ring = (s: Vox, cx: number, cz: number, y0: number, y1: number, r: number, c: number, thick = 1.3) => {
    const inner = (r - thick) / r;
    for (let y = y0; y <= y1; y++)
      for (let x = Math.ceil(cx - r); x <= Math.floor(cx + r); x++)
        for (let z = Math.ceil(cz - r); z <= Math.floor(cz + r); z++) {
          const dx = (x - cx) / r, dz = (z - cz) / r, d = dx * dx + dz * dz;
          if (d <= 1.05 && d >= inner * inner) s.add(x, y, z, jit(c, 0.12));
        }
  };
  // a four-legged table: top slab at gy 7-8 (world ~0.77-0.99), legs to the floor
  const mkTable = (cx: number, cz: number, hw: number, hd: number) => {
    box(v, cx - hw, 7, cz - hd, cx + hw, 8, cz + hd, WOOD);
    for (const lx of [cx - hw + 1, cx + hw - 1]) for (const lz of [cz - hd + 1, cz + hd - 1]) box(v, lx - 1, 0, lz - 1, lx, 6, lz, WOOD_D);
  };
  // a bar stool: tall seat (top ~0.77) so a seated rig's feet reach the floor;
  // seated characters sit with their group origin at ~0.8 (butt height).
  const mkStool = (cx: number, cz: number) => {
    box(v, cx - 2, 5, cz - 2, cx + 2, 6, cz + 2, WOOD_L);
    for (const lx of [cx - 2, cx + 2]) for (const lz of [cz - 2, cz + 2]) box(v, lx, 0, lz, lx, 4, lz, WOOD_D);
  };

  // == FLOOR - planks (alternating tone per board) + trodden ale stains ==
  for (let z = ZB; z <= ZF; z++) {
    const board = Math.floor((z + 200) / 4);
    const base = (board & 1) ? WOOD_D : WOOD_M;
    for (let x = -RX; x <= RX; x++) v.add(x, -1, z, jit((z % 4 === 0) ? GRAIN : base, 0.22));
  }
  for (const [sx, sz, sw, sd] of [[-15, 11, 6, 5], [22, -6, 5, 4], [-26, -13, 5, 4], [6, 24, 5, 4]] as const)
    for (let x = sx - sw; x <= sx + sw; x++) for (let z = sz - sd; z <= sz + sd; z++)
      if (Math.random() < 0.6) v.add(x, -1, z, jit(GRAIN, 0.3));

  // == WALLS - back + two sides (single voxel layer) ==
  box(v, -RX, 0, ZB, RX, WH, ZB, STONE);           // back
  box(v, -RX, 0, ZB, -RX, WH, ZF, STONE);          // left
  box(v, RX, 0, ZB, RX, WH, ZF, STONE);            // right
  // dark wainscot / skirting band on every wall
  box(v, -RX, 0, ZB, RX, 8, ZB, WOOD_D);
  box(v, -RX, 0, ZB, -RX, 8, ZF, WOOD_D);
  box(v, RX, 0, ZB, RX, 8, ZF, WOOD_D);
  // vertical timber studs on the back wall (half-timbered feel)
  for (let sx = -RX + 4; sx <= RX - 4; sx += 10) box(v, sx, 0, ZB, sx + 1, WH, ZB, WOOD_M, 0.1);
  // corner posts
  for (const cx of [-RX, RX]) { box(v, cx, 0, ZB, cx, WH, ZB, WOOD_D); box(v, cx, 0, ZF - 2, cx, WH, ZF - 2, WOOD_D); }
  // soot streaks trailing down from the ceiling on the back wall
  for (const sx of [-30, -12, 30]) box(v, sx - 1, WH - 20, ZB, sx + 1, WH, ZB, SOOT, 0.2);
  // ceiling joists (chunky, gaps between for light spill)
  for (const bz of [-29, -14, 0, 14, 29]) box(v, -RX, WH - 2, bz, RX, WH, bz + 1, WOOD_D, 0.1);

  // == FRONT WALL (z=ZF) — the wall behind Greg: door + two windows ==
  // Historically this wall was "left open for the camera", which read as a
  // missing wall on every shot facing the bouncer. It is now fully built;
  // the cinematic camera is clamped INSIDE the room (h.iso.box) so it never
  // needs an open fourth wall.
  {
    // solid stone segments between door + window openings
    box(v, -RX, 0, ZF, -20, WH, ZF, STONE);
    box(v, -10, 0, ZF, -5, WH, ZF, STONE);
    box(v, 5, 0, ZF, 10, WH, ZF, STONE);
    box(v, 20, 0, ZF, RX, WH, ZF, STONE);
    // fill below + above the window openings
    box(v, -19, 0, ZF, -11, 16, ZF, STONE);
    box(v, -19, 29, ZF, -11, WH, ZF, STONE);
    box(v, 11, 0, ZF, 19, 16, ZF, STONE);
    box(v, 11, 29, ZF, 19, WH, ZF, STONE);
    // stone band above the door lintel
    box(v, -4, 16, ZF, 4, WH, ZF, STONE);
    // wainscot continues across the front wall
    box(v, -RX, 0, ZF, -20, 8, ZF, WOOD_D);
    box(v, -10, 0, ZF, -5, 8, ZF, WOOD_D);
    box(v, 5, 0, ZF, 10, 8, ZF, WOOD_D);
    box(v, 20, 0, ZF, RX, 8, ZF, WOOD_D);
    // vertical timber studs (match the back wall rhythm)
    for (const sx of [-36, -26, 26, 36]) box(v, sx, 0, ZF, sx + 1, WH, ZF, WOOD_M, 0.1);

    // -- door (x -3..3, y 1..14) + timber frame --
    box(v, -4, 0, ZF, -4, 15, ZF, WOOD);
    box(v, 4, 0, ZF, 4, 15, ZF, WOOD);
    box(v, -4, 15, ZF, 4, 15, ZF, WOOD);
    box(v, -4, 0, ZF, 4, 0, ZF, WOOD_D);
    for (let x = -3; x <= 3; x++) {
      const c = (x + 4) % 2 === 0 ? 0x2e1c0e : 0x3a2614;
      box(v, x, 1, ZF, x, 14, ZF, c);
    }
    // iron hinge straps + brass handle
    box(v, -3, 3, ZF, -3, 4, ZF, IRON);
    box(v, -3, 11, ZF, -3, 12, ZF, IRON);
    box(v, 0, 7, ZF, 1, 8, ZF, 0xccaa44);

    // -- windows (x -19..-11 and 11..19, y 17..28) --
    // warm emissive panes sit IN the wall plane; the timber frame + mullions
    // sit one voxel INSIDE the room (z=ZF-1) so nothing z-fights.
    for (const [wx0, wx1] of [[-19, -11], [11, 19]] as const) {
      box(ev, wx0 + 1, 18, ZF, wx1 - 1, 27, ZF, WGLOW, 0.05);        // glowing pane
      const fz = ZF - 1;
      box(v, wx0, 17, fz, wx0, 28, fz, WOOD);                        // frame sides
      box(v, wx1, 17, fz, wx1, 28, fz, WOOD);
      box(v, wx0, 28, fz, wx1, 28, fz, WOOD);                        // frame top
      box(v, wx0, 17, fz, wx1, 17, fz, WOOD);                        // frame sill
      box(v, wx0 + 3, 17, fz, wx0 + 3, 28, fz, WOOD);                // mullions
      box(v, wx1 - 3, 17, fz, wx1 - 3, 28, fz, WOOD);
      box(v, wx0, 22, fz, wx1, 22, fz, WOOD);                        // crossbar
    }
  }

  // == RUGS (single layer, gy 0 -> sits flush on the planks) ==
  const rug = (cx: number, cz: number, hw: number, hd: number, c: number) => {
    for (let x = cx - hw; x <= cx + hw; x++) for (let z = cz - hd; z <= cz + hd; z++) {
      const edge = x === cx - hw || x === cx + hw || z === cz - hd || z === cz + hd;
      v.add(x, 0, z, jit(edge ? ((c >> 1) & 0x7f7f7f) : c, 0.1));
    }
  };
  rug(2, 12, 15, 12, 0x5a1f2c);
  rug(-24, 24, 10, 8, 0x243a44);

  // == THE BAR - counter down the left wall, service gap for the barkeep ==
  box(v, -42 + 7, 8, -31, -33 + 7, 9, 7, WOOD_L);          // continuous bar top  -> -35 .. -26
  box(v, -41 + 7, 0, -31, -34 + 7, 7, -19, WOOD);          // body segment A     -> -34 .. -27
  box(v, -41 + 7, 0, -6, -34 + 7, 7, 7, WOOD);             // body segment B     -> -34 .. -27
  box(v, -35 + 7, 1, -31, -34 + 7, 2, 7, IRON);            // brass foot-rail    -> -28 .. -27
  box(v, -42, 14, -31, -40, 14, 7, WOOD_D);                // back shelf (upper) -> -35 .. -33
  box(v, -42, 21, -31, -40, 21, 7, WOOD_D);                // back shelf (lower) -> -35 .. -33
  // bottles on the shelves (bottoms flush on the shelf tops)
  let bi = 0;
  for (const z of [-29, -26, -23, -20, 1, 4]) { cyl(v, -41, z, 15, 18, 1.0, BOTTLE[bi % BOTTLE.length]); bi++; }
  for (const z of [-28, -24, 2, 5]) { cyl(v, -41, z, 22, 25, 1.0, BOTTLE[(bi + 2) % BOTTLE.length]); bi++; }
  // clean glasses lined up on the bar top
  for (const z of [-30, -27, 3, 6]) cyl(v, -37 + 7, z, 9, 11, 0.9, GLASS);

  // == FIREPLACE - back wall, right of centre (hearth glow behind Greg) ==
  box(v, 14, 0, ZB, 18, 22, ZB + 2, STONE);        // left jamb
  box(v, 30, 0, ZB, 34, 22, ZB + 2, STONE);        // right jamb
  box(v, 14, 18, ZB, 34, 22, ZB + 2, STONE);       // lintel
  box(v, 18, 0, ZB, 30, 18, ZB, SOOT);             // sooty back of the hearth
  box(v, 17, 0, ZB + 1, 31, 1, ZB + 3, STONE_D);   // hearth slab
  box(v, 16, 22, ZB, 32, 30, ZB, SOOT, 0.2);       // smoke stain climbing the wall
  box(v, 20, 1, ZB + 1, 28, 3, ZB + 1, WOOD);      // burning logs
  box(v, 21, 1, ZB + 2, 27, 2, ZB + 2, WOOD_D);
  // voxel flames (emissive), tapering upward
  box(ev, 20, 1, ZB + 1, 28, 4, ZB + 1, 0xff8a2a);
  box(ev, 21, 4, ZB + 1, 27, 7, ZB + 1, 0xffb84a);
  box(ev, 23, 7, ZB + 1, 25, 9, ZB + 1, 0xffd24a);

  // == HANGING BANNERS on the back wall ==
  box(v, -34, 12, ZB, -30, 26, ZB, CLOTH_R);
  box(v, -32, 10, ZB, -32, 11, ZB, CLOTH_R);       // banner point
  box(v, -10, 12, ZB, -6, 26, ZB, CLOTH_B);
  box(v, -8, 10, ZB, -8, 11, ZB, CLOTH_B);

  // == WALL SCONCES (iron bracket + voxel flame) ==
  const sconces: [number, number][] = [[-24, -3.3], [6, -3.3]];
  for (const [gx] of sconces) {
    box(v, gx - 1, 20, ZB, gx + 1, 21, ZB + 1, IRON);
    box(ev, gx, 22, ZB, gx, 24, ZB, 0xffb545);
  }

  // == CHANDELIER above Greg's table (voxel ring + candles + chain) ==
  const chCx = 0, chCz = 10, chGy = 27;
  ring(v, chCx, chCz, chGy, chGy, 7, IRON, 1.6);
  for (let a = 0; a < 6; a++) {
    const cx = Math.round(chCx + Math.cos(a / 6 * Math.PI * 2) * 6);
    const cz = Math.round(chCz + Math.sin(a / 6 * Math.PI * 2) * 6);
    box(v, cx, chGy, cz, cx, chGy + 1, cz, 0xe8e0c8);       // candle
    box(ev, cx, chGy + 2, cz, cx, chGy + 2, cz, 0xffb545);  // flame
  }
  box(v, 0, chGy + 1, chCz, 0, WH, chCz, IRON);            // chain to the ceiling

  // == FURNITURE - Greg's big table + stool, plus two occupied side tables ==
  mkTable(0, 10, 9, 5);     // Greg's table  (world centre ~ (0, ., 1.1))
  mkStool(0, 19);           // Greg's stool  (world ~ (0, ., 1.9))  +10 Z
  mkTable(24, 15, 6, 6);    // the snoozer's table (world ~ (2.6, ., 1.6))
  mkStool(24, 25);          // the snoozer's stool  +10 Z
  // barrels tucked against the right wall
  for (const [bx, bz] of [[38, -27], [39, 27]] as const) {
    cyl(v, bx, bz, 0, 8, 2.8, WOOD);
    ring(v, bx, bz, 1, 1, 3.0, IRON); ring(v, bx, bz, 7, 7, 3.0, IRON);
    box(v, bx - 2, 8, bz - 2, bx + 2, 8, bz + 2, WOOD_M);   // lid
  }

  // -- merge the voxel stores into two meshes (lit + emissive) --
  g.add(voxelMeshC(v.list(), CUBE));
  g.add(voxelMeshC(ev.list(), CUBE, true));

  // == NPCs - every rig stands at world-y 0 (feet flush on the floor) ==
  const faceYaw = (x: number, z: number, tx = 0, tz = 1.9) => Math.atan2(tx - x, tz - z);
  const addNpc = (rig: Rig, x: number, z: number, ry: number, mode: Rig['anim']['mode'], key?: string, y = 0) => {
    rig.group.position.set(x, y, z);
    rig.group.rotation.y = ry;
    rig.group.userData.baseY = y;
    rig.anim.mode = mode;
    g.add(rig.group);
    hooks.register(rig, key);
  };

  // barkeep behind the counter, wiping it in circles with a rag
  const barkeepRig = buildCharacter({ skin: 0xc98a5a, cloth: 0x2a2230, accent: 0x6b3a1a, hair: 0x20140c, hood: false, kind: 'barkeep' });
  addNpc(barkeepRig, -4.1, -1.4, Math.PI / 2, 'wipe', 'barkeep');
  // nudge the barkeep's head up 1 voxel (0.11 world units) — see headYOffset in characters.ts
  barkeepRig.anim.headYOffset = 0.11;
  // add a rag (small white cloth) to the barkeep's left hand (the side
  // facing the counter, since the barkeep is rotated PI/2)
  const handL = barkeepRig.parts.handL as THREE.Mesh | undefined;
  if (handL) {
    const rag = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.04, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xe8e0d0 })
    );
    rag.position.set(0, -0.02, 0.06);
    rag.castShadow = true;
    handL.add(rag);
  }
  // barmaid mid-floor, ready to deliver the next round
  addNpc(buildCharacter({ skin: 0xd9a066, cloth: 0xb02a2a, accent: 0x8b7355, hair: 0x8b3a2a, hood: false, kind: 'barmaid' }),
    -2.2, 0.2, faceYaw(-2.2, 0.2), 'idle', 'barmaid');
  // jumpy wizard in the back-right corner (staff, star hat, white beard)
  const wizardRig = buildCharacter({ skin: 0xf0d9b5, cloth: 0x4a2a6a, accent: 0x8a4af0, hair: 0xd0d0d0, hood: false, kind: 'wizard' }, 'staff');
  addNpc(wizardRig, 3.4, -2.8, faceYaw(3.4, -2.8), 'idle', 'wizard');
  // wizard's hat raised 1 voxel (0.11) above its original height
  wizardRig.anim.hairYOffset = 0.11;
  // wizard holds his staff in the left hand; angle the left forearm 35° (0.61 rad)
  // while the wrist counter-rotates so the staff stays vertical (see updateRig).
  wizardRig.anim.forearmLOffset = -0.61;
  // retired-orc bouncer by the door
  addNpc(buildCharacter({ skin: 0x5f7a3a, cloth: 0x2a1f1a, accent: 0x1a0f0a, hair: 0x101010, hood: false, kind: 'bouncer', bulk: 1.4 }),
    3.75, -0.1, -1.092, 'idle', 'bouncer');
  // a patron nursing a drink by the fire
  addNpc(buildCharacter({ skin: 0x8a6a4a, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a, hood: false, style: 'normal' }),
    1.3, -2.5, faceYaw(1.3, -2.5), 'cross', 'patron');
  // a patron lying asleep at the side table (comic background)
  const snoozerRig = buildCharacter({ skin: 0x9a7a55, cloth: 0x3a4a5a, accent: 0x2a2a2a, hair: 0x140f0f, hood: false, style: 'normal' });
  addNpc(snoozerRig, -0.8, -2.35, 1.708, 'sleep', 'snoozer', -0.65);
  hooks.spawnDrunkStars(snoozerRig);

  // two beer bottles on the floor next to the snoozer (one upright, one tipped over)
  {
    const BOTTLE_G = 0x2a6a3a, BOTTLE_D = 0x1a4a2a;
    // upright bottle
    const upB = new THREE.Group();
    const bodyU = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), new THREE.MeshLambertMaterial({ color: BOTTLE_G }));
    bodyU.position.y = 0.11; bodyU.castShadow = true;
    const neckU = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.035), new THREE.MeshLambertMaterial({ color: BOTTLE_D }));
    neckU.position.y = 0.25;
    upB.add(bodyU, neckU);
    upB.position.set(-0.55, 0, -2.15);
    g.add(upB);
    // tipped-over bottle (lying on its side)
    const sideB = new THREE.Group();
    const bodyS = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), new THREE.MeshLambertMaterial({ color: BOTTLE_G }));
    bodyS.rotation.z = Math.PI / 2; bodyS.position.x = 0.11; bodyS.castShadow = true;
    const neckS = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.035), new THREE.MeshLambertMaterial({ color: BOTTLE_D }));
    neckS.rotation.z = Math.PI / 2; neckS.position.x = 0.25;
    sideB.add(bodyS, neckS);
    sideB.position.set(-0.45, 0.06, -2.55);
    sideB.rotation.y = 0.4;
    g.add(sideB);
  }

  // == LIGHTING - hearth (flickering), chandelier, sconces, soft fill ==
  const fireLight = new THREE.PointLight(0xffa040, 11, 11, 1.8); fireLight.position.set(2.6, 1.0, -3.4); g.add(fireLight);
  const chandLight = new THREE.PointLight(0xffd9a0, 14, 16, 1.5); chandLight.position.set(0, 2.7, 1.1); g.add(chandLight);
  for (const [gx, wz] of sconces) { const l = new THREE.PointLight(0xffb060, 5, 6, 1.7); l.position.set(gx * CUBE, 2.5, wz + 0.2); g.add(l); }
  g.add(new THREE.AmbientLight(0xfff0dd, 0.5));
  // warm spill from the two front-wall windows + a small light over the door
  for (const wx of [-15 * CUBE, 15 * CUBE]) {
    const wl = new THREE.PointLight(WGLOW, 3, 4, 1.7); wl.position.set(wx, 2.4, (ZF - 2) * CUBE); g.add(wl);
  }
  const doorLight = new THREE.PointLight(WGLOW, 2, 3.5, 1.7); doorLight.position.set(0, 1.0, (ZF - 2) * CUBE); g.add(doorLight);

  // hearth flicker + rising embers (runs only while the tavern exists)
  let fireT = 0;
  hooks.propAnims.push((dt: number) => {
    if (!g.parent) return true;   // tavern removed from the scene -> stop
    fireT += dt;
    fireLight.intensity = 11 * (0.78 + Math.sin(fireT * 13) * 0.14 + Math.random() * 0.12);
    if (Math.random() < dt * 7) hooks.particles.burst({
      pos: new THREE.Vector3(2.6, 0.7, -3.5), count: 2,
      color: [0xff8a2a, 0xffd24a, 0xffae3a], speed: [0.3, 1.3], life: [0.4, 0.9],
      size: [0.06, 0.18], gravity: -1.4, up: 1.6, drag: 0.6, endScale: 0.1,
    });
    return false;
  });

  // points of interest for the cutscene camera (world coords)
  g.userData.poi = {
    gregSeat: new THREE.Vector3(0, 0.8, 2.0),
    gregHead: new THREE.Vector3(0, 2.05, 2.0),
    table: new THREE.Vector3(0, 0.95, 1.1),
    bar: new THREE.Vector3(-3.6, 1.2, -1.0),
    fire: new THREE.Vector3(2.6, 1.3, -3.5),
    wizard: new THREE.Vector3(3.4, 1.35, -2.8),
    bouncer: new THREE.Vector3(3.4, 1.25, 3.2),
    barmaid: new THREE.Vector3(-2.2, 1.2, 0.2),
    door: new THREE.Vector3(0, 1.0, (ZF - 1) * CUBE),
  };

  // == EDITOR-ONLY: dummy "Greg" at his intro starting position ==
  // In ?debug mode the real hero rig isn't placed (the intro director never
  // runs), so we drop a stand-in at Greg's starting tile (0, 2) facing
  // Math.PI — the exact addNpc line the intro should use — so the position
  // is visible and tunable via the DebugPanel. Registered as the 'greg'
  // tavern actor so its x/y/z/yaw show up in the actor list and the
  // "Copy addNpc line" button emits a pasteable coordinate.
  if (hooks.editorMode) {
    addNpc(buildCharacter(
      { skin: 0xf0d9b5, cloth: 0x4a4a2a, accent: 0x2a2a2a, hair: 0x3a2a1a, hood: false, style: 'normal' },
    ), 0, 2, Math.PI, 'idle', 'greg');
  }

  return g;
}
