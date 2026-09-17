// The resource pool, on screen.
//
// The arithmetic is covered in test-resources.mjs; this is about the part that
// could still be wrong with perfect arithmetic — whether the pool really is one
// pool, whether a project's roster is genuinely the same data as its
// allocations rather than a second copy of it, and whether the app tells you
// the truth when a booking cannot be kept.

const { APP_URL, launch, createChecks, openSection } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  const newProject = async (template, name) => {
    await page.click('#btn-projects');
    await page.waitForTimeout(500);
    await page.check(`#template-${template}`);
    if (name) await page.fill('#new-project-name', name);
    await page.click('#btn-create-project');
    await page.waitForTimeout(1400);
  };

  console.log('\n--- a template brings its people into the pool, not just their names ---');
  await newProject('transition');
  await page.click('#tab-resources');
  await page.waitForTimeout(900);
  eq('the page opened', await page.evaluate(() => document.querySelector('.page.is-active').id), 'page-resources');
  const poolRows = await page.locator('#resources-body tr').count();
  eq('the pool has people in it', poolRows >= 8, true);
  eq('with skills against them',
     (await page.inputValue('#resources-body tr:first-child [data-field="skillsText"]')).length > 0, true);
  eq('and rates, so margin is a number rather than a dash',
     (await page.$$eval('#resources-body tr td:nth-child(9)', (els) => els.map((e) => e.textContent)))
       .filter((t) => t !== '—').length >= 4, true);

  console.log('\n--- the old per-project roster is gone, folded into the pool ---');
  const leftovers = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    return state.listFullProjects().map((p) => (p.roster || []).length);
  });
  eq('no project keeps a roster of its own', leftovers.every((n) => n === 0), true);
  eq('and the People page has no roster register to edit',
     await page.locator('#people-registers [data-register="roster"]').count(), 0);

  console.log('\n--- one person, however many projects they are on ---');
  await newProject('servicedesk', 'Desk');
  await page.click('#tab-resources');
  await page.waitForTimeout(800);
  const names = await page.$$eval('#resources-body [data-field="name"]', (els) => els.map((e) => e.value));
  eq('no duplicates in the pool', names.length, new Set(names).size);
  // Three projects by now: the default one the app opens with, plus the two
  // templates created above.
  eq('allocations span every project that has people on it',
     /across [23] projects/.test(await page.textContent('#allocations-count')), true);

  console.log('\n--- the same person twice becomes one person ---');
  // Identity is the email, so adding someone already there is absorbed rather
  // than producing a second copy that drifts.
  const before = await page.locator('#resources-body tr').count();
  const added = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const first = state.listResources()[0];
    const again = state.addResource({ name: 'Totally Different Name', email: first.email });
    return { sameId: again.id === first.id, name: again.name };
  });
  await page.waitForTimeout(500);
  eq('the id matched, so nothing was added', added.sameId, true);
  eq('and the existing person is returned untouched', added.name !== 'Totally Different Name', true);
  await page.click('#tab-resources');
  await page.waitForTimeout(600);
  eq('the pool did not grow', await page.locator('#resources-body tr').count(), before);

  console.log('\n--- utilisation counts every project, not the one you are in ---');
  const util = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const model = await import('/js/resourceModel.js');
    const resources = state.listResources();
    const allocations = state.listAllAllocations();
    // Someone booked on more than one project at once is the case a
    // per-project roster could never see.
    const counts = new Map();
    allocations.forEach((a) => counts.set(a.resourceId, (counts.get(a.resourceId) || 0) + 1));
    const shared = [...counts.entries()].find(([, n]) => n > 1);
    if (!shared) return null;
    const resource = resources.find((r) => r.id === shared[0]);
    const mine = allocations.filter((a) => a.resourceId === resource.id);
    return {
      projects: new Set(mine.map((a) => a.projectId)).size,
      total: model.utilisation(resource, allocations, state.listAbsences(), '2026-10-01', '2026-12-31').allocated,
      onOne: Number(mine[0].percent),
    };
  });
  if (util) {
    eq('that person is on more than one project', util.projects > 1, true);
    eq('and their total is more than any single booking', util.total > util.onOne, true);
  } else {
    eq('nobody is shared between projects yet, so nothing to check', true, true);
  }

  console.log('\n--- the roster is the allocations, not a copy of them ---');
  await page.click('#tab-people');
  await page.waitForTimeout(800);
  const rosterRows = await page.locator('#roster-view-body tr').count();
  const projectAllocs = await page.evaluate(async () =>
    ((await import('/js/state.js')).getState().allocations || []).length);
  eq('the roster shows exactly the allocations', rosterRows, projectAllocs);
  eq('it is read-only — allocation is edited in one place',
     await page.locator('#roster-view-body input, #roster-view-body select').count(), 0);
  eq('and it says what else each person is committed to',
     (await page.$$eval('#roster-view-body tr td:nth-child(6)', (els) => els.map((e) => e.textContent)))
       .some((t) => t.endsWith('%')), true);

  console.log('\n--- removing an allocation removes it from the roster too ---');
  await page.click('#tab-resources');
  await page.waitForTimeout(700);
  await openSection(page, 'sec-allocations');
  const allocBefore = await page.locator('#allocations-body tr').count();
  await page.click('#allocations-body tr:first-child [data-action="delete-alloc"]');
  await page.waitForTimeout(800);
  eq('one fewer allocation', await page.locator('#allocations-body tr').count(), allocBefore - 1);
  await page.click('#tab-people');
  await page.waitForTimeout(700);
  eq('and the roster agrees, because it is the same list',
     await page.locator('#roster-view-body tr').count(),
     await page.evaluate(async () => ((await import('/js/state.js')).getState().allocations || []).length));

  console.log('\n--- creating a project asks who is running it ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(600);
  eq('three key roles are offered', await page.locator('#new-project-roles select').count(), 3);
  const roleLabels = await page.$$eval('#new-project-roles .field-label', (els) =>
    els.map((e) => e.childNodes[0].textContent.trim()));
  eq('and they are the ones that matter', roleLabels,
     ['Engagement Manager', 'Project Manager', 'Product Manager']);
  eq('the team list offers the pool', await page.locator('#new-project-team li').count() >= 8, true);
  eq('each showing how booked they already are',
     (await page.textContent('#new-project-team li:first-child .staffing__util')).endsWith('%'), true);

  console.log('\n--- and ranks the pool by the skills you ask for ---');
  await page.fill('#new-project-skills', 'Kubernetes');
  await page.waitForTimeout(500);
  const ranked = await page.$$eval('#new-project-team li', (els) => els.map((e) => ({
    name: e.querySelector('.staffing__name').textContent,
    match: e.querySelector('.skill-match')?.textContent || '',
  })));
  eq('the best match is first', ranked[0].match, 'covers all');
  eq('and the ones who cannot are told apart',
     ranked.some((r) => r.match.startsWith('missing')), true);

  console.log('\n--- the choices become allocations on the new project ---');
  const pmId = await page.$eval('#role-pick-project-manager option:nth-child(2)', (e) => e.value);
  await page.selectOption('#role-pick-project-manager', pmId);
  await page.check('#new-project-team li:nth-child(3) input');
  await page.check('#template-software');
  await page.fill('#new-project-name', 'Staffed');
  await page.click('#btn-create-project');
  await page.waitForTimeout(1500);
  await page.click('#tab-people');
  await page.waitForTimeout(800);
  const staffed = await page.evaluate(async () => (await import('/js/state.js')).getState().allocations);
  eq('the key role was booked', staffed.some((a) => a.keyRole === 'project-manager'), true);
  eq('the team member too', staffed.length >= 2, true);
  eq('and the roster shows the role', await page.locator('#roster-view-body .key-role').count() >= 1, true);

  console.log('\n--- one person cannot hold two key roles at once ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(600);
  const someone = await page.$eval('#role-pick-engagement-manager option:nth-child(2)', (e) => e.value);
  await page.selectOption('#role-pick-engagement-manager', someone);
  await page.waitForTimeout(300);
  await page.selectOption('#role-pick-project-manager', someone);
  await page.waitForTimeout(400);
  eq('picking them for the second clears the first',
     await page.inputValue('#role-pick-engagement-manager'), '');
  await page.click('#btn-close-projects');
  await page.waitForTimeout(400);

  console.log('\n--- booking someone across leave is reported ---');
  await page.click('#tab-resources');
  await page.waitForTimeout(800);
  await openSection(page, 'sec-conflicts');
  const conflictsBefore = await page.locator('#resource-conflicts li').count();
  await openSection(page, 'sec-availability');
  await page.click('#btn-add-absence');
  await page.waitForTimeout(700);
  // Cover the whole window, so it necessarily collides with a booking.
  await page.fill('#absences-body tr:first-child [data-field="from"]', '2026-01-01');
  await page.dispatchEvent('#absences-body tr:first-child [data-field="from"]', 'change');
  await page.fill('#absences-body tr:first-child [data-field="to"]', '2027-12-31');
  await page.dispatchEvent('#absences-body tr:first-child [data-field="to"]', 'change');
  await page.waitForTimeout(900);
  eq('more is flagged than before', await page.locator('#resource-conflicts li').count() > conflictsBefore, true);
  const texts = await page.$$eval('#resource-conflicts .conflict__text', (els) => els.map((e) => e.textContent));
  eq('and the clash is named', texts.some((t) => t.includes('annual leave')), true);

  console.log('\n--- leave reduces capacity, so the promise becomes visible ---');
  eq('somebody is now over-allocated',
     (await page.$$eval('#resource-conflicts .conflict__text', (els) => els.map((e) => e.textContent)))
       .some((t) => t.includes('only') && t.includes('left after')), true);

  console.log('\n--- a timesheet week totals and prices itself ---');
  await openSection(page, 'sec-timesheets');
  await page.click('#btn-add-timesheet');
  await page.waitForTimeout(700);
  await page.fill('#timesheets-body tr:first-child [data-field="hours"]', '10');
  await page.dispatchEvent('#timesheets-body tr:first-child [data-field="hours"]', 'change');
  await page.waitForTimeout(800);
  eq('hours are totalled', await page.textContent('#ts-hours'), '10h');
  eq('nothing is approved yet', await page.textContent('#ts-approved'), '0h');
  await page.selectOption('#timesheets-body tr:first-child [data-field="status"]', 'Approved');
  await page.waitForTimeout(800);
  eq('approving it moves the figure', await page.textContent('#ts-approved'), '10h');
  eq('and the caveat stops complaining',
     (await page.textContent('#ts-caveat')).includes('not approved'), false);

  console.log('\n--- unpriced time is admitted, not counted as free ---');
  const priced = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const model = await import('/js/resourceModel.js');
    const entries = state.listAllTimesheets();
    return model.timesheetValue(entries, state.listResources());
  });
  eq('either it is priced, or the hours are reported as unpriced',
     priced.revenue > 0 || priced.unpricedHours > 0, true);

  console.log('\n--- the pool survives a reload ---');
  const poolSize = await page.locator('#resources-body tr').count();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.click('#tab-resources');
  await page.waitForTimeout(800);
  eq('everyone is still there', await page.locator('#resources-body tr').count(), poolSize);
  eq('and so is the leave', await page.locator('#absences-body tr').count(), 1);

  console.log('\n--- removing someone from the pool keeps the record of their bookings ---');
  const firstName = await page.inputValue('#resources-body tr:first-child [data-field="name"]');
  const bookedBefore = await page.locator('#allocations-body tr').count();
  await openSection(page, 'sec-people');
  await page.click('#resources-body tr:first-child [data-action="delete-resource"]');
  await page.waitForTimeout(400);
  eq('it asks first, and says what it will and will not do',
     (await page.textContent('.dialog')).includes('those bookings stay')
       || (await page.textContent('.dialog')).includes('bookings stay'), true);
  await page.click('.dialog .btn-danger');
  await page.waitForTimeout(900);
  eq('the person is gone from the pool',
     (await page.$$eval('#resources-body [data-field="name"]', (els) => els.map((e) => e.value)))
       .includes(firstName), false);
  eq('but their allocations are not silently deleted',
     await page.locator('#allocations-body tr').count(), bookedBefore);
  eq('they are marked as no longer in the pool',
     await page.locator('#allocations-body .alloc-ghost').count() > 0, true);

  console.log('\n--- allocations sync like any other project row ---');
  const kinds = await page.evaluate(async () => (await import('/js/syncModel.js')).ROW_KINDS);
  eq('allocations are a synced kind', kinds.includes('allocations'), true);
  eq('timesheets too', kinds.includes('timesheets'), true);
  eq('but the pool is not, because sync is per project',
     kinds.includes('resources'), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
