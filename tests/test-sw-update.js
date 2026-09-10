const { SW_URL, SW_COPY, launch } = require('./harness');
const fs = require('fs');
const DIR = SW_COPY;   // the runner makes this disposable copy

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // Version numbers are relative: whatever the copy currently ships is the
  // "old" build, and the test bumps past it. Pinning a literal version meant
  // this suite broke every time the real CACHE_VERSION moved.
  const swPath = DIR + '/sw.js';
  const readSw = () => fs.readFileSync(swPath, 'utf8');
  const setVersion = (v) => fs.writeFileSync(swPath, readSw().replace(/const CACHE_VERSION = '[^']+'/, `const CACHE_VERSION = '${v}'`));
  const baseVersion = 'test-a';
  setVersion(baseVersion);

  await page.goto(SW_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });   // now controlled by the base build
  await page.waitForTimeout(800);
  console.log('controlled:', await page.evaluate(() => !!navigator.serviceWorker.controller));
  console.log('banner hidden before update (expect true):', await page.locator('#update-nudge').isHidden());

  // --- Ship "a new version" ---
  setVersion('test-b');
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await page.waitForSelector('#update-nudge:not([hidden])', { timeout: 10000 });
  console.log('banner appeared after new sw shipped:', (await page.locator('#update-nudge').textContent()).replace(/\s+/g, ' ').trim());
  const st = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r.waiting, active: r.active && r.active.state }; });
  console.log('registration state (new one waits, old still active):', JSON.stringify(st));

  // --- Reload button: skipWaiting -> controllerchange -> location.reload() ---
  const navPromise = page.waitForNavigation({ timeout: 15000 });
  await page.click('#btn-nudge-reload');
  await navPromise;
  await page.waitForTimeout(800);
  const after = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    const names = await caches.keys();
    return { waiting: !!r.waiting, caches: names };
  });
  console.log('after Reload -> caches:', after.caches.join(','), '| still waiting:', after.waiting);
  if (!after.caches.some((name) => name.includes('test-b'))) {
    console.log('FAIL expected the new build\'s cache to be the only one left');
  }
  console.log('banner hidden after reload:', await page.locator('#update-nudge').isHidden());
  console.log('app still renders:', await page.locator('#page-title').textContent());

  // --- Dismiss path on a real banner ---
  setVersion('test-c');
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await page.waitForSelector('#update-nudge:not([hidden])', { timeout: 10000 });
  await page.click('#btn-nudge-update-dismiss');
  console.log('banner hidden after dismiss (expect true):', await page.locator('#update-nudge').isHidden());

  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  setVersion(baseVersion);
  await browser.close();
})();
