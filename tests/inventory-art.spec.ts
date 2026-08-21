import { test } from '@playwright/test';
test('inventory art', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(3000);
  // start new game
  await page.evaluate(async () => {
    const eng: any = (window as any).__engine;
    if (!eng) throw new Error('no engine');
    eng.startNewGame('slot1');
  });
  await page.waitForTimeout(3000);
  await page.evaluate(async () => {
    const eng: any = (window as any).__engine;
    const { makeItem } = await import('/src/game/items.ts');
    const ids = ['mace1','mace2','mace3','sword1','sword2','sword3','dagger1','dagger2','dagger3','bow1','bow2','bow3'];
    // clear and add distinct
    eng.inventory = [];
    for(const id of ids){
      const it = makeItem(id);
      if(id==='sword3') (it as any).enchantId='flaming';
      if(id==='mace3') (it as any).enchantId='frost';
      if(id==='bow3') (it as any).enchantId='shocking';
      eng.inventory.push(it);
    }
    eng.gold = 999;
    eng.showInventory = true;
    eng.emitSnapshot();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/inventory-art.png', fullPage: true });
  // now inspect one item
  await page.evaluate(async () => {
    const eng: any = (window as any).__engine;
    // find sword3 item id
    const it = eng.inventory.find((i:any)=> i._baseId==='sword3');
    if(it){
      // trigger inspect by setting selected and opening inspect via HUD? Instead directly create ItemInspect overlay via DOM
      // For now, just ensure inventory is visible
    }
  });
  await page.waitForTimeout(1000);
});
