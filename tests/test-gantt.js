// The Gantt tab on the Plan page (js/gantt.js, js/ganttModel.js): lifecycle
// activities with their own dates, laid out from the lifecycle a project must
// choose when it is created, and edited without touching the tasks.

const { APP_URL, launch, createChecks, openSection, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const state = () => page.evaluate(async () => (await import('./js/state.js')).getState());
  const projectCount = () => page.evaluate(async () => (await import('./js/state.js')).listProjects().length);
  const rows = () => page.$$eval('#gantt-body .gantt-row', (els) => els.map((r) => ({
    id: r.dataset.id,
    chip: r.querySelector('.gantt-row__phase').textContent,
    name: r.querySelector('[data-field="name"]').value,
    start: r.querySelector('[data-field="start"]').value,
    end: r.querySelector('[data-field="end"]').value,
  })));
  const openGantt = async () => {
    await page.click('#tab-planner .nav-row__label');
    await page.waitForTimeout(300);
    await openSection(page, 'sec-gantt');
  };
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  const addDaysISO = (iso, n) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  console.log('\n--- an older project with no lifecycle is asked for one, not given one ---');
  await openGantt();
  eq('the tab sits next to the Timeline', await page.$$eval('#page-planner .page-tab', (els) => els.map((e) => e.textContent.replace(/\d+$/, ''))),
     ['Milestones', 'Timeline', 'Gantt', 'Budget & Notes']);
  eq('the starter project has no lifecycle', (await state()).methodology, '');
  eq('so the Gantt offers to choose one', await page.isVisible('#gantt-empty-choose'), true);
  await page.click('#sec-gantt [data-gantt="layout"]');
  eq('and will not lay out without one', await page.locator('#gantt-body .gantt-row').count(), 0);
  await page.selectOption('#gantt-lifecycle', 'project');
  await page.click('#sec-gantt [data-gantt="layout"]');
  await page.waitForTimeout(300);
  eq('choosing one lays out its five phases', (await rows()).map((r) => r.chip), ['I', 'II', 'III', 'IV', 'V']);
  eq('and it is the same field the Method card shows', await page.inputValue('#method-select'), 'project');

  console.log('\n--- a new project cannot be created without a lifecycle ---');
  const before = await projectCount();
  await page.click('#btn-projects');
  await page.waitForTimeout(300);
  await page.check('#template-blank');
  eq('a template with no lifecycle proposes none', await page.inputValue('#new-project-lifecycle'), '');
  await page.click('#btn-create-project');
  await page.waitForTimeout(300);
  eq('Create refuses', await projectCount(), before);
  eq('and says why', await page.isVisible('#new-project-lifecycle-error'), true);
  await page.check('#template-ml-model');
  eq('a template that follows one proposes it', await page.inputValue('#new-project-lifecycle'), 'crisp-dm');
  await page.selectOption('#new-project-lifecycle', 'sdlc');
  await page.check('#template-rag-assistant');
  eq('but a choice the person made survives switching template', await page.inputValue('#new-project-lifecycle'), 'sdlc');
  await page.check('#template-blank');
  await page.selectOption('#new-project-lifecycle', 'project');
  await page.fill('#new-project-name', 'Gantt project');
  await page.click('#btn-create-project');
  await page.waitForTimeout(700);
  eq('with one chosen, it is created', await projectCount(), before + 1);
  eq('and runs by the lifecycle chosen', (await state()).methodology, 'project');

  console.log('\n--- the new project arrives with its lifecycle laid out ---');
  await openGantt();
  let laid = await rows();
  eq('one activity per phase, named after it', laid.map((r) => r.name),
     ['Initiating', 'Planning', 'Executing', 'Monitoring & Controlling', 'Closing']);
  eq('phases follow one another', laid[1].start, addDaysISO(laid[0].end, 1));
  eq('Monitoring & Controlling runs alongside Executing', [laid[3].start, laid[3].end], [laid[2].start, laid[2].end]);
  eq('the header names the lifecycle', (await page.textContent('#gantt-method')).startsWith('Project Lifecycle'), true);

  console.log('\n--- dragging a bar moves the activity and nothing else ---');
  const tasksBefore = JSON.stringify((await state()).dashTasks);
  const planning = laid[1];
  const track = await page.locator(`#gantt-body .gantt-row[data-id="${planning.id}"] .gantt-row__track`).boundingBox();
  const days = await page.evaluate(async () => {
    const m = await import('./js/ganttModel.js');
    return m.chartWindow(m.orderedActivities((await import('./js/state.js')).getState())).days;
  });
  const perDay = track.width / days;
  const bar = await page.locator(`#gantt-body .gantt-row[data-id="${planning.id}"] .gantt-bar`).boundingBox();
  await clearToasts();
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + perDay * 3, bar.y + bar.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  let moved = (await rows()).find((r) => r.id === planning.id);
  eq('three days later, same length', [moved.start, moved.end], [addDaysISO(planning.start, 3), addDaysISO(planning.end, 3)]);
  eq('the tasks were not touched', JSON.stringify((await state()).dashTasks), tasksBefore);
  eq('and it can be undone', await page.locator('.toast .toast__action').count() > 0, true);
  await page.locator('.toast .toast__action').last().click();
  await page.waitForTimeout(300);
  moved = (await rows()).find((r) => r.id === planning.id);
  eq('undo puts it back', [moved.start, moved.end], [planning.start, planning.end]);

  console.log('\n--- dragging an end changes only that date ---');
  const handle = await page.locator(`#gantt-body .gantt-row[data-id="${planning.id}"] .gantt-bar__handle--end`).boundingBox();
  await clearToasts();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + perDay * 5, handle.y + handle.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  moved = (await rows()).find((r) => r.id === planning.id);
  eq('the end moved five days, the start stayed', [moved.start, moved.end], [planning.start, addDaysISO(planning.end, 5)]);

  console.log('\n--- the keyboard does what the mouse does ---');
  await page.locator(`#gantt-body .gantt-row[data-id="${planning.id}"] .gantt-bar`).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  moved = (await rows()).find((r) => r.id === planning.id);
  eq('→ moves it a day', moved.start, addDaysISO(planning.start, 1));
  eq('and focus stays on the bar', await page.evaluate(() => document.activeElement.classList.contains('gantt-bar')), true);

  console.log('\n--- typing works too ---');
  const row = `#gantt-body .gantt-row[data-id="${planning.id}"]`;
  await page.fill(`${row} [data-field="progress"]`, '40');
  await page.press(`${row} [data-field="progress"]`, 'Tab');
  await page.waitForTimeout(200);
  eq('progress fills the bar', await page.$eval(`${row} .gantt-bar__done`, (e) => e.style.width), '40%');
  await page.fill(`${row} [data-field="name"]`, 'Planning and sign-off');
  await page.waitForTimeout(200);
  eq('a renamed activity is saved as typed', (await state()).ganttActivities.find((a) => a.id === planning.id).name, 'Planning and sign-off');

  console.log('\n--- activities are added to a phase and removed with an undo ---');
  await page.selectOption('#gantt-add-phase', 'planning');
  await page.click('#sec-gantt [data-gantt="add"]');
  await page.waitForTimeout(300);
  laid = await rows();
  eq('a sixth row, inside Planning', laid.map((r) => r.chip), ['I', 'II', '', 'III', 'IV', 'V']);
  eq('with the cursor in its name', await page.evaluate(() => document.activeElement.dataset.field), 'name');
  await page.keyboard.type('Risk workshop');
  const added = laid[2];
  await clearToasts();
  await page.click(`#gantt-body .gantt-row[data-id="${added.id}"] [data-gantt="delete"]`);
  await page.waitForTimeout(300);
  eq('removed', (await rows()).length, 5);
  await page.locator('.toast .toast__action').last().click();
  await page.waitForTimeout(500);
  await openGantt();
  eq('and restored by Undo', (await rows()).some((r) => r.name === 'Risk workshop'), true);

  console.log('\n--- a task edit does not redraw the plan ---');
  const ganttBefore = JSON.stringify((await state()).ganttActivities);
  await page.evaluate(async () => {
    const { getState } = await import('./js/state.js');
    const { notifyProjectDataChanged } = await import('./js/taskModel.js');
    const t = getState().dashTasks[0];
    if (t) { t.end = '2030-01-01'; notifyProjectDataChanged('tasks'); }
  });
  eq('the Gantt is its own', JSON.stringify((await state()).ganttActivities), ganttBefore);

  console.log('\n--- changing lifecycle keeps the old activities, apart, until laid out again ---');
  const setMethod = async (id) => {
    await openSection(page, 'sec-milestones');
    await page.selectOption('#method-select', id);
    await page.waitForTimeout(200);
  };
  await setMethod('sdlc');
  await page.waitForTimeout(300);
  await openSection(page, 'sec-gantt');
  eq('activities from the old lifecycle are marked as not its phases',
     (await page.$$eval('#gantt-body .gantt-row.is-orphan', (els) => els.length)) > 0, true);
  await page.click('#sec-gantt [data-gantt="relayout"]');
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(400);
  eq('laid out again, the SDLC phases', (await rows()).map((r) => r.name),
     ['Requirements', 'Design', 'Implementation', 'Testing', 'Deployment', 'Maintenance']);

  console.log('\n--- a practice is capabilities, not a sequence ---');
  await setMethod('mlops');
  await openSection(page, 'sec-gantt');
  await page.click('#sec-gantt [data-gantt="relayout"]');
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(400);
  const practice = await rows();
  eq('every capability spans the same window', new Set(practice.map((r) => `${r.start}|${r.end}`)).size, 1);
  eq('and none is numbered', practice.every((r) => !/^[IVX]+$/.test(r.chip)), true);

  console.log('\n--- the general lifecycle is not an AI initiative ---');
  await setMethod('project');
  await openDestination(page, 'tab-ai-portfolio').catch(() => {});
  await page.waitForTimeout(300);
  eq('no project here counts as AI', await page.evaluate(async () => {
    const { METHODOLOGIES } = await import('./js/methodology.js');
    return METHODOLOGIES.find((m) => m.id === 'project').ai;
  }), false);

  console.log('\n--- everything survives a reload ---');
  const saved = JSON.stringify((await state()).ganttActivities);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  eq('the Gantt is as it was', JSON.stringify((await state()).ganttActivities), saved);

  console.log('\n--- phone ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.querySelector('#tab-planner .nav-row__label').click());
  await page.waitForTimeout(300);
  await openSection(page, 'sec-gantt');
  eq('no page overflow', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  eq('each bar fits the screen', await page.$$eval('#gantt-body .gantt-row__track', (els) => els.every((t) => t.getBoundingClientRect().right <= window.innerWidth)), true);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
