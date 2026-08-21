import { test } from '@playwright/test';
test('all 102 distinct', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const itemsMod: any = await import('/src/game/items.ts');
    const { ITEM_BASES, makeItem } = itemsMod;
    const { buildItemModel } = await import('/src/components/VoxelItemIcon.tsx');
    const { attachVoxelView } = await import('/src/components/voxelView.ts');
    const THREE: any = await import('/node_modules/three/build/three.module.js');
    const baseIds = Object.keys(ITEM_BASES);
    const host=document.createElement('div');
    host.id='all';
    host.style.cssText='position:fixed;inset:0;overflow:auto;background:#0b0b12;z-index:99999;padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;';
    document.body.appendChild(host);
    for(const id of baseIds){
      const item=makeItem(id);
      // add a random enchant to 30% to show VFX variety
      if(Math.random()<0.3) (item as any).enchantId=['flaming','frost','shocking'][Math.floor(Math.random()*3)];
      const wrap=document.createElement('div');
      wrap.style.cssText='background:#131722;border:1px solid #c9a227;border-radius:8px;padding:6px;text-align:center;color:#efe3c2;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;';
      const title=document.createElement('div');
      title.textContent=`${item.icon} ${id} t${item.tier}`;
      title.style.cssText='font-size:9px;margin-bottom:4px;word-break:break-word;';
      const mount=document.createElement('div');
      mount.style.cssText='width:80px;height:80px;background:#0b0b12;border-radius:6px;';
      wrap.appendChild(title); wrap.appendChild(mount); host.appendChild(wrap);
      const view=attachVoxelView(mount,80,80);
      const scene=new THREE.Scene(); scene.background=new THREE.Color(0x0b0b12);
      scene.add(new THREE.HemisphereLight(0xffffff,0x222233,1.1));
      const key=new THREE.DirectionalLight(0xffe6c0,1.4); key.position.set(2,4,2); scene.add(key);
      const model=buildItemModel(item);
      model.updateWorldMatrix(true,true);
      const box=new THREE.Box3().setFromObject(model);
      const center=box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const size=box.getSize(new THREE.Vector3()); const maxExt=Math.max(size.x,size.y,size.z); const dist=Math.max(4,maxExt*1.5);
      const camera=new THREE.PerspectiveCamera(40,1,0.1,100);
      camera.position.set(dist*0.72,dist*0.5,dist*0.95); camera.lookAt(0,0,0);
      scene.add(model);
      view.renderOnce(scene,camera);
    }
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'test-results/gallery-all.png', fullPage: true });
});
