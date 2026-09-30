// A handoff transfers responsibility and context.
//
// Pins that the package is read off the project for the current owner; that
// a field holding what looks like a password is refused, never stored; that
// the stage is worked out (prepare → walkthrough → verify → accept →
// monitor); that acceptance is a signature a later edit lapses; and that
// accepting moves the work only after the list is confirmed.

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
    const h = await import('/js/handoff.js');
    const sig = await import('/js/signatureModel.js');
    const project = {
      dashTasks: [{ id: 't1', name: 'Monthly report', assigned: 'Sam', status: 'In Progress' }, { id: 't2', name: 'Old', assigned: 'Sam', status: 'Complete' }, { id: 't3', name: 'Other', assigned: 'Kim', status: 'In Progress' }],
      raid: [{ id: 'r1', type: 'Risk', title: 'ERP feed late', owner: 'Sam', status: 'Open', action: 'Use last month’s extract' }, { id: 'r2', type: 'Decision', title: 'Use ERP actuals', status: 'Closed' }],
      dependencies: [{ id: 'd1', description: 'ERP refresh', party: 'Finance IT', owner: 'Sam', status: 'Open' }],
      meetings: [{ id: 'm1', decisions: [{ decision: 'Include regional breakdown' }], actions: [{ id: 'a1', text: 'Send template', owner: 'sam', status: 'Open' }] }],
      milestones: [], deliverables: [], ganttActivities: [],
    };
    const rec = h.newHandoff({ title: 'Monthly reporting', currentOwner: 'Sam', newOwner: '' });
    const pkg = h.handoffPackage(project, rec);
    const stages = [h.handoffStage(project, rec)];
    Object.assign(rec, { newOwner: 'Jordan', evidence: 'Sample run reconciled', access: 'BI tool via IT request', guide: 'Wiki / reporting', support: 'Reporting channel, two weeks', escalation: 'Jordan → Finance Manager' });
    stages.push(h.handoffStage(project, rec));
    rec.walkthroughAt = '2026-10-01';
    rec.checks = [{ id: 'c', text: 'Run the report', ok: false }];
    stages.push(h.handoffStage(project, rec));
    rec.checks[0].ok = true;
    stages.push(h.handoffStage(project, rec));
    rec.handedOver = h.coveredWork(rec, pkg);
    rec.acceptance = sig.createSignature({ name: 'Jordan', statement: 'accept', content: h.handoffContent(rec, pkg) });
    stages.push(h.handoffStage(project, rec));
    const plan = h.transferPlan(project, rec);
    const moved = h.applyTransfer(project, rec, plan);
    const afterMove = h.acceptanceState(project, rec);
    rec.access = 'BI tool, new request form';
    const afterEdit = h.acceptanceState(project, rec);
    return {
      work: pkg.work.map((w) => `${w.kind}:${w.text}`),
      decisions: pkg.decisions,
      stages,
      plan: plan.length, moved,
      owners: [project.dashTasks[0].assigned, project.raid[0].owner, project.dependencies[0].owner, project.meetings[0].actions[0].owner, project.dashTasks[2].assigned],
      states: [afterMove, afterEdit],
      secrets: ['password: hunter2', 'pwd=abc123', 'token is abcdef', 'sk-abcdefghijklmnopqrst', 'Ask IT for the BI password reset', 'Request access via the portal'].map(h.looksLikeSecret),
    };
  });
  eq('the package is the current owner’s open work, read off the project', r.work, ['Task:Monthly report', 'Risk:ERP feed late', 'Dependency:ERP refresh', 'Action:Send template']);
  eq('with the decisions already taken', r.decisions, ['Use ERP actuals', 'Include regional breakdown']);
  eq('prepare → walkthrough → verify → accept → monitor', r.stages, ['prepare', 'walkthrough', 'verify', 'accept', 'monitor']);
  eq('accepting moves every item, and only that owner’s', [r.plan, r.moved, r.owners], [4, 4, ['Jordan', 'Jordan', 'Jordan', 'Jordan', 'Kim']]);
  eq('moving the work keeps the acceptance; editing the record lapses it', r.states, ['signed', 'changed']);
  eq('a password, key or token is recognised; talking about one is not', r.secrets, [true, true, true, true, false, false]);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-handoffs');
  await page.waitForTimeout(300);
  eq('Handoffs is a tab on People & Stakeholders', (await page.textContent('#page-people .page-tab.is-active')).startsWith('Handoffs'), true);
  await page.click('#btn-handoff-new');
  await page.waitForTimeout(200);
  eq('a new handoff starts at Prepare', await page.textContent('#handoff-stage-label'), 'Stage: Prepare');
  await page.fill('#handoff-fields [data-handoff="title"]', 'Paid media');
  await page.fill('#handoff-fields [data-handoff="currentOwner"]', 'Jordan K.');
  await page.waitForTimeout(150);
  eq('the package fills from the project as the owner is named', (await page.textContent('#handoff-package')).includes('Tracking pixel not firing on checkout'), true);
  eq('the caret stays in the field', await page.evaluate(() => document.activeElement.dataset.handoff), 'currentOwner');

  await page.fill('#handoff-fields [data-handoff="access"]', 'Ads manager login, password: Summer2026!');
  await page.waitForTimeout(150);
  const stored = await page.evaluate(async () => (await import('/js/state.js')).getState().handoffs[0].access);
  eq('a password is refused, not stored', [stored, await page.isVisible('[data-secret-for="access"]')], ['', true]);
  await page.fill('#handoff-fields [data-handoff="access"]', 'Ads manager: request through the IT portal; Jordan adds the new owner as admin');
  const fill = { newOwner: 'Priya N.', evidence: 'Week one report, pixel test log', guide: 'Shared drive /campaign/runbook', support: 'Jordan on Slack until the 20th', escalation: 'Priya N. → Marketing Director' };
  for (const [k, v] of Object.entries(fill)) await page.fill(`#handoff-fields [data-handoff="${k}"]`, v);
  await page.waitForTimeout(150);
  eq('with the package complete it moves to Walkthrough', await page.textContent('#handoff-stage-label'), 'Stage: Walkthrough');
  await page.fill('#handoff-walkthrough', '2026-10-01');
  await page.click('[data-hf="add-verify"]');
  await page.fill('#handoff-verify li:last-child [data-verify-field="text"]', 'Pause and resume a campaign');
  await page.check('#handoff-verify li:last-child [data-verify-field="ok"]');
  await page.waitForTimeout(150);
  eq('walked through and verified: ready to accept', await page.textContent('#handoff-stage-label'), 'Stage: Accept');

  await page.click('[data-hf="accept"]');
  await page.waitForSelector('#sig-name');
  eq('the new owner signs', await page.inputValue('#sig-name'), 'Priya N.');
  await page.check('#sig-agree');
  await page.click('.sig-dialog button[type="submit"]');
  await page.waitForSelector('.dialog');
  const preview = await page.textContent('.dialog');
  eq('then sees exactly what moves', [preview.includes('Move'), preview.includes('Tracking pixel')], [true, true]);
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(300);
  const after = await page.evaluate(async () => {
    const s = (await import('/js/state.js')).getState();
    return { jordan: s.dashTasks.filter((t) => t.assigned === 'Jordan K.' && t.status !== 'Complete').length, raid: s.raid.find((x) => x.title.startsWith('Tracking pixel')).owner, stage: document.getElementById('handoff-stage-label').textContent };
  });
  eq('the work is the new owner’s, and the handoff is in Monitor', after, { jordan: 0, raid: 'Priya N.', stage: 'Stage: Monitor' });
  eq('every diagnostic check that applies passes', await page.$$eval('#handoff-checks .is-bad', (e) => e.length), 0);

  await page.click('[data-hf="copy"]');
  await page.waitForSelector('.dialog');
  eq('the record copies as the template', (await page.textContent('.dialog')).includes('Access (how to obtain): Ads manager: request through the IT portal'), true);
  await page.click('.dialog .btn-primary');

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
