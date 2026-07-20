// Shared MagicaVoxel (.vox) writer. Takes voxels [{x,y,z,c}] (y up,
// 0xRRGGBB) and writes a v150 .vox file with a correct palette.
import { writeFileSync } from 'fs';

export function writeVox(outPath, voxelsIn) {
  // clone + normalise to origin
  const voxels = voxelsIn.map((v) => ({ x: v.x, y: v.y, z: v.z, c: v.c }));
  if (!voxels.length) throw new Error(`writeVox: no voxels for ${outPath}`);
  let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
  for (const v of voxels) { mnX = Math.min(mnX, v.x); mnY = Math.min(mnY, v.y); mnZ = Math.min(mnZ, v.z); }
  for (const v of voxels) { v.x -= mnX; v.y -= mnY; v.z -= mnZ; }
  const sX = Math.max(...voxels.map((v) => v.x)) + 1;
  const sY = Math.max(...voxels.map((v) => v.y)) + 1;
  const sZ = Math.max(...voxels.map((v) => v.z)) + 1;
  if (sX > 256 || sY > 256 || sZ > 256) throw new Error(`writeVox: ${outPath} exceeds 256 (${sX}x${sY}x${sZ})`);

  // palette (<=255 unique colours)
  const cmap = new Map(); const pal = [[0, 0, 0, 0]];
  for (const v of voxels) {
    const r = (v.c >> 16) & 0xff, g = (v.c >> 8) & 0xff, b = v.c & 0xff;
    const k = `${r},${g},${b}`;
    if (!cmap.has(k)) {
      if (pal.length >= 256) { cmap.set(k, 1); continue; }
      pal.push([r, g, b, 255]); cmap.set(k, pal.length - 1);
    }
  }
  while (pal.length < 256) pal.push([0, 0, 0, 0]);

  const W = Buffer.alloc, S32 = (v) => { const b = W(4); b.writeInt32LE(v); return b; };
  const SU32 = (v) => { const b = W(4); b.writeUInt32LE(v); return b; };

  // SIZE (.vox: x=left-right, y=front-back=our z, z=up=our y)
  const sb = W(12); sb.writeInt32LE(sX, 0); sb.writeInt32LE(sZ, 4); sb.writeInt32LE(sY, 8);

  // XYZI (swap y/z: our y up -> vox z; our z depth -> vox y)
  const xb = W(4 + voxels.length * 4); xb.writeInt32LE(voxels.length, 0);
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i], o = 4 + i * 4;
    const r = (v.c >> 16) & 0xff, g = (v.c >> 8) & 0xff, b = v.c & 0xff;
    xb.writeUInt8(v.x, o); xb.writeUInt8(v.z, o + 1); xb.writeUInt8(v.y, o + 2);
    xb.writeUInt8(cmap.get(`${r},${g},${b}`), o + 3);
  }

  // RGBA — MagicaVoxel maps rgba[i] -> palette index i+1, so shift up by one
  const rb = W(256 * 4);
  for (let i = 0; i < 256; i++) { const o = i * 4; const c = pal[i + 1] || [0, 0, 0, 0]; rb.writeUInt8(c[0], o); rb.writeUInt8(c[1], o + 1); rb.writeUInt8(c[2], o + 2); rb.writeUInt8(c[3], o + 3); }

  const children = Buffer.concat([
    Buffer.from('SIZE', 'ascii'), S32(12), SU32(0), sb,
    Buffer.from('XYZI', 'ascii'), S32(xb.length), SU32(0), xb,
    Buffer.from('RGBA', 'ascii'), S32(rb.length), SU32(0), rb,
  ]);
  const hd = W(8); hd.write('VOX ', 0, 'ascii'); hd.writeUInt32LE(150, 4);
  const mh = W(12); mh.write('MAIN', 0, 'ascii'); mh.writeUInt32LE(0, 4); mh.writeUInt32LE(children.length, 8);

  writeFileSync(outPath, Buffer.concat([hd, mh, children]));
  return { voxels: voxels.length, sX, sY, sZ, colors: pal.filter((p) => p[3]).length };
}
