// ─────────────────────────────────────────────────────────────
// engine/tavern — interior tavern builder
// ═════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Vox } from '../characters/vox';
import { VOX_C } from './voxelUtils';
import { buildCharacter, type Rig } from '../characters';

// ── tavern constants ──
export const RX = 42;      // half-floor width (±42 studs)
export const ZB = -35;     // back wall z
export const ZF = 43;      // front wall z
export const WH = 33;      // wall height

const STONE = 0x6b5b4f, STONE_D = 0x4a3d35;
const WOOD = 0x6d4f32, WOOD_D = 0x4a3420, WOOD_L = 0x8a6d4f;
const FLOOR = 0x5a3e26, FLOOR_D = 0x3a2818;
const TABLE = 0x5a3e26, STOOL = 0x3a2818;
const WARM = 0xffcf7a, FIRE = 0xff6a20;
const WGLOW = 0xffcf7a;

/**
 * Build the full interior tavern set: walls, floor, fixtures, NPCs, lighting.
 * Returns a single Group containing everything, with a `poi` userData record
 * of camera interest points used by the intro cutscene.
 */
export function buildTavern(
  propAnims: ((dt: number) => boolean)[],
  addNpc: (rig: Rig, x: number, z: number, ry: number, mode: Rig['anim']['mode'], key?: string, y?: number) => void,
): THREE.Group {
  const g = new THREE.Group();
  const poi: Record<string, THREE.Vector3> = {};

  const jit = (c: number, amt = 0.14) => {
    const r = () => (Math.random() - 0.5) * amt;
    return c + r();
  };
  const box = (s: Vox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, amt = 0.14) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) s.add(x, y, z, jit(c, amt));
  };
  const cyl = (s: Vox, cx: number, cz: number, y0: number, y1: number, r: number, c: number, amt = 0.12) => {
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (x * x + z * z <= r * r + 0.5)
      for (let y = y0; y <= y1; y++) s.add(cx + x, y, cz + z, jit(c, amt));
  };

  const mkTable = (cx: number, cz: number, hw: number, hd: number) => {
    const t = new Vox(VOX_C);
    t.add(cx, 2, cz, TABLE);
    for (let x = cx - hw + 1; x <= cx + hw - 1; x++) for (let z = cz - hd + 1; z <= cz + hd - 1; z++) t.add(x, 4, z, TABLE);
    t.add(cx, 5, cz, TABLE);
    t.add(cx - hw + 1, 0, cz - hd + 1, STOOL); t.add(cx + hw - 1, 0, cz - hd + 1, STOOL);
    t.add(cx - hw + 1, 0, cz + hd - 1, STOOL); t.add(cx + hw - 1, 0, cz + hd - 1, STOOL);
    t.add(cx - hw + 1, 1, cz - hd + 1, STOOL); t.add(cx + hw - 1, 1, cz - hd + 1, STOOL);
    t.add(cx - hw + 1, 1, cz + hd - 1, STOOL); t.add(cx + hw - 1, 1, cz + hd - 1, STOOL);
    g.add(t.mesh());
  };
  const mkStool = (cx: number, cz: number) => {
    const s = new Vox(VOX_C);
    s.add(cx, 0, cz, STOOL); s.add(cx, 1, cz, STOOL); s.add(cx, 2, cz, STOOL);
    s.add(cx, 3, cz, STOOL);
    g.add(s.mesh());
  };

  // ── floor ──
  {
    const v = new Vox(VOX_C);
    for (let x = -RX; x <= RX; x++) for (let z = ZB + 1; z <= ZF - 1; z++) v.add(x, -1, z, jit(FLOOR));
    g.add(v.mesh());
    const beam = new Vox(VOX_C);
    for (let x = -RX; x <= RX; x += 5) for (let z = ZB + 1; z <= ZF - 1; z++) beam.add(x, 0, z, FLOOR_D);
    g.add(beam.mesh());
  }

  // ── back wall (ZB) ──
  {
    const v = new Vox(VOX_C);
    box(v, -RX, 0, ZB, RX, WH, ZB, STONE);
    box(v, -RX, 0, ZB, RX, 8, ZB, WOOD_D);
    box(v, -16, 0, ZB, -10, 18, ZB, STONE_D);
    box(v, -14, 18, ZB, -12, 24, ZB, STONE_D);
    g.add(v.mesh());
  }

  // ── hearth: stone hood + fire ──
  {
    const h = new Vox(VOX_C);
    box(h, -17, 0, ZB - 3, -9, 2, ZB - 3, STONE);
    box(h, -16, 2, ZB - 1, -10, 4, ZB - 1, STONE);
    box(h, -15, 4, ZB, -11, 6, ZB, STONE_D);
    box(h, -15, 2, ZB, -11, 2, ZB, WOOD_D);
    const fireGlow = new THREE.PointLight(FIRE, 0.9, 6, 1.6);
    fireGlow.position.set(-13, 2, ZB - 0.5);
    g.add(fireGlow);
    g.add(h.mesh());
    const log = new Vox(VOX_C);
    log.add(-14, 3, ZB, WOOD_D); log.add(-13, 3, ZB, WOOD_D); log.add(-12, 3, ZB, WOOD_D);
    g.add(log.mesh());
    propAnims.push(() => { fireGlow.intensity = 0.55 + Math.random() * 0.5; return false; });
  }

  // ── left wall (x=RX, z ZB..ZF) ──
  {
    const v = new Vox(VOX_C);
    box(v, RX, 0, ZB, RX, WH, ZF, STONE);
    box(v, RX, 0, ZB, RX, 8, ZF, WOOD_D);
    g.add(v.mesh());
  }

  // ── right wall (x=-RX, z ZB..ZF) ──
  {
    const v = new Vox(VOX_C);
    box(v, -RX, 0, ZB, -RX, WH, ZF, STONE);
    box(v, -RX, 0, ZB, -RX, 8, ZF, WOOD_D);
    g.add(v.mesh());
  }

  // ── FRONT WALL (z=ZF) with door + two windows ──
  {
    const v = new Vox(VOX_C);
    box(v, -RX, 0, ZF, -20, WH, ZF, STONE);
    box(v, -10, 0, ZF, -5, WH, ZF, STONE);
    box(v, 5, 0, ZF, 10, WH, ZF, STONE);
    box(v, 20, 0, ZF, RX, WH, ZF, STONE);

    // door frame
    box(v, -4, 0, ZF, -4, 15, ZF, WOOD);
    box(v, 4, 0, ZF, 4, 15, ZF, WOOD);
    box(v, -4, 15, ZF, 4, 15, ZF, WOOD);
    box(v, -4, 0, ZF, 4, 0, ZF, WOOD_D);

    // door planks
    for (let x = -3; x <= 3; x++) {
      const c = (x + 4) % 2 === 0 ? 0x2e1c0e : 0x3a2614;
      box(v, x, 1, ZF, x, 14, ZF, c);
    }
    box(v, -3, 3, ZF, -3, 4, ZF, 0x444444);
    box(v, -3, 11, ZF, -3, 12, ZF, 0x444444);
    box(v, 0, 7, ZF, 1, 8, ZF, 0xccaa44);

    // wainscot
    box(v, -RX, 0, ZF, -20, 8, ZF, WOOD_D);
    box(v, -10, 0, ZF, -5, 8, ZF, WOOD_D);
    box(v, 5, 0, ZF, 10, 8, ZF, WOOD_D);
    box(v, 20, 0, ZF, RX, 8, ZF, WOOD_D);

    // corner posts
    box(v, -RX, 0, ZF, -RX, WH, ZF, WOOD);
    box(v, RX, 0, ZF, RX, WH, ZF, WOOD);
    box(v, -20, 0, ZF, -20, WH, ZF, WOOD);
    box(v, -10, 0, ZF, -10, WH, ZF, WOOD);
    box(v, 5, 0, ZF, 5, WH, ZF, WOOD);
    box(v, 10, 0, ZF, 10, WH, ZF, WOOD);
    box(v, 20, 0, ZF, 20, WH, ZF, WOOD);

    // LEFT WINDOW: x:-19..-11, y:18..28
    box(v, -19, 17, ZF, -19, 28, ZF, WOOD);
    box(v, -11, 17, ZF, -11, 28, ZF, WOOD);
    box(v, -19, 28, ZF, -11, 28, ZF, WOOD);
    box(v, -19, 17, ZF, -11, 17, ZF, WOOD);
    box(v, -17, 18, ZF, -17, 27, ZF, WOOD);
    box(v, -15, 18, ZF, -15, 27, ZF, WOOD);
    box(v, -13, 18, ZF, -13, 27, ZF, WOOD);
    box(v, -19, 22, ZF, -11, 22, ZF, WOOD);
    box(v, -19, 25, ZF, -11, 25, ZF, WOOD);

    // RIGHT WINDOW: x:11..19, y:18..28
    box(v, 11, 17, ZF, 11, 28, ZF, WOOD);
    box(v, 19, 17, ZF, 19, 28, ZF, WOOD);
    box(v, 11, 28, ZF, 19, 28, ZF, WOOD);
    box(v, 11, 17, ZF, 19, 17, ZF, WOOD);
    box(v, 13, 18, ZF, 13, 27, ZF, WOOD);
    box(v, 15, 18, ZF, 15, 27, ZF, WOOD);
    box(v, 17, 18, ZF, 17, 27, ZF, WOOD);
    box(v, 11, 22, ZF, 19, 22, ZF, WOOD);
    box(v, 11, 25, ZF, 19, 25, ZF, WOOD);

    g.add(v.mesh());

    // window glow
    const glowMat = new THREE.MeshBasicMaterial({ color: WGLOW, transparent: true, opacity: 0.35 });
    const glowL = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 0.3), glowMat);
    glowL.position.set(-15, 22.5, ZF + 0.15);
    g.add(glowL);
    const glowR = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 0.3), glowMat);
    glowR.position.set(15, 22.5, ZF + 0.15);
    g.add(glowR);

    const wLightL = new THREE.PointLight(WGLOW, 0.6, 10, 1.6);
    wLightL.position.set(-15, 22, ZF + 0.5);
    g.add(wLightL);
    const wLightR = new THREE.PointLight(WGLOW, 0.6, 10, 1.6);
    wLightR.position.set(15, 22, ZF + 0.5);
    g.add(wLightR);
  }

  // ── pillars ──
  {
    const v = new Vox(VOX_C);
    for (const [px, pz] of [[-20, 20], [20, 20], [-20, -10], [20, -10], [-20, -20], [20, -20]]) {
      cyl(v, px, pz, 0, WH, 2, STONE);
    }
    g.add(v.mesh());
  }

  // ── ceiling beams ──
  {
    const v = new Vox(VOX_C);
    for (let z = ZB + 1; z <= ZF - 1; z += 6) for (let x = -RX; x <= RX; x++) v.add(x, WH, z, WOOD_D);
    for (let x = -RX; x <= RX; x += 8) for (let z = ZB + 1; z <= ZF - 1; z++) v.add(x, WH, z, WOOD_D);
    box(v, -RX, WH, ZB, RX, WH, ZB, WOOD);
    box(v, -RX, WH, ZF, RX, WH, ZF, WOOD);
    box(v, RX, WH, ZB, RX, WH, ZF, WOOD);
    box(v, -RX, WH, ZB, -RX, WH, ZF, WOOD);
    g.add(v.mesh());
  }

  // ── tables + stools ──
  for (const [tx, tz, hw, hd] of [[-17, -8, 3, 2], [-17, 4, 3, 2], [14, -8, 3, 2], [14, 4, 3, 2], [-5, -8, 4, 2], [0, 20, 3, 2], [-5, 20, 3, 2], [5, 20, 3, 2]] as const) {
    mkTable(tx, tz, hw, hd);
    mkStool(tx - hw, tz - hd - 1); mkStool(tx + hw, tz - hd - 1);
    mkStool(tx - hw, tz + hd + 1); mkStool(tx + hw, tz + hd + 1);
  }

  // ── bar counter ──
  {
    const v = new Vox(VOX_C);
    box(v, -35, 6, -14, -24, 6, 12, WOOD_L);
    box(v, -35, 0, 12, -24, 6, 12, WOOD_D);
    box(v, -35, 6, -15, -24, 7, -14, WOOD_L);
    box(v, -35, 6, 12, -24, 7, 12, WOOD_L);
    box(v, -35, 8, -15, -24, 8, 12, WOOD);
    const bc = [0x8a2a2a, 0x2a6a2a, 0x2a2a6a, 0x6a2a6a, 0x6a6a2a, 0x2a6a6a];
    for (let i = 0; i < 6; i++) {
      const bx = -33 + i * 2; v.add(bx, 9, -10, bc[i]); v.add(bx, 9, -8, bc[(i + 2) % 6]);
      v.add(bx, 10, -10, bc[(i + 1) % 6]); v.add(bx, 10, -8, bc[(i + 3) % 6]);
    }
    g.add(v.mesh());
  }

  // ── wall sconces (candles) ──
  {
    for (const [sx, sz] of [[-26, ZB], [-6, ZB], [14, ZB], [-36, -2], [-36, 6], [30, ZB], [30, -14], [30, 4]]) {
      const sg = new THREE.Group();
      const sconceMat = new THREE.MeshLambertMaterial({ color: 0x3a2818 });
      const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), sconceMat);
      sconce.position.set(0, -0.05, 0);
      sg.add(sconce);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8844 });
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.15), flameMat);
      flame.position.set(0, 0.18, 0);
      sg.add(flame);
      const cLight = new THREE.PointLight(WARM, 0.25, 4, 1.6);
      cLight.position.set(0, 0.15, 0);
      sg.add(cLight);
      sg.position.set(sx, 10, sz);
      g.add(sg);
      propAnims.push(() => { cLight.intensity = 0.15 + Math.random() * 0.18; return false; });
    }
  }

  // ── chandelier ──
  {
    const ch = new THREE.Group();
    const chMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), chMat);
    ch.add(chain);
    const ring2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.8), chMat);
    ring2.position.y = -0.6; ch.add(ring2);
    for (const [cx, cz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const candle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), new THREE.MeshLambertMaterial({ color: 0xddd4c0 }));
      candle.position.set(cx, -0.8, cz); ch.add(candle);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0xff8844 }));
      fl.position.set(cx, -0.65, cz); ch.add(fl);
    }
    ch.position.set(0, WH - 1, 0);
    g.add(ch);
    const chLight = new THREE.PointLight(WARM, 0.4, 7, 1.6);
    chLight.position.set(0, WH - 1.5, 0);
    g.add(chLight);
    propAnims.push(() => { chLight.intensity = 0.25 + Math.random() * 0.25; return false; });
  }

  // ── rugs ──
  const rug = (cx: number, cz: number, hw: number, hd: number, c: number) => {
    const v = new Vox(VOX_C);
    for (let x = cx - hw; x <= cx + hw; x++) for (let z = cz - hd; z <= cz + hd; z++)
      v.add(x, 2, z, c);
    g.add(v.mesh());
  };
  rug(-13, -22, 5, 4, 0x7a2a1a);
  rug(-5, 18, 4, 3, 0x1a2a5a);
  rug(-29, -2, 4, 5, 0x2a5a2a);

  // ── NPCs ──
  const addNpcScheme = (scheme: Record<string, any>, x: number, z: number, ry: number, mode: Rig['anim']['mode'], key?: string) => {
    addNpc(buildCharacter(scheme as any), x, z, ry, mode, key);
  };
  addNpcScheme({ skin: 0xdeb070, hair: 0x2a1a0a, shirt: 0x6a3a2a, pants: 0x4a2a1a, boots: 0x3a1a0a, accent: 0x8a6a3a }, -28, -6, 0, 'idle', 'barmaid');
  addNpcScheme({ skin: 0xe0c8a0, hair: 0x5a3a1a, shirt: 0x4a3a8a, pants: 0x2a1a3a, boots: 0x3a2a1a, accent: 0xaa8833 }, -16, 4, 1.2, 'sit', 'wizard');
  addNpcScheme({ skin: 0xc0a080, hair: 0x1a0a0a, shirt: 0x3a2a1a, pants: 0x2a1a0a, boots: 0x1a0a0a, accent: 0x8a6a4a, hood: true }, -17, -8, 1.5, 'sit', 'patron1');
  addNpcScheme({ skin: 0xd4b896, hair: 0x8a4a1a, shirt: 0x5a3a2a, pants: 0x3a2a1a, boots: 0x2a1a0a, accent: 0xaa8844 }, 14, -8, -0.8, 'sit', 'patron2');
  addNpcScheme({ skin: 0xc8b098, hair: 0x4a2a1a, shirt: 0x3a1a1a, pants: 0x2a1a0a, boots: 0x1a0a0a, accent: 0x886644 }, 14, 4, -1.5, 'sit', 'patron3');
  addNpcScheme({ skin: 0xc8a888, hair: 0x0a0a0a, shirt: 0x2a1a0a, pants: 0x1a0a0a, boots: 0x0a0a0a, accent: 0x886644 }, -4, ZF - 3, 0, 'cross', 'bouncer');
  addNpcScheme({ skin: 0xd4b896, hair: 0x6a3a1a, shirt: 0x4a2a1a, pants: 0x3a1a0a, boots: 0x2a1a0a, accent: 0xaa8844 }, -25, -9, 0.6, 'wipe', 'barkeep');

  // ── Greg's special table ──
  mkTable(0, 18, 3, 2);

  // ── poi (camera interest points) ──
  poi.gregSeat = new THREE.Vector3(0, 0.8, 18);
  poi.gregHead = new THREE.Vector3(0, 1.55, 18);
  poi.barmaid = new THREE.Vector3(-28, 0.9, -6);
  poi.wizard = new THREE.Vector3(-16, 0.8, 4);
  poi.bouncer = new THREE.Vector3(-4, 0.8, ZF - 3);
  // FIX 3: door poi — used by the intro cutscene to face the front wall
  // when it pans to show the door + windows. Z=ZF places it on the wall;
  // Y=2.5 is roughly at door-handle height.
  poi.doorZ = new THREE.Vector3(0, 2.5, ZF - 1);

  g.userData.poi = poi;
  return g;
}
