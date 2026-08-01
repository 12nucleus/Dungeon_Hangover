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

interface Props {
  unit: Unit;
  width?: number;
  height?: number;
}

export function GregDoll({ unit, width = 130, height = 200 }: Props) {
  const mount = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b12);

    // Full standing body framing (same as the class portraits).
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 50);
    camera.position.set(1.7, 1.4, 3.1);
    camera.lookAt(0, 0.95, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

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

    // floor disc
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 40),
      new THREE.MeshLambertMaterial({ color: 0x1a1a26 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // build Greg + apply equipped items so the paperdoll reflects the gear
    const rig = buildCharacter(unit.scheme, unit.weapon ?? 'unarmed');
    rig.group.position.y = 0;
    rig.anim.mode = 'idle';
    scene.add(rig.group);

    // weapon
    setWeapon(rig, unit.weapon ?? 'unarmed', unit.scheme.accent);
    // worn armor / head / legs etc. (weapon + cloak have no equip visual)
    for (const [slot, item] of Object.entries(unit.equipment ?? {})) {
      if (!item) continue;
      const vis = itemToEquipVisual(item, slot);
      if (vis) equip(rig, vis);
    }

    let raf = 0;
    let disposed = false;
    const loop = () => {
      if (disposed) return;
      rig.anim.t += 0.016;
      updateRig(rig, 0.016);
      rig.group.rotation.y += 0.004; // slow turn so the doll reads
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      rig.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [unit, width, height]);

  return <div ref={mount} className="greg-doll" style={{ width, height }} />;
}
