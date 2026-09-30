// The meetings week view and how people meet.
//
// Pins that the week runs Monday to Sunday with hours widened to hold what
// is on it; that overlapping meetings sit side by side; that untimed items
// are all-day; that a meeting's type is its own field with its own mark;
// and that picking a time in the week plans a meeting at that time.

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
    const c = await import('/js/meetingCalendar.js');
    const m = await import('/js/meetingModel.js');
    const days = c.weekDays('2026-10-01');
    const meetings = [
      m.newMeeting({ id: 'a', name: 'Stand-up', date: '2026-10-01', startTime: '09:00', endTime: '09:30', mode: 'Video' }),
      m.newMeeting({ id: 'b', name: 'Review', date: '2026-10-01', startTime: '09:15', endTime: '10:00', mode: 'In person' }),
      m.newMeeting({ id: 'c', name: 'Late call', date: '2026-10-02', startTime: '19:30', mode: 'Phone' }),
      m.newMeeting({ id: 'd', name: 'Offsite', date: '2026-10-03' }),
    ];
    const layout = c.weekLayout(c.calendarEvents(meetings, days[0], days[6]), days);
    const thu = layout.days.get('2026-10-01').timed;
    return {
      days: [days[0], days[6]],
      range: [layout.from / 60, layout.to / 60],
      lanes: thu.map((e) => [e.title, e.lane, e.lanes]),
      noEnd: layout.days.get('2026-10-02').timed[0].endMin - layout.days.get('2026-10-02').timed[0].startMin,
      allDay: layout.days.get('2026-10-03').allDay.map((e) => e.title),
      modes: [m.modeIcon('Phone'), m.modeIcon(''), m.nextOccurrence(meetings[0], '2026-10-08').mode],
    };
  });
  eq('Monday to Sunday', r.days, ['2026-09-28', '2026-10-04']);
  eq('8 to 18, widened to hold a half-seven call', r.range, [8, 21]);
  eq('overlapping meetings sit side by side', r.lanes, [['Stand-up', 0, 2], ['Review', 1, 2]]);
  eq('no end time is an hour', r.noEnd, 60);
  eq('no start time is all day', r.allDay, ['Offsite']);
  eq('each type has its mark; the next in a series keeps it', r.modes, ['📞', '', 'Video']);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-meeting-calendar');
  await page.waitForTimeout(300);
  eq('month is the default view', await page.getAttribute('[data-cal-view="month"]', 'aria-pressed'), 'true');
  await page.click('[data-cal-view="week"]');
  await page.waitForTimeout(300);
  eq('week: seven day columns with hours', [await page.$$eval('#meeting-calendar .wk-col', (e) => e.length), await page.$$eval('#meeting-calendar .wk-hour', (e) => e.length) >= 10], [7, true]);
  eq('today is marked', await page.$$eval('#meeting-calendar .wk-head.is-today', (e) => e.length), 1);
  eq('the choice is remembered on this device', await page.evaluate(() => localStorage.getItem('projectPlannerMeetingView_v1')), 'week');
  const label = await page.textContent('#meeting-calendar-label');
  await page.click('#sec-meeting-calendar [data-cal-nav="1"]');
  await page.waitForTimeout(200);
  eq('next moves a week', (await page.textContent('#meeting-calendar-label')) !== label, true);
  await page.click('#sec-meeting-calendar [data-cal-nav="0"]');
  await page.waitForTimeout(200);

  const before = await page.evaluate(async () => (await import('/js/state.js')).getState().meetings.length);
  const box = await page.locator('#meeting-calendar .wk-col >> nth=2').boundingBox();
  const from = Number(await page.getAttribute('#meeting-calendar .wk', 'data-from'));
  // Two and a half hours below the top row.
  await page.mouse.click(box.x + box.width / 2, box.y + 48 * 2.5 + 4);
  await page.waitForTimeout(400);
  const made = await page.evaluate(async () => { const l = (await import('/js/state.js')).getState().meetings; return l[l.length - 1]; });
  const expected = `${String(Math.floor(from / 60) + 2).padStart(2, '0')}:30`;
  eq('picking a time plans a meeting there, an hour long', [await page.evaluate(async () => (await import('/js/state.js')).getState().meetings.length), made.startTime, made.endTime.slice(3)], [before + 1, expected, '30']);
  eq('and opens it to name', (await page.textContent('#page-meetings .page-tab.is-active')).startsWith('Overview'), true);
  await page.selectOption('#meeting-overview-fields [data-meeting-field="mode"]', 'Video');
  await page.fill('#meeting-overview-fields [data-meeting-field="name"]', 'Design review');
  await page.waitForTimeout(200);
  await openDestination(page, 'nav-meeting-calendar');
  await page.waitForTimeout(300);
  eq('it sits in the week with its mark', (await page.textContent('#meeting-calendar .wk-event.is-selected')).includes('🎥 Design review'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
