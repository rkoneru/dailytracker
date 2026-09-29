// End to end: one use case from sale to success, and the loop back to sales.
//
// The journey stores nothing; it reads each step from where it is kept, so
// these checks drive the real records — a won deal, a signed Go, the project
// it became with its billing, incidents and account — and read the strip
// back. Then the loop: an account at Expand starts a new use case, once, and
// only for someone the Use Cases page is offered to.

const { APP_URL, launch, createChecks, openDestination, chooseLifecycle } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
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
    const j = await import('/js/journey.js');
    const states = (uc, project) => Object.fromEntries(j.journeyOf(uc, project, new Date(2026, 9, 5, 12)).map((s) => [s.id, s.state]));
    const bare = states({ name: 'x' }, null);
    const project = {
      dashTasks: [{ status: 'Complete' }, { status: 'In Progress' }], dashStatus: 'AT RISK',
      contractValue: 100, billing: [{ amount: 50, status: 'Invoiced', invoiced: '2026-08-01' }],
      incidents: [{ priority: 'P2', account: 'Acme', reported: '2026-10-05T08:00', status: 'New' }],
      customers: [{ name: 'acme ', stage: 'Adopt', adoption: 80, nps: 9 }],
    };
    const linked = states({ name: 'x', client: 'Acme', convertedProjectId: 'p' }, project);
    const missing = states({ name: 'x', convertedProjectId: 'gone' }, null);
    const quiet = states({ name: 'x', client: 'Nobody', convertedProjectId: 'p', supportFrom: '2026-09-01' }, { dashTasks: [] });
    return { bare, linked, missing, quiet };
  });
  eq('an idea with nothing recorded: grey sale, the rest not reached',
     r.bare, { sale: 'none', decision: 'todo', delivery: 'todo', billing: 'todo', support: 'todo', success: 'todo', value: 'todo' });
  eq('delivery follows the project’s RAG', r.linked.delivery, 'warn');
  eq('an overdue invoice is bad', r.linked.billing, 'bad');
  eq('an open P2 is a warning', r.linked.support, 'warn');
  eq('the account is matched by name, whatever the case and spacing', r.linked.success === 'none', false);
  eq('a project not on this device is grey, not bad', r.missing.delivery, 'none');
  eq('in support with no incidents is grey, not a clean record', r.quiet.support, 'none');
  eq('no billing plan is grey', r.quiet.billing, 'none');
  eq('no account for the client is grey', r.quiet.success, 'none');

  console.log('\n--- a real engagement ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-transition');
  await chooseLifecycle(page);
  await page.click('#btn-create-project');
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    (await import('/js/roles.js')).setRole('client-partner');
    const s = await import('/js/useCaseStore.js');
    const m = await import('/js/useCaseModel.js');
    const sig = await import('/js/signatureModel.js');
    const pid = (await import('/js/state.js')).getActiveProjectId();
    const client = s.createClient(pid, { name: 'Orders platform client' });
    const uc = s.createUseCase(pid, {
      name: 'Managed service', client: 'Orders platform client', clientId: client.id, methodology: 'project',
      scores: { value: 4, fit: 4, feasibility: 4, data: 4, risk: 4 },
      costs: [{ label: 'Run', type: 'Annual', amount: 180000, source: 'SOW' }],
      benefits: [{ label: 'Incumbent cost avoided', kind: 'Cost avoided', annual: 300000, source: 'Contract' }],
      deal: { stage: 'Won', value: 240000, deliveryCost: 180000, closedOn: '2026-08-01' },
      convertedProjectId: pid,
    });
    const content = m.decisionContent(uc);
    uc.decision = { outcome: 'Go', signatures: { sponsor: sig.createSignature({ name: 'Helen Ward', statement: 'x', content }), partner: sig.createSignature({ name: 'P', statement: 'x', content }) } };
    s.touchUseCase(uc);
  });
  await openDestination(page, 'nav-uc-client');
  await page.waitForTimeout(300);
  const chips = await page.$$eval('#uc-journey-table tbody tr:first-child .journey', (e) => e.map((x) => [x.dataset.step, x.className.replace('journey is-', ''), x.textContent]));
  const by = Object.fromEntries(chips.map(([id, state, text]) => [id, { state, text }]));
  eq('seven steps', chips.length, 7);
  eq('the sale is won', [by.sale.state, by.sale.text], ['done', 'Won · $240,000']);
  eq('the Go is signed', by.decision.state, 'done');
  eq('delivery is at risk, as the project says', by.delivery.state, 'warn');
  eq('billing shows the overdue knowledge-transfer invoice', [by.billing.state, by.billing.text], ['bad', '$48,000 overdue']);
  eq('support shows the open P2, past its target', [by.support.state, by.support.text], ['bad', '1 open past target']);
  eq('the account is found on Customer Success', by.success.text.startsWith('Onboard'), true);

  console.log('\n--- the loop back to sales ---');
  await openDestination(page, 'tab-customers');
  await page.waitForTimeout(300);
  eq('a client partner is offered an expansion', await page.locator('#page-customers [data-row-action="expand"]').count(), 1);
  await page.click('#page-customers [data-row-action="expand"]');
  await page.waitForTimeout(500);
  eq('it lands on the new use case’s pipeline', (await page.textContent('#page-usecases .page-tab.is-active')).startsWith('Pipeline'), true);
  const expansion = await page.evaluate(async () => {
    const list = (await import('/js/useCaseStore.js')).listUseCases().filter((u) => u.expansionOf);
    return list.map((u) => [u.name, u.deal.stage, !!u.clientId]);
  });
  eq('a lead, linked to the client record', expansion, [['Expansion — Orders platform client', 'Lead', true]]);
  eq('picked in the page', await page.$eval('#uc-picker', (s) => s.selectedOptions[0].textContent.startsWith('Expansion')), true);
  await openDestination(page, 'tab-customers');
  await page.click('#page-customers [data-row-action="expand"]');
  await page.waitForTimeout(500);
  eq('asking again opens it, rather than starting another',
     await page.evaluate(async () => (await import('/js/useCaseStore.js')).listUseCases().filter((u) => u.expansionOf).length), 1);
  eq('and nothing of it reaches the project store',
     await page.evaluate(() => localStorage.getItem('projectPlannerStore_v2').includes('Expansion —')), false);
  await openDestination(page, 'nav-uc-client');
  eq('the client view tags it as an expansion', (await page.textContent('#uc-journey-table')).includes('Expansion'), true);

  await page.evaluate(async () => (await import('/js/roles.js')).setRole('customer-success-manager'));
  await openDestination(page, 'tab-customers');
  await page.waitForTimeout(300);
  eq('a CSM without the Use Cases page is not offered it', await page.locator('#page-customers [data-row-action="expand"]').count(), 0);

  console.log('\n--- layout ---');
  await page.evaluate(async () => (await import('/js/roles.js')).setRole('client-partner'));
  await openDestination(page, 'nav-uc-client');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
