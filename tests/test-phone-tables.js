// Tables on phones, and names for the fields inside tables (js/tableLabels.js).
//
// Below 600px a table row is a card with each column's name printed beside
// its value, taken from the table's own header. And every field in a table
// has an accessible name built from its column and row, because a table cell
// has no <label> and a screen reader otherwise just says "combo box".

const { APP_URL, launch, createChecks, openSection } = require('./harness');

(async () => {
  const browser = await launch();
  const { eq, done } = createChecks();
  const errors = [];

  console.log('\n--- every field on every page has a name ---');
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  desk.on('pageerror', (e) => errors.push(e.message));
  await desk.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await desk.evaluate(() => localStorage.clear());
  await desk.reload({ waitUntil: 'networkidle' });
  await desk.waitForTimeout(800);
  const ids = await desk.$$eval('.nav-row[id^="tab-"]', (els) => els.map((e) => e.id));
  for (const id of ids) {
    await desk.evaluate((id) => document.querySelector(`#${id} .nav-row__label`)?.click(), id);
    await desk.waitForTimeout(120);
    for (const tab of await desk.$$eval('.page.is-active .page-tab', (els) => els.map((e) => e.id))) {
      await desk.evaluate((t) => document.getElementById(t).click(), tab);
      await desk.waitForTimeout(60);
    }
  }
  const unnamed = await desk.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
    .filter((c) => !(c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || c.title || c.labels?.length))
    .map((c) => `${c.closest('.page')?.id || 'shell'} ${c.id || c.dataset.field || c.className}`));
  eq('no field without a name', unnamed, []);

  await desk.click('#tab-tasks .nav-row__label');
  await desk.waitForTimeout(300);
  await openSection(desk, 'sec-task-list');
  eq('a table field says its column and its row',
     await desk.getAttribute('#tracker-body tr:first-child [data-field="prio"]', 'aria-label'), 'Priority, Campaign strategy & brief');
  eq('the name field is just the column',
     await desk.getAttribute('#tracker-body tr:first-child [data-field="name"]', 'aria-label'), 'Task');
  eq('on a desktop the table is still a table',
     await desk.$eval('#tracker-table', (t) => getComputedStyle(t).display), 'table');
  await desk.close();

  console.log('\n--- on a phone, rows are cards ---');
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // The sidebar is a closed drawer at this width, so pages are opened the way
  // its rows would open them rather than by clicking something off screen.
  const go = async (id) => {
    await page.evaluate((nav) => document.querySelector(`#${nav} .nav-row__label`).click(), id);
    await page.waitForTimeout(400);
  };
  const card = async (rowSelector) => page.$eval(rowSelector, (tr) => ({
    display: getComputedStyle(tr).display,
    labels: [...tr.cells].filter((c) => c.dataset.label).slice(0, 3).map((c) => c.dataset.label),
    fits: tr.getBoundingClientRect().right <= window.innerWidth,
  }));

  await go('tab-tasks');
  await openSection(page, 'sec-task-list');
  eq('a task is a card', (await card('#tracker-body tr:first-child')).display, 'block');
  eq('each line says which column it is', (await card('#tracker-body tr:first-child')).labels, ['ID', 'Task', 'Owner']);
  eq('and the card fits the screen', (await card('#tracker-body tr:first-child')).fits, true);
  eq('the task name is not cut to three letters',
     await page.$eval('#tracker-body tr:first-child [data-field="name"]', (i) => i.getBoundingClientRect().width > 150), true);

  await go('tab-raid');
  // #raid-table pins a 1400px desktop width by id; the phone rule must win.
  eq('the risk log fits too', (await card('#raid-body tr:first-child')).fits, true);

  await go('tab-planner');
  await openSection(page, 'sec-milestones');
  // Phase is a header column switched off for a project with no method; the
  // labels must not shift one place along because of it.
  eq('a hidden column does not shift the labels',
     await page.$eval('#milestones-body tr:first-child .col-check', (td) => td.dataset.label), 'Done');

  await go('tab-planner');
  await openSection(page, 'sec-ticks');
  eq('the Edit Timeline stays a grid', await page.$eval('#tick-table', (t) => getComputedStyle(t).display), 'table');

  eq('no page scrolls sideways',
     await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  if (errors.length) process.exitCode = 1;
  await browser.close();
  done();
})();
