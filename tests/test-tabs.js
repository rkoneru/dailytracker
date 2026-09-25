// In-page tabs: the reorganisation that turned every page from a pile of cards
// into one card at a time.
//
// The things worth pinning are the ones that would quietly lose data or lose
// a feature: that every section is still reachable, that printing still emits
// all of them, that a deep link to a row opens the tab holding it, and that
// the nav leaves select rather than scroll.

const { APP_URL, launch, createChecks, openSection, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const tabLabels = (pageId) => page.$$eval(`#${pageId} .page-tab`,
    (els) => els.map((e) => e.firstChild.textContent.trim()));
  const visibleCards = (pageId) => page.$$eval(`#${pageId} .card:not(.is-tab-hidden) .card__head h2`,
    (els) => els.map((e) => e.textContent));

  console.log('\n--- every multi-section page gets a strip ---');
  const pages = {
    'tab-portfolio': ['page-portfolio', ['All projects', 'AI initiatives', 'Planning layers']],
    'tab-planner': ['page-planner', ['Milestones', 'Timeline', 'Gantt', 'Budget & Notes']],
    'tab-tasks': ['page-tasks', ['Task List', 'Priority Board']],
    'tab-raid': ['page-raid', ['Log', 'Dependencies']],
    'tab-scope': ['page-scope', ['Charter', 'Deliverables', 'Change Requests', 'Documents']],
    'tab-people': ['page-people', ['Team', 'Who Does What', 'Stakeholders & Comms', 'Vendors']],
    'tab-service': ['page-service', ['Service Levels', 'Go-Live', 'Releases & Change', 'Known Issues']],
    'tab-improve': ['page-improve', ['Improvements', 'Lessons']],
    'tab-meetings': ['page-meetings', ['Overview & Agenda', 'Notes & Decisions', 'Actions', 'Recording']],
    'tab-kpis': ['page-kpis', ['Indicators', 'How They Work', 'PM Framework']],
    'tab-resources': ['page-resources', ['People', 'Allocations', 'Availability', 'Timesheets', 'Capacity']],
    'tab-settings': ['page-settings', ['Account', 'People & Access', 'Task Execution', 'Data & Security', 'Sync']],
    'tab-changelog': ['page-changelog', ['Change Log', 'Trash']],
  };
  for (const [navId, [pageId, labels]] of Object.entries(pages)) {
    await page.click(`#${navId} .nav-row__label`);
    await page.waitForTimeout(400);
    eq(`${pageId} tabs`, await tabLabels(pageId), labels);
  }

  console.log('\n--- a page with nothing to choose between gets no strip ---');
  await page.click('#tab-dashboard .nav-row__label');
  await page.waitForTimeout(400);
  eq('nor does the Dashboard', await page.locator('#page-dashboard .page-tabs').count(), 0);

  console.log('\n--- a page that used to stand alone is a tab of its home ---');
  for (const [navId, pageId, tab] of [['tab-capacity', 'page-resources', 'Capacity'], ['tab-ai-portfolio', 'page-portfolio', 'AI initiatives'],
    ['tab-planning-layers', 'page-portfolio', 'Planning layers'], ['tab-sync', 'page-settings', 'Sync'], ['tab-trash', 'page-changelog', 'Trash']]) {
    await openDestination(page, navId);
    eq(`${navId} opens ${pageId} on its ${tab} tab`, await page.evaluate(() => {
      const active = document.querySelector('.page.is-active');
      return [active.id, active.querySelector('.page-tab.is-active')?.firstChild.textContent.trim()];
    }), [pageId, tab]);
  }
  eq('and the tab you are on is filled, not just outlined', await page.$eval('.page.is-active .page-tab.is-active',
    (e) => getComputedStyle(e).backgroundColor !== getComputedStyle(e.parentElement).backgroundColor), true);

  console.log('\n--- one section at a time, and the rest are still there ---');
  await page.click('#tab-service .nav-row__label');
  await page.waitForTimeout(500);
  eq('five registers exist', await page.locator('#page-service .card').count(), 5);
  // Four tabs for five registers: Releases and Change Control share one.
  eq('one is showing', (await visibleCards('page-service')).length, 1);
  eq('and it is the first', await visibleCards('page-service'), ['Service Levels (SLA / OLA)']);
  await page.click('#tab-sec-releases');
  await page.waitForTimeout(300);
  eq('clicking a tab swaps which one', await visibleCards('page-service'), ['Releases & Deployments', 'Change Control (CAB)']);
  eq('the tab says it is selected', await page.getAttribute('#tab-sec-releases', 'aria-selected'), 'true');
  eq('and only that one does', await page.locator('#page-service .page-tab[aria-selected="true"]').count(), 1);

  console.log('\n--- the strip is a real tablist ---');
  eq('role', await page.getAttribute('#page-service .page-tabs', 'role'), 'tablist');
  eq('panels are labelled by their tab',
     await page.getAttribute('#sec-releases', 'aria-labelledby'), 'tab-sec-releases');
  eq('a tab controls every panel it holds',
     await page.getAttribute('#tab-sec-releases', 'aria-controls'), 'sec-releases sec-changes');
  await page.focus('#tab-sec-releases');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  eq('ArrowRight moves along the strip', await visibleCards('page-service'), ['Known Issues & Workarounds (KEDB)']);
  await page.keyboard.press('Home');
  await page.waitForTimeout(250);
  eq('Home returns to the first', await visibleCards('page-service'), ['Service Levels (SLA / OLA)']);

  console.log('\n--- counts sit on the tab, so you can see where the content is ---');
  await page.click('#tab-raid .nav-row__label');
  await page.waitForTimeout(500);
  eq('the dependencies tab carries its row count',
     await page.textContent('#tab-sec-dependencies .page-tab__count'),
     String(await page.locator('#dependencies-body tr').count()));
  await openSection(page, 'sec-dependencies');
  await page.click('#sec-dependencies [data-action="add-row"]');
  await page.waitForTimeout(400);
  eq('and follows an add',
     await page.textContent('#tab-sec-dependencies .page-tab__count'),
     String(await page.locator('#dependencies-body tr').count()));

  console.log('\n--- a link to a section selects its tab rather than scrolling past four tables ---');
  // Sections are the page's tab strip, not sidebar rows; a link reaches them.
  await page.evaluate(() => { window.location.hash = '#/nav-known-errors'; });
  await page.waitForTimeout(600);
  eq('it landed on the page', await page.textContent('#page-title'), 'Service & Support');
  eq('and opened the section it names',
     await visibleCards('page-service'), ['Known Issues & Workarounds (KEDB)']);
  eq('the strip stays in view rather than scrolling off',
     await page.evaluate(() => {
       const r = document.querySelector('#page-service .page-tabs').getBoundingClientRect();
       return r.top >= 0 && r.top < window.innerHeight;
     }), true);

  console.log('\n--- the chosen tab is remembered per page, across a reload ---');
  await page.click('#tab-dashboard .nav-row__label');
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.click('#tab-service .nav-row__label');
  await page.waitForTimeout(500);
  eq('it came back where it was left', await visibleCards('page-service'),
     ['Known Issues & Workarounds (KEDB)']);
  await page.click('#tab-people .nav-row__label');
  await page.waitForTimeout(500);
  eq('and another page keeps its own', (await visibleCards('page-people'))[0], 'Team Roster');

  console.log('\n--- a link to a row opens the tab that is holding it ---');
  await page.click('#tab-scope .nav-row__label');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-deliverables');
  const rowId = await page.evaluate(() => document.querySelector('#deliverables-body tr').dataset.id);
  const projectId = await page.evaluate(async () => (await import('/js/state.js')).getActiveProjectId());
  // Leave the page on a different tab, so the link has something to undo.
  await openSection(page, 'sec-charter');
  await page.click('#tab-dashboard .nav-row__label');
  await page.waitForTimeout(300);
  await page.goto(`${APP_URL}/index.html#/tab-scope/${projectId}/${rowId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  eq('the deep link opened its tab', await visibleCards('page-scope'), ['Deliverables']);
  eq('and highlighted the row it names',
     await page.locator(`#deliverables-body tr[data-id="${rowId}"].is-linked`).count(), 1);

  console.log('\n--- nothing is lost: printing shows every section ---');
  await page.click('#tab-service .nav-row__label');
  await page.waitForTimeout(500);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);
  eq('all five registers print', await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#page-service .card')];
    return cards.filter((c) => getComputedStyle(c).display !== 'none').length;
  }), 5);
  eq('and the strip itself does not',
     await page.evaluate(() => getComputedStyle(document.querySelector('#page-service .page-tabs')).display), 'none');
  await page.emulateMedia({ media: 'screen' });
  await page.waitForTimeout(200);

  console.log('\n--- the page is shorter than the pile it replaced ---');
  eq('service & support fits without a long scroll', await page.evaluate(() => {
    const p = document.getElementById('page-service');
    return p.getBoundingClientRect().height < window.innerHeight * 2;
  }), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 400, height: 900 });
  await page.waitForTimeout(400);
  eq('no page overflow at phone width',
     await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  // The strip wraps rather than scrolling: on a phone, five tabs over two
  // lines is better than three tabs and two you cannot see.
  eq('every tab is still on screen', await page.evaluate(() => {
    const strip = document.querySelector('#page-service .page-tabs');
    const box = strip.getBoundingClientRect();
    return [...strip.querySelectorAll('.page-tab')].every((t) => {
      const r = t.getBoundingClientRect();
      return r.left >= box.left - 1 && r.right <= box.right + 1;
    });
  }), true);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
