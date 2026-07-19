// Reusable voxel prop builders for any level.
// Each builder takes a THREE.Group and adds InstancedMesh props at given positions.
// No game engine dependency � pure THREE.js + textures.
import * as THREE from 'three';
import { getTextures } from '../game/textures';

const CUBE = new THREE.BoxGeometry(1, 1, 1);
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _e = new THREE.Euler();

// -- cave props --

export function buildStalagmite(g: THREE.Group, x: number, y: number, z: number, seed = 1): THREE.Group {
  const mat = new THREE.MeshLambertMaterial({ map: getTextures().map.stone });
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const h = 2 + Math.floor(seed * 3);
  for (let i = 0; i < h; i++) {
    const w = 1.3 - (i / h) * 0.9;
    _e.set(seed * 0.1, seed * 0.2, seed * 0.05);
    _m4.compose(
      new THREE.Vector3((seed - 0.5) * 0.15, 0.5 + i, (seed - 0.5) * 0.15),
      _q.setFromEuler(_e), _sc.set(w, 1, w)
    );
    const im = new THREE.InstancedMesh(CUBE, mat, 1);
    im.setMatrixAt(0, _m4);
    im.castShadow = true;
    group.add(im);
  }
  g.add(group);
  return group;
}

export function buildStalactite(g: THREE.Group, x: number, y: number, z: number, seed = 1): THREE.Group {
  const mat = new THREE.MeshLambertMaterial({ map: getTextures().map.stone });
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const h = 2 + Math.floor(seed * 2);
  for (let i = 0; i < h; i++) {
    const w = 0.8 - (i / h) * 0.5;
    _e.set(seed * 0.08, seed * 0.15, seed * 0.03);
    _m4.compose(
      new THREE.Vector3((seed - 0.5) * 0.1, -0.5 - i, (seed - 0.5) * 0.1),
      _q.setFromEuler(_e), _sc.set(w, 1, w)
    );
    const im = new THREE.InstancedMesh(CUBE, mat, 1);
    im.setMatrixAt(0, _m4);
    im.castShadow = true;
    group.add(im);
  }
  g.add(group);
  return group;
}

export function buildCrystal(g: THREE.Group, x: number, y: number, z: number, seed = 1): THREE.Group {
  const mat = new THREE.MeshLambertMaterial({
    color: 0x7c5cbf, emissive: 0x2a0e4a, emissiveIntensity: 0.6,
    transparent: true, opacity: 0.9,
  });
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const h = 2 + Math.floor(seed * 2);
  for (let i = 0; i < h; i++) {
    const w = 0.6 - (i / h) * 0.35;
    _e.set(seed * 0.15, seed * 0.3, seed * 0.08);
    _m4.compose(
      new THREE.Vector3((seed - 0.5) * 0.1, 0.5 + i, (seed - 0.5) * 0.1),
      _q.setFromEuler(_e), _sc.set(w, 1, w)
    );
    const im = new THREE.InstancedMesh(CUBE, mat, 1);
    im.setMatrixAt(0, _m4);
    im.castShadow = true;
    group.add(im);
  }
  // glow light
  const light = new THREE.PointLight(0x8a5cf0, 6, 7, 1.8);
  light.position.set(0, 1.2, 0);
  group.add(light);
  g.add(group);
  return group;
}

export function buildBoulder(g: THREE.Group, x: number, y: number, z: number, seed = 1): THREE.Group {
  const mat = new THREE.MeshLambertMaterial({ map: getTextures().map.stone });
  _e.set(seed * 0.3, seed * 2.5, seed * 0.3);
  _m4.compose(new THREE.Vector3(x, y + 0.18, z), _q.setFromEuler(_e), _sc.set(0.85, 0.55, 0.8));
  const im = new THREE.InstancedMesh(CUBE, mat, 1);
  im.setMatrixAt(0, _m4);
  im.castShadow = true;
  g.add(im);
  return g;
}

export function buildBones(g: THREE.Group, x: number, y: number, z: number, seed = 1): THREE.Group {
  const mat = new THREE.MeshLambertMaterial({ color: 0xd8d2c0 });
  const group = new THREE.Group();
  group.position.set(x, y, z);
  // scattered bone shards
  for (let i = 0; i < 8; i++) {
    const bx = (seed - 0.5) * 0.5 + i * 0.08 - 0.3;
    const bz = (seed - 0.5) * 0.5 + (i % 3) * 0.12 - 0.2;
    _e.set(seed * 2.5 + i * 0.4, seed * 3 + i * 0.3, seed * 0.3);
    _m4.compose(new THREE.Vector3(bx, 0.06, bz), _q.setFromEuler(_e), _sc.set(0.25, 0.12, 0.12));
    const im = new THREE.InstancedMesh(CUBE, mat, 1);
    im.setMatrixAt(0, _m4);
    im.castShadow = true;
    group.add(im);
  }
  // skull
  _e.set(seed * 0.2, seed * 0.4, 0);
  _m4.compose(new THREE.Vector3(0, 0.14, 0), _q.setFromEuler(_e), _sc.set(0.32, 0.32, 0.32));
  const im = new THREE.InstancedMesh(CUBE, mat, 1);
  im.setMatrixAt(0, _m4);
  im.castShadow = true;
  group.add(im);
  g.add(group);
  return group;
}

export function buildTorchPole(g: THREE.Group, x: number, y: number, z: number, _seed = 1): THREE.Group {
  const mat = new THREE.MeshLambertMaterial({ map: getTextures().map.wood, color: 0x886644 });
  const group = new THREE.Group();
  group.position.set(x, y, z);
  // pole
  _m4.makeScale(0.18, 1.5, 0.18);
  _m4.setPosition(0, 0.75, 0);
  const pole = new THREE.InstancedMesh(CUBE, mat, 1);
  pole.setMatrixAt(0, _m4);
  pole.castShadow = true;
  group.add(pole);
  // flame
  const flameMat = new THREE.MeshLambertMaterial({ color: 0xffb545, emissive: 0xff7a1f, emissiveIntensity: 0.8 });
  _m4.makeScale(0.14, 0.2, 0.14);
  _m4.setPosition(0.02, 1.6, 0.02);
  const flame = new THREE.InstancedMesh(CUBE, flameMat, 1);
  flame.setMatrixAt(0, _m4);
  group.add(flame);
  // light
  const light = new THREE.PointLight(0xff9540, 14, 10, 1.7);
  light.position.set(0.02, 1.5, 0.02);
  group.add(light);
  g.add(group);
  return group;
}

export interface PropSpec {
  name: string;
  icon: string;
  build: (g: THREE.Group, x: number, y: number, z: number, seed?: number) => THREE.Group;
}

export const CAVE_PROPS: PropSpec[] = [
  { name: 'Stalagmite', icon: '??', build: (g, x, y, z, s = 1) => buildStalagmite(g, x, y, z, s) },
  { name: 'Stalactite', icon: '??', build: (g, x, y, z, s = 1) => buildStalactite(g, x, y, z, s) },
  { name: 'Crystal', icon: '??', build: (g, x, y, z, s = 1) => buildCrystal(g, x, y, z, s) },
  { name: 'Boulder', icon: '??', build: (g, x, y, z, s = 1) => buildBoulder(g, x, y, z, s) },
  { name: 'Bones', icon: '??', build: (g, x, y, z, s = 1) => buildBones(g, x, y, z, s) },
  { name: 'Torch', icon: '??', build: (g, x, y, z, s = 1) => buildTorchPole(g, x, y, z, s) },
];
