const { APP_URL, launch } = require('./harness');
let pass = 0, fail = 0;
const eq = (n, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${n}  ${g}`); }
  else { fail++; console.log(`  FAIL ${n}\n       got  ${g}\n       want ${w}`); }
};

// A store in the shape the app used *before* the task lists were unified.
const legacy = {
  activeProjectId: 'p1',
  projects: {
    p1: {
      id: 'p1', projectName: 'Legacy project', updatedAt: 1000, dueDate: '2026-10-01',
      objective: 'x', reward: 'y', dashDate: '2026-09-08', dashStatus: 'ON TRACK',
      budgetPlanned: 100, budgetActual: 50,
      notes: [{ id: 'n1', text: 'a note' }],
      milestones: [{ id: 'm1', text: 'MS one', progress: 2, due: '2026-09-20', done: false }],
      // Overlaps dashTasks by name on one row, is unique on two, and has a blank row.
      tasks: [
        { id: 't1', task: 'Shared task', start: '', end: '2026-09-15', prio: 'high', done: false },
        { id: 't2', task: 'ONLY IN PLANNER', start: '2026-09-03', end: '2026-09-06', prio: 'Low', done: true },
        { id: 't3', task: 'ALSO ONLY IN PLANNER', start: '', end: '', prio: 'nonsense', done: false },
        { id: 't4', task: '   ', start: '', end: '', prio: '', done: false },
      ],
      gantt: [
        { id: 'g1', name: 'Shared task', type: 'check', cells: [1, 2, 3] },
        { id: 'g2', name: 'ONLY IN TIMELINE', type: 'diamond', cells: [7] },
        { id: 'g3', name: '', type: 'check', cells: [] },
      ],
      dashTasks: [
        { id: 'd1', name: 'Shared task', assigned: 'Ann', start: '2026-09-01', end: '', status: 'In Progress', prio: 'High', comments: 'c' },
        { id: 'd2', name: 'Dashboard only', assigned: 'Bo', start: '2026-09-02', end: '2026-09-09', status: 'Complete', prio: 'Medium', comments: '' },
      ],
      raid: [],
    },
  },
};

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate((data) => {
    localStorage.clear();
    localStorage.setItem('projectPlannerStore_v2', JSON.stringify(data));
  }, legacy);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const state = await page.evaluate(async () => (await import('/js/state.js')).getState());

  console.log('\n--- nothing is dropped ---');
  const names = state.dashTasks.map(t => t.name);
  console.log('   unified list:', JSON.stringify(names));
  eq('planner-only task kept', names.includes('ONLY IN PLANNER'), true);
  eq('undated planner-only task kept', names.includes('ALSO ONLY IN PLANNER'), true);
  eq('timeline-only row kept', names.includes('ONLY IN TIMELINE'), true);
  eq('dashboard-only task kept', names.includes('Dashboard only'), true);
  eq('blank rows dropped', names.filter(n => !n.trim()).length, 0);

  console.log('\n--- overlapping rows merge instead of duplicating ---');
  eq('"Shared task" appears once', names.filter(n => n === 'Shared task').length, 1);
  const shared = state.dashTasks.find(t => t.name === 'Shared task');
  eq('richer dashboard fields win', [shared.assigned, shared.status, shared.comments], ['Ann', 'In Progress', 'c']);
  eq('missing end date filled in from the planner row', shared.end, '2026-09-15');
  eq('existing start date not overwritten', shared.start, '2026-09-01');

  console.log('\n--- field conversion ---');
  const onlyPlanner = state.dashTasks.find(t => t.name === 'ONLY IN PLANNER');
  eq('done:true became status Complete', onlyPlanner.status, 'Complete');
  eq('priority case normalised', state.dashTasks.find(t => t.name === 'Shared task').prio, 'High');
  eq('unknown priority falls back to Medium', state.dashTasks.find(t => t.name === 'ALSO ONLY IN PLANNER').prio, 'Medium');
  eq('folded rows have baseline fields', 'baseStart' in onlyPlanner && 'baseEnd' in onlyPlanner, true);
  eq('legacy arrays removed', ['tasks', 'gantt'].filter(k => k in state), []);

  console.log('\n--- other data untouched ---');
  eq('milestones intact', state.milestones.map(m => m.text), ['MS one']);
  eq('notes intact', state.notes.map(n => n.text), ['a note']);
  eq('project name intact', state.projectName, 'Legacy project');
  eq('budget intact', [state.budgetPlanned, state.budgetActual], [100, 50]);

  console.log('\n--- the migrated store renders on every page ---');
  for (const [tab, sel] of [['#tab-planner', '#tasks-body tr'], ['#tab-dashboard', '#dash-tasks-body tr'], ['#tab-raid', '#raid-body'], ['#tab-reports', '#report-project-cards']]) {
    await page.click(tab); await page.waitForTimeout(350);
    const n = await page.locator(sel).count();
    console.log(`   ${tab} -> ${sel}: ${n}`);
  }
  await page.click('#tab-planner'); await page.waitForTimeout(300);
  eq('planner table shows every migrated task',
     await page.locator('#tasks-body tr').count(), state.dashTasks.length);
  eq('dashboard table shows the same count',
     await page.locator('#dash-tasks-body tr').count(), state.dashTasks.length);

  console.log('\n--- migration is idempotent across reloads ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const after = await page.evaluate(async () => (await import('/js/state.js')).getState().dashTasks.map(t => t.name));
  eq('second load produces the same list', after, names);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
