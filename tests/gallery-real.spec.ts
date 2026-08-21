import { test } from '@playwright/test';
test('real gallery', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const itemsMod: any = await import('/src/game/items.ts');
    const { makeItem } = itemsMod;
    const voxMod: any = await import('/src/components/VoxelItemIcon.tsx');
    const { buildItemModel } = voxMod;
    const { attachVoxelView } = await import('/src/components/voxelView.ts');
    const THREE: any = await import('/node_modules/three/build/three.module.js');
    const ids = ['mace1','mace2','mace3','sword1','sword2','sword3','dagger1','dagger2','dagger3','bow1','bow2','bow3'];
    const host=document.createElement('div');
    host.id='real';
    host.style.cssText='position:fixed;inset:0;overflow:auto;background:#0b0b12;z-index:99999;padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;';
    document.body.appendChild(host);
    for(const id of ids){
      const item=makeItem(id);
      if(id==='sword3') (item as any).enchantId='flaming';
      if(id==='mace2') (item as any).enchantId='frost';
      if(id==='bow3') (item as any).enchantId='shocking';
      const wrap=document.createElement('div');
      wrap.style.cssText='background:#131722;border:1px solid #c9a227;border-radius:10px;padding:8px;text-align:center;color:#efe3c2;font-family:sans-serif;min-height:200px;display:flex;flex-direction:column;align-items:center;';
      const title=document.createElement('div');
      title.textContent=`${item.icon} ${item.name} (${id}) t${item.tier} ${(item as any).enchantId??''}`;
      title.style.cssText='font-size:10px;margin-bottom:6px;';
      const mount=document.createElement('div');
      mount.style.cssText='width:150px;height:150px;background:#0b0b12;border-radius:8px;';
      wrap.appendChild(title); wrap.appendChild(mount); host.appendChild(wrap);
      const view=attachVoxelView(mount,150,150);
      const scene=new THREE.Scene(); scene.background=new THREE.Color(0x0b0b12);
      scene.add(new THREE.HemisphereLight(0xffffff,0x222233,1.1));
      const key=new THREE.DirectionalLight(0xffe6c0,1.4); key.position.set(2,4,2); scene.add(key);
      const model=buildItemModel(item);
      model.updateWorldMatrix(true,true);
      const box=new THREE.Box3().setFromObject(model);
      const center=box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const size=box.getSize(new THREE.Vector3()); const maxExt=Math.max(size.x,size.y,size.z); const dist=Math.max(4,maxExt*2.6);
      const camera=new THREE.PerspectiveCamera(40,1,0.1,100);
      camera.position.set(dist*0.72,dist*0.5,dist*0.95); camera.lookAt(0,0,0);
      scene.add(model);
      view.renderOnce(scene,camera);
    }
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/gallery-real.png', fullPage: true });
});
