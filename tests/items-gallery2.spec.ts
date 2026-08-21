import { test, expect } from '@playwright/test';
test('gallery all item models v2', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(2000);
  await page.evaluate(async () => {
    const itemsMod: any = await import('/src/game/items.ts');
    const { ITEM_BASES, makeItem } = itemsMod;
    const { attachVoxelView } = await import('/src/components/voxelView.ts');
    const baseIds = Object.keys(ITEM_BASES);
    const host=document.createElement('div');
    host.id='gallery2';
    host.style.cssText='position:fixed;inset:0;overflow:auto;background:#0b0b12;z-index:99999;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;';
    document.body.appendChild(host);
    // Build via actual VoxelItemIcon's private builders by directly calling its model logic through a helper page import
    const voxMod: any = await import('/src/components/VoxelItemIcon.tsx');
    // We can't call its private builders, so we re-use attachVoxelView + a wrapper that mimics VoxelItemIcon's rendering
    const THREE: any = await import('/node_modules/.vite/deps/three.js').catch(async () => await import('/node_modules/three/build/three.module.js').catch(()=> null));
    // Fallback: if THREE not importable, use global THREE from the game
    const T = (window as any).THREE ?? THREE;
    for(const id of baseIds){
      const item=makeItem(id);
      // Force an enchant for demo on some items so VFX is visible
      if(['sword2','sword3','bow2','mace2'].includes(id)) (item as any).enchantId = ['flaming','frost','shocking','keen'][Math.floor(Math.random()*4)];
      const wrap=document.createElement('div');
      wrap.style.cssText='background:#131722;border:1px solid #c9a227;border-radius:10px;padding:8px;text-align:center;color:#efe3c2;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;min-height:180px;';
      const title=document.createElement('div');
      title.textContent=`${item.icon} ${item.name} (${id}) ${(item as any).enchantId?'✨':''} ${item.weaponKind??item.kind}`;
      title.style.cssText='font-size:10px;margin-bottom:6px;word-break:break-word;max-width:150px;';
      const mount=document.createElement('div');
      mount.style.cssText='width:140px;height:140px;display:block;background:#0b0b12;border-radius:8px;overflow:hidden;';
      wrap.appendChild(title); wrap.appendChild(mount); host.appendChild(wrap);
      try {
        // Use VoxelItemIcon's rendering path via attachVoxelView
        // We import the component's helper by creating a mount and letting it render via its own logic:
        // Instead of re-implementing, just call the component's rendering by mounting a React tree if possible
        // Fallback: use attachVoxelView directly with a simple box if needed
        const { VoxelItemIcon } = voxMod;
        // Create a temporary React root using the page's React (loaded by Vite)
        // Vite's React is available via the module we just imported (it has react as dep)
        // Use dynamic import for react-dom/client via Vite's dep
        const React = await import('/node_modules/.vite/deps/react.js').catch(()=> (window as any).React);
        const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js').catch(()=> (window as any).ReactDOM);
        if(React && ReactDOM && VoxelItemIcon){
          const { createElement } = React as any;
          const { createRoot } = ReactDOM as any;
          const root = createRoot(mount);
          root.render(createElement(VoxelItemIcon, { item, size: 140, spin: false }));
        } else {
          // fallback: use attachVoxelView with a simple placeholder
          const view = attachVoxelView(mount, 140, 140);
          const scene = new T.Scene(); scene.background = new T.Color(0x0b0b12);
          const camera = new T.PerspectiveCamera(40,1,0.1,100);
          scene.add(new T.HemisphereLight(0xffffff,0x222233,1.1));
          const key=new T.DirectionalLight(0xffe6c0,1.4); key.position.set(2,4,2); scene.add(key);
          const box=new T.Mesh(new T.BoxGeometry(0.5,0.5,0.5), new T.MeshLambertMaterial({color:0xc9a227}));
          scene.add(box);
          camera.position.set(2,2,2); camera.lookAt(0,0,0);
          view.renderOnce(scene,camera);
        }
      } catch(e){
        mount.textContent = String(e).slice(0,200);
        mount.style.color='tomato'; mount.style.fontSize='9px';
      }
    }
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/items-gallery2.png', fullPage: true });
});
