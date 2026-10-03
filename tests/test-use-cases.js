// Use cases & ROI: the evaluator, the ROI model, the signed go/no-go, the
// conversion into a project, value realisation, and the sync lane that keeps
// all of it with client partners.
//
// What Postgres enforces is attacked in tests/rls/attack.sql. This suite pins
// what the client promises on top: that nothing commercial ever reaches the
// project store (which every member can read), that the page is offered only
// to the client partner job role, that a demo says it enforces nothing, that
// a decision signed against numbers that later moved counts for nothing, and
// that a device which loses access loses its copy on the next sync rather
// than uploading it again.

const { APP_URL, API_URL, launch, createChecks, openSection, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const { eq, done } = createChecks();
  const errors = [];

  const fresh = async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    return { context, page };
  };
  const sign = async (page, name) => {
    await page.waitForSelector('#sig-name');
    await page.fill('#sig-name', name);
    await page.check('#sig-agree');
    await page.click('.sig-dialog button[type="submit"]');
    await page.waitForTimeout(400);
  };

  console.log('\n--- the model ---');
  {
    const { context, page } = await fresh();
    const r = await page.evaluate(async () => {
      const m = await import('/js/useCaseModel.js');
      const uc = {
        name: 'Invoice automation',
        scores: { value: 5, fit: 4, feasibility: 4, data: 3, risk: 4 },
        costs: [{ label: 'Build', type: 'One-off', amount: 120000, source: 'SOW' }, { label: 'Licences', type: 'Annual', amount: 24000, source: 'Price list' }],
        benefits: [{ label: 'AP time', kind: 'Time saved', hoursPerWeek: 120, rate: 45, source: 'Time study' }, { label: 'Late fees', kind: 'Cost avoided', annual: 30000, assumption: true }],
      };
      const model = m.roiModel(uc);
      return {
        evaluation: m.evaluate(uc),
        partial: m.evaluate({ scores: { value: 5, fit: 4 } }),
        expected: [model.expected.totalBenefit, model.expected.totalCost, Math.round(model.expected.roi * 100), model.expected.npv, model.expected.payback],
        scenariosScaleBenefitsOnly: model.low.totalCost === model.high.totalCost && model.low.totalBenefit < model.high.totalBenefit,
        nothing: m.roiModel({}),
        noCost: m.scenario({ benefits: [{ kind: 'Revenue', annual: 1000 }] }).roi,
        open: m.openAssumptions(uc).map((o) => o.label),
        rampedNotInstant: model.expected.flows[0].benefit < model.expected.flows[11].benefit,
      };
    });
    eq('weighted score out of 100', r.evaluation, { score: 79, band: 'Pursue' });
    eq('half-scored is not scored', r.partial, null);
    eq('benefit, cost, ROI %, NPV, payback month', r.expected, [694120, 192000, 262, 413908, 10]);
    eq('low and high move the benefit, never the cost', r.scenariosScaleBenefitsOnly, true);
    eq('nothing entered, nothing modelled', r.nothing, null);
    eq('no cost, no ROI percentage', r.noCost, null);
    eq('assumptions are listed, not hidden', r.open, ['Late fees']);
    eq('benefits ramp up rather than arrive on day one', r.rampedNotInstant, true);

    const merge = await page.evaluate(async () => {
      const m = await import('/js/useCaseModel.js');
      const a = { id: 'a', projectId: 'p', name: 'A', rev: 5 };
      const base = { a: m.contentHash(a) };
      const revoked = m.mergeUseCases({ local: { a }, remote: [], base });
      const neverShared = m.mergeUseCases({ local: { b: { id: 'b', projectId: 'p', rev: 1 } }, remote: [], base: {}, canPush: () => false });
      const newer = m.mergeUseCases({
        local: { a: { ...a, name: 'A2', rev: 9 } },
        remote: [{ id: 'a', project_id: 'p', data: { name: 'A-remote' }, rev: 7 }],
        base,
      });
      return {
        revoked: Object.keys(revoked.merged).length + revoked.push.length,
        neverShared: [Object.keys(neverShared.merged), neverShared.push.length],
        newer: [newer.merged.a.name, newer.push.length],
      };
    });
    eq('a row the server stopped returning is dropped, not re-uploaded', merge.revoked, 0);
    eq('a row that was never shared stays local and is not pushed', merge.neverShared, [['b'], 0]);
    eq('the later edit wins and is pushed', merge.newer, ['A2', 1]);
    await context.close();
  }

  console.log('\n--- offered to the client partner role only ---');
  const { context, page } = await fresh();
  eq('the engagement lead’s "everything" does not include it', await page.locator('#tab-usecases').count(), 0);
  await page.evaluate(async () => (await import('/js/roles.js')).setRole('client-partner'));
  await page.waitForTimeout(300);
  eq('the client partner is offered it', await page.isVisible('#tab-usecases'), true);
  await page.evaluate(async () => (await import('/js/roles.js')).setShowEverything(true));
  await page.evaluate(async () => (await import('/js/roles.js')).setRole('project-manager'));
  await page.waitForTimeout(300);
  eq('"show everything" does not bring it back for anyone else', await page.locator('#tab-usecases').count(), 0);
  await page.evaluate(async () => {
    const r = await import('/js/roles.js');
    r.setShowEverything(false);
    r.setRole('client-partner');
  });
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  eq('and it is where the role opens', await page.evaluate(() => document.querySelector('.page.is-active').id), 'page-usecases');
  eq('signed out, it says nothing is shared', (await page.textContent('#uc-access')).includes('shared with nobody'), true);

  console.log('\n--- intake to a signed Go ---');
  await page.click('#btn-uc-new');
  await page.waitForTimeout(300);
  await page.fill('#uc-intake [data-uc="name"]', 'Invoice automation');
  await page.fill('#uc-intake [data-uc="client"]', 'Contoso');
  await page.fill('#uc-intake [data-uc="sponsor"]', 'Dana Ruiz');
  await page.fill('#uc-intake [data-uc="partner"]', 'Morgan Lee');
  await page.fill('#uc-intake [data-uc="problem"]', 'Invoices take a week to process.');
  await page.fill('#uc-intake [data-uc="outcome"]', 'Invoices processed in a day.');
  await page.selectOption('#uc-intake [data-uc="methodology"]', 'project');
  await openSection(page, 'sec-uc-evaluate');
  eq('unscored until every criterion is', (await page.textContent('#uc-eval-result')).startsWith('Not scored'), true);
  for (const [k, v] of [['value', '5'], ['fit', '4'], ['feasibility', '4'], ['data', '3'], ['risk', '4']]) {
    await page.selectOption(`[data-uc="scores.${k}"]`, v);
  }
  eq('then scored', await page.textContent('#uc-eval-result'), '79 / 100 · Pursue');

  await openSection(page, 'sec-uc-roi');
  await page.click('[data-uc-add="costs"]');
  await page.click('[data-uc-add="costs"]');
  await page.fill('[data-uc="costs.0.label"]', 'Build');
  await page.fill('[data-uc="costs.0.amount"]', '120000');
  await page.fill('[data-uc="costs.0.source"]', 'SOW');
  await page.fill('[data-uc="costs.1.label"]', 'Licences');
  await page.selectOption('[data-uc="costs.1.type"]', 'Annual');
  await page.fill('[data-uc="costs.1.amount"]', '24000');
  await page.fill('[data-uc="costs.1.source"]', 'Price list');
  await page.click('[data-uc-add="benefits"]');
  await page.click('[data-uc-add="benefits"]');
  await page.fill('[data-uc="benefits.0.label"]', 'AP clerk time');
  await page.fill('[data-uc="benefits.0.hoursPerWeek"]', '120');
  await page.fill('[data-uc="benefits.0.rate"]', '45');
  await page.fill('[data-uc="benefits.0.source"]', 'Time study');
  await page.fill('[data-uc="benefits.1.label"]', 'Late fees avoided');
  await page.selectOption('[data-uc="benefits.1.kind"]', 'Cost avoided');
  await page.fill('[data-uc="benefits.1.annual"]', '30000');
  eq('typing keeps its caret while the results update', await page.evaluate(() => document.activeElement.dataset.uc), 'benefits.1.annual');
  const results = await page.$$eval('#uc-results-table tbody tr', (rows) => rows.map((r) => r.children[2].textContent));
  eq('the expected column', results, ['$694,120', '$192,000', '$502,120', '262%', '$413,908', 'Month 10']);
  eq('the unsourced line is called out', (await page.textContent('.uc-open')).includes('Late fees avoided — no source given'), true);

  await openSection(page, 'sec-uc-decision');
  eq('no conversion before a decision', await page.isDisabled('#btn-uc-convert'), true);
  await page.selectOption('#uc-outcome', 'Go');
  await page.waitForTimeout(200);
  await page.click('[data-uc-sign="sponsor"]');
  await sign(page, 'Dana Ruiz');
  eq('one signature is not a Go', await page.textContent('#uc-verdict'), 'Not decided yet.');
  await page.click('[data-uc-sign="partner"]');
  await sign(page, 'Morgan Lee');
  eq('two are', await page.textContent('#uc-verdict'), 'Go — signed by both');

  console.log('\n--- moving the numbers after signing voids the decision ---');
  await openSection(page, 'sec-uc-roi');
  await page.fill('[data-uc="benefits.1.annual"]', '90000');
  await openSection(page, 'sec-uc-decision');
  eq('the decision lapses', (await page.textContent('#uc-verdict')).startsWith('The decision lapsed'), true);
  eq('and the project cannot be made from it', await page.isDisabled('#btn-uc-convert'), true);
  await openSection(page, 'sec-uc-roi');
  await page.fill('[data-uc="benefits.1.annual"]', '30000');
  await openSection(page, 'sec-uc-decision');
  eq('putting the signed figure back restores it', await page.textContent('#uc-verdict'), 'Go — signed by both');

  console.log('\n--- conversion copies nothing commercial ---');
  await page.click('#btn-uc-convert');
  await page.waitForTimeout(200);
  eq('the preview says what stays behind', (await page.textContent('.dialog')).includes('Not copied: the benefits, rates, ROI, NPV'), true);
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(800);
  const project = await page.evaluate(async () => {
    const s = (await import('/js/state.js')).getState();
    return { name: s.projectName, lifecycle: s.methodology, budget: s.budgetPlanned, value: s.charterValue, success: s.charterSuccess, sponsor: s.charterSponsor };
  });
  eq('a project, with a lifecycle', [project.name, project.lifecycle], ['Invoice automation', 'project']);
  eq('the charter carries the case', [project.success, project.sponsor, project.value], ['Invoices processed in a day.', 'Dana Ruiz', '5']);
  eq('and the cost as its budget', project.budget, 192000);
  const leaked = await page.evaluate(() => {
    const store = localStorage.getItem('projectPlannerStore_v2');
    return ['AP clerk time', 'Late fees', 'Time study', '413908', 'Morgan Lee'].filter((s) => store.includes(s));
  });
  eq('no benefit, rate, source, NPV or signature is in the project store', leaked, []);
  eq('they are all in the use case store', await page.evaluate(() => localStorage.getItem('projectPlannerUseCases_v1').includes('Late fees')), true);
  eq('the stage moves to delivery', await page.textContent('#uc-steps .is-current'), 'In delivery');

  console.log('\n--- value against the business case ---');
  await openSection(page, 'sec-uc-value');
  eq('not measured without a go-live date', (await page.textContent('#uc-realisation')).includes('Not measured'), true);
  await page.fill('[data-uc="goLive"]', await page.evaluate(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }));
  await page.click('[data-uc-add="actuals"]');
  await page.fill('[data-uc="actuals.0.amount"]', '20000');
  const realised = await page.$$eval('#uc-realisation-read dd', (e) => e.map((x) => x.textContent));
  eq('forecast for the months since go-live, beside what was realised', [realised[0], realised[2]], ['4', '$20,000']);
  eq('the stage says value is being realised', await page.textContent('#uc-steps .is-current'), 'Realising value');
  await context.close();

  console.log('\n--- in a demo, the grant is mirrored and said to be unenforced ---');
  {
    const { context: c2, page: p2 } = await fresh();
    await p2.evaluate(async () => (await import('/js/roles.js')).setRole('client-partner'));
    await p2.click('#btn-account');
    await p2.waitForTimeout(300);
    await p2.click('[data-demo="demo-dev"]');
    await p2.waitForTimeout(900);
    await p2.evaluate(async () => { window.location.hash = '#/tab-usecases'; });
    await p2.waitForTimeout(600);
    eq('a demo developer is told they do not hold the grant', (await p2.textContent('#uc-access')).includes('do not hold client partner access'), true);
    eq('and sees no use case controls', await p2.isVisible('#btn-uc-new'), false);
    await p2.evaluate(async () => (await import('/js/identity.js')).signOut());
    await p2.click('#btn-account');
    await p2.waitForTimeout(300);
    await p2.click('[data-demo="demo-partner"]');
    await p2.waitForTimeout(900);
    await p2.evaluate(async () => { window.location.hash = '#/tab-usecases'; });
    await p2.waitForTimeout(600);
    eq('the demo client partner sees the page', await p2.isVisible('#btn-uc-new'), true);
    eq('and is told nothing is enforced in a demo', (await p2.textContent('#uc-access')).includes('nothing is enforced in a demo'), true);
    await c2.close();
  }

  console.log('\n--- the Settings grant is the owner’s alone ---');
  {
    const { context: c3, page: p3 } = await fresh();
    await p3.click('#btn-account');
    await p3.waitForTimeout(300);
    await p3.click('[data-demo="demo-manager"]');
    await p3.waitForTimeout(900);
    await openDestination(p3, 'tab-settings');
    await openSection(p3, 'sec-settings-people');
    eq('a delegated admin cannot tick it', await p3.isDisabled('#members-body tr[data-user="demo-dev"] [data-field="clientPartner"]'), true);
    eq('nor edit a partner’s job role',
       await p3.isDisabled('#members-body tr[data-user="demo-partner"] [data-field="jobRole"]'), true);
    await c3.close();
  }

  console.log('\n--- the sync lane ---');
  await fetch(`${API_URL}/__reset`);
  const device = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await pg.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
    await pg.evaluate((api) => {
      localStorage.clear();
      localStorage.setItem('projectPlannerSupabaseConfig_v1', JSON.stringify({ url: api, anonKey: 'anon' }));
      localStorage.setItem('projectPlannerSupabaseSession_v1', JSON.stringify({
        access_token: 'fake', refresh_token: 'fake', expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: { id: '00000000-0000-4000-8000-000000000001', email: 'tester@x.test' },
      }));
    }, API_URL);
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.waitForTimeout(900);
    return { ctx, pg };
  };
  const syncNow = (pg) => pg.evaluate(async () => { await (await import('/js/sync.js')).syncNow(); });

  const laptop = await device();
  await syncNow(laptop.pg);
  await laptop.pg.evaluate(async () => {
    const store = await import('/js/useCaseStore.js');
    const { getActiveProjectId } = await import('/js/state.js');
    store.createUseCase(getActiveProjectId(), { name: 'Shared case', costs: [{ label: 'Build', type: 'One-off', amount: 5000 }] });
  });
  await syncNow(laptop.pg);
  let dump = await (await fetch(`${API_URL}/__dump`)).json();
  eq('the use case reaches the use_cases table', dump.useCases.map((u) => u.data.name), ['Shared case']);
  eq('and not the project’s rows', dump.rows.some((r) => JSON.stringify(r.data).includes('Shared case')), false);

  const phone = await device();
  await syncNow(phone.pg);
  eq('another device of a partner receives it', await phone.pg.evaluate(async () => (await import('/js/useCaseStore.js')).listUseCases().map((u) => u.name)), ['Shared case']);

  // Access revoked: the server stops returning the row, and this person no
  // longer owns the workspace, so there is nowhere they may write it back to.
  const ucId = dump.useCases[0].id;
  await fetch(`${API_URL}/rest/v1/use_cases?id=eq.${ucId}`, { method: 'DELETE' });
  await fetch(`${API_URL}/rest/v1/projects?id=eq.${dump.useCases[0].project_id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner_id: '00000000-0000-4000-8000-00000000000f' }),
  });
  await syncNow(phone.pg);
  eq('when access goes, the local copy goes with it', await phone.pg.evaluate(async () => (await import('/js/useCaseStore.js')).listUseCases().length), 0);
  dump = await (await fetch(`${API_URL}/__dump`)).json();
  eq('and it is not uploaded again', dump.useCases.length, 0);

  console.log('\n--- a database without the table says so, and projects still sync ---');
  await fetch(`${API_URL}/__hide-table`, { method: 'POST', body: JSON.stringify({ tables: ['use_cases'] }) });
  await syncNow(laptop.pg);
  eq('projects are still synced', (await laptop.pg.evaluate(async () => (await import('/js/sync.js')).getSyncStatus())).state, 'synced');
  eq('the lane reports the missing table', await laptop.pg.evaluate(async () => (await import('/js/useCaseSync.js')).useCaseSyncState().status), 'not-installed');
  await laptop.pg.evaluate(async () => (await import('/js/roles.js')).setRole('client-partner'));
  await openDestination(laptop.pg, 'tab-usecases');
  eq('and the page tells the user to re-run the schema', (await laptop.pg.textContent('#uc-access')).includes('Re-run supabase/schema.sql'), true);
  await fetch(`${API_URL}/__hide-table`, { method: 'POST', body: JSON.stringify({ show: ['use_cases'] }) });
  await laptop.ctx.close();
  await phone.ctx.close();

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  if (errors.length) process.exitCode = 1;
  await browser.close();
  done();
})();
