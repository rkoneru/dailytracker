// The scope acceptance line.
//
// Pins the five categories and the five criteria; that the criteria raise
// questions about a category without moving the item; that the line writes
// onto the charter's In and Out of scope; that acceptance is a signature over
// the items and their categories, lapsing when one moves; the six steps; the
// scope statement; and that the items are a register on the same tab.

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
    const s = await import('/js/scopeLine.js');
    const sig = await import('/js/signatureModel.js');
    const item = (name, category, extra = {}) => ({ name, category, outcome: 'Needed for the outcome', dependency: 'Nothing needs it', obligation: 'None', effort: 'M', risk: 'Low', rationale: 'Because', ...extra });
    const project = {
      projectName: 'Pilot', objective: 'Show usage reporting works for the pilot group by March', charterSuccess: 'Pilot group uses the report weekly',
      scopeItems: [
        item('Core usage report', 'Must-have'),
        item('Data extraction set-up', 'Enabling work', { outcome: 'Helps the outcome', dependency: 'Other items need it' }),
        item('Additional dashboards', 'Optional improvement', { outcome: 'Helps the outcome' }),
        item('Mobile app access', 'Deferred', { outcome: 'Not needed', rationale: 'Phase 2' }),
        item('Integration with CRM', 'Explicit exclusion', { outcome: 'Not needed', rationale: 'Out of scope for this pilot' }),
      ],
      raid: [{ type: 'Assumption', title: 'Pilot group has access', status: 'Open' }],
    };
    const steps = () => s.lineSteps(project).map((x) => x.done);
    const out = { cats: s.CATEGORIES.map((c) => c.id), criteria: s.CRITERIA.map((c) => c.field), steps: [steps()] };
    out.questions = [
      s.categoryQuestions(item('Accessibility testing', 'Deferred', { rationale: 'Later' })),
      s.categoryQuestions(item('GDPR consent', 'Explicit exclusion', { obligation: 'Legal or contractual', rationale: 'x' })),
      s.categoryQuestions(item('Nice logo', 'Must-have', { outcome: 'Not needed' })),
      s.categoryQuestions(project.scopeItems[0]),
    ].map((q) => q.length);
    out.charter = s.charterText(project);
    Object.assign(project, { charterScopeIn: out.charter.scopeIn, charterScopeOut: out.charter.scopeOut, scopeLine: { approver: 'Dana' } });
    out.steps.push(steps());
    project.scopeLine.signature = sig.createSignature({ name: 'Dana', statement: 's', content: s.lineContent(project) });
    project.scopeLine.communicatedAt = new Date(Date.now() + 1000).toISOString();
    out.steps.push(steps());
    out.checks = s.lineChecks(project).map((c) => c.ok);
    project.scopeItems[2].category = 'Must-have';
    out.lapsed = [s.lineApproval(project).state, s.inCharter(project)];
    out.statement = s.scopeStatement(project).split('\n');
    return out;
  });
  eq('five categories', r.cats, ['Must-have', 'Enabling work', 'Optional improvement', 'Deferred', 'Explicit exclusion']);
  eq('five criteria', r.criteria, ['outcome', 'dependency', 'obligation', 'effort', 'risk']);
  eq('the criteria ask about: a cut quality item, a legal item left out, a must-have nothing needs; none about a sound one', r.questions.map((n) => n > 0), [true, true, true, false]);
  eq('the line becomes the charter’s In and Out of scope', r.charter, {
    scopeIn: 'Core usage report\nData extraction set-up\nIf capacity allows: Additional dashboards',
    scopeOut: 'Integration with CRM — Out of scope for this pilot\nDeferred: Mobile app access',
  });
  eq('objective and assessment first; written onto the charter with an approver', [r.steps[0].slice(0, 2), r.steps[1]], [[true, true], [true, true, true, false, true, false]]);
  eq('accepted and shared: all six', r.steps[2], [true, true, true, true, true, true]);
  eq('every check passes', r.checks, [true, true, true, true, true, true, true, true, true, true]);
  eq('moving an item’s category lapses the acceptance and unsyncs the charter', r.lapsed, ['changed', false]);
  eq('the scope statement follows the template', [r.statement[0], r.statement.includes('In scope (must-haves and enabling work):'), r.statement.includes('  - Pilot group has access'), r.statement.includes('  - Integration with CRM (Out of scope for this pilot)')], ['Project name: Pilot', true, true, true]);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-scope-line');
  await page.waitForTimeout(300);
  eq('Scope Line is a tab of Scope & Contract, with its register', [(await page.textContent('#page-scope .page-tab.is-active')).startsWith('Scope Line'), await page.isVisible('#sec-scope-items')], [true, true]);
  await page.click('#sec-scope-items .register-add, #sec-scope-items button:has-text("+ Add Item")');
  await page.waitForTimeout(200);
  const row = '#sec-scope-items tbody tr:last-child';
  await page.fill(`${row} [data-field="name"]`, 'Security testing');
  await page.selectOption(`${row} [data-field="category"]`, 'Deferred');
  await page.waitForTimeout(300);
  eq('the criteria ask about it, and nothing is moved', [(await page.textContent('#scope-line-questions')).includes('Security testing'), await page.inputValue(`${row} [data-field="category"]`)], [true, 'Deferred']);
  eq('the count follows', (await page.textContent('#scope-line-counts [data-cat="Deferred"]')).trim().startsWith('1'), true);
  await page.fill(`${row} [data-field="rationale"]`, 'Booked for the hardening sprint');
  await page.selectOption(`${row} [data-field="category"]`, 'Must-have');
  await page.waitForTimeout(300);
  await page.click('[data-sl-act="charter"]');
  await page.waitForSelector('.dialog');
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(300);
  eq('written onto the charter', [await page.evaluate(async () => (await import('/js/state.js')).getState().charterScopeIn), await page.textContent('#scope-line-charter')], ['Security testing', 'The charter’s In and Out of scope say exactly this line.']);
  await page.fill('#scope-line-body [data-sl="approver"]', 'Dana Sponsor');
  await page.click('[data-sl-act="accept"]');
  await page.waitForSelector('#sig-name');
  await page.fill('#sig-name', 'Dana Sponsor');
  await page.check('#sig-agree');
  await page.click('.sig-dialog button[type="submit"]');
  await page.waitForTimeout(300);
  eq('accepted by the approver', (await page.textContent('#scope-line-approval')).startsWith('Accepted'), true);
  await page.click('[data-sl-act="shared"]');
  await page.waitForTimeout(200);
  eq('then shared: the last step is done', await page.getAttribute('#scope-line-steps [data-step="communicate"]', 'class'), 'needs-step is-done');
  await page.selectOption(`${row} [data-field="category"]`, 'Optional improvement');
  await page.waitForTimeout(300);
  eq('moving it lapses the acceptance', (await page.textContent('#scope-line-approval')).includes('no longer counts'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
