// ─────────────────────────────────────────────────────────────
// Floor 50 layout sanity — imports the authored level and asserts:
//   1. Every one of the 25 rooms is reachable from spawn with NO
//      blockers/doors applied (pure walkability).
//   2. With ALL blockers + doors closed, exactly rooms {1,2,3,4,5}
//      are reachable (soft-lock guard — the shortcut debris must be
//      the ONLY way into the west cluster, from Room 1's side).
//   3. With shortcut_open + debris_56 + pipe_climbed opened (doors
//      open), every room except {16,17} is reachable.
//   4. {16,17} open only with mushroom_door / vault_tunnel.
//   5. Every spawn / door / chest / NPC tile is walkable.
//
// Also prints an ASCII map + writes scripts/floor50_preview.svg.
// Run with:   node scripts/preview_floor50.mjs
// ─────────────────────────────────────────────────────────────
import esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT_DIR = resolve(__dirname, '..', 'node_modules', '.tmp_f50_prev');
const OUT = resolve(OUT_DIR, 'floor50.mjs');

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(__dirname, '..', 'src', 'levels', 'floor50.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: OUT,
  logLevel: 'silent',
});

const { floor50Level, F50_DEBUG } = await import(pathToFileURL(OUT).href);
const { ROOMS, map, structures } = F50_DEBUG;

