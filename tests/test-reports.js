const { APP_URL, out, launch } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // Add a second project so reports have a portfolio to roll up
  await page.click('#btn-projects');
  await page.waitForTimeout(200);
  await page.check('#template-software');
  await page.click('#btn-create-project');
  await page.waitForTimeout(300);

  await page.click('#tab-reports');
  await page.waitForTimeout(300);

  const shots = (name) => out(name);

  for (const type of ['daily', 'weekly', 'steerco', 'executive']) {
    await page.click(`.report-type-btn[data-report="${type}"]`);
    await page.waitForTimeout(250);
    const title = await page.locator('#report-title').textContent();
    const period = await page.locator('#period-range-label').textContent();
    const currentBtn = await page.locator('#btn-current-period').textContent();
    const cards = await page.locator('#report-project-cards .card').count();
    const stats = await page.locator('#report-summary-cards .stat-card').count();
    console.log(`[${type}] title="${title}" period="${period}" currentBtn="${currentBtn}" cards=${cards} statCards=${stats}`);
    await page.screenshot({ path: shots(`report-${type}.png`), fullPage: true });
  }

  // Period navigation should move by the right unit per type
  await page.click('.report-type-btn[data-report="daily"]');
  await page.waitForTimeout(200);
  const d0 = await page.locator('#period-range-label').textContent();
  await page.click('#btn-next-period');
  await page.waitForTimeout(150);
  const d1 = await page.locator('#period-range-label').textContent();
  console.log('daily period nav:', d0, '->', d1);

  await page.click('.report-type-btn[data-report="steerco"]');
  await page.waitForTimeout(200);
  const m0 = await page.locator('#period-range-label').textContent();
  await page.click('#btn-prev-period');
  await page.waitForTimeout(150);
  const m1 = await page.locator('#period-range-label').textContent();
  console.log('steerco period nav:', m0, '->', m1);
  await page.click('#btn-current-period');
  await page.waitForTimeout(150);
  console.log('steerco back to current:', await page.locator('#period-range-label').textContent());
  console.log('subtitle:', (await page.locator('#report-subtitle').textContent()).slice(0, 140));

  // Executive table content
  await page.click('.report-type-btn[data-report="executive"]');
  await page.waitForTimeout(200);
  const rows = await page.locator('.exec-table tbody tr').count();
  const firstRow = await page.locator('.exec-table tbody tr').first().allInnerTexts();
  console.log('exec table rows:', rows, '| first row:', JSON.stringify(firstRow[0]));

  // Copy button
  await page.click('#btn-report-copy');
  await page.waitForTimeout(300);
  console.log('copy button text after click:', await page.locator('#btn-report-copy').textContent());

  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
