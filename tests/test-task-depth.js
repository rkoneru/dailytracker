// Checklists, effort, and what a task waits for.
//
// The three go together because they are the three things a task screen needs
// before it can answer "is this plan real?": what finishing actually involves,
// what it was supposed to cost, and what has to happen first. The dependency
// maths is tested on its own in test-critical.mjs; this is about whether the
// screen tells the truth about it.

const { APP_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);

  // The transition template is the one that actually uses these features.
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-transition');
  await page.click('#btn-create-project');
  await page.waitForTimeout(1200);
  await page.click('#tab-tasks');
  await page.waitForTimeout(700);

  const row = (n) => `#tracker-body tr:nth-child(${n})`;

  console.log('\n--- effort is totalled, and says what it is missing ---');
  eq('estimated total', await page.textContent('#effort-estimate'), '548h');
  eq('spent total', await page.textContent('#effort-spent'), '139h');
  // Under, not over: most of the plan has not started. The sign is the point.
  eq('variance is shown as a signed figure',
     (await page.textContent('#effort-variance')).startsWith('-'), true);
  eq('and it is not dressed up as good news',
     await page.getAttribute('#effort-variance', 'class'), 'effort__value is-under');
  eq('and when everything is estimated, it says so rather than staying blank',
     await page.textContent('#effort-unestimated'), 'every task estimated');

  console.log('\n--- an estimate is editable, and the total follows ---');
  const est = `${row(1)} [data-field="estimate"]`;
  eq('the first task carries its estimate', await page.inputValue(est), '40');
  await page.fill(est, '60');
  await page.waitForTimeout(700);
  eq('the total moved by the difference', await page.textContent('#effort-estimate'), '568h');

  console.log('\n--- a blank estimate is not zero ---');
  // The difference matters: a plan with unestimated work should say so rather
  // than quietly report a total that is missing half of it.
  await page.fill(est, '');
  await page.waitForTimeout(700);
  eq('clearing it removes it from the total', await page.textContent('#effort-estimate'), '508h');
  eq('and adds it to the unestimated count',
     await page.textContent('#effort-unestimated'), '1 task not estimated');
  await page.fill(est, '40');
  await page.waitForTimeout(700);

  console.log('\n--- the critical path is marked and summarised ---');
  const note = await page.textContent('#tasks-schedule-note');
  eq('the note names the path', note.includes('critical path runs through 8 tasks'), true);
  eq('and its length in days', note.includes('103 days'), true);
  eq('the rows on it are flagged', await page.locator('#tracker-body tr.is-critical').count(), 8);
  eq('with a marker, not just a class', await page.locator('#tracker-body tr.is-critical .crit-dot').count(), 8);

  console.log('\n--- the plan disagreeing with itself is reported, once ---');
  eq('one overlap is called out', note.includes('1 task start'), true);
  eq('and the row shows it', await page.locator('.dep-chip.is-clash').count(), 1);

  console.log('\n--- blocked work is visible without opening anything ---');
  eq('blocked rows are chipped', await page.locator('.dep-chip.is-blocked').count() > 0, true);
  eq('and the board says so too', await page.locator('.board-card__blocked').count() > 0, true);

  console.log('\n--- a task opens to show what it waits for ---');
  await page.click(`${row(3)} .dep-chip`);
  await page.waitForTimeout(500);
  eq('a drawer appeared', await page.locator('.task-detail').count(), 1);
  eq('it names the prerequisite', await page.textContent('.task-detail .dep-list__ref'), 'T-102');

  console.log('\n--- and a checklist, which counts itself ---');
  eq('the toggle shows the tally', await page.textContent(`${row(3)} .check-toggle`), '2/4');
  eq('four items', await page.locator('.task-detail .checklist__item').count(), 4);
  eq('two already done', await page.locator('.task-detail .checklist__item.is-done').count(), 2);

  await page.check('.task-detail .checklist__item:nth-child(3) .checklist__box');
  await page.waitForTimeout(700);
  eq('ticking one updates the tally', await page.textContent(`${row(3)} .check-toggle`), '3/4');
  await page.check('.task-detail .checklist__item:nth-child(4) .checklist__box');
  await page.waitForTimeout(700);
  eq('finishing them all is marked', await page.textContent(`${row(3)} .check-toggle`), '4/4');
  eq('and shown as complete',
     (await page.getAttribute(`${row(3)} .check-toggle`, 'class')).includes('is-complete'), true);

  console.log('\n--- items can be added, edited and removed ---');
  await page.click('.task-detail [data-action="add-item"]');
  await page.waitForTimeout(600);
  eq('a fifth item', await page.locator('.task-detail .checklist__item').count(), 5);
  await page.fill('.task-detail .checklist__item:nth-child(5) .checklist__text', 'Hand the evidence to the client');
  await page.waitForTimeout(700);
  eq('the tally counts it as outstanding', await page.textContent(`${row(3)} .check-toggle`), '4/5');
  await page.click('.task-detail .checklist__item:nth-child(5) [data-action="delete-item"]');
  await page.waitForTimeout(600);
  eq('removing it puts the tally back', await page.textContent(`${row(3)} .check-toggle`), '4/4');

  console.log('\n--- a checklist survives a reload ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  await page.click('#tab-tasks');
  await page.waitForTimeout(600);
  eq('the ticks persisted', await page.textContent(`${row(3)} .check-toggle`), '4/4');
  eq('and the drawer is closed again, because that is a view preference',
     await page.locator('.task-detail').count(), 0);

  console.log('\n--- a dependency can be added and removed ---');
  // On a brand-new task, because it is the one row that can gain any edge:
  // nothing depends on it yet, so no choice can close a loop.
  await page.click('#page-tasks [data-action="add-task-row"]');
  await page.waitForTimeout(800);
  // Named by id rather than :last-of-type — once a drawer is open the last row
  // in the table is the drawer, which is not a task.
  const newId = await page.$$eval('#tracker-body tr[data-id]', (els) => els[els.length - 1].dataset.id);
  const fresh = `#tracker-body tr[data-id="${newId}"]`;
  await page.fill(`${fresh} [data-field="name"]`, 'Close the transition');
  await page.waitForTimeout(700);
  await page.click(`${fresh} .dep-chip`);
  await page.waitForTimeout(600);
  eq('a new task waits for nothing',
     (await page.textContent('.task-detail')).includes('can start whenever'), true);

  const blockedBefore = await page.locator('.dep-chip.is-blocked').count();

  console.log('\n--- waiting for finished work is not being blocked ---');
  // T-101 is Complete. A tool that called this "blocked" would have everyone
  // ignoring the blocked marker within a week.
  await page.selectOption('.task-detail [data-action="add-dep"]', { index: 1 });
  await page.waitForTimeout(900);
  eq('the dependency is recorded', await page.locator('.task-detail .dep-list__item').count(), 1);
  eq('but nothing new is blocked',
     await page.locator('.dep-chip.is-blocked').count(), blockedBefore);

  console.log('\n--- waiting for unfinished work is ---');
  await page.selectOption('.task-detail [data-action="add-dep"]',
    { label: 'T-103 · PAM access onboarding (all engineers)' });
  await page.waitForTimeout(900);
  eq('two prerequisites now', await page.locator('.task-detail .dep-list__item').count(), 2);
  eq('and the task counts as blocked',
     await page.locator('.dep-chip.is-blocked').count(), blockedBefore + 1);

  await page.click('.task-detail .dep-list__item:nth-child(2) [data-action="remove-dep"]');
  await page.waitForTimeout(800);
  eq('removing the unfinished one frees it again',
     await page.locator('.dep-chip.is-blocked').count(), blockedBefore);
  eq('and the finished one is still recorded',
     await page.locator('.task-detail .dep-list__item').count(), 1);

  console.log('\n--- a loop is refused at the point of choosing ---');
  // The strongest case the app can make: T-101 is upstream of the whole plan,
  // so every other task is downstream of it and only the task we just added --
  // which now waits for T-101 itself -- could ever be offered. It cannot.
  await page.click(`${fresh} .dep-chip`);          // close that drawer
  await page.waitForTimeout(400);
  await page.click(`${row(1)} .dep-chip`);
  await page.waitForTimeout(600);
  const offered = await page.$$eval('.task-detail [data-action="add-dep"] option',
    (els) => els.map((e) => e.textContent));
  eq('nothing at all can be offered', offered.length, 1);
  eq('and the placeholder says why it is empty rather than sitting blank',
     offered[0], 'Nothing else it could wait for');
  await page.click(`${row(1)} .dep-chip`);
  await page.waitForTimeout(400);

  console.log('\n--- deleting a task does not break what pointed at it ---');
  await page.click(`${row(1)} [data-action="delete-task-row"]`);
  await page.waitForTimeout(900);
  eq('no error was thrown', errors.length, 0);
  eq('the plan still reports a critical path',
     (await page.textContent('#tasks-schedule-note')).includes('critical path'), true);

  console.log('\n--- the new fields survive a round trip through sync ---');
  const kinds = await page.evaluate(async () => {
    const t = (await import('/js/state.js')).getState().dashTasks[0];
    return { checklist: Array.isArray(t.checklist), deps: Array.isArray(t.dependsOn), est: 'estimate' in t };
  });
  eq('a task carries a checklist array', kinds.checklist, true);
  eq('and a dependency array', kinds.deps, true);
  eq('and an estimate field', kinds.est, true);

  console.log('\n--- an older project gains the fields rather than breaking ---');
  const migrated = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    // A task shaped the way it was before any of this existed.
    const raw = {
      projectName: 'Legacy',
      milestones: [],
      dashTasks: [{ id: 'old-1', name: 'Ancient', status: 'Not Started' }],
    };
    const p = state.importProjectFromJSON(raw, 'Legacy');
    const t = state.listFullProjects().find((x) => x.id === p.id).dashTasks[0];
    return { checklist: t.checklist, dependsOn: t.dependsOn, estimate: t.estimate, spent: t.spent };
  });
  eq('checklist defaults to empty', migrated.checklist, []);
  eq('dependencies default to empty', migrated.dependsOn, []);
  eq('estimate stays blank rather than becoming zero', migrated.estimate, '');
  eq('and so does spent', migrated.spent, '');

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
