// Creating and deleting meetings without leaving the calendar.
//
// Pins that + on a day asks first and writes nothing until Create (Cancel
// leaves the meetings as they were); that a meeting made there stays on the
// calendar, on its day, with its time and kind; that the form refuses a
// meeting that ends before it starts; that a meeting's chip shows what it is
// and deletes it to the Trash with Undo; and that a dashed date, which is no
// meeting, offers to stop the series instead.

const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('projectPlannerMeetingView_v1', 'month'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const count = () => page.evaluate(async () => (await import('/js/state.js')).getState().meetings.length);
  const named = (name) => page.evaluate(async (n) => (await import('/js/state.js')).getState().meetings.find((m) => m.name === n) || null, name);

  await openDestination(page, 'nav-meeting-calendar');
  await page.waitForTimeout(300);
  const day = await page.$eval('#meeting-calendar td:not(.is-other)', (td) => td.dataset.day);
  const before = await count();

  console.log('\n--- create ---');
  await page.click(`[data-cal-new="${day}"]`);
  await page.waitForSelector('.dialog');
  eq('+ asks for the name, date, times and kind', await page.$$eval('.dialog [id^="dialog-field-"]', (e) => e.map((x) => x.id.slice(13))), ['name', 'date', 'startTime', 'endTime', 'mode']);
  await page.fill('#dialog-field-name', 'Never made');
  await page.click('.dialog .btn-ghost >> text=Cancel');
  await page.waitForTimeout(200);
  eq('Cancel writes nothing', await count(), before);

  await page.click(`[data-cal-new="${day}"]`);
  await page.waitForSelector('.dialog');
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(200);
  eq('a meeting needs a name: the dialog stays and nothing is written', [await page.isVisible('.dialog'), await count()], [true, before]);
  await page.fill('#dialog-field-name', 'Supplier call');
  await page.fill('#dialog-field-startTime', '14:00');
  await page.fill('#dialog-field-endTime', '13:00');
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(200);
  eq('ending before it starts is refused, and says why, keeping what was typed', [
    (await page.textContent('.dialog__message')).includes('ends before it starts'),
    await page.inputValue('#dialog-field-name'),
    await count(),
  ], [true, 'Supplier call', before]);
  await page.fill('#dialog-field-endTime', '14:45');
  await page.selectOption('#dialog-field-mode', 'Phone');
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(300);
  const made = await named('Supplier call');
  eq('Create makes it, with what was typed', [await count(), made.date, made.startTime, made.endTime, made.mode, made.status], [before + 1, day, '14:00', '14:45', 'Phone', 'Scheduled']);
  eq('and stays on the calendar, with it on its day', [
    (await page.textContent('#page-meetings .page-tab.is-active')).startsWith('Calendar'),
    (await page.textContent(`td[data-day="${day}"]`)).includes('📞 Supplier call'),
  ], [true, true]);

  console.log('\n--- delete ---');
  await page.click(`td[data-day="${day}"] .cal-chip.is-meeting >> text=Supplier call`);
  await page.waitForSelector('.dialog');
  const details = await page.textContent('.dialog__details');
  eq('a meeting’s chip says what it is', [await page.textContent('.dialog__title'), details.includes('Phone'), details.includes('Scheduled')], ['Supplier call', true, true]);
  await page.click('.dialog [data-dialog-action="delete"]');
  await page.waitForTimeout(300);
  eq('Delete takes it off the calendar and out of the meetings', [await count(), (await page.textContent(`td[data-day="${day}"]`)).includes('Supplier call')], [before, false]);
  eq('into the Trash', await page.evaluate(async () => (await import('/js/state.js')).listTrash().some((t) => t.kind === 'meetings' && t.label.includes('Supplier call'))), true);
  await page.click('.toast .toast__action');
  await page.waitForTimeout(300);
  eq('Undo puts it back', [await count(), (await page.textContent(`td[data-day="${day}"]`)).includes('Supplier call')], [before + 1, true]);

  await page.click(`td[data-day="${day}"] .cal-chip.is-meeting >> text=Supplier call`);
  await page.waitForSelector('.dialog');
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(300);
  eq('Open goes to its overview', [(await page.textContent('#page-meetings .page-tab.is-active')).startsWith('Overview'), await page.inputValue('#meeting-overview-fields [data-meeting-field="name"]')], [true, 'Supplier call']);

  console.log('\n--- a dashed date ---');
  await openDestination(page, 'nav-meeting-calendar');
  await page.waitForTimeout(300);
  const series = await page.getAttribute('#meeting-calendar .cal-chip.is-repeat >> nth=0', 'data-cal-repeat');
  await page.click('#meeting-calendar .cal-chip.is-repeat >> nth=0');
  await page.waitForSelector('.dialog');
  await page.click('.dialog [data-dialog-action="stop"]');
  await page.waitForTimeout(300);
  const stopped = await page.evaluate(async (id) => (await import('/js/state.js')).getState().meetings.find((m) => m.id === id).repeat, series);
  eq('Stop repeating ends the series and its dashed dates, keeping the meeting', [stopped, await page.locator(`#meeting-calendar [data-cal-repeat="${series}"]`).count(), await count()], ['None', 0, before + 1]);
  await page.click('.toast .toast__action');
  await page.waitForTimeout(300);
  eq('and Undo brings the dates back', await page.locator(`#meeting-calendar [data-cal-repeat="${series}"]`).count() > 0, true);

  console.log('\n--- week ---');
  await page.click('#sec-meeting-calendar [data-cal-view="week"]');
  await page.waitForTimeout(300);
  const box = await page.locator('#meeting-calendar .wk-col >> nth=1').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 48 * 1 + 4);
  await page.waitForSelector('.dialog');
  const slotTime = await page.inputValue('#dialog-field-startTime');
  eq('a time in the week fills in the start and an hour after', [/^\d\d:(00|30)$/.test(slotTime), await page.inputValue('#dialog-field-endTime') > slotTime], [true, true]);
  await page.fill('#dialog-field-name', 'Pairing');
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(300);
  eq('and it lands in that column, at that time', (await page.textContent('#meeting-calendar .wk-col >> nth=1')).includes('Pairing'), true);

  console.log('\n--- phone ---');
  // The list under the calendar holds the next two weeks; which sample
  // meetings fall in it depends on the weekday, so make sure one does.
  await page.click('#sec-meeting-calendar [data-cal-view="month"]');
  await page.click('#sec-meeting-calendar [data-cal-nav="0"]');
  await page.click(`[data-cal-new="${await page.evaluate(async () => (await import('/js/dates.js')).todayISO())}"]`);
  await page.waitForSelector('.dialog');
  await page.fill('#dialog-field-name', 'Today’s check-in');
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  await page.click('#meeting-upcoming .cal-chip.is-meeting >> nth=0');
  await page.waitForSelector('.dialog');
  const fits = await page.evaluate(() => { const r = document.querySelector('.dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
  eq('on a phone the chip opens the same choice, and it fits', [await page.isVisible('.dialog [data-dialog-action="delete"]'), fits], [true, true]);
  await page.keyboard.press('Escape');
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
