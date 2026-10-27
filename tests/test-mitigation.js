// Mitigation plans: more than "monitor".
//
// Pins the four response types; that a vague action is named and a specific
// one passes; that capacity is checked against the owner's bookings and is
// "can't tell" for someone outside the resource pool; that the steps are
// worked out and Reassess writes the residual exposure onto the risk; the
// nine-question checklist; and that the risk's own fields edited here are its
// row on the log.

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
    const m = await import('/js/mitigation.js');
    const today = new Date(2026, 9, 2);
    const team = {
      resources: [{ id: 'ra', name: 'Ana' }, { id: 'rb', name: 'Ben' }],
      allocations: [{ resourceId: 'ra', percent: 60, from: '2026-09-01', to: '2026-12-31' }, { resourceId: 'rb', percent: 130, from: '2026-09-01', to: '2026-12-31' }],
      absences: [],
    };
    const item = { type: 'Risk', status: 'Open', title: 'Reviewer absence may delay approval', owner: 'Ana', severity: 'High', likelihood: 'High', action: 'Train two backup reviewers by 30 June' };
    const steps = () => m.mitigationSteps(item, team, today).map((s) => s.state);
    const out = {
      types: m.RESPONSE_TYPES.map((t) => t.id),
      vague: ['Monitor the risk', 'monitor', 'Improve training', 'Have a plan for it soon', 'Track weekly delivery metrics and escalate if slippage > 2 weeks', 'Run backup reviewer training for two team members by 30 June'].map((a) => m.vagueness(a) === null),
      capacity: [m.ownerCapacity(item, team, today), m.ownerCapacity({ ...item, owner: 'Ben' }, team, today), m.ownerCapacity({ ...item, owner: 'Zoe' }, team, today)],
      steps: [steps()],
    };
    item.mitigation = { ...m.newPlan(), types: ['prevention', 'impact'], reduction: 'Fewer delays', due: '2026-10-30', dependency: 'Approved training materials', evidence: 'Training records', residualSeverity: 'Medium', residualLikelihood: 'Low', trigger: 'Reviewer unavailable over 5 working days' };
    out.steps.push(steps());
    out.checklist = m.planChecklist(item).map((c) => c.ok);
    item.mitigation.doneAt = '2026-10-10T09:00';
    item.mitigation.verified = { at: '2026-10-12', effective: true };
    out.steps.push(steps());
    const patch = m.reassessPatch(item, new Date(2026, 9, 13, 9, 0));
    out.patch = [patch.row, patch.plan.before];
    Object.assign(item, patch.row); Object.assign(item.mitigation, patch.plan);
    out.steps.push(steps());
    out.monitorOnly = m.planChecklist({ ...item, mitigation: { ...item.mitigation, types: ['monitoring'] } }).find((c) => c.id === 'types').ok;
    out.high = m.planChecklist({ ...item, mitigation: { ...item.mitigation, residualSeverity: 'Critical', residualLikelihood: 'High' } }).find((c) => c.id === 'residual').ok;
    out.common = m.commonChecks(item, { dependencies: [{ description: 'Approved training materials' }] }, team, new Date(2026, 9, 20)).map((c) => c.ok);
    return out;
  });
  eq('four response types', r.types, ['prevention', 'impact', 'contingency', 'monitoring']);
  eq('vague actions are named; specific ones pass', r.vague, [false, false, false, false, true, true]);
  eq('capacity: has the time, booked past it, not in the pool', r.capacity, [true, false, null]);
  eq('a bare risk: only capacity is known', r.steps[0], ['todo', 'done', 'todo', 'todo', 'todo']);
  eq('chosen, capacity confirmed', r.steps[1], ['done', 'done', 'todo', 'todo', 'todo']);
  eq('every question on the checklist answered', r.checklist, [true, true, true, true, true, true, true, true, true]);
  eq('acted and verified', r.steps[2], ['done', 'done', 'done', 'done', 'todo']);
  eq('reassess writes the residual onto the risk and keeps what it was', r.patch, [{ severity: 'Medium', likelihood: 'Low' }, { severity: 'High', likelihood: 'High' }]);
  eq('then all five', r.steps[3], ['done', 'done', 'done', 'done', 'done']);
  eq('monitoring alone is not an appropriate response', r.monitorOnly, false);
  eq('a residual still in the top band needs someone to accept it', r.high, false);
  eq('the common checks pass for a worked plan', r.common, [true, true, true, true, true, true, true]);

  console.log('\n--- on the page ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    st.getState().raid.push({ id: 'rk1', type: 'Risk', title: 'Key supplier may miss the go-live', owner: 'Zoe', severity: 'Critical', likelihood: 'High', status: 'Open', raised: '2026-10-01', due: '', closed: '', action: 'Monitor' });
    st.scheduleSave();
  });
  await page.waitForTimeout(500);
  await openDestination(page, 'nav-mitigation');
  await page.waitForTimeout(300);
  eq('Mitigation is a tab of the RAID page, after the log', (await page.$$eval('#page-raid .page-tab', (e) => e.map((x) => x.textContent.replace(/\d+$/, '')))).slice(0, 2), ['Log', 'Mitigation']);
  eq('the worst open risks come first', await page.$eval('#mit-table tbody tr td:nth-child(2)', (td) => td.textContent), '12');
  await page.click('#mit-table [data-mit-pick="rk1"]');
  await page.waitForTimeout(200);
  eq('picking one opens its plan', await page.textContent('#mit-body .needs-person__head strong'), 'Key supplier may miss the go-live');
  eq('“Monitor” is called out', (await page.textContent('#mit-body [data-mit-vague]')).startsWith('“Monitor” alone is not a plan'), true);
  await page.fill('#mit-body [data-mit-row="action"]', 'Line up the second supplier and test the switch by 20 Oct');
  await page.waitForTimeout(200);
  eq('a specific action passes, and the field keeps focus', [(await page.textContent('#mit-body [data-mit-vague]')).startsWith('Specific'), await page.evaluate(() => document.activeElement?.dataset.mitRow)], [true, 'action']);
  eq('the owner is not in the pool, so capacity is a question', await page.getAttribute('#mit-body [data-step="capacity"]', 'class'), 'needs-step is-lapsed');
  await page.check('#mit-body [data-mit-type="contingency"]');
  await page.selectOption('#mit-body [data-mit="residualSeverity"]', 'High');
  await page.selectOption('#mit-body [data-mit="residualLikelihood"]', 'Low');
  await page.waitForTimeout(200);
  await page.click('#mit-body [data-mit-act="reassess"]');
  await page.waitForTimeout(300);
  const row = await page.evaluate(async () => (await import('/js/state.js')).getState().raid.find((x) => x.id === 'rk1'));
  eq('Reassess moves the risk on the log, keeping the action typed here', [row.severity, row.likelihood, row.action, row.mitigation.before.severity], ['High', 'Low', 'Line up the second supplier and test the switch by 20 Oct', 'Critical']);
  await openDestination(page, 'nav-raid-log');
  await page.waitForTimeout(300);
  eq('and the log shows it', await page.inputValue('#raid-body tr[data-id="rk1"] [data-field="action"]'), 'Line up the second supplier and test the switch by 20 Oct');

  console.log('\n--- layout ---');
  await openDestination(page, 'nav-mitigation');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
