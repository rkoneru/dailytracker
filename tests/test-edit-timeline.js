// The Edit Timeline (js/planner.js): bars drawn from each task's start and
// end, edited by dragging, and kept in step with every other page that shows
// the same task — in both directions.
//
// The sample project's window opens one day before its first task, on
// 31 Aug 2026, so column i is 31 Aug + i days: 1 Sep is i=1, 8 Sep is i=8.

const { APP_URL, launch, createChecks, openSection } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const openTimeline = async () => {
    await page.click('#tab-planner .nav-row__label');
    await page.waitForTimeout(300);
    await openSection(page, 'sec-ticks');
  };
  const openTracker = async () => {
    await page.click('#tab-tasks .nav-row__label');
    await page.waitForTimeout(300);
    await openSection(page, 'sec-task-list');
  };
  const rowIdNamed = (name) => page.evaluate((n) => [...document.querySelectorAll('#tick-body tr')]
    .find((tr) => tr.querySelector('.tick-row-label').textContent === n)?.dataset.id, name);
  const barDays = (id) => page.locator(`#tick-body tr[data-id="${id}"] .tick-day-cell.in-bar`)
    .evaluateAll((cells) => cells.map((c) => Number(c.dataset.i)));
  const trackerDates = (id) => page.evaluate((rid) => {
    const row = document.querySelector(`#tracker-body tr[data-id="${rid}"]`);
    return [row.querySelector('[data-field="start"]').value, row.querySelector('[data-field="end"]').value];
  }, id);
  const centre = async (selector) => {
    const box = await page.locator(selector).first().boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const cell = (id, i) => `#tick-body tr[data-id="${id}"] .tick-day-cell[data-i="${i}"]`;
  // The Undo toast from the last edit sits over the bottom rows at this
  // viewport height; clear it so the next gesture lands on the grid.
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  const dragFrom = async (from, to) => {
    await clearToasts();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };

  await openTimeline();

  console.log('\n--- bars come straight from the task dates ---');
  eq('one row per task, the same rows as the Tracker', await page.locator('#tick-body tr').count(),
     await page.locator('#tracker-body tr[data-id]').count());
  const launchId = await rowIdNamed('Paid ad launch');
  const launchDays = await barDays(launchId);
  eq('Paid ad launch (8–26 Sep) is a bar from column 8 to 26',
     [launchDays[0], launchDays[launchDays.length - 1], launchDays.length], [8, 26, 19]);
  eq('the window says which days it shows', /Aug 31.*2026/.test(await page.textContent('#tick-start-label')), true);
  eq('there is a month row over the days', await page.locator('#tick-month-row .tl-month').count() >= 2, true);
  eq('a late task is coloured as late, as the Tracker derives it',
     await page.locator(`#tick-body tr[data-id="${await rowIdNamed('Ad account & tracking setup')}"].tl-row--late`).count(), 1);
  eq('no task cell is a button to tab through', await page.locator('#tick-body button, #tick-body input').count(), 0);

  console.log('\n--- dragging the bar moves the task, keeping its length ---');
  await dragFrom(await centre(cell(launchId, 12)), await centre(cell(launchId, 14)));
  const moved = await barDays(launchId);
  eq('moved two days later', [moved[0], moved[moved.length - 1], moved.length], [10, 28, 19]);
  eq('and it says so, with an Undo', (await page.textContent('.toast')).includes('now runs'), true);
  eq('the undo is offered', await page.locator('.toast .toast__action').count() > 0, true);

  console.log('\n--- the Task Tracker has the new dates ---');
  await openTracker();
  eq('start and end moved together', await trackerDates(launchId), ['2026-09-10', '2026-09-28']);

  console.log('\n--- Undo puts it back, everywhere ---');
  await openTimeline();
  await dragFrom(await centre(cell(launchId, 14)), await centre(cell(launchId, 16)));
  await page.locator('.toast .toast__action').last().click();
  await page.waitForTimeout(300);
  const undone = await barDays(launchId);
  eq('the bar is back', [undone[0], undone[undone.length - 1]], [10, 28]);
  await openTracker();
  eq('and so is the Tracker', await trackerDates(launchId), ['2026-09-10', '2026-09-28']);

  console.log('\n--- dragging an end changes only that date ---');
  await openTimeline();
  const wrapId = await rowIdNamed('Mid-campaign optimization');
  await dragFrom(await centre(`#tick-body tr[data-id="${wrapId}"] .tl-handle--end`), await centre(cell(wrapId, 21)));
  await dragFrom(await centre(`#tick-body tr[data-id="${wrapId}"] .tl-handle--start`), await centre(cell(wrapId, 12)));
  await openTracker();
  eq('end pulled out to 21 Sep, start back to 12 Sep', await trackerDates(wrapId), ['2026-09-12', '2026-09-21']);

  console.log('\n--- an end cannot be dragged past the other end ---');
  await openTimeline();
  await dragFrom(await centre(`#tick-body tr[data-id="${wrapId}"] .tl-handle--end`), await centre(cell(wrapId, 3)));
  await openTracker();
  eq('it stops at a one-day task', await trackerDates(wrapId), ['2026-09-12', '2026-09-12']);

  console.log('\n--- a stray click on an empty day does not wipe a schedule ---');
  await openTimeline();
  const before = await barDays(launchId);
  const at = await centre(cell(launchId, 2));
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(300);
  eq('the bar is unchanged', await barDays(launchId), before);
  eq('and it explains how to reschedule', (await page.textContent('#tl-live')).includes('Drag'), true);

  console.log('\n--- dragging across empty days reschedules deliberately ---');
  await dragFrom(await centre(cell(launchId, 2)), await centre(cell(launchId, 5)));
  eq('the bar is now 2–5 Sep', await barDays(launchId), [2, 3, 4, 5]);

  console.log('\n--- a task added on the Tracker appears, and can be scheduled here ---');
  await openTracker();
  const rowsBefore = await page.locator('#tracker-body tr[data-id]').count();
  await page.click('#page-tasks [data-action="add-task-row"]');
  await page.waitForTimeout(300);
  await page.locator('#tracker-body tr[data-id]').last().locator('.row-input--name').fill('Timeline-born task');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  eq('a row was added', await page.locator('#tracker-body tr[data-id]').count(), rowsBefore + 1);
  await openTimeline();
  const newId = await rowIdNamed('Timeline-born task');
  eq('it is on the timeline straight away', !!newId, true);
  eq('marked as not scheduled', (await page.textContent(`#tick-body tr[data-id="${newId}"] .tl-name__meta`)).startsWith('Not scheduled'), true);
  const one = await centre(cell(newId, 20));
  await page.mouse.click(one.x, one.y);
  await page.waitForTimeout(300);
  eq('one click schedules it for that day', await barDays(newId), [20]);
  await openTracker();
  eq('and the Tracker has the date', await trackerDates(newId), ['2026-09-20', '2026-09-20']);

  console.log('\n--- an edit on the Tracker redraws the timeline ---');
  await page.locator(`#tracker-body tr[data-id="${newId}"] [data-field="end"]`).fill('2026-09-24');
  await page.locator(`#tracker-body tr[data-id="${newId}"] [data-field="end"]`).press('Tab');
  await page.waitForTimeout(300);
  await openTimeline();
  eq('the bar follows the Tracker', await barDays(newId), [20, 21, 22, 23, 24]);

  console.log('\n--- the keyboard does what the mouse does ---');
  await page.locator(`#tick-body tr[data-id="${newId}"] .tl-name`).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  eq('→ moves it a day', await barDays(newId), [21, 22, 23, 24, 25]);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);
  eq('Shift+← pulls the end in', await barDays(newId), [21, 22, 23, 24]);
  eq('focus stays on the task', await page.evaluate(() => document.activeElement.closest('tr')?.querySelector('.tick-row-label')?.textContent), 'Timeline-born task');

  console.log('\n--- the Dashboard follows too ---');
  const lateId = await rowIdNamed('Ad account & tracking setup');
  await page.locator(`#tick-body tr[data-id="${lateId}"] .tl-name`).focus();
  for (let n = 0; n < 3; n += 1) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);
  await openTracker();
  const [, lateEnd] = await trackerDates(lateId);
  eq('the end moved three days', lateEnd, '2026-09-09');
  await page.click('#tab-dashboard .nav-row__label');
  await page.waitForTimeout(400);
  eq('the Dashboard shows the new due date',
     (await page.textContent('#upcoming-deadlines')).includes('9/9/2026'), true);

  console.log('\n--- moving the window does not change any data ---');
  await openTimeline();
  const range = await page.textContent('#tick-start-label');
  await page.click('[data-tl="next"]');
  await page.waitForTimeout(200);
  eq('the window moved', (await page.textContent('#tick-start-label')) !== range, true);
  await openTracker();
  eq('the task did not', await trackerDates(newId), ['2026-09-21', '2026-09-24']);

  console.log('\n--- everything survives a reload ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await openTimeline();
  eq('the dragged range is still there', await barDays(await rowIdNamed('Paid ad launch')), [2, 3, 4, 5]);

  console.log('\n--- a page already open follows a change made elsewhere ---');
  // A sync pull or a meeting action changes tasks without the user leaving
  // the page they are on. The KPI page is open; nothing reopens it.
  await page.click('#tab-kpis .nav-row__label');
  await page.waitForTimeout(500);
  const rateBefore = await page.textContent('.kpi-card[data-kpi="taskRate"] .kpi-card__number');
  await page.evaluate(async () => {
    const { getState } = await import('./js/state.js');
    const { notifyProjectDataChanged } = await import('./js/taskModel.js');
    getState().dashTasks.filter((t) => t.status !== 'Complete').forEach((t) => { t.status = 'Complete'; });
    notifyProjectDataChanged('meetings');
  });
  await page.waitForTimeout(300);
  eq('the open KPI page recomputed', (await page.textContent('.kpi-card[data-kpi="taskRate"] .kpi-card__number')) !== rateBefore, true);

  console.log('\n--- phone ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width',
     await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
