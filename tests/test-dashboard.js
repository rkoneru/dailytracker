const { APP_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const tile = (id) => page.evaluate((i) => {
    const node = document.getElementById(i);
    return {
      value: node.querySelector('.kpi__value').textContent,
      sub: node.querySelector('.kpi__sub').textContent,
      tone: ['is-good', 'is-warn', 'is-bad', 'is-idle'].find((c) => node.classList.contains(c)),
    };
  }, id);

  console.log('\n--- each breakdown appears exactly once ---');
  eq('one status pie', await page.locator('#status-pie').count(), 1);
  eq('no status summary table', await page.locator('#status-summary-table').count(), 0);
  eq('no priority summary table', await page.locator('#priority-summary-table').count(), 0);
  eq('no kanban buckets', await page.locator('.kanban-summary').count(), 0);

  console.log('\n--- the KPI row answers the questions worth asking ---');
  eq('labels', await page.$$eval('#page-dashboard .kpi__label', (els) => els.map((e) => e.textContent)),
     ['Progress', 'Overdue', 'Worst slip', 'Open RAID']);

  const progress = await tile('kpi-progress');
  eq('progress shows the fraction', progress.sub, '2 of 9 tasks done');

  const overdue = await tile('kpi-overdue');
  eq('overdue counts them', overdue.value, '2');
  eq('and names them', overdue.sub.includes('Ad account'), true);
  eq('and reads as bad', overdue.tone, 'is-bad');

  const slip = await tile('kpi-slip');
  eq('slip reports the worst', slip.value, '+7d');
  eq('with how many are behind', slip.sub, '2 tasks behind baseline');
  eq('and reads as a warning', slip.tone, 'is-warn');

  const raid = await tile('kpi-raid');
  eq('raid counts open items', raid.value, '4');

  console.log('\n--- tone tracks the data, it is not decoration ---');
  await page.click('#tab-planner');
  await page.waitForTimeout(400);
  // Clear the baseline: the slip tile has nothing to measure against.
  await page.click('#btn-clear-baseline');
  await page.waitForSelector('.dialog');
  await page.click('.dialog .btn-danger');
  await page.waitForTimeout(500);
  await page.click('#tab-dashboard');
  await page.waitForTimeout(500);
  const noBaseline = await tile('kpi-slip');
  eq('no baseline reads as idle, not good', noBaseline.tone, 'is-idle');
  eq('and says so', noBaseline.sub, 'No baseline set');

  // Mark every overdue task complete: the overdue tile should go quiet.
  await page.click('#tab-planner');
  await page.waitForTimeout(400);
  const rows = await page.locator('#tasks-body tr').count();
  for (let i = 0; i < rows; i += 1) {
    await page.selectOption(`#tasks-body tr:nth-child(${i + 1}) [data-field="status"]`, 'Complete');
    await page.waitForTimeout(120);
  }
  await page.click('#tab-dashboard');
  await page.waitForTimeout(600);
  const clear = await tile('kpi-overdue');
  eq('nothing overdue once everything is done', clear.value, '0');
  eq('and it reads as good', clear.tone, 'is-good');
  eq('progress reached 100%', (await tile('kpi-progress')).value, '100%');

  console.log('\n--- other projects means other ---');
  eq('the current project is not listed as an "other" project',
     (await page.textContent('#active-projects-list')).trim(), 'This is your only project.');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-event');
  await page.click('#btn-create-project');
  await page.waitForTimeout(700);
  await page.click('#tab-dashboard');
  await page.waitForTimeout(600);
  const listed = await page.$$eval('#active-projects-list .active-projects-list__name', (els) => els.map((e) => e.textContent));
  eq('exactly one other project now', listed.length, 1);
  eq('and it is not the one on screen',
     listed.includes(await page.textContent('#dash-project-name')), false);

  console.log('\n--- layout ---');
  const gaps = await page.evaluate(() => {
    // Cards in a row should size to their own content, not stretch to the
    // tallest sibling — that stretching was most of the old dead space.
    const row = document.querySelectorAll('.dash-row--3')[0];
    return [...row.children].map((c) => Math.round(c.getBoundingClientRect().height));
  });
  eq('cards in a row have their own heights', new Set(gaps).size > 1, true);

  eq('no page overflow at phone width', await page.evaluate(async () => {
    window.resizeTo(400, 900);
    return document.documentElement.scrollWidth > window.innerWidth + 1;
  }), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
