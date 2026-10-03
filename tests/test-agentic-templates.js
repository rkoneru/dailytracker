// The agentic AI templates, and the row-id collision they nearly caused.
//
// Two things are worth testing here. First that the templates are usable —
// they fill the registers, plot a plan and stock the resource pool, because a
// template that opens to empty tables teaches nothing. Second, and less
// obviously, that creating the same template twice produces two projects and
// not one: these templates name their own row ids so a task can say what
// blocks it, and row ids are the primary key on the server rather than being
// scoped to a project.

const { APP_URL, launch, createChecks, chooseLifecycle } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  const create = async (key, name) => {
    await page.click('#btn-projects');
    await page.waitForTimeout(500);
    await page.check(`#template-${key}`);
    if (name) await page.fill('#new-project-name', name);
    await chooseLifecycle(page);
    await page.click('#btn-create-project');
    await page.waitForTimeout(1300);
  };

  console.log('\n--- the picker offers them as their own category ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(500);
  const groups = await page.$$eval('.template-group', (els) => els.map((e) => e.textContent));
  eq('there is an industry category', groups.includes('Agentic AI by Industry'), true);
  const agentic = await page.$$eval('.template-card input[value^="agentic-"]', (els) => els.map((e) => e.value));
  eq('with eight use cases', agentic.length, 8);
  eq('each named for its industry', await page.$$eval('.template-card', (els) => els
    .filter((e) => e.querySelector('input[value^="agentic-"]'))
    .every((e) => e.querySelector('.template-card__label').textContent.includes('—'))), true);
  await page.click('#btn-close-projects');
  await page.waitForTimeout(300);

  console.log('\n--- one opens with a plan, not an empty shell ---');
  await create('agentic-aml', 'AML one');
  const filled = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const defs = await import('/js/registerDefs.js');
    const p = state.getState();
    return {
      tasks: p.dashTasks.length,
      milestones: p.milestones.length,
      raid: p.raid.length,
      empty: defs.REGISTER_KEYS.filter((k) => !(p[k] || []).length),
      charter: (p.charterScopeOut || '').length,
      pool: state.listResources().length,
      allocations: (p.allocations || []).length,
    };
  });
  eq('it has a task plan', filled.tasks, 14);
  eq('and milestones', filled.milestones, 7);
  eq('and a RAID log', filled.raid > 5, true);
  eq('every register is filled', filled.empty, []);
  eq('the charter says what is out of scope', filled.charter > 40, true);
  eq('and the people came with it', filled.pool > 0, true);
  eq('allocated to the project', filled.allocations > 0, true);

  console.log('\n--- the delivery spine is ordered, not just listed ---');
  const graph = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const critical = await import('/js/critical.js');
    return critical.analyse(state.getState().dashTasks);
  });
  eq('no dependency loops', graph.cyclic.length, 0);
  eq('there is a critical path through it', graph.critical.length > 5, true);
  eq('and work is blocked on work, which is the point', graph.blocked.length > 0, true);

  console.log('\n--- the same template twice is two projects, not one ---');
  // The bug this guards: templates name their own row ids so dependencies can
  // reference them, and row ids are the server's primary key globally. Without
  // regeneration the second project silently overwrites the first on sync.
  await create('agentic-aml', 'AML two');
  const collision = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const projects = state.listFullProjects().filter((p) => p.projectName.startsWith('AML'));
    const rowsOf = (p) => [...(p.dashTasks || []), ...(p.milestones || []), ...(p.raid || []),
      ...(p.deliverables || []), ...(p.allocations || [])].map((r) => r.id);
    const [a, b] = projects.map(rowsOf);
    const ids = new Set(projects[0].dashTasks.map((t) => t.id));
    return {
      projects: projects.length,
      shared: a.filter((id) => b.includes(id)),
      dangling: projects[0].dashTasks.flatMap((t) => (t.dependsOn || []).filter((d) => !ids.has(d))),
    };
  });
  eq('both projects exist', collision.projects, 2);
  eq('and share no row id at all', collision.shared, []);
  eq('while their dependencies still resolve', collision.dangling, []);

  console.log('\n--- and the second one still has a working plan ---');
  const second = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const critical = await import('/js/critical.js');
    return critical.analyse(state.getState().dashTasks).critical.length;
  });
  eq('a critical path survived the remapping', second > 5, true);

  console.log('\n--- each industry is genuinely a different project ---');
  // The spine is shared on purpose; if the domains were too, there would be no
  // reason to ship eight of them.
  await create('agentic-benefits', 'Benefits');
  await create('agentic-network', 'Network');
  const distinct = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const pick = (name) => state.listFullProjects().find((p) => p.projectName === name);
    const summarise = (p) => ({
      scopeOut: p.charterScopeOut,
      sla: (p.serviceLevels || []).map((s) => s.metric).join('|'),
      errors: (p.knownErrors || []).map((k) => k.symptom).join('|'),
      risks: (p.raid || []).map((r) => r.title).join('|'),
    });
    return { a: summarise(pick('Benefits')), b: summarise(pick('Network')) };
  });
  eq('their out-of-scope statements differ', distinct.a.scopeOut !== distinct.b.scopeOut, true);
  eq('their service levels differ', distinct.a.sla !== distinct.b.sla, true);
  eq('their known errors differ', distinct.a.errors !== distinct.b.errors, true);
  eq('their risks differ', distinct.a.risks !== distinct.b.risks, true);

  console.log('\n--- and each carries the controls its regulator would ask for ---');
  const controls = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const pick = (name) => state.listFullProjects().find((p) => p.projectName === name);
    const sac = (name) => (pick(name).sac || []).map((c) => c.criterion.toLowerCase()).join(' ');
    return { benefits: sac('Benefits'), network: sac('Network') };
  });
  eq('the benefits agent has an equality assessment',
     controls.benefits.includes('equality'), true);
  eq('the network agent has no write access to the network',
     controls.network.includes('no write access'), true);
  eq('both insist the guardrails are enforced, not requested',
     controls.benefits.includes('enforced by the runtime')
       && controls.network.includes('enforced by the runtime'), true);

  console.log('\n--- they report in the house format like anything else ---');
  await page.click('#tab-reports');
  await page.waitForTimeout(800);
  await page.click('[data-report="steerco"]');
  await page.waitForTimeout(900);
  eq('sheets rendered', await page.locator('.rpt-sheet').count() > 0, true);
  eq('with the five RAG dimensions',
     (await page.$$eval('.rpt-sheet:first-of-type .rpt-rag__label', (e) => e.map((x) => x.textContent))).slice(0, 5),
     ['OVERALL', 'SCOPE', 'COSTS', 'SCHEDULE', 'BENEFITS']);
  eq('and a plotted milestone grid', await page.locator('.rpt-bar').count() > 0, true);

  console.log('\n--- and are searchable like anything else ---');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  await page.fill('#palette-input', 'guardrail');
  await page.waitForTimeout(400);
  eq('agentic content is in the index', await page.locator('.palette__item').count() > 0, true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
