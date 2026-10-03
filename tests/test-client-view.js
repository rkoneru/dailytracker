// The client view: one client's use cases together.
//
// Each use case is still decided on its own; this pins what only shows up
// across them. Shared costs counted once. Benefits two use cases both claim
// counted once, at the larger claim. An order that puts what is needed first
// ahead of a higher score, excludes what was parked or declined, and says so
// when two use cases each need the other. And a budget check that takes the
// shared costs first, since nothing runs without them.

const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
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
    const m = await import('/js/useCaseModel.js');
    const sc = { value: 4, fit: 4, feasibility: 4, data: 4, risk: 4 };
    const mk = (id, extra) => ({ id, clientId: 'c', scores: sc, costs: [{ type: 'One-off', amount: 50000 }], ...extra });
    const a = mk('a', { benefits: [{ kind: 'Time saved', hoursPerWeek: 100, rate: 40, pool: 'AP hours' }] });
    const b = mk('b', { dependsOn: 'a', scores: { ...sc, value: 5, fit: 5 }, benefits: [{ kind: 'Time saved', hoursPerWeek: 60, rate: 40, pool: 'ap hours' }, { kind: 'Revenue', annual: 20000 }] });
    const parked = mk('p', { scores: { value: 1, fit: 1, feasibility: 1, data: 1, risk: 1 }, benefits: [{ kind: 'Revenue', annual: 99999 }] });
    const other = { ...mk('o', { benefits: [{ kind: 'Revenue', annual: 1 }] }), clientId: 'someone else' };
    const client = { id: 'c', budget: 120000, sharedCosts: [{ type: 'One-off', amount: 40000 }] };
    const p = m.clientPortfolio(client, [a, b, parked, other]);
    const spread = m.clientPortfolio({ ...client, allocation: 'benefit' }, [a, b]);
    const loop = m.clientPortfolio(client, [{ ...a, dependsOn: 'b' }, b]);
    return {
      members: p.rows.map((x) => x.uc.id),
      order: p.order,
      pool: p.pools.map((x) => [x.name, x.counted, x.removed]),
      combinedBenefitPerYear: Math.round(p.combined.expected.totalBenefit),
      combinedCost: p.combined.expected.totalCost,
      fundable: [...p.fundable],
      heldAtClient: p.rows.every((x) => x.allocatedShared === 0),
      spreadTotal: spread.rows.reduce((n, x) => n + x.allocatedShared, 0),
      loop: loop.loop,
    };
  });
  eq('only this client’s use cases', r.members, ['a', 'b', 'p']);
  eq('what is needed first goes first, the parked one not at all', r.order, ['a', 'b']);
  eq('a pool claimed twice counts once, at the larger claim', r.pool, [['AP hours', 208000, 124800]]);
  eq('shared costs are counted once in the combined cost', r.combinedCost, 140000);
  eq('and the parked one’s benefit is not in the total', r.combinedBenefitPerYear < 600000, true);
  eq('the budget takes shared costs first, then the order', r.fundable, ['a']);
  eq('held at client level by default', r.heldAtClient, true);
  eq('or spread in full by share of benefit', r.spreadTotal, 40000);
  eq('a loop is reported, not hidden', r.loop, true);

  console.log('\n--- the page ---');
  await page.evaluate(async () => {
    (await import('/js/roles.js')).setRole('client-partner');
    const s = await import('/js/useCaseStore.js');
    const pid = (await import('/js/state.js')).getActiveProjectId();
    const sc = { value: 4, fit: 4, feasibility: 4, data: 4, risk: 4 };
    s.createUseCase(pid, { name: 'AP automation', client: 'Contoso', scores: sc, costs: [{ label: 'Build', type: 'One-off', amount: 50000, source: 'SOW' }], benefits: [{ label: 'AP time', kind: 'Time saved', hoursPerWeek: 100, rate: 40, pool: 'AP hours', source: 'Study' }] });
    s.createUseCase(pid, { name: 'Invoice OCR', client: 'contoso ', scores: { ...sc, value: 5, fit: 5 }, costs: [{ label: 'Build', type: 'One-off', amount: 50000, source: 'SOW' }], benefits: [{ label: 'AP time', kind: 'Time saved', hoursPerWeek: 60, rate: 40, pool: 'AP hours', source: 'Study' }] });
  });
  await openDestination(page, 'nav-uc-client');
  await page.waitForTimeout(300);
  eq('it is its own tab, for client partners', await page.textContent('#page-usecases .page-tab.is-active'), 'Client View');
  eq('use cases naming a client are offered a record', (await page.textContent('#uc-client .uc-open')).includes('2 use cases name “Contoso”'), true);
  await page.click('[data-cl-adopt]');
  await page.waitForTimeout(300);
  eq('both are linked, whatever the case and spacing', await page.evaluate(async () => {
    const s = await import('/js/useCaseStore.js');
    const [client] = s.listClients();
    return s.listUseCases().every((u) => u.clientId === client.id);
  }), true);
  eq('and the client record is not listed as a use case', await page.locator('#uc-picker option').count(), 2);

  await page.fill('#uc-client [data-cl="budget"]', '60000');
  await page.click('[data-cl-add="sharedCosts"]');
  await page.waitForTimeout(200);
  await page.fill('[data-cl="sharedCosts.0.label"]', 'Data platform');
  await page.fill('[data-cl="sharedCosts.0.amount"]', '10000');
  eq('typing in the client record keeps the caret', await page.evaluate(() => document.activeElement.dataset.cl), 'sharedCosts.0.amount');
  const ids = await page.evaluate(async () => Object.fromEntries((await import('/js/useCaseStore.js')).listUseCases().map((u) => [u.name, u.id])));
  eq('by score, OCR would go first', (await page.$$eval('#uc-client-table tbody tr td:nth-child(2)', (e) => e.map((x) => x.textContent)))[0], 'Invoice OCR');
  await page.selectOption(`[data-cl-dep="${ids['Invoice OCR']}"]`, ids['AP automation']);
  await page.waitForTimeout(200);
  eq('but it needs AP automation first', await page.$$eval('#uc-client-table tbody tr td:nth-child(2)', (e) => e.map((x) => x.textContent)), ['AP automation', 'Invoice OCR']);
  eq('the needs-first choice is saved on the use case itself',
     await page.evaluate(async (id) => (await import('/js/useCaseStore.js')).getUseCase(id).dependsOn, ids['Invoice OCR']), ids['AP automation']);
  eq('the budget fits the first only', await page.$$eval('#uc-client-table tbody tr td:last-child', (e) => e.map((x) => x.textContent)), ['Fits', 'Over budget']);
  eq('the overlap is named and removed', (await page.textContent('#uc-client-notes')).includes('Overlap removed: $124,800 a year'), true);
  eq('shared costs are counted once', await page.$$eval('#uc-combined-table tbody tr:nth-child(2) td', (e) => e.map((x) => x.textContent)), ['$110,000', '$110,000', '$110,000']);

  await page.selectOption('#uc-client [data-cl="allocation"]', 'benefit');
  await page.waitForTimeout(200);
  eq('spreading them adds an after-shared ROI column',
     (await page.$$eval('#uc-client-table thead th', (e) => e.map((x) => x.textContent))).includes('ROI after shared'), true);

  console.log('\n--- nothing of it reaches project data ---');
  eq('the client record stays in the use case store', await page.evaluate(() => [
    localStorage.getItem('projectPlannerStore_v2').includes('Data platform'),
    localStorage.getItem('projectPlannerUseCases_v1').includes('Data platform'),
  ]), [false, true]);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
