// ─────────────────────────────────────────────────────────────
// ClassPortrait — renders a voxel "Greg as <class>" to a small
// offscreen THREE canvas. Self-contained (own renderer, own loop),
// no GameEngine coupling. Used by the character-creation class
// browser so each class has a representative portrait.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildCharacter, updateRig, setWeapon } from '@/game/characters';
import type { CharacterScheme, WeaponKind } from '@/game/types';
import { attachVoxelView, addTicker, removeTicker } from './voxelView';

interface Props {
  scheme: CharacterScheme;
  weapon: WeaponKind;
  width?: number;
  height?: number;
  className?: string;
}

export function ClassPortrait({ scheme, weapon, width = 120, height = 150, className }: Props) {
  const mount = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    // ONE shared WebGL context for every portrait (15 class cards would
    // otherwise evict the game canvas — see voxelView.ts)
    const view = attachVoxelView(host, width, height);
    canvasRef.current = view.canvas;

    // build a minimal scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b12);

    // Frame the FULL standing body (model ~1.8u tall): pull the camera back and
    // aim at mid-torso so the head, body and feet all fit inside the card. The
    // portrait canvas is taller than wide (e.g. 150x200), so a taller-than-wide
    // view keeps the whole figure legible.
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 50);
    camera.position.set(1.7, 1.4, 3.1);
    camera.lookAt(0, 0.95, 0);

    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.1);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe6c0, 1.4);
    key.position.set(2, 4, 2);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
    rim.position.set(-2, 1, -2);
    scene.add(rim);

    // simple floor disc
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 40),
      new THREE.MeshLambertMaterial({ color: 0x1a1a26 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // build the class Greg
    const rig = buildCharacter(scheme, weapon);
    setWeapon(rig, weapon, scheme.accent);
    rig.group.position.y = 0;
    rig.group.rotation.y = Math.PI * 0.25;
    rig.anim.mode = 'idle';
    scene.add(rig.group);

    let ticker: (() => void) | null = null;
    ticker = () => {
      rig.anim.t += 0.016;
      updateRig(rig, 0.016);
      rig.group.rotation.y += 0.004; // slow turn so the portrait reads
      view.renderOnce(scene, camera);
    };
    addTicker(ticker);

    return () => {
      removeTicker(ticker);
      rig.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      view.dispose();
    };
  }, [scheme, weapon, width, height]);

  return <div ref={mount} className={className ?? 'cp-portrait'} style={{ width, height }} />;
}
