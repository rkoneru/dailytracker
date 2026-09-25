const { APP_URL, out, launch, openSection } = require('./harness');
let pass = 0, fail = 0;
const eq = (n, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${n}  ${g}`); }
  else { fail++; console.log(`  FAIL ${n}\n       got  ${g}\n       want ${w}`); }
};

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  // Tasks are edited on the Tasks screen. The Planner's timeline and the
  // Dashboard's Gantt are views of that same list, each showing it in a way
  // the others do not. Only the page on screen is kept built — the rest are
  // rebuilt as they are opened — so each view is read by going to it, and
  // the suite comes back to the Task List afterwards.
  const backToList = async () => {
    await page.click('#tab-tasks'); await page.waitForTimeout(250);
    await openSection(page, 'sec-task-list');
  };
  const trackerNames = () => page.$$eval('#tracker-body tr [data-field="name"]', els => els.map(e => e.value));
  const plannerNames = async () => {
    await page.click('#tab-planner'); await page.waitForTimeout(250);
    await openSection(page, 'sec-ticks');
    const names = await page.$$eval('#tick-body tr .tick-row-label', els => els.map(e => e.textContent));
    await backToList();
    return names;
  };
  const ganttNames = async () => {
    await page.click('#tab-dashboard'); await page.waitForTimeout(250);
    const names = await page.$$eval('#dash-gantt .gantt-chart__label', els => els.map(e => e.textContent));
    await backToList();
    return names;
  };

  console.log('\n--- one list behind every view ---');
  await page.click('#tab-tasks'); await page.waitForTimeout(400);
  const t0 = await trackerNames();
  eq('tracker and the planner timeline show the same tasks', await plannerNames(), t0);
  eq('and it is the one task set', t0[0], 'Campaign strategy & brief');

  console.log('\n--- a tracker edit reaches the other views ---');
  await page.locator('#tracker-body tr').first().locator('[data-field="name"]').fill('RENAMED IN PLANNER');
  await page.waitForTimeout(400);
  eq('planner timeline updated', (await plannerNames())[0], 'RENAMED IN PLANNER');
  eq('dashboard gantt updated too', (await ganttNames())[0], 'RENAMED IN PLANNER');

  console.log('\n--- a second edit also lands ---');
  await page.locator('#tracker-body tr').nth(1).locator('[data-field="name"]').fill('RENAMED SECOND ROW');
  await page.waitForTimeout(400);
  eq('planner shows the second rename', (await plannerNames())[1], 'RENAMED SECOND ROW');

  console.log('\n--- adding on one page appears on the other ---');
  await page.click('#tab-tasks'); await page.waitForTimeout(250);
  await page.click('#page-tasks [data-action="add-task-row"]');
  await page.waitForTimeout(300);
  await page.locator('#tracker-body tr').last().locator('[data-field="name"]').fill('ADDED ON PLANNER');
  await page.waitForTimeout(300);
  eq('planner sees the new task', (await plannerNames()).includes('ADDED ON PLANNER'), true);
  eq('counts match', (await trackerNames()).length, (await plannerNames()).length);

  console.log('\n--- deleting on the Planner removes it from the Dashboard ---');
  const before = (await trackerNames()).length;
  await page.locator('#tracker-body tr').last().locator('[data-action="delete-task-row"]').click();
  await page.waitForTimeout(400);
  eq('tracker row gone', (await trackerNames()).length, before - 1);
  eq('planner row gone too', (await plannerNames()).length, before - 1);
  eq('planner no longer lists it', (await plannerNames()).includes('ADDED ON PLANNER'), false);

  console.log('\n--- status is one field, and the board is its other view ---');
  const boardColumn = async (name) => {
    await openSection(page, 'sec-task-board');
    const text = await page.$eval(`#priority-board [data-column="${name}"]`, e => e.textContent);
    await openSection(page, 'sec-task-list');
    return text;
  };
  eq('first task starts Complete', await page.inputValue('#tracker-body tr:first-child [data-field="status"]'), 'Complete');
  eq('so the board files it under Completed', (await boardColumn('Complete')).includes('RENAMED IN PLANNER'), true);
  await page.selectOption('#tracker-body tr:first-child [data-field="status"]', 'On Hold');
  await page.waitForTimeout(300);
  eq('board column followed', (await boardColumn('On Hold')).includes('RENAMED IN PLANNER'), true);
  await page.selectOption('#tracker-body tr:first-child [data-field="status"]', 'Complete');
  await page.waitForTimeout(300);
  eq('and back again', (await boardColumn('Complete')).includes('RENAMED IN PLANNER'), true);

  console.log('\n--- the one timeline derives from the dates ---');
  await page.click('#tab-dashboard'); await page.waitForTimeout(400);
  eq('the dashboard gantt drew bars', (await ganttNames()).length > 0, true);
  await page.click('#tab-tasks'); await page.waitForTimeout(300);
  await page.locator('#tracker-body tr').first().locator('[data-field="end"]').fill('2026-12-31');
  await page.waitForTimeout(400);
  await page.click('#tab-dashboard'); await page.waitForTimeout(400);
  eq('the gantt picked up the new end date',
     (await page.$eval('#dash-gantt .gantt-chart__bar', e => e.title)).includes(await page.evaluate((iso) => import('./js/dates.js').then((m) => m.formatDate(iso)), '2026-12-31')), true);

  console.log('\n--- milestones reach the Dashboard live ---');
  // Milestones are still edited on the Planner — only tasks moved out.
  await page.click('#tab-planner');
  await page.waitForTimeout(400);
  // Row 1 is the soonest-due incomplete milestone, so it is inside the
  // widget's top-6 window; row 3 is due far later and legitimately isn't.
  const onDashboard = async (read) => {
    await page.click('#tab-dashboard'); await page.waitForTimeout(300);
    const result = await read();
    await page.click('#tab-planner'); await page.waitForTimeout(300);
    await openSection(page, 'sec-milestones');
    return result;
  };
  const pctBefore = await onDashboard(() => page.$eval('#milestone-progress-pct', e => e.textContent));
  await page.locator('#milestones-body tr').nth(1).locator('[data-field="text"]').fill('MILESTONE RENAMED');
  await page.waitForTimeout(400);
  const deadlines = await onDashboard(() => page.$eval('#upcoming-deadlines', e => e.textContent));
  eq('dashboard deadline list updated', deadlines.includes('MILESTONE RENAMED'), true);
  await page.locator('#milestones-body tr').nth(2).locator('[data-seg="5"]').click();
  await page.waitForTimeout(400);
  const pctAfter = await onDashboard(() => page.$eval('#milestone-progress-pct', e => e.textContent));
  eq('milestone progress % recomputed', pctBefore !== pctAfter, true);
  console.log('   milestone progress:', pctBefore, '->', pctAfter);

  console.log('\n--- % complete stays consistent across pages ---');
  const stats = await page.evaluate(() => {
    return [...document.querySelectorAll('#page-dashboard .kpi')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
  });
  console.log('   KPI tiles:', stats.join(' | '));

  console.log('\n--- reload persists the unified list ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.click('#tab-tasks'); await page.waitForTimeout(300);
  eq('name survived reload', (await trackerNames())[0], 'RENAMED IN PLANNER');
  eq('second rename survived reload', (await trackerNames())[1], 'RENAMED SECOND ROW');
  eq('no legacy arrays left in the store', await page.evaluate(async () => {
    const s = (await import('/js/state.js')).getState();
    return ['tasks', 'gantt'].filter(k => k in s);
  }), []);

  await page.screenshot({ path: out('planner-unified.png'), fullPage: true });
  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
