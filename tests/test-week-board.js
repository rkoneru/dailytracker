// My week: the weekly planning board on My Work.
//
// Pins that projects, meetings and wins are read off every project for the
// person named; that the objectives, focus blocks and review are saved per
// week on this device and come back; and that another week starts blank.

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
    const w = await import('/js/weekBoard.js');
    const week = w.weekOf(new Date(2026, 9, 1));
    const projects = [
      { id: 'a', projectName: 'Web', charterValue: 5, charterFit: 5, charterEffort: 2,
        dashTasks: [{ name: 'Build', assigned: 'Ana', status: 'Complete', statusHistory: [{ status: 'Complete', at: '2026-09-30T10:00' }] }, { name: 'Test', assigned: 'Ana', status: 'Open' }, { name: 'Other', assigned: 'Ben', status: 'Open' }],
        meetings: [{ id: 'm1', name: 'Sync', date: '2026-09-29', startTime: '09:00', attendees: [{ name: 'Ana' }] }, { id: 'm2', name: 'Not mine', date: '2026-09-29', attendees: [{ name: 'Ben' }] }, { id: 'm3', name: 'Last week', date: '2026-09-21', owner: 'Ana' }],
        milestones: [{ text: 'Beta', owner: 'Ana', done: true, achieved: '2026-10-02' }] },
      { id: 'b', projectName: 'CRM', dashTasks: [{ name: 'Spec', assigned: 'Ana', status: 'Open' }] },
      { id: 'c', projectName: 'Not hers', dashTasks: [{ name: 'X', assigned: 'Ben', status: 'Open' }] },
    ];
    return {
      week: [week.from, week.to],
      projects: w.keyProjects(projects, 'Ana').map((p) => [p.name, p.priorityText, p.progress]),
      meetings: w.weekMeetings(projects, 'Ana', week).map((m) => m.name),
      wins: w.weekWins(projects, 'Ana', week).map((x) => `${x.kind}:${x.text}`),
    };
  });
  eq('Monday to Sunday', r.week, ['2026-09-28', '2026-10-04']);
  eq('her projects, scored ones first', r.projects, [['Web', '5.0 · High', 33], ['CRM', 'Not scored', 0]]);
  eq('her meetings this week only', r.meetings, ['Sync']);
  eq('wins the record shows', r.wins, ['Task:Build', 'Milestone:Beta']);

  console.log('\n--- on the page ---');
  await openDestination(page, 'tab-mywork');
  await page.fill('#mywork-name', 'Priya N.');
  await page.dispatchEvent('#mywork-name', 'change');
  await page.waitForTimeout(300);
  eq('six parts to the board', await page.$$eval('#week-board .wb-card', (e) => e.length), 6);
  eq('her project is listed', (await page.textContent('[data-wb="key-projects"]')).includes('Social Media Marketing'), true);
  await page.fill('#week-board [data-wb-objective="0"]', 'Get attribution verified');
  await page.check('#week-board [data-wb-done="0"]');
  await page.fill('#week-board [data-wb-focus="mon"]', '08:00–10:30 budget model');
  await page.fill('#week-board [data-wb-field="improve"]', 'Chase legal earlier');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await openDestination(page, 'tab-mywork');
  await page.waitForTimeout(300);
  eq('the planning sheet comes back on this device', [
    await page.inputValue('#week-board [data-wb-objective="0"]'), await page.isChecked('#week-board [data-wb-done="0"]'),
    await page.inputValue('#week-board [data-wb-focus="mon"]'), await page.inputValue('#week-board [data-wb-field="improve"]'),
  ], ['Get attribution verified', true, '08:00–10:30 budget model', 'Chase legal earlier']);
  eq('and is not in the project', await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).getState()).includes('Chase legal earlier')), false);
  await page.click('#sec-my-week [data-wb-nav="1"]');
  await page.waitForTimeout(200);
  eq('next week starts blank', await page.inputValue('#week-board [data-wb-objective="0"]'), '');

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
