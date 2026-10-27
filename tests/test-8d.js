// The 8D report: eight disciplines, each one's status worked out from what is
// written in it, validation by numbers, and closure by three signatures.
//
// Pins that D6 passes only when the measure after is better than before; that
// the report closes only with all eight complete and signed, and an edit
// afterwards reopens it; that lessons go to the Lessons Learned register (one
// home); and that an incident can start one, only once.

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
    const d = await import('/js/eightD.js');
    const sig = await import('/js/signatureModel.js');
    const p = d.newProblem({ number: 51, title: 'Solder bridge', leader: 'Ankit' });
    const states = () => Object.values(d.reportState(p).states);
    const s0 = states();
    p.team = [{ id: 'a', name: 'Ankit', role: 'Team leader' }, { id: 'b', name: 'Ravi', role: 'Team member' }];
    Object.assign(p, { what: 'Solder bridge on U12', where: 'SMT line 2', when: '18 May', howMuch: '28 of 500', impact: 'Rejected at customer' });
    p.containment = [{ id: 'c', action: '100% inspection', done: true }];
    p.causes = [{ id: 'x', category: 'Machine', text: 'Printing pressure high', verified: true }];
    p.rootCause = 'Excess paste from high printing pressure';
    p.actions = [{ id: 'y', action: 'Optimise pressure', owner: 'Pooja', due: '2026-05-24', status: 'Done', effective: 'Effective' }];
    p.before = '8, 6, 5.6%, 5';
    p.after = '9, 9';
    const worse = d.disciplineState(p, 'd6');
    p.after = '1.2, 0.8, 0.4, 0.3';
    p.prevention = { pokaYoke: true };
    p.lessons = 'Maintain the printer\nTrain operators';
    const s1 = states();
    const content = d.problemContent(p);
    p.approvals = Object.fromEntries(d.APPROVALS.map((a) => [a.id, sig.createSignature({ name: a.id, statement: 's', content })]));
    const closed = d.reportState(p).closed;
    p.rootCause += '.';
    const reopened = d.reportState(p).closed;
    return {
      s0, worse, s1, closed, reopened,
      v: d.validation({ before: '8, 6, 5.6, 5', after: '1.2, 0.8, 0.4, 0.3' }),
      higher: d.validation({ before: '50', after: '60', better: 'higher' }).better,
      nums: [d.numbers('8, 6 ,5.6% ; 5'), d.numbers('')],
      text: d.benefitText({ before: '8, 6, 5.6, 5', after: '1.2, 0.8, 0.4, 0.3', measure: 'defect %' }),
      lessons: d.lessonRows(p, '2026-06-08').map((l) => [l.what, l.category, l.status]),
      ref: d.reference(p),
    };
  });
  eq('an empty report has nothing started', r.s0, Array(8).fill('empty'));
  eq('D6 fails when the after is worse', r.worse, 'started');
  eq('written through, D1–D7 complete and D8 waits for sign-off', r.s1, [...Array(7).fill('complete'), 'started']);
  eq('three signatures close it; an edit afterwards reopens it', [r.closed, r.reopened], [true, false]);
  eq('validation: the averages, better, and the change', r.v, { before: 6.15, after: 0.68, better: true, change: -89 });
  eq('better can be higher', r.higher, true);
  eq('numbers are read loosely; nothing is not zero', r.nums, [[8, 6, 5.6, 5], []]);
  eq('the benefit in words', r.text, '6.15 → 0.68 defect % (−89%)');
  eq('lessons become Lessons Learned rows', r.lessons, [['8D-051 (Solder bridge): Maintain the printer', 'Quality', 'Agreed'], ['8D-051 (Solder bridge): Train operators', 'Quality', 'Agreed']]);
  eq('numbered like the form', r.ref, '8D-051');

  console.log('\n--- from an incident ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const s = st.getState();
    if (!Array.isArray(s.incidents)) s.incidents = [];
    s.incidents.push({ id: st.uid(), title: 'Checkout pixel drops orders', priority: 'P1', service: 'Checkout', account: 'Northwind', reported: '2026-09-28T09:00', status: 'Resolved' });
    st.scheduleSave();
  });
  await openDestination(page, 'tab-service');
  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-service', 'sec-incidents'));
  await page.waitForTimeout(300);
  await page.click('#page-service [data-row-action="8d"] >> nth=-1');
  await page.waitForTimeout(400);
  eq('the incident’s 8D action opens a new report on Improvement & Lessons', [
    (await page.textContent('#page-improve .page-tab.is-active')).startsWith('Problem Solving'),
    await page.inputValue('#d8-body [data-p="title"]'),
    await page.inputValue('#d8-body [data-p="customer"]'),
    (await page.textContent('.d8-head')).includes('from INC-'),
  ], [true, 'Checkout pixel drops orders', 'Northwind', true]);
  await openDestination(page, 'tab-service');
  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-service', 'sec-incidents'));
  await page.waitForTimeout(200);
  await page.click('#page-service [data-row-action="8d"] >> nth=-1');
  await page.waitForTimeout(300);
  eq('asking again opens the same one', await page.evaluate(async () => (await import('/js/state.js')).getState().problems.length), 1);

  console.log('\n--- working it on the page ---');
  eq('D1 is open first, the strip shows eight steps', [await page.$$eval('#d8-strip li', (e) => e.length), await page.$eval('#d8-body details[open]', (d) => d.dataset.d)], [8, 'd1']);
  await page.fill('#d8-body [data-p="leader"]', 'Jordan K.');
  await page.click('[data-d="d1"] [data-dact="add"]');
  await page.fill('[data-d="d1"] [data-row] >> nth=0 >> [data-f="name"]', 'Jordan K.');
  await page.click('[data-d="d1"] [data-dact="add"]');
  await page.fill('[data-d="d1"] [data-row] >> nth=1 >> [data-f="name"]', 'Marcus T.');
  await page.waitForTimeout(150);
  eq('two on the team with a leader completes D1', await page.getAttribute('[data-step="d1"]', 'class').then((c) => c.includes('is-complete')), true);
  eq('the caret stays where it was typing', await page.evaluate(() => document.activeElement.dataset.f), 'name');

  await page.click('[data-d="d6"] > summary');
  await page.fill('[data-d="d6"] [data-p="before"]', '4, 3.5, 3.8');
  await page.fill('[data-d="d6"] [data-p="after"]', '0.5, 0.2');
  await page.waitForTimeout(150);
  eq('the before and after draw and read as a result', [await page.$$eval('[data-d="d6"] .d8-bar', (e) => e.length), (await page.textContent('[data-d="d6"] [data-result]')).includes('3.77 → 0.35')], [5, true]);

  await page.click('[data-d="d8"] > summary');
  await page.fill('[data-d="d8"] [data-p="lessons"]', 'Verify tracking before launch');
  await page.click('[data-d="d8"] [data-dact="lessons"]');
  await page.waitForTimeout(200);
  eq('lessons go to Lessons Learned, the one home', await page.evaluate(async () => (await import('/js/state.js')).getState().lessons.some((l) => l.what.includes('Verify tracking before launch'))), true);
  await page.click('[data-d="d8"] [data-approval="prepared"] [data-dact="sign"]');
  await page.waitForSelector('.dialog');
  eq('signing an unfinished report warns which disciplines are open', (await page.textContent('.dialog')).includes('D2 Describe the problem'), true);
  await page.click('.dialog .btn-ghost');
  await page.waitForTimeout(150);

  await page.click('[data-dact="copy"]');
  await page.waitForSelector('.dialog');
  eq('the report copies as text', (await page.textContent('.dialog')).includes('D6 Validation: 3.77 → 0.35'), true);
  await page.click('.dialog .btn-primary');

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
