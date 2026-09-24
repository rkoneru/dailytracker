// The Edit Timeline (js/planner.js bindTicks): dragging across a row's days
// sets that task's start/end and ticks the days in between, and the Task
// Tracker picks up the change without a page reload. A plain click, with no
// drag, sets a one-day range. Keyboard users get the same one-day range via
// Enter/Space on a focused cell.

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

  await page.click('#tab-planner .nav-row__label');
  await page.waitForTimeout(400);
  await openSection(page, 'sec-ticks');

  const firstRowId = () => page.locator('#tick-body tr').first().getAttribute('data-id');
  const markedDays = (rowId) => page.locator(`#tick-body tr[data-id="${rowId}"] .tick-day-cell`).evaluateAll(
    (cells) => cells.filter((c) => c.textContent.trim()).map((c) => Number(c.dataset.day)));
  const trackerDates = (rowId) => page.evaluate((id) => {
    const row = document.querySelector(`#tracker-body tr[data-id="${id}"]`);
    return {
      start: row.querySelector('[data-field="start"]').value,
      end: row.querySelector('[data-field="end"]').value,
    };
  }, rowId);
  const cellCenter = async (rowId, day) => {
    const box = await page.locator(`#tick-body tr[data-id="${rowId}"] .tick-day-cell[data-day="${day}"]`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  console.log('\n--- dragging a range sets start/end and replaces the ticks ---');
  const rowId = await firstRowId();
  const before = await markedDays(rowId);
  eq('the sample task starts with two ticked days', before, [1, 2]);

  const from = await cellCenter(rowId, 3);
  const to = await cellCenter(rowId, 6);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  eq('the ticks are now exactly the dragged range', await markedDays(rowId), [3, 4, 5, 6]);
  eq('no cell is left highlighted mid-drag',
     await page.locator('#tick-body .tick-day-cell.is-drag-range').count(), 0);

  console.log('\n--- the Task Tracker reflects the edit without a reload ---');
  await page.click('#tab-tasks .nav-row__label');
  await page.waitForTimeout(400);
  await openSection(page, 'sec-task-list');
  const dates = await trackerDates(rowId);
  const label = await page.locator(`#tick-body tr[data-id="${rowId}"] .tick-day-cell[data-day="3"]`).getAttribute('aria-label');
  // The tick anchor is day-of-month only in the aria-label, so pin the check
  // to that rather than re-deriving the anchor date here.
  const trackerDay = new Date(dates.start + 'T00:00:00').getDate();
  const trackerEndDay = new Date(dates.end + 'T00:00:00').getDate();
  eq('start moved to the dragged day', label.includes(String(trackerDay)), true);
  eq('start/end span the four dragged days', trackerEndDay - trackerDay, 3);

  console.log('\n--- opening the Edit Timeline again shows the same edit ---');
  await page.click('#tab-planner .nav-row__label');
  await page.waitForTimeout(400);
  await openSection(page, 'sec-ticks');
  eq('still exactly the dragged range', await markedDays(rowId), [3, 4, 5, 6]);

  console.log('\n--- a plain click with no drag sets a one-day range ---');
  const secondRowId = await page.locator('#tick-body tr').nth(1).getAttribute('data-id');
  const clickAt = await cellCenter(secondRowId, 10);
  await page.mouse.move(clickAt.x, clickAt.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  eq('exactly one day ticked', await markedDays(secondRowId), [10]);
  const secondDates = await trackerDates(secondRowId);
  eq('start and end are the same day', secondDates.start, secondDates.end);

  console.log('\n--- Enter on a focused cell does the keyboard-only equivalent ---');
  const thirdRowId = await page.locator('#tick-body tr').nth(2).getAttribute('data-id');
  await page.locator(`#tick-body tr[data-id="${thirdRowId}"] .tick-day-cell[data-day="15"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  eq('the focused day is ticked', await markedDays(thirdRowId), [15]);

  console.log('\n--- reload keeps the edits ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.click('#tab-planner .nav-row__label');
  await page.waitForTimeout(400);
  await openSection(page, 'sec-ticks');
  eq('the dragged range survived a reload', await markedDays(rowId), [3, 4, 5, 6]);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
