// The role picker and the nav it filters.
//
// The promise is narrow and worth pinning down precisely: a role changes what
// the sidebar offers and where you land, and it changes nothing else. It is
// not access control — the toggle proves that — and it must never strand
// someone on a page their new role cannot navigate back to.

const { APP_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  const pages = () => page.$$eval('.nav-row:visible', (els) => els
    .filter((e) => !e.classList.contains('nav-row--group'))
    .map((e) => e.querySelector('.nav-row__label').textContent));
  const activePage = () => page.evaluate(() => document.querySelector('.page.is-active').id);
  const setRole = async (id) => { await page.selectOption('#role-select', id); await page.waitForTimeout(450); };

  console.log('\n--- the picker offers every role and starts on the lead ---');
  eq('roles offered', await page.$$eval('#role-select option', (e) => e.map((x) => x.textContent)),
     ['Engagement Lead', 'Project Manager', 'Product Manager', 'Scrum Master',
      'Developer', 'Tester / QA', 'Service Manager', 'Chief AI Officer']);
  eq('default role', await page.inputValue('#role-select'), 'engagement-lead');
  eq('and it explains itself', (await page.textContent('#role-blurb')).length > 20, true);

  console.log('\n--- the lead sees everything, including Engagement ---');
  const leadPages = await pages();
  eq('Scope & Contract is there', leadPages.includes('Scope & Contract'), true);
  eq('People & Stakeholders is there', leadPages.includes('People & Stakeholders'), true);
  eq('nothing is held back', await page.isHidden('#nav-filter-note'), true);

  console.log('\n--- Engagement is for the lead, and only the lead ---');
  for (const role of ['project-manager', 'product-manager', 'scrum-master', 'developer', 'tester', 'service-manager', 'chief-ai-officer']) {
    await setRole(role);
    const visible = await pages();
    eq(`${role} cannot see Scope & Contract`, visible.includes('Scope & Contract'), false);
    eq(`${role} cannot see People & Stakeholders`, visible.includes('People & Stakeholders'), false);
  }

  console.log('\n--- each role keeps the pages it actually uses ---');
  await setRole('tester');
  const tester = await pages();
  eq('a tester keeps Service & Support', tester.includes('Service & Support'), true);
  eq('and Risks & Issues', tester.includes('Risks & Issues'), true);
  eq('but not the Plan', tester.includes('Plan'), false);

  await setRole('scrum-master');
  const scrum = await pages();
  eq('a scrum master keeps the Plan', scrum.includes('Plan'), true);
  eq('and Improvement & Lessons, for retros', scrum.includes('Improvement & Lessons'), true);
  eq('but not Service & Support', scrum.includes('Service & Support'), false);

  await setRole('service-manager');
  const svc = await pages();
  eq('a service manager keeps Service & Support', svc.includes('Service & Support'), true);
  eq('but not Tasks', svc.includes('Tasks'), false);

  console.log('\n--- the filter says what it is holding back ---');
  eq('the note is visible', await page.isHidden('#nav-filter-note'), false);
  eq('and names the role', (await page.textContent('#nav-filter-note')).includes('Service Manager'), true);

  console.log('\n--- it is a filter, not a lock ---');
  await page.check('#role-show-all');
  await page.waitForTimeout(450);
  const everything = await pages();
  eq('show-everything brings Engagement back', everything.includes('Scope & Contract'), true);
  eq('and the note goes quiet', await page.isHidden('#nav-filter-note'), true);
  await page.uncheck('#role-show-all');
  await page.waitForTimeout(450);
  eq('unchecking filters again', (await pages()).includes('Scope & Contract'), false);

  console.log('\n--- everyone gets My Work; the Portfolio is for the roles that run several ---');
  await setRole('developer');
  const dev = await pages();
  eq('a developer has My Work', dev.includes('My Work'), true);
  eq('but not the Portfolio', dev.includes('Portfolio'), false);
  await setRole('project-manager');
  const pm = await pages();
  eq('a project manager has both', pm.includes('My Work') && pm.includes('Portfolio'), true);
  // AI initiatives is a tab of Portfolio now, so it has no menu row of its own.
  eq('AI initiatives is not a menu row', pm.includes('AI Portfolio'), false);
  await setRole('chief-ai-officer');
  eq('the CAIO has the Portfolio it lives on', (await pages()).includes('Portfolio'), true);

  console.log('\n--- each role opens where it would have clicked ---');
  // Deep links made the URL the source of truth for where you are, so the
  // role's home page is the default for a *fresh* open rather than something
  // that overrides a route. Clearing the hash is what a first visit, an
  // installed shortcut or a bookmark to the bare URL all look like.
  const landings = {
    'engagement-lead': 'page-dashboard',
    'project-manager': 'page-dashboard',
    'scrum-master': 'page-tasks',
    // A developer and a tester work across engagements more often than they run
    // one, so their home is the cross-project queue rather than this project's
    // board. The lead stays on the Dashboard: that is also the role nobody has
    // chosen yet, and a first run has one project.
    developer: 'page-mywork',
    tester: 'page-mywork',
    'service-manager': 'page-service',
    // Portfolio, on its AI initiatives tab (checked below).
    'chief-ai-officer': 'page-portfolio',
  };
  for (const [role, expected] of Object.entries(landings)) {
    await setRole(role);
    await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1100);
    eq(`${role} opens on ${expected}`, await activePage(), expected);
    if (role === 'chief-ai-officer') {
      eq('on its AI initiatives tab', await page.getAttribute('#tab-sec-ai-portfolio', 'aria-selected'), 'true');
    }
  }

  console.log('\n--- but a route wins over the role default ---');
  await setRole('service-manager');
  await page.click('#tab-raid');
  await page.waitForTimeout(450);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  eq('reloading keeps you where you were, not where your role starts',
     await activePage(), 'page-raid');

  console.log('\n--- switching role never strands you on a page you cannot leave ---');
  await setRole('engagement-lead');
  await page.click('#tab-scope');
  await page.waitForTimeout(400);
  eq('the lead is on Scope & Contract', await activePage(), 'page-scope');
  await setRole('developer');
  eq('a developer is moved to their own home rather than left there',
     await activePage(), 'page-mywork');

  // The opposite case matters too: a page the new role can still see should
  // not be yanked away just because the role changed.
  await setRole('engagement-lead');
  await page.click('#tab-raid');
  await page.waitForTimeout(400);
  await setRole('tester');
  eq('a page both roles share is left alone', await activePage(), 'page-raid');

  console.log('\n--- the choice sticks, and survives a reload ---');
  await setRole('product-manager');
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  eq('role persisted', await page.inputValue('#role-select'), 'product-manager');
  eq('and the picker agrees with the nav',
     (await pages()).includes('Scope & Contract'), false);

  console.log('\n--- the data is the same whoever is looking ---');
  // A filter that quietly changed the numbers would be a different feature
  // and a much more dangerous one.
  const taskCount = await page.evaluate(async () => (await import('/js/state.js')).getState().dashTasks.length);
  await setRole('engagement-lead');
  eq('task count does not depend on the role',
     await page.evaluate(async () => (await import('/js/state.js')).getState().dashTasks.length), taskCount);
  eq('nor does the deliverable count',
     await page.evaluate(async () => (await import('/js/state.js')).getState().deliverables.length), 4);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
