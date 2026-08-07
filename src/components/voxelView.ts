// ─────────────────────────────────────────────────────────────
// voxelView — ONE shared WebGL context for every small voxel canvas
// (item icons, class portraits, the doll). Chrome/WebView2 cap live
// contexts (~16) and EVICT the oldest when a page exceeds them — the
// per-icon renderers were silently killing the game canvas (blank
// white world, DOM overlays intact). Icons render once; animated
// views register a ticker on a single shared RAF loop.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

let shared: THREE.WebGLRenderer | null = null;

function getShared(): THREE.WebGLRenderer {
  if (!shared) {
    shared = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    shared.setPixelRatio(1);
    shared.shadowMap.enabled = true;
  }
  return shared;
}

// ── one RAF loop for every animated voxel view ──
const tickers = new Set<() => void>();
let raf = 0;
function loop() {
  raf = requestAnimationFrame(loop);
  for (const fn of [...tickers]) {
    try { fn(); } catch { /* one bad view must not kill the loop */ }
  }
}
function start() { if (!raf) raf = requestAnimationFrame(loop); }
function stop() { if (!tickers.size && raf) { cancelAnimationFrame(raf); raf = 0; } }

export function addTicker(fn: () => void) { tickers.add(fn); start(); }
export function removeTicker(fn: () => void) { tickers.delete(fn); stop(); }

export interface VoxelView {
  /** the 2D canvas the caller appended to its host */
  canvas: HTMLCanvasElement;
  /** render the given scene/camera into the view's 2D canvas */
  renderOnce(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  /** free the render target + remove the canvas (never the shared context) */
  dispose(): void;
}

/** Create a 2D canvas + render target backed by the shared WebGL context. */
export function attachVoxelView(host: HTMLElement, w: number, h: number): VoxelView {
  const pr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.max(1, Math.round(w * pr));
  const py = Math.max(1, Math.round(h * pr));
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = py;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const renderer = getShared();
  const rt = new THREE.WebGLRenderTarget(px, py, { samples: 4, depthBuffer: true });
  const buf = new Uint8Array(px * py * 4);
  const img = ctx.createImageData(px, py);
  const row = px * 4;

  const view: VoxelView = {
    canvas,
    renderOnce(scene, camera) {
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(rt, 0, 0, px, py, buf);
      renderer.setRenderTarget(null);
      // WebGL reads bottom-up; the 2D canvas is top-down — flip the rows
      for (let y = 0; y < py; y++) {
        const src = y * row;
        const dst = (py - 1 - y) * row;
        img.data.set(buf.subarray(src, src + row), dst);
      }
      ctx.putImageData(img, 0, 0);
    },
    dispose() {
      rt.dispose();
      if (canvas.parentNode === host) host.removeChild(canvas);
    },
  };
  return view;
}
