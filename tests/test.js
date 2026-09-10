const { APP_URL, out, launch } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  console.log('--- Planner screenshot ---');
  await page.screenshot({ path: out('planner.png'), fullPage: true });

  // Basic sanity checks
  const projectName = await page.locator('#page-planner h1.editable').textContent();
  console.log('Project name:', projectName);

  // Switch to dashboard
  await page.click('#tab-dashboard');
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('dashboard.png'), fullPage: true });

  const pct = await page.locator('#dash-pct-complete').textContent();
  console.log('% Complete:', pct);

  // Edit a dash task status and check pie/gantt/summary update
  // Status is edited on the Planner now; the Dashboard only reports it.
  await page.click('#tab-planner'); await page.waitForTimeout(250);
  await page.selectOption('#tasks-body tr:nth-child(3) select.status-select', 'Complete');
  await page.waitForTimeout(300);
  await page.click('#tab-dashboard'); await page.waitForTimeout(250);
  await page.waitForTimeout(300);
  const pct2 = await page.locator('#dash-pct-complete').textContent();
  console.log('% Complete after marking one more complete:', pct2);

  // Test add milestone on planner
  await page.click('#tab-planner');
  await page.waitForTimeout(200);
  const milestonesBefore = await page.locator('#milestones-body tr').count();
  await page.click('[data-action="add-milestone"]');
  const milestonesAfter = await page.locator('#milestones-body tr').count();
  console.log('Milestones before/after add:', milestonesBefore, milestonesAfter);

  // Test progress segment click
  await page.click('#milestones-body tr:first-child .progress-segment:nth-child(3)');
  await page.waitForTimeout(100);
  const filledCount = await page.locator('#milestones-body tr:first-child .progress-segment.is-filled').count();
  console.log('Filled segments after clicking 3rd:', filledCount);

  // The hand-ticked 30-day grid was replaced by a Timeline derived from each
  // task's start/end dates, so there are no day cells to toggle any more.
  const timelineRows = await page.locator('#planner-timeline .gantt-chart__row').count();
  const firstBar = await page.locator('#planner-timeline .gantt-chart__bar').first().getAttribute('title');
  console.log('Planner timeline rows:', timelineRows);
  console.log('First timeline bar:', firstBar);

  // Test project name sync between pages
  await page.locator('#page-planner h1.editable').click();
  await page.keyboard.type(' TEST');
  await page.waitForTimeout(600);
  await page.click('#tab-dashboard');
  const dashTitle = await page.locator('#dash-project-name').textContent();
  console.log('Dashboard title after editing planner project name:', dashTitle);

  // Check save indicator went through saving->saved
  const indicatorText = await page.locator('#save-indicator').textContent();
  console.log('Save indicator:', indicatorText);

  // Reload and verify persistence
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const projectNameAfterReload = await page.locator('#page-planner h1.editable').textContent();
  console.log('Project name after reload (should include TEST):', projectNameAfterReload);

  // Check localStorage key exists
  const stored = await page.evaluate(() => localStorage.getItem('projectPlannerData_v1') !== null);
  console.log('localStorage has data:', stored);

  // Check service worker registered
  const swReady = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length));
  console.log('Service worker registrations:', swReady);

  console.log('--- Console/page errors ---');
  console.log(errors.length ? errors.join('\n') : '(none)');

  await browser.close();
})();
