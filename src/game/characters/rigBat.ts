// ─────────────────────────────────────────────────────────────
// Bat Rig — beast rig with membranous wings
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox, shade } from './vox';
import type { Rig } from './vox';
import type { CharacterScheme } from '../types';

export function buildBatRig(scheme: CharacterScheme): Rig {
  const C = 0.08;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const skin = scheme.skin, skinHI = shade(skin, 1.2), wing = scheme.cloth, edge = scheme.accent, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: (v: Vox) => void) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  part('torso', 0, 0.9, 0, (v) => {
    v.ellip(0, 0, 0, 1.4, 2.0, 1.4, skin);
    v.fill(-1, -2, 0, 1, -2, 0, shade(skin, 0.8));
  });
  part('head', 0, 1.12, 0.04, (v) => {
    v.ellip(0, 0, 0, 1.5, 1.4, 1.5, skin);
    for (const s of [-1, 1]) { v.fill(s * 1, 2, -1, s * 1, 3, -1, skin); v.add(s * 1, 4, -1, skinHI); }
    v.add(-1, 0, 2, eye); v.add(1, 0, 2, eye);
    v.add(-1, -1, 2, 0xffffff); v.add(1, -1, 2, 0xffffff);
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.12, 0.95, 0, (v) => {
    for (let gx = 0; gx <= 4; gx++) {
      const span = 2 - Math.floor(gx * 0.35);
      for (let gz = -span; gz <= span; gz++) v.add(s * gx, Math.round(-gx * 0.25), gz, wing);
      v.add(s * gx, Math.round(-gx * 0.25) - span - 1, 0, edge);
    }
    for (let gz = -2; gz <= 2; gz++) v.add(s * 4, -1, gz, edge);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.5, 0.95, 0, (v) => { v.add(0, 0, 0, edge); });
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.05, 0.78, -0.05, (v) => { v.fill(0, -1, 0, 0, 0, 0, shade(skin, 0.7)); });

  group.userData.flap = true;
  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.78, torso: 0.9, head: 1.12, eye: 1.12, hair: 1.12, arm: 0.95, hand: 0.95, weapon: 0.95 },
  };
}
