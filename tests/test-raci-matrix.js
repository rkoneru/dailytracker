// The RACI matrix: the "Who Does What" rows as a grid.
//
// Pins that the grid's columns are every party named, cells read off the
// row's four fields, and setting one moves only that party on that row; the
// three rules of thumb; the standard matrix as a starting point; and that on
// the page a press cycles a cell and a typed letter sets it, both changing
// the register row beneath.

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
    const m = await import('/js/raciMatrix.js');
    const row = { activity: 'Build', responsible: 'Dev, QA', accountable: 'Lead', consulted: 'PM', informed: '' };
    const project = { raci: [row, { activity: 'Test', responsible: '', accountable: 'PM, Lead', consulted: 'a, b, c, d, e', informed: 'Dev' }], raciParties: ['Sponsor', 'pm'] };
    const tpl = m.templateRows();
    return {
      parties: m.parties(project),
      cells: ['Dev', 'QA', 'Lead', 'pm', 'Sponsor'].map((p) => m.cellOf(row, p)),
      setA: m.setCell(row, 'Dev', 'A'),
      clear: m.setCell(row, 'QA', ''),
      cycle: ['', 'R', 'A', 'C', 'I'].map(m.nextLetter),
      rules: project.raci.map((x) => m.rowRules(x)).map((x) => [x.oneA, x.someR, x.leanC]),
      wide: [m.rowRules({ consulted: 'a, b, c, d, e' }, 10).leanC, m.rowRules({ consulted: 'a, b, c, d, e, f' }, 10).leanC],
      summary: (({ rows, oneA, someR, leanC }) => ({ rows, oneA, someR, leanC }))(m.matrixSummary(project)),
      tpl: [tpl.length, tpl[0].accountable, tpl[0].responsible, tpl[13].accountable, tpl[23].accountable, tpl.filter((x) => m.rowRules(x).oneA && m.rowRules(x).someR).length],
      phases: m.byPhase({ raci: tpl }).map((g) => [g.phase, g.rows.length]),
    };
  });
  eq('the columns: the kept order first, then every name as first seen, once', r.parties, ['Sponsor', 'pm', 'Dev', 'QA', 'Lead', 'a', 'b', 'c', 'd', 'e']);
  eq('a cell is the field that names the party, case aside', r.cells, ['R', 'R', 'A', 'C', '']);
  eq('setting a cell moves only that party', r.setA, { responsible: 'QA', accountable: 'Lead, Dev', consulted: 'PM', informed: '' });
  eq('clearing takes them off the row', r.clear, { responsible: 'Dev', accountable: 'Lead', consulted: 'PM', informed: '' });
  eq('a press goes blank, R, A, C, I, blank', r.cycle, ['R', 'A', 'C', 'I', '']);
  eq('the rules: one A, an R, lean C’s — the second row breaks all three', r.rules, [[true, true, true], [false, false, false]]);
  eq('C’s are lean up to half the columns', r.wide, [true, false]);
  // Ten columns on that matrix, so five C's is half of them: still lean.
  eq('the summary counts rows meeting each rule, against the matrix’s width', r.summary, { rows: 2, oneA: 1, someR: 1, leanC: 2 });
  eq('the standard matrix: 27 activities, the chart’s letters, every row with one A and an R',
     r.tpl, [27, 'Executive Sponsor', 'Project Manager', 'Technical Lead', 'Customer Rep', 27]);
  eq('in five phases', r.phases, [['Initiation', 5], ['Planning', 7], ['Execution', 6], ['Monitoring & Control', 5], ['Closure', 4]]);

  console.log('\n--- on the page ---');
  await page.evaluate(async () => { const st = await import('/js/state.js'); st.getState().raci = []; st.getState().raciParties = []; st.scheduleSave(); });
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await openDestination(page, 'nav-raci-matrix');
  await page.waitForTimeout(300);
  eq('the matrix sits on the Who Does What tab, above its list', [(await page.textContent('#page-people .page-tab.is-active')).startsWith('Who Does What'), await page.isVisible('#sec-raci')], [true, true]);
  await page.click('[data-raci-act="template"]');
  await page.waitForSelector('.dialog');
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(400);
  eq('the columns in the chart’s order', (await page.$$eval('#raci-matrix .raci-grid__party span', (e) => e.map((x) => x.textContent))).slice(0, 3), ['Executive Sponsor', 'Project Manager', 'Steering Committee']);
  eq('the standard matrix: five phases, 27 rows, ten columns', [
    await page.$$eval('#raci-matrix .raci-grid__phase', (e) => e.length),
    await page.$$eval('#raci-matrix tbody tr[data-row]', (e) => e.length),
    await page.$$eval('#raci-matrix .raci-grid__party', (e) => e.length),
  ], [5, 27, 10]);
  eq('every row meets the two hard rules', (await page.textContent('#raci-matrix-count')).startsWith('27 of 27 with exactly one A · 27 with an R'), true);

  const cell = (party) => `#raci-matrix tbody:nth-of-type(1) tr:nth-child(2) [data-raci-party="${party}"]`;
  eq('row 1 reads as the chart: sponsor A, PM R', [await page.textContent(cell('Executive Sponsor')), await page.textContent(cell('Project Manager'))], ['A', 'R']);
  await page.click(cell('Developer'));
  await page.waitForTimeout(200);
  eq('pressing an I moves it on to blank', await page.textContent(cell('Developer')), '');
  await page.focus(cell('Developer'));
  await page.keyboard.press('a');
  await page.waitForTimeout(300);
  const row = await page.evaluate(async () => (await import('/js/state.js')).getState().raci.find((x) => x.activity === 'Submit project request'));
  eq('typing A sets it, keeps focus, and the row now has two A’s', [await page.textContent(cell('Developer')), await page.evaluate(() => document.activeElement?.dataset.raciParty), row.accountable], ['A', 'Developer', 'Executive Sponsor, Developer']);
  eq('and the rules column says so', (await page.textContent('#raci-matrix tbody:nth-of-type(1) tr:nth-child(2) .raci-grid__rules')).includes("2 A's"), true);
  eq('the list below is the same row', await page.evaluate(() => {
    const tr = [...document.querySelectorAll('#sec-raci tbody tr')].find((x) => x.querySelector('[data-field="activity"]')?.value === 'Submit project request');
    return tr?.querySelector('[data-field="accountable"]')?.value;
  }), 'Executive Sponsor, Developer');

  await page.fill('[data-raci-new-party]', 'Legal');
  await page.click('[data-raci-act="add-party"]');
  await page.waitForTimeout(300);
  eq('a new column', await page.$$eval('#raci-matrix .raci-grid__party span', (e) => e.map((x) => x.textContent).includes('Legal')), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width — the grid scrolls inside its card', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
