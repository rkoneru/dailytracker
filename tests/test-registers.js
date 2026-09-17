// The four register pages: Scope & Contract, People & Stakeholders,
// Service & Support, and Improvement & Lessons.
//
// Fourteen registers share one engine, so most of what is worth testing is
// tested once: if add, edit, delete, reorder, search and persistence work on
// one register they work on all of them. What gets tested per register is the
// part that is genuinely its own — the derived counters, the ref prefixes, and
// the vocabulary each one offers.

const { APP_URL, launch, createChecks, openSection } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const state = () => page.evaluate(async () => (await import('/js/state.js')).getState());

  console.log('\n--- registers are grouped by who needs them, not by which standard they came from ---');
  await page.click('#tab-scope');
  await page.waitForTimeout(600);
  eq('scope & contract', await page.$$eval('#page-scope .card__head h2', (e) => e.map((x) => x.textContent)),
     ['Charter', 'Deliverables', 'Change Requests (Scope, Time, Cost)']);

  await page.click('#tab-people');
  await page.waitForTimeout(600);
  eq('people & stakeholders', await page.$$eval('#page-people .card__head h2', (e) => e.map((x) => x.textContent)),
     ['Team Roster', 'Who Does What (RACI)', 'Stakeholders', 'Communications Plan']);

  await page.click('#tab-service');
  await page.waitForTimeout(600);
  eq('service & support', await page.$$eval('#page-service .card__head h2', (e) => e.map((x) => x.textContent)),
     ['Service Levels (SLA / OLA)', 'Go-Live Checklist (Service Acceptance)',
      'Releases & Deployments', 'Change Control (CAB)', 'Known Issues & Workarounds (KEDB)']);

  await page.click('#tab-improve');
  await page.waitForTimeout(600);
  eq('improvement & lessons', await page.$$eval('#page-improve .card__head h2', (e) => e.map((x) => x.textContent)),
     ['Improvements (CSI)', 'Lessons Learned']);

  // Dependencies sit under the RAID log: "what is in our way" is one question.
  await page.click('#tab-raid');
  await page.waitForTimeout(600);
  eq('blockers live together', await page.$$eval('#page-raid .card__head h2', (e) => e.map((x) => x.textContent)),
     ['Log', 'Dependencies']);

  // Titles lead with what the thing is and keep the discipline's term in
  // brackets, so a tester finds the go-live checklist without knowing it is
  // called Service Acceptance Criteria.
  eq('plain names carry the formal one',
     await page.$$eval('#page-service .card__head h2, #page-improve .card__head h2',
       (e) => e.map((x) => x.textContent).filter((t) => /\(/.test(t)).length), 5);

  console.log('\n--- the vocabulary is the PMP/ITIL one, not a generic one ---');
  // The default template is a marketing campaign, so these registers start
  // empty — one row each is enough to read the options they offer.
  await page.click('#tab-service');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-service-levels');
  await page.click('#sec-service-levels [data-action="add-row"]');
  await openSection(page, 'sec-changes');
  await page.click('#sec-changes [data-action="add-row"]');
  await page.waitForTimeout(400);
  eq('service level agreement types',
     await page.$$eval('#service-levels-body tr:first-child [data-field="agreement"] option', (e) => e.map((x) => x.value).filter(Boolean)),
     ['SLA', 'OLA', 'Underpinning contract']);
  eq('ITIL change types',
     await page.$$eval('#changes-body tr:first-child [data-field="type"] option', (e) => e.map((x) => x.value).filter(Boolean)),
     ['Standard', 'Normal', 'Emergency']);
  eq('CAB decisions',
     await page.$$eval('#changes-body tr:first-child [data-field="cab"] option', (e) => e.map((x) => x.value).filter(Boolean)),
     ['Not required', 'Pending', 'Approved', 'Rejected', 'Deferred']);

  console.log('\n--- one engine: add, edit, reload, delete on a representative register ---');
  await page.click('#tab-people');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-stakeholders');
  const before = await page.locator('#stakeholders-body tr').count();
  await page.click('#sec-stakeholders [data-action="add-row"]');
  await page.waitForTimeout(300);
  eq('add appends a row', await page.locator('#stakeholders-body tr').count(), before + 1);
  eq('and the new row is focused ready to type',
     await page.evaluate(() => document.activeElement.dataset.field), 'name');

  await page.fill('#stakeholders-body tr:last-child [data-field="name"]', 'Renata Vance');
  await page.selectOption('#stakeholders-body tr:last-child [data-field="attitude"]', 'Blocker');
  await page.waitForTimeout(500);
  eq('a select recolours in place without a re-render',
     await page.getAttribute('#stakeholders-body tr:last-child [data-field="attitude"]', 'class'),
     'row-select tone-blocker');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.click('#tab-people');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-stakeholders');
  eq('the edit survived a reload',
     await page.inputValue('#stakeholders-body tr:last-child [data-field="name"]'), 'Renata Vance');

  await page.click('#stakeholders-body tr:last-child [data-action="delete-row"]');
  await page.waitForTimeout(500);
  eq('delete removes it', await page.locator('#stakeholders-body tr').count(), before);
  eq('and offers it back', await page.locator('.toast').count(), 1);
  await page.click('.toast button[data-action], .toast__action');
  await page.waitForTimeout(500);
  eq('undo restores it', await page.locator('#stakeholders-body tr').count(), before + 1);
  await page.click('#stakeholders-body tr:last-child [data-action="delete-row"]');
  await page.waitForTimeout(400);

  console.log('\n--- search filters a register without touching its neighbours ---');
  // The roster used to be this test's subject; it is now a view of the central
  // resource pool rather than a register, so RACI stands in for it.
  await openSection(page, 'sec-raci');
  const raciRows = await page.locator('#raci-body tr').count();
  await page.fill('#raci-search', 'Influencer');
  await page.waitForTimeout(400);
  eq('the search narrows its own register',
     await page.locator('#raci-body tr:not([hidden])').count() < raciRows, true);
  eq('the register next to it is untouched',
     await page.locator('#stakeholders-body tr:not([hidden])').count(),
     await page.locator('#stakeholders-body tr').count());
  await page.fill('#raci-search', 'zzzz');
  await page.waitForTimeout(400);
  eq('a search with no hits says so', await page.textContent('#raci-empty'), 'Nothing matches that search.');
  await page.fill('#raci-search', '');
  await page.waitForTimeout(400);

  console.log('\n--- refs are per-register and stable-looking ---');
  await page.click('#tab-scope');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-deliverables');
  eq('deliverables count from D-01',
     await page.$$eval('#deliverables-body .col-ref', (e) => e.map((x) => x.textContent)),
     ['D-01', 'D-02', 'D-03', 'D-04']);
  await page.click('#tab-raid');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-dependencies');
  eq('dependencies use their own prefix',
     await page.textContent('#dependencies-body tr:first-child .col-ref'), 'DEP-01');

  console.log('\n--- one list of names, now drawn from the resource pool ---');
  await page.click('#tab-people');
  await page.waitForTimeout(600);
  const offered = await page.$$eval('#roster-names option', (e) => e.map((x) => x.value));
  eq('the datalist is populated', offered.length > 0, true);
  eq('from the people allocated to this project',
     await page.evaluate(async (list) => {
       const state = await import('/js/state.js');
       return (state.getState().allocations || []).every((a) => !a.name || list.includes(a.name));
     }, offered), true);
  eq('a RACI owner field offers it',
     await page.getAttribute('#raci-body tr:first-child [data-field="accountable"]', 'list'), 'roster-names');

  // Renaming in the pool is what now changes the list, because the pool is
  // where a person's name lives.
  await page.evaluate(async () => {
    const state = await import('/js/state.js');
    state.updateResource(state.listResources()[0].id, { name: 'Renamed In Pool' });
  });
  await page.click('#tab-scope');
  await page.waitForTimeout(400);
  await page.click('#tab-people');
  await page.waitForTimeout(600);
  eq('renaming in the pool updates the list everything offers',
     (await page.$$eval('#roster-names option', (e) => e.map((x) => x.value))).includes('Renamed In Pool'), true);

  console.log('\n--- dependencies have exactly one home ---');
  // They used to be a RAID type as well; the RAID row is carried across on
  // load rather than being tracked in both places.
  eq('RAID no longer offers Dependency',
     await page.$$eval('#raid-body tr:first-child [data-field="type"] option', (e) => e.map((x) => x.value).filter(Boolean)),
     ['Risk', 'Issue', 'Decision', 'Assumption']);
  eq('no RAID row is still a dependency',
     (await state()).raid.some((r) => r.type === 'Dependency'), false);
  eq('the RAID dependency arrived in the register just below the log',
     await page.inputValue('#dependencies-body tr:first-child [data-field="description"]'),
     'Legal sign-off on influencer terms');
  eq('and its severity became a dependency status',
     await page.inputValue('#dependencies-body tr:first-child [data-field="status"]'), 'At Risk');

  console.log('\n--- counters are derived, not stored ---');
  const tile = (id) => page.evaluate((i) => {
    const node = document.getElementById(i);
    return {
      value: node.querySelector('.kpi__value').textContent,
      sub: node.querySelector('.kpi__sub').textContent,
      tone: ['is-good', 'is-warn', 'is-bad', 'is-idle'].find((c) => node.classList.contains(c)),
    };
  }, id);

  await page.click('#tab-scope');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-deliverables');
  eq('deliverables counter reads accepted over total', (await tile('scope-count-deliverables')).value, '2/4');
  await page.selectOption('#deliverables-body tr:nth-child(3) [data-field="status"]', 'Accepted');
  await page.waitForTimeout(500);
  eq('and follows an edit', (await tile('scope-count-deliverables')).value, '3/4');

  // A deliverable with no acceptance criteria is the thing this counter is for.
  await page.fill('#deliverables-body tr:nth-child(4) [data-field="acceptance"]', '');
  await page.waitForTimeout(500);
  const missing = await tile('scope-count-deliverables');
  eq('a deliverable with no acceptance criteria is called out', missing.sub, '1 with no acceptance criteria');
  eq('and reads as a warning', missing.tone, 'is-warn');

  await page.click('#tab-people');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-raci');
  const raci = await tile('people-count-raci');
  eq('every RACI row has someone accountable', raci.sub, 'Every activity has an owner');
  eq('so it reads as good', raci.tone, 'is-good');
  await page.fill('#raci-body tr:first-child [data-field="accountable"]', '');
  await page.waitForTimeout(500);
  const orphan = await tile('people-count-raci');
  eq('emptying the A is called out', orphan.sub, '1 with nobody accountable');
  eq('and reads as a warning', orphan.tone, 'is-warn');

  console.log('\n--- the ITIL counters answer go-live questions ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-software');
  await page.click('#btn-create-project');
  await page.waitForTimeout(900);
  await page.click('#tab-service');
  await page.waitForTimeout(700);
  await openSection(page, 'sec-service-levels');

  const sla = await tile('svc-count-sla');
  eq('a breached SLA is counted', sla.value, '1');
  eq('with the at-risk ones behind it', sla.sub, '1 more at risk');
  eq('and reads as bad', sla.tone, 'is-bad');

  eq('acceptance criteria read met over total', (await tile('svc-count-sac')).value, '2/5');
  eq('and say what is left', (await tile('svc-count-sac')).sub, '3 still to prove');

  const kedb = await tile('svc-count-kedb');
  eq('known errors count the unresolved', kedb.value, '2');
  eq('and flag the one with no workaround', kedb.sub, '1 with no workaround');
  eq('which is the bad case, not merely a warning', kedb.tone, 'is-bad');
  await openSection(page, 'sec-known-errors');
  await page.fill('#known-errors-body tr:nth-child(3) [data-field="workaround"]', 'Suppress the duplicate in the mail gateway.');
  await page.waitForTimeout(500);
  eq('writing the workaround downgrades it', (await tile('svc-count-kedb')).tone, 'is-warn');

  console.log('\n--- a failed acceptance criterion blocks go-live ---');
  await openSection(page, 'sec-sac');
  await page.selectOption('#sac-body tr:first-child [data-field="status"]', 'Failed');
  await page.waitForTimeout(500);
  const sac = await tile('svc-count-sac');
  eq('it is called out', sac.sub, '1 failed — not ready for go-live');
  eq('and reads as bad', sac.tone, 'is-bad');

  console.log('\n--- registers sync like any other row collection ---');
  const kinds = await page.evaluate(async () => (await import('/js/syncModel.js')).ROW_KINDS);
  ['raci', 'deliverables', 'dependencies', 'stakeholders', 'comms', 'changeRequests',
    'lessons', 'serviceLevels', 'sac', 'releases', 'changes', 'csi', 'knownErrors'].forEach((k) => {
    eq(`${k} is a synced row kind`, kinds.includes(k), true);
  });
  eq('roster is not, because it is no longer a register', kinds.includes('roster'), false);
  eq('allocations are, and they are what replaced it', kinds.includes('allocations'), true);

  console.log('\n--- the charter is fields, and they persist ---');
  await page.click('#tab-scope');
  await page.waitForTimeout(600);
  await openSection(page, 'sec-charter');
  eq('every charter field is rendered', await page.locator('#charter-fields .charter-field').count(), 7);
  await page.fill('#charter-fields [data-field="charterScopeOut"]', 'Anything outside the UK market.');
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.click('#tab-scope');
  await page.waitForTimeout(500);
  await openSection(page, 'sec-charter');
  eq('and survives a reload',
     await page.inputValue('#charter-fields [data-field="charterScopeOut"]'), 'Anything outside the UK market.');

  console.log('\n--- nav reaches every register ---');
  // The tree remembers what was open, so toggle only if it is currently shut.
  if (await page.getAttribute('#tab-improve', 'aria-expanded') === 'false') {
    await page.click('#tab-improve .nav-twisty');
    await page.waitForTimeout(300);
  }
  await page.click('#nav-lessons .nav-row__label');
  await page.waitForTimeout(500);
  eq('a section leaf opens its page', await page.textContent('#page-title'), 'Improvement & Lessons');
  // The jump is a smooth scroll, so wait for it to land rather than guessing.
  const onScreen = await page.waitForFunction(() => {
    const r = document.getElementById('sec-lessons').getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }, null, { timeout: 5000 }).then(() => true).catch(() => false);
  eq('and the section it names is scrolled into view', onScreen, true);

  console.log('\n--- layout ---');
  eq('no page overflow at phone width', await page.evaluate(() => {
    window.resizeTo(400, 900);
    return document.documentElement.scrollWidth > window.innerWidth + 1;
  }), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
