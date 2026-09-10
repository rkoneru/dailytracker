const { APP_URL, launch } = require('./harness');
(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const external = [];
  page.on('request', r => { if (!r.url().startsWith(APP_URL + '')) external.push(r.url()); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Do a normal session's worth of work with sync switched off.
  await page.click('#tab-planner'); await page.waitForTimeout(200);
  await page.locator('[data-field="projectName"]').first().fill('Local only run');
  await page.waitForTimeout(700);
  await page.click('#tab-dashboard'); await page.waitForTimeout(300);
  await page.click('#tab-raid'); await page.waitForTimeout(300);
  await page.click('#tab-reports'); await page.waitForTimeout(400);
  await page.waitForTimeout(3500);   // longer than the sync push debounce

  console.log('requests off-origin (expect none):', external.length ? external.join(', ') : '(none)');
  console.log('sync pill hidden:', await page.locator('#sync-pill').isHidden());
  console.log('data persisted:', await page.evaluate(() => !!localStorage.getItem('projectPlannerStore_v2')));
  console.log('no sync baseline written:', await page.evaluate(() => localStorage.getItem('projectPlannerSyncBase_v1') === null));
  console.log('project name kept:', await page.evaluate(async () => (await import('/js/state.js')).getState().projectName));
  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
