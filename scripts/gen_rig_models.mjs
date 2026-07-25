// Generate src/game/rigModels.mjs from greg_export.vox / patron_export.vox.
// Partitions the upright A-pose humanoid into articulated rig parts.
// Preserves .vox palette colors verbatim.
// Run: node scripts/gen_rig_models.mjs

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CUBE = 0.0285;

function readVox(path) {
  const buf = readFileSync(path);
  let off = 0;
  const u32 = () => { const v = buf.readUInt32LE(off); off += 4; return v; };
  const str4 = () => { const s = buf.toString('ascii', off, off + 4); off += 4; return s; };
  const magic = str4(); const ver = u32();
  if (magic !== 'VOX ') throw new Error('not a .vox file: ' + path);
  const models = [];
  let rgba = null;
  while (off + 12 <= buf.length) {
    const id = str4(); const cs = u32(); const ch = u32(); const start = off;
    const c = buf.subarray(off, off + cs); off = start + cs;
    if (id === 'SIZE') models.push({ sx: c.readInt32LE(0), sy: c.readInt32LE(4), sz: c.readInt32LE(8), voxels: [] });
    else if (id === 'XYZI') { const n = c.readInt32LE(0); const m = models[models.length - 1]; for (let i = 0; i < n; i++) { const o = 4 + i * 4; m.voxels.push({ x: c.readUInt8(o), y: c.readUInt8(o + 1), z: c.readUInt8(o + 2), i: c.readUInt8(o + 3) }); } }
    else if (id === 'RGBA') { rgba = c; }
  }
  const pal = [];
  if (rgba) for (let i = 0; i < 256; i++) pal.push([rgba.readUInt8(i * 4), rgba.readUInt8(i * 4 + 1), rgba.readUInt8(i * 4 + 2)]);
  const out = [];
  for (const m of models) {
    for (const v of m.voxels) {
      const x = v.x, z = v.y, y = v.z;
      const [r, g, b] = pal[v.i] || [255, 0, 255];
      out.push({ x, y, z, c: (r << 16) | (g << 8) | b });
    }
  }
  return out;
}

function buildModel(name, path) {
  const vox = readVox(path);
  const minY = Math.min(...vox.map(v => v.y));
  const maxY = Math.max(...vox.map(v => v.y));
  const cxAll = Math.round(vox.reduce((s, v) => s + v.x, 0) / vox.length);
  const cz = 8;

  // Humanoid proportions for this specific model set:
  const hipY = 33;
  const kneeY = 17;
  const neckY = 72;
  const shoulderY = 58;
  const elbowY = 43;
  const wristY = 28;

  const torsoHalf = 6;
  const armX = 8;
  const legX = 2;

  const parts = { head: [], torso: [], armL: [], foreL: [], armR: [], foreR: [], legL: [], shinL: [], legR: [], shinR: [] };

  for (const v of vox) {
    const dx = v.x - cxAll;
    const adx = Math.abs(dx);

    if (v.y >= neckY) {
      parts.head.push([v.x, v.y, v.z, v.c]);
      continue;
    }
    if (v.y >= wristY && v.y <= shoulderY && adx > torsoHalf) {
      const isLeft = dx < 0;
      if (v.y >= elbowY) parts[isLeft ? 'armL' : 'armR'].push([v.x, v.y, v.z, v.c]);
      else parts[isLeft ? 'foreL' : 'foreR'].push([v.x, v.y, v.z, v.c]);
      continue;
    }
    if (v.y >= hipY && v.y < neckY) {
      parts.torso.push([v.x, v.y, v.z, v.c]);
      continue;
    }
    const isLeft = dx < 0;
    if (v.y >= kneeY) parts[isLeft ? 'legL' : 'legR'].push([v.x, v.y, v.z, v.c]);
    else parts[isLeft ? 'shinL' : 'shinR'].push([v.x, v.y, v.z, v.c]);
  }

  return {
    cube: CUBE,
    pivots: { hip: hipY, knee: kneeY, torso: hipY + (neckY - hipY) * 0.45, head: neckY, eye: 0, hair: 0, arm: shoulderY, hand: wristY, weapon: 33, pad: 0, elbow: elbowY, wrist: wristY },
    parts, armX, legX, cxAll, cz,
  };
}

function fmtVox(v) { return `[${v[0]},${v[1]},${v[2]},0x${v[3].toString(16)}]`; }
function emitArr(arr) { return arr.length ? '[' + arr.map(fmtVox).join(',') + ']' : '[]'; }

const greg = buildModel('greg', join(__dirname, '..', 'greg_export.vox'));
const patron = buildModel('patron', join(__dirname, '..', 'patron_export.vox'));

function emitModel(m) {
  let s = `    cube: ${m.cube},\n    armX: ${m.armX}, legX: ${m.legX}, cxAll: ${m.cxAll}, cz: ${m.cz},\n    pivots: {\n`;
  for (const k of Object.keys(m.pivots)) s += `      ${k}: ${m.pivots[k]},\n`;
  s += `    },\n    parts: {\n`;
  for (const k of Object.keys(m.parts)) s += `      ${k}: ${emitArr(m.parts[k])},\n`;
  s += `    }`;
  return s;
}

const moduleText = `export function gregRigModel() { return { ${emitModel(greg)} }; }\nexport function patronRigModel() { return { ${emitModel(patron)} }; }`;
writeFileSync(join(__dirname, '..', 'src', 'game', 'rigModels.mjs'), moduleText);
console.log('Wrote rigModels.mjs');
