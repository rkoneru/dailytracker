// The AI project manager's admin, done from the record: AI-specific risks
// checked against the RAID log, the sprint summary, and the retrospective
// drafted from what the sprint actually did.
//
// Pins that the AI risk card appears only for AI work; that a risk counts as
// covered by its category or its words, never by nobody having thought of it;
// that raising one puts a real row on the log; and that the retrospective is a
// real meeting whose notes are facts and whose actions are left to the team.

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

  console.log('\n--- AI-specific risks: the rules ---');
  const r = await page.evaluate(async () => {
    const a = await import('/js/aiRisk.js');
    const m = await import('/js/methodology.js');
    const project = { raid: [
      { type: 'Risk', title: 'Model may drift after the pricing change', status: 'Open' },
      { type: 'Issue', title: 'Customer PII in the training extract', status: 'Closed' },
      { type: 'Risk', title: 'Vendor late', status: 'Open', aiRisk: 'regulation' },
      { type: 'Decision', title: 'bias review approach', status: 'Open' },
    ] };
    const cov = a.aiRiskCoverage(project, m.findMethod('crisp-dm'));
    return {
      notAi: a.aiRiskCoverage(project, m.findMethod('sdlc')),
      covered: cov.filter((c) => c.covered).map((c) => c.id),
      openCounts: Object.fromEntries(cov.filter((c) => c.covered).map((c) => [c.id, c.open])),
      row: a.aiRiskRow(a.AI_RISKS[0], '2026-10-01'),
    };
  });
  eq('not AI work, no AI risk card', r.notAi, null);
  eq('covered by its words or its category; a decision does not count', r.covered, ['privacy', 'drift', 'regulation']);
  eq('a closed row still says it was raised', r.openCounts, { privacy: 0, drift: 1, regulation: 1 });
  eq('raising one makes a real risk row under that category', [r.row.type, r.row.status, r.row.aiRisk, r.row.title.startsWith('Data quality:')], ['Risk', 'Open', 'data', true]);

  console.log('\n--- on the RAID page ---');
  await openDestination(page, 'nav-raid-log');
  await page.waitForTimeout(300);
  eq('the starter is not AI work, so the card is hidden', await page.isVisible('#sec-raid-ai'), false);
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    st.getState().methodology = 'crisp-dm';
    st.scheduleSave();
    (await import('/js/raid.js')).renderRaid();
  });
  await page.waitForTimeout(200);
  eq('on an AI method it lists all nine', [await page.isVisible('#sec-raid-ai'), await page.$$eval('#raid-ai-risks li', (e) => e.length)], [true, 9]);
  const before = await page.textContent('#raid-ai-count');
  await page.click('[data-ai-risk="drift"] [data-action="raise-ai-risk"]');
  await page.waitForTimeout(300);
  eq('raising one puts it on the log and marks it covered', [
    await page.evaluate(async () => (await import('/js/state.js')).getState().raid.some((x) => x.aiRisk === 'drift')),
    await page.getAttribute('[data-ai-risk="drift"]', 'class'),
    (await page.textContent('#raid-ai-count')) !== before,
  ], [true, 'ai-risk is-covered', true]);
  eq('the caret lands on its owner', await page.evaluate(() => document.activeElement.dataset.field), 'owner');

  console.log('\n--- the sprint summary and the retrospective ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const s = st.getState();
    const [a, b] = s.dashTasks.filter((t) => t.status !== 'Complete');
    const done = s.dashTasks.find((t) => t.status === 'Complete');
    s.sprints = [{ id: 'sp1', name: 'Sprint 1', goal: 'Launch paid', start: '2026-09-21', end: '2026-10-02', status: 'Active', focusFactor: 70, commitment: null, sharedAt: '', closed: null }];
    [a, b, done].forEach((t) => { t.sprintId = 'sp1'; if (!t.estimate) t.estimate = 8; });
    st.scheduleSave();
  });
  await openDestination(page, 'nav-sprints');
  await page.waitForTimeout(300);
  await page.click('#btn-sprint-summary');
  await page.waitForSelector('.dialog');
  const summary = await page.textContent('.dialog');
  eq('the summary says what was delivered and what was not', [summary.includes('Sprint 1 summary'), summary.includes('Not done:'), summary.includes('committed hours')], [true, true, true]);
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(150);
  const meetingsBefore = await page.evaluate(async () => (await import('/js/state.js')).getState().meetings.length);
  await page.click('#btn-sprint-retro');
  await page.waitForTimeout(500);
  const retro = await page.evaluate(async () => {
    const list = (await import('/js/state.js')).getState().meetings;
    const m = list.find((x) => x.retroFor === 'sp1');
    return { count: list.length, name: m.name, agenda: m.agenda.map((x) => x.topic), notes: m.notes, people: m.attendees.length };
  });
  eq('drafting the retrospective makes a meeting', [retro.count, retro.name], [meetingsBefore + 1, 'Sprint 1 retrospective']);
  eq('agenda: went well, did not, actions', retro.agenda, ['What went well', 'What did not', 'Actions: owner and date for each']);
  eq('its notes are facts from the sprint; the actions are left to the team', [retro.notes.includes('No commitment was recorded for this sprint.'), retro.notes.includes('Not finished:'), retro.notes.includes('the team decides these')], [true, true, true]);
  eq('it opens on the notes', [(await page.textContent('#page-meetings .page-tab.is-active')).startsWith('Notes'), (await page.inputValue('#meeting-notes')).startsWith('What went well')], [true, true]);
  await openDestination(page, 'nav-sprints');
  await page.waitForTimeout(200);
  await page.click('#btn-sprint-retro');
  await page.waitForTimeout(300);
  eq('asking again opens the same one', await page.evaluate(async () => (await import('/js/state.js')).getState().meetings.filter((x) => x.retroFor === 'sp1').length), 1);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await openDestination(page, 'nav-raid-log');
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
