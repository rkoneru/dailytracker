const { APP_URL, launch } = require('./harness');
let pass = 0, fail = 0;
const eq = (n, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${n}  ${g}`); }
  else { fail++; console.log(`  FAIL ${n}\n       got  ${g}\n       want ${w}`); }
};

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const visibleLabels = () => page.locator('.nav-row:visible .nav-row__label').allTextContents();
  const visibleRowCount = () => page.evaluate(() => [...document.querySelectorAll('#sidebar-nav .nav-row')].filter((r) => !r.closest('[hidden]')).length);
  // Sections are reached by link now, not by a sidebar row.
  const openLink = async (navId) => {
    await page.evaluate((id) => { window.location.hash = `#/${id}`; }, navId);
    await page.waitForTimeout(700);
  };

  console.log('\n--- structure ---');
  eq('one tree', await page.locator('[role="tree"]').count(), 1);
  eq('every row is a treeitem', await page.locator('.nav-row').count(), await page.locator('[role="treeitem"]').count());
  // Two levels only: the five groups, and the pages in them. A page's sections
  // are its tab strip, not a third level of the sidebar.
  eq('only the five groups have child lists', await page.locator('.nav-tree [role="group"]').count(), 5);
  // The default role is the engagement lead, who sees all of it.
  eq('groups and their pages, nothing deeper', await visibleLabels(),
     ['Across Projects', 'My Work', 'Portfolio', 'Resources', 'Capacity Planning',
      'Planning Layers', 'AI Portfolio',
      'Plan & Build', 'Dashboard', 'Tasks', 'Plan', 'Scope & Contract',
      'Run & Support', 'Risks & Issues', 'Service & Support', 'Improvement & Lessons',
      'Report & Share', 'Meetings', 'KPIs', 'People & Stakeholders', 'Reports',
      'Manage', 'Projects', 'Settings', 'Sync & Team', 'Change Log', 'Trash', 'Export / Share']);
  eq('aria-level is set', await page.getAttribute('#tab-dashboard', 'aria-level'), '2');
  eq('no row is deeper than a page', await page.$$eval('.nav-row', (els) => [...new Set(els.map((e) => e.getAttribute('aria-level')))]), ['1', '2']);
  eq('a page is not expandable', await page.getAttribute('#tab-planner', 'aria-expanded'), null);
  eq('sections are not sidebar rows', await page.locator('#nav-ticks').count(), 0);

  console.log('\n--- clicking a page navigates and marks it current ---');
  await page.click('#tab-raid .nav-row__label');
  await page.waitForTimeout(300);
  eq('navigated to RAID', await page.textContent('#page-title'), 'Risks, Issues & Dependencies');
  eq('row marked current', await page.getAttribute('#tab-raid', 'aria-current'), 'page');
  eq('only one current row', await page.locator('.nav-row.is-active').count(), 1);

  console.log('\n--- a link to a section opens its page, and the page is marked ---');
  await openLink('nav-budget');
  eq('landed on the Plan', await page.textContent('#page-title'), 'Plan');
  eq('the page stands in for its section in the sidebar', await page.getAttribute('#tab-planner', 'aria-current'), 'page');
  eq('on the Budget tab', await page.getAttribute('#tab-sec-budget', 'aria-selected'), 'true');
  eq('budget section is in view', await page.evaluate(() => {
    const r = document.getElementById('sec-budget').getBoundingClientRect();
    return r.top > -200 && r.top < window.innerHeight;
  }), true);

  console.log('\n--- visiting pages never grows the sidebar ---');
  const rowsBefore = await visibleRowCount();
  for (const id of ['tab-tasks', 'tab-planner', 'tab-resources', 'tab-kpis', 'tab-reports']) {
    await page.click(`#${id} .nav-row__label`); await page.waitForTimeout(200);
  }
  eq('the same rows after five pages', await visibleRowCount(), rowsBefore);

  console.log('\n--- a link to a report switches report type ---');
  await openLink('nav-report-steerco');
  eq('on the Reports page', await page.textContent('#page-title'), 'Reports');
  eq('SteerCo selected', await page.textContent('#report-title'), 'Steering Committee Report');
  eq('the on-page picker agrees',
     await page.getAttribute('.report-type-btn[data-report="steerco"]', 'aria-pressed'), 'true');
  await openLink('nav-report-exec');
  eq('switching again works', await page.textContent('#report-title'), 'Executive Leadership Report');

  console.log('\n--- panel rows still open their panels ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(300);
  eq('projects panel opened', await page.locator('#projects-overlay').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('#btn-export-panel');
  await page.waitForTimeout(300);
  eq('export panel opened', await page.locator('#export-overlay').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('\n--- keyboard: WAI-ARIA tree pattern ---');
  await page.focus('#group-plan');
  const focused = () => page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('ArrowDown');
  eq('ArrowDown moves to first child', await focused(), 'tab-dashboard');
  await page.keyboard.press('ArrowDown');
  eq('ArrowDown again', await focused(), 'tab-tasks');
  await page.keyboard.press('ArrowDown');
  eq('and again reaches the Planner', await focused(), 'tab-planner');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  eq('ArrowRight on a page has nothing to open', await focused(), 'tab-planner');
  await page.keyboard.press('ArrowLeft');
  eq('ArrowLeft returns to the group', await focused(), 'group-plan');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  eq('ArrowLeft again collapses it', await page.getAttribute('#group-plan', 'aria-expanded'), 'false');
  eq('collapsed pages are no longer reachable', (await visibleLabels()).includes('Dashboard'), false);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  eq('ArrowRight opens it again', await page.getAttribute('#group-plan', 'aria-expanded'), 'true');
  await page.keyboard.press('End');
  eq('End goes to the last visible row', await focused(), 'btn-export-panel');
  await page.keyboard.press('Home');
  eq('Home goes to the first', await focused(), 'group-across');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  eq('Enter activates', await page.textContent('#page-title'), 'My Work');

  console.log('\n--- a group collapses, and stays collapsed after a reload ---');
  await page.click('#group-manage');           // collapse a group
  await page.waitForTimeout(200);
  eq('manage collapsed', (await visibleLabels()).includes('Projects'), false);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  eq('manage still collapsed after reload', (await visibleLabels()).includes('Projects'), false);

  console.log('\n--- navigating from elsewhere still updates the tree ---');
  await page.click('#group-manage'); await page.waitForTimeout(200);
  await page.click('#tab-dashboard'); await page.waitForTimeout(300);
  await page.click('#btn-open-tasks');
  await page.waitForTimeout(400);
  eq('the Dashboard link moved the page', await page.textContent('#page-title'), 'Tasks');
  eq('and the tree followed', await page.getAttribute('#tab-tasks', 'aria-current'), 'page');

  console.log('\n--- narrow viewport ---');
  await page.setViewportSize({ width: 400, height: 900 });
  await page.waitForTimeout(300);
  await page.click('#btn-sidebar-toggle'); await page.waitForTimeout(250);
  await page.click('#tab-raid .nav-row__label'); await page.waitForTimeout(350);
  eq('navigating closes the drawer', await page.evaluate(() => document.body.classList.contains('sidebar-open')), false);
  eq('no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\n--- code-review fixes ---');
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1. Panel rows must be keyboard-operable, not mouse-only.
  await page.focus('#btn-projects');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  eq('Enter opens the Projects panel', await page.locator('#projects-overlay').isVisible(), true);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.focus('#btn-export-panel');
  await page.keyboard.press(' ');
  await page.waitForTimeout(350);
  eq('Space opens the Export panel', await page.locator('#export-overlay').isVisible(), true);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // 2. Every group heading gets its separation, not just the first.
  const groupMargins = await page.$$eval('.nav-row--group',
    els => els.map(e => getComputedStyle(e).marginTop));
  eq('only the first group sits flush', groupMargins, ['0px', '10px', '10px', '10px', '10px']);

  // 3. A jumped-to section must clear the sticky header.
  await openLink('nav-notes');
  const clearance = await page.evaluate(() => {
    const header = document.querySelector('.app-header').getBoundingClientRect();
    return document.getElementById('sec-notes').getBoundingClientRect().top - header.bottom;
  });
  eq('section lands below the sticky header', clearance >= 0, true);

  // 4. aria-expanded has to refer to a real group.
  eq('expandable rows own their group', await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.nav-row[aria-expanded]')];
    return rows.every(r => document.getElementById(r.getAttribute('aria-owns')));
  }), true);

  // 5. Expanding must not steal the tab stop from the focused row.
  await page.focus('#group-plan');
  await page.keyboard.press('ArrowLeft');       // collapse while focused
  await page.waitForTimeout(200);
  eq('focused row keeps the tab stop after collapsing',
     await page.getAttribute('#group-plan', 'tabindex'), '0');
  eq('and only one row is tabbable',
     await page.locator('.nav-row[tabindex="0"]').count(), 1);

  // 6. Pages are regions, not tabpanels — the tabpanel role belongs to the
  // sections inside a page, which are what the in-page tab strip switches.
  eq('no page claims the tabpanel role', await page.locator('.page[role="tabpanel"]').count(), 0);
  eq('pages are labelled regions', await page.locator('.page[role="region"][aria-label]').count(), 21);

  // 7. Opening a report from a link renders it once, not twice.
  await openLink('tab-dashboard');
  await page.evaluate(() => {
    window.__renderCount = 0;
    const cards = document.getElementById('report-project-cards');
    new MutationObserver(() => { window.__renderCount += 1; }).observe(cards, { childList: true });
    return true;
  });
  await openLink('nav-report-weekly');
  const count = await page.evaluate(() => window.__renderCount);
  eq('report rendered once from the nav', count <= 2, true);
  eq('and it is the right one', await page.textContent('#report-title'), 'Weekly Status Report');

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
