// Planning horizons and the weekly check-in, read off the plan.
//
// Pins that Now holds what is underway, late or blocked; that Next is where
// missing owners and estimates are named; that Future says when nothing is
// marked beyond six weeks; and that "done this week" comes from the status
// history, not from guessing at dates.

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
    const hz = await import('/js/horizons.js');
    const today = new Date(2026, 9, 1);
    const project = {
      dashTasks: [
        { id: 'a', name: 'Underway', status: 'In Progress', start: '2026-09-20', end: '2026-10-20', assigned: 'Ana', estimate: 8 },
        { id: 'b', name: 'Late', status: 'In Progress', start: '2026-09-10', end: '2026-09-25', assigned: 'Ana', estimate: 8 },
        { id: 'c', name: 'Starts in three weeks', status: 'Not Started', start: '2026-10-22', end: '2026-10-30', assigned: '', estimate: '' },
        { id: 'd', name: 'Starts in March', status: 'Not Started', start: '2027-03-01', end: '2027-03-10', assigned: 'Ben', estimate: 4 },
        { id: 'e', name: 'Finished Monday', status: 'Complete', start: '2026-09-20', end: '2026-09-28', statusHistory: [{ status: 'In Progress', at: '2026-09-20T09:00' }, { status: 'Complete', at: '2026-09-28T16:00' }] },
        { id: 'f', name: 'Finished long ago, history starts now', status: 'Complete', end: '2026-09-29', statusHistory: [{ status: 'Complete', at: '2026-09-30T09:00', seen: true }] },
        { id: 'g', name: 'Waiting', status: 'Not Started', start: '2026-10-02', end: '2026-10-05', dependsOn: ['c'], assigned: 'Cy' },
      ],
      milestones: [{ id: 'm', text: 'Beta ready', due: '2026-10-25', done: false }, { id: 'n', text: 'Kickoff', due: '2026-09-15', done: true, achieved: '2026-09-28' }],
    };
    const h = hz.planningHorizons(project, { today });
    const ids = (list) => list.map((i) => i.id);
    const check = hz.weeklyCheckIn(project, today);
    return {
      now: ids(h.now), next: ids(h.next), future: ids(h.future),
      flags: Object.fromEntries([...h.now, ...h.next].filter((i) => i.flag).map((i) => [i.id, i.flag])),
      gaps: hz.horizonGaps(h),
      done: check.done.map((i) => i.text),
      checkNext: check.next.map((i) => i.text),
      blocking: check.blocking.map((i) => i.text),
      text: hz.checkInText(check, 'Web').split('\n')[0],
      edges: [hz.horizonOf('2026-10-08', today), hz.horizonOf('2026-10-09', today), hz.horizonOf('2026-11-12', today), hz.horizonOf('2026-11-13', today)],
    };
  });
  eq('now: late first, then blocked, then underway', r.now, ['b', 'g', 'a']);
  eq('next: the milestone and the task about to start', r.next.sort(), ['c', 'm']);
  eq('future: beyond six weeks', r.future, ['d']);
  eq('flags say why', r.flags, { b: 'late', g: 'blocked', c: 'no owner' });
  eq('each horizon names what it still needs', [r.gaps.now.length, r.gaps.next, r.gaps.future], [2, ['1 task starts in the next six weeks with nobody named.'], ['Nothing is marked beyond six weeks — say what the outcome is and when.']]);
  eq('done this week is what the history says finished, not a guess', r.done, ['Finished Monday', 'Kickoff']);
  eq('next is what falls due in seven days; blocking is what waits', [r.checkNext, r.blocking], [['Waiting'], ['Waiting']]);
  eq('the check-in reads as a message', r.text, 'Weekly check-in — Web, 2026-09-24 to 2026-10-08');
  eq('seven days is now, forty-two is next, then future', r.edges, ['now', 'next', 'next', 'future']);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-horizons');
  await page.waitForTimeout(300);
  eq('Horizons is a tab of the Plan page', (await page.textContent('#page-planner .page-tab.is-active')).startsWith('Horizons'), true);
  eq('three horizons', await page.$$eval('#horizon-columns .hz-col', (e) => e.map((x) => x.dataset.horizon)), ['now', 'next', 'future']);
  eq('the starter’s blocked task is in Now', (await page.textContent('[data-horizon="now"]')).includes('blocked'), true);
  eq('the gate is in Next', await page.$$eval('[data-horizon="next"] [data-kind="gate"]', (e) => e.length), 1);
  eq('the check-in answers all three', await page.$$eval('#checkin-columns .hz-check', (e) => e.map((x) => x.dataset.check)), ['done', 'next', 'blocking']);
  await page.click('#btn-checkin-copy');
  await page.waitForSelector('.dialog');
  eq('copying shows the message', (await page.textContent('.dialog')).includes('What’s blocking:'), true);
  await page.click('.dialog .btn-primary');
  await page.click('[data-horizon="next"] [data-kind="gate"] [data-goto-node]');
  await page.waitForTimeout(300);
  eq('an item goes to where it lives', (await page.textContent('#page-planner .page-tab.is-active')).startsWith('Milestones'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
