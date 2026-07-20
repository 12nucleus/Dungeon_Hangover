// ─────────────────────────────────────────────────────────────
// Interactive dungeon set-pieces (pure THREE, no game logic):
//   • iron door   — slides into the floor when unlocked
//   • golden chest — lid tilts open
//   • wall lever   — handle swings down when pulled
//   • rubble pile  — collapses (scales away) when the lever fires
//   • stone bath   — where the warlord is caught bathing
// Each builder returns a Group; animated sub-parts are exposed on
// group.userData so the engine can tween them over several frames.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

const box = (w: number, h: number, d: number, color: number, emissive = 0, ei = 0) => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei }),
  );
  m.castShadow = true; m.receiveShadow = true;
  return m;
};

export interface DoorHandle { group: THREE.Group; }

/** A heavy iron door that fills a tile. Faces along `axis` ('x' → blocks an
 *  east-west corridor). Slide the group down (userData.openY) to open. */
export function buildIronDoor(axis: 'x' | 'z' = 'x'): THREE.Group {
  const g = new THREE.Group();
  const iron = 0x40444d, ironD = 0x2b2e35, boltC = 0x6b7079;
  const slab = box(0.9, 2.3, 0.28, iron);
  slab.position.y = 1.15;
  g.add(slab);
  // reinforcing bands
  for (const y of [0.5, 1.15, 1.8]) {
    const band = box(0.96, 0.16, 0.34, ironD);
    band.position.y = y; g.add(band);
  }
  // rivets
  for (const sx of [-0.34, 0.34]) for (const y of [0.5, 1.15, 1.8]) {
    const r = box(0.09, 0.09, 0.06, boltC);
    r.position.set(sx, y, 0.19); g.add(r);
  }
  // glowing keyhole
  const kh = box(0.1, 0.16, 0.08, 0x1a1a1a, 0xffb020, 1.4);
  kh.position.set(0, 1.05, 0.2); g.add(kh);
  if (axis === 'z') g.rotation.y = Math.PI / 2;
  g.userData.openY = -2.4;   // slide target (into the floor)
  g.userData.slab = slab;
  return g;
}

/** Ornate golden chest. Lid (userData.lid) tilts open about its back edge. */
export function buildGoldenChest(): THREE.Group {
  const g = new THREE.Group();
  const gold = 0xcaa03a, goldHi = 0xf5c542, wood = 0x6b451f;
  const body = box(0.9, 0.5, 0.6, wood);
  body.position.y = 0.25; g.add(body);
  for (const y of [0.12, 0.4]) { const band = box(0.94, 0.07, 0.64, gold); band.position.y = y; g.add(band); }
  // lid pivots around its back edge → wrap in a pivot group
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.5, -0.3);
  const lid = box(0.9, 0.22, 0.6, gold, 0x5a4410, 0.35);
  lid.position.set(0, 0.02, 0.3);
  const lidTrim = box(0.94, 0.08, 0.64, goldHi, 0x6a5010, 0.5);
  lidTrim.position.set(0, 0.1, 0.3);
  lidPivot.add(lid, lidTrim);
  g.add(lidPivot);
  // lock
  const lock = box(0.14, 0.18, 0.08, goldHi, 0xffcf4a, 1.2);
  lock.position.set(0, 0.28, 0.31); g.add(lock);
  g.userData.lid = lidPivot;
  g.userData.openAngle = -1.9;
  return g;
}

/** Wall lever. Handle (userData.handle) swings from up → down when pulled. */
export function buildLever(): THREE.Group {
  const g = new THREE.Group();
  const stone = 0x555a61, iron = 0x3a3d44, knob = 0xb5442e;
  const base = box(0.34, 0.5, 0.2, stone);
  base.position.y = 0.7; g.add(base);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.85, 0.1);
  const handle = box(0.09, 0.55, 0.09, iron);
  handle.position.y = 0.27;
  const ball = box(0.16, 0.16, 0.16, knob, 0x5a1a10, 0.4);
  ball.position.y = 0.55;
  pivot.add(handle, ball);
  pivot.rotation.x = -0.9;   // starts raised
  g.add(pivot);
  g.userData.handle = pivot;
  g.userData.pulledAngle = 0.9;
  return g;
}

