// Flow metrics: lead time, cycle time, throughput, WIP, blocked time and
// predictability, read from the status history every save records.
//
// Pins that the history is written by the save, from any edit path; that a
// task seen for the first time adds nothing to lead or cycle time (its
// creation was never observed); and that each measure is grey rather than
// zero when nothing could answer it.

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
    const f = await import('/js/flow.js');
    const now = new Date(2026, 9, 1, 12, 0);
    const h = (...e) => e.map(([status, at, extra = {}]) => ({ status, at, blocked: false, ...extra }));
    const project = {
      dashTasks: [
        // Made here, started, finished on time.
        { id: 'a', status: 'Complete', baseEnd: '2026-09-25', statusHistory: h(['Not Started', '2026-09-20T09:00'], ['In Progress', '2026-09-22T09:00'], ['Complete', '2026-09-24T09:00']) },
        // Finished late, with two days on hold.
        { id: 'b', status: 'Complete', baseEnd: '2026-09-25', statusHistory: h(['Not Started', '2026-09-18T09:00'], ['In Progress', '2026-09-20T09:00'], ['On Hold', '2026-09-22T09:00', { blocked: true }], ['In Progress', '2026-09-24T09:00'], ['Complete', '2026-09-28T09:00']) },
        // Already in progress when first seen: its start was never observed.
        { id: 'c', status: 'Complete', baseEnd: '2026-09-30', statusHistory: h(['In Progress', '2026-09-15T09:00', { seen: true }], ['Complete', '2026-09-26T09:00']) },
        { id: 'd', status: 'In Progress', statusHistory: h(['Not Started', '2026-09-10T09:00'], ['In Progress', '2026-09-29T12:00']) },
      ],
    };
    const m = f.flowMetrics(project, now);
    const empty = f.flowMetrics({ dashTasks: [] }, now);
    const fresh = f.flowMetrics({ dashTasks: [{ id: 'x', status: 'Not Started', statusHistory: h(['Not Started', '2026-10-01T09:00', { seen: true }]) }] }, now);

    const rec = { dashTasks: [{ id: 'p', status: 'Complete' }, { id: 'q', status: 'Not Started', dependsOn: ['r'], createdAt: '2026-09-30T08:00' }, { id: 'r', status: 'In Progress' }] };
    const first = f.recordTaskFlow(rec, now);
    const again = f.recordTaskFlow(rec, now);
    rec.dashTasks[2].status = 'Complete';
    const moved = f.recordTaskFlow(rec, new Date(2026, 9, 2, 9, 0));
    return {
      lead: Math.round(m.leadTime * 10) / 10,
      cycle: Math.round(m.cycleTime * 10) / 10,
      counts: m.counts,
      wip: m.wip,
      blocked: Math.round(m.blockedShare * 100),
      predictability: m.predictability,
      throughput: Math.round(m.throughput * 100) / 100,
      empty: [empty.leadTime, empty.cycleTime, empty.throughput, empty.wip, empty.blockedShare, empty.predictability],
      fresh: [fresh.leadTime, fresh.throughput],
      rec: [first, again, moved, rec.dashTasks[0].statusHistory[0].seen, rec.dashTasks[1].statusHistory[0].at, rec.dashTasks[1].statusHistory.map((e) => e.blocked)],
    };
  });
  eq('lead time counts only tasks created where the app could see', [r.lead, r.counts.lead], [7, 2]);
  eq('cycle time counts only observed starts', [r.cycle, r.counts.cycle], [5, 2]);
  eq('work in progress is what is started and unfinished now', r.wip, 1);
  eq('blocked time is on-hold time over time in progress (2 of 23 days)', r.blocked, 9);
  eq('predictability: on time over done, last four weeks', Math.round(r.predictability * 100), 67);
  eq('throughput per week, over the three weeks actually watched', r.throughput, 0.99);
  eq('nothing to measure is null, never zero', r.empty, [null, null, null, null, null, null]);
  eq('a history begun today cannot give lead time or throughput', r.fresh, [null, null]);
  eq('the save writes a first entry, then only changes', r.rec.slice(0, 3), [3, 0, 2]);
  eq('an old task is marked as first seen; a new one keeps its creation time', [r.rec[3], r.rec[4]], [true, '2026-09-30T08:00']);
  eq('waiting on unfinished work is recorded as blocked, and unblocks when it finishes', r.rec[5], [true, false]);

  console.log('\n--- in the app ---');
  const before = await page.evaluate(async () => {
    const s = (await import('/js/state.js')).getState();
    return s.dashTasks.map((t) => t.statusHistory.length);
  });
  eq('the starter comes with history', before.every((n) => n >= 1), true);
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const t = st.getState().dashTasks.find((x) => x.status === 'Not Started');
    t.status = 'In Progress';
    st.scheduleSave();
    window.__moved = t.id;
  });
  await page.waitForTimeout(700);
  const after = await page.evaluate(async () => {
    const t = (await import('/js/state.js')).getState().dashTasks.find((x) => x.id === window.__moved);
    const last = t.statusHistory[t.statusHistory.length - 1];
    return [last.status, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(last.at)];
  });
  eq('any edit that moves a status records it on save', after, ['In Progress', true]);
  eq('a task made in the app knows when', await page.evaluate(async () => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test((await import('/js/taskModel.js')).newTask().createdAt)), true);

  await openDestination(page, 'nav-kpi-flow');
  const cards = await page.$$eval('#kpi-grid-flow .kpi-card', (e) => e.length);
  eq('six Flow cards on the KPI page', cards, 6);
  eq('each measured on the starter', await page.$$eval('#kpi-grid-flow .kpi-card.is-unmeasured', (e) => e.length), 0);
  eq('and the page says what they are not for', (await page.textContent('#sec-kpi-flow')).includes('never to rank or punish people'), true);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
