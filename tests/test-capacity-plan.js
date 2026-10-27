// Capacity week by week: the calendar, who is free when, skill demand against
// supply, and a named fix for anyone booked past their time.
//
// Pins that load is measured against the time a person had that week (leave
// makes a week more loaded, not less), that skill demand comes from what the
// bookings say they need, and that a recommendation names someone who has
// both the skills and the time — or says nobody does.

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
    const c = await import('/js/capacityPlan.js');
    const people = [
      { id: 'ana', name: 'Ana', title: 'Developer', skills: [{ name: 'Java' }, { name: 'SQL' }] },
      { id: 'ben', name: 'Ben', title: 'Developer', skills: [{ name: 'Java' }] },
      { id: 'cy', name: 'Cy', title: 'Tester', skills: [{ name: 'QA' }] },
    ];
    const allocations = [
      { resourceId: 'ana', projectId: 'p1', percent: 80, from: '2026-10-05', to: '2026-11-30', skills: 'Java' },
      { resourceId: 'ana', projectId: 'p2', percent: 40, from: '2026-10-05', to: '2026-11-30', skills: 'Java, SQL' },
      { resourceId: 'ben', projectId: 'p1', percent: 30, from: '2026-10-05', to: '2026-11-30', skills: 'Java' },
      { resourceId: 'cy', projectId: 'p3', percent: 100, from: '2026-10-05', to: '2026-10-25', skills: 'QA, Automation' },
    ];
    const absences = [{ resourceId: 'ben', from: '2026-10-12', to: '2026-10-16' }];
    const grid = c.capacityGrid(people, allocations, absences, '2026-10-07', 6);
    const cell = (name, i) => grid.rows.find((x) => x.resource.name === name).cells[i];
    const outlook = c.availabilityOutlook(grid);
    const skills = c.skillBalance(people, allocations, absences, '2026-10-05', '2026-10-18');
    const fixes = c.overloadFixes(people, allocations, absences, '2026-10-05', '2026-10-18', (id) => ({ p1: 'Website', p2: 'CRM', p3: 'QA sweep' }[id]));
    return {
      weeks: [grid.weeks[0].from, grid.weeks.length],
      ana: [cell('Ana', 0).load, cell('Ana', 0).band],
      benLeave: [cell('Ben', 0).load, cell('Ben', 1).load, cell('Ben', 1).band],
      cyAfter: [cell('Cy', 3).load, cell('Cy', 3).band],
      outlook: Object.fromEntries(Object.entries(outlook).map(([k, v]) => [k, v.map((p) => p.name)])),
      skills: skills.map((s) => [s.skill, s.demand, s.available, s.status]),
      fixes: fixes.map((f) => [f.name, f.over, f.project, f.candidates.map((x) => x.name)]),
      fixText: fixes[0]?.text,
      bands: [c.bandOf(0), c.bandOf(70), c.bandOf(71), c.bandOf(100), c.bandOf(101), c.bandOf(null)],
    };
  });
  eq('weeks start on a Monday', r.weeks, ['2026-10-05', 6]);
  eq('two bookings add up, and past 100% is over', r.ana, [120, 'over']);
  eq('a week of leave makes a booking weigh more, not less', r.benLeave, [30, 103, 'over']);
  eq('after a booking ends the week is free', r.cyAfter, [0, 'free']);
  eq('free now, soon, later or not at all', r.outlook, { now: ['Ben'], soon: [], later: ['Cy'], none: ['Ana'] });
  eq('skill demand from bookings, supply from who holds it, shortages first',
     r.skills, [['Automation', 1, 0, 'Shortage'], ['QA', 1, 1, 'Low'], ['Java', 1.5, 1.6, 'Low'], ['SQL', 0.4, 1, 'Balanced']]);
  eq('an overload is fixed by someone with the skills and the time', r.fixes, [['Ana', 20, 'Website', ['Ben']]]);
  eq('named with what to move and how free they are', r.fixText, 'Move 20% of Website to Ben (34% free).');
  eq('bands: free, optimal to 70, high to 100, then over; away is its own', r.bands, ['free', 'optimal', 'high', 'high', 'over', 'away']);

  const named = await page.evaluate(async () => {
    const c = await import('/js/capacityPlan.js');
    const people = [
      { id: 'ana', name: 'Ana', skills: [{ name: 'Java' }] },
      { id: 'dee', name: 'Dee', skills: [{ name: 'Java' }] },
      { id: 'eve', name: 'Eve', skills: [{ name: 'Figma' }] },
    ];
    const allocations = [{ resourceId: 'ana', projectId: 'p', percent: 130, from: '', to: '', skills: 'Java' }, { resourceId: 'dee', projectId: 'q', percent: 20, from: '', to: '' }];
    const nobody = c.overloadFixes([people[0], people[2]], [allocations[0]], [], '2026-10-05', '2026-10-18', () => 'Website')[0].text;
    return [c.overloadFixes(people, allocations, [], '2026-10-05', '2026-10-18', () => 'Website')[0].text, nobody];
  });
  eq('when someone fits, they are named with their free time', named[0], 'Move 30% of Website to Dee (80% free).');
  eq('when nobody has the skills and the time, it says so and names the other levers', named[1].startsWith('Nobody with the skills Java has 30% free in this window — reduce the booking'), true);

  console.log('\n--- on the page, from the starter ---');
  await openDestination(page, 'tab-resources');
  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-resources', 'sec-availability'));
  await page.waitForTimeout(300);
  eq('the capacity calendar is on the Availability tab', await page.isVisible('#capacity-heatmap-table'), true);
  eq('twelve weeks, a row each', [await page.$$eval('#capacity-heatmap-table thead th', (e) => e.length - 1), await page.$$eval('#capacity-heatmap-table tbody tr', (e) => e.length)], [12, 4]);
  eq('the outlook names who is free now', (await page.textContent('#availability-outlook [data-outlook="now"]')).includes('Jordan K.'), true);

  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-resources', 'sec-allocations'));
  await page.waitForTimeout(300);
  eq('skill demand vs availability sits under the bookings', await page.isVisible('#skill-balance-table'), true);
  eq('the starter is short of analytics', await page.$eval('#skill-balance-body tr', (tr) => [tr.dataset.skill, tr.lastElementChild.textContent]), ['Analytics', 'Shortage']);
  const input = '#allocations-body tr:first-child [data-field="skills"]';
  await page.fill(input, 'Kubernetes');
  await page.dispatchEvent(input, 'change');
  await page.waitForTimeout(300);
  eq('naming a skill a booking needs puts it in the table', await page.$$eval('#skill-balance-body tr', (e) => e.map((x) => x.dataset.skill)).then((l) => l.includes('Kubernetes')), true);

  console.log('\n--- an overload gets a named action ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const s = st.getState();
    const jordan = s.allocations.find((a) => a.name === 'Jordan K.');
    jordan.percent = 140;
    jordan.to = '';
    st.scheduleSave();
  });
  await page.waitForTimeout(500);
  await page.evaluate(async () => (await import('/js/resourcesPage.js')).renderResources());
  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-resources', 'sec-availability'));
  await page.waitForTimeout(300);
  eq('the over-allocated week is red on the calendar', await page.$$eval('#capacity-heatmap-table tbody tr', (rows) => rows.find((r) => r.textContent.includes('Jordan')).querySelector('td').className), 'cap-cell is-over');
  eq('and a recommended action names what to move', (await page.textContent('#resource-fixes')).includes('Jordan K. +'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
