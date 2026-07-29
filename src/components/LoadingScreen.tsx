import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { buildCharacter, updateRig } from '@/game/characters';

/**
 * Loading overlay — a single full-screen black canvas with a naked Greg
 * ragdolled on a cobblestone road under a warm light cone, a random thought
 * in the top-left, "Loading..." in the bottom-left, and a "Click to continue"
 * button that appears once `ready` is true.
 *
 * Greg is the REAL voxel model built via `buildCharacter({...naked})` — naked
 * except for his (SpongeBob-yellow) underwear. His pose is the engine's own
 * `dead` ragdoll collapse (updateRig), pre-baked to a settled heap so he reads
 * as "passed out cold on the dungeon floor".
 *
 * The scene is a tiny self-contained THREE renderer; no GameEngine, no audio,
 * no party. It owns its own render loop and disposes everything on unmount.
 *
 * The 40-odd thoughts lean into the tone of "Dungeon Hangover" — funny / idiotic /
 * self-aware reflections from a man who woke up in his underwear on the bottom
 * of a fifty-floor dungeon.
 */
export const LOADING_THOUGHTS: readonly string[] = [
  'Questioning my life choices…',
  "Why is it always the floor that wins?",
  "Was that wizard a wizard, or a metaphor?",
  "How many floors of regret is this again?",
  "My liver has officially filed a complaint.",
  "Tomorrow I'll drink water. Today, however…",
  "The rats down here are polite. I'll give them that.",
  "If I die, can someone please tell Norris I was sorry?",
  "Is it bad that the cobblestones know my name?",
  "Wake up. Wake up. WAKE UP. Ah, finally.",
  "Spinning floor. Spinning. Floor. Spinning.",
  "Note to self: do NOT insult the wizard.",
  "Pretty sure I proposed to a goblin. Pretty sure she said yes.",
  "My spine sends its regards. And its complaints.",
  "If the floor is a bed, I am winning at naps.",
  "There's a coin in my belly button. Don't ask.",
  "I've made peace with the rats. We're roommates now.",
  "Was that a dragon or a very loud sneeze?",
  "Note to self: the third flask is always a mistake.",
  "Greg, you magnificent disaster, you've done it again.",
  "The dungeon smells like regret and wet stone.",
  "I think I lent my dignity to a skeleton.",
  "Ten floors down. Zero plans up.",
  "My foot is asleep. My soul is also asleep.",
  "Who put the goblin in charge of the music?",
  "I'm not lost. The dungeon is lost. Around me.",
  "A spider just waved. I waved back. We have an understanding.",
  "The hangover has a hangover.",
  "If I quit now, does the dungeon win? Probably.",
  "My knees remember things my brain has forgotten.",
  "There's a song stuck in my head and it's just cobblestone noises.",
  "I'd stand up but the floor and I are having a moment.",
  "Pretty sure I owe the bartender a kingdom.",
  "The torch is judging me. I can feel it.",
  "I've been adopted by a very small, very angry mushroom.",
  "My shadow left. Can't say I blame it.",
  "Is this the part where I find the hero? Or just more stairs?",
  "The wizard's beard contained multitudes. And my keys, apparently.",
  "I'm 70% sure I'm the protagonist. 30% sure I'm the cautionary tale.",
  "A bat just said 'same'. Rude, but fair.",
  "The dungeon's wifi is terrible but the existential dread is strong.",
  "Wake me when I'm a king. Or at least a baron.",
];

interface LoadingScreenProps {
  /** Show the overlay. */
  visible: boolean;
  /** When true, reveal the "Click to continue" button. */
  ready: boolean;
  /** Called when the user clicks "Click to continue". */
  onContinue: () => void;
}

/** Render an indeterminate progress message ("Loading", "Loading.", "Loading..", "Loading..."). */
function useDotPulse(active: boolean): string {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setDots((d) => (d + 1) % 4), 380);
    return () => window.clearInterval(id);
  }, [active]);
  return '.'.repeat(dots);
}

/** A patch of voxel cobblestones — real little cubes — laid out on the ground.
 *  Cubes are emitted across a wide area; with the scene's near-black ambient,
 *  only the ones the spotlight actually hits read as visible, so the cone of
 *  light becomes a pool of lit cobbles and everything outside fades to black. */
