// Sprint planning: a goal, the work, the team's real capacity, a commitment
// tied to the backlog, and velocity from sprints that closed.
//
// Pins that capacity is worked out from bookings and leave rather than typed;
// that a team can fit in total and still overload one person, and the plan
// says so; that the commitment lapses when the backlog moves; and that a
// closed sprint keeps its figures when its unfinished work is carried on.

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
    const s = await import('/js/sprints.js');
    const sprint = { id: 's1', start: '2026-10-05', end: '2026-10-16', focusFactor: 50, goal: 'Ship the billing module end to end' };
    const resources = [{ id: 'ana', name: 'Ana', capacityHours: 40 }, { id: 'ben', name: 'Ben', capacityHours: 30 }];
    const allocations = [
      { resourceId: 'ana', percent: 100, from: '2026-09-01', to: '' },
      { resourceId: 'ben', percent: 100, from: '2026-10-12', to: '2026-12-31' },
      { resourceId: 'ghost', name: 'Contractor', percent: 100, from: '2026-10-01', to: '' },
    ];
    const absences = [{ resourceId: 'ana', from: '2026-10-08', to: '2026-10-09' }];
    const cap = s.sprintCapacity(sprint, { allocations, resources, absences });
    const project = {
      dashTasks: [
        { id: 'a', name: 'API', assigned: 'Ana', estimate: 34, sprintId: 's1', status: 'In Progress' },
        { id: 'b', name: 'UI', assigned: 'Ben', estimate: 8, sprintId: 's1', status: 'Not Started', dependsOn: ['x'] },
        { id: 'x', name: 'Design', assigned: 'Ana', estimate: 8, status: 'In Progress' },
      ],
    };
    const checks = Object.fromEntries(s.planningChecks(project, sprint, cap).map((c) => [c.id, c.ok]));
    const load = s.sprintLoad(project, sprint).hours;
    const people = s.personLoad(project, sprint, cap).map((p) => [p.name, p.hours, p.capacity, p.over]);
    const committed = { ...sprint, commitment: s.commitRecord(project, sprint, 'Ana') };
    const stateBefore = s.commitmentState(project, committed);
    project.dashTasks[1].estimate = 20;
    const stateAfter = s.commitmentState(project, committed);
    return {
      days: s.workingDays('2026-10-05', '2026-10-16').length,
      cap: [cap.hours, cap.people.map((p) => [p.name, p.hours, p.days, p.awayDays]), cap.unknown],
      load,
      checks,
      people,
      commit: [stateBefore, stateAfter],
      box: [s.planningTimebox({ start: '2026-10-05', end: '2026-10-09' }), s.planningTimebox(sprint), s.planningTimebox({ start: '2026-10-05', end: '2026-12-31' })],
      noCap: s.sprintCapacity(sprint, { allocations: [], resources, absences }).hours,
      traps: s.antiPatterns(project, { ...sprint, goal: '' }, cap).length,
    };
  });
  eq('ten working days in two weeks', r.days, 10);
  eq('capacity: booked days less leave, at the focus factor; a stranger is not counted',
     r.cap, [47, [['Ana', 32, 8, 2], ['Ben', 15, 5, 0]], ['Contractor']]);
  eq('load is the chosen items’ estimates', r.load, 42);
  eq('the team fits', r.checks.fits, true);
  eq('but Ana has more than her own time', [r.people, r.checks.people], [[['Ana', 34, 32, true], ['Ben', 8, 15, false]], false]);
  eq('work waiting on something outside the sprint is flagged', r.checks.dependencies, false);
  eq('a commitment holds until the backlog moves', r.commit, ['committed', 'changed']);
  eq('planning timebox: two hours a sprint week, never more than eight', r.box, [2, 4, 8]);
  eq('nobody booked: capacity unknown, not zero', r.noCap, null);
  eq('the traps are named', r.traps >= 1, true);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-sprints');
  eq('Sprints is a tab on Tasks', (await page.textContent('#page-tasks .page-tab.is-active')).startsWith('Sprints'), true);
  eq('none yet', await page.isVisible('#sprint-none'), true);
  await page.click('#btn-sprint-new');
  await page.waitForTimeout(300);
  eq('a new sprint starts on a Monday, two weeks long', await page.evaluate(() => {
    const start = document.querySelector('#sprint-fields [data-sprint="start"]').value;
    const end = document.querySelector('#sprint-fields [data-sprint="end"]').value;
    return [new Date(`${start}T00:00:00`).getDay(), (new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000];
  }), [1, 11]);
  eq('the goal is where the caret lands', await page.evaluate(() => document.activeElement.dataset.sprint), 'goal');
  eq('without a goal the first step fails', await page.getAttribute('[data-check="goal"]', 'class'), 'sprint-check is-bad');
  await page.fill('#sprint-fields [data-sprint="goal"]', 'Launch the paid campaign and prove attribution');
  eq('typing keeps the caret while the checks move', [await page.evaluate(() => document.activeElement.dataset.sprint), await page.getAttribute('[data-check="goal"]', 'class')], ['goal', 'sprint-check is-ok']);
  eq('capacity is read from the project’s bookings', (await page.textContent('#sprint-summary')).includes('working days at 70% focus'), true);

  await page.click('#sprint-candidates [data-sprint-add] >> nth=0');
  await page.waitForTimeout(200);
  eq('the highest priority candidate is first, and goes in', await page.$$eval('#sprint-items tr', (e) => e.length), 1);
  eq('the task itself now says which sprint', await page.evaluate(async () => {
    const st = (await import('/js/state.js')).getState();
    return st.dashTasks.filter((t) => t.sprintId === st.sprints[0].id).length;
  }), 1);
  await page.click('#sprint-candidates [data-sprint-add] >> nth=0');
  await page.waitForTimeout(200);
  eq('one person over their own time fails that step, even when the team fits',
     [await page.getAttribute('[data-check="fits"]', 'class'), await page.getAttribute('[data-check="people"]', 'class')], ['sprint-check is-ok', 'sprint-check is-bad']);
  eq('and is named in the warnings', (await page.textContent('#sprint-warnings')).includes('is given'), true);
  await page.click('#sprint-items [data-sprint-remove] >> nth=1');
  await page.waitForTimeout(200);

  await page.click('#btn-sprint-commit');
  await page.waitForTimeout(200);
  eq('the commitment is recorded', await page.getAttribute('[data-check="committed"]', 'class'), 'sprint-check is-ok');
  await page.fill('#sprint-items [data-estimate] >> nth=0', '99');
  await page.waitForTimeout(200);
  eq('re-estimating an item after committing asks again', await page.getAttribute('[data-check="committed"]', 'class'), 'sprint-check is-bad');
  await page.fill('#sprint-items [data-estimate] >> nth=0', '60');
  await page.waitForTimeout(200);
  eq('putting it back restores the commitment', await page.getAttribute('[data-check="committed"]', 'class'), 'sprint-check is-ok');

  await page.click('#btn-sprint-share');
  await page.waitForSelector('.dialog');
  eq('sharing shows the plan', (await page.textContent('.dialog')).includes('Goal: Launch the paid campaign'), true);
  await page.click('.dialog .btn-ghost');
  await page.waitForTimeout(200);
  eq('and records that it was shared', await page.getAttribute('[data-check="shared"]', 'class'), 'sprint-check is-ok');

  console.log('\n--- closing keeps the figures ---');
  await page.click('#btn-sprint-new');
  await page.waitForTimeout(200);
  await page.selectOption('#sprint-picker', { index: 1 });
  await page.waitForTimeout(200);
  await page.selectOption('#sprint-fields [data-sprint="status"]', 'Complete');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(async () => (await import('/js/state.js')).getState().sprints[0].closed);
  eq('a closed sprint keeps what it committed', closed.committed, 60);
  eq('velocity has its first row', await page.$$eval('#sprint-velocity tr td', (e) => e[0].textContent), 'Sprint 1');
  eq('its unfinished work can be carried on', await page.isVisible('#btn-sprint-carry'), true);
  await page.click('#btn-sprint-carry');
  await page.waitForTimeout(300);
  const after = await page.evaluate(async () => {
    const { velocity } = await import('/js/sprints.js');
    const st = (await import('/js/state.js')).getState();
    return [st.dashTasks.filter((t) => t.sprintId === st.sprints[1].id).length, velocity(st).rows[0].committed];
  });
  eq('carried into the next sprint, and the closed one still says what it committed', after, [1, 60]);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
