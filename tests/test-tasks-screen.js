const { APP_URL, launch, createChecks, openSection } = require('./harness');
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

  const names = () => page.$$eval('#tracker-body [data-field="name"]', (els) => els.map((e) => e.value));
  const cardsIn = (col) => page.$$eval(`.board-col__list[data-column="${col}"] .board-card__title`, (els) => els.map((e) => e.textContent));
  const counts = () => page.$$eval('.board-col__count', (els) => els.map((e) => Number(e.textContent)));

  await page.click('#tab-tasks');
  await page.waitForTimeout(600);

  console.log('\n--- the screen matches the reference structure ---');
  eq('five tallies', await page.locator('#page-tasks .tally').count(), 5);
  eq('tally labels', await page.$$eval('#page-tasks .tally__label', (els) => els.map((e) => e.textContent)),
     ['Total tasks', 'Completed', 'In progress', 'On hold', 'Overdue']);
  // Start and Comments are beyond the reference layout, kept because the
  // Planner is read-only now and nothing else edits them. Waits for, Est.,
  // Spent and Checks came later, with dependencies, effort and checklists;
  // Rework came with the KPI set, which cannot report rework without it.
  eq('tracker columns', await page.$$eval('#tracker-table thead th', (els) => els.map((e) => e.textContent).filter(Boolean)),
     ['ID', 'Task', 'Owner', 'Priority', 'Status', 'Start', 'Due date', 'Slip',
      'Waits for', 'Est.', 'Spent', 'Rework', 'Progress', 'Checks', 'Comments']);
  eq('five board columns', await page.$$eval('.board-col__label', (els) => els.map((e) => e.textContent)),
     ['High Priority', 'Medium Priority', 'Low Priority', 'On Hold', 'Completed']);
  eq('ids are stable refs', (await page.$$eval('#tracker-body .col-ref', (els) => els.map((e) => e.textContent))).slice(0, 3),
     ['T-101', 'T-102', 'T-103']);
  eq('every column offers Add Task', await page.locator('.board-col__add').count(), 5);

  console.log('\n--- tallies count what they say ---');
  const tallies = await page.$$eval('#page-tasks .tally__value', (els) => els.map((e) => Number(e.textContent)));
  eq('total matches the row count', tallies[0], await page.locator('#tracker-body tr').count());
  eq('completed + in progress + on hold do not exceed total', tallies[1] + tallies[2] + tallies[3] <= tallies[0], true);

  console.log('\n--- the tracker is editable ---');
  await page.locator('#tracker-body tr').first().locator('[data-field="name"]').fill('RENAMED ON TRACKER');
  await page.waitForTimeout(400);
  eq('name changed', (await names())[0], 'RENAMED ON TRACKER');
  eq('and the board card followed', (await cardsIn('Complete'))[0], 'RENAMED ON TRACKER');

  await page.locator('#tracker-body tr').first().locator('[data-field="progress"]').fill('40');
  await page.waitForTimeout(400);
  eq('progress accepts a value', await page.evaluate(async () =>
    (await import('/js/state.js')).getState().dashTasks[0].progress), 40);

  await page.locator('#tracker-body tr').first().locator('[data-field="progress"]').fill('150');
  await page.waitForTimeout(400);
  eq('and clamps out-of-range input', await page.evaluate(async () =>
    (await import('/js/state.js')).getState().dashTasks[0].progress), 100);

  console.log('\n--- status drives progress at the two ends that are defined ---');
  await page.selectOption('#tracker-body tr:nth-child(2) [data-field="status"]', 'Not Started');
  await page.waitForTimeout(400);
  eq('Not Started means 0%', await page.evaluate(async () =>
    (await import('/js/state.js')).getState().dashTasks[1].progress), 0);
  await page.selectOption('#tracker-body tr:nth-child(2) [data-field="status"]', 'In Progress');
  await page.waitForTimeout(400);
  eq('an in-flight status does not invent a number', await page.evaluate(async () =>
    (await import('/js/state.js')).getState().dashTasks[1].progress), 0);
  await page.selectOption('#tracker-body tr:nth-child(2) [data-field="status"]', 'Complete');
  await page.waitForTimeout(400);
  eq('Complete means 100%', await page.evaluate(async () =>
    (await import('/js/state.js')).getState().dashTasks[1].progress), 100);

  console.log('\n--- the board groups by status first, then priority ---');
  const before = await counts();
  await page.selectOption('#tracker-body tr:nth-child(3) [data-field="prio"]', 'Low');
  await page.waitForTimeout(500);
  const after = await counts();
  eq('a card moved between priority columns', after[2], before[2] + 1);
  await page.selectOption('#tracker-body tr:nth-child(3) [data-field="status"]', 'On Hold');
  await page.waitForTimeout(500);
  const held = await counts();
  eq('on hold wins over priority', held[3], after[3] + 1);
  eq('and it left the Low column', held[2], after[2] - 1);

  console.log('\n--- adding from a board column presets that column ---');
  const rowsBefore = await page.locator('#tracker-body tr').count();
  await openSection(page, 'sec-task-board');
  await page.click('.board-col--low .board-col__add');
  await page.waitForTimeout(500);
  eq('a row was added', await page.locator('#tracker-body tr').count(), rowsBefore + 1);
  eq('with that column\'s priority', await page.evaluate(async () => {
    const t = (await import('/js/state.js')).getState().dashTasks;
    return t[t.length - 1].prio;
  }), 'Low');
  await page.click('.board-col--hold .board-col__add');
  await page.waitForTimeout(500);
  eq('and a status column presets status', await page.evaluate(async () => {
    const t = (await import('/js/state.js')).getState().dashTasks;
    return t[t.length - 1].status;
  }), 'On Hold');

  console.log('\n--- deleting goes to Trash, like everywhere else ---');
  await openSection(page, 'sec-task-list');
  const countBefore = await page.locator('#tracker-body tr').count();
  await page.locator('#tracker-body tr').last().locator('[data-action="delete-task-row"]').click();
  await page.waitForTimeout(500);
  eq('row removed', await page.locator('#tracker-body tr').count(), countBefore - 1);
  eq('and undo is offered', await page.locator('.toast__action').count(), 1);
  await page.click('.toast__action');
  await page.waitForTimeout(500);
  eq('undo restores it', await page.locator('#tracker-body tr').count(), countBefore);

  console.log('\n--- filters ---');
  await page.fill('#tasks-search', 'RENAMED');
  await page.waitForTimeout(300);
  eq('search narrows the table', await page.locator('#tracker-body tr:not([hidden])').count(), 1);
  await page.fill('#tasks-search', 'zzzz');
  await page.waitForTimeout(300);
  eq('and says so when nothing matches', await page.locator('#tracker-empty').isVisible(), true);
  await page.fill('#tasks-search', '');
  await page.waitForTimeout(300);

  console.log('\n--- the Planner shows the same tasks, read-only ---');
  await page.click('#tab-planner');
  await page.waitForTimeout(600);
  // The Planner's copy of the task table and its Gantt were the Tracker and
  // the Dashboard's timeline redrawn; the tick grid is the view only it has.
  eq('no second task table', await page.locator('#tasks-body').count(), 0);
  eq('no second gantt', await page.locator('#planner-timeline').count(), 0);
  eq('no tick controls', await page.locator('#tick-body button, #tick-body input').count(), 0);
  eq('but the tick grid shows the edit made on the Tasks screen',
     (await page.textContent('#tick-body')).includes('RENAMED ON TRACKER'), true);
  eq('and offers a way to the tracker', await page.locator('#page-planner [data-action="open-tasks"]').count(), 1);

  console.log('\n--- Planner keeps what only it edits ---');
  eq('milestones still editable', await page.locator('#milestones-body input').count() > 0, true);
  eq('notes still editable', await page.locator('#notes-list input').count() > 0, true);
  eq('budget still editable', await page.locator('#page-planner [data-field="budgetPlanned"]').count(), 1);
  eq('baseline controls still there', await page.locator('#btn-set-baseline').count(), 1);

  await page.locator('#milestones-body tr').first().locator('[data-field="text"]').fill('MILESTONE STILL EDITABLE');
  await page.waitForTimeout(400);
  eq('and editing a milestone works', await page.evaluate(async () =>
    (await import('/js/state.js')).getState().milestones[0].text), 'MILESTONE STILL EDITABLE');

  console.log('\n--- the Dashboard links out rather than carrying the table ---');
  await page.click('#tab-dashboard');
  await page.waitForTimeout(600);
  eq('no task table', await page.locator('#dash-tasks-body').count(), 0);
  eq('no task inputs at all', await page.locator('#page-dashboard input[data-field], #page-dashboard select[data-field]').count(), 0);
  eq('one attention list stands in', await page.locator('#upcoming-deadlines li').count() > 0, true);
  await page.click('#btn-open-tasks');
  await page.waitForTimeout(500);
  eq('the button opens the Tasks screen', await page.textContent('#page-title'), 'Tasks');

  console.log('\n--- it survives a reload ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('#tab-tasks');
  await page.waitForTimeout(600);
  eq('edits persisted', (await names())[0], 'RENAMED ON TRACKER');
  eq('progress persisted', await page.evaluate(async () =>
    (await import('/js/state.js')).getState().dashTasks[0].progress), 100);

  await page.setViewportSize({ width: 400, height: 900 });
  await page.waitForTimeout(400);
  eq('no page overflow at phone width',
     await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await openSection(page, 'sec-task-board');
  eq('the board scrolls inside itself instead',
     await page.evaluate(() => {
       const b = document.getElementById('priority-board');
       return b.scrollWidth > b.clientWidth;
     }), true);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
