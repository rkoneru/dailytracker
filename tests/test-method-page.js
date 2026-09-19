// The Method card on the Plan page.
//
// Its whole point is that it stores nothing: the phase strip is read off the
// milestone table directly beneath it, so the interesting failures are the
// ones where the two stop agreeing — a milestone is ticked and the strip still
// says 0%, a milestone is moved to another phase and stays counted in the old
// one, the method is switched and milestones keep tags the new method has no
// phase for.
//
// The rest is that the card says true things: a lifecycle is numbered because
// it is a sequence, a practice is not because it is not, and a phase nobody
// has planned reads "Not planned" rather than a green 0%.

const { APP_URL, launch, createChecks, openSection } = require('./harness');

async function useTemplate(page, key) {
  await page.click('#btn-projects');
  await page.waitForTimeout(250);
  await page.locator(`#template-${key}`).scrollIntoViewIfNeeded();
  await page.check(`#template-${key}`);
  await page.click('#btn-create-project');
  await page.waitForTimeout(600);
}

async function openMethod(page) {
  await page.click('#tab-planner .nav-row__label');
  await page.waitForTimeout(400);
  await openSection(page, 'sec-milestones');
  await page.waitForTimeout(250);
}

const phaseCards = (page) => page.$$eval('.method-phase', (els) => els.map((e) => ({
  n: e.querySelector('.method-phase__n')?.textContent || '',
  name: e.querySelector('.method-phase__name').textContent,
  count: e.querySelector('.method-phase__count').textContent,
  items: [...e.querySelectorAll('.method-phase__item')].length,
  tone: [...e.classList].filter((c) => c.startsWith('is-')).join(' '),
})));

