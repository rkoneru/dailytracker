// Mapping dependencies on the Gantt: the critical path, each activity's
// float, handoffs between owners, and one owner booked twice at once.
//
// Pins that the critical path is the chain of linked activities with no
// float that reaches the plan's last day; that float is the days an activity
// can slip before it pushes what follows it (or the end); that an owner
// change along a link is a handoff; and that overlapping activities with the
// same owner are named.

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
    const m = await import('/js/ganttModel.js');
    const project = {
      ganttActivities: [
        { id: 'design', name: 'Design', owner: 'Ana', start: '2026-10-01', end: '2026-10-02' },
        { id: 'content', name: 'Content', owner: 'Ben', start: '2026-10-03', end: '2026-10-05', after: 'design' },
        { id: 'dev', name: 'Development', owner: 'Cy', start: '2026-10-06', end: '2026-10-11', after: 'content' },
        { id: 'test', name: 'Testing', owner: 'Cy', start: '2026-10-12', end: '2026-10-14', after: 'dev' },
        { id: 'launch', name: 'Launch', owner: 'Ana', start: '2026-10-15', end: '2026-10-15', after: 'test' },
        { id: 'docs', name: 'Docs', owner: 'Ben', start: '2026-10-06', end: '2026-10-08', after: 'content' },
        { id: 'comms', name: 'Comms', owner: 'Cy', start: '2026-10-09', end: '2026-10-10' },
      ],
    };
    const cp = m.criticalPath(project);
    const own = m.ownershipFindings(project);
    return {
      critical: cp.critical, days: cp.days, end: cp.end,
      float: Object.fromEntries([...cp.float].map(([k, v]) => [k, v])),
      handoffs: own.handoffs.map((h) => `${h.from}>${h.to}:${h.toName}`),
      clashes: own.clashes.map((c) => [c.owner, c.a, c.b, c.days]),
      empty: m.criticalPath({ ganttActivities: [] }).critical,
    };
  });
  eq('the critical path is the linked chain to the last day', r.critical, ['design', 'content', 'dev', 'test', 'launch']);
  eq('fifteen days, ending the fifteenth', [r.days, r.end], [15, '2026-10-15']);
  eq('float: none on the path, days elsewhere', r.float, { design: 0, content: 0, dev: 0, test: 0, launch: 0, docs: 7, comms: 5 });
  eq('owner changes along a link are handoffs; the same owner is not', r.handoffs, ['Ana>Ben:Content', 'Ben>Cy:Development', 'Cy>Ana:Launch']);
  eq('one owner on two activities at once is named', r.clashes, [['Cy', 'Development', 'Comms', 2]]);
  eq('no activities, no path', r.empty, []);

  console.log('\n--- on the Gantt ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const gm = await import('/js/ganttModel.js');
    const s = st.getState();
    s.methodology = 'project';
    s.ganttActivities = gm.layOut(s, undefined, st.uid);
    s.ganttActivities[0].owner = 'Priya N.';
    s.ganttActivities[1].owner = 'Jordan K.';
    st.scheduleSave();
  });
  await openDestination(page, 'nav-gantt');
  await page.waitForTimeout(400);
  eq('a laid-out lifecycle has its critical path named', (await page.textContent('#gantt-critical')).startsWith('Critical path'), true);
  eq('its bars are marked critical', await page.$$eval('#gantt-body .gantt-row.is-critical', (e) => e.length), 4);
  eq('the phase that runs alongside has the closing phase as float', await page.$$eval('#gantt-body .gantt-row:not(.is-critical) .gantt-bar__float', (e) => e.map((x) => x.textContent)), ['+9d']);
  eq('a change of owner along the path is listed as a handoff', (await page.textContent('#gantt-ownership')).includes('Priya N. → Jordan K.'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