/** A pile of rubble blocking a passage. Scale it down to "collapse". */
export function buildRubble(seed = 0.5): THREE.Group {
  const g = new THREE.Group();
  const cols = [0x5a5560, 0x6f6a78, 0x413d47, 0x4c4a52];
  let s = seed * 1000;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const n = 9 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const sz = 0.24 + rnd() * 0.34;
    const r = box(sz, sz * (0.7 + rnd() * 0.5), sz, cols[i % cols.length]);
    r.position.set((rnd() - 0.5) * 0.8, sz * 0.4 + rnd() * 0.4, (rnd() - 0.5) * 0.8);
    r.rotation.set(rnd() * 0.6, rnd() * Math.PI, rnd() * 0.6);
    g.add(r);
  }
  return g;
}

/** Stone bathtub with murky water — the warlord's bath. */
export function buildStoneBath(): THREE.Group {
  const g = new THREE.Group();
  const stone = 0x6a6e75, stoneD = 0x4c5057, water = 0x2f5a4a;
  // four rim walls
  const rimH = 0.5;
  for (const [x, z, w, d] of [[0, 0.6, 1.5, 0.18], [0, -0.6, 1.5, 0.18], [0.66, 0, 0.18, 1.4], [-0.66, 0, 0.18, 1.4]] as const) {
    const wall = box(w, rimH, d, stone);
    wall.position.set(x, rimH / 2, z); g.add(wall);
  }
  const floor = box(1.5, 0.12, 1.4, stoneD);
  floor.position.y = 0.06; g.add(floor);
  // murky water surface
  const surf = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 0.08, 1.18),
    new THREE.MeshLambertMaterial({ color: water, transparent: true, opacity: 0.85, emissive: 0x0a2018, emissiveIntensity: 0.2 }),
  );
  surf.position.y = 0.36; g.add(surf);
  // soap suds
  for (let i = 0; i < 6; i++) {
    const s = box(0.16 + Math.random() * 0.12, 0.08, 0.16 + Math.random() * 0.12, 0xf2f2f0);
    s.position.set((Math.random() - 0.5) * 1.0, 0.42, (Math.random() - 0.5) * 0.9);
    g.add(s);
  }
  return g;
}

/** A wooden weapon rack cradling the warlord's spiked greatclub. During the
 *  boss cutscene the engine lifts the club (userData.club) out and hands it to
 *  Gorruk, so the club is a separate Group parented at the rack's cradle. */
export function buildWeaponRack(): THREE.Group {
  const g = new THREE.Group();
  const wood = 0x5a3a1e, woodD = 0x3e2814, grip = 0x4a3421, ironD = 0x2a1f1a, steel = 0x6a6e75;
  // two upright posts on splayed feet
  for (const x of [-0.42, 0.42]) {
    const post = box(0.12, 1.15, 0.12, wood); post.position.set(x, 0.57, 0); g.add(post);
    const foot = box(0.42, 0.1, 0.52, woodD); foot.position.set(x, 0.05, 0); g.add(foot);
  }
  // two cradle crossbars the weapon leans on
  for (const y of [0.42, 0.92]) { const bar = box(1.02, 0.09, 0.15, woodD); bar.position.set(0, y, 0.05); g.add(bar); }

  // the greatclub itself — its own Group so it can be detached on the "grab" beat
  const club = new THREE.Group();
  const shaft = box(0.14, 0.95, 0.14, grip); shaft.position.y = 0; club.add(shaft);
  const head = box(0.36, 0.42, 0.36, ironD); head.position.y = 0.58; club.add(head);
  for (const [sx, sz] of [[0.26, 0], [-0.26, 0], [0, 0.26], [0, -0.26], [0.19, 0.19], [-0.19, -0.19]] as const) {
    const spike = box(0.13, 0.13, 0.13, steel); spike.position.set(sx, 0.58, sz); club.add(spike);
  }
  club.position.set(0.12, 0.55, 0.12);
  club.rotation.z = 0.55; club.rotation.x = -0.22;   // leaning in the cradle
  g.add(club);
  g.userData.club = club;
  return g;
}