// ── helpers ──
const S = map.walk.length;
const roomCenter = (id) => {
  const r = map.rooms[id];
  return { x: (r.x0 + r.x1) >> 1, z: (r.z0 + r.z1) >> 1 };
};
const bfs = (walk, start) => {
  const seen = new Set([`${start.x},${start.z}`]);
  const q = [{ ...start }];
  while (q.length) {
    const c = q.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, nz = c.z + dz;
      if (nx < 0 || nz < 0 || nx >= S || nz >= S || !walk[nx][nz]) continue;
      const k = `${nx},${nz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, z: nz });
    }
  }
  return seen;
};
const reachableRooms = (walk, start) => {
  const seen = bfs(walk, start);
  const out = new Set();
  for (const r of ROOMS) {
    const c = roomCenter(r.id);
    if (seen.has(`${c.x},${c.z}`)) out.add(r.id);
  }
  return out;
};
const BLOCKING_KINDS = new Set(['torch', 'bonfire', 'brazier']);
const applyState = (opts) => {
  // deep copy the walk grid
  const walk = map.walk.map((row) => [...row]);
  const block = (p) => { walk[p.x][p.z] = false; };
  const open = (p) => { walk[p.x][p.z] = true; };
  for (const b of structures.blockers) {
    const shouldOpen = opts.openFlags.includes(b.openedByFlag);
    for (const t of b.tiles) shouldOpen ? open(t) : block(t);
  }
  for (const d of structures.doors) {
    const shouldOpen = opts.openFlags.includes(d.openedByFlag) || opts.doorsOpen;
    shouldOpen ? open(d.pos) : block(d.pos);
  }
  if (opts.doorsOpen) open(structures.bossDoor); else block(structures.bossDoor);
  // blocking props (torches, braziers, bonfire) occupy their tile
  if (opts.props !== false) {
    for (const p of floor50Level.props) if (BLOCKING_KINDS.has(p.kind)) block(p);
  }
  return walk;
};

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// ── TEST 1: no blockers — all 25 rooms reachable ──
console.log('\n── Reachability ──');
const walkAll = applyState({ openFlags: [], doorsOpen: true });
{
  const blockersOpen = structures.blockers.flatMap((b) => b.tiles).map((t) => ({ x: t.x, z: t.z }));
  for (const t of blockersOpen) walkAll[t.x][t.z] = true;
  const reach = reachableRooms(walkAll, structures.partySpawn);
  check('all 25 rooms reachable (no blockers)', reach.size === 25, `got ${reach.size}: ${[...reach].sort().join(',')}`);
  if (reach.size !== 25) {
    // find which blocking props sit on the frontier of the reachable area
    const seen = bfs(walkAll, structures.partySpawn);
    const frontier = [];
    for (const k of seen) {
      const [x, z] = k.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        const nk = nx + ',' + nz;
        if (walkAll[nx]?.[nz] && !seen.has(nk)) frontier.push({ from: k, to: nk });
      }
    }
    const propMap = new Map(floor50Level.props.filter((p) => BLOCKING_KINDS.has(p.kind)).map((p) => [`${p.x},${p.z}`, p.kind]));
    console.log('  frontier (from→to):', frontier.slice(0, 10).map((f) => `${f.from}→${f.to}${propMap.has(f.to) ? ' [' + propMap.get(f.to) + ']' : ''}`).join('  '));
  }
}

// ── TEST 2: everything closed → exactly {1,2,3,4,5} ──
{
  const walkClosed = applyState({ openFlags: [], doorsOpen: false });
  const reach = reachableRooms(walkClosed, structures.partySpawn);
  const expect = new Set(['r1', 'r2', 'r3', 'r4', 'r5']);
  check('all closed → only rooms 1-5 reachable', same(reach, expect), `got ${[...reach].sort().join(',')}`);
}

// ── TEST 3: shortcut + debris56 + pipeclimb open, doors open ──
{
  const walk = applyState({ openFlags: ['shortcut_open', 'debris_56', 'pipe_climbed'], doorsOpen: true });
  const reach = reachableRooms(walk, structures.partySpawn);
  const missing = ROOMS.map((r) => r.id).filter((id) => !reach.has(id) && id !== 'r16' && id !== 'r17');
  check('shortcut+debris+pipe open → all rooms except 16,17 reachable', missing.length === 0,
    missing.length ? `unreachable: ${missing.join(',')}` : `got ${reach.size}/25`);
}

// ── TEST 4: mushroom_door → 16; vault_tunnel → 17 ──
{
  const walk = applyState({ openFlags: ['shortcut_open', 'debris_56', 'pipe_climbed', 'mushroom_door'], doorsOpen: true });
  const reach = reachableRooms(walk, structures.partySpawn);
  check('mushroom_door opens room 16', reach.has('r16'), reach.has('r16') ? '' : 'r16 unreachable');
}
{
  const walk = applyState({ openFlags: ['shortcut_open', 'debris_56', 'pipe_climbed', 'vault_tunnel'], doorsOpen: true });
  const reach = reachableRooms(walk, structures.partySpawn);
  check('vault_tunnel opens room 17', reach.has('r17'), reach.has('r17') ? '' : 'r17 unreachable');
}

// ── TEST 5: every structural tile walkable on the pristine map ──
console.log('\n── Tile walkability ──');
{
  const walk = map.walk;
  const tiles = [
    ['partySpawn', structures.partySpawn],
    ['checkpoint', structures.checkpoint],
    ['bossDoor', structures.bossDoor],
    ['bossBath', structures.bossBath],
    ['goldenChest', structures.goldenChest],
    ['secretChest', structures.secretChest],
    ['exitStairs', structures.exitStairs],
    ['hermitChamber', structures.hermitChamber],
    ...(structures.doors ?? []).map((d) => [`door:${d.id}`, d.pos]),
    ...(structures.blockers ?? []).flatMap((b) => b.tiles.map((t) => [`blocker:${b.id}`, t])),
    ...(structures.npcs ?? []).map((n) => [`npc:${n.npcId}`, n.pos]),
  ];
  for (const [name, p] of tiles) {
    if (!p) continue;
    check(`${name} (${p.x},${p.z}) walkable`, !!walk[p.x]?.[p.z]);
  }
  // roster spawn positions walkable
  const spawns = [F50_DEBUG.FLOOR50_SPAWNS.party, F50_DEBUG.FLOOR50_SPAWNS.bossBathTile];
  for (const s of spawns) check(`spawn (${s.x},${s.z}) walkable`, !!walk[s.x]?.[s.z]);
}

// ── ASCII map ──
console.log('\n── Floor 50 map (1 char = 1 tile, x→ right, z→ down) ──');
{
  const step = 2;
  const cols = Math.ceil(S / step);
  const mark = new Map();
  mark.set(`${structures.partySpawn.x},${structures.partySpawn.z}`, 'P');
  mark.set(`${structures.bossDoor.x},${structures.bossDoor.z}`, 'D');
  mark.set(`${structures.bossBath.x},${structures.bossBath.z}`, 'B');
  mark.set(`${structures.goldenChest.x},${structures.goldenChest.z}`, 'G');
  for (const r of ROOMS) mark.set(`${roomCenter(r.id).x},${roomCenter(r.id).z}`, r.id.replace('r', ''));
  let out = '   ';
  for (let c = 0; c < cols; c++) out += (c % 10 === 0 ? '|' : ' ');
  console.log(out);
  for (let z = 0; z < S; z += step) {
    let line = `${String(z).padStart(2, ' ')} `;
    for (let x = 0; x < S; x += step) {
      const k = `${x},${z}`;
      if (mark.has(k)) line += mark.get(k);
      else if (map.walk[x]?.[z]) line += '·';
      else line += '#';
    }
    console.log(line);
  }
}

// ── SVG ──
{
  const cell = 5, pad = 10;
  const imgW = S * cell + pad * 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgW}" style="background:#0a0a14">\n`;
  for (let x = 0; x < S; x++) {
    for (let z = 0; z < S; z++) {
      if (!map.walk[x][z]) continue;
      const color = map.water[x][z] ? '#1a3a4a' : '#2a3a2a';
      svg += `<rect x="${pad + x * cell}" y="${pad + z * cell}" width="${cell}" height="${cell}" fill="${color}"/>\n`;
    }
  }
  for (const r of ROOMS) {
    const rc = map.rooms[r.id];
    svg += `<rect x="${pad + rc.x0 * cell - 1}" y="${pad + rc.z0 * cell - 1}" width="${(rc.x1 - rc.x0 + 1) * cell + 2}" height="${(rc.z1 - rc.z0 + 1) * cell + 2}" fill="none" stroke="#c9a227" stroke-width="1.2"/>\n`;
    const c = roomCenter(r.id);
    svg += `<text x="${pad + c.x * cell}" y="${pad + c.z * cell + 4}" fill="#e8d8a0" font-size="8">${r.id.replace('r', '')}</text>\n`;
  }
  for (const b of structures.blockers) for (const t of b.tiles) {
    svg += `<rect x="${pad + t.x * cell}" y="${pad + t.z * cell}" width="${cell}" height="${cell}" fill="#ef4444"/>\n`;
  }
  svg += `</svg>`;
  const outSvg = resolve(__dirname, 'floor50_preview.svg');
  await writeFile(outSvg, svg, 'utf-8');
  console.log(`\n📄 SVG map saved: ${outSvg.replace(__dirname, 'scripts')}`);
}

await rm(OUT_DIR, { recursive: true, force: true });

console.log(failures === 0 ? '\n✅ OK — Floor 50 layout is sound.\n' : `\n❌ ${failures} CHECK(S) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
