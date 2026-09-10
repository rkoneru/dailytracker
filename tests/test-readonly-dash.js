const { APP_URL, out, launch } = require('./harness');

// The app uses in-page dialogs now, not window.confirm, so a test drives them
// like any other UI: click the button, then the dialog's own action.
async function acceptDialog(page) {
  await page.waitForSelector('.dialog', { timeout: 5000 });
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(200);
}

async function fillDialog(page, value) {
  await page.waitForSelector('.dialog input', { timeout: 5000 });
  await page.fill('.dialog input', value);
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(200);
}

async function toastText(page) {
  await page.waitForSelector('.toast', { timeout: 5000 });
  return (await page.textContent('.toast__text')).trim();
}
let pass = 0, fail = 0;
const eq = (n, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${n}  ${g}`); }
  else { fail++; console.log(`  FAIL ${n}\n       got  ${g}\n       want ${w}`); }
};

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  console.log('\n--- Dashboard has no way to change data ---');
  eq('no data inputs/selects/contenteditable', await page.locator(
    '#page-dashboard input[data-field], #page-dashboard select[data-field], #page-dashboard [contenteditable="true"]').count(), 0);
  eq('no add/delete task controls', await page.locator(
    '#page-dashboard [data-action="add-dash-task"], #page-dashboard [data-action="delete-dash-task"]').count(), 0);
  eq('no baseline buttons on the dashboard', await page.locator('#page-dashboard #btn-set-baseline, #page-dashboard #btn-clear-baseline').count(), 0);
  eq('no draggable rows', await page.locator('#dash-tasks-body tr[draggable="true"]').count(), 0);
  eq('filters and search survive', await page.locator('#dash-task-search, #dash-status-filter, #dash-prio-filter').count(), 3);
  eq('Edit in Planner button present', await page.locator('#btn-edit-in-planner').isVisible(), true);

  console.log('\n--- and it still reports correctly ---');
  eq('project name shown', await page.textContent('#dash-project-name'), 'Social Media Marketing Campaign');
  eq('status badge shown', await page.textContent('#dash-status-badge'), 'ON TRACK');
  eq('budget shown', await page.textContent('#dash-budget-planned'), '25,000');
  eq('nine task rows', await page.locator('#dash-tasks-body tr').count(), 9);

  console.log('\n--- Edit in Planner jumps to the Planner ---');
  await page.click('#btn-edit-in-planner');
  await page.waitForTimeout(300);
  eq('landed on the Planner', await page.textContent('#page-title'), 'Planner');

  console.log('\n--- every moved field is editable on the Planner and reaches the Dashboard ---');
  await page.locator('#page-planner [data-field="dashStatus"]').fill('AT RISK');
  await page.waitForTimeout(350);
  eq('status badge followed', await page.textContent('#dash-status-badge'), 'AT RISK');

  await page.locator('#page-planner [data-field="dashDate"]').fill('2026-09-25');
  await page.waitForTimeout(350);
  eq('status date followed', await page.textContent('#dash-date-value'), '9/25/2026');

  await page.locator('#page-planner [data-field="budgetPlanned"]').fill('40000');
  await page.waitForTimeout(350);
  eq('budget planned followed', await page.textContent('#dash-budget-planned'), '40,000');

  await page.locator('#page-planner [data-field="projectName"]').fill('Renamed on Planner');
  await page.waitForTimeout(350);
  eq('project name followed', await page.textContent('#dash-project-name'), 'Renamed on Planner');

  console.log('\n--- status and comments now editable on the Planner ---');
  await page.selectOption('#tasks-body tr:first-child [data-field="status"]', 'On Hold');
  await page.waitForTimeout(350);
  eq('dashboard status cell followed',
     (await page.locator('#dash-tasks-body tr').first().locator('td').allTextContents())[6], 'On Hold');
  await page.locator('#tasks-body tr:first-child [data-field="comments"]').fill('note from planner');
  await page.waitForTimeout(350);
  eq('dashboard comments followed',
     (await page.locator('#dash-tasks-body tr').first().locator('td').allTextContents())[8], 'note from planner');

  console.log('\n--- baseline controls work from the Planner ---');
  await page.click('#btn-clear-baseline');
  await acceptDialog(page);
  await page.waitForTimeout(300);
  eq('planner note cleared', await page.textContent('#planner-baseline-note'), 'No baseline set — set one to start tracking slippage.');
  eq('dashboard note agrees', await page.textContent('#baseline-note'), 'No baseline set — set one to start tracking slippage.');
  await page.click('#btn-set-baseline');
  await page.waitForTimeout(400);
  eq('re-baselined to on plan', (await page.textContent('#planner-baseline-note')).startsWith('On plan against baseline'), true);
  eq('dashboard slip column reset',
     [...new Set(await page.locator('#dash-tasks-body .slip-chip').allTextContents())], ['On plan']);

  console.log('\n--- tick timeline ---');
  const ticked = () => page.locator('#tick-body tr:first-child .tick-day-cell').evaluateAll(
    c => c.filter(x => x.textContent.trim()).map(x => Number(x.dataset.day)));
  eq('seeded from template dates', await ticked(), [1, 2]);
  await page.click('#tick-body tr:first-child .tick-day-cell[data-day="9"]');
  await page.waitForTimeout(300);
  eq('clicking a day ticks it (non-contiguous)', await ticked(), [1, 2, 9]);
  await page.click('#tick-body tr:first-child .tick-day-cell[data-day="1"]');
  await page.waitForTimeout(300);
  eq('clicking again unticks', await ticked(), [2, 9]);

  await page.click('#tick-body tr:first-child .tick-type-btn');
  await page.waitForTimeout(300);
  eq('marker toggles to milestone',
     await page.textContent('#tick-body tr:first-child .tick-day-cell[data-day="2"]'), '◆');

  await page.click('#tick-body tr:first-child [data-action="fill-from-dates"]');
  await page.waitForTimeout(300);
  eq('fill from dates rebuilds the run', await ticked(), [1, 2]);

  console.log('\n--- tick rows follow the task list ---');
  const tickNames = () => page.locator('#tick-body .tick-row-label').allTextContents();
  await page.locator('#tasks-body tr:first-child [data-field="name"]').fill('TICK ROW RENAMED');
  await page.waitForTimeout(300);
  eq('rename reaches the tick row', (await tickNames())[0], 'TICK ROW RENAMED');
  const before = (await tickNames()).length;
  await page.click('#page-planner [data-action="add-task"]');
  await page.waitForTimeout(300);
  eq('added task gets a tick row', (await tickNames()).length, before + 1);
  await page.locator('#tasks-body tr').last().locator('[data-action="delete-task"]').click();
  await page.waitForTimeout(300);
  eq('deleting removes its tick row', (await tickNames()).length, before);

  console.log('\n--- anchor date re-labels the grid ---');
  await page.locator('#tick-start').fill('2026-10-01');
  await page.waitForTimeout(400);
  eq('day 1 header now October', await page.locator('.tick-day-head').first().getAttribute('title'), '10/1/2026');
  eq('ticks kept their day numbers', await ticked(), [1, 2]);

  console.log('\n--- everything survives a reload ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('#tab-planner'); await page.waitForTimeout(350);
  eq('ticks persisted', await ticked(), [1, 2]);
  eq('anchor persisted', await page.inputValue('#tick-start'), '2026-10-01');
  eq('renamed task persisted', (await tickNames())[0], 'TICK ROW RENAMED');
  eq('status persisted', await page.inputValue('#tasks-body tr:first-child [data-field="status"]'), 'On Hold');
  eq('budget persisted', await page.inputValue('#page-planner [data-field="budgetPlanned"]'), '40000');

  await page.screenshot({ path: out('planner-full.png'), fullPage: true });
  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
