import { test } from '@playwright/test';

// Renders every item base (optionally sliced by BATCH env) at a large size
// with a readable label, so we can eyeball silhouettes one group at a time.
test('review gallery', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(1500);
  const batch = Number(process.env.BATCH ?? -1);
  await page.evaluate(async (batchArg: number) => {
    const itemsMod: any = await import('/src/game/items.ts');
    const { ITEM_BASES, makeItem } = itemsMod;
    const { buildItemModel } = await import('/src/components/VoxelItemIcon.tsx');
    const { attachVoxelView } = await import('/src/components/voxelView.ts');
    const THREE: any = await import('/node_modules/three/build/three.module.js');
    const baseIds = Object.keys(ITEM_BASES);
    const slice = batchArg < 0 ? baseIds : baseIds.filter((_, i) => Math.floor(i / 12) === batchArg);
    const host = document.createElement('div');
    host.id = 'review';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#0b0b12;z-index:99999;padding:16px;display:grid;grid-template-columns:repeat(6,1fr);gap:14px;';
    document.body.appendChild(host);
    const SIZE = 170;
    for (const id of slice) {
      const item = makeItem(id);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'background:#15161f;border:1px solid #3a3a4a;border-radius:10px;padding:8px;text-align:center;color:#efe3c2;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;';
      const title = document.createElement('div');
      title.textContent = `${item.icon} ${id}  (t${item.tier})`;
      title.style.cssText = 'font-size:10px;margin-bottom:2px;word-break:break-word;font-weight:bold;';
      const sub = document.createElement('div');
      sub.textContent = item.name;
      sub.style.cssText = 'font-size:9px;margin-bottom:6px;color:#b9b0d0;word-break:break-word;';
      const mount = document.createElement('div');
      mount.style.cssText = `width:${SIZE}px;height:${SIZE}px;background:#0b0b12;border-radius:8px;`;
      wrap.appendChild(title); wrap.appendChild(sub); wrap.appendChild(mount); host.appendChild(wrap);
      const view = attachVoxelView(mount, SIZE, SIZE);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0b12);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.1));
      const key = new THREE.DirectionalLight(0xffe6c0, 1.4); key.position.set(2, 4, 2); scene.add(key);
      const rim = new THREE.DirectionalLight(0x88aaff, 0.6); rim.position.set(-2, 1, -2); scene.add(rim);
      const model = buildItemModel(item);
      model.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const size = box.getSize(new THREE.Vector3());
      const maxExt = Math.max(size.x, size.y, size.z);
      const dist = Math.max(4, maxExt * 1.5);
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(dist * 0.72, dist * 0.5, dist * 0.95); camera.lookAt(0, 0, 0);
      scene.add(model);
      view.renderOnce(scene, camera);
    }
  }, batch);
  await page.waitForTimeout(5000);
  const tag = batch < 0 ? 'all' : `b${batch}`;
  await page.screenshot({ path: `review-shots/review-${tag}.png`, fullPage: true });
});
