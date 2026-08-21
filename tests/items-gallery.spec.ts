import { test, expect } from '@playwright/test';
test('gallery all item models', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  // Inject a gallery overlay that renders every ITEM_BASES via VoxelItemIcon
  await page.waitForTimeout(2000);
  await page.evaluate(async () => {
    // @ts-ignore
    const itemsMod: any = await import('/src/game/items.ts');
    const { ITEM_BASES, makeItem } = itemsMod;
    const baseIds = Object.keys(ITEM_BASES);
    // create container
    const host = document.createElement('div');
    host.id = 'gallery';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#0b0b12;z-index:99999;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;';
    document.body.appendChild(host);
    // we will render VoxelItemIcon via React if available, else fallback to simple div
    // Try to dynamically import React and VoxelItemIcon
    try {
      const React = await import('react');
      const ReactDOM = await import('react-dom/client');
      const { VoxelItemIcon } = await import('/src/components/VoxelItemIcon.tsx');
      const { createElement } = React as any;
      for (const id of baseIds) {
        const item = makeItem(id);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'background:#131722;border:1px solid #c9a227;border-radius:10px;padding:8px;text-align:center;color:#efe3c2;font-family:sans-serif;';
        const title = document.createElement('div');
        title.textContent = `${item.icon} ${item.name} (${id})`;
        title.style.cssText = 'font-size:11px;margin-bottom:6px;word-break:break-word;';
        const mount = document.createElement('div');
        mount.style.cssText = 'width:120px;height:120px;margin:0 auto;';

        wrap.appendChild(title);
        wrap.appendChild(mount);
        host.appendChild(wrap);
        // @ts-ignore
        const root = ReactDOM.createRoot(mount);
        root.render(createElement(VoxelItemIcon, { item, size: 120, spin: true }));
      }
    } catch (e) {
      const err = document.createElement('pre');
      err.textContent = String(e);
      err.style.color = 'tomato';
      host.appendChild(err);
    }
  });
  await page.waitForTimeout(8000); // let models spin and render
  await page.screenshot({ path: 'test-results/items-gallery.png', fullPage: true });
  expect(true).toBeTruthy();
});