function makeVoxelCobbles(center: THREE.Vector3, radius: number): THREE.InstancedMesh {
  const spacing = 0.5;
  const cube = 0.44;
  const half = 24;                 // grid half-extent in cells (covers ~24u)
  const cells: { x: number; z: number; h: number; c: number }[] = [];
  for (let gx = -half; gx <= half; gx++) {
    for (let gz = -half; gz <= half; gz++) {
      const x = gx * spacing;
      const z = gz * spacing;
      const d = Math.hypot(x - center.x, z - center.z);
      if (d > radius) continue;    // outside the light cone → invisible
      const h = 0.17 + Math.random() * 0.05;   // even, low height variation
      const base = 60 + Math.floor(Math.random() * 30);
      const c = (base << 16) | ((base - 8) << 8) | (base - 16);
      cells.push({ x, z, h, c });
    }
  }
  const geo = new THREE.BoxGeometry(cube, 1, cube);
  const mat = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  cells.forEach((p, i) => {
    pos.set(p.x, p.h * 0.5, p.z);
    scl.set(1, p.h, 1);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
    col.setHex(p.c);
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.position.y = 0;
  return mesh;
}

/** A soft radial glow disc laid on the cobbles to sell the spotlight pool. */
function makeGlowTexture(): THREE.Texture {
  const size = 256;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,238,200,0.9)');
  g.addColorStop(0.5, 'rgba(255,226,170,0.35)');
  g.addColorStop(1.0, 'rgba(255,220,170,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cvs);
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** Build a self-contained THREE scene with naked Greg ragdolled on a cobblestone road. */
function useGregScene(host: HTMLDivElement | null) {
  useEffect(() => {
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);   // transparent — the page CSS provides the black BG
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, host.clientWidth / host.clientHeight, 0.05, 100);

    // ── 1. Naked Greg (underwear only — SpongeBob-yellow brief) ──
    const rig = buildCharacter({
      skin: 0xd9a066,
      cloth: 0xffe23a,   // yellow = the only thing he's wearing
      accent: 0xfff04d,
      hair: 0x4a2f1a,
      hood: false,
      style: 'normal',
      naked: true,
      bulk: 2.1,         // 2× the previous (1.05) size
    }, 'unarmed');

    // ── 2. Dead ragdoll pose ──
    // Reuse the engine's own collapse solver: set the rig to `dead` and bake
    // ~4 s of simulation up front so Greg is already a settled heap on the
    // floor by the time the first frame paints (no standing-then-toppling).
    rig.group.userData.baseY = 0;   // feet sit at y=0; required by the solver
    // randomise the collapse: topple face-down ('dead') or settle on his back ('lie')
    rig.anim.mode = Math.random() < 0.5 ? 'dead' : 'lie';
    for (let i = 0; i < 260; i++) updateRig(rig, 1 / 60);

    // ── 3. Centre the collapsed body, then drop it on a pivot at GREG_POS ──
    rig.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.group);
    const center = box.getCenter(new THREE.Vector3());
    // Greg sits in the lower-right of the frame; the cone of light is centred on him.
    const GREG_POS = new THREE.Vector3(2.6, 0, 1.8);
    // centre the body at the local origin (feet on y=0) so a random yaw spins him
    // in place around his own centre — a different facing each time the screen shows.
    rig.group.position.set(-center.x, -box.min.y, -center.z);
    const pivot = new THREE.Group();
    pivot.position.copy(GREG_POS);
    pivot.rotation.y = Math.random() * Math.PI * 2;   // random ragdoll facing
    pivot.add(rig.group);
    scene.add(pivot);

    // ── 4. Voxel cobblestone road (lit only inside the spotlight cone) ──
    // Cubes are laid out across a wide patch; the near-black ambient means only
    // the ones the spotlight hits are visible, so the cone reads as a pool of light.
    const ground = makeVoxelCobbles(GREG_POS, 9);
    scene.add(ground);

    // ── 5. Light cone — centred on Greg (handled by the spotlight below) ──

    // ── 6. Lighting — near-black ambient + a bright, tight spotlight on Greg ──
    // Ambient is almost zero so only the cobbles the spotlight hits are visible;
    // everything outside the cone fades quickly to black.
    scene.add(new THREE.AmbientLight(0xb0a8a0, 0.04));
    const cone = new THREE.SpotLight(0xfff0d8, 2.8, 0, Math.PI / 6, 0.35, 0);
    cone.decay = 0;                                  // constant intensity across the cone
    cone.position.set(GREG_POS.x, 6, GREG_POS.z + 0.3);
    cone.target.position.set(GREG_POS.x, 0, GREG_POS.z);
    scene.add(cone);
    scene.add(cone.target);
    // a faint rim so Greg doesn't go totally black at the edges
    scene.add(new THREE.DirectionalLight(0xff9966, 0.25).translateZ(-1));
    // warm pool of light on the cobbles to sell the spotlight
    const glowTex = makeGlowTexture();
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(GREG_POS.x, 0.24, GREG_POS.z);
    scene.add(glow);

    // ── 7. Camera — orbits Greg once per minute, keeping him in the lower-right ──
    const orbitR = 13.5;         // distance from Greg (pulled back for the 2× size)
    const camHeight = 7.0;       // height above the floor
    const offX = 3.6;            // push Greg to the right of frame
    const offY = 2.8;            // push Greg to the lower part of frame
    const worldUp = new THREE.Vector3(0, 1, 0);
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const camTarget = new THREE.Vector3();
    let theta = 0;               // orbit angle
    const placeCamera = () => {
      camera.position.set(
        GREG_POS.x + Math.cos(theta) * orbitR,
        GREG_POS.y + camHeight,
        GREG_POS.z + Math.sin(theta) * orbitR,
      );
      // keep Greg in the lower-right: look at a point offset up/left of him
      // in the camera's own frame, so the offset rotates with the orbit.
      fwd.subVectors(GREG_POS, camera.position).normalize();
      right.crossVectors(fwd, worldUp).normalize();
      up.crossVectors(right, fwd).normalize();
      camTarget.copy(GREG_POS).addScaledVector(right, -offX).addScaledVector(up, offY);
      camera.lookAt(camTarget);
    };
    placeCamera();

    // ── 8. Resize handling ──
    const onResize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      placeCamera();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // ── 9. Render loop — slow 360°/min orbit ──
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1); last = now;
      theta += dt * (Math.PI * 2 / 60);   // one full rotation per minute
      placeCamera();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      // dispose rig geometry/materials
      rig.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat.dispose();
        }
      });
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      glow.geometry.dispose();
      glowMat.dispose();
      glowTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [host]);
}

