// Customer success: the accounts, the CSM lifecycle, health, renewals, and the
// customer KPIs read off them.
//
// The things worth pinning are the ones that would quietly mislead: health
// that pretends to know from one signal, a lifetime value printed for a book
// that has never lost a customer, a churned account counted as retained, a
// stage change that forgets when it happened (which is the whole of time to
// value), and the CEO comparison claiming the app measures what it does not.

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

  console.log('\n--- the rules ---');
  const rules = await page.evaluate(async () => {
    const cs = await import('/js/customerSuccess.js');
    const today = new Date(2026, 8, 21);
    return {
      stages: cs.CS_STAGES.map((s) => `${s.n} ${s.id}`),
      churnedIsNotAStage: cs.CS_STAGES.some((s) => s.id === cs.CHURNED),
      oneSignal: cs.healthOf({ stage: 'Adopt', adoption: 90 }, today),
      twoSignals: cs.healthOf({ stage: 'Adopt', adoption: 90, nps: 10 }, today),
      churnedHealth: cs.healthOf({ stage: 'Churned', adoption: 90, nps: 10 }, today),
      renewalOnUnusedAccount: cs.healthOf({ stage: 'Renew', adoption: 30, nps: 8, renewal: '2026-10-20' }, today).band,
      empty: cs.customerMetrics([], { today }),
      noChurnNoLtv: cs.customerMetrics([
        { stage: 'Adopt', arr: 100, startArr: 100, start: '2024-01-01' },
      ], { grossMargin: 80, today }).ltv,
      nrr: cs.customerMetrics([
        { stage: 'Expand', arr: 150, startArr: 100 },
        { stage: 'Churned', arr: 0, startArr: 100 },
      ], { today }),
    };
  });
  eq('six stages, numbered in order', rules.stages, ['1 Onboard', '2 Adopt', '3 Realise value', '4 Renew', '5 Expand', '6 Advocate']);
  eq('churned is an exit, never numbered', rules.churnedIsNotAStage, false);
  eq('one signal is not enough to call health', rules.oneSignal, null);
  eq('two are', rules.twoSignals, { score: 95, band: 'Healthy', signals: 2 });
  eq('a churned account has an outcome, not a health', rules.churnedHealth, null);
  eq('a renewal arriving on an unused account drags it down', rules.renewalOnUnusedAccount, 'At risk');
  eq('no accounts, no numbers — not zeros', [rules.empty.customerRetention, rules.empty.nps, rules.empty.nrr, rules.empty.arrAtRisk], [null, null, null, null]);
  eq('no churn in a year: lifetime value is not invented', rules.noChurnNoLtv, null);
  eq('revenue retention counts the churned account against the book',
     [rules.nrr.nrr, rules.nrr.grr, rules.nrr.customerRetention], [0.75, 0.5, 0.5]);

  console.log('\n--- the page, on the Customer Success template ---');
  await page.evaluate(async () => {
    const s = await import('/js/state.js');
    s.createProject({ name: 'CS', templateKey: 'customer-success', methodology: 'project' });
  });
  await page.waitForTimeout(700);
  await openDestination(page, 'tab-customers');
  await page.waitForTimeout(400);
  eq('it is in the menu, under Run & Support', await page.textContent('#page-title'), 'Customer Success');
  eq('three tabs', await page.$$eval('#page-customers .page-tab', (e) => e.map((x) => x.firstChild.textContent.trim())), ['Accounts', 'Lifecycle', 'Renewals']);
  eq('eight accounts', await page.locator('#customers-body tr').count(), 8);
  eq('the tiles read the accounts', await page.$$eval('#page-customers .kpi .kpi__value', (e) => e.map((x) => x.textContent)),
    ['88%', '108%', '14', '$60,000']);
  eq('health is drawn, not typed', await page.locator('#customers-body input[data-field="_health"]').count(), 0);
  eq('the troubled renewal reads At risk',
     (await page.textContent('#customers-body tr:nth-child(3) .health')).includes('At risk'), true);
  eq('a brand-new account says it has too little to go on',
     await page.textContent('#customers-body tr:nth-child(6) .health'), 'Not enough signal');

  console.log('\n--- the economics need the one figure accounts cannot give ---');
  eq('with a gross margin, LTV:CAC is worked out',
     (await page.textContent('#cs-economics-read')).includes('12.3 : 1'), true);
  await page.fill('#cs-gross-margin', '');
  await page.waitForTimeout(200);
  eq('without one it is not measured, not zero',
     (await page.textContent('#cs-economics-read')).includes('Lifetime value (LTV)Not measured'), true);
  await page.fill('#cs-gross-margin', '78');

  console.log('\n--- moving an account records when, and the numbers follow ---');
  await page.selectOption('#customers-body tr:nth-child(5) select[data-field="stage"]', 'Realise value');
  await page.waitForTimeout(400);
  const tailspin = (await page.evaluate(async () => (await import('/js/state.js')).getState().customers[4]));
  eq('the move is in the stage history', tailspin.stageHistory.at(-1).stage, 'Realise value');
  eq('dated today', tailspin.stageHistory.at(-1).at, await page.evaluate(async () => (await import('/js/dates.js')).todayISO()));
  await page.selectOption('#customers-body tr:nth-child(3) select[data-field="stage"]', 'Churned');
  await page.waitForTimeout(400);
  eq('churning Harbour drops retention at once', await page.textContent('#cs-tile-retention .kpi__value'), '75%');
  eq('and its health cell says so, without a rebuild',
     await page.textContent('#customers-body tr:nth-child(3) .health'), 'Churned');

  console.log('\n--- the lifecycle board ---');
  await openSection(page, 'sec-cs-lifecycle');
  eq('a column per stage, in order', await page.$$eval('.cs-stage .cs-stage__name', (e) => e.map((x) => x.textContent)),
    ['Onboard', 'Adopt', 'Realise value', 'Renew', 'Expand', 'Advocate']);
  eq('each carries its gate', await page.locator('.cs-stage__gate').count(), 6);
  eq('the churned sit apart', (await page.textContent('.cs-exit h3')), 'Churned · 2');
  eq('and the moved account is in its new column',
     (await page.textContent('.cs-stage[data-stage="Realise value"]')).includes('Tailspin Travel'), true);

  console.log('\n--- renewals ---');
  await openSection(page, 'sec-cs-renewals');
  eq('soonest first, churned left out', (await page.$$eval('#cs-renewals-body tr td:first-child', (e) => e.map((x) => x.textContent))).includes('Harbour Logistics'), false);

  console.log('\n--- the KPI page reads the same accounts ---');
  await openDestination(page, 'nav-kpi-customer');
  await page.waitForTimeout(400);
  eq('retention agrees with the tile', await page.textContent('.kpi-card[data-kpi="customerRetention"] .kpi-card__number'), '75%');
  eq('time to value is measured from the stage history',
     (await page.textContent('.kpi-card[data-kpi="timeToValue"] .kpi-card__number')).endsWith(' d'), true);

  console.log('\n--- the CEO comparison does not claim what it cannot measure ---');
  await openDestination(page, 'nav-kpi-ceo');
  await page.waitForTimeout(300);
  const rows = await page.$$eval('#kpi-ceo-body tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent)));
  eq('all thirty-six are listed', rows.length, 36);
  const row = (name) => rows.find((r) => r[1] === name);
  eq('ROE is not held, and says why', [row('Return on Equity (ROE)')[2], row('Return on Equity (ROE)')[4]], ['Not held by this app', 'Needs a balance sheet.']);
  eq('NPS is measured here, with its value', [row('Net Promoter Score (NPS)')[2], row('Net Promoter Score (NPS)')[3] !== '—'], ['Measured here', true]);
  eq('talent retention is only a project-level equivalent', row('Talent Retention Rate')[2], 'Project-level equivalent');
  eq('every row that claims a measure points at a real indicator', await page.evaluate(async () => {
    const { CEO_KPIS } = await import('/js/ceoKpis.js');
    const { KPI_BY_ID } = await import('/js/kpi.js');
    return CEO_KPIS.filter((r) => r.fit !== 'none').every((r) => KPI_BY_ID.has(r.kpi))
      && CEO_KPIS.filter((r) => r.fit === 'none').every((r) => !r.kpi && r.why);
  }), true);

  console.log('\n--- the CSM role opens on it ---');
  await page.evaluate(async () => (await import('/js/roles.js')).setRole('customer-success-manager'));
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  eq('home is Customer Success', await page.evaluate(() => document.querySelector('.page.is-active').id), 'page-customers');
  eq('and every account is on My Work for its CSM', await page.evaluate(async () => {
    const { WORK_REGISTERS } = await import('/js/registerDefs.js');
    return WORK_REGISTERS.some((d) => d.key === 'customers');
  }), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  for (const navId of ['nav-accounts', 'nav-cs-lifecycle', 'nav-cs-renewals', 'nav-kpi-ceo']) {
    await openDestination(page, navId);
    await page.waitForTimeout(300);
    eq(`${navId}: no page overflow at phone width`,
       await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
