// The PMP formulas, worked on the project.
//
// Pins the sheet's formulas against hand-worked numbers (EVM, PERT, the
// normal curve, channels, price adjustment, cost of quality, depreciation,
// EMV and the decision tree); that a result nothing on record answers is
// null, never 0; and that on the page the three-point estimate and a risk's
// probability and cost are kept on their rows, while typing keeps the field.

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
    const f = await import('/js/formulas.js');
    const round = (v, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
    const e = f.evm({ bac: 100, pv: 50, ev: 40, ac: 50 });
    const empty = f.evm({ bac: 100, pv: null, ev: 40, ac: null });
    const dep = f.depreciation(10000, 1000, 5);
    return {
      evm: [e.cv, e.sv, e.cpi, e.spi, e.eac.typical, e.eac.atPlan, round(e.eac.atCpi), round(e.eac.atCpiSpi), e.etc.fromEac, round(e.etc.atCpi), e.etc.atSpi, e.vac, round(e.tcpiBac), round(e.tcpiEac)],
      empty: [empty.cpi, empty.spi, empty.eac.typical, empty.tcpiBac],
      readings: [f.indexReading(1.12), f.indexReading(0.95), f.indexReading(1), f.indexReading(null)],
      pert: (() => { const p = f.pert(2, 4, 8); return [round(p.te), round(p.sd), round(p.variance)]; })(),
      badPert: f.pert(8, 4, 2),
      cdf: [round(f.normalCdf(0), 3), round(f.normalCdf(1), 3), round(f.normalCdf(-1), 3), round(f.normalCdf(1.96), 3)],
      projectPert: (() => { const p = f.projectPert({ dashTasks: [{ pert: { o: 2, m: 4, p: 8 } }, { pert: { o: 2, m: 4, p: 8 } }, { name: 'none' }] }, 9); return [p.rows.length, round(p.te), round(p.sd), round(p.probability, 2)]; })(),
      channels: [f.channelsFor(6), f.channels({ allocations: [{ name: 'Ana' }, { name: 'Ben' }], stakeholders: [{ name: 'ana' }, { name: 'Cy' }] }), f.channels({}).channels],
      pa: f.priceAdjustment(100, 110, 50000),
      coq: f.costOfQuality(1000, 500, 300, 200),
      dep: [dep.length, round(dep[0].sl.charge), round(dep[4].sl.book), round(dep[0].ddb.charge), round(dep[4].ddb.book), round(dep[0].syd.charge), round(dep[4].syd.book)],
      emv: (() => { const x = f.riskEmv({ raid: [{ type: 'Risk', status: 'Open', probability: '20', impactCost: '5000' }, { type: 'Risk', status: 'Open' }, { type: 'Risk', status: 'Closed', probability: 50, impactCost: 100 }] }); return [x.rows.length, x.total, x.priced]; })(),
      tree: [f.decisionEmv([{ p: 60, outcome: 1000 }, { p: 40, outcome: -500 }]), f.decisionEmv([{ p: 60, outcome: 1000 }])?.valid],
      contracts: f.contractsByType({ vendors: [{ name: 'A', contractType: 'Fixed price', value: 100 }, { name: 'B', contractType: 'Fixed price', value: 50 }, { name: 'C', value: 10 }] }),
    };
  });
  eq('CV, SV, CPI, SPI, the four EACs, three ETCs, VAC and both TCPIs', r.evm, [-10, -10, 0.8, 0.8, 125, 110, 125, 143.75, 75, 75, 75, -25, 1.2, 0.8]);
  eq('nothing spent and nothing dated: the indices are null, not zero', r.empty, [null, null, null, null]);
  eq('above 1 is ahead, below behind', r.readings, ['ahead', 'behind', 'on plan', null]);
  eq('PERT on the sheet’s example: TE 4.33, σ 1.00, σ² 1.00', r.pert, [4.33, 1, 1]);
  eq('O above P is refused', r.badPert, null);
  eq('the normal curve: 50%, 84.1%, 15.9%, 97.5%', r.cdf, [0.5, 0.841, 0.159, 0.975]);
  eq('two tasks: TE adds, σ is the root of the summed variances, chance of 9 hours', r.projectPert, [2, 8.67, 1.41, 0.59]);
  eq('six people have fifteen channels; names are counted once; nobody is null', [r.channels[0], r.channels[1], r.channels[2]], [15, { n: 3, channels: 3 }, null]);
  eq('price adjustment and total contract price', r.pa, { pa: 5000, tcp: 55000 });
  eq('cost of quality', r.coq, { total: 2000, conformance: 1500, nonConformance: 500, failureShare: 0.25 });
  eq('depreciation: SL 1,800 a year to 1,000; DDB 4,000 then to salvage; SYD 3,000 then to salvage', r.dep, [5, 1800, 1000, 4000, 1000, 3000, 1000]);
  eq('EMV: open risks only, the unpriced one left out of the total', r.emv, [2, 1000, 1]);
  eq('decision tree: Σ p × outcome, and probabilities must add to 100', [r.tree[0], r.tree[1]], [{ emv: 400, probabilityTotal: 100, valid: true }, false]);
  eq('contracts by type, with the unstated ones named', r.contracts.map((c) => [c.type, c.count, c.value]), [['Fixed price', 2, 150], ['Not stated', 1, 10]]);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-kpi-formulas');
  await page.waitForTimeout(400);
  eq('Formulas is a tab of the KPIs page', (await page.textContent('#page-kpis .page-tab.is-active')).startsWith('Formulas'), true);
  eq('nine formula groups', await page.$$eval('#fx-body .fx-card', (e) => e.map((x) => x.dataset.fxCard)), ['evm', 'cpm', 'pert', 'comms', 'procurement', 'quality', 'depreciation', 'risk', 'agile']);
  const row = '#fx-body [data-pert-task]:first-of-type';
  const taskId = await page.getAttribute(row, 'data-pert-task');
  await page.fill(`${row} [data-pert="o"]`, '2');
  await page.fill(`${row} [data-pert="m"]`, '4');
  await page.click(`${row} [data-pert="p"]`);
  await page.keyboard.type('8');
  await page.waitForTimeout(300);
  eq('typing O, M, P works out TE and keeps the field', [await page.textContent(`${row} [data-out="te"]`), await page.evaluate(() => document.activeElement?.dataset.pert)], ['4.3', 'p']);
  await page.click(`${row} [data-pert-use]`);
  await page.waitForTimeout(400);
  const task = await page.evaluate(async (id) => (await import('/js/state.js')).getState().dashTasks.find((t) => t.id === id), taskId);
  eq('Use TE writes the estimate, and the three points are kept on the task', [task.estimate, task.pert], [4.3, { o: '2', m: '4', p: '8' }]);
  await page.fill('#fx-body [data-calc="n"]', '6');
  await page.waitForTimeout(150);
  eq('the channels calculator', await page.textContent('#fx-body [data-fx="channels"] .fx-line__value'), '15');
  const risk = '#fx-body [data-emv-risk]:first-of-type';
  await page.fill(`${risk} [data-emv="probability"]`, '25');
  await page.fill(`${risk} [data-emv="impactCost"]`, '8000');
  await page.waitForTimeout(300);
  eq('a risk’s EMV, kept on the risk', [await page.textContent(`${risk} [data-out="emv"]`), await page.evaluate(async () => (await import('/js/state.js')).getState().raid.find((x) => x.probability === '25')?.impactCost)], ['2,000', '8000']);
  await page.fill('#fx-body [data-calc="cost"]', '10000');
  await page.fill('#fx-body [data-calc="salvage"]', '1000');
  await page.fill('#fx-body [data-calc="life"]', '5');
  await page.waitForTimeout(200);
  eq('the depreciation table, year by year', await page.$$eval('#fx-body [data-dep] tbody tr', (e) => e.length), 5);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
