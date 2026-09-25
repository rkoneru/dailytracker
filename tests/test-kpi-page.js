// The KPI page: twenty cards, five tabs, and an honest account of what the
// app cannot answer yet.
//
// The arithmetic is tested away from the browser in test-kpis.mjs. What is
// pinned here is the part that only exists on screen: that all twenty appear
// whether or not they have a number, that an unmeasured one says what would
// fill it in, and that the page follows the data when the data changes.

const { APP_URL, launch, createChecks, openSection, chooseLifecycle } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const cardValue = (id) => page.textContent(`.kpi-card[data-kpi="${id}"] .kpi-card__number`);

  console.log('\n--- every indicator is on the page ---');
  await page.click('#tab-kpis .nav-row__label');
  await page.waitForTimeout(600);
  eq('landed on the KPI page', await page.textContent('#page-title'), 'Project KPIs');
  eq('thirty-five cards', await page.locator('.kpi-card').count(), 35);
  eq('and a row explaining each', await page.locator('#kpi-basis-body tr').count(), 35);
  eq('seven categories', await page.evaluate(() => ['schedule', 'cost', 'scope', 'risk', 'quality', 'improvement', 'customer']
    .map((c) => document.querySelectorAll(`#kpi-grid-${c} .kpi-card`).length)), [4, 5, 5, 5, 5, 2, 9]);
  eq('numbered in the order they are shown', await page.$$eval('.kpi-card .kpi-card__n', (e) => e.map((x) => Number(x.textContent))),
     Array.from({ length: 35 }, (_, i) => i + 1));

  console.log('\n--- the starter project answers every project indicator, and admits the rest ---');
  // A marketing campaign has no customer accounts, no rates on its people and
  // no closed decisions, so those read "not measured" and say what would
  // measure them — rather than the starter being padded with data to look full.
  eq('coverage is stated', await page.textContent('#kpi-coverage'), '23 of 35 measured');
  eq('only the ones it has no data for read as unmeasured',
     await page.$$eval('.kpi-card.is-unmeasured', (e) => e.map((x) => x.dataset.kpi)),
     ['grossMargin', 'decisionSpeed', 'improvementDelivery', 'customerRetention', 'churnRate', 'grr', 'nrr', 'nps', 'ltv', 'cac', 'ltvCac', 'timeToValue']);
  eq('and each says what would fill it', await page.$$eval('.kpi-card.is-unmeasured', (e) => e.every((x) => x.querySelector('.kpi-card__needs')?.textContent.length > 10)), true);
  eq('a bad KPI is paired with its KRI',
     await page.textContent('.kpi-card[data-kpi="cpi"] .kpi-card__kri'), 'KRICost efficiency declining');
  // EAC has a number and no verdict. It is grey, but it is not blank — the
  // two greys have to stay distinguishable or a real forecast reads as absent.
  eq('a forecast is tone-neutral but still a number',
     await page.locator('.kpi-card[data-kpi="eac"].is-idle:not(.is-unmeasured)').count(), 1);
  eq('and shows one', (await cardValue('eac')).endsWith('h'), true);

  console.log('\n--- the numbers are the ones the data implies ---');
  // Hand-checked against the sample: BAC 206h, EV ~77h, AC 100h.
  eq('CPI', await cardValue('cpi'), '0.77');
  eq('rework is a tenth of the spend it is measured against', await cardValue('reworkPct'), '8%');
  eq('defect density counts the two deliverables that were checked', await cardValue('defectDensity'), '1.50');
  eq('one issue is still open', await cardValue('openIssues'), '1');
  eq('and the closed one took three days', await cardValue('issueResolution'), '3.0 d');

  console.log('\n--- it follows the data, rather than caching a verdict ---');
  const before = await cardValue('taskRate');
  await page.click('#tab-tasks .nav-row__label');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-task-list');
  await page.selectOption('#tracker-body tr:nth-child(3) [data-field="status"]', 'Complete');
  await page.waitForTimeout(500);
  await page.click('#tab-kpis .nav-row__label');
  await page.waitForTimeout(600);
  eq('completing a task moves the completion rate',
     (await cardValue('taskRate')) !== before, true);

  console.log('\n--- an empty project says so, rather than inventing numbers ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-blank');
  await chooseLifecycle(page);
  await page.click('#btn-create-project');
  await page.waitForTimeout(900);
  await page.click('#tab-kpis .nav-row__label');
  await page.waitForTimeout(700);
  eq('still every card', await page.locator('.kpi-card').count(), 35);
  eq('most of them unmeasured', (await page.locator('.kpi-card.is-unmeasured').count()) > 10, true);
  eq('SPI is not invented', await cardValue('spi'), 'Not measured');
  eq('nor is a perfect CPI', await cardValue('cpi'), 'Not measured');
  eq('and the card says what would fill it in',
     (await page.textContent('.kpi-card[data-kpi="spi"] .kpi-card__needs')).includes('estimate'), true);
  eq('the basis table marks it too',
     await page.textContent('#kpi-basis-body tr:nth-child(2) .tone-chip'), 'Not measured');

  console.log('\n--- an unmeasured KPI is grey, never green ---');
  eq('no unmeasured card is coloured', await page.evaluate(() => {
    const blank = [...document.querySelectorAll('.kpi-card.is-unmeasured')];
    return blank.every((c) => !c.classList.contains('is-good') && !c.classList.contains('is-warn'));
  }), true);

  console.log('\n--- a link reaches each category ---');
  // Sections are the page's tab strip, not sidebar rows; a link reaches them.
  await page.evaluate(() => { window.location.hash = '#/nav-kpi-quality'; });
  await page.waitForTimeout(500);
  // The six categories share the Indicators tab, so a link to one opens it.
  eq('the indicators tab is the one showing, quality included', await page.evaluate(() =>
    !document.getElementById('sec-kpi-quality').classList.contains('is-tab-hidden')
    && document.getElementById('sec-kpi-framework').classList.contains('is-tab-hidden')), true);

  console.log('\n--- the wider framework says what is and is not tracked ---');
  await openSection(page, 'sec-kpi-framework');
  await page.waitForTimeout(500);
  eq('twelve categories', await page.locator('#kpi-framework-table tbody tr').count(), 12);
  eq('a tracked one links back to its live section',
     await page.locator('#kpi-framework-table button[data-goto="nav-kpi-schedule"]').count() > 0, true);
  await page.click('#kpi-framework-table button[data-goto="nav-kpi-schedule"]');
  await page.waitForTimeout(500);
  eq('clicking it actually lands there', await page.evaluate(() =>
    !document.getElementById('sec-kpi-schedule').classList.contains('is-tab-hidden')), true);
  await openSection(page, 'sec-kpi-framework');
  await page.waitForTimeout(500);
  eq('an untracked one says so rather than being silently absent',
     (await page.textContent('#kpi-framework-table')).includes('not tracked'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 400, height: 900 });
  await page.waitForTimeout(400);
  eq('no page overflow at phone width',
     await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
