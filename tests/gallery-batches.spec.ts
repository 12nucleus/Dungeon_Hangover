import { test } from '@playwright/test';

const batches = [
  ['sword1','sword2','sword3','dagger1','dagger2','dagger3','bow1','bow2','bow3','mace1','mace2','mace3','club1','club2','club3','staff1','staff2','staff3','torch1','rusty_sword','rusty_axe','rusty_mace','rusty_spear','goblin_spear'],
  ['padded','leather','chain','plate','ring','amulet','cloak','warlord_blade','severed_finger','toeless_boots','leather_vest','chain_shirt','guards_cap','pipe_helmet','ribcage_armor','leather_bracers','rusty_bracers','wooden_shield','soap_crown','hermits_ring','leather_belt','goblin_banner','tattered_cloak','sturdy_boots','leather_boot'],
  ['potion','potion_greater','iron_key','golden_key','broken_bottle','rat_bone','wrench','plunger','drowned_majesty','towel','rope','wooden_bucket','lockpick','love_letter','waterlogged_book','moldy_cheese','wine_bottle','holy_water','dwarven_ale','ghost_soup','sewer_water_flask','bubble_bath','rubber_duck','water_flask','goblin_soap'],
  ['premium_soap','soap_chunk','glowing_mushroom','poison_mushroom','mushroom_staff','spore_dagger','vine_whip','fungal_blade','mycelial_staff','spore_crown','mushroom_cap','vine_cloak','frog_skin_cloak','waterlogged_boots','moon_cap','spore_heart','hallucinogenic_spore','cave_fish_meat','crystal_shard','glowing_spore','mycologist_satchel','vine_fiber','frog_tongue','seventh_cap','giant_cap'],
];

for (let bi = 0; bi < batches.length; bi++) {
  test(`readable item batch ${bi + 1}`, async ({ page }) => {
    await page.goto('http://127.0.0.1:3000/');
    await page.waitForTimeout(1000);
    await page.evaluate(async (ids: string[]) => {
      const { makeItem } = await import('/src/game/items.ts');
      const { buildItemModel } = await import('/src/components/VoxelItemIcon.tsx');
      const { attachVoxelView } = await import('/src/components/voxelView.ts');
      const THREE: any = await import('/node_modules/three/build/three.module.js');
      const root = document.createElement('div');
      root.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#080a10;z-index:99999;padding:18px;display:grid;grid-template-columns:repeat(5,minmax(180px,1fr));gap:16px;';
      document.body.appendChild(root);
      for (const id of ids) {
        const item: any = makeItem(id);
        const card = document.createElement('div');
        card.style.cssText = 'background:#171c29;border:1px solid #d4ad39;border-radius:10px;padding:10px;color:#f4e6c1;font:14px Georgia;text-align:center;';
        card.innerHTML = `<div style="height:38px;line-height:18px">${item.icon} <b>${item.name}</b><br><small>${id} | ${item.kind}</small></div>`;
        const mount = document.createElement('div');
        mount.style.cssText = 'width:180px;height:180px;margin:auto;background:#05070c;border-radius:8px;';
        card.appendChild(mount); root.appendChild(card);
        const view = attachVoxelView(mount, 180, 180);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070c);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x536078, 1.8));
        const key = new THREE.DirectionalLight(0xffe2ad, 2.6); key.position.set(4, 7, 5); scene.add(key);
        const fill = new THREE.DirectionalLight(0x8fb8ff, 1.5); fill.position.set(-5, 3, -4); scene.add(fill);
        const model = buildItemModel(item); model.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(model); const center = box.getCenter(new THREE.Vector3()); model.position.sub(center);
        const size = box.getSize(new THREE.Vector3()); const dist = Math.max(3.8, Math.max(size.x, size.y, size.z) * 2.25);
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100); camera.position.set(dist * .72, dist * .48, dist * .95); camera.lookAt(0,0,0);
        scene.add(model); view.renderOnce(scene, camera);
      }
    }, batches[bi]);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `test-results/items-batch-${bi + 1}.png`, fullPage: true });
  });
}
