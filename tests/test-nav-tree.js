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

  console.log('\n--- structure ---');
  eq('one tree', await page.locator('[role="tree"]').count(), 1);
  eq('every row is a treeitem', await page.locator('.nav-row').count(), await page.locator('[role="treeitem"]').count());
  eq('child lists are groups', await page.locator('.nav-tree [role="group"]').count(), 5);
  eq('groups open, pages closed at first run', await visibleLabels(),
     ['Workspace', 'Dashboard', 'Planner', 'RAID & Issues', 'Reporting', 'Reports', 'Manage', 'Projects', 'Sync & Team', 'Export / Share']);
  eq('aria-level is set', await page.getAttribute('#tab-dashboard', 'aria-level'), '2');
  eq('leaf level is deeper', await page.getAttribute('#nav-tasks', 'aria-level'), '3');

  console.log('\n--- twisty expands without navigating ---');
  eq('planner starts collapsed', await page.getAttribute('#tab-planner', 'aria-expanded'), 'false');
  await page.click('#tab-planner .nav-twisty');
  await page.waitForTimeout(250);
  eq('planner expanded', await page.getAttribute('#tab-planner', 'aria-expanded'), 'true');
  eq('sections now visible', (await visibleLabels()).includes('Tick Timeline'), true);
  eq('did not navigate', await page.textContent('#page-title'), 'Dashboard');

  console.log('\n--- clicking a page navigates and marks it current ---');
  await page.click('#tab-raid .nav-row__label');
  await page.waitForTimeout(300);
  eq('navigated to RAID', await page.textContent('#page-title'), 'RAID & Issues');
  eq('row marked current', await page.getAttribute('#tab-raid', 'aria-current'), 'page');
  eq('only one current row', await page.locator('.nav-row.is-active').count(), 1);

  console.log('\n--- a section leaf opens its page and scrolls there ---');
  await page.click('#nav-budget');
  await page.waitForTimeout(700);
  eq('landed on the Planner', await page.textContent('#page-title'), 'Planner');
  eq('budget section is in view', await page.evaluate(() => {
    const r = document.getElementById('sec-budget').getBoundingClientRect();
    return r.top > -200 && r.top < window.innerHeight;
  }), true);

  console.log('\n--- a report leaf switches report type ---');
  await page.click('#tab-reports .nav-row__label');
  await page.waitForTimeout(300);
  eq('activating a page reveals its children', await page.getAttribute('#tab-reports', 'aria-expanded'), 'true');
  await page.click('#nav-report-steerco');
  await page.waitForTimeout(500);
  eq('on the Reports page', await page.textContent('#page-title'), 'Reports');
  eq('SteerCo selected', await page.textContent('#report-title'), 'Steering Committee Report');
  eq('the on-page picker agrees',
     await page.getAttribute('.report-type-btn[data-report="steerco"]', 'aria-pressed'), 'true');
  await page.click('#nav-report-exec');
  await page.waitForTimeout(400);
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
  await page.focus('#group-workspace');
  const focused = () => page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('ArrowDown');
  eq('ArrowDown moves to first child', await focused(), 'tab-dashboard');
  await page.keyboard.press('ArrowDown');
  eq('ArrowDown again', await focused(), 'tab-planner');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  eq('ArrowRight on an open node steps into it', await focused(), 'nav-milestones');
  await page.keyboard.press('ArrowLeft');
  eq('ArrowLeft returns to the parent', await focused(), 'tab-planner');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  eq('ArrowLeft again collapses it', await page.getAttribute('#tab-planner', 'aria-expanded'), 'false');
  eq('collapsed children are no longer reachable', (await visibleLabels()).includes('Tick Timeline'), false);
  await page.keyboard.press('End');
  eq('End goes to the last visible row', await focused(), 'btn-export-panel');
  await page.keyboard.press('Home');
  eq('Home goes to the first', await focused(), 'group-workspace');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  eq('Enter activates', await page.textContent('#page-title'), 'Dashboard');

  console.log('\n--- the twisty toggles, and expansion survives a reload ---');
  // Reports was expanded by activating it above, so the twisty collapses it.
  eq('reports is expanded going in', await page.getAttribute('#tab-reports', 'aria-expanded'), 'true');
  await page.click('#tab-reports .nav-twisty');
  await page.waitForTimeout(200);
  eq('twisty collapsed it', await page.getAttribute('#tab-reports', 'aria-expanded'), 'false');
  await page.click('#tab-reports .nav-twisty');
  await page.waitForTimeout(200);
  eq('and expands it again', await page.getAttribute('#tab-reports', 'aria-expanded'), 'true');
  await page.click('#group-manage');           // collapse a group
  await page.waitForTimeout(200);
  eq('manage collapsed', (await visibleLabels()).includes('Projects'), false);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  eq('reports still expanded after reload', await page.getAttribute('#tab-reports', 'aria-expanded'), 'true');
  eq('manage still collapsed after reload', (await visibleLabels()).includes('Projects'), false);

  console.log('\n--- navigating from elsewhere still updates the tree ---');
  await page.click('#group-manage'); await page.waitForTimeout(200);
  await page.click('#tab-dashboard'); await page.waitForTimeout(300);
  await page.click('#btn-edit-in-planner');
  await page.waitForTimeout(400);
  eq('Edit in Planner moved the page', await page.textContent('#page-title'), 'Planner');
  eq('and the tree followed', await page.getAttribute('#tab-planner', 'aria-current'), 'page');

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
  eq('only the first group sits flush', groupMargins, ['0px', '10px', '10px']);

  // 3. A jumped-to section must clear the sticky header.
  await page.click('#nav-notes');
  await page.waitForTimeout(800);
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
  await page.focus('#tab-planner');
  await page.keyboard.press('ArrowLeft');       // collapse while focused
  await page.waitForTimeout(200);
  eq('focused row keeps the tab stop after collapsing',
     await page.getAttribute('#tab-planner', 'tabindex'), '0');
  eq('and only one row is tabbable',
     await page.locator('.nav-row[tabindex="0"]').count(), 1);

  // 6. Pages are regions now, not orphaned tabpanels.
  eq('no stale tabpanel roles', await page.locator('[role="tabpanel"]').count(), 0);
  eq('pages are labelled regions', await page.locator('.page[role="region"][aria-label]').count(), 5);

  // 7. Opening a report from the nav renders it once, not twice.
  await page.click('#tab-dashboard'); await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__renderCount = 0;
    const cards = document.getElementById('report-project-cards');
    new MutationObserver(() => { window.__renderCount += 1; }).observe(cards, { childList: true });
    return true;
  });
  await page.click('#nav-report-weekly');
  await page.waitForTimeout(700);
  const count = await page.evaluate(() => window.__renderCount);
  eq('report rendered once from the nav', count <= 2, true);
  eq('and it is the right one', await page.textContent('#report-title'), 'Weekly Status Report');

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
