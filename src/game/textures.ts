// ─────────────────────────────────────────────────────────────
// Procedural pixel-art textures. Every block face is painted on a
// 64×64 canvas with a seeded RNG so the world looks hand-crafted
// but ships with zero image assets.
// Expansion: swap any painter for an <img>-based CanvasTexture to
// use external art (see EXPANSION_GUIDE.md § Art Pipeline).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Painter = (ctx: CanvasRenderingContext2D, rnd: () => number, S: number) => void;

function makeTexture(name: string, painter: Painter, size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry32([...name].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  painter(ctx, rnd, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function noiseFill(ctx: CanvasRenderingContext2D, rnd: () => number, S: number, base: string, shades: string[], cell = 4) {
  px(ctx, 0, 0, S, S, base);
  for (let y = 0; y < S; y += cell)
    for (let x = 0; x < S; x += cell)
      if (rnd() < 0.55) px(ctx, x, y, cell, cell, shades[Math.floor(rnd() * shades.length)]);
}

const painters: Record<string, Painter> = {
  grass_top(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#4e8c3a', ['#5da344', '#437c31', '#69b153', '#3c7029']);
    for (let i = 0; i < 26; i++) { // blades of grass
      const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S);
      px(ctx, x, y, 2, 4 + Math.floor(rnd() * 4), rnd() < 0.5 ? '#76c15e' : '#8fd16e');
    }
  },
  grass_side(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#6b4a2e', ['#7a5536', '#5d4027', '#835f3c']);
    px(ctx, 0, 0, S, 14, '#4e8c3a');
    for (let x = 0; x < S; x += 4) {
      const d = 10 + Math.floor(rnd() * 10);
      px(ctx, x, 0, 4, d, rnd() < 0.5 ? '#5da344' : '#437c31');
    }
  },
  dirt(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#6b4a2e', ['#7a5536', '#5d4027', '#835f3c', '#54371f']);
    for (let i = 0; i < 10; i++) px(ctx, rnd() * S, rnd() * S, 3, 3, '#8d6a45');
  },
  stone(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#8d8d94', ['#7d7d85', '#9c9ca4', '#74747c']);
    ctx.strokeStyle = '#63636b'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { // cracks
      ctx.beginPath();
      let x = rnd() * S, y = rnd() * S;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 24; y += rnd() * 14; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  brick(ctx, rnd, S) {
    px(ctx, 0, 0, S, S, '#6e5a4c');
    const rows = 4, bh = S / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (S / 4);
      for (let cx = -1; cx < 3; cx++) {
        const shade = ['#8a7360', '#7d6755', '#94806c'][Math.floor(rnd() * 3)];
        px(ctx, cx * (S / 2) + off + 2, r * bh + 2, S / 2 - 4, bh - 4, shade);
        px(ctx, cx * (S / 2) + off + 2, r * bh + 2, S / 2 - 4, 3, '#a3907b');
      }
    }
  },
  sand(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#d9c07a', ['#cdb26b', '#e5cd8c', '#c2a75e']);
  },
  wood(ctx, rnd, S) {
    px(ctx, 0, 0, S, S, '#7a5230');
    for (let x = 0; x < S; x += 8) {
      px(ctx, x, 0, 2, S, '#5f3e22');
      for (let i = 0; i < 5; i++) px(ctx, x + 3 + rnd() * 3, rnd() * S, 2, 6 + rnd() * 10, '#8d6238');
    }
  },
  leaves(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#2f6b2a', ['#3a7d33', '#265a22', '#47913d', '#1f4d1b']);
    for (let i = 0; i < 14; i++) px(ctx, rnd() * S, rnd() * S, 3, 3, '#55a348');
  },
  water(ctx, rnd, S) {   // teal-shifted so dungeon pools read wet, not sky-blue
    noiseFill(ctx, rnd, S, '#2b7a94', ['#276f88', '#348ea6', '#215f76'], 8);
    for (let i = 0; i < 8; i++) px(ctx, rnd() * S, rnd() * S, 10 + rnd() * 14, 2, '#84cbd6');
  },
  snow(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#e8edf2', ['#dde4ec', '#f4f7fa', '#cfd8e2']);
  },
  // ── CONTRAST PASS (floor-50 readability): cave surfaces were so dark
  // they crushed to black under the dungeon's dim ambient. Bases are
  // lifted ~25% and the shade lists spread WIDER in value so a 64px tile
  // still reads as texture (and as a tile boundary) at game scale.
  cave_stone(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#484852', ['#37373f', '#5a5a66', '#41414b', '#30303a']);
    ctx.strokeStyle = '#24242e'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = rnd() * S, y = rnd() * S;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (rnd() - 0.5) * 20; y += rnd() * 16; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) px(ctx, rnd() * S, rnd() * S, 2, 2, '#63636f');
  },
  cave_floor(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#5c4834', ['#493826', '#6f5842', '#523c28', '#3b2d1e']);
    for (let i = 0; i < 15; i++) px(ctx, rnd() * S, rnd() * S, 3, 3, '#7a6148');
  },
  gravel(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#706a5d', ['#5f5a4f', '#807a70', '#666158', '#514d45']);
    for (let i = 0; i < 25; i++) px(ctx, rnd() * S, rnd() * S, 2, 2, '#8b8378');
  },
  // ── floor-50 room materials (mirrors voxelTerrain DEFAULT_PALETTE so
  // the textured fallback path keeps the same room identities) ──
  bone(ctx, rnd, S) {   // rat nursery / bone pit — WARM honey ivory
    noiseFill(ctx, rnd, S, '#c0a878', ['#a98f5e', '#d6bd8f', '#9c8454', '#e0c89c']);
    for (let i = 0; i < 18; i++) px(ctx, rnd() * S, rnd() * S, 2 + rnd() * 3, 2, '#ecd9ae');
  },
  sludge(ctx, rnd, S) {  // Gnaw's den — RICH GREEN wet muck, the darkest floor
    noiseFill(ctx, rnd, S, '#4a7c3e', ['#3a6130', '#5b9148', '#33552a', '#67a251']);
    for (let i = 0; i < 10; i++) px(ctx, rnd() * S, rnd() * S, 4 + rnd() * 6, 3, '#7db565');
  },
  marble(ctx, rnd, S) { // throne + bath — COOL sea-blue, the brightest floor
    noiseFill(ctx, rnd, S, '#9fb8c8', ['#8ca6b8', '#b3c9d6', '#839db0', '#bfd2de']);
    ctx.strokeStyle = '#7d99ad'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {  // veining
      ctx.beginPath();
      let x = rnd() * S, y = rnd() * S;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (rnd() - 0.5) * 28; y += rnd() * 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  moss(ctx, rnd, S) {   // fungal alcove — VIVID spore-green
    noiseFill(ctx, rnd, S, '#558a3e', ['#3f6f2c', '#6aa34d', '#487c33', '#7cb55d']);
    for (let i = 0; i < 16; i++) px(ctx, rnd() * S, rnd() * S, 2, 2, '#8fc46e');
  },
  dark_water(ctx, rnd, S) {  // sewer water — murky TEAL, not blue-black
    noiseFill(ctx, rnd, S, '#0f2a28', ['#0c2320', '#143a36', '#0a1c1a'], 8);
    for (let i = 0; i < 6; i++) px(ctx, rnd() * S, rnd() * S, 8 + rnd() * 10, 1, '#2a6a63');
  },
};

export interface TextureSet {
  map: Record<string, THREE.CanvasTexture>;
  particle: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
}

let cache: TextureSet | null = null;

export function getTextures(): TextureSet {
  if (cache) return cache;
  const map: Record<string, THREE.CanvasTexture> = {};
  for (const [name, p] of Object.entries(painters)) map[name] = makeTexture(name, p);

  // soft round particle sprite
  const particle = makeTexture('particle', (ctx, _r, S) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }, 64);

  // harsh glow dot for bloom-sensitive sparks
  const glow = makeTexture('glow', (ctx, _r, S) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }, 64);

  cache = { map, particle, glow };
  return cache;
}