export function LoadingScreen({ visible, ready, onContinue }: LoadingScreenProps) {
  const [thought, setThought] = useState<string>(LOADING_THOUGHTS[0]);
  useEffect(() => {
    if (!visible) return;
    let pick = LOADING_THOUGHTS[Math.floor(Math.random() * LOADING_THOUGHTS.length)];
    if (pick === thought) pick = LOADING_THOUGHTS[(LOADING_THOUGHTS.indexOf(pick) + 1) % LOADING_THOUGHTS.length];
    setThought(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const loadingText = useDotPulse(visible && !ready);

  // Use a state-backed host so the scene effect reliably (re)runs once the
  // canvas element actually exists in the DOM — a plain ref is null on the
  // first render and the effect would otherwise never fire.
  const [stageHost, setStageHost] = useState<HTMLDivElement | null>(null);
  useGregScene(stageHost);

  // Static CSS — memoised so React doesn't churn the inline tag on every state change
  const css = useMemo(() => `
    .loading-screen {
      position: fixed; inset: 0; z-index: 9999;
      background: #050608;
      color: #6b6b6b;
      font-family: ui-serif, Georgia, "Times New Roman", serif;
      overflow: hidden;
      cursor: default;
    }
    .loading-screen .thought {
      position: absolute; top: 8%; left: 6%;
      font-size: clamp(22px, 3.2vw, 44px);
      line-height: 1.1;
      font-weight: 700;
      color: #5e5e5e;
      max-width: 40%;
      letter-spacing: 0.01em;
      user-select: none;
      text-shadow: 0 2px 12px rgba(0,0,0,0.8);
    }
    .loading-screen .stage {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none;
    }
    .loading-screen .stage > canvas { width: 100% !important; height: 100% !important; display: block; }
    .loading-screen .loading-text {
      position: absolute; left: 6%; bottom: 6%;
      font-size: 14px; color: #8a8a8a;
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      text-shadow: 0 1px 6px rgba(0,0,0,0.9);
    }
    .loading-screen .continue {
      position: absolute; left: 50%; bottom: 4%;
      transform: translateX(-50%);
      padding: 12px 28px;
      font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase;
      color: #d8d8d8;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 6px;
      cursor: pointer;
      transition: background 200ms ease, transform 120ms ease, opacity 200ms ease;
      opacity: 0;
      pointer-events: none;
      font-family: inherit;
    }
    .loading-screen .continue.visible { opacity: 1; pointer-events: auto; }
    .loading-screen .continue:hover {
      background: rgba(255,255,255,0.12);
      transform: translateX(-50%) translateY(-1px);
    }
    .loading-screen .continue:active { transform: translateX(-50%) translateY(1px); }
  `, []);

  if (!visible) return null;

  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-busy={!ready}>
      <style>{css}</style>

      <div className="thought">{thought}</div>

      <div className="stage" ref={setStageHost} />

      <div className="loading-text">Loading{loadingText}</div>

      <button
        type="button"
        className={`continue ${ready ? 'visible' : ''}`}
        onClick={onContinue}
        aria-disabled={!ready}
      >
        Click to continue
      </button>
    </div>
  );
}
