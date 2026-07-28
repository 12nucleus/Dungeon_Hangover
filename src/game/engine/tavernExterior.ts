// ─────────────────────────────────────────────────────────────
// engine/tavernExterior — exterior tavern building (street-side view)
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox } from '../voxelModels.mjs';
import { VOX_C, voxelMesh, extGlow, voxTree, voxBush } from './voxelUtils';

/** Build the cosy night-time tavern exterior seen from the street */
export function buildTavernExterior(propAnims: ((dt: number) => boolean)[]): THREE.Group {
  const g = new THREE.Group();
  const C = VOX_C;
  const v = new Vox();    // lit voxels
  const gv = new Vox();   // emissive voxels (windows, moon, accents)

  // ── palette (weathered, dingy — old tavern long past its prime) ──
  const TIMBER = 0x4a3526, TIMBER_D = 0x2e1d12;
  const PLAS = 0x9a8a66, PLAS_D = 0x7a6a4e, PLAS_STAIN = 0x5a4a36, PLAS_GRIME = 0x6a5a44;
  const ROOF = 0x5a2620, ROOF_D = 0x3a1810, ROOF_HI = 0x6e2f26, ROOF_BROKEN = 0x2a1208;
  const DOOR = 0x2e1c0e, DOOR_HI = 0x3a2614;
  const IRON = 0x23231f, IRON_RUST = 0x5a3a22;
  const WGLOW = 0xffcf7a;
  const STONE = 0x4a4550, STONE_D = 0x2e2a34, STONE_HI = 0x5a5560;
  const TRUNK = 0x3a2818, TRUNK_D = 0x221408;
  const LEAF = 0x2e4a22, LEAF_HI = 0x3a5a2a;
  const BUSH = 0x3a4a22, BUSH_HI = 0x4a5a2a, BUSH_DEAD = 0x6a5a3a;
  const MOON_C = 0xf0e8c0;
  const SIGN = 0x4a2e16, SIGN_D = 0x2e1a0a, SIGN_G = 0xb88a2a, SIGN_LETTER = 0xe8c87a;
  const FENCE = 0x3a2818, FENCE_HI = 0x4a3320, FENCE_ROT = 0x2a1a0c;
  const COB = 0x6a5a48, COB_HI = 0x7a6a58, PUDDLE = 0x2a2a30;
  const MOSS = 0x3a4a2a, MOSS_D = 0x2a3a1e;

  // ── building dims (voxels; C = 0.055) ──
  const HW = 24;   // half-width
  const WH = 36;   // wall height
  const HD = 18;   // half-depth
  const EO = 5;    // eave overhang
  const RH = 52;   // ridge height

  // ══ 1. GROUND + COBBLE PATH ══
  v.box(-6, 1, 11, 6, 1, 16, COB);
  for (let z = 11; z <= 16; z++)
    for (const sx of [-5, -3, -1, 1, 3, 5]) if ((sx + z) % 2 === 0) v.add(sx, 2, z, COB_HI);
  v.box(-3, 1, HD - 2, 3, 1, HD, COB_HI);

  // ══ 2. PLASTER WALLS ══
  v.box(-HW, 0, HD, HW, WH, HD, PLAS);
  v.box(-HW, 0, -HD, HW, WH, -HD, PLAS_D);
  v.box(-HW, 0, -HD, -HW, WH, HD, PLAS);
  v.box(HW, 0, -HD, HW, WH, HD, PLAS);
  for (let x = -HW + 2; x <= HW - 2; x += 3) {
    const streakLen = 6 + ((x * 7) & 7);
    for (let y = 0; y < streakLen; y++) v.add(x, WH - 1 - y, HD, (y & 1) ? PLAS_GRIME : PLAS_STAIN);
  }
  for (let x = -18; x <= -12; x++) for (let y = 0; y < 6; y++) v.add(x, y, HD, PLAS_STAIN);
  for (let x = 12; x <= 18; x++) for (let y = 0; y < 5; y++) v.add(x, y, HD, PLAS_GRIME);
  for (let z = -HD + 2; z < HD - 2; z += 4) { v.add(-HW, 0, z, MOSS); v.add(-HW, 1, z, MOSS_D); v.add(HW, 0, z, MOSS); v.add(HW, 1, z, MOSS_D); }

  // ══ 3. TIMBER FRAME ══
  v.box(-HW, 0, HD, -HW + 1, WH, HD, TIMBER);
  v.box(HW - 1, 0, HD, HW, WH, HD, TIMBER);
  v.box(-HW, 0, -HD, -HW + 1, WH, -HD, TIMBER);
  v.box(HW - 1, 0, -HD, HW, WH, -HD, TIMBER);
  v.box(-10, 0, HD, -9, WH, HD, TIMBER);
  v.box(9, 0, HD, 10, WH, HD, TIMBER);
  v.box(-HW, WH - 1, HD, HW, WH, HD, TIMBER);
  v.box(-HW, 14, HD, HW, 15, HD, TIMBER);
  v.box(-HW, 0, HD, HW, 1, HD, TIMBER_D);
  for (let i = 0; i < 7; i++) {
    v.add(-HW + 1 + i, 1 + i, HD, TIMBER);
    v.add(HW - 1 - i, 1 + i, HD, TIMBER);
  }

  // ══ 4. GABLE ROOF + OVERHANG ══
  for (let z = -(HD + EO); z <= HD + EO; z++) {
    const t = Math.abs(z) / (HD + EO);
    const h = Math.round(WH + (RH - WH) * (1 - t));
    v.box(-(HW + EO), WH - 1, z, HW + EO, h, z, (z & 1) ? ROOF : ROOF_D);
  }
  v.box(-(HW + EO), RH, -2, HW + EO, RH + 1, 2, ROOF_HI);
  const broken = [[-14, 40], [-6, 44], [8, 38], [16, 46], [0, 50], [-18, 42], [12, 48]];
  for (const [bx, by] of broken) {
    v.add(bx, by, HD - 4, ROOF_BROKEN); v.add(bx + 1, by, HD - 4, ROOF_BROKEN);
    v.add(bx, by + 1, HD - 5, ROOF_BROKEN);
    if ((bx & 1) === 0) { v.add(bx, by - 1, HD - 3, MOSS); v.add(bx + 1, by - 1, HD - 3, MOSS_D); }
  }
  for (let z = -10; z <= -4; z++) v.add(-HW + 4, WH + 8, z, ROOF_BROKEN);

  // ══ 5. STONE CHIMNEY ══
  const chimX = HW - 3;
  for (let y = WH + 4; y < RH - 2; y++)
    v.box(chimX, y, HD - 6, chimX + 4, y + 1, HD - 2, (y & 1) ? STONE : STONE_D);
  v.box(chimX - 1, RH - 3, HD - 7, chimX + 5, RH - 2, HD - 1, STONE_HI);
  v.box(chimX, RH - 2, HD - 6, chimX + 4, RH - 1, HD - 2, STONE_D);
  v.box(chimX + 1, RH - 2, HD - 5, chimX + 3, RH - 1, HD - 3, 0x0a0808);
  g.userData.chimneyTop = new THREE.Vector3((chimX + 2) * C, (RH - 1) * C, (HD - 4) * C);

  // ══ 6. WOODEN DOOR ══
  const DW = 4, DH = 14;
  v.box(-DW, 1, HD + 1, DW, 1 + DH, HD + 1, DOOR);
  v.box(-DW - 1, 0, HD + 1, -DW - 1, 1 + DH, HD + 1, TIMBER);
  v.box(DW + 1, 0, HD + 1, DW + 1, 1 + DH, HD + 1, TIMBER);
  v.box(-DW - 1, 1 + DH, HD + 1, DW + 1, 2 + DH, HD + 1, TIMBER);
  v.box(-DW + 1, 1, HD + 1, DW - 1, 1 + DH, HD + 1, DOOR_HI);
  for (const hy of [3, 8]) {
    gv.add(-DW + 1, hy, HD + 2, IRON);
    v.add(DW - 1, hy, HD + 2, IRON);
  }
  gv.add(DW - 2, 6, HD + 2, SIGN_G);

  // ══ 7. GLOWING WINDOWS ══
  for (const wx of [-15, 15]) {
    const ww = 4, wh2 = 5;
    v.box(wx - ww - 1, 18, HD + 1, wx + ww + 1, 18 + wh2 * 2 - 1, HD + 1, TIMBER);
    gv.box(wx - ww, 19, HD + 2, wx + ww, 18 + wh2 * 2 - 2, HD + 2, WGLOW);
    v.box(wx - 1, 18, HD + 2, wx + 1, 18, HD + 2, TIMBER);
    v.box(wx, 18, HD + 2, wx, 18 + wh2 * 2 - 1, HD + 2, TIMBER);
    v.box(wx - ww, 18 + wh2 - 1, HD + 2, wx + ww, 18 + wh2 - 1, HD + 2, TIMBER);
    v.box(wx - ww - 1, 17, HD + 1, wx + ww + 1, 18, HD + 1, TIMBER_D);
  }

  // ══ 8. SWINGING SIGN ══
  const signPoleY = 1 + DH + 16;
  const signPoleZ = HD + 1;
  v.box(-6, signPoleY, signPoleZ, 6, signPoleY, signPoleZ, TIMBER);
  v.box(-6, signPoleY, signPoleZ, -5, signPoleY + 3, signPoleZ + 3, TIMBER_D);
  v.box(5, signPoleY, signPoleZ, 6, signPoleY + 3, signPoleZ + 3, TIMBER_D);
  v.box(-6, signPoleY + 3, signPoleZ + 3, 6, signPoleY + 3, signPoleZ + 4, TIMBER);
  v.add(-5, signPoleY + 2, signPoleZ + 3, IRON_RUST); v.add(5, signPoleY + 2, signPoleZ + 3, IRON_RUST);

  const sv = new Vox();
  const sgv = new Vox();
  const BW = 10, BH = 5;
  sv.box(-BW, -BH, 0, BW, BH, 1, SIGN);
  sv.box(-BW, -BH, 0, -BW, BH, 1, SIGN_D);
  sv.box(BW, -BH, 0, BW, BH, 1, SIGN_D);
  sv.box(-BW, -BH, 0, BW, -BH, 1, SIGN_D);
  sv.box(-BW, BH, 0, BW, BH, 1, SIGN_D);
  sv.add(-3, 1, 0, SIGN_D); sv.add(2, 3, 0, SIGN_D); sv.add(-1, -2, 0, SIGN_D);
  sv.box(-6, -1, 0, -2, 0, 1, PLAS_STAIN);
  const letter = (cx: number, cy: number, pattern: number[][]) => {
    for (let r = 0; r < pattern.length; r++) for (let c = 0; c < pattern[r].length; c++)
      if (pattern[r][c]) sgv.add(cx + c, cy + (pattern.length - 1 - r), 2, SIGN_LETTER);
  };
  const F: Record<string, number[][]> = {
    T: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
    H: [[1,0,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
    E: [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
    M: [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]],
    U: [[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
    G: [[1,1,1],[1,0,0],[1,0,1],[1,0,1],[1,1,1]],
    D: [[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
    I: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
    R: [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
    Y: [[1,0,1],[1,0,1],[0,1,0],[0,1,0],[0,1,0]],
  };
  const charW = (ch: string) => (ch === 'M' ? 5 : 3);
  const wordWidth = (text: string) => {
    let w = 0;
    for (const ch of text) { if (ch === ' ') { w += 3; continue; } w += charW(ch) + 1; }
    return w - 1;
  };
  const drawWord = (text: string, startX: number, cy: number) => {
    let x = startX;
    for (const ch of text) {
      if (ch === ' ') { x += 3; continue; }
      if (F[ch]) letter(x, cy, F[ch]);
      x += charW(ch) + 1;
    }
  };
  drawWord('THE DIRTY', Math.round(-wordWidth('THE DIRTY') / 2), 2);
  drawWord('MUG', Math.round(-wordWidth('MUG') / 2), -6);

  const signBoard = new THREE.Group();
  signBoard.add(voxelMesh(sv.list()));
  if (sgv.size > 0) {
    const lettersMesh = voxelMesh(sgv.list(), true);
    lettersMesh.scale.setScalar(0.5);
    lettersMesh.position.set(0, 0, 0.5 * C);
    signBoard.add(lettersMesh);
  }
  const boardPivotY = (signPoleY + 2) * C;
  signBoard.position.set(0, boardPivotY, (signPoleZ + 3) * C);
  signBoard.children.forEach((c) => { c.position.y -= BH * C; });
  g.add(signBoard);
  g.userData.signBoardWp = new THREE.Vector3(0, (signPoleY + 2 - BH) * C, (signPoleZ + 3) * C);
  g.userData.signBoard = signBoard;
  let swayT = Math.random() * 10;
  propAnims.push((dt: number) => {
    if (!g.parent) return true;
    swayT += dt;
    signBoard.rotation.z = Math.sin(swayT * 0.9) * 0.06 + Math.sin(swayT * 0.37) * 0.03;
    return false;
  });

  // ══ 9. TREES ══
  const treeHash = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const treeInBuilding = (x: number, z: number) =>
    x > -HW - 6 && x < HW + 6 && z > -HD - 6 && z < HD + 4;
  const treeOnRoad = (x: number, z: number) => x > -10 && x < 10 && z > 9 && z < 33;
  for (let gx = -64; gx <= 64; gx += 18) {
    for (let gz = -64; gz <= 40; gz += 18) {
      const id = gx * 131 + gz * 17;
      if (treeHash(id) > 0.55) continue;
      const tx = gx + Math.round((treeHash(id + 1) - 0.5) * 4);
      const tz = gz + Math.round((treeHash(id + 2) - 0.5) * 4);
      if (treeInBuilding(tx, tz) || treeOnRoad(tx, tz)) continue;
      const sc = 0.8 + treeHash(id + 3) * 0.5;
      voxTree(v, tx, tz, sc, TRUNK, TRUNK_D, LEAF, LEAF_HI);
    }
  }

  // ══ 10. BUSHES ══
  voxBush(v, -20, 22, 3, BUSH, BUSH_HI);
  voxBush(v, 22, -16, 3, BUSH_DEAD, BUSH);
  voxBush(v, 0, -18, 2, BUSH_DEAD, BUSH_DEAD);
  voxBush(v, -28, -12, 2, BUSH, BUSH_HI);
  voxBush(v, 28, 16, 2, BUSH_DEAD, BUSH);
  voxBush(v, -15, -22, 2, BUSH_DEAD, BUSH_DEAD);
  v.box(-2, 1, 13, 2, 1, 16, PUDDLE);
  v.add(0, 1, 14, COB_HI); v.add(-1, 1, 15, COB);

  // ══ 11. FENCE ══
  for (let side = -1; side <= 1; side += 2) {
    const fx = side * 8;
    for (let i = 0; i < 3; i++) {
      const fz = 11 + i * 3;
      const rotten = (i + (side > 0 ? 1 : 0)) % 3 === 0;
      v.box(fx, 0, fz, fx + 1, rotten ? 4 : 6, fz + 1, rotten ? FENCE_ROT : FENCE);
      if (i < 3 && !rotten) {
        const nx = fx + (side < 0 ? 1 : 0);
        v.box(nx, 3, fz + 1, nx, 3, fz + 3, FENCE_HI);
        if (i % 2 === 0) v.box(nx, 5, fz + 1, nx, 5, fz + 3, FENCE_HI);
      }
    }
  }

  // ══ 12. CRESCENT MOON ══
  const moonX = -46, moonY = 118;
  const R = 9, r = 8, offX = 3.8;
  for (let z = -1; z <= 1; z++) {
    for (let y = moonY - R - 1; y <= moonY + R + 1; y++) {
      for (let x = moonX - R - 1; x <= moonX + R + 1; x++) {
        const dO = Math.hypot(x - moonX, y - moonY);
        const dI = Math.hypot(x - (moonX + offX), y - moonY);
        if (dO <= R && dI > r) gv.add(x, y, z, MOON_C);
      }
    }
  }
  extGlow(g, 0xf0e8c0, moonX * C, moonY * C, 0, 0, 10, 2.0);

  // ══ BUILD MESHES ══
  g.add(voxelMesh(v.list()));
  if (gv.size > 0) g.add(voxelMesh(gv.list(), true));

  // ══ LIGHTS ══
  for (const wx of [-15, 15]) extGlow(g, 0xffb060, wx * C, 24 * C, (HD + 2) * C, 2.5, 7, 1.0);
  const moonDir = new THREE.DirectionalLight(0x9fb4e6, 0.5); moonDir.position.set(moonX * C, moonY * C, 0); g.add(moonDir);
  g.add(new THREE.AmbientLight(0x1a1a3a, 0.35));

  return g;
}
