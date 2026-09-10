const { APP_URL, launch } = require('./harness');

// The app uses in-page dialogs now, not window.confirm, so a test drives them
// like any other UI: click the button, then the dialog's own action.
async function acceptDialog(page) {
  await page.waitForSelector('.dialog', { timeout: 5000 });
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(200);
}

async function fillDialog(page, value) {
  await page.waitForSelector('.dialog input', { timeout: 5000 });
  await page.fill('.dialog input', value);
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(200);
}

async function toastText(page) {
  await page.waitForSelector('.toast', { timeout: 5000 });
  return (await page.textContent('.toast__text')).trim();
}
(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  console.log('sync pill hidden when unconfigured (expect true):', await page.locator('#sync-pill').isHidden());
  await page.click('#tab-sync');
  await page.waitForTimeout(300);
  console.log('page title:', await page.locator('#page-title').textContent());
  console.log('setup visible:', await page.locator('#sync-setup').isVisible(),
              '| signin hidden:', await page.locator('#sync-signin').isHidden(),
              '| account hidden:', await page.locator('#sync-account').isHidden());

  // --- validation ---
  await page.fill('#sync-url', 'ftp://nope');
  await page.fill('#sync-key', 'k');
  await page.click('#btn-sync-connect');
  console.log('bad url message:', await page.locator('#sync-setup-message').textContent());

  await page.fill('#sync-url', 'https://demo.supabase.co');
  await page.fill('#sync-key', '');
  await page.click('#btn-sync-connect');
  console.log('empty key message:', await page.locator('#sync-setup-message').textContent());

  // --- connect ---
  await page.fill('#sync-key', 'anon-test-key');
  await page.click('#btn-sync-connect');
  await page.waitForTimeout(300);
  console.log('connected message:', await page.locator('#sync-setup-message').textContent());
  console.log('signin now visible:', await page.locator('#sync-signin').isVisible());
  console.log('connect btn label:', await page.locator('#btn-sync-connect').textContent());
  console.log('key field cleared:', (await page.inputValue('#sync-key')) === '');
  console.log('key placeholder:', await page.getAttribute('#sync-key', 'placeholder'));
  console.log('pill now:', await page.locator('#sync-pill').textContent(), '| hidden:', await page.locator('#sync-pill').isHidden());
  await page.screenshot({ path: '../sync-page.png', fullPage: true });

  // --- disconnect restores local-only ---
  await page.click('#btn-sync-disconnect');
  await acceptDialog(page);
  await page.waitForTimeout(300);
  console.log('after disconnect -> pill hidden:', await page.locator('#sync-pill').isHidden(),
              '| signin hidden:', await page.locator('#sync-signin').isHidden());
  console.log('disconnect message:', await page.locator('#sync-setup-message').textContent());

  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
