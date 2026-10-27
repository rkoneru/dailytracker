// Portfolio at a glance: project counts, tasks by status and delivery per
// month across every project.
//
// Pins that a project's stage is read off its tasks and due date; that an
// open task past its end counts as overdue, not as its status; and that a
// month before any status history is unmeasured (null), not zero.

const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  console.log('\n--- the rules ---');
  const r = await page.evaluate(async () => {
    const d = await import('/js/portfolioDash.js');
    const today = new Date(2026, 9, 15);
    const projects = [
      { dueDate: '2026-12-01', dashTasks: [{ status: 'Complete', statusHistory: [{ status: 'In Progress', at: '2026-08-02T09:00' }, { status: 'Complete', at: '2026-09-10T09:00' }] }, { status: 'Complete', statusHistory: [{ status: 'Complete', at: '2026-08-01T09:00', seen: true }] }] },
      { dueDate: '2026-10-01', dashTasks: [{ status: 'In Progress', end: '2026-09-30' }] },
      { dueDate: '2026-12-01', dashTasks: [{ status: 'In Progress', end: '2026-11-30' }, { status: 'Complete', statusHistory: [{ status: 'Complete', at: '2026-10-03T10:00' }] }] },
      { dueDate: '', dashTasks: [{ status: 'Not Started' }] },
    ];
    const o = d.portfolioOverview(projects, today);
    return {
      stages: o.stages,
      completion: o.completion,
      tasks: Object.fromEntries(o.tasks.map((t) => [t.id, t.count])),
      delivered: o.delivered.map((m) => [m.month, m.count]),
      none: d.portfolioOverview([], today).completion,
    };
  });
  eq('stages: complete, overdue, in progress, not started', r.stages, { complete: 1, 'in-progress': 1, 'not-started': 1, overdue: 1 });
  eq('completion across every task', r.completion, 50);
  eq('an open task past its end is overdue', r.tasks, { Complete: 3, 'In Progress': 1, 'Not Started': 1, 'On Hold': 0, overdue: 1 });
  eq('delivered per month from history; before it, unmeasured', r.delivered, [
    ['2026-05', null], ['2026-06', null], ['2026-07', null], ['2026-08', 0], ['2026-09', 1], ['2026-10', 1],
  ]);
  eq('no tasks is no completion figure', r.none, null);

  console.log('\n--- on the page ---');
  await openDestination(page, 'tab-portfolio');
  await page.waitForTimeout(400);
  eq('the glance sits at the top of All projects', await page.isVisible('#portfolio-overview [data-glance="projects"]'), true);
  eq('tasks by status add up to the starter’s tasks', await page.$$eval('#portfolio-overview .pf-legend strong', (e) => e.reduce((n, x) => n + Number(x.textContent), 0)), 9);
  eq('six months, the early ones unmeasured', await page.$$eval('#portfolio-overview .pf-month', (e) => [e.length, e.filter((x) => x.classList.contains('is-unmeasured')).length > 0]), [6, true]);
  eq('the table’s progress bars keep their own style', await page.$eval('#portfolio-body .pf-bar', (b) => getComputedStyle(b).display !== 'grid'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
