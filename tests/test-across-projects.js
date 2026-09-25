// The three cross-project surfaces: search, My Work and the Portfolio.
//
// They exist because the app could previously only be read one project at a
// time, and the questions people actually arrive with — "where was that risk?",
// "what is on me today?", "how are all of them doing?" — all span projects.
// So the thing worth testing hardest is precisely that: that each of them sees
// past the project that happens to be open.

const { APP_URL, launch, createChecks, chooseLifecycle } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);

  const activePage = () => page.evaluate(() => document.querySelector('.page.is-active').id);
  const projectId = () => page.evaluate(async () => (await import('/js/state.js')).getActiveProjectId());

  // A second project, so "across projects" has something to cross.
  const firstId = await projectId();
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-software');
  await page.fill('#new-project-name', 'Second Engagement');
  await chooseLifecycle(page);
  await page.click('#btn-create-project');
  await page.waitForTimeout(1100);
  const secondId = await projectId();
  eq('two projects exist', firstId !== secondId, true);

  // ---------------------------------------------------------------- search

  console.log('\n--- Ctrl-K opens a search over everything ---');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(350);
  eq('the palette opens', await page.isVisible('#palette-overlay'), true);
  eq('and says what it covers before you type',
     (await page.textContent('#palette-hint')).includes('across every project'), true);

  await page.fill('#palette-input', 'security');
  await page.waitForTimeout(300);
  const hits = await page.$$eval('.palette__item .palette__title', (e) => e.map((x) => x.textContent));
  eq('typing finds rows', hits.length > 0, true);
  eq('and the match is marked, not just contained',
     await page.locator('.palette__item mark').first().textContent(), 'Security');

  console.log('\n--- it searches projects you are not in ---');
  await page.fill('#palette-input', 'influencer');
  await page.waitForTimeout(300);
  // "Influencer contracts" is a task in the marketing project — the one we are
  // *not* looking at. A search that could not see it would be a filter.
  const foreign = await page.$$eval('.palette__item', (els) => els.map((e) => ({
    title: e.querySelector('.palette__title').textContent,
    project: e.querySelector('.palette__project')?.textContent || '',
  })));
  eq('a row in another project is found', foreign.some((h) => /Influencer/i.test(h.title)), true);
  eq('and is labelled with the project it is in',
     foreign.find((h) => /Influencer/i.test(h.title)).project.length > 0, true);

  console.log('\n--- Enter goes there, switching project on the way ---');
  // Narrowed to both words: "influencer" alone quite correctly puts the RACI
  // row "Influencer contracting" first, which is a different page and would
  // make this assertion about ranking rather than about navigation.
  await page.fill('#palette-input', 'influencer contracts');
  await page.waitForTimeout(300);
  eq('the task is the top hit', await page.textContent('.palette__item .palette__kind'), 'Task');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  eq('the palette closed', await page.isHidden('#palette-overlay'), true);
  eq('we moved to the other project', await projectId(), firstId);
  eq('and landed on the page that row lives on', await activePage(), 'page-tasks');

  console.log('\n--- multiple terms narrow, in any order ---');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  await page.fill('#palette-input', 'contracts influencer');
  await page.waitForTimeout(300);
  eq('both orders find the same row',
     (await page.$$eval('.palette__title', (e) => e.map((x) => x.textContent)))
       .some((t) => /Influencer contracts/i.test(t)), true);

  console.log('\n--- a page name is a destination too ---');
  await page.fill('#palette-input', 'Portfolio');
  await page.waitForTimeout(300);
  const kinds = await page.$$eval('.palette__kind', (e) => e.map((x) => x.textContent));
  eq('pages are offered', kinds.includes('Page'), true);

  console.log('\n--- nothing found says so ---');
  await page.fill('#palette-input', 'zzzzqqqq');
  await page.waitForTimeout(300);
  eq('no results', await page.locator('.palette__item').count(), 0);
  eq('and it says why', (await page.textContent('#palette-hint')).includes('Nothing matches'), true);

  console.log('\n--- Escape closes it and gives focus back ---');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  eq('closed', await page.isHidden('#palette-overlay'), true);

  // A row title is user data. If it were ever written as markup, this is the
  // test that would notice.
  console.log('\n--- a title that looks like markup stays text ---');
  await page.click('#tab-tasks');
  await page.waitForTimeout(500);
  await page.fill('#tracker-body tr:nth-child(1) [data-field="name"]', '<img src=x onerror=1> alpha');
  await page.waitForTimeout(800);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  await page.fill('#palette-input', 'alpha');
  await page.waitForTimeout(300);
  eq('the angle brackets are shown, not parsed',
     (await page.textContent('.palette__item .palette__title')).includes('<img'), true);
  eq('and no element was created from them',
     await page.locator('.palette__item img').count(), 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // --------------------------------------------------------------- My Work

  console.log('\n--- My Work asks who you are before claiming to know ---');
  await page.click('#tab-mywork');
  await page.waitForTimeout(600);
  eq('it is a page', await activePage(), 'page-mywork');
  eq('and it explains the blank rather than showing an empty list',
     await page.isHidden('#mywork-noname'), false);
  eq('nothing is counted yet', await page.textContent('#mywork-count-open'), '0');

  console.log('\n--- naming yourself fills it from every project ---');
  await page.fill('#mywork-name', 'Priya');
  await page.dispatchEvent('#mywork-name', 'change');
  await page.waitForTimeout(600);
  eq('the prompt goes away', await page.isHidden('#mywork-noname'), true);
  const open = Number(await page.textContent('#mywork-count-open'));
  eq('and work appears', open > 0, true);

  // "Priya" must match "Priya N." and "Priya D." — the same person written
  // down twice — without matching a different Priya-something.
  const owners = await page.$$eval('.work-row', (els) => els.map((e) => e.className));
  eq('rows were gathered', owners.length > 0, true);
  eq('spanning more than one project',
     Number(await page.textContent('#mywork-count-projects')) >= 2, true);

  console.log('\n--- it is sorted into the four conversations ---');
  const buckets = await page.$$eval('.work-bucket__title', (e) => e.map((x) => x.textContent));
  eq('buckets are in time order',
     buckets.join(','), ['Overdue', 'Next 7 days', 'Later', 'No date']
       .filter((b) => buckets.includes(b)).join(','));

  console.log('\n--- everyone’s work is the same list, unfiltered ---');
  await page.selectOption('#mywork-scope', 'everyone');
  await page.waitForTimeout(500);
  const everyone = Number(await page.textContent('#mywork-count-open'));
  eq('more shows for everyone than for one person', everyone > open, true);
  await page.selectOption('#mywork-scope', 'mine');
  await page.waitForTimeout(400);

  console.log('\n--- finished work is out of the way until asked for ---');
  const beforeDone = await page.locator('.work-row').count();
  await page.check('#mywork-done');
  await page.waitForTimeout(500);
  const afterDone = await page.locator('.work-row').count();
  eq('including finished shows more', afterDone > beforeDone, true);
  eq('and marks them as finished', await page.locator('.work-row.is-done').count() > 0, true);
  await page.uncheck('#mywork-done');
  await page.waitForTimeout(400);

  console.log('\n--- a row is a link to where it really lives ---');
  const target = await page.$eval('.work-row', (e) => ({
    project: e.dataset.project, nav: e.dataset.nav, row: e.dataset.row,
  }));
  await page.click('.work-row');
  await page.waitForTimeout(1400);
  eq('it opened that row’s project', await projectId(), target.project);
  eq('and marked the row itself',
     await page.locator(`[data-id="${target.row}"].is-linked`).count(), 1);

  console.log('\n--- the name is remembered, and is who the change log credits ---');
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  await page.click('#tab-mywork');
  await page.waitForTimeout(500);
  eq('the name survived a reload', await page.inputValue('#mywork-name'), 'Priya');

  await page.click('#tab-tasks');
  await page.waitForTimeout(500);
  await page.selectOption('#tracker-body tr:nth-child(2) [data-field="status"]', 'On Hold');
  await page.waitForTimeout(900);
  await page.click('#tab-changelog');
  await page.waitForTimeout(500);
  eq('the change is credited to that name',
     await page.textContent('#changelog-body tr:first-child .log-who'), 'Priya');

  // ------------------------------------------------------------- Portfolio

  console.log('\n--- the Portfolio has a line per project and a total ---');
  await page.click('#tab-portfolio');
  await page.waitForTimeout(700);
  eq('every project has a row', await page.locator('#portfolio-body tr').count(), 2);
  eq('and there is exactly one total row', await page.locator('#portfolio-foot tr').count(), 1);
  eq('which counts them', (await page.textContent('#portfolio-foot td')).includes('2 project'), true);

  console.log('\n--- the open project is marked, because that is the one you can edit ---');
  eq('one row is flagged as current', await page.locator('#portfolio-body tr.is-current').count(), 1);

  console.log('\n--- columns sort, and sort back ---');
  const names = () => page.$$eval('#portfolio-body .pf-name', (e) => e.map((x) => x.textContent));
  await page.click('.pf-th[data-key="name"]');
  await page.waitForTimeout(400);
  const asc = await names();
  await page.click('.pf-th[data-key="name"]');
  await page.waitForTimeout(400);
  const desc = await names();
  eq('clicking again reverses', desc.join(','), [...asc].reverse().join(','));
  eq('and the direction is shown',
     (await page.textContent('.pf-th[data-key="name"] .pf-sort')).length > 0, true);

  console.log('\n--- clicking a project opens it ---');
  const other = await page.$$eval('#portfolio-body tr', (els) => {
    const row = els.find((e) => !e.classList.contains('is-current'));
    return row ? row.dataset.project : '';
  });
  await page.click('#portfolio-body tr:not(.is-current)');
  await page.waitForTimeout(1300);
  eq('the project switched', await projectId(), other);
  eq('and landed on its Dashboard', await activePage(), 'page-dashboard');

  console.log('\n--- the totals are the sum of the rows, not a separate count ---');
  await page.click('#tab-portfolio');
  await page.waitForTimeout(600);
  const overdueCells = await page.$$eval('#portfolio-body tr', (els) =>
    els.map((e) => Number(e.children[3].textContent)));
  const totalOverdue = Number(await page.$eval('#portfolio-foot tr', (e) => e.children[3].textContent));
  eq('overdue totals add up', totalOverdue, overdueCells.reduce((a, b) => a + b, 0));

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
