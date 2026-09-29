// Sales: the deal behind a use case, and the pipeline across all of them.
//
// Pins the rules that keep a forecast honest. Won is not a choice — it waits
// for the client's signed Go, and a Go that lapses sends the deal back to
// being forecast. Probability follows the stage unless overridden. Win rate
// and margin are null until something has closed. A signed no-go loses the
// deal. And the one number that leaves for a project is the deal value, as
// its contract value: never the margin.

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
    const d = await import('/js/deals.js');
    const m = await import('/js/useCaseModel.js');
    const s = await import('/js/signatureModel.js');
    const base = {
      name: 'Invoice OCR', client: 'Contoso',
      scores: { value: 4, fit: 4, feasibility: 4, data: 4, risk: 4 },
      costs: [{ label: 'Build', type: 'One-off', amount: 50000 }],
      benefits: [{ label: 'Time', kind: 'Time saved', hoursPerWeek: 40, rate: 40 }],
    };
    const signed = (uc, outcome) => {
      const content = m.decisionContent(uc);
      const sig = (name) => s.createSignature({ name, statement: 'x', content });
      return { ...uc, decision: { outcome, signatures: { sponsor: sig('A'), partner: sig('B') } } };
    };
    const today = new Date(2026, 9, 5);
    const withDeal = (uc, deal) => ({ ...uc, deal });
    const goUc = signed(base, 'Go');
    const lapsed = { ...goUc, costs: [{ label: 'Build', type: 'One-off', amount: 90000 }] };
    const pick = (x) => x && [x.stage, x.probability, x.won, x.unsupported];
    const uc = (id, deal, extra = {}) => ({ id, createdAt: new Date(2026, 6, 1).getTime(), ...withDeal(base, deal), ...extra });
    const p = d.pipeline([
      uc('a', { stage: 'Proposal', value: 100000, expectedClose: '2026-11-15' }),
      uc('b', { stage: 'Negotiation', value: 200000, probability: 90, expectedClose: '2027-01-10' }),
      uc('c', { stage: 'Lead', value: 50000, expectedClose: '2026-09-01' }),
      uc('d', { stage: 'Lost', value: 80000, lostReason: 'Price' }),
      { ...signed(uc('e', { stage: 'Won', value: 120000, deliveryCost: 84000, closedOn: '2026-08-30' }), 'Go') },
      { id: 'client', type: 'client', deal: { stage: 'Won', value: 1 } },
    ], today);
    return {
      none: d.dealOf(base),
      lead: pick(d.dealOf(withDeal(base, { value: 1000 }))),
      override: d.dealOf(withDeal(base, { stage: 'Proposal', value: 1000, probability: 80 })).weighted,
      wonNoGo: pick(d.dealOf(withDeal(base, { stage: 'Won', value: 1000 }))),
      wonGo: pick(d.dealOf(withDeal(goUc, { stage: 'Won', value: 1000 }))),
      wonLapsed: pick(d.dealOf(withDeal(lapsed, { stage: 'Won', value: 1000 }))),
      noGo: (() => { const x = d.dealOf(withDeal(signed(base, 'No-go'), { stage: 'Proposal', value: 1000 })); return [x.stage, x.lostReason]; })(),
      margin: (() => { const x = d.dealOf(withDeal(base, { value: 100000, deliveryCost: 70000 })); return [x.margin, x.marginPct]; })(),
      slipped: d.dealOf(withDeal(base, { stage: 'Lead', value: 1, expectedClose: '2026-09-01' }), today).slipped,
      empty: d.pipeline([], today),
      p: {
        open: p.open, openValue: p.openValue, weighted: p.weighted,
        quarters: p.byQuarter.map((q) => [q.quarter, q.count, q.weighted]),
        winRate: p.winRate, wonMargin: p.wonMargin, slipped: p.slipped, cycle: p.cycleDays, rows: p.rows.length,
      },
    };
  });
  eq('no stage and no value is not a deal', r.none, null);
  eq('a value alone starts as a Lead at 10%', r.lead, ['Lead', 0.1, false, false]);
  eq('an override replaces the stage probability', r.override, 800);
  eq('Won without a signed Go is unsupported, forecast as Negotiation', r.wonNoGo, ['Won', 0.75, false, true]);
  eq('Won with both signatures is won', r.wonGo, ['Won', 1, true, false]);
  eq('a Go that lapsed un-wins the deal', r.wonLapsed, ['Won', 0.75, false, true]);
  eq('a signed no-go loses the deal, and says why', r.noGo, ['Lost', 'The client signed a no-go']);
  eq('margin is value less delivery cost', r.margin, [30000, 0.3]);
  eq('an open deal past its close date has slipped', r.slipped, true);
  eq('nothing closed: no win rate, no margin', [r.empty.winRate, r.empty.wonMargin, r.empty.averageWon], [null, null, null]);
  eq('client records are not deals', r.p.rows, 5);
  eq('open deals and their total', [r.p.open, r.p.openValue], [3, 350000]);
  eq('weighted by stage or override', r.p.weighted, 50000 + 180000 + 5000);
  eq('by quarter, in order', r.p.quarters, [['2026 Q3', 1, 5000], ['2026 Q4', 1, 50000], ['2027 Q1', 1, 180000]]);
  eq('win rate over what closed', r.p.winRate, 0.5);
  eq('margin on won deals', r.p.wonMargin, 0.3);
  eq('slipped counted', r.p.slipped, 1);
  eq('sales cycle from intake to won', r.p.cycle, 60);

  console.log('\n--- on the page ---');
  await page.evaluate(async () => {
    (await import('/js/roles.js')).setRole('client-partner');
    const s = await import('/js/useCaseStore.js');
    const pid = (await import('/js/state.js')).getActiveProjectId();
    s.createUseCase(pid, { name: 'Invoice OCR', client: 'Contoso', methodology: 'project', scores: { value: 4, fit: 4, feasibility: 4, data: 4, risk: 4 },
      costs: [{ label: 'Build', type: 'One-off', amount: 50000, source: 'SOW' }], benefits: [{ label: 'Time', kind: 'Time saved', hoursPerWeek: 40, rate: 40, source: 'Study' }] });
  });
  await openDestination(page, 'nav-uc-pipeline');
  eq('Pipeline is the first tab', await page.$eval('#page-usecases .page-tab', (e) => e.firstChild.textContent.trim()), 'Pipeline');
  eq('it opens there', (await page.textContent('#page-usecases .page-tab.is-active')).startsWith('Pipeline'), true);
  eq('a use case with no deal says so', (await page.textContent('#uc-deal-read')).includes('Not in the pipeline'), true);
  eq('Won cannot be chosen without a signed Go', await page.$eval('#uc-deal-stage option[value="Won"]', (o) => o.disabled), true);

  await page.selectOption('#uc-deal-stage', 'Proposal');
  await page.fill('#uc-deal [data-uc="deal.value"]', '150000');
  await page.fill('#uc-deal [data-uc="deal.deliveryCost"]', '105000');
  eq('typing keeps its caret', await page.evaluate(() => document.activeElement.dataset.uc), 'deal.deliveryCost');
  const read = await page.textContent('#uc-deal-summary');
  eq('margin shown', read.includes('$45,000 (30%)'), true);
  eq('weighted at the stage probability', read.includes('$75,000'), true);
  eq('the pipeline lists it', await page.$$eval('#uc-deals-table tbody tr', (e) => e.length), 1);
  eq('nothing closed yet', (await page.textContent('#uc-pipeline-summary')).includes('Nothing closed yet'), true);

  await page.selectOption('#uc-deal-stage', 'Lost');
  await page.waitForTimeout(200);
  eq('losing it records the day', await page.evaluate(async () => !!(await import('/js/useCaseStore.js')).listUseCases()[0].deal.closedOn), true);
  eq('and asks why', await page.locator('#uc-deal [data-uc="deal.lostReason"]').count(), 1);
  eq('the win rate is now measured', (await page.textContent('#uc-pipeline-summary')).includes('0% of 1 closed'), true);
  await page.selectOption('#uc-deal-stage', 'Negotiation');
  await page.waitForTimeout(200);
  eq('reopening clears the close day', await page.evaluate(async () => (await import('/js/useCaseStore.js')).listUseCases()[0].deal.closedOn), '');

  console.log('\n--- the deal value becomes the contract value, and nothing else does ---');
  const project = await page.evaluate(async () => {
    const s = await import('/js/useCaseStore.js');
    const m = await import('/js/useCaseModel.js');
    const sig = await import('/js/signatureModel.js');
    const uc = s.listUseCases()[0];
    const content = m.decisionContent(uc);
    uc.decision = { outcome: 'Go', signatures: { sponsor: sig.createSignature({ name: 'A', statement: 'x', content }), partner: sig.createSignature({ name: 'B', statement: 'x', content }) } };
    s.touchUseCase(uc);
    return true;
  });
  eq('signed', project, true);
  await openDestination(page, 'nav-uc-decision');
  await page.click('#btn-uc-convert');
  await page.waitForSelector('.dialog');
  eq('the preview names the contract value', (await page.textContent('.dialog')).includes('deal value ($150,000) as the contract value'), true);
  eq('and says the margin stays', (await page.textContent('.dialog')).includes('delivery cost and margin'), true);
  await page.click('.dialog button.btn-primary');
  await page.waitForTimeout(600);
  const leaked = await page.evaluate(async () => {
    const st = (await import('/js/state.js')).getState();
    const raw = localStorage.getItem('projectPlannerStore_v2');
    return { contract: st.contractValue, cost: raw.includes('105000'), deal: raw.includes('deliveryCost') };
  });
  eq('the project holds the contract value', leaked.contract, 150000);
  eq('and not the delivery cost', [leaked.cost, leaked.deal], [false, false]);

  console.log('\n--- layout ---');
  await openDestination(page, 'nav-uc-pipeline');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
