// The house status-report format.
//
// The rule is that every report follows it — so the thing worth testing is not
// any one sheet but the sameness: same frame, same legend, same vocabulary,
// whichever cadence you open. A format that drifts between cadences is the
// thing a house style exists to prevent, and it drifts one renderer at a time.

const { APP_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

const TYPES = ['daily', 'weekly', 'steerco', 'executive'];

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  // A services project, because it is the one with a plan long enough to plot
  // and registers full enough to grade.
  await page.click('#btn-projects');
  await page.waitForTimeout(500);
  await page.check('#template-transition');
  await page.click('#btn-create-project');
  await page.waitForTimeout(1400);
  await page.click('#tab-reports');
  await page.waitForTimeout(800);

  const show = async (type) => {
    await page.click(`[data-report="${type}"]`);
    await page.waitForTimeout(800);
  };

  console.log('\n--- every cadence produces sheets in the house frame ---');
  for (const type of TYPES) {
    await show(type);
    const sheets = await page.locator('.rpt-sheet').count();
    eq(`${type} renders at least one sheet`, sheets > 0, true);
    eq(`${type} numbers its chapter`,
       /^CHAPTER \d$/.test(await page.textContent('.rpt-sheet__chapter span')), true);
    eq(`${type} names its cadence`,
       (await page.$$eval('.rpt-sheet__chapter span', (e) => e[2].textContent)).length > 0, true);
    eq(`${type} titles the sheet`,
       (await page.textContent('.rpt-sheet__title')).length > 0, true);
  }

  console.log('\n--- and the same legend on every one of them ---');
  const expected = ['Negative Trend', 'Positive Trend', 'On Plan',
    'Off Plan – No Impact', 'Off Plan – Milestone Impact'];
  for (const type of TYPES) {
    await show(type);
    const legends = await page.$$eval('.rpt-legend', (els) =>
      els.map((e) => [...e.querySelectorAll('.rpt-legend__item span:last-child')].map((s) => s.textContent)));
    eq(`${type} carries a legend on every sheet`, legends.length > 0, true);
    eq(`${type} legends all read the same`,
       legends.every((l) => JSON.stringify(l) === JSON.stringify(expected)), true);
  }

  console.log('\n--- RAG is five fixed dimensions, never four or six ---');
  // A pack whose columns change between months cannot be compared with last
  // month's, which is most of what it is for.
  for (const type of ['steerco', 'executive']) {
    await show(type);
    const labels = await page.$$eval('.rpt-sheet:first-of-type .rpt-rag__label', (e) => e.map((x) => x.textContent));
    eq(`${type} grades the five`, labels.slice(0, 5),
       ['OVERALL', 'SCOPE', 'COSTS', 'SCHEDULE', 'BENEFITS']);
    eq(`${type} then states completion`, labels[5], 'COMPLETE:');
  }

  console.log('\n--- colour is never the only carrier of a reading ---');
  await show('steerco');
  const swatches = await page.locator('.rpt-sheet:first-of-type .rpt-rag__swatch').count();
  const readings = await page.$$eval('.rpt-sheet:first-of-type .rpt-rag__chip .sr-only', (e) => e.map((x) => x.textContent));
  eq('every swatch has a spoken reading beside it', readings.length, swatches);
  eq('and the reading names the colour',
     readings.every((r) => /green|amber|red|grey/.test(r)), true);
  eq('which is hidden from sight, not from a reader', await page.evaluate(() => {
    const el = document.querySelector('.rpt-sheet .sr-only');
    const r = el.getBoundingClientRect();
    return r.width <= 1 && r.height <= 1;
  }), true);

  console.log('\n--- the monthly sheet plots the plan ---');
  await show('steerco');
  eq('it has a milestone grid', await page.locator('.rpt-grid').count() > 0, true);
  eq('with a bar per dated activity', await page.locator('.rpt-bar').count() > 0, true);
  eq('a percent complete per row',
     (await page.$$eval('.rpt-sheet:first-of-type .rpt-grid__num', (e) => e.map((x) => x.textContent)))
       .every((t) => /^\d+%$/.test(t)), true);
  eq('and a status dot per row',
     await page.locator('.rpt-sheet:first-of-type .rpt-grid__num').count(),
     await page.locator('.rpt-sheet:first-of-type .rpt-dot').count());

  console.log('\n--- a bar is placed by date, not snapped to the month ---');
  // Snapping made every task shorter than a month look like a milestone, which
  // on a one-month project is every task it has.
  const widths = await page.$$eval('.rpt-bar', (els) =>
    els.map((e) => parseFloat(e.style.width)).filter((n) => !Number.isNaN(n)));
  eq('bars have varied widths', new Set(widths.map((w) => Math.round(w))).size > 1, true);
  eq('and none spans the whole window by accident', widths.every((w) => w <= 100), true);

  console.log('\n--- the weekly sheet plots the same milestones as a timeline ---');
  await show('weekly');
  eq('it has a timeline', await page.locator('.rpt-time').count() > 0, true);
  eq('with a pin per dated milestone', await page.locator('.rpt-time__pin').count() > 0, true);
  eq('callouts alternate so neighbours do not collide',
     await page.locator('.rpt-time__pin.is-high').count() > 0
       && await page.locator('.rpt-time__pin.is-low').count() > 0, true);
  eq('and months are named under the axis',
     await page.locator('.rpt-sheet:first-of-type .rpt-time__month').count() > 0, true);

  console.log('\n--- the tactical sheets ask for what they need ---');
  for (const type of ['daily', 'weekly']) {
    await show(type);
    const titles = await page.$$eval('.rpt-sheet:first-of-type .rpt-box__title', (e) => e.map((x) => x.textContent));
    eq(`${type} lists key issues`, titles.includes('KEY ISSUES'), true);
    eq(`${type} asks for support`, titles.includes('SUPPORT NEEDED'), true);
    eq(`${type} names the project and its lead`,
       (await page.$$eval('.rpt-sheet:first-of-type .rpt-field__label', (e) => e.map((x) => x.textContent))).slice(0, 2),
       ['PROJECT NAME:', 'LEAD:']);
  }

  console.log('\n--- the strategic sheets say what happened and what is asked ---');
  for (const type of ['steerco', 'executive']) {
    await show(type);
    const titles = await page.$$eval('.rpt-sheet:first-of-type .rpt-box__title', (e) => e.map((x) => x.textContent));
    eq(`${type} lists key activities`, titles.includes('KEY ACTIVITIES'), true);
    eq(`${type} states management action required`, titles.includes('MANAGEMENT ACTION REQUIRED'), true);
  }

  console.log('\n--- a grade is grey when it was never set, not green ---');
  // A pack full of greens nobody earned is how a project gets to red in one
  // step. A blank project has no budget, no baseline and no deliverables.
  await page.click('#btn-projects');
  await page.waitForTimeout(500);
  await page.check('#template-blank');
  await page.fill('#new-project-name', 'Empty');
  await page.click('#btn-create-project');
  await page.waitForTimeout(1200);
  await page.click('#tab-reports');
  await page.waitForTimeout(700);
  await show('steerco');

  const empty = await page.$$eval('.rpt-sheet', (els) => {
    const sheet = els.find((e) => e.querySelector('.rpt-sheet__title').textContent.includes('Empty'));
    if (!sheet) return null;
    return [...sheet.querySelectorAll('.rpt-rag__swatch')].map((s) => s.className.replace('rpt-rag__swatch ', ''));
  });
  eq('the empty project is on the pack', !!empty, true);
  eq('costs, schedule and benefits read grey, not green',
     [empty[2], empty[3], empty[4]], ['is-grey', 'is-grey', 'is-grey']);

  console.log('\n--- the plain-text version still works for email and chat ---');
  await show('weekly');
  const text = await page.evaluate(async () => {
    const m = await import('/js/reports.js');
    return typeof m.refreshReport === 'function';
  });
  eq('the module still exposes its entry points', text, true);
  eq('and the share buttons are all there',
     await page.locator('#btn-report-print, #btn-report-email, #btn-report-copy').count(), 3);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
