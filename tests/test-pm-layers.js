// The gaps a six-layer read of project management found, each now filled.
//
// Documents and vendors are registers; alignment, priority, WBS codes and the
// labour estimate are derived and never stored; the closure summary is
// assembled rather than typed. What is worth pinning is the derived part —
// that it stays grey when it cannot be worked out, and that nothing it shows
// is a second copy of a number held somewhere else — plus the one place a
// typed value turns into something clickable.

const { APP_URL, launch, createChecks, openSection, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const state = (fn) => page.evaluate(fn);

  console.log('\n--- documents: an index of links, and only web links open ---');
  await openDestination(page, 'nav-documents');
  eq('the tab is on Scope & Contract', await page.textContent('#page-title'), 'Scope & Contract');
  eq('the template ships three', await page.locator('#documents-body tr').count(), 3);
  eq('each gets a DOC reference', await page.textContent('#documents-body tr:first-child .col-ref'), 'DOC-01');
  const row = '#documents-body tr:nth-child(3)';
  eq('a blank link offers nothing to open', await page.$eval(`${row} .link-open`, (a) => a.hidden), true);
  await page.fill(`${row} input[type="url"]`, 'javascript:alert(1)');
  eq('a javascript: address is kept as typed', await state(async () =>
    (await import('/js/state.js')).getState().documents[2].link), 'javascript:alert(1)');
  eq('but never becomes a link', await page.$eval(`${row} .link-open`, (a) => [a.hidden, a.getAttribute('href')]), [true, '#']);
  await page.fill(`${row} input[type="url"]`, 'https://intranet.example.com/contract');
  eq('an https address does', await page.$eval(`${row} .link-open`, (a) => [a.hidden, a.getAttribute('href'), a.rel]),
    [false, 'https://intranet.example.com/contract', 'noopener noreferrer']);
  eq('and opens away from the app', await page.getAttribute(`${row} .link-open`, 'target'), '_blank');
  eq('the check lives in one function', await state(async () => {
    const { safeUrl } = await import('/js/register.js');
    return [safeUrl('data:text/html,x'), safeUrl('http://a.example/'), safeUrl('not a url')];
  }), ['', 'http://a.example/', '']);

  console.log('\n--- vendors: the contract, its end date and how they are doing ---');
  await openDestination(page, 'nav-vendors');
  eq('the tab is on People & Stakeholders', await page.textContent('#page-title'), 'People & Stakeholders');
  eq('two suppliers ship with the template', await page.locator('#vendors-body tr').count(), 2);
  eq('performance starts unreviewed rather than good', await state(async () => {
    const { VENDORS } = await import('/js/registerDefs.js');
    return VENDORS.newRow().performance;
  }), 'Not reviewed');
  eq('both are synced collections', await state(async () => {
    const { ROW_KINDS } = await import('/js/syncModel.js');
    return ['documents', 'vendors'].every((k) => ROW_KINDS.includes(k));
  }), true);

  console.log('\n--- priority is worked out from three scores, never stored ---');
  await openDestination(page, 'tab-scope');
  await openSection(page, 'sec-charter');
  eq('unscored reads as unscored, not low', await page.textContent('#charter-priority'), 'Not scored');
  await page.fill('[data-field="charterObjective"]', 'Grow direct sales');
  await page.selectOption('[data-field="charterValue"]', '4');
  await page.selectOption('[data-field="charterFit"]', '5');
  eq('two of three is still not scored', await page.textContent('#charter-priority'), 'Not scored');
  await page.selectOption('[data-field="charterEffort"]', '3');
  eq('(4 + 5) ÷ 3', await page.textContent('#charter-priority'), '3.0 · Medium');
  await page.waitForTimeout(500);
  const stored = await state(async () => (await import('/js/state.js')).getState());
  eq('the scores are stored', [stored.charterValue, stored.charterFit, stored.charterEffort], ['4', '5', '3']);
  eq('the priority is not', Object.keys(stored).some((k) => /priority/i.test(k)), false);
  eq('the bands', await state(async () => {
    const { priorityOf } = await import('/js/priority.js');
    return [
      priorityOf({ charterValue: 5, charterFit: 5, charterEffort: 1 }),
      priorityOf({ charterValue: 1, charterFit: 1, charterEffort: 5 }),
      priorityOf({ charterValue: 9, charterFit: 1, charterEffort: 1 }),
    ];
  }), [{ score: 10, band: 'High' }, { score: 0.4, band: 'Low' }, null]);

  console.log('\n--- the portfolio reads alignment and priority off the charter ---');
  await page.evaluate(async () => {
    const s = await import('/js/state.js');
    s.createProject({ name: 'Unscored side project', templateKey: 'blank', methodology: 'project' });
  });
  await page.waitForTimeout(500);
  await openDestination(page, 'tab-portfolio');
  await page.waitForTimeout(400);
  const cells = () => page.$$eval('#portfolio-body tr', (rows) => rows.map((r) => [
    r.querySelector('.pf-name').textContent, r.querySelector('.pf-priority').textContent, r.querySelector('.pf-strategic').textContent,
  ]));
  await page.click('#portfolio-head [data-key="priority"]');
  await page.waitForTimeout(300);
  eq('highest priority first on the first click, unscored last', await cells(), [
    ['Social Media Marketing Campaign', '3.0 · Medium', 'Grow direct sales'],
    ['Unscored side project', 'Not scored', 'Not aligned'],
  ]);
  eq('the foot counts what is scored and aligned',
     await page.$$eval('#portfolio-foot td', (t) => t.map((x) => x.textContent).filter((x) => /scored|aligned/.test(x))),
     ['1 scored', '1 aligned']);
  // Back to the first project for the rest of the suite.
  await page.evaluate(async () => {
    const s = await import('/js/state.js');
    const first = s.listProjects().find((p) => p.name === 'Social Media Marketing Campaign');
    s.switchProject(first.id);
  });
  await page.waitForTimeout(500);

  console.log('\n--- WBS codes number a lifecycle and refuse to number a practice ---');
  await openDestination(page, 'tab-planner');
  await openSection(page, 'sec-gantt');
  await page.selectOption('#gantt-lifecycle', 'project');
  await page.click('[data-gantt="layout"]');
  await page.waitForTimeout(400);
  await page.selectOption('#gantt-add-phase', { index: 1 });
  await page.click('[data-gantt="add"]');
  await page.waitForTimeout(400);
  eq('phase, then place in phase', await page.$$eval('#gantt-body .gantt-row__wbs', (e) => e.map((x) => x.textContent)),
    ['1.1', '2.1', '2.2', '3.1', '4.1', '5.1']);
  eq('and none of them is stored', await state(async () =>
    (await import('/js/state.js')).getState().ganttActivities.some((a) => 'wbs' in a || 'code' in a)), false);
  eq('a practice gets no codes', await state(async () => {
    const { wbsCodes } = await import('/js/ganttModel.js');
    return wbsCodes({ methodology: 'mlops', ganttActivities: [{ id: 'x', phase: 'data' }] }).size;
  }), 0);

  console.log('\n--- the labour estimate: grey until someone has a rate ---');
  await openSection(page, 'sec-budget');
  eq('no rates, no number', await page.textContent('#cost-estimate-value'), 'Not estimated');
  eq('and it is grey', (await page.getAttribute('.cost-estimate__figure', 'class')).includes('is-unmeasured'), true);
  await page.evaluate(async () => {
    const s = await import('/js/state.js');
    const [priya, marcus, jordan] = s.listResources();
    priya.costRate = 60; marcus.costRate = 50; jordan.costRate = 70;
    s.scheduleSave();
  });
  await openSection(page, 'sec-milestones');
  await openSection(page, 'sec-budget');
  // Priya 80% for 30 days, Marcus 50% for 23, Jordan 60% for 28, at 40 h a week.
  const expected = await state(async () => {
    const s = await import('/js/state.js');
    const rate = new Map(s.listResources().map((r) => [r.id, [Number(r.costRate) || 0, r.name]]));
    return s.getState().allocations.reduce((n, a) => {
      const days = Math.round((new Date(`${a.to}T00:00`) - new Date(`${a.from}T00:00`)) / 86400000) + 1;
      return a.to ? n + (a.percent / 100) * 40 * (days / 7) * rate.get(a.resourceId)[0] : n;
    }, 0);
  });
  eq('priced from the bookings', await page.textContent('#cost-estimate-value'), Math.round(expected).toLocaleString());
  eq('and whoever has no rate is named, not priced at nothing',
     (await page.textContent('#cost-estimate')).includes('Not priced: Legal'), true);
  eq('it is not written anywhere', await state(async () =>
    Object.keys((await import('/js/state.js')).getState()).some((k) => /estimate/i.test(k))), false);
  await page.fill('#sec-budget [data-field="budgetPlanned"]', '10000');
  await page.waitForTimeout(200);
  eq('a budget it overruns turns it red', (await page.getAttribute('.cost-estimate__figure', 'class')).includes('is-bad'), true);

  console.log('\n--- the closure summary is assembled, and says what it cannot judge ---');
  await openDestination(page, 'nav-report-closure');
  await page.waitForTimeout(500);
  eq('its own report type', await page.textContent('#report-title'), 'Project Closure Summary');
  eq('with no period to step through', await page.isHidden('#btn-prev-period'), true);
  eq('one sheet, for the project that is open', await page.locator('#report-project-cards .rpt-sheet').count(), 1);
  const titles = await page.$$eval('#report-project-cards .rpt-box__title', (e) => e.map((x) => x.textContent));
  eq('the sections a closure needs', titles, ['WHAT IT SET OUT TO DO', 'DELIVERED', 'SCHEDULE', 'COST', 'SCOPE CHANGES',
    'OPEN ITEMS TO HAND OVER', 'LESSONS LEARNED', 'SIGN-OFF', 'ABOUT THIS SUMMARY']);
  const handover = await page.locator('.rpt-box', { hasText: 'OPEN ITEMS TO HAND OVER' }).innerText();
  eq('open tasks are handed over', handover.includes('Influencer contracts'), true);
  eq('so are live vendor contracts', handover.includes('Northside Agency'), true);
  eq('and it says it closes nothing itself',
     (await page.locator('.rpt-box', { hasText: 'ABOUT THIS SUMMARY' }).innerText()).includes('records no signature'), true);
  eq('the success verdict is left to the sponsor: the report never claims "met"',
     /\bmet\b/i.test(await page.locator('.rpt-box', { hasText: 'WHAT IT SET OUT TO DO' }).innerText()), false);
  const deck = await page.evaluate(async () => {
    const { deckFor } = await import('/js/reportDeck.js');
    const { getState } = await import('/js/state.js');
    const reports = await import('/js/reports.js');
    reports.setReportType('closure');
    return deckFor({ type: 'closure', periodLabel: 'x', projects: [], summary: {} }, { project: getState() }).length > 0;
  }).catch((e) => `threw: ${e.message}`);
  eq('it exports as slides too', deck, true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  for (const navId of ['nav-report-closure', 'nav-documents', 'nav-vendors']) {
    await openDestination(page, navId);
    await page.waitForTimeout(300);
    eq(`${navId}: no page overflow at phone width`,
       await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
