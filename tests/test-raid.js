const { APP_URL, out, launch } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // --- RAID page loads with template data ---
  await page.click('#tab-raid');
  await page.waitForTimeout(300);
  console.log('page title:', await page.locator('#page-title').textContent());
  console.log('raid rows:', await page.locator('#raid-body tr').count());
  console.log('summary tiles:', (await page.locator('.raid-tile .stat-card__value').allTextContents()).join('/'));
  const scores = await page.locator('#raid-body .score-chip').allTextContents();
  console.log('risk scores rendered:', scores.join(', '));
  await page.screenshot({ path: out('raid-page.png'), fullPage: true });

  // --- Scoring: change likelihood, score must recompute ---
  const firstRow = page.locator('#raid-body tr').first();
  const before = await firstRow.locator('.score-chip').textContent();
  await firstRow.locator('select[data-field="likelihood"]').selectOption('High');
  await page.waitForTimeout(250);
  const after = await firstRow.locator('.score-chip').textContent();
  console.log(`score after raising likelihood to High: ${before} -> ${after}`);

  // --- Non-risk types have no score ---
  const issueRow = page.locator('#raid-body tr').nth(1);
  const issueScore = await issueRow.locator('.col-score').textContent();
  console.log('issue row score cell (expect dash):', JSON.stringify(issueScore.trim()));

  // --- Filters ---
  await page.selectOption('#raid-type-filter', 'Decision');
  await page.waitForTimeout(200);
  console.log('visible rows filtered to Decision:', await page.locator('#raid-body tr:not([hidden])').count());
  await page.selectOption('#raid-type-filter', '');
  await page.fill('#raid-search', 'legal');
  await page.waitForTimeout(200);
  console.log('visible rows searching "legal":', await page.locator('#raid-body tr:not([hidden])').count());
  await page.fill('#raid-search', '');
  await page.waitForTimeout(150);

  // --- Tile click filters ---
  await page.locator('.raid-tile[data-type="Risk"]').click();
  await page.waitForTimeout(200);
  console.log('rows after clicking Risk tile:', await page.locator('#raid-body tr:not([hidden])').count());
  await page.locator('.raid-tile[data-type="Risk"]').click();
  await page.waitForTimeout(200);

  // --- Closing an item removes it from the open counts ---
  const openBefore = await page.locator('.raid-tile .stat-card__value').first().textContent();
  await firstRow.locator('select[data-field="status"]').selectOption('Closed');
  await page.waitForTimeout(300);
  const openAfter = await page.locator('.raid-tile .stat-card__value').first().textContent();
  console.log(`open risks after closing one: ${openBefore} -> ${openAfter}`);
  console.log('closed row hidden under "Open only":', await firstRow.evaluate(el => el.hidden));

  // --- Add + delete ---
  await page.click('#btn-add-raid');
  await page.waitForTimeout(250);
  console.log('rows after add:', await page.locator('#raid-body tr').count());

  // --- Dashboard RAID chart is live ---
  await page.click('#tab-dashboard');
  await page.waitForTimeout(300);
  console.log('dashboard RAID bars:', (await page.locator('#raid-chart .bar-col__value').allTextContents()).join('/'));
  console.log('dashboard RAID note:', await page.locator('#raid-chart-note').textContent());

  // --- Reports pull from RAID ---
  await page.click('#tab-reports');
  await page.waitForTimeout(300);
  await page.click('.report-type-btn[data-report="steerco"]');
  await page.waitForTimeout(300);
  const headings = await page.locator('#report-project-cards .report-card__section h4').allTextContents();
  console.log('steerco sections:', headings.join(' | '));
  await page.screenshot({ path: out('steerco-raid.png'), fullPage: true });

  await page.click('.report-type-btn[data-report="executive"]');
  await page.waitForTimeout(300);
  const execHeads = await page.locator('#report-project-cards .card__head h2').allTextContents();
  console.log('exec cards:', execHeads.join(' | '));

  const context = page.context();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('.report-type-btn[data-report="steerco"]');
  await page.waitForTimeout(200);
  await page.click('#btn-report-copy');
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  console.log('--- steerco text ---');
  console.log(text.split('\n').slice(0, 10).join('\n'));

  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
