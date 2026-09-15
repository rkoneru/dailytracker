const { APP_URL, out, launch } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // --- Fix 1: user text is rendered as text, never interpolated into markup ---
  // The pie legend this originally guarded is gone (the Priority Board owns
  // the status split now), so the check follows the same hostile string into
  // the surfaces that do render task names.
  const hostile = '<img src=x onerror=alert(1)>Hostile';
  await page.click('#tab-tasks');
  await page.waitForTimeout(400);
  await page.locator('#tracker-body tr').first().locator('[data-field="name"]').fill(hostile);
  await page.waitForTimeout(500);
  await page.click('#tab-dashboard');
  await page.waitForTimeout(500);
  const injected = await page.evaluate(() => ({
    gantt: document.querySelectorAll('#dash-gantt img, #dash-gantt script').length,
    deadlines: document.querySelectorAll('#upcoming-deadlines img, #upcoming-deadlines script').length,
    label: document.querySelector('#dash-gantt .gantt-chart__label').textContent,
  }));
  console.log('injected elements (expect 0/0):', injected.gantt, '/', injected.deadlines);
  console.log('hostile name rendered as text:', JSON.stringify(injected.label));

  // --- Fix 4: uid() is a uuid in a secure-ish context ---
  const ids = await page.evaluate(async () => {
    const { uid } = await import('./js/state.js');
    return [uid(), uid()];
  });
  console.log('uid samples:', ids.join(' , '));
  console.log('uuid format:', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ids[0]));

  // --- Fix 3: quota failure surfaces in the indicator ---
  await page.evaluate(() => {
    const real = localStorage.setItem.bind(localStorage);
    window.__restoreLS = () => { localStorage.setItem = real; };
    localStorage.setItem = (k, v) => {
      if (k === 'projectPlannerStore_v2') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      return real(k, v);
    };
  });
  await page.click('#tab-planner');
  await page.waitForTimeout(200);
  await page.locator('[data-field="projectName"]').first().fill('Storage full test');
  await page.waitForTimeout(700);
  console.log('indicator on failed write:', await page.locator('#save-indicator').textContent());
  console.log('indicator classes:', await page.locator('#save-indicator').getAttribute('class'));
  console.log('indicator color:', await page.evaluate(() => getComputedStyle(document.getElementById('save-indicator')).color));

  await page.evaluate(() => window.__restoreLS());
  await page.locator('[data-field="projectName"]').first().fill('Storage ok again');
  await page.waitForTimeout(700);
  console.log('indicator after recovery:', await page.locator('#save-indicator').textContent(), '|', await page.locator('#save-indicator').getAttribute('class'));

  // --- Fix 2: update banner shows when a waiting worker appears ---
  await page.waitForTimeout(500);
  const swState = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { active: !!r.active, waiting: !!r.waiting, controller: !!navigator.serviceWorker.controller };
  });
  console.log('sw state after first install:', JSON.stringify(swState));
  console.log('update banner hidden on first install (expect true):', await page.locator('#update-nudge').isHidden());

  // Reveal the banner directly just to check its appearance. The Reload and
  // Dismiss buttons bind inside showUpdateNudge(), which only a real waiting
  // worker triggers, so those are covered by test-sw-update.js instead.
  await page.evaluate(() => { document.getElementById('update-nudge').hidden = false; });
  console.log('banner text:', (await page.locator('#update-nudge').textContent()).replace(/\s+/g, ' ').trim());
  console.log('banner bg:', await page.evaluate(() => getComputedStyle(document.getElementById('update-nudge')).backgroundColor));
  await page.screenshot({ path: out('update-banner.png') });

  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
