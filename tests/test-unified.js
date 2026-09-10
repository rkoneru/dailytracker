const { APP_URL, out, launch } = require('./harness');
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

  const plannerNames = () => page.$$eval('#tasks-body tr [data-field="name"]', els => els.map(e => e.value));
  // The Dashboard renders tasks as text now, not inputs.
  const dashNames = () => page.$$eval('#dash-tasks-body tr td:first-child', els => els.map(e => e.textContent));

  console.log('\n--- one list behind both tables ---');
  await page.click('#tab-planner'); await page.waitForTimeout(300);
  const p0 = await plannerNames();
  await page.click('#tab-dashboard'); await page.waitForTimeout(300);
  const d0 = await dashNames();
  eq('planner and dashboard show the same tasks', p0, d0);
  eq('and it is the dashboard task set', p0[0], 'Campaign strategy & brief');

  console.log('\n--- Planner edit -> Dashboard, live, no tab switch ---');
  await page.click('#tab-planner'); await page.waitForTimeout(250);
  await page.locator('#tasks-body tr').first().locator('[data-field="name"]').fill('RENAMED IN PLANNER');
  await page.waitForTimeout(300);
  eq('dashboard table updated while hidden', (await dashNames())[0], 'RENAMED IN PLANNER');
  eq('dashboard gantt updated too',
     await page.$eval('#dash-gantt .gantt-chart__label', e => e.textContent), 'RENAMED IN PLANNER');

  console.log('\n--- second Planner edit also lands ---');
  await page.locator('#tasks-body tr').nth(1).locator('[data-field="name"]').fill('RENAMED SECOND ROW');
  await page.waitForTimeout(300);
  eq('dashboard shows the second rename', (await dashNames())[1], 'RENAMED SECOND ROW');

  console.log('\n--- adding on one page appears on the other ---');
  await page.click('#tab-planner'); await page.waitForTimeout(250);
  await page.click('#page-planner [data-action="add-task"]');
  await page.waitForTimeout(300);
  await page.locator('#tasks-body tr').last().locator('[data-field="name"]').fill('ADDED ON PLANNER');
  await page.waitForTimeout(300);
  eq('dashboard sees the new task', (await dashNames()).includes('ADDED ON PLANNER'), true);
  eq('counts match', (await plannerNames()).length, (await dashNames()).length);

  console.log('\n--- deleting on the Planner removes it from the Dashboard ---');
  const before = (await dashNames()).length;
  await page.locator('#tasks-body tr').last().locator('[data-action="delete-task"]').click();
  await page.waitForTimeout(300);
  eq('planner row gone', (await plannerNames()).length, before - 1);
  eq('dashboard row gone too', (await dashNames()).length, before - 1);
  eq('dashboard no longer lists it', (await dashNames()).includes('ADDED ON PLANNER'), false);

  console.log('\n--- status is one field, edited on the Planner ---');
  const dashStatusCell = () => page.$eval('#dash-tasks-body tr td:nth-child(7)', e => e.textContent);
  eq('first task starts Complete', await page.inputValue('#tasks-body tr:first-child [data-field="status"]'), 'Complete');
  await page.selectOption('#tasks-body tr:first-child [data-field="status"]', 'On Hold');
  await page.waitForTimeout(300);
  eq('dashboard status followed', await dashStatusCell(), 'On Hold');
  await page.selectOption('#tasks-body tr:first-child [data-field="status"]', 'Complete');
  await page.waitForTimeout(300);
  eq('and back again', await dashStatusCell(), 'Complete');

  console.log('\n--- Timeline derives from dates ---');
  const barsBefore = await page.locator('#planner-timeline .gantt-chart__row').count();
  eq('planner timeline drew bars', barsBefore > 0, true);
  await page.locator('#tasks-body tr').first().locator('[data-field="end"]').fill('2026-12-31');
  await page.waitForTimeout(400);
  const label = await page.$eval('#planner-timeline .gantt-chart__bar', e => e.title);
  eq('timeline bar picked up the new end date', label.includes('12/31/2026'), true);
  eq('dashboard gantt agrees',
     (await page.$eval('#dash-gantt .gantt-chart__bar', e => e.title)).includes('12/31/2026'), true);

  console.log('\n--- milestones reach the Dashboard live ---');
  // Row 1 is the soonest-due incomplete milestone, so it is inside the
  // widget's top-6 window; row 3 is due far later and legitimately isn't.
  await page.locator('#milestones-body tr').nth(1).locator('[data-field="text"]').fill('MILESTONE RENAMED');
  await page.waitForTimeout(400);
  const deadlines = await page.$eval('#upcoming-deadlines', e => e.textContent);
  eq('dashboard deadline list updated live', deadlines.includes('MILESTONE RENAMED'), true);
  const pctBefore = await page.$eval('#milestone-progress-pct', e => e.textContent);
  await page.locator('#milestones-body tr').nth(2).locator('[data-seg="5"]').click();
  await page.waitForTimeout(400);
  const pctAfter = await page.$eval('#milestone-progress-pct', e => e.textContent);
  eq('milestone progress % recomputed live', pctBefore !== pctAfter, true);
  console.log('   milestone progress:', pctBefore, '->', pctAfter);

  console.log('\n--- % complete stays consistent across pages ---');
  const stats = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#page-dashboard .stat-card')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
    return cards;
  });
  console.log('   stat cards:', stats.join(' | '));

  console.log('\n--- reload persists the unified list ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.click('#tab-planner'); await page.waitForTimeout(300);
  eq('planner name survived reload', (await plannerNames())[0], 'RENAMED IN PLANNER');
  eq('second rename survived reload', (await dashNames())[1], 'RENAMED SECOND ROW');
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
