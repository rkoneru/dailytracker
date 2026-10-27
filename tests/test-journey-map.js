// The customer journey map: stages, steps, touchpoints and who owns each.
//
// Pins the five-stage template; that the counts come from the map; that the
// gaps a map exists to show — a touchpoint nobody owns, a stage with none, a
// department that never meets the customer, a touchpoint everyone shares —
// are found; and that ticking an owner or adding a touchpoint changes them.

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
    const j = await import('/js/journeyMap.js');
    const t = j.defaultJourneyMap();
    const a = j.journeyAnalysis(t);
    const map = {
      departments: [{ id: 'm', name: 'Marketing' }, { id: 's', name: 'Sales' }, { id: 'l', name: 'Legal' }, { id: 'x', name: 'Ops' }, { id: 'y', name: 'Finance' }],
      stages: [
        { id: 'a', label: 'Awareness', steps: [], touchpoints: [{ id: 't1', name: 'Ads', owners: ['m'] }, { id: 't2', name: 'Blog', owners: [] }] },
        { id: 'b', label: 'Loyalty', steps: [], touchpoints: [] },
        { id: 'c', label: 'Deal', steps: [], touchpoints: [{ id: 't3', name: 'Contract', owners: ['m', 's', 'x', 'y'] }] },
      ],
    };
    const g = j.journeyAnalysis(map);
    return {
      stages: t.stages.map((s) => s.label),
      template: [a.total, a.gaps.length],
      perStage: g.perStage.map((s) => [s.label, s.touchpoints, s.links]),
      gaps: g.gaps.map((x) => [x.kind, x.id]),
      dept: g.perDept.map((d) => [d.name, d.total]),
    };
  });
  eq('five stages, as the layers run', r.stages, ['Awareness', 'Consideration', 'Acquisition', 'Service', 'Loyalty']);
  eq('the template is a whole map with nothing left unowned', r.template, [20, 0]);
  eq('touchpoints and owner links counted per stage', r.perStage, [['Awareness', 2, 1], ['Loyalty', 0, 0], ['Deal', 1, 4]]);
  eq('gaps: unowned, empty stage, crowded, a department nowhere', r.gaps, [['unowned', 't2'], ['stage', 'b'], ['crowded', 't3'], ['idle', 'l']]);
  eq('each department’s share', r.dept, [['Marketing', 2], ['Sales', 1], ['Legal', 0], ['Ops', 1], ['Finance', 1]]);

  console.log('\n--- on the page ---');
  await openDestination(page, 'tab-customers');
  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-customers', 'sec-cs-journey'));
  await page.waitForTimeout(300);
  eq('Journey Map is a Customer Success tab', (await page.textContent('#page-customers .page-tab.is-active')).startsWith('Journey Map'), true);
  eq('the template draws five stages and twenty touchpoints', [await page.$$eval('#journey-map .jm-stage', (e) => e.length), await page.$$eval('#journey-map .jm-tp', (e) => e.length)], [5, 20]);
  const firstStage = await page.getAttribute('#journey-map .jm-stage input', 'data-id');
  await page.click(`#journey-map [data-jm-act="add-touchpoint"][data-id="${firstStage}"]`);
  await page.waitForTimeout(200);
  eq('adding a touchpoint puts the caret in it', await page.evaluate(() => document.activeElement.dataset.jm), 'touchpoint');
  await page.keyboard.type('Podcast');
  await page.waitForTimeout(200);
  eq('with nobody owning it, the map says so', (await page.textContent('#journey-gaps')).includes('Podcast (Awareness) has no department'), true);
  eq('and the stage count moved', await page.textContent(`#journey-map [data-count="${firstStage}"]`), '5');
  const tpId = await page.evaluate(() => document.activeElement.dataset.id);
  const marketing = await page.getAttribute('#journey-map [data-jm="dept"]', 'data-id');
  await page.click(`#journey-map [data-jm-own="${marketing}"][data-id="${tpId}"] + .jm-dot`);
  await page.waitForTimeout(200);
  eq('ticking an owner clears the gap', await page.isVisible('#journey-gaps'), false);
  eq('and it is saved on the project', await page.evaluate(async (id) => (await import('/js/state.js')).getState().journeyMap.stages[0].touchpoints.find((t) => t.id === id).owners.length, tpId), 1);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
