const { APP_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

// The project-level fields — name, status, status date, budget, baseline —
// are owned by the Planner. Tasks moved to their own screen and the Dashboard
// became a reporting view; this suite covers what is left on the Planner and
// that the Dashboard still reflects it without offering to edit it.
// The Tasks screen itself is covered by test-tasks-screen.js.

const acceptDialog = async (page) => {
  await page.waitForSelector('.dialog', { timeout: 5000 });
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(250);
};

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

  console.log('\n--- the Dashboard offers no way to change data ---');
  eq('no data inputs', await page.locator(
    '#page-dashboard input[data-field], #page-dashboard select[data-field], #page-dashboard [contenteditable="true"]').count(), 0);
  eq('no add or delete controls', await page.locator(
    '#page-dashboard [data-action^="add-"], #page-dashboard [data-action^="delete-"]').count(), 0);
  eq('no baseline buttons', await page.locator('#page-dashboard #btn-set-baseline, #page-dashboard #btn-clear-baseline').count(), 0);

  console.log('\n--- but it still reports ---');
  eq('project name shown', await page.textContent('#dash-project-name'), 'Social Media Marketing Campaign');
  eq('status shown on its tile', await page.textContent('#kpi-status-value'), 'ON TRACK');
  eq('budget shown', await page.textContent('#dash-budget-planned'), '25,000');
  eq('it links to the Tasks screen instead of carrying the table',
     await page.locator('#btn-open-tasks').isVisible(), true);

  console.log('\n--- project fields are edited on the Planner and reach the Dashboard ---');
  await page.click('#tab-planner');
  await page.waitForTimeout(500);

  await page.locator('#page-planner [data-field="dashStatus"]').fill('AT RISK');
  await page.waitForTimeout(400);
  eq('status tile followed', await page.textContent('#kpi-status-value'), 'AT RISK');

  await page.locator('#page-planner [data-field="dashDate"]').fill('2026-09-25');
  await page.waitForTimeout(400);
  eq('status date followed', await page.textContent('#kpi-status-sub'), 'as at 2026-09-25');

  await page.locator('#page-planner [data-field="budgetPlanned"]').fill('40000');
  await page.waitForTimeout(400);
  eq('budget followed', await page.textContent('#dash-budget-planned'), '40,000');

  await page.locator('#page-planner [data-field="projectName"]').fill('Renamed on Planner');
  await page.waitForTimeout(400);
  eq('project name followed', await page.textContent('#dash-project-name'), 'Renamed on Planner');

  console.log('\n--- baseline is set from the Planner and read everywhere ---');
  await page.click('#btn-clear-baseline');
  await acceptDialog(page);
  await page.waitForTimeout(400);
  eq('planner note cleared', await page.textContent('#planner-baseline-note'),
     'No baseline set — set one to start tracking slippage.');
  eq('dashboard note agrees', await page.textContent('#baseline-note'),
     'No baseline set — set one to start tracking slippage.');
  await page.click('#tab-tasks');
  await page.waitForTimeout(400);
  eq('and the slip column on the Tracker says so too',
     [...new Set(await page.$$eval('#tracker-body [data-role="slip"]', (els) => els.map((e) => e.textContent)))], ['—']);
  await page.click('#tab-planner');
  await page.waitForTimeout(400);

  await page.click('#btn-set-baseline');
  await page.waitForTimeout(500);
  eq('re-baselined to on plan', (await page.textContent('#planner-baseline-note')).startsWith('On plan against baseline'), true);
  await page.click('#tab-tasks');
  await page.waitForTimeout(400);
  eq('slip chips reset',
     [...new Set(await page.$$eval('#tracker-body .slip-chip', (els) => els.map((e) => e.textContent)))], ['On plan']);

  console.log('\n--- a date change on the Tasks screen shows up as slip everywhere ---');
  await page.locator('#tracker-body tr').nth(2).locator('input[data-field="end"]').fill('2026-12-20');
  await page.waitForTimeout(500);
  eq('the slipped task is flagged in its own row',
     (await page.$$eval('#tracker-body .slip-chip', (els) => els.map((e) => e.textContent))).some((t) => t.startsWith('+')), true);
  await page.click('#tab-planner');
  await page.waitForTimeout(500);
  eq('and the Planner note counts it', (await page.textContent('#planner-baseline-note')).includes('slipped'), true);

  console.log('\n--- the tick timeline is a read-only view now ---');
  const ticked = () => page.locator('#tick-body tr:first-child .tick-day-cell').evaluateAll(
    (c) => c.filter((x) => x.textContent.trim()).map((x) => Number(x.dataset.day)));
  eq('marks still come from the dates', (await ticked()).length > 0, true);
  eq('but no cell is clickable', await page.locator('#tick-body .tick-day-cell[role="button"]').count(), 0);
  eq('and there is no anchor input', await page.locator('#tick-start').count(), 0);

  console.log('\n--- everything survives a reload ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('#tab-planner');
  await page.waitForTimeout(500);
  eq('budget persisted', await page.inputValue('#page-planner [data-field="budgetPlanned"]'), '40000');
  eq('status persisted', await page.inputValue('#page-planner [data-field="dashStatus"]'), 'AT RISK');
  eq('ticks still render', (await ticked()).length > 0, true);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
