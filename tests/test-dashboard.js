const { APP_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const tile = (id) => page.evaluate((i) => {
    const node = document.getElementById(i);
    return {
      value: node.querySelector('.kpi__value').textContent,
      sub: node.querySelector('.kpi__sub').textContent,
      tone: ['is-good', 'is-warn', 'is-bad', 'is-idle'].find((c) => node.classList.contains(c)),
      goto: node.dataset.goto,
    };
  }, id);

  console.log('\n--- the Dashboard reports, it does not repeat other pages ---');
  // Task counts, the status/priority split and the RAID breakdown all have a
  // page that owns them. None of them is duplicated here.
  eq('no status pie', await page.locator('#status-pie').count(), 0);
  eq('no priority pie', await page.locator('#priority-pie').count(), 0);
  eq('no RAID bar chart', await page.locator('#raid-chart').count(), 0);
  eq('no task table', await page.locator('#dash-tasks-body').count(), 0);
  eq('no kanban buckets', await page.locator('.kanban-summary').count(), 0);
  eq('one list of work that wants looking at',
     await page.locator('#page-dashboard .deadline-list').count(), 1);

  console.log('\n--- the KPI row is project health, and each tile is a way in ---');
  eq('labels', await page.$$eval('#page-dashboard .kpi__label', (els) => els.map((e) => e.textContent)),
     ['Status', 'Schedule', 'Risk', 'Budget']);

  const status = await tile('kpi-status');
  eq('status is the one the Planner set', status.value, 'ON TRACK');
  eq('and carries its date', status.sub, 'as at 2026-09-08');
  eq('and reads as good', status.tone, 'is-good');
  eq('and links to the page that sets it', status.goto, 'tab-planner');

  const schedule = await tile('kpi-schedule');
  eq('schedule reports the worst slip', schedule.value, '+7d');
  eq('with how many are behind', schedule.sub, '2 tasks behind baseline');
  eq('and reads as a warning', schedule.tone, 'is-warn');

  const risk = await tile('kpi-risk');
  // Three, not four: dependencies left the RAID log for their own register
  // directly below it, so the sample project's one RAID dependency is no
  // longer counted among the RAID items.
  eq('risk counts open RAID items', risk.value, '3');
  eq('and links to the RAID log', risk.goto, 'tab-raid');

  const budget = await tile('kpi-budget');
  eq('budget reports the burn', budget.value, '74%');
  eq('and spells it out', budget.sub, '18,500 of 25,000');

  console.log('\n--- the tiles actually navigate ---');
  await page.click('#kpi-risk');
  await page.waitForTimeout(400);
  eq('the Risk tile opens the RAID log',
     await page.evaluate(() => document.querySelector('.page.is-active').id), 'page-raid');
  await page.click('#tab-dashboard');
  await page.waitForTimeout(400);

  console.log('\n--- tone tracks the data, it is not decoration ---');
  await page.click('#tab-planner');
  await page.waitForTimeout(400);
  await page.click('#btn-clear-baseline');
  await page.waitForSelector('.dialog');
  await page.click('.dialog .btn-danger');
  await page.waitForTimeout(500);
  await page.click('#tab-dashboard');
  await page.waitForTimeout(500);
  const noBaseline = await tile('kpi-schedule');
  eq('no baseline reads as idle, not good', noBaseline.tone, 'is-idle');
  eq('and says so', noBaseline.sub, 'No baseline set');

  console.log('\n--- the attention list follows the task list ---');
  const overdueBefore = await page.$$eval('#upcoming-deadlines .deadline-list__when--soon',
    (els) => els.map((e) => e.textContent));
  eq('overdue work is called out', overdueBefore.some((t) => t.includes('overdue')), true);

  await page.click('#tab-tasks');
  await page.waitForTimeout(500);
  const rows = await page.locator('#tracker-body tr').count();
  for (let i = 0; i < rows; i += 1) {
    await page.selectOption(`#tracker-body tr:nth-child(${i + 1}) [data-field="status"]`, 'Complete');
    await page.waitForTimeout(120);
  }
  await page.click('#tab-dashboard');
  await page.waitForTimeout(600);
  // Milestones have their own due dates and are not finished by finishing
  // tasks, so what should go quiet is the task half of the list.
  eq('no task is left wanting attention',
     (await page.$$eval('#upcoming-deadlines .deadline-list__meta', (els) => els.map((e) => e.textContent)))
       .some((t) => t.startsWith('Task')), false);
  eq('and the headline percentage agrees', await page.textContent('#dash-pct-complete'), '100%');

  console.log('\n--- other projects means other ---');
  eq('the current project is not listed as an "other" project',
     (await page.textContent('#active-projects-list')).trim(), 'This is your only project.');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-event');
  await page.click('#btn-create-project');
  await page.waitForTimeout(700);
  await page.click('#tab-dashboard');
  await page.waitForTimeout(600);
  const listed = await page.$$eval('#active-projects-list .active-projects-list__name', (els) => els.map((e) => e.textContent));
  eq('exactly one other project now', listed.length, 1);
  eq('and it is not the one on screen',
     listed.includes(await page.textContent('#dash-project-name')), false);

  console.log('\n--- layout ---');
  // Cards in a row should size to their own content, not stretch to the
  // tallest sibling — that stretching was most of the old dead space.
  eq('cards in a row size to their own content', await page.evaluate(() => {
    const row = document.querySelector('.dash-row--2');
    return getComputedStyle(row).alignItems;
  }), 'start');

  eq('no page overflow at phone width', await page.evaluate(async () => {
    window.resizeTo(400, 900);
    return document.documentElement.scrollWidth > window.innerWidth + 1;
  }), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
