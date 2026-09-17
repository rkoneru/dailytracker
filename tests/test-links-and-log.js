// Deep links and the change log.
//
// Both exist so the app can be used by more than one person: a link is how you
// point someone at something, and the log is how anyone reconstructs what
// happened without having been there.

const { APP_URL, launch, createChecks, openSection } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  // Navigate rather than reload: a reload would keep the hash the first boot
  // wrote, which is a route pointing at a project that no longer exists.
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const activePage = () => page.evaluate(() => document.querySelector('.page.is-active').id);
  const projectId = () => page.evaluate(async () => (await import('/js/state.js')).getActiveProjectId());

  console.log('\n--- the address follows the app ---');
  eq('the hash names the page and the project',
     /^#\/tab-dashboard\/[0-9a-f-]{36}$/.test(await page.evaluate(() => location.hash)), true);
  await page.click('#tab-raid');
  await page.waitForTimeout(500);
  eq('and it moves when you do',
     (await page.evaluate(() => location.hash)).startsWith('#/tab-raid/'), true);

  console.log('\n--- Back walks the pages you visited ---');
  await page.click('#tab-tasks');
  await page.waitForTimeout(450);
  await page.goBack();
  await page.waitForTimeout(650);
  eq('Back returns to the previous page', await activePage(), 'page-raid');
  await page.goForward();
  await page.waitForTimeout(650);
  eq('and Forward goes on again', await activePage(), 'page-tasks');

  console.log('\n--- a link opens the exact row it names ---');
  await page.click('#tab-raid');
  await page.waitForTimeout(500);
  const rowId = await page.$eval('#dependencies-body tr:first-child', (e) => e.dataset.id);
  const pid = await projectId();

  await page.click('#tab-dashboard');
  await page.waitForTimeout(400);
  await page.goto(`${APP_URL}/index.html#/tab-raid/${pid}/${rowId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  eq('cold-opening the link lands on the right page', await activePage(), 'page-raid');
  eq('and marks the row it points at',
     await page.locator(`tr[data-id="${rowId}"].is-linked`).count(), 1);

  console.log('\n--- a reference is the address ---');
  eq('refs render as link buttons',
     await page.locator('#dependencies-body tr:first-child .ref-link').count(), 1);
  eq('and still read as the reference',
     await page.textContent('#dependencies-body tr:first-child .ref-link'), 'DEP-01');

  console.log('\n--- a link carries the project, not just the page ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-event');
  await page.click('#btn-create-project');
  await page.waitForTimeout(900);
  const other = await projectId();
  eq('we are now in a different project', other !== pid, true);
  eq('and the address says so', (await page.evaluate(() => location.hash)).includes(other), true);

  await page.evaluate((h) => { window.location.hash = h; }, `#/tab-raid/${pid}/${rowId}`);
  await page.waitForTimeout(1400);
  eq('following the old link switches back to its project', await projectId(), pid);
  eq('and marks the row again',
     await page.locator(`tr[data-id="${rowId}"].is-linked`).count(), 1);

  console.log('\n--- a link to something gone says so, rather than looking like it worked ---');
  await page.evaluate((h) => { window.location.hash = h; }, `#/tab-raid/${pid}/no-such-row`);
  await page.waitForTimeout(1200);
  eq('a dead row link is reported', await page.locator('.toast').count() > 0, true);
  eq('and says what happened',
     (await page.locator('.toast').first().textContent()).includes('no longer has'), true);

  console.log('\n--- the change log records decisions, not keystrokes ---');
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);

  await page.click('#tab-changelog');
  await page.waitForTimeout(450);
  eq('a fresh project has no history', await page.locator('#changelog-body tr').count(), 0);
  eq('and says so plainly',
     (await page.textContent('#changelog-empty')).includes('Nothing recorded yet'), true);

  // The first change of a session has to be caught: a baseline taken on the
  // first save instead of at load would absorb it.
  await page.click('#tab-tasks');
  await page.waitForTimeout(500);
  await page.selectOption('#tracker-body tr:nth-child(4) [data-field="status"]', 'Complete');
  await page.waitForTimeout(900);
  await page.click('#tab-changelog');
  await page.waitForTimeout(500);
  eq('the first change of the session is recorded', await page.locator('#changelog-body tr').count(), 1);

  const firstRow = () => page.$eval('#changelog-body tr', (tr) =>
    [...tr.children].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
  const row = await firstRow();
  eq('it names what moved', row[1], 'Task status');
  eq('and which one', row[2], 'Influencer contracts');
  eq('and the movement, as a sentence', row[3].replace(/\s/g, ''), 'OnHold→Complete');

  console.log('\n--- typing in a free-text field is not a decision ---');
  await page.click('#tab-tasks');
  await page.waitForTimeout(400);
  await page.fill('#tracker-body tr:nth-child(1) [data-field="comments"]', 'just thinking out loud');
  await page.waitForTimeout(900);
  await page.click('#tab-changelog');
  await page.waitForTimeout(450);
  eq('a comment does not become an audit entry', await page.locator('#changelog-body tr').count(), 1);

  console.log('\n--- it catches sign-offs, budgets and RAG ---');
  await page.click('#tab-scope');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-deliverables');
  await page.selectOption('#deliverables-body tr:nth-child(3) [data-field="status"]', 'Accepted');
  await page.waitForTimeout(800);
  await page.click('#tab-planner');
  await page.waitForTimeout(500);
  await page.fill('#page-planner [data-field="dashStatus"]', 'AT RISK');
  await page.waitForTimeout(900);
  await page.click('#tab-changelog');
  await page.waitForTimeout(500);
  const what = await page.$$eval('#changelog-body .log-what', (e) => e.map((x) => x.textContent));
  eq('a deliverable status is audited', what.includes('Deliverable status'), true);
  eq('so is the project RAG', what.includes('RAG status'), true);
  eq('newest first', what[0], 'RAG status');

  console.log('\n--- the log persists and is searchable ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('#tab-changelog');
  await page.waitForTimeout(500);
  eq('it survives a reload', await page.locator('#changelog-body tr').count(), 3);
  await page.fill('#changelog-search', 'Deliverable');
  await page.waitForTimeout(400);
  eq('search narrows it', await page.locator('#changelog-body tr').count(), 1);
  eq('and the count says what is showing',
     await page.textContent('#changelog-count'), '1 of 3 entries');
  await page.fill('#changelog-search', '');
  await page.waitForTimeout(350);

  console.log('\n--- switching project is not a change to either project ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-personal');
  await page.click('#btn-create-project');
  await page.waitForTimeout(1000);
  await page.click('#tab-changelog');
  await page.waitForTimeout(500);
  eq('a new project starts with a clean log', await page.locator('#changelog-body tr').count(), 0);

  console.log('\n--- the log is a record, so it is read-only ---');
  eq('no editable controls in the table',
     await page.locator('#changelog-body input, #changelog-body select').count(), 0);
  eq('clearing it is the only write, and it asks first',
     await page.locator('#btn-clear-changelog').count(), 1);

  console.log('\n--- it syncs like any other row collection ---');
  const kinds = await page.evaluate(async () => (await import('/js/syncModel.js')).ROW_KINDS);
  eq('changeLog is a synced row kind', kinds.includes('changeLog'), true);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
