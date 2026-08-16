// ─────────────────────────────────────────────────────────────
// GregDoll — a live voxel "paperdoll" for the inventory panel.
// Renders Greg's rig (from the unit's CharacterScheme) to a small
// offscreen THREE canvas, applying every equipped item via the
// equipment system (equip / itemToEquipVisual / setWeapon) so the
// player sees the armor/weapon actually layered onto the model.
// Self-contained (own renderer + loop), no GameEngine coupling.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildCharacter, setWeapon, updateRig, equip, itemToEquipVisual } from '@/game/characters';
import type { Unit } from '@/game/types';
import { attachVoxelView, addTicker, removeTicker } from './voxelView';

interface Props {
  unit: Unit;
  width?: number;
  height?: number;
}

export function GregDoll({ unit, width = 160, height = 240 }: Props) {
  const mount = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    // Use the shared WebGL context from voxelView (prevents context loss evictions)
    const view = attachVoxelView(host, width, height);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c14);

    // Full standing body framing with a cinematic 3/4 perspective
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 50);
    camera.position.set(1.8, 1.45, 3.2);
    camera.lookAt(0, 0.9, 0);

    // lights — warm key, cool ambient fill, dramatic gold rim light
    const hemi = new THREE.HemisphereLight(0xeef2ff, 0x181a26, 1.2);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe8c8, 1.6);
    key.position.set(2.5, 4.5, 2.5);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8c466, 0.8);
    rim.position.set(-2.5, 1.5, -2.5);
    scene.add(rim);

    // floor disc with ornate gold border ring
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 48),
      new THREE.MeshLambertMaterial({ color: 0x121522 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.2, 48),
      new THREE.MeshBasicMaterial({ color: 0x8a6d14, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    scene.add(ring);

    // build Greg + apply equipped items so the paperdoll reflects the gear
    // (a first-spawn unit can be missing scheme/weapon — fall back to the
    //  stock Greg build so the doll never renders blank)
    const FALLBACK_SCHEME = {
      skin: 0xd9a066, cloth: 0xffffff, accent: 0xffeb3b, hair: 0x4a2f1a,
      hood: false, style: 'normal', naked: true,
    } as const;
    const scheme = (unit.scheme ?? FALLBACK_SCHEME) as typeof unit.scheme;
    const rig = buildCharacter(scheme, unit.weapon ?? 'unarmed');
    rig.group.position.y = 0;
    rig.anim.mode = 'idle';
    scene.add(rig.group);

    // weapon
    setWeapon(rig, unit.weapon ?? 'unarmed', scheme.accent);
    // worn armor / head / legs etc.
    for (const [slot, item] of Object.entries(unit.equipment ?? {})) {
      if (!item) continue;
      const vis = itemToEquipVisual(item, slot);
      if (vis) equip(rig, vis);
    }

    let ticker: (() => void) | null = () => {
      rig.anim.t += 0.016;
      updateRig(rig, 0.016);
      rig.group.rotation.y += 0.0035; // gentle idle rotation
      view.renderOnce(scene, camera);
    };
    addTicker(ticker);

    return () => {
      if (ticker) {
        removeTicker(ticker);
        ticker = null;
      }
      view.dispose();
    };
  }, [unit, width, height]);

  return <div ref={mount} className="greg-doll" style={{ width, height }} />;
}
