// Escalating to the level that can decide, and the blocker path.
//
// Pins the four levels lowest first; that how far an issue reaches picks the
// lowest level that can decide, a level too low or too high is named, and
// serious harm takes the emergency route whatever else is chosen; that the
// five steps and the checks are worked out from the pack; the one-line
// message; and that a blocked task is found from its own history and becomes
// an issue with the fact and the impact already written.

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
    const e = await import('/js/escalation.js');
    const fit = (reach, level) => e.levelFit({ reach, level });
    const item = { title: 'the vendor API keys', owner: 'Ana', type: 'Issue', status: 'Open', escalation: e.newPack({ status: 'Open' }) };
    const steps = () => e.escalationSteps(item).map((s) => s.done);
    const out = { levels: e.LEVELS.map((l) => l.id), steps: [steps()] };
    out.fits = [fit('owner', 'owner'), fit('sponsor', 'owner'), fit('team', 'sponsor'), fit('emergency', 'sponsor'), fit('', 'owner')];
    Object.assign(item.escalation, { tried: 'Asked the vendor twice', impact: 'Launch on 12 Oct', evidence: 'Emails of 1 and 3 Oct', options: 'Pay for priority support\nSwitch to the sandbox', recommendation: 'Pay for priority support', to: 'Sam', decideBy: '2026-10-08', reach: 'owner', level: 'owner', delay: 'Each day costs a test day' });
    out.steps.push(steps());
    out.checks = e.escalationChecks(item).map((c) => c.ok);
    item.escalation.sentAt = '2026-10-02T09:00'; item.escalation.acceptedAt = '2026-10-02T10:00';
    item.escalation.decidedAt = '2026-10-03T09:00';
    out.steps.push(steps());
    item.escalation.communicatedAt = '2026-10-03T10:00';
    out.steps.push(steps());
    out.line = e.blockerMessage(item);
    out.blank = e.blockerMessage({ escalation: {} });
    const project = { dashTasks: [
      { id: 'a', name: 'Design sign-off', status: 'In Progress', end: '2026-10-05' },
      { id: 'b', name: 'Build', status: 'Not Started', dependsOn: ['a'], end: '2026-10-20', assigned: 'Ben', statusHistory: [{ status: 'Not Started', blocked: false, at: '2026-09-20T09:00' }, { status: 'Not Started', blocked: true, at: '2026-09-28T09:00' }] },
      { id: 'c', name: 'Test', status: 'Not Started', dependsOn: ['b'] },
      { id: 'd', name: 'Legal review', status: 'On Hold', statusHistory: [{ status: 'On Hold', blocked: true, at: '2026-09-30T09:00' }] },
      { id: 'e', name: 'Done thing', status: 'Complete' },
    ], raid: [] };
    const blocked = e.blockedWork(project, new Date(2026, 9, 2));
    out.blocked = blocked.map((b) => [b.task.name, b.since, b.days]);
    const issue = e.blockerIssue(blocked.find((b) => b.task.id === 'b'), new Date(2026, 9, 2));
    out.issue = [issue.type, issue.title, issue.owner, issue.taskId, issue.escalation.evidence, issue.escalation.impact];
    return out;
  });
  eq('four levels, lowest first', r.levels, ['team', 'owner', 'sponsor', 'emergency']);
  eq('the level is checked against how far it reaches', r.fits, ['fits', 'low', 'high', 'emergency', null]);
  eq('an empty pack has no step done', r.steps[0], [false, false, false, false, false]);
  eq('tried and documented', r.steps[1], [true, true, false, false, false]);
  eq('every check passes for a full pack', r.checks, [true, true, true, true, true, true, true]);
  eq('sent, owner accepted, decided — but follow-through waits for the outcome to be shared', r.steps[2], [true, true, true, true, false]);
  eq('then all five', r.steps[3], [true, true, true, true, true]);
  eq('the one-line message', r.line, 'We are blocked by the vendor API keys. It puts Launch on 12 Oct at risk. Choose Pay for priority support or Switch to the sandbox by 2026-10-08. Ana owns the next action.');
  eq('with blanks it says what to fill', r.blank, 'We are blocked by [fact]. It puts [outcome/date] at risk. Choose [A/B] by [date]. [Name] owns the next action.');
  eq('blocked work: waiting or on hold, longest first, since when from its history', r.blocked, [['Build', '2026-09-28', 4], ['Legal review', '2026-09-30', 2], ['Test', '', null]]);
  eq('a blocker becomes an issue with the fact and the impact written', r.issue, ['Issue', 'Blocked: Build', 'Ben', 'b', 'Blocked since 2026-09-28 (4 days). Waiting on: Design sign-off.', 'Build due 2026-10-20; holds up Test']);

  console.log('\n--- on the page ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const p = st.getState();
    p.dashTasks.push(
      { id: 'tx1', name: 'Payment gateway', status: 'In Progress', end: '2099-01-01' },
      { id: 'tx2', name: 'Checkout page', status: 'Not Started', dependsOn: ['tx1'], end: '2099-02-01', assigned: 'Ben' },
    );
    st.scheduleSave();
  });
  await page.waitForTimeout(600);
  await openDestination(page, 'nav-escalations');
  await page.waitForTimeout(300);
  eq('the levels are there to compare', await page.$$eval('#raid-esc-levels tbody th', (e) => e.map((x) => x.textContent)), ['Team resolution', 'Project owner', 'Sponsor / governance', 'Emergency route']);
  eq('blocked work lists the waiting task', (await page.textContent('#raid-blocked')).includes('Checkout page'), true);
  await page.click('#raid-blocked [data-blocked-escalate="tx2"]');
  await page.waitForTimeout(300);
  const card = '#raid-escalations .escalation:has-text("Blocked: Checkout page")';
  eq('Escalate raises it with the impact filled in', (await page.inputValue(`${card} [data-pack="impact"]`)).startsWith('Checkout page due 2099-02-01'), true);
  eq('and the blocked list now says it is escalated', await page.isVisible('#raid-blocked [data-blocked-open]'), true);
  await page.selectOption(`${card} [data-pack="reach"]`, 'emergency');
  await page.selectOption(`${card} [data-pack="level"]`, 'owner');
  await page.waitForTimeout(200);
  eq('serious harm at a normal level is called out', (await page.textContent(`${card} [data-derived="fit"]`)).startsWith('Serious harm takes the emergency route'), true);
  await page.selectOption(`${card} [data-pack="reach"]`, 'owner');
  await page.fill(`${card} [data-pack="options"]`, 'Stub the gateway\nWait a week');
  await page.waitForTimeout(200);
  eq('the one line follows what is typed, and the field keeps focus', [(await page.textContent(`${card} [data-derived="message"]`)).includes('Choose Stub the gateway or Wait a week'), await page.evaluate(() => document.activeElement?.dataset.pack)], [true, 'options']);
  eq('the level that fits says what to bring', (await page.textContent(`${card} [data-derived="fit"]`)).includes('Bring: impact analysis'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
