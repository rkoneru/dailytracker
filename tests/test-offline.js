const { APP_URL, launch } = require('./harness');

(async () => {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  // Wait for service worker to actually control + finish precaching
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 10000 }).catch(() => console.log('SW never took control within timeout'));
  await page.waitForTimeout(1000);

  await context.setOffline(true);
  console.log('Set offline. Reloading...');
  let offlineOk = true;
  try {
    await page.reload({ waitUntil: 'load', timeout: 10000 });
  } catch (e) {
    offlineOk = false;
    console.log('Reload failed offline:', e.message);
  }
  const title = await page.title().catch(() => null);
  const projectName = await page.locator('#page-planner h1.editable').textContent().catch(() => null);
  console.log('Offline reload OK:', offlineOk, '| title:', title, '| projectName:', projectName);

  // Check manifest fetchable offline via link tag resolution (already part of page, but let's also verify icon loads)
  const iconVisible = await page.locator('.app-header__brand img').isVisible().catch(() => false);
  console.log('Icon visible offline:', iconVisible);

  await context.setOffline(false);
  await browser.close();
})();
