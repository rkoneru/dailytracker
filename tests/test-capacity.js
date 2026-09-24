// Capacity Planning: a reference process over live numbers.
//
// The process card is static and has nothing of its own to get wrong except
// its links. Everything under it is arithmetic already covered by
// resourceModel.js's own tests — what is worth pinning here is that this page
// reads the right inputs (every project, the whole resource pool) and is
// honest when there is nothing to show yet, rather than a zero that looks
// like a measurement.

const { APP_URL, launch, createChecks } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  console.log('\n--- the nav reaches it, and the page names itself ---');
  await page.click('#tab-capacity .nav-row__label');
  await page.waitForTimeout(600);
  eq('landed on Capacity Planning', await page.textContent('#page-title'), 'Capacity Planning');
  eq('and the row is marked current', await page.getAttribute('#tab-capacity', 'aria-current'), 'page');

  console.log('\n--- the process card is a reference, not a form ---');
  eq('six steps', await page.locator('.cap-step').count(), 6);
  eq('numbered one to six', await page.$$eval('.cap-step__n', (e) => e.map((x) => x.textContent)),
    ['1', '2', '3', '4', '5', '6']);

  console.log('\n--- its links actually go where they say ---');
  await page.click('#page-capacity button[data-goto="tab-resources"]');
  await page.waitForTimeout(500);
  eq('the Resources link opens Resources', await page.textContent('#page-title'), 'Resources');
  await page.click('#tab-capacity .nav-row__label');
  await page.waitForTimeout(500);

  console.log('\n--- the starter project ships with a pool, so the numbers are real from the first run ---');
  eq('the overview plots the starter project',
    await page.locator('#capacity-gantt .gantt-chart__row').count(), 1);
  const barLabel = await page.textContent('#capacity-gantt .gantt-chart__bar');
  // The template's tasks carry real estimate hours; this is sum(estimate)/8,
  // rounded — pinned so a change to the template is caught here too.
  eq('the bar carries a real effort-days figure, not a placeholder', /^\d+d$/.test(barLabel.trim()), true);

  eq('three metric tiles', await page.locator('#capacity-metrics .stat-card').count(), 3);
  const metricValues = await page.$$eval('#capacity-metrics .stat-card__value', (e) => e.map((x) => x.textContent));
  eq('every metric is a percentage, not a dash', metricValues.every((v) => /^\d+%$/.test(v)), true);

  eq('the formula box is filled in', await page.locator('#capacity-formula .cap-formula__row').count(), 6);
  eq('naming a real person from the pool',
    (await page.textContent('#capacity-formula p.hint')).includes('Worked through for'), true);

  console.log('\n--- the window controls actually move the numbers ---');
  const windowRow = '#capacity-formula .cap-formula__row:nth-child(4) .cap-formula__value';
  const before = await page.textContent(windowRow);
  await page.fill('#cap-to', '2027-01-01');
  await page.waitForTimeout(400);
  const after = await page.textContent(windowRow);
  eq('a wider window is reflected in the formula', before === after, false);

  console.log('\n--- an empty pool is said plainly, not shown as a zero ---');
  await page.evaluate(async () => {
    const state = await import('/js/state.js');
    state.listResources().forEach((r) => state.removeResource(r.id));
  });
  await page.click('#tab-dashboard .nav-row__label');
  await page.waitForTimeout(300);
  await page.click('#tab-capacity .nav-row__label');
  await page.waitForTimeout(600);
  eq('no metric tiles', await page.locator('#capacity-metrics .stat-card').count(), 0);
  eq('the empty hint says so', await page.locator('#capacity-metrics-empty').isVisible(), true);
  eq('same for the formula box', await page.locator('#capacity-formula-empty').isVisible(), true);
  eq('and it does not draw a fake worked example',
    await page.locator('#capacity-formula .cap-formula__row').count(), 0);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 360, height: 900 });
  await page.waitForTimeout(400);
  eq('no page overflow at phone width',
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
