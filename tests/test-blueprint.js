// The hybrid delivery blueprint: ten inputs scored low, medium or high, the
// blend they add up to, and the setup checked against the project.
//
// Pins that nothing is synthesised from fewer than six answers; that heavy
// regulation and governance lean predictable and frequent change leans
// adaptive; that each element says which inputs asked for it; and that a part
// of the setup the project lacks says so and links to where to build it.

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
    const b = await import('/js/blueprint.js');
    const regulated = { regulatory: 3, scopeStability: 3, changeFrequency: 1, customerInvolvement: 1, teamMaturity: 2, deliveryCadence: 1, documentation: 3, dependencyComplexity: 3, governance: 3, releaseModel: 1 };
    const product = { regulatory: 1, scopeStability: 1, changeFrequency: 3, customerInvolvement: 3, teamMaturity: 3, deliveryCadence: 3, documentation: 1, dependencyComplexity: 1, governance: 1, releaseModel: 3 };
    const reg = b.synthesise({ blueprint: { inputs: regulated } });
    const prod = b.synthesise({ blueprint: { inputs: product } });
    const few = b.synthesise({ blueprint: { inputs: { regulatory: 3, governance: 3 } } });
    const partial = b.synthesise({ blueprint: { inputs: { regulatory: 3, scopeStability: 2, changeFrequency: 2, customerInvolvement: 2, teamMaturity: 2, deliveryCadence: 2 } } });
    const strength = (s, id) => s.setup.find((p) => p.id === id).strength;
    const inPlace = b.setupInPlace({ milestones: [{ kind: 'gate' }], sprints: [], raid: [{ type: 'Risk', status: 'Open' }], meetings: [{ cadence: 'weekly' }], ganttActivities: [] });
    return {
      count: b.INPUTS.length,
      few: [few.ready, few.scored],
      reg: [reg.predictableShare, strength(reg, 'backbone'), strength(reg, 'gates'), strength(reg, 'agile'), reg.predictable.map((e) => e.name), reg.adaptive.map((e) => e.name)],
      prod: [prod.adaptiveShare, strength(prod, 'agile'), strength(prod, 'gates'), prod.adaptive.map((e) => e.name), prod.predictable.map((e) => e.name)],
      why: reg.predictable.find((e) => e.name === 'Release gates').why,
      assumed: partial.assumed,
      inPlace: Object.fromEntries(Object.entries(inPlace).map(([k, v]) => [k, v.inPlace])),
      fit: [b.lifecycleFit(prod, { kind: 'lifecycle', label: 'SDLC' }), b.lifecycleFit(reg, { kind: 'practice', label: 'MLOps' })],
    };
  });
  eq('ten inputs', r.count, 10);
  eq('two answers are not enough to say anything', r.few, [false, 2]);
  eq('regulated and stable: predictable, a heavy backbone and gates, no agile layer',
     r.reg.slice(0, 4), [95, 'Heavy', 'Heavy', 'Not needed']);
  eq('and the predictable elements are all of them', r.reg[4], ['Compliance', 'Core architecture', 'Data and security', 'Integrations', 'Release gates', 'Financial controls']);
  eq('with nothing adaptive asked for', r.reg[5], []);
  eq('changing and close to the customer: adaptive, a heavy agile layer, no gates', r.prod.slice(0, 3), [100, 'Heavy', 'Not needed']);
  eq('its adaptive elements', r.prod[3], ['User experience', 'Features', 'Prioritisation', 'Backlog refinement', 'Feedback loops', 'Continuous delivery']);
  eq('each element says which inputs asked for it', r.why, ['Governance intensity', 'Regulatory pressure']);
  eq('unscored inputs are named as assumed', r.assumed, ['Documentation needs', 'Dependency complexity', 'Governance intensity', 'Release model']);
  eq('the setup is checked against the project', r.inPlace, { backbone: false, agile: false, gates: true, cadence: true, value: true });
  eq('the lean is compared with the lifecycle', [r.fit[0].startsWith('The inputs lean adaptive (100%), and SDLC is a phased lifecycle'), r.fit[1].startsWith('The inputs lean predictable (95%), and MLOps is a practice')], [true, true]);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-blueprint');
  await page.waitForTimeout(300);
  eq('Approach is a tab of the Plan page', (await page.textContent('#page-planner .page-tab.is-active')).startsWith('Approach'), true);
  eq('ten inputs, unscored', [await page.$$eval('#bp-inputs .bp-input', (e) => e.length), await page.$$eval('#bp-inputs .bp-input.is-unscored', (e) => e.length)], [10, 10]);
  eq('no blend yet', (await page.textContent('#bp-synthesis')).includes('Score at least 6'), true);
  const levels = { regulatory: 1, scopeStability: 1, changeFrequency: 3, customerInvolvement: 3, teamMaturity: 2, deliveryCadence: 3 };
  for (const [id, v] of Object.entries(levels)) {
    await page.click(`#bp-inputs [data-input="${id}"] [data-level="${v}"]`);
  }
  await page.waitForTimeout(200);
  eq('six answers give a blend', [await page.textContent('#bp-scored'), await page.isVisible('.bp-balance')], ['6 of 10 scored', true]);
  eq('nothing skipped is printed as text', /\b(false|null|undefined)\b/.test(await page.textContent('#bp-synthesis')), false);
  eq('the scores are the only thing stored', await page.evaluate(async () => Object.keys((await import('/js/state.js')).getState().blueprint)), ['inputs']);
  eq('the agile layer is wanted and missing, and links to Sprints',
     [await page.getAttribute('[data-part="agile"]', 'class').then((c) => c.includes('is-missing')), await page.getAttribute('[data-part="agile"] [data-goto-node]', 'data-goto-node')], [true, 'nav-sprints']);
  eq('the starter’s gate counts', (await page.textContent('[data-part="gates"]')).includes('1 decision gate'), true);
  await page.click('#bp-inputs [data-input="regulatory"] [data-level="1"]');
  await page.waitForTimeout(200);
  eq('pressing a chosen level again clears it', [await page.textContent('#bp-scored'), (await page.textContent('#bp-synthesis')).includes('Score at least 6')], ['5 of 10 scored', true]);
  await page.click('#bp-inputs [data-input="regulatory"] [data-level="1"]');
  await page.click('[data-part="agile"] [data-goto-node]');
  await page.waitForTimeout(300);
  eq('set it up goes there', (await page.textContent('#page-tasks .page-tab.is-active')).startsWith('Sprints'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await openDestination(page, 'nav-blueprint');
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
