// Capacity review: change the next plan with facts from the last one.
//
// Pins that the past is read off the record — planned (due in the period and
// already there when it began), actual (plus arrivals and incidents), the
// unplanned share, the team's hours from bookings and leave — and is null
// when nothing could answer it; the six signals and their owners; the steps
// and final checks; and that "Add as an action" puts a signal on the record
// while typing keeps the field.

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
    const c = await import('/js/capacityReview.js');
    const from = '2026-09-01';
    const to = '2026-09-28';
    const task = (id, end, createdAt, estimate) => ({ id, name: id, status: 'Complete', end, createdAt, estimate });
    const project = {
      dashTasks: [
        task('p1', '2026-09-10', '2026-08-01', 20), task('p2', '2026-09-20', '2026-08-15', 20), task('p3', '2026-09-25', '', 20),
        task('u1', '2026-09-12', '2026-09-05T10:00', 8), task('later', '2026-10-15', '2026-08-01', 5),
      ],
      incidents: [{ reported: '2026-09-07T09:00' }],
      allocations: [{ resourceId: 'ra', percent: 50, from: '2026-01-01', to: '2026-12-31' }, { name: 'Contractor', resourceId: 'zz', percent: 100, from: '2026-01-01', to: '2026-12-31' }],
      milestones: [{ text: 'Beta', due: '2026-10-20', done: false }],
    };
    const team = { resources: [{ id: 'ra', name: 'Ana', capacityHours: 40, skills: [{ name: 'Design' }] }], allocations: [{ resourceId: 'ra', percent: 50, from: '2026-01-01', to: '2026-12-31', skills: 'Design, Data' }], absences: [] };
    const past = c.pastFigures(project, team, from, to);
    const empty = c.pastFigures({}, { resources: [] }, from, to);
    const review = { ...c.reviewOf(project, new Date(2026, 9, 2)), from, to, reserve: { planned: '10', used: '10' } };
    const sig = c.signals(past, review);
    project.capacityReview = review;
    const today = new Date(2026, 9, 2);
    const steps = () => c.reviewSteps(project, team, today).map((s) => s.done);
    const out = { past, empty, sig: sig.map((s) => [s.id, s.lit, s.owner]), steps: [steps()] };
    review.definedAt = '2026-10-02T09:00:00Z';
    review.next = { demand: '90', capacity: '80', unplanned: '25', bottleneck: 'Cross-train a second data person', reserve: '15', notes: {} };
    sig.filter((s) => s.lit).forEach((s) => review.actions.push({ id: s.id, signal: s.id, finding: s.signal, action: s.action, owner: 'Sam', target: '2026-10-20', status: 'Open' }));
    review.communicatedAt = '2026-10-02T10:00:00Z';
    review.nextReview = '2026-10-30';
    out.steps.push(steps());
    out.checks = c.finalChecks(project, team, today).map((x) => x.ok);
    out.inputs = c.planInputs(past, review).map((x) => [x.id, x.planned, x.actual, x.next]);
    return out;
  });
  eq('planned: due in the period and there when it began', r.past.plannedItems, 3);
  eq('actual: plus a task that arrived and an incident', r.past.actualItems, 5);
  eq('unplanned share', r.past.unplannedShare, 40);
  eq('capacity from the bookings: half of Ana for 20 working days; the contractor is not in the pool', [r.past.capacityHours, r.past.unknownPeople], [80, ['Contractor']]);
  eq('planned hours from the estimates', r.past.plannedHours, 60);
  eq('a shortage of a skill nobody holds', r.past.shortage, ['Data']);
  eq('with nothing on record, every figure is null', [r.empty.plannedItems, r.empty.actualItems, r.empty.unplannedShare, r.empty.capacityHours, r.empty.shortage], [null, null, null, null, null]);
  eq('the signals, lit or not, and who owns each', r.sig, [
    ['demand', true, 'Planning lead'], ['unplanned', true, 'Operations lead'], ['skill', true, 'Resource lead'],
    ['overload', false, 'Planning lead'], ['unused', false, 'Operations lead'], ['reserve', true, 'Planning lead'],
  ]);
  eq('an untouched review has no step done', r.steps[0], [false, false, false, false, false]);
  eq('defined, every signal acted on, inputs set, actions owned, shared', r.steps[1], [true, true, true, true, true]);
  eq('every final check passes', r.checks, [true, true, true, true, true, true, true]);
  eq('past vs next, side by side', r.inputs, [['demand', 3, 5, '90'], ['capacity', 80, 80, '80'], ['unplanned', null, 40, '25'], ['bottleneck', null, 'Data', 'Cross-train a second data person'], ['reserve', 10, 10, '15']]);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-capacity-review');
  await page.waitForTimeout(300);
  eq('Capacity Review is a tab of the Plan page, after Approach', (await page.$$eval('#page-planner .page-tab', (e) => e.map((x) => x.textContent.replace(/\d+$/, '')))).slice(-2), ['Approach', 'Capacity Review']);
  eq('six signals, five plan inputs', [await page.$$eval('#cr-body [data-signal]', (e) => e.length), await page.$$eval('#cr-body [data-input-row]', (e) => e.length)], [6, 5]);
  await page.fill('#cr-body [data-cr-reserve="planned"]', '10');
  await page.fill('#cr-body [data-cr-reserve="used"]', '12');
  await page.waitForTimeout(200);
  eq('typing the reserve lights its signal, and the field keeps focus', [await page.getAttribute('#cr-body [data-signal="reserve"]', 'class'), await page.evaluate(() => document.activeElement?.dataset.crReserve)], ['cr-signal is-lit', 'used']);
  await page.click('#cr-body [data-cr-add="reserve"]');
  await page.waitForTimeout(300);
  eq('Add as an action puts it on the record, with the recommended action, and asks for the owner', [
    await page.inputValue('#cr-body [data-action-id] [data-cr-action="action"]'),
    await page.evaluate(() => document.activeElement?.dataset.crAction),
  ], ['Revisit the reserve level, usage rules and visibility.', 'owner']);
  await page.keyboard.type('Sam Planner');
  await page.fill('#cr-body [data-action-id] [data-cr-action="target"]', '2026-10-20');
  await page.waitForTimeout(500);
  const saved = await page.evaluate(async () => (await import('/js/state.js')).getState().capacityReview.actions[0]);
  eq('the action is kept with its owner and date', [saved.owner, saved.target, saved.signal], ['Sam Planner', '2026-10-20', 'reserve']);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
