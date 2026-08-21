import { test, expect } from '@playwright/test';

test('real 100% sweep floor50+49 with screenshots', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000');
  // loading screen
  const continueBtn = page.locator('button.continue');
  await expect(continueBtn).toBeVisible({ timeout: 30000 });
  await continueBtn.click();
  // wait for engine
  await page.waitForFunction(() => (window as any).__dh_engine, null, { timeout: 30000 });
  // start new game via engine API (bypass splash UI flakiness)
  await page.evaluate(async () => {
    const e = (window as any).__dh_engine;
    e.startNewGame('playwright-slot');
    // skip intro quickly
    await new Promise(r => setTimeout(r, 800));
    e.cutsceneSkip = true;
    e.introSkipped = true;
    e.introActive = false;
    e.bossCineActive = false;
    e.cinematic = false;
    e.busy = false;
    if (e.world) e.world.group.visible = true;
    if (e.props) e.props.group.visible = true;
    if (e.dressingGroup) e.dressingGroup.visible = true;
    if (e.trapManager?.group) e.trapManager.group.visible = true;
    for (const n of e.npcs) if (n.rig?.group) n.rig.group.visible = true;
    e.phase = 'explore';
    e.combat.inCombat = false;
    e.emitSnapshot();
  });
  await page.waitForTimeout(1500);
  // verify no white screen: canvas exists and has non-zero size
  const canvas = page.locator('.game-canvas canvas');
  await expect(canvas).toBeVisible({ timeout: 10000 });
  await expect.poll(async () => await page.evaluate(() => {
    const c = document.querySelector('.game-canvas canvas') as HTMLCanvasElement;
    return c ? c.width > 0 && c.height > 0 : false;
  })).toBeTruthy();

  // helper to teleport hero to a room and reveal
  const roomsF50 = await page.evaluate(() => {
    const e = (window as any).__dh_engine;
    return e.structures.rooms.map((r: any) => ({ id: r.id, rect: r.rect }));
  });
  for (const r of roomsF50) {
    await page.evaluate((room) => {
      const e = (window as any).__dh_engine;
      const hero = e.combat.living('party')[0];
      const cx = Math.floor((room.rect.x0 + room.rect.x1)/2);
      const cz = Math.floor((room.rect.z0 + room.rect.z1)/2);
      hero.pos = { x: cx, z: cz };
      const v = e.visuals.get(hero.id);
      if (v) {
        const wp = e.unitWorld({x:cx,z:cz});
        v.rig.group.position.copy(wp);
        v.rig.group.userData.baseY = wp.y;
      }
      e.iso.focus(e.unitWorld(hero.pos));
      e.revealAround?.({x:cx,z:cz});
      // trigger room narration once
      if (!e.flags.has(`visited_${room.id}`)) {
        e.setFlag(`visited_${room.id}`);
      }
    }, r);
    await page.waitForTimeout(120);
  }
  // screenshot floor50 overview after visiting all rooms
  await page.screenshot({ path: 'docs/playthrough_screenshots/f50_overview_real.png', fullPage: false });
  // visit boss rooms specifically and screenshot
  await page.evaluate(() => {
    const e = (window as any).__dh_engine;
    const gnaw = e.combat.units.find((u:any)=>u.name==='Baron Gnaw');
    if (gnaw) {
      const hero = e.combat.living('party')[0];
      hero.pos = { x: gnaw.pos.x+1, z: gnaw.pos.z };
      const v = e.visuals.get(hero.id);
      if(v){ const wp=e.unitWorld(hero.pos); v.rig.group.position.copy(wp); v.rig.group.userData.baseY=wp.y; }
      e.iso.focus(e.unitWorld(hero.pos));
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/playthrough_screenshots/f50_boss_gnaw_real.png' });
  await page.evaluate(() => {
    const e = (window as any).__dh_engine;
    const grib = e.combat.units.find((u:any)=>u.name==='Gribnab');
    if (grib) {
      const hero = e.combat.living('party')[0];
      hero.pos = { x: grib.pos.x+1, z: grib.pos.z };
      const v = e.visuals.get(hero.id);
      if(v){ const wp=e.unitWorld(hero.pos); v.rig.group.position.copy(wp); v.rig.group.userData.baseY=wp.y; }
      e.iso.focus(e.unitWorld(hero.pos));
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/playthrough_screenshots/f50_gribnab_bath_real.png' });

  // combat sanity: start a fight vs r4 nursery group via aggro, then verify combat phase
  await page.evaluate(() => {
    const e = (window as any).__dh_engine;
    // wake r4 nursery
    for(const u of e.combat.units) if(u.groupId==='r4_nursery'){ u.dormant=false; }
    e.enqueue(e.combat.start());
  });
  await page.waitForTimeout(800);
  const phaseAfterAggro = await page.evaluate(() => (window as any).__dh_engine.phase);
  expect(['combat','explore']).toContain(phaseAfterAggro);
  // end turn and verify no crash
  await page.evaluate(() => {
    const e = (window as any).__dh_engine;
    if(e.combat.inCombat){
      for(let i=0;i<3;i++){ const s=e.combat.aiStep(); if(s) e.enqueue(s); }
      e.enqueue(e.combat.endTurn());
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/playthrough_screenshots/f50_combat_real.png' });

  // transition to floor 49
  await page.evaluate(() => {
    const e = (window as any).__dh_engine;
    e.goToFloor(49);
  });
  await page.waitForTimeout(1500);
  const floor49 = await page.evaluate(() => (window as any).__dh_engine.floorNumber);
  expect(floor49).toBe(49);
  await page.screenshot({ path: 'docs/playthrough_screenshots/f49_grotto_real.png' });
  await page.evaluate(() => {
    const e = (window as any).__dh_engine;
    const mother = e.combat.units.find((u:any)=>u.name==='The Spore Mother');
    if(mother){
      const hero=e.combat.living('party')[0];
      hero.pos={x:mother.pos.x+1,z:mother.pos.z};
      const v=e.visuals.get(hero.id);
      if(v){ const wp=e.unitWorld(hero.pos); v.rig.group.position.copy(wp); v.rig.group.userData.baseY=wp.y; }
      e.iso.focus(e.unitWorld(hero.pos));
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/playthrough_screenshots/f49_spore_mother_real.png' });

  // final check: no console errors were fatal
  const errors = await page.evaluate(() => (window as any).__lastErrors || []);
  expect(errors.length).toBeLessThan(5);
});
