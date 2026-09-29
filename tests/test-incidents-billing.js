// Support and commercials: the incident log and the billing plan.
//
// Both follow the rule the KPIs do: the state is worked out from the dates,
// never typed. An incident's SLA is arithmetic on when it was reported,
// answered and resolved against its priority's targets; an invoice is overdue
// because its terms ran out, not because somebody picked "Overdue". And both
// stay grey when there is nothing to measure — no incidents is not a 100% SLA,
// no payments is not a zero-day collection time.

const { APP_URL, launch, createChecks, openDestination, chooseLifecycle } = require('./harness');

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

  console.log('\n--- the SLA clocks ---');
  const sla = await page.evaluate(async () => {
    const m = await import('/js/serviceDesk.js');
    const t = m.targetsOf({ incidentTargets: { P1: { respond: 2 } } });
    const now = new Date(2026, 9, 1, 12, 0);
    const mk = (extra) => ({ priority: 'P1', reported: '2026-10-01T08:00', status: 'In Progress', ...extra });
    const s = (x) => { const r = m.incidentSla(mk(x), t, now); return [r.response.state, r.resolution.state]; };
    return {
      override: [t.P1.respond, t.P1.resolve],
      met: s({ responded: '2026-10-01T09:30', resolved: '2026-10-01T11:00', status: 'Resolved' }),
      breachedOpen: s({ reported: '2026-10-01T07:00', responded: '2026-10-01T09:00' }),
      atRisk: s({ reported: '2026-10-01T08:50', responded: '2026-10-01T09:00' }),
      backwards: m.incidentSla(mk({ responded: '2026-10-01T07:00' }), t, now).response.invalid === true,
      future: s({ reported: '2026-10-02T08:00' }),
      closedNoTime: s({ responded: '2026-10-01T09:00', status: 'Closed' }),
      none: m.serviceMetrics({ incidents: [] }, now),
      severe: [...m.severeOpenByAccount({ incidents: [
        { priority: 'P1', account: 'Acme ', status: 'New' },
        { priority: 'P2', account: 'acme', status: 'In Progress' },
        { priority: 'P3', account: 'Acme', status: 'New' },
        { priority: 'P1', account: 'Acme', status: 'Resolved' },
      ] })],
    };
  });
  eq('a project can override one target and keep the rest', sla.override, [2, 4]);
  eq('answered and fixed in time is met on both clocks', sla.met, ['met', 'met']);
  eq('an open incident past its target is breached now, not later', sla.breachedOpen, ['met', 'breached']);
  eq('past three quarters of the target is at risk', sla.atRisk, ['met', 'at-risk']);
  eq('a response before the report is a typing mistake, not a fast answer', sla.backwards, true);
  eq('a report in the future is not measured', sla.future, ['unknown', 'unknown']);
  eq('closed with no resolved time cannot be judged', sla.closedNoTime[1], 'unknown');
  eq('no incidents is no evidence, not a perfect SLA', [sla.none.responseSla, sla.none.resolutionSla, sla.none.mttr], [null, null, null]);
  eq('open P1/P2 are counted per account, whatever the case', sla.severe, [['acme', 2]]);

  console.log('\n--- the collection state ---');
  const bill = await page.evaluate(async () => {
    const b = await import('/js/billing.js');
    const today = new Date(2026, 9, 5);
    const st = (row, terms = 30) => { const c = b.collectionState(row, terms, today); return [c.state, c.days]; };
    const project = {
      contractValue: 100000,
      billing: [
        { amount: 25000, status: 'Paid', invoiced: '2026-08-01', paid: '2026-08-21' },
        { amount: 25000, status: 'Invoiced', invoiced: '2026-08-26' },
        { amount: 20000, status: 'Planned', due: '2026-12-01' },
        { amount: 5000, status: 'Written off', invoiced: '2026-07-01' },
      ],
    };
    return {
      paid: st({ status: 'Paid', invoiced: '2026-09-01', paid: '2026-09-11' }),
      overdue: st({ status: 'Invoiced', invoiced: '2026-08-26' }),
      awaiting: st({ status: 'Invoiced', invoiced: '2026-09-20' }),
      ownTerms: st({ status: 'Invoiced', invoiced: '2026-09-20' }, 10),
      disputed: st({ status: 'Disputed', invoiced: '2026-09-20' })[0],
      noDate: st({ status: 'Invoiced' })[0],
      lateToBill: st({ status: 'Planned', due: '2026-09-30' }),
      terms: [b.termsOf({}), b.termsOf({ paymentTermsDays: '14' }), b.termsOf({ paymentTermsDays: 0 })],
      m: b.billingMetrics(project, today),
      empty: b.billingMetrics({ billing: [] }, today),
    };
  });
  eq('paid: days from invoice to payment', bill.paid, ['paid', 10]);
  eq('invoiced and past thirty days: overdue by the difference', bill.overdue, ['overdue', 10]);
  eq('invoiced and inside the terms: awaiting', bill.awaiting[0], 'awaiting');
  eq('the project’s own terms decide it', bill.ownTerms, ['overdue', 5]);
  eq('a dispute is shown as one', bill.disputed, 'disputed');
  eq('invoiced with no date cannot have a due date', bill.noDate, 'no-date');
  eq('billable and not yet invoiced is late to bill', bill.lateToBill, ['late-to-bill', 5]);
  eq('terms default to thirty days, and zero means on receipt', bill.terms, [30, 14, 0]);
  eq('billed counts paid and invoiced, not planned or written off', bill.m.billed, 50000);
  eq('outstanding is billed less paid', bill.m.outstanding, 25000);
  eq('the overdue amount is named', [bill.m.overdueAmount, bill.m.overdueCount], [25000, 1]);
  eq('a written-off line is not in the plan', bill.m.scheduled, 70000);
  eq('what the plan does not yet cover', bill.m.unscheduled, 30000);
  eq('days to collect, from paid invoices only', bill.m.dso, 20);
  eq('nothing paid: no collection time, and no contract: no percentage',
     [bill.empty.dso, bill.empty.billedPct, bill.empty.unscheduled], [null, null, null]);

  console.log('\n--- on screen, from the transition template ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-transition');
  await chooseLifecycle(page);
  await page.click('#btn-create-project');
  await page.waitForTimeout(1200);

  await openDestination(page, 'nav-incidents');
  eq('Incidents is a tab on Service & Support', (await page.textContent('#page-service .page-tab.is-active')).startsWith('Incidents'), true);
  const cells = await page.$$eval('#sec-incidents tbody tr', (rows) => rows.map((r) => r.querySelector('.sla-cell')?.textContent || ''));
  eq('the resolved P1 met both clocks', /Response met.*Resolve met/.test(cells[0]), true);
  eq('the open P2 is judged against now', /Resolve (breached|at risk|running)/i.test(cells[1]), true);
  eq('the tile counts incidents', (await page.textContent('#svc-count-incidents')).length > 0, true);

  // Tightening the P1 resolve target to one hour breaches the P1 that took 2.6.
  await page.fill('#incident-targets [data-target="P1.resolve"]', '1');
  await page.dispatchEvent('#incident-targets [data-target="P1.resolve"]', 'input');
  await page.waitForTimeout(300);
  eq('changing a target re-judges the incidents at once',
     (await page.$$eval('#sec-incidents tbody tr .sla-cell', (e) => e[0].textContent)).includes('Resolve breached'), true);
  eq('and is saved on the project', await page.evaluate(async () => (await import('/js/state.js')).getState().incidentTargets.P1.resolve), 1);

  await openDestination(page, 'nav-billing');
  eq('Billing is a tab on Scope & Contract', (await page.textContent('#page-scope .page-tab.is-active')).startsWith('Billing'), true);
  eq('the contract value is shown', await page.inputValue('[data-billing-field="contractValue"]'), '240000');
  const states = await page.$$eval('#sec-billing tbody tr .collection', (e) => e.map((x) => x.className.replace('collection is-', '')));
  eq('each milestone’s state is worked out from its dates', states.slice(0, 2), ['paid', 'overdue']);
  eq('the tile says what is overdue', (await page.textContent('#scope-count-billing')).includes('overdue'), true);
  const summary = await page.textContent('#billing-summary');
  eq('the summary says the plan adds up', summary.includes('None — the plan adds up'), true);
  eq('and gives the collection time', summary.includes('29 days on average'), true);

  await page.fill('[data-billing-field="contractValue"]', '250000');
  await page.waitForTimeout(300);
  eq('raising the contract shows what is not yet scheduled', (await page.textContent('#billing-summary')).includes('$10,000'), true);

  // Paying the overdue invoice clears it from the tile.
  await page.selectOption('#sec-billing tbody tr:nth-child(2) [data-field="status"]', 'Paid');
  await page.waitForTimeout(300);
  eq('paid with no paid date: collected, but not timed',
     await page.$eval('#sec-billing tbody tr:nth-child(2) .collection', (e) => e.textContent), 'Paid');
  eq('and nothing is overdue any more', (await page.textContent('#scope-count-billing')).includes('overdue'), false);

  console.log('\n--- where else it shows ---');
  const kpis = await page.evaluate(async () => {
    const k = await import('/js/kpi.js');
    const v = k.projectKpis((await import('/js/state.js')).getState());
    return { days: v.collectionDays, resp: v.responseSla, ar: (await import('/js/ceoKpis.js')).CEO_KPIS.find((c) => c.name.startsWith('Accounts Receivable')).kpi };
  });
  eq('Days to Collect is a cost KPI', kpis.days, 29);
  eq('response SLA is measured from the incidents', kpis.resp, 1);
  eq('the CEO set’s receivables turnover maps to it', kpis.ar, 'collectionDays');

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
