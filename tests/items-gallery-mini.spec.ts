import { test } from '@playwright/test';
test('mini gallery new models', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const itemsMod: any = await import('/src/game/items.ts');
    const { makeItem } = itemsMod;
    const { attachVoxelView } = await import('/src/components/voxelView.ts');
    const ids = ['bow1','bow3','warlord_blade','drowned_majesty','mushroom_staff','spore_dagger','fungal_blade','mycelial_staff'];
    const host=document.createElement('div');
    host.id='mini';
    host.style.cssText='position:fixed;inset:0;overflow:auto;background:#0b0b12;z-index:99999;padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;';
    document.body.appendChild(host);
    for(const id of ids){
      const item=makeItem(id);
      if(id==='bow3') (item as any).enchantId='flaming';
      if(id==='warlord_blade') (item as any).enchantId='flaming';
      if(id==='mushroom_staff') (item as any).enchantId='frost';
      const wrap=document.createElement('div');
      wrap.style.cssText='background:#131722;border:1px solid #c9a227;border-radius:10px;padding:8px;text-align:center;color:#efe3c2;font-family:sans-serif;';
      const title=document.createElement('div');
      title.textContent=`${item.icon} ${item.name} (${id}) ${(item as any).enchantId??''}`;
      title.style.cssText='font-size:11px;margin-bottom:6px;';
      const mount=document.createElement('div');
      mount.style.cssText='width:160px;height:160px;margin:0 auto;background:#0b0b12;border-radius:8px;';
      wrap.appendChild(title); wrap.appendChild(mount); host.appendChild(wrap);
      // Use VoxelItemIcon rendering via attachVoxelView + manual model build
      const { VoxelItemIcon } = await import('/src/components/VoxelItemIcon.tsx');
      // We can't easily call private builders, so just mount VoxelItemIcon via React
      try{
        const React: any = (window as any).React ?? await import('/node_modules/.vite/deps/react.js').catch(()=> null);
        const ReactDOM: any = (window as any).ReactDOM ?? await import('/node_modules/.vite/deps/react-dom_client.js').catch(()=> null);
        // Fallback: if React not available, use attachVoxelView with simple placeholder built from VoxelItemIcon's internal logic by reusing its component
        if(React && ReactDOM){
          const { createElement } = React;
          const { createRoot } = ReactDOM;
          const root = createRoot(mount);
          root.render(createElement(VoxelItemIcon, { item, size: 160, spin: true }));
        } else {
          // fallback: show icon only
          mount.textContent = item.icon;
          mount.style.fontSize='48px'; mount.style.lineHeight='160px';
        }
      }catch(e){
        mount.textContent = String(e).slice(0,100);
        mount.style.color='tomato'; mount.style.fontSize='9px';
      }
    }
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'test-results/items-mini.png', fullPage: true });
});
