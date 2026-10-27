// Milestones that keep projects moving: decision gates, what a milestone is
// not, and the plan's own order on the Gantt.
//
// Pins that a gate's state comes from its criteria and its date, never a
// dropdown; that a Go passes the gate and marks the milestone done while Hold
// does not; that a gate cannot be decided without its one owner; that the
// milestone check names tasks, progress figures and missing dates; that the
// Gantt draws milestones and gates on its own scale; and that an activity
// starting before the one it follows is flagged with a fix that keeps its length.

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
    const g = await import('/js/gates.js');
    const today = new Date(2026, 9, 1);
    const gate = { id: 'g', kind: 'gate', text: 'Scope approval', owner: 'Sam', due: '2026-10-10', criteria: [] };
    const states = [g.gateState(gate, today)];
    gate.criteria = [{ id: 'a', text: 'Requirements signed', met: true }, { id: 'b', text: 'Budget agreed', met: false }];
    states.push(g.gateState(gate, today));
    gate.criteria[1].met = true;
    states.push(g.gateState(gate, today), g.gateState(gate, new Date(2026, 9, 12)));
    const go = g.decisionPatch({ progress: 2 }, 'Go', { by: 'Sam', at: '2026-10-10T09:00:00Z' });
    const hold = g.decisionPatch({ progress: 2 }, 'Hold', { by: 'Sam', at: '2026-10-10T09:00:00Z' });
    const project = {
      dashTasks: [{ name: 'Write the test plan' }, { name: 'Build API' }],
      milestones: [
        { id: '1', text: 'Write the test plan', due: '2026-10-01' },
        { id: '2', text: 'Design', due: '2026-10-02' },
        { id: '3', text: 'Design complete', due: '2026-10-03' },
        { id: '4', text: '50% complete', due: '2026-10-04' },
        { id: '5', text: 'Launch by end of month', due: '' },
        { id: '6', text: 'Build readiness', kind: 'gate', due: '2026-10-09', owner: '', criteria: [], options: '', defaultPath: '' },
      ],
    };
    const findings = g.milestoneFindings(project).map((f) => [f.milestoneId, f.rule]);
    const many = { dashTasks: Array.from({ length: 10 }, (_, i) => ({ name: `t${i}` })), milestones: Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, text: `Release ${i}`, due: '2026-10-01' })) };
    return {
      states,
      go: [go.done, go.decision, go.achieved, go.progress],
      hold: [hold.done, hold.achieved],
      findings,
      scarce: g.milestoneFindings(many).map((f) => f.rule),
    };
  });
  eq('no criteria, then not ready, then ready, then overdue once its date passes undecided',
     r.states, ['undefined', 'not-ready', 'ready', 'overdue']);
  eq('a Go passes the gate: done, achieved that day, full progress', r.go, [true, 'Go', '2026-10-10', 5]);
  eq('a Hold does not', r.hold, [false, '']);
  eq('what a milestone is not, named by rule', r.findings, [
    ['1', 'Not every task'],
    ['2', 'Tie milestones to outcomes'],
    ['4', 'Not generic progress'],
    ['5', 'Not vague timing'],
    ['6', 'Assign gate owners'],
    ['6', 'Define entry criteria'],
    ['6', 'Decide next-step actions'],
    ['6', 'Add review dates'],
  ]);
  eq('a milestone for most tasks is not scarce', r.scarce, ['Keep them scarce']);

  const dep = await page.evaluate(async () => {
    const m = await import('/js/ganttModel.js');
    const project = {
      ganttActivities: [
        { id: 'a', name: 'Plan', start: '2026-10-01', end: '2026-10-10' },
        { id: 'b', name: 'Build', start: '2026-10-08', end: '2026-10-20', after: 'a' },
        { id: 'c', name: 'Test', start: '2026-10-21', end: '2026-10-25', after: 'b' },
        { id: 'x', name: 'Loop one', start: '2026-11-01', end: '2026-11-02', after: 'y' },
        { id: 'y', name: 'Loop two', start: '2026-11-03', end: '2026-11-04', after: 'x' },
      ],
    };
    const issues = m.dependencyIssues(project);
    const laid = m.layOut({ methodology: 'project', dashTasks: [], dueDate: '' }, undefined, (() => { let n = 0; return () => `id${++n}`; })());
    return {
      overlap: issues.filter((i) => i.kind === 'overlap').map((i) => [i.id, i.overlap, i.fix.start, i.fix.end]),
      loops: issues.filter((i) => i.kind === 'loop').map((i) => i.id).sort(),
      chain: laid.map((a) => [a.name, laid.find((x) => x.id === a.after)?.name || '']),
    };
  });
  eq('starting three days before the one it follows ends is out of order, and the fix keeps its length',
     dep.overlap.filter(([id]) => id === 'b'), [['b', 3, '2026-10-11', '2026-10-23']]);
  eq('a loop is named', dep.loops, ['x', 'y']);
  eq('a laid-out lifecycle chains its phases; the one alongside follows nothing', dep.chain, [
    ['Initiating', ''], ['Planning', 'Initiating'], ['Executing', 'Planning'], ['Monitoring & Controlling', ''], ['Closing', 'Executing'],
  ]);

  console.log('\n--- gates on the Plan page ---');
  await openDestination(page, 'tab-planner');
  await page.waitForTimeout(300);
  eq('the tab is Milestones & Gates', (await page.textContent('#page-planner .page-tab.is-active')).startsWith('Milestones & Gates'), true);
  eq('the starter’s gate is marked as one', await page.$eval('#milestones-body tr:nth-child(3) [data-field="kind"]', (s) => s.value), 'gate');
  const card = '#gate-cards .gate-card';
  eq('its card: one criterion open, so not ready', [await page.textContent(`${card} [data-gate-state]`), (await page.textContent(`${card} .gate-criteria`)).includes('1 open')], ['Not ready — criteria open', true]);
  await page.check(`${card} li:nth-child(2) [data-criterion-field="met"]`);
  await page.waitForTimeout(200);
  eq('meeting the last criterion makes it ready', await page.textContent(`${card} [data-gate-state]`), 'Ready to decide');

  await page.fill('#milestones-body tr:nth-child(3) [data-field="owner"]', '');
  await page.selectOption(`${card} [data-gate-decision]`, 'Go');
  await page.click(`${card} [data-gate="decide"]`);
  await page.waitForTimeout(200);
  eq('no owner, no decision', [await page.isVisible('.toast--error'), await page.evaluate(async () => (await import('/js/state.js')).getState().milestones[2].decision)], [true, '']);
  await page.fill('#milestones-body tr:nth-child(3) [data-field="owner"]', 'Priya N.');
  await page.selectOption(`${card} [data-gate-decision]`, 'Go');
  await page.click(`${card} [data-gate="decide"]`);
  await page.waitForSelector('.dialog');
  eq('the preview says it passes the gate', (await page.textContent('.dialog')).includes('marked done today'), true);
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(300);
  const decided = await page.evaluate(async () => (await import('/js/state.js')).getState().milestones[2]);
  eq('decided by its owner, and the milestone is done', [decided.decision, decided.decidedBy, decided.done], ['Go', 'Priya N.', true]);
  eq('the table’s Done box follows', await page.isChecked('#milestones-body tr:nth-child(3) [data-field="done"]'), true);

  console.log('\n--- the milestone check ---');
  await page.click('#page-planner [data-action="add-milestone"]');
  await page.waitForTimeout(200);
  await page.fill('#milestones-body tr:last-child [data-field="text"]', 'Campaign 50% done');
  await page.waitForTimeout(200);
  const check = await page.textContent('#milestone-findings');
  eq('a progress figure and a missing date are named as they are typed', [check.includes('Not generic progress'), check.includes('Not vague timing')], [true, true]);
  eq('the caret stays in the name', await page.evaluate(() => document.activeElement.dataset.field), 'text');

  console.log('\n--- on the Gantt ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const s = st.getState();
    const gm = await import('/js/ganttModel.js');
    s.methodology = 'project';
    s.ganttActivities = gm.layOut(s, undefined, st.uid);
    st.scheduleSave();
  });
  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-planner', 'sec-gantt'));
  await page.waitForTimeout(300);
  eq('milestones and gates sit across the top', await page.$$eval('#gantt-body .gantt-mark', (e) => e.length) >= 4, true);
  eq('a passed gate is drawn as passed', await page.$$eval('#gantt-body .gantt-mark.is-gate', (e) => e.map((x) => x.className).some((c) => c.includes('is-go'))), true);
  eq('each activity names what it follows', await page.$$eval('#gantt-body .gantt-row [data-field="after"]', (s) => s.filter((x) => x.value).length), 3);
  // Pull Executing back into Planning: out of order.
  const exec = await page.evaluate(async () => (await import('/js/state.js')).getState().ganttActivities.find((a) => a.name === 'Executing'));
  const planning = await page.evaluate(async () => (await import('/js/state.js')).getState().ganttActivities.find((a) => a.name === 'Planning'));
  await page.fill(`#gantt-body .gantt-row[data-id="${exec.id}"] [data-field="start"]`, planning.start);
  await page.dispatchEvent(`#gantt-body .gantt-row[data-id="${exec.id}"] [data-field="start"]`, 'change');
  await page.waitForTimeout(300);
  eq('starting before what it follows ends is flagged', [await page.isVisible('#gantt-issues'), await page.getAttribute(`#gantt-body .gantt-row[data-id="${exec.id}"]`, 'class').then((c) => c.includes('is-conflict'))], [true, true]);
  await page.click('#gantt-issues [data-gantt="fix"]');
  await page.waitForTimeout(300);
  const fixed = await page.evaluate(async (id) => (await import('/js/state.js')).getState().ganttActivities.find((a) => a.id === id), exec.id);
  const planEnd = new Date(`${planning.end}T00:00:00`);
  planEnd.setDate(planEnd.getDate() + 1);
  const nextDay = `${planEnd.getFullYear()}-${String(planEnd.getMonth() + 1).padStart(2, '0')}-${String(planEnd.getDate()).padStart(2, '0')}`;
  const flagged = await page.$$eval('#gantt-issues [data-issue]', (e) => e.map((x) => x.dataset.issue));
  eq('the fix starts it the day after, keeping its length; what follows it is flagged next', [fixed.start, flagged.includes(exec.id), flagged.length], [nextDay, false, 1]);
  await page.click('#gantt-body .gantt-mark >> nth=0');
  await page.waitForTimeout(300);
  eq('a diamond opens its milestone row', await page.evaluate(() => document.activeElement.closest('#milestones-body') !== null), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
