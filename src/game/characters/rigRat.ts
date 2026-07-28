// ─────────────────────────────────────────────────────────────
// Rat Rig — beast rig for cave rats
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Vox, shade } from './vox';
import type { Rig } from './vox';
import type { CharacterScheme } from '../types';

export function buildRatRig(scheme: CharacterScheme): Rig {
  const C = 0.075;
  const SUB = 3;
  const group = new THREE.Group();
  const parts: Record<string, THREE.Mesh> = {};
  const fur = scheme.skin, furD = shade(fur, 0.78), belly = scheme.cloth, ear = scheme.accent, eye = scheme.hair;
  const part = (name: string, x: number, y: number, z: number, build: (v: Vox) => void) => {
    const v = new Vox(C, SUB); build(v); const m = v.mesh(); m.position.set(x, y, z); parts[name] = m; group.add(m);
  };

  part('torso', 0, 0.16, 0, (v) => {
    v.ellip(0, 0, 0, 2.4, 1.9, 3.6, fur);
    v.ellip(0, -1, 1, 1.8, 1.2, 2.6, belly);
    v.fill(-1, 1, -3, 1, 2, -2, furD);
    let tz = -4, ty = 0;
    for (let i = 0; i < 8; i++) { v.add(0, Math.round(ty), tz, i < 3 ? furD : ear); tz -= 1; if (i > 2) ty += 0.7; }
  });
  part('head', 0, 0.2, 0.34, (v) => {
    v.ellip(0, 0, 0, 1.8, 1.6, 1.8, fur);
    v.fill(-1, -1, 1, 1, 0, 2, furD);
    v.add(0, -1, 3, 0x2a2020);
    for (const s of [-1, 1]) { v.add(s * 2, 2, -1, ear); v.add(s * 2, 3, -1, shade(ear, 1.2)); v.add(s * 2, 2, 0, ear); }
    v.add(-1, 1, 2, eye); v.add(1, 1, 2, eye);
  });
  for (const [name, s] of [['legL', -1], ['legR', 1]] as const) part(name, s * 0.11, 0.19, -0.14, (v) => {
    v.add(0, 0, 0, furD); v.fill(0, -1, 0, 0, -1, 1, fur); v.add(0, -2, 1, 0x2a2020);
  });
  for (const [name, s] of [['armL', -1], ['armR', 1]] as const) part(name, s * 0.1, 0.12, 0.2, (v) => {
    v.fill(0, -1, 0, 0, 0, 0, fur); v.add(0, -2, 1, 0x2a2020);
  });
  for (const [name, s] of [['handL', -1], ['handR', 1]] as const) part(name, s * 0.1, 0.05, 0.24, (v) => { v.add(0, 0, 0, furD); });

  group.scale.setScalar(scheme.bulk ?? 1);
  return {
    group, parts,
    anim: { mode: 'idle', t: Math.random() * 3, lunge: 0, flinch: 0, lungeDir: new THREE.Vector3(), bob: 0, crouch: 0 },
    pivots: { hip: 0.1, torso: 0.16, head: 0.2, eye: 0.22, hair: 0.2, arm: 0.12, hand: 0.05, weapon: 0.2 },
  };
}
