import { test } from '@playwright/test';
import * as fs from 'fs';

// Structural distinctness check: serialize each item base's voxel model to a
// position+colour signature; report any base ids that share an identical model.
// (Used as a non-visual proxy for "every item looks different".)
test('model signatures', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(1500);
  const out = await page.evaluate(async () => {
    const itemsMod: any = await import('/src/game/items.ts');
    const { ITEM_BASES, makeItem } = itemsMod;
    const { buildItemModel } = await import('/src/components/VoxelItemIcon.tsx');
    const THREE: any = await import('/node_modules/three/build/three.module.js');
    const sigs: Record<string, string> = {};
    for (const id of Object.keys(ITEM_BASES)) {
      const item = makeItem(id);
      const g = buildItemModel(item);
      g.updateWorldMatrix(true, true);
      const vox: string[] = [];
      g.traverse((o: any) => {
        if (o.isMesh) {
          const col = (Array.isArray(o.material) ? o.material[0] : o.material).color.getHex();
          const p = o.position;
          vox.push(`${Math.round(p.x * 1000)}:${Math.round(p.y * 1000)}:${Math.round(p.z * 1000)}:${col.toString(16)}`);
        }
      });
      vox.sort();
      sigs[id] = vox.join('|');
    }
    const bySig: Record<string, string[]> = {};
    for (const [id, s] of Object.entries(sigs)) (bySig[s] ??= []).push(id);
    const dups = Object.values(bySig).filter((ids) => ids.length > 1);
    return { total: Object.keys(sigs).length, dupGroups: dups };
  });
  fs.writeFileSync('review-shots/sigs.json', JSON.stringify({ total: out.total, dupGroups: out.dupGroups }, null, 2));
});
