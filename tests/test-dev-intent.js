// The development intent: intent.md for a coding agent to start from.
//
// Pins that the brief reads the project's own fields rather than copying
// them; that an unanswered question is written in as "ask before assuming"
// and counted, never dropped; that ready is worked out; that no commercial
// figure reaches the file; that a value which looks like a credential is not
// kept; and that the form keeps an edit in progress while the preview
// follows it.

const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
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
    const d = await import('/js/devIntent.js');
    const empty = { projectName: 'Empty', contractValue: 48250, budgetPlanned: 31337 };
    const full = {
      projectName: 'Clinic bookings', objective: 'Cut missed appointments by 20% by March', charterBusinessCase: 'Missed slots cost the clinic.',
      charterScopeIn: 'Online booking\nReminders', charterScopeOut: 'Billing', charterSuccess: 'Patients book without calling',
      charterConstraints: 'Must run on old Android phones', contractValue: 48250, budgetPlanned: 31337,
      deliverables: [{ name: 'Booking site', due: '2027-01-15', acceptance: 'A patient books a slot in under a minute' }],
      milestones: [{ text: 'Beta', due: '2026-12-01' }, { text: 'Done one', due: '2026-10-01', done: true }],
      raid: [{ type: 'Risk', title: 'Clinic calendar API is slow', action: 'Cache the day view', status: 'Open' }, { type: 'Assumption', title: 'Patients have email', status: 'Open' }],
      dependencies: [{ description: 'API keys from the clinic', party: 'Clinic IT', status: 'Open' }],
      devIntent: {
        product: 'A booking site where patients pick a slot and get a reminder.', users: 'Patient — books\nReceptionist — sees the day',
        nonGoals: 'No native app', stack: 'Agent proposes, we approve', firstSlice: 'Book one slot for one clinic, no sign-in',
        done: 'Tests pass\nReviewed', unknownField: 'dropped',
      },
    };
    const emptyMd = d.intentMarkdown(empty);
    const fullMd = d.intentMarkdown(full);
    return {
      emptyReady: d.intentReadiness(empty),
      fullReady: d.intentReadiness(full),
      fields: Object.keys(d.intentOf(full)).length,
      emptyMd, fullMd,
      secret: [d.looksLikeSecret('db password: hunter2'), d.looksLikeSecret('Keys are in the team vault')],
    };
  });
  eq('an empty project answers none of the nine questions', [r.emptyReady.passed, r.emptyReady.total, r.emptyReady.ready], [0, 9, false]);
  eq('a project with each answered is ready', [r.fullReady.passed, r.fullReady.ready], [9, true]);
  eq('the form keeps its own thirteen fields and nothing else', r.fields, 13);
  eq('an empty brief says it is not ready, and how many are open', r.emptyMd.includes('**Not ready: 9 questions still open**'), true);
  eq('a blank is written in as ask-before-assuming, not left out', (r.emptyMd.match(/Not stated — ask before assuming/g) || []).length >= 6, true);
  eq('and each missing answer is an open question', r.emptyMd.includes('- The first slice is named — not yet.'), true);
  eq('a full brief says it is ready', r.fullMd.includes('**Ready to start.**'), true);
  eq('it opens on the project’s name and objective', [r.fullMd.split('\n')[0], r.fullMd.includes('Cut missed appointments by 20% by March')], ['# Intent: Clinic bookings', true]);
  eq('acceptance criteria are checkboxes, from the deliverables and the success criteria',
    [r.fullMd.includes('- [ ] **Booking site** (due 2027-01-15): A patient books a slot in under a minute'), r.fullMd.includes('- [ ] Patients book without calling')], [true, true]);
  eq('do not build: the charter’s out of scope and the form’s, together', r.fullMd.includes('- Billing\n- No native app'), true);
  eq('open milestones only', [r.fullMd.includes('2026-12-01 — Beta'), r.fullMd.includes('Done one')], [true, false]);
  eq('risks with their response, assumptions and dependencies', [r.fullMd.includes('Risk: Clinic calendar API is slow — response: Cache the day view'), r.fullMd.includes('Assumes: Patients have email'), r.fullMd.includes('Depends on: API keys from the clinic (Clinic IT)')], [true, true, true]);
  eq('the first slice is step two of how to start', r.fullMd.includes('2. Build the first slice, end to end: Book one slot for one clinic, no sign-in'), true);
  eq('no price reaches the file', [r.emptyMd, r.fullMd].some((m) => /48250|48,250|31337|31,337/.test(m)), false);
  eq('a credential is recognised; where it lives is not', r.secret, [true, false]);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-dev-intent');
  await page.waitForTimeout(300);
  eq('Dev Intent is a tab of Scope & Contract, after the plan', (await page.$$eval('#page-scope .page-tab', (e) => e.map((x) => x.textContent.replace(/\d+$/, '')))).slice(0, 3), ['Charter', 'Project Plan', 'Dev Intent']);
  eq('three groups to answer and one read from the project', await page.$$eval('#intent-form legend', (e) => e.map((x) => x.textContent)), ['The product', 'Technical direction', 'How to start', 'Read from the project']);
  eq('nine checks', await page.$$eval('#intent-checks .intent-check', (e) => e.length), 9);

  await page.click('[data-check="product"] [data-intent-go]');
  eq('Answer it goes to the field', await page.evaluate(() => document.activeElement?.dataset.intentField), 'product');
  await page.keyboard.type('A booking site for clinic patients');
  await page.waitForTimeout(200);
  eq('typing keeps the field, and the preview follows', [
    await page.evaluate(() => document.activeElement?.dataset.intentField),
    (await page.textContent('#intent-preview')).includes('A booking site for clinic patients'),
    await page.getAttribute('[data-check="product"]', 'class'),
  ], ['product', true, 'intent-check is-ok']);

  await page.fill('#sec-dev-intent [data-intent-field="repo"]', 'github.com/clinic/bookings, token: ghp_abcdefghijklmnopqrstuvwx');
  await page.waitForTimeout(200);
  eq('a credential is refused at the input, and the page says why', [
    await page.isVisible('[data-secret-for="repo"]'),
    await page.evaluate(async () => (await import('/js/state.js')).getState().devIntent.repo || ''),
  ], [true, '']);
  await page.fill('#sec-dev-intent [data-intent-field="repo"]', 'github.com/clinic/bookings');
  await page.waitForTimeout(600);
  eq('a plain answer is kept', await page.evaluate(async () => (await import('/js/state.js')).getState().devIntent.repo), 'github.com/clinic/bookings');

  await page.click('#sec-dev-intent [data-intent-go="nav-charter"] >> nth=0');
  await page.waitForTimeout(300);
  eq('what is read from the project is edited where it lives', (await page.textContent('#page-scope .page-tab.is-active')).startsWith('Charter'), true);
  await page.fill('#charter-fields [data-field="charterScopeOut"]', 'Payments');
  await openDestination(page, 'nav-dev-intent');
  await page.waitForTimeout(300);
  eq('and comes back into the brief', (await page.textContent('#intent-preview')).includes('- Payments'), true);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await openDestination(page, 'nav-dev-intent');
  await page.waitForTimeout(300);
  eq('the answers survive a reload', await page.inputValue('#sec-dev-intent [data-intent-field="product"]'), 'A booking site for clinic patients');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-intent="download"]')]);
  const fs = require('fs');
  const body = fs.readFileSync(await download.path(), 'utf8');
  eq('it downloads as intent.md, the same text as the preview', [download.suggestedFilename(), body === await page.textContent('#intent-preview'), body.startsWith('# Intent:')], ['intent.md', true, true]);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  eq('the preview sits under the form', await page.evaluate(() => document.querySelector('.intent-preview').getBoundingClientRect().top > document.querySelector('.intent-form').getBoundingClientRect().bottom - 1), true);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
