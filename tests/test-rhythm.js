// The project operating rhythm: daily, weekly and monthly cadences, who
// attends what, what is waiting to be escalated, and the setup checklist.
//
// Pins that a cadence becomes an ordinary meeting series (weekday stand-ups
// skip the weekend, and the .ics says so); that each "escalate when" trigger
// is read off the project and is null — not zero — when nothing could answer
// it; that a blocker counts only once it has been blocked more than a day by
// its own history; and that the checklist is worked out, not ticked.

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

  console.log('\n--- the rules ---');
  const r = await page.evaluate(async () => {
    const rh = await import('/js/rhythm.js');
    const cal = await import('/js/meetingCalendar.js');
    const base = rh.defaultRhythm();
    const [daily, weekly, monthly] = base.cadences;
    const friday = new Date(2026, 9, 2);
    const project = {
      dashTasks: [
        { id: 'a', name: 'Blocked long', status: 'On Hold', statusHistory: [{ status: 'In Progress', blocked: false, at: '2026-09-28T09:00' }, { status: 'On Hold', blocked: true, at: '2026-09-29T09:00' }] },
        { id: 'b', name: 'Blocked today', status: 'On Hold', statusHistory: [{ status: 'On Hold', blocked: true, at: '2026-10-02T08:00' }] },
        { id: 'c', name: 'Blocked, no history', status: 'On Hold' },
      ],
      raid: [], changeRequests: [], dependencies: [],
    };
    const sig = rh.triggerSignals(project, { today: new Date(2026, 9, 2, 12), overloads: null, ev: { pv: 100, ev: 80, ac: 80 } });
    const empty = rh.triggerSignals({ dashTasks: [] }, { today: friday });
    const series = rh.seriesMeeting(daily, friday);
    return {
      shape: base.cadences.map((c) => [c.id, c.minutes, c.repeat, c.escalate.length]),
      first: [rh.firstDate(daily, friday), rh.firstDate(weekly, friday), rh.firstDate(monthly, friday)],
      weekdays: [cal.addRepeat('2026-10-02', 'Weekdays'), cal.addRepeat('2026-10-02', 'Weekdays', 5)],
      series: [series.date, series.startTime, series.endTime, series.repeat, series.cadence, series.agenda.length],
      blocker: [sig.blocker.count, sig.blocker.items],
      variance: [sig.variance.count, sig.variance.items[0]],
      unmeasured: [empty.blocker.count, empty.risk.count, empty.resource.count, empty.budget.count, empty.external.count],
      matrix: base.cadences.map((c) => c.attend['Steering committee']),
      merged: rh.rhythmOf({ rhythm: { cadences: [{ id: 'weekly', minutes: 45 }] } }).cadences.map((c) => c.minutes),
    };
  });
  eq('daily 15, weekly 60, monthly 90, each with its own triggers', r.shape, [['daily', 15, 'Weekdays', 3], ['weekly', 60, 'Weekly', 3], ['monthly', 90, 'Monthly', 4]]);
  eq('first meetings: the next weekday, the chosen Monday, the first working day of next month', r.first, ['2026-10-02', '2026-10-05', '2026-11-02']);
  eq('weekday repeats skip the weekend', r.weekdays, ['2026-10-05', '2026-10-09']);
  eq('a cadence becomes a series: timed from its length, agenda from its focus', r.series, ['2026-10-02', '09:15', '09:30', 'Weekdays', 'daily', 3]);
  eq('a blocker counts after a day by its own history; one with no history is said, not guessed',
     r.blocker, [1, ['Blocked long — blocked 3 days', '1 more blocked since a date not recorded']]);
  eq('variance from earned value', r.variance, [1, 'SPI 0.80 — behind plan']);
  eq('nothing to judge by is null, not zero', r.unmeasured, [null, null, null, null, null]);
  eq('steering attends the monthly only', r.matrix, ['', '', 'R']);
  eq('a saved rhythm keeps its edits and fills the rest', r.merged, [15, 45, 90]);

  console.log('\n--- on the page, from the starter ---');
  await openDestination(page, 'nav-meeting-rhythm');
  await page.waitForTimeout(300);
  eq('Rhythm is the second Meetings tab', (await page.textContent('#page-meetings .page-tab.is-active')).startsWith('Rhythm'), true);
  eq('three cadences', await page.$$eval('#rhythm-cadences .rhythm-card', (e) => e.map((x) => x.dataset.cadence)), ['daily', 'weekly', 'monthly']);
  eq('the starter’s weekly stand-up is the weekly cadence’s series', (await page.textContent('[data-cadence="weekly"] [data-health]')).startsWith('Last held'), true);
  eq('what is waiting to go up is read off the project',
     await page.$$eval('#rhythm-signals .rhythm-signal.is-up', (e) => e.map((x) => x.dataset.signal)).then((l) => ['blocker', 'scope', 'risk', 'variance'].every((id) => l.includes(id))), true);
  eq('the checklist wants the other two series and a review',
     await page.$$eval('#rhythm-checks li', (e) => e.map((x) => x.className.includes('is-ok'))), [true, true, true, true, false, false]);

  await page.fill('[data-cadence="daily"] [data-focus="0"] [data-focus-field="minutes"]', '15');
  await page.waitForTimeout(150);
  eq('an agenda past the meeting fails its step, caret kept',
     [await page.getAttribute('[data-setup="agenda"]', 'class'), await page.evaluate(() => document.activeElement.dataset.focusField), (await page.textContent('[data-cadence="daily"] [data-focus-total]')).includes('25 of 15')],
     ['sprint-check is-bad', 'minutes', true]);
  await page.fill('[data-cadence="daily"] [data-focus="0"] [data-focus-field="minutes"]', '5');

  const before = await page.evaluate(async () => (await import('/js/state.js')).getState().meetings.length);
  await page.click('[data-cadence="daily"] [data-rhythm-act="create"]');
  await page.waitForTimeout(400);
  const made = await page.evaluate(async () => {
    const list = (await import('/js/state.js')).getState().meetings;
    const m = list[list.length - 1];
    return { count: list.length, cadence: m.cadence, repeat: m.repeat, agenda: m.agenda.map((a) => a.topic), attendees: m.attendees.length, series: m.seriesId === m.id };
  });
  eq('creating the series makes a meeting on the Meetings page', [made.count, made.cadence, made.repeat, made.series], [before + 1, 'daily', 'Weekdays', true]);
  eq('with the focus as its agenda and the core team invited', [made.agenda, made.attendees > 0], [['Yesterday and today', 'Blockers', 'Commitments'], true]);
  eq('and it opens on that meeting', (await page.textContent('#page-meetings .page-tab.is-active')).startsWith('Overview'), true);

  await openDestination(page, 'nav-meeting-rhythm');
  await page.waitForTimeout(300);
  eq('the daily card now knows its next meeting', (await page.textContent('[data-cadence="daily"] [data-health]')).includes('next'), true);
  await page.selectOption('[data-role="Stakeholders"] [data-attend="monthly"]', 'I');
  await page.click('#btn-rhythm-reviewed');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(async () => (await import('/js/state.js')).getState().rhythm);
  eq('who attends and the review are saved', [saved.cadences[2].attend.Stakeholders, !!saved.reviewedAt], ['I', true]);
  eq('the review step passes', await page.getAttribute('[data-setup="review"]', 'class'), 'sprint-check is-ok');

  console.log('\n--- the calendar and .ics carry the weekday series ---');
  const ics = await page.evaluate(async () => {
    const cal = await import('/js/meetingCalendar.js');
    const list = (await import('/js/state.js')).getState().meetings.filter((m) => m.cadence === 'daily');
    return cal.icsCalendar(list, { name: 'x' });
  });
  eq('the stand-up repeats Monday to Friday in the calendar file', ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
