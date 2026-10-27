// The portfolio roadmap: every project a lane on one time scale.
//
// Pins that an item's colour is its project's open-risk band, red when the
// item is late, and grey when no risk has ever been logged (unknown, not
// safe); that a project with no Gantt still appears, as its span; and that
// goals come from the charters' strategic objectives.

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
    const m = await import('/js/roadmap.js');
    const today = new Date(2026, 9, 15);
    const bands = [
      m.riskBand({ raid: [] }),
      m.riskBand({ raid: [{ type: 'Risk', status: 'Closed', severity: 'High', likelihood: 'High' }] }),
      m.riskBand({ raid: [{ type: 'Risk', status: 'Open', severity: 'Low', likelihood: 'Low' }] }),
      m.riskBand({ raid: [{ type: 'Risk', status: 'Open', severity: 'Medium', likelihood: 'Medium' }] }),
      m.riskBand({ raid: [{ type: 'Issue', status: 'Open', severity: 'High' }] }),
    ];
    const map = m.roadmap([
      { id: 'a', projectName: 'Web', charterObjective: 'Grow revenue', dueDate: '2026-12-01', raid: [{ type: 'Risk', status: 'Open', severity: 'Low', likelihood: 'Low' }],
        ganttActivities: [{ id: 'x', name: 'Build', start: '2026-09-01', end: '2026-10-01', progress: 50 }, { id: 'y', name: 'Launch', start: '2026-11-01', end: '2026-11-30', progress: 0 }],
        milestones: [{ id: 'g', text: 'Go-live', kind: 'gate', due: '2026-11-30' }], dashTasks: [{ status: 'Complete' }, { status: 'Open' }] },
      { id: 'b', projectName: 'CRM', charterObjective: 'grow revenue', raid: [], dashTasks: [{ start: '2026-10-01', end: '2026-10-20', status: 'Open' }] },
      { id: 'c', projectName: 'Idea', raid: [] },
    ], today);
    return {
      bands,
      lanes: map.lanes.map((l) => [l.name, l.band, l.items.map((i) => [i.name, i.risk])]),
      goals: map.goals.map((g) => [g.name, g.points.map((p) => [p.project, p.completion])]),
      window: [map.window.start.getDate(), map.window.end.getMonth() + 1],
    };
  });
  eq('bands: nothing logged, all closed, low, medium, high', r.bands, ['tbc', 'ok', 'low', 'med', 'high']);
  eq('a late item is red; the rest take the project band; a project with no Gantt is its span; one with no dates has no items', r.lanes, [
    ['Web', 'low', [['Build', 'high'], ['Launch', 'low']]],
    ['CRM', 'tbc', [['CRM', 'tbc']]],
    ['Idea', 'tbc', []],
  ]);
  eq('goals gather projects by objective, whatever the case', r.goals, [['Grow revenue', [['Web', 50], ['CRM', 0]]]]);
  eq('the window runs whole months', r.window, [1, 12]);

  console.log('\n--- on the page ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const gm = await import('/js/ganttModel.js');
    const s = st.getState();
    s.methodology = 'project';
    s.charterObjective = 'Grow online revenue';
    s.ganttActivities = gm.layOut(s, undefined, st.uid);
    st.scheduleSave();
  });
  await openDestination(page, 'nav-roadmap');
  await page.waitForTimeout(400);
  eq('Roadmap is a Portfolio tab', (await page.textContent('#page-portfolio .page-tab.is-active')).startsWith('Roadmap'), true);
  eq('a lane per project, its activities as items', [await page.$$eval('#roadmap-body .rm-lane', (e) => e.length), await page.$$eval('#roadmap-body .rm-lane .rm-item', (e) => e.length)], [1, 5]);
  eq('the goal row carries the project', (await page.textContent('#roadmap-body .rm-goal')).includes('Grow online revenue'), true);
  eq('milestones sit on the lane', await page.$$eval('#roadmap-body .rm-lane .rm-mark', (e) => e.length) > 0, true);
  await page.click('#roadmap-body [data-rm-open]');
  await page.waitForTimeout(400);
  eq('a lane opens its project’s Gantt', (await page.textContent('#page-planner .page-tab.is-active')).startsWith('Gantt'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await openDestination(page, 'nav-roadmap');
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
