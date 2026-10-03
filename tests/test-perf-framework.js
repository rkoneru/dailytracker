// Inputs to results: the performance framework laid over the indicators.
//
// Pins that every indicator the framework names exists; that every box
// either names indicators, stands for measurement coverage, or says why
// nothing here measures it; and that the page draws inputs and the system as
// leading and the results as lagging, grey where unmeasured.

const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  console.log('\n--- the mapping ---');
  const r = await page.evaluate(async () => {
    const f = await import('/js/perfFramework.js');
    const k = await import('/js/kpi.js');
    const ids = new Set(k.KPI_DEFS.map((d) => d.id));
    const boxes = f.TIERS.flatMap((t) => t.boxes);
    return {
      tiers: f.TIERS.map((t) => [t.id, t.lead, t.boxes.length]),
      unknown: boxes.flatMap((b) => b.kpis).filter((id) => !ids.has(id)),
      bare: boxes.filter((b) => !b.kpis.length && !b.coverage && !b.why).map((b) => b.id),
      people: boxes.find((b) => b.id === 'people').kpis.length,
    };
  });
  eq('inputs and the system lead; results lag', r.tiers, [['inputs', 'leading', 3], ['system', 'leading', 5], ['results', 'lagging', 6]]);
  eq('every indicator named exists', r.unknown, []);
  eq('every box measures something or says why not', r.bare, []);
  eq('people engagement is not borrowed from another measure', r.people, 0);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-kpi-performance');
  await page.waitForTimeout(300);
  eq('it is a tab of the KPI page', (await page.textContent('#page-kpis .page-tab.is-active')).startsWith('Inputs'), true);
  eq('three tiers', await page.$$eval('#kpi-framework-body .pf-tier', (e) => e.map((x) => x.dataset.tier)), ['inputs', 'system', 'results']);
  eq('the unmeasured box is dashed and says why', [await page.getAttribute('[data-box="people"]', 'class'), (await page.textContent('[data-box="people"]')).includes('survey')], ['pf-box is-unmeasured', true]);
  eq('data & insight is the coverage', /\d+ of \d+ indicators have data/.test(await page.textContent('[data-box="data"]')), true);
  eq('an indicator with no data reads Not measured, not zero', await page.$$eval('#kpi-framework-body .pf-kpi.is-unmeasured .pf-kpi__v', (e) => e.every((x) => x.textContent === 'Not measured')), true);
  await page.click('[data-box="margin"] [data-ceo-kpi]');
  await page.waitForTimeout(300);
  eq('an indicator opens its card', (await page.textContent('#page-kpis .page-tab.is-active')).startsWith('Indicators'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await openDestination(page, 'nav-kpi-performance');
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
