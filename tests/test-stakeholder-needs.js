// Stakeholder needs: ask each person what they need to decide.
//
// Pins the nine areas in the guide's order; that the five steps are worked
// out — Ask needs all nine and a date, a confirmation lapses when an answer
// moves and falls due after ninety days, Agree is a real entry on the
// Communications Plan whose channel and frequency match, and Test counts only
// after the confirmation and only if it helped; that the record is per person
// and points at the register; that who has not been asked is named; and that
// typing an answer keeps the field while the table follows.

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
    const n = await import('/js/stakeholderNeeds.js');
    const sig = await import('/js/signatureModel.js');
    const s = { id: 's1', name: 'Dana Sponsor', role: 'Director' };
    const project = { stakeholders: [s, { id: 's2', name: 'Omar Lead' }], comms: [] };
    const full = n.newNeeds('s1', {
      prepared: 'Ask about the budget gate', askedAt: '2026-09-20', role: 'Sponsor, approves exceptions', decisions: 'Scope changes\nInvestment',
      outcomes: 'Benefits realised', risks: 'Regulatory', detail: 'Summary', format: 'One-pager', cadence: 'Monthly', triggers: 'Budget variance over 10%', response: 'A clear recommendation',
    });
    const states = (needs, today = new Date(2026, 8, 30)) => n.workflow(project, s, needs, today).map((x) => x.state);
    const out = { areas: n.AREAS.map((a) => a.label), steps: [] };
    out.steps.push(states(n.newNeeds('s1')));
    out.steps.push(states({ ...full, askedAt: '' }));
    full.confirmation = { at: '2026-09-21T10:00', hash: sig.fingerprint(n.needsContent(full)) };
    out.steps.push(states(full));
    const { patch } = n.agreedComms(project, s, full);
    project.comms.push({ id: 'c1', ...patch });
    out.patch = [patch.audience, patch.channel, patch.frequency, patch.purpose];
    out.steps.push(states(full));
    full.tested = { at: '2026-09-25', helped: true };
    out.steps.push(states(full));
    out.due = states(full, new Date(2027, 0, 30));
    full.cadence = 'Weekly';
    out.changed = states(full);
    out.checks = n.diagnostics(project, s, full, new Date(2026, 8, 30)).map((c) => [c.id, c.ok]);
    out.unasked = n.needsOverview({ ...project, stakeholderNeeds: [{ id: 'x', ...full }] }).unasked.map((x) => x.name);
    out.note = n.confirmationNote(s, full, 'Sam PM');
    out.table = n.needsTable({ ...project, stakeholderNeeds: [{ id: 'x', ...full }] }).split('\n');
    return out;
  });
  eq('the nine areas, in the guide’s order', r.areas, ['Role', 'Decisions', 'Outcomes', 'Risks', 'Detail', 'Format', 'Cadence', 'Escalation triggers', 'Preferred response']);
  eq('nothing asked: every step to do', r.steps[0], ['todo', 'todo', 'todo', 'todo', 'todo']);
  eq('all nine answered but no conversation date: Ask is not done', r.steps[1].slice(0, 2), ['done', 'todo']);
  eq('asked and confirmed', r.steps[2].slice(0, 4), ['done', 'done', 'done', 'todo']);
  eq('Agree writes their format and cadence onto the Communications Plan', r.patch, ['Dana Sponsor', 'Report', 'Monthly', 'What they need to decide: Scope changes; Investment']);
  eq('then Agree is done; Test waits', r.steps[3].slice(3), ['done', 'todo']);
  eq('shared and it helped: all five', r.steps[4], ['done', 'done', 'done', 'done', 'done']);
  eq('after ninety days the confirmation is due again', r.due[2], 'lapsed');
  eq('changing an answer lapses the confirmation and the agreement no longer matches', [r.changed[2], r.changed[3], r.changed[4]], ['lapsed', 'lapsed', 'todo']);
  eq('the diagnostic checks read the record', r.checks, [['decisions', true], ['format', true], ['cadence', false], ['risks', true], ['triggers', true], ['response', true], ['recent', false]]);
  eq('who has not been asked is named', r.unasked, ['Omar Lead']);
  eq('the confirmation note is the template, filled in', [r.note.startsWith('Subject: Confirming our discussion\n\nHi Dana,'), r.note.includes('• Cadence: Weekly'), r.note.endsWith('Sam PM')], [true, true, true]);
  eq('the needs record copies as a table', [r.table[0].split('\t').length, r.table.length, r.table[2].startsWith('Omar Lead')], [8, 3, true]);

  console.log('\n--- on the page ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const p = st.getState();
    p.stakeholders = [{ id: 'sd', name: 'Dana Sponsor', org: 'Client', role: 'Director' }, { id: 'so', name: 'Omar Lead', org: 'Internal', role: 'Director' }];
    p.comms = [];
    p.contacts = [...(p.contacts || []), { id: 'ct1', name: 'Dana Sponsor', email: 'dana@example.com' }];
    p.stakeholderNeeds = [];
    st.saveImmediately ? st.saveImmediately() : st.scheduleSave();
  });
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await openDestination(page, 'nav-stakeholder-needs');
  await page.waitForTimeout(300);
  eq('Stakeholder Needs is a tab of People & Stakeholders, after Stakeholders & Comms', (await page.$$eval('#page-people .page-tab', (e) => e.map((x) => x.textContent.replace(/\d+$/, '')))).slice(2, 4), ['Stakeholders & Comms', 'Stakeholder Needs']);
  eq('every stakeholder on the register is a row, none asked yet', [await page.$$eval('#needs-table tbody tr', (e) => e.length), (await page.textContent('#needs-unasked')).includes('Dana Sponsor, Omar Lead')], [2, true]);
  eq('the interview asks the nine areas', await page.$$eval('#needs-body .needs-area', (e) => e.length), 9);

  const area = (f) => `#needs-body [data-needs-field="${f}"]`;
  await page.click(area('decisions'));
  await page.keyboard.type('Scope changes');
  await page.waitForTimeout(200);
  eq('typing keeps the field and the table follows', [await page.evaluate(() => document.activeElement?.dataset.needsField), (await page.textContent('#needs-table tbody tr:first-child')).includes('Scope changes')], ['decisions', true]);
  await page.fill(area('prepared'), 'Budget gate is hers');
  await page.fill(area('askedAt'), '2026-09-29');
  for (const [f, v] of [['role', 'Sponsor'], ['outcomes', 'Benefits'], ['risks', 'Regulatory'], ['triggers', 'Budget over 10%']]) await page.fill(area(f), v);
  await page.selectOption(area('detail'), 'Summary');
  await page.selectOption(area('format'), 'Dashboard');
  await page.selectOption(area('cadence'), 'Monthly');
  await page.selectOption(area('response'), 'A clear recommendation');
  await page.waitForTimeout(200);
  eq('prepared and asked', await page.$$eval('#needs-steps .needs-step', (e) => e.map((x) => x.className.replace('needs-step is-', ''))), ['done', 'done', 'todo', 'todo', 'todo']);
  eq('the note is ready to send, by email to the address on Contacts', [(await page.textContent('#needs-note')).includes('• Information needs (format and detail): Dashboard, Summary'), (await page.getAttribute('#needs-mail', 'href')).startsWith('mailto:dana%40example.com?subject=Confirming%20our%20discussion')], [true, true]);

  await page.click('[data-needs="confirm"]');
  await page.click('[data-needs="agree"]');
  await page.waitForTimeout(300);
  const comms = await page.evaluate(async () => (await import('/js/state.js')).getState().comms.map((c) => [c.audience, c.channel, c.frequency]));
  eq('Agree puts it on the Communications Plan', comms, [['Dana Sponsor', 'Dashboard', 'Monthly']]);
  // Shared after it was confirmed: today, on the page's own clock.
  await page.fill('#needs-body [data-needs-test="at"]', await page.evaluate(async () => (await import('/js/dates.js')).todayISO()));
  await page.selectOption('#needs-body [data-needs-test="helped"]', 'yes');
  await page.waitForTimeout(200);
  eq('then all five steps are done', await page.$$eval('#needs-steps .needs-step.is-done', (e) => e.length), 5);
  eq('and only Omar is left to ask', (await page.textContent('#needs-unasked')).trim(), 'Not yet asked: Omar Lead. Are there others who need different information?');

  await page.selectOption(area('cadence'), 'Weekly');
  await page.waitForTimeout(200);
  eq('changing an answer asks for confirmation again, and the plan no longer matches', await page.$$eval('#needs-steps .needs-step', (e) => e.map((x) => x.className.replace('needs-step is-', ''))), ['done', 'done', 'lapsed', 'lapsed', 'todo']);

  await page.click('[data-needs-pick="so"]');
  await page.waitForTimeout(200);
  eq('the other person, same job title, starts blank: needs are per person', [await page.inputValue('#needs-picker'), await page.inputValue(area('decisions'))], ['so', '']);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await openDestination(page, 'nav-stakeholder-needs');
  await page.waitForTimeout(300);
  eq('the record survives a reload', (await page.textContent('#needs-table tbody tr:first-child')).includes('Scope changes'), true);

  await page.click('[data-needs="clear"]');
  await page.waitForTimeout(300);
  eq('clearing a record sends it to the Trash, named for the person', await page.evaluate(async () => (await import('/js/state.js')).listTrash().some((t) => t.kind === 'stakeholderNeeds' && t.label === 'Dana Sponsor')), true);
  await page.click('.toast .toast__action');
  await page.waitForTimeout(300);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
