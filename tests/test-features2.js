const { APP_URL, launch } = require('./harness');
const fs = require('fs');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.click('#tab-planner');
  await page.waitForTimeout(200);

  console.log('=== Search/filter: Planner Tasks ===');
  const beforeSearch = await page.locator('#tasks-body tr:not([hidden])').count();
  await page.fill('#task-search', 'campaign');
  await page.waitForTimeout(150);
  const afterSearch = await page.locator('#tasks-body tr:not([hidden])').count();
  console.log('Visible rows before/after searching "campaign":', beforeSearch, afterSearch);
  await page.fill('#task-search', '');
  await page.waitForTimeout(150);

  console.log('=== Search/filter: Dashboard Tasks ===');
  await page.click('#tab-dashboard');
  await page.waitForTimeout(200);
  const dashBefore = await page.locator('#dash-tasks-body tr:not([hidden])').count();
  await page.selectOption('#dash-status-filter', 'Complete');
  await page.waitForTimeout(150);
  const dashAfterStatus = await page.locator('#dash-tasks-body tr:not([hidden])').count();
  console.log('Dashboard rows before/after status=Complete filter:', dashBefore, dashAfterStatus);
  await page.selectOption('#dash-status-filter', '');
  await page.fill('#dash-task-search', 'jordan');
  await page.waitForTimeout(150);
  const dashAfterSearch = await page.locator('#dash-tasks-body tr:not([hidden])').count();
  console.log('Dashboard rows after searching "jordan":', dashAfterSearch);
  await page.fill('#dash-task-search', '');
  await page.waitForTimeout(150);

  await page.click('#tab-planner');
  await page.waitForTimeout(200);

  console.log('=== Drag reorder: Milestones ===');
  const firstBefore = await page.locator('#milestones-body tr:nth-child(1) input[data-field="text"]').inputValue();
  const secondBefore = await page.locator('#milestones-body tr:nth-child(2) input[data-field="text"]').inputValue();
  console.log('Order before:', firstBefore, '|', secondBefore);

  // Playwright's dragAndDrop() only reliably fires 'dragstart' in this
  // headless/containerized environment (native OS-level drag tracking for
  // dragover/drop isn't available without a real display server). Dispatch
  // the full HTML5 DnD event sequence directly to verify the app's own
  // dragstart/dragover/drop handlers (js/dragReorder.js) work correctly.
  const debugResult = await page.evaluate(() => {
    const eventLog = [];
    const tbody = document.getElementById('milestones-body');
    ['dragstart', 'dragover', 'drop', 'dragend'].forEach((type) => {
      tbody.addEventListener(type, () => eventLog.push(type));
    });

    const source = document.querySelector('#milestones-body tr:nth-child(1) .drag-handle');
    const target = document.querySelector('#milestones-body tr:nth-child(2)');
    const log = { sourceFound: !!source, targetFound: !!target, sourceRowId: source?.closest('[data-id]')?.dataset.id, targetRowId: target?.dataset.id };
    const dt = new DataTransfer();
    const fire = (type, el) => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      const result = el.dispatchEvent(ev);
      log[`${type}_dispatchResult`] = result;
      log[`${type}_defaultPrevented`] = ev.defaultPrevented;
    };
    fire('dragstart', source);
    fire('dragover', target);
    fire('drop', target);
    fire('dragend', source);
    log.eventLog = eventLog;
    return log;
  });
  console.log('Drag debug:', JSON.stringify(debugResult, null, 2));
  await page.waitForTimeout(300);

  const firstAfter = await page.locator('#milestones-body tr:nth-child(1) input[data-field="text"]').inputValue();
  const secondAfter = await page.locator('#milestones-body tr:nth-child(2) input[data-field="text"]').inputValue();
  console.log('Order after simulated drag:', firstAfter, '|', secondAfter);

  console.log('=== errors so far ===');
  console.log(errors.length ? errors.join('\n') : '(none)');

  await browser.close();
})();