(async () => {
  const browser = await launch();
  const { eq, done } = createChecks();
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // ---------- a lifecycle ----------

  console.log('\n--- a CRISP-DM project shows its six phases ---');
  await useTemplate(page, 'ml-model');
  await openMethod(page);

  eq('the method is named', await page.inputValue('#method-select'), 'crisp-dm');
  const crisp = await phaseCards(page);
  eq('all six are there', crisp.length, 6);
  eq('in order', crisp.map((c) => c.name),
     ['Business Understanding', 'Data Understanding', 'Data Preparation',
      'Modeling', 'Evaluation', 'Deployment']);
  eq('numbered, because a lifecycle is a sequence',
     crisp.map((c) => c.n), ['I', 'II', 'III', 'IV', 'V', 'VI']);
  eq('each says what has to be true to leave it',
     await page.locator('.method-phase__gate').count(), 6);
  eq('and nothing calls them capabilities',
     await page.locator('.method-note').count(), 0);

  console.log('\n--- the counts come from the milestones below ---');
  const listed = await page.$$eval('.method-phase__item', (e) => e.length);
  const rows = await page.locator('#milestones-body tr').count();
  eq('every milestone appears in exactly one phase', listed, rows);
  eq('the finished phases say so', crisp[0].count, '1/1 · 100%');
  eq('and read as done', crisp[0].tone.includes('is-done'), true);
  eq('the phase in progress does not', crisp[3].count.endsWith('· 80%'), true);

  console.log('\n--- ticking a milestone moves the strip ---');
  // Relative rather than absolute: the template arrives with three phases
  // already finished, and an absolute count here would be asserting the
  // template's contents rather than that the strip followed the tick.
  const struckBefore = await page.locator('.method-phase__item.is-done').count();
  // The fourth milestone is the Modeling one, and it is the only one in that
  // phase — so ticking it has to take the phase from part-done to done.
  await page.locator('#milestones-body tr').nth(3).locator('[data-field="done"]').check();
  await page.waitForTimeout(500);
  const ticked = await phaseCards(page);
  eq('the phase is now complete', ticked[3].count, '1/1 · 100%');
  eq('and reads as done', ticked[3].tone.includes('is-done'), true);
  eq('and the milestone is struck through in the strip',
     await page.locator('.method-phase__item.is-done').count(), struckBefore + 1);

  console.log('\n--- and moving one between phases moves the count ---');
  await page.locator('#milestones-body tr').nth(3).locator('[data-field="phase"]')
    .selectOption('deployment');
  await page.waitForTimeout(500);
  const moved = await phaseCards(page);
  eq('the old phase is empty and says so', moved[3].count, 'Not planned');
  eq('and is greyed rather than shown as 0%', moved[3].tone.includes('is-unplanned'), true);
  eq('the new phase picked it up', moved[5].items, 2);

  console.log('\n--- switching method drops tags it cannot honour ---');
  // CRISP-DM's sixth phase is "deployment"; CPMAI's is "operationalize". The
  // milestone just moved is the one that must not survive the switch.
  await page.selectOption('#method-select', 'cpmai');
  await page.waitForTimeout(600);
  const cpmai = await phaseCards(page);
  eq('the new phase names are shown', cpmai.map((c) => c.name),
     ['Business Understanding', 'Data Understanding', 'Data Preparation',
      'Data Modeling', 'Model Evaluation', 'Model Operationalization']);
  eq('the four shared phases kept their milestones',
     cpmai.slice(0, 3).map((c) => c.items), [1, 1, 1]);
  eq('and the two that were renamed did not',
     cpmai[5].count, 'Not planned');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await openMethod(page);
  eq('the switch survived a reload', await page.inputValue('#method-select'), 'cpmai');

  // ---------- a practice ----------

  console.log('\n--- a practice is not a sequence and does not pretend to be ---');
  await useTemplate(page, 'mlops-platform');
  await openMethod(page);
  eq('the method is MLOps', await page.inputValue('#method-select'), 'mlops');
  const mlops = await phaseCards(page);
  eq('six capabilities', mlops.length, 6);
  eq('none of them numbered', mlops.map((c) => c.n).join(''), '');
  const note = await page.textContent('.method-note');
  eq('and the card says why', note.includes('Capabilities, not stages'), true);
  eq('each one still has a bar it has to clear',
     await page.locator('.method-phase__gate').count(), 6);

  console.log('\n--- the LLMOps one too ---');
  await useTemplate(page, 'llmops-practice');
  await openMethod(page);
  eq('named', await page.inputValue('#method-select'), 'llmops');
  const llmops = await phaseCards(page);
  eq('with prompt versioning first', llmops[0].name, 'Prompt and config versioning');
  eq('and model change management last', llmops[5].name, 'Model change management');
  eq('unnumbered', llmops.map((c) => c.n).join(''), '');

  // ---------- no method ----------

  console.log('\n--- and a project that has no method says so plainly ---');
  await useTemplate(page, 'marketing');
  await openMethod(page);
  eq('nothing is claimed', await page.inputValue('#method-select'), '');
  eq('there is no strip', await page.locator('.method-phase').count(), 0);
  eq('there is an explanation instead', await page.locator('#method-empty').isVisible(), true);
  eq('and the milestone table does not offer a phase column',
     await page.locator('#milestone-phase-head').isVisible(), false);
  eq('nor a phase select on any row',
     await page.locator('#milestones-body [data-field="phase"]').count(), 0);

  console.log('\n--- picking one there turns it all on ---');
  await page.selectOption('#method-select', 'cpmai');
  await page.waitForTimeout(600);
  eq('the strip appears', await page.locator('.method-phase').count(), 6);
  eq('every phase unplanned, which is honest',
     await page.locator('.method-phase.is-unplanned').count(), 6);
  eq('the column appears', await page.locator('#milestone-phase-head').isVisible(), true);
  eq('and every milestone can now be placed',
     await page.locator('#milestones-body [data-field="phase"]').count(),
     await page.locator('#milestones-body tr').count());

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await context.close();
  await browser.close();
  done();
})();
