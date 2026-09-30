// The daily schedule: each person's hours a day, from their tasks on every
// project, against the hours they have that day.
//
// Pins that an estimate is spread over the working days a task runs; that a
// task with no estimate is named, not counted as zero; that leave and
// weekends have no hours; that over a day is marked; and that the summary
// adds the team's day up.

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
    const c = await import('/js/capacityPlan.js');
    const people = [
      { id: 'ana', name: 'Ana', capacityHours: 40, location: 'Miami' },
      { id: 'ben', name: 'Ben', capacityHours: 30, location: 'New York' },
    ];
    const tasks = [
      { name: 'Mockups', assigned: 'Ana', start: '2026-10-05', end: '2026-10-09', estimate: 20, status: 'In Progress', project: 'Web' },
      { name: 'Review', assigned: 'ana', start: '2026-10-06', end: '2026-10-06', estimate: 6, status: 'Not Started', project: 'Web' },
      { name: 'Spec', assigned: 'Ben', start: '2026-10-05', end: '2026-10-11', estimate: '', status: 'Not Started', project: 'CRM' },
      { name: 'Done one', assigned: 'Ben', start: '2026-10-05', end: '2026-10-06', estimate: 50, status: 'Complete', project: 'CRM' },
    ];
    const absences = [{ resourceId: 'ana', type: 'Public holiday', from: '2026-10-09', to: '2026-10-09' }];
    const s = c.dailySchedule(people, tasks, absences, '2026-10-05', 7);
    const ana = s.groups[0].people[0];
    const ben = s.groups[1].people[0];
    return {
      groups: s.groups.map((g) => g.name),
      ana: ana.cells.map((x) => [x.state, x.hours, x.load]),
      bars: ana.tasks.map((t) => [t.name, t.from, t.to, t.perDay]),
      ben: [ben.cells[0].hours, ben.unestimated, ben.tasks.map((t) => t.perDay)],
      summary: s.summary.map((x) => [x.hours, x.load]),
    };
  });
  eq('grouped by location', r.groups, ['Miami', 'New York']);
  eq('20 h over five days is 4 a day; a 6 h task on Tuesday tips it over; the holiday and the weekend have no hours', r.ana, [
    ['booked', 4, 50], ['over', 10, 125], ['booked', 4, 50], ['booked', 4, 50], ['away', 4, null], ['weekend', 0, null], ['weekend', 0, null],
  ]);
  eq('each task is a bar over the days it runs', r.bars, [['Mockups', '2026-10-05', '2026-10-09', 4], ['Review', '2026-10-06', '2026-10-06', 6]]);
  eq('no estimate: named, unknown per day, not zero; a finished task asks nothing', r.ben, [0, ['Spec'], [null]]);
  eq('the summary adds up the team’s day against the time it has', r.summary.slice(0, 5), [[4, 29], [10, 71], [4, 29], [4, 29], [0, 0]]);

  console.log('\n--- on the page ---');
  await openDestination(page, 'tab-resources');
  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-resources', 'sec-availability'));
  await page.waitForTimeout(300);
  eq('the daily schedule is on the Availability tab', await page.isVisible('#daily-schedule .ds'), true);
  eq('a row per person in the pool', await page.$$eval('#daily-schedule .ds-person', (e) => e.length), 4);
  await page.click('#daily-schedule [data-ds-toggle] >> nth=0');
  await page.waitForTimeout(200);
  eq('opening a person shows their tasks as bars', await page.$$eval('#daily-schedule .ds-bar', (e) => e.length) > 0, true);
  const first = await page.textContent('#daily-range');
  await page.click('#sec-daily-schedule [data-ds-nav="1"]');
  await page.waitForTimeout(200);
  eq('next moves the window a week', (await page.textContent('#daily-range')) !== first, true);
  await page.selectOption('#daily-days', '35');
  await page.waitForTimeout(200);
  eq('35 days shows 35 columns', await page.$$eval('#daily-schedule .ds-head .ds-day', (e) => e.length), 35);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
