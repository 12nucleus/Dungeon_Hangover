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
  water(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#2e6f9e', ['#2a6590', '#3880b3', '#235a82'], 8);
    for (let i = 0; i < 8; i++) px(ctx, rnd() * S, rnd() * S, 10 + rnd() * 14, 2, '#7fb8d9');
  },
  snow(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#e8edf2', ['#dde4ec', '#f4f7fa', '#cfd8e2']);
  },
  cave_stone(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#3a3a42', ['#2e2e36', '#46464e', '#38383f', '#2a2a32']);
    ctx.strokeStyle = '#1e1e26'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = rnd() * S, y = rnd() * S;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (rnd() - 0.5) * 20; y += rnd() * 16; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) px(ctx, rnd() * S, rnd() * S, 2, 2, '#4a4a55');
  },
  cave_floor(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#4a3a2a', ['#3d2f22', '#574433', '#422f1f', '#2e2318']);
    for (let i = 0; i < 15; i++) px(ctx, rnd() * S, rnd() * S, 3, 3, '#5d4a38');
  },
  gravel(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#5a554a', ['#4e4a42', '#666058', '#524e46']);
    for (let i = 0; i < 25; i++) px(ctx, rnd() * S, rnd() * S, 2, 2, '#6e6860');
  },
  dark_water(ctx, rnd, S) {
    noiseFill(ctx, rnd, S, '#0a1a2e', ['#081424', '#0c2040', '#061020'], 8);
    for (let i = 0; i < 6; i++) px(ctx, rnd() * S, rnd() * S, 8 + rnd() * 10, 1, '#163a55');
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
