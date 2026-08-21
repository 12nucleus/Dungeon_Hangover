import { test } from '@playwright/test';
test('final gallery new models', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const itemsMod: any = await import('/src/game/items.ts');
    const { makeItem } = itemsMod;
    const { attachVoxelView } = await import('/src/components/voxelView.ts');
    const THREE: any = await import('/node_modules/three/build/three.module.js');
    const V=0.5, METAL=0xb8c0cc, METAL_DARK=0x7a828e, WOOD=0x6b4a2e, GRIP=0x4a3421, GOLD=0xffd76b;
    const shade=(hex:number,f:number)=>{const c=new THREE.Color(hex);c.r=Math.min(1,c.r*f);c.g=Math.min(1,c.g*f);c.b=Math.min(1,c.b*f);return c.getHex();};
    function addVox(g:any,x:number,y:number,z:number,c:number){const m=new THREE.Mesh(new THREE.BoxGeometry(V,V,V), new THREE.MeshLambertMaterial({color:c})); m.position.set(x*V,y*V,z*V); m.castShadow=true; g.add(m);}
    function buildWeaponModel(kind:string, accent:number){
      const g=new THREE.Group(); switch(kind){
        case 'sword': addVox(g,0,-1,0,accent); addVox(g,0,0,0,GRIP); addVox(g,0,1,0,GRIP); addVox(g,-2,2,0,METAL_DARK); addVox(g,-1,2,0,METAL_DARK); addVox(g,0,2,0,METAL_DARK); addVox(g,1,2,0,METAL_DARK); addVox(g,2,2,0,METAL_DARK); addVox(g,-1,3,0,METAL); addVox(g,0,3,0,METAL); addVox(g,1,3,0,METAL); addVox(g,-1,4,0,METAL); addVox(g,0,4,0,METAL); addVox(g,1,4,0,METAL); addVox(g,0,5,0,METAL); addVox(g,1,5,0,METAL); addVox(g,0,6,0,METAL); addVox(g,0,7,0,METAL); addVox(g,0,8,0,shade(METAL,1.25)); break;
        case 'bow': {const LIMB=WOOD, STR=0xe8e0c8; addVox(g,0,2,0,GRIP); addVox(g,0,3,0,GRIP); addVox(g,0,4,0,LIMB); addVox(g,-1,5,0,LIMB); addVox(g,-2,6,0,LIMB); addVox(g,-2,7,0,shade(WOOD,0.78)); addVox(g,0,1,0,LIMB); addVox(g,-1,0,0,LIMB); addVox(g,-2,-1,0,LIMB); for(let y=-2;y<=7;y++) addVox(g,-2,y,1,y===2||y===3?STR:shade(STR,0.9)); addVox(g,1,2,0,WOOD); addVox(g,2,2,0,WOOD); addVox(g,3,2,0,METAL); break; }
        case 'staff': for(let y=-3;y<=3;y++) addVox(g,0,y,0,WOOD); addVox(g,0,4,0,accent); break;
        default: addVox(g,0,0,0,GRIP); addVox(g,0,3,0,METAL);
      } return g;
    }
    const ids=['bow1','bow3','warlord_blade','drowned_majesty','mushroom_staff','spore_dagger','fungal_blade','mycelial_staff','sword1','sword3','mace1','mace3'];
    const host=document.createElement('div');
    host.style.cssText='position:fixed;inset:0;overflow:auto;background:#0b0b12;z-index:99999;padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;';
    document.body.appendChild(host);
    for(const id of ids){
      const item=makeItem(id);
      if(id==='bow3') (item as any).enchantId='flaming';
      if(id==='warlord_blade') (item as any).enchantId='flaming';
      if(id==='fungal_blade') (item as any).enchantId='poison';
      const wrap=document.createElement('div');
      wrap.style.cssText='background:#131722;border:1px solid #c9a227;border-radius:10px;padding:8px;text-align:center;color:#efe3c2;font-family:sans-serif;min-height:200px;display:flex;flex-direction:column;align-items:center;';
      const title=document.createElement('div');
      title.textContent=`${item.icon} ${item.name} (${id}) ${(item as any).enchantId??''}`;
      title.style.cssText='font-size:11px;margin-bottom:6px;';
      const mount=document.createElement('div');
      mount.style.cssText='width:150px;height:150px;background:#0b0b12;border-radius:8px;';
      wrap.appendChild(title); wrap.appendChild(mount); host.appendChild(wrap);
      const view=attachVoxelView(mount,150,150);
      const scene=new THREE.Scene(); scene.background=new THREE.Color(0x0b0b12);
      scene.add(new THREE.HemisphereLight(0xffffff,0x222233,1.1));
      const key=new THREE.DirectionalLight(0xffe6c0,1.4); key.position.set(2,4,2); scene.add(key);
      let model: any;
      if(item.kind==='weapon') model=buildWeaponModel(item.weaponKind??'sword',0xc9a227);
      else { model=new THREE.Group(); addVox(model,0,0,0,GOLD); }
      if((item as any).enchantId){
        const c={flaming:0xff7a1f,frost:0x7dd3fc,poison:0x4ade80}[ (item as any).enchantId]??0xffd76b;
        const tip=new THREE.Mesh(new THREE.BoxGeometry(V,V,V), new THREE.MeshLambertMaterial({color:c,emissive:c,emissiveIntensity:0.9}));
        tip.position.set(0*V,8*V,0); model.add(tip);
      }
      // shroom extras
      if(id==='mushroom_staff'){ addVox(model,0,6,0,0x8a4a2e); addVox(model,1,6,0,0xd8cfc0); }
      if(id==='fungal_blade'){ addVox(model,1,3,0,0x8a4a2e); }
      model.updateWorldMatrix(true,true);
      const box=new THREE.Box3().setFromObject(model);
      const center=box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const size=box.getSize(new THREE.Vector3()); const maxExt=Math.max(size.x,size.y,size.z); const dist=Math.max(4,maxExt*2.4);
      const camera=new THREE.PerspectiveCamera(40,1,0.1,100);
      camera.position.set(dist*0.72,dist*0.5,dist*0.95); camera.lookAt(0,0,0);
      scene.add(model);
      view.renderOnce(scene,camera);
    }
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/items-final.png', fullPage: true });
});
