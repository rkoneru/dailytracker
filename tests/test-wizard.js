// The execution wizard, and the workflow an administrator sets for a project.
//
// The thing worth pinning hardest is that the wizard *changes the task*. A
// wizard whose only output is a note saying you thought about the problem is a
// quiz, and people stop opening quizzes. So most of these checks are of the
// form "after running it, is the task actually different in the way the method
// promised".
//
// The second is that nothing is written until the last screen. It
// reprioritises, reschedules and raises issues, so a Cancel that half-applied
// would be worse than no wizard at all.

const { APP_URL, API_URL, launch, createChecks, openSection } = require('./harness');

const PROJECT = '10000000-0000-4000-8000-0000000000bb';
const ADMIN = '00000000-0000-4000-8000-0000000000c1';

const task = (page, i) => page.evaluate(async (index) => {
  const { getState } = await import('/js/state.js');
  const t = getState().dashTasks[index];
  return {
    name: t.name, prio: t.prio, status: t.status, comments: t.comments,
    checklist: (t.checklist || []).map((c) => c.text),
    estimate: t.estimate, end: t.end, execution: t.execution || null,
    nextAction: t.nextAction || '', doneWhen: t.doneWhen || null,
  };
}, i);

(async () => {
  const browser = await launch();
  const { eq, done } = createChecks();
  const errors = [];

  async function fresh() {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#tab-tasks .nav-row__label');
    await page.waitForTimeout(500);
    await openSection(page, 'sec-task-list');
    return { context, page };
  }

  const open = async (page, row) => {
    await page.click(`#tracker-body tr:nth-child(${row}) [data-action="run-wizard"]`);
    await page.waitForTimeout(500);
  };
  const next = async (page, times = 1) => {
    for (let i = 0; i < times; i += 1) {
      await page.click('#btn-wizard-next');
      await page.waitForTimeout(200);
    }
  };

  // ---------- the map is on screen ----------

  console.log('\n--- the wizard is the map ---');
  {
    const { context, page } = await fresh();
    eq('every task offers it',
       await page.locator('[data-action="run-wizard"]').count(),
       await page.locator('#tracker-body tr').count());

    await open(page, 1);
    eq('it opens', await page.locator('#wizard-overlay').isVisible(), true);
    eq('on step one', (await page.textContent('#wizard-eyebrow')).includes('Step 1 of 7'), true);
    eq('asking the map’s first question',
       await page.textContent('.wizard-question__text'), 'Why am I stuck?');
    eq('with the five triggers it lists',
       await page.$$eval('.wizard-method__name', (e) => e.map((x) => x.textContent)),
       ['Elephant', '5 minutes', 'Eat the frog', 'Next action', '1–3 priorities']);
    // Seven steps plus the review screen, so the end is visible from the start.
    eq('and a rail showing the whole journey', await page.locator('.wizard-step').count(), 8);

    console.log('\n--- nothing is written until the last screen ---');
    const before = await task(page, 0);
    await page.click('[data-method="frog"]');
    await page.waitForTimeout(300);
    await next(page, 7);
    eq('the review screen says so',
       (await page.textContent('#wizard-eyebrow')).includes('nothing has been saved'), true);
    eq('and the task is untouched so far', (await task(page, 0)).prio, before.prio);

    await page.click('#btn-wizard-close');
    await page.waitForTimeout(400);
    eq('closing without saving changes nothing', (await task(page, 0)).prio, before.prio);
    eq('and leaves no record of the run', (await task(page, 0)).execution, null);
    await context.close();
  }

  // ---------- each method does what it says ----------

  console.log('\n--- the elephant writes real steps ---');
  {
    const { context, page } = await fresh();
    await open(page, 1);
    await page.click('[data-method="elephant"]');
    await page.waitForTimeout(300);
    await page.fill('[data-field="steps"]', 'Pull the numbers\n- Draft it\n• Send it');
    await next(page, 7);
    await page.click('#btn-wizard-next');
    await page.waitForTimeout(700);

    const after = await task(page, 0);
    // Bullets people paste in are stripped: a checklist item called "- Draft
    // it" is the kind of small ugliness that makes a feature feel unfinished.
    eq('three checklist items, bullets stripped', after.checklist,
       ['Pull the numbers', 'Draft it', 'Send it']);
    eq('and it recorded what was decided', after.execution.applied[0].summary, 'Broken into 3 steps');
    await context.close();
  }

  console.log('\n--- eat the frog actually reprioritises ---');
  {
    const { context, page } = await fresh();
    await open(page, 7);
    const before = await task(page, 6);
    await page.click('[data-method="frog"]');
    await next(page, 7);
    await page.click('#btn-wizard-next');
    await page.waitForTimeout(700);
    const after = await task(page, 6);
    eq('the priority moved', [before.prio, after.prio], ['Low', 'High']);
    eq('and said why', after.comments.includes('Eat the frog'), true);
    await context.close();
  }

  console.log('\n--- the Eisenhower matrix maps to a real verdict ---');
  {
    const { context, page } = await fresh();
    await open(page, 7);
    await next(page);                       // skip step one by moving past it
    await page.click('[data-method="eisenhower"]');
    await page.waitForTimeout(300);
    await page.check('input[name="important"][value="Not important"]');
    await page.check('input[name="urgent"][value="Not urgent"]');
    await next(page, 6);
    eq('neither important nor urgent is "eliminate it"',
       (await page.textContent('.wizard-summary__what')), 'Eliminate it');
    await page.click('#btn-wizard-next');
    await page.waitForTimeout(700);
    const after = await task(page, 6);
    eq('which parks it rather than deleting it', [after.prio, after.status], ['Low', 'On Hold']);
    await context.close();
  }

  console.log('\n--- a definition of done becomes something you can tick ---');
  {
    const { context, page } = await fresh();
    await open(page, 1);
    await next(page, 5);                    // straight to step six
    eq('step six asks when it is done',
       await page.textContent('.wizard-question__text'), 'When is this really done?');
    await page.click('[data-method="definition-of-done"]');
    await page.waitForTimeout(300);
    await page.fill('[data-field="criteria"]', 'Reviewed by Sam\nNumbers tie to the ledger');
    await next(page, 2);
    await page.click('#btn-wizard-next');
    await page.waitForTimeout(700);
    const after = await task(page, 0);
    eq('the criteria are stored', after.doneWhen, ['Reviewed by Sam', 'Numbers tie to the ledger']);
    eq('and are on the checklist, prefixed so they read as the bar',
       after.checklist, ['Done when: Reviewed by Sam', 'Done when: Numbers tie to the ledger']);
    await context.close();
  }

  console.log('\n--- naming a block raises it where somebody can clear it ---');
  {
    const { context, page } = await fresh();
    const raidBefore = await page.evaluate(async () =>
      (await import('/js/state.js')).getState().raid.length);
    await open(page, 1);
    await next(page, 4);                    // to step five
    await page.click('[data-method="identify-block"]');
    await page.waitForTimeout(300);
    await page.check('input[name="kind"][value="People"]');
    await page.check('input[name="move"][value="Ask for help"]');
    await next(page, 3);
    eq('the review warns an issue will be raised',
       (await page.textContent('#wizard-body')).includes('will also be raised'), true);
    await page.click('#btn-wizard-next');
    await page.waitForTimeout(700);

    const raid = await page.evaluate(async () => {
      const log = (await import('/js/state.js')).getState().raid;
      return { count: log.length, last: log[log.length - 1] };
    });
    eq('a RAID issue was raised', raid.count, raidBefore + 1);
    eq('naming the block', raid.last.title.includes('blocked on people'), true);
    eq('with the agreed move as the next step', raid.last.action, 'Ask for help');
    eq('and the task is on hold', (await task(page, 0)).status, 'On Hold');
    await context.close();
  }

  console.log('\n--- a skipped step leaves no trace ---');
  {
    const { context, page } = await fresh();
    await open(page, 1);
    const before = await task(page, 0);
    await page.click('#btn-wizard-skip');
    await page.waitForTimeout(200);
    await next(page, 6);
    eq('a run of nothing says nothing will change',
       (await page.textContent('#wizard-body')).includes('nothing will change'), true);
    eq('and the button says close, not save',
       await page.textContent('#btn-wizard-next'), 'Close');
    await page.click('#btn-wizard-next');
    await page.waitForTimeout(500);
    eq('the comments are untouched', (await task(page, 0)).comments, before.comments);
    await context.close();
  }

  console.log('\n--- choosing a method twice unchooses it ---');
  {
    const { context, page } = await fresh();
    await open(page, 1);
    await page.click('[data-method="frog"]');
    await page.waitForTimeout(250);
    eq('selected', await page.getAttribute('[data-method="frog"]', 'aria-pressed'), 'true');
    await page.click('[data-method="frog"]');
    await page.waitForTimeout(250);
    eq('and unselected', await page.getAttribute('[data-method="frog"]', 'aria-pressed'), 'false');
    await context.close();
  }

  // ---------- the administrator's side ----------

  console.log('\n--- an administrator shapes the wizard for the project ---');
  {
    await fetch(`${API_URL}/__reset`);
    await fetch(`${API_URL}/__seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projects: [{ id: PROJECT, owner_id: ADMIN, data: { projectName: 'Run' }, rev: 1 }],
        profiles: [{ id: ADMIN, email: 'boss@x.test', display_name: 'Boss' }],
        members: [{ project_id: PROJECT, user_id: ADMIN, role: 'owner', job_role: 'engagement-lead', can_admin: true }],
        // A task on the server, because syncing this project down replaces
        // whatever the local sample had — which is correct behaviour, and
        // leaves the wizard nothing to open unless the server has one.
        rows: [{
          id: '20000000-0000-4000-8000-0000000000d1',
          project_id: PROJECT, kind: 'dashTasks', rev: 1,
          data: { name: 'Ship the thing', status: 'Not Started', prio: 'Medium', checklist: [], comments: '' },
        }],
      }),
    });

    const context = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(({ api, id }) => {
      localStorage.setItem('projectPlannerSupabaseConfig_v1', JSON.stringify({ url: api, anonKey: 'anon' }));
      localStorage.setItem('projectPlannerSupabaseSession_v1', JSON.stringify({
        access_token: 'fake', refresh_token: 'fake',
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: { id, email: 'boss@x.test' },
      }));
    }, { api: API_URL, id: ADMIN });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    // Point the local project at the one the fake server knows about. The
    // store is written on boot and keys projects by id, so this waits for it
    // and then re-keys rather than editing a field that does not exist.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('projectPlannerStore_v2');
      return !!raw && Object.keys(JSON.parse(raw).projects || {}).length > 0;
    }, null, { timeout: 8000 });
    await page.evaluate((id) => {
      const store = JSON.parse(localStorage.getItem('projectPlannerStore_v2'));
      const [oldId] = Object.keys(store.projects);
      const project = store.projects[oldId];
      delete store.projects[oldId];
      project.id = id;
      store.projects[id] = project;
      store.activeProjectId = id;
      localStorage.setItem('projectPlannerStore_v2', JSON.stringify(store));
    }, PROJECT);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(900);
    await openSection(page, 'sec-settings-workflow');
    eq('the editor is there for an admin', await page.locator('#admin-workflow').isVisible(), true);
    eq('with all seven steps', await page.locator('.workflow-step').count(), 7);
    eq('and every method of the map', await page.locator('.workflow-method').count(), 16);
    eq('the editor uses its own attributes, not the wizard\u2019s',
       await page.locator('#workflow-steps [data-method]').count(), 0);

    // Turn off two steps and drop a method from another.
    await page.uncheck('[data-step-toggle="habit"]');
    await page.uncheck('[data-step-toggle="unstick"]');
    await page.waitForTimeout(200);
    await page.uncheck('[data-wf-step="choose"][data-wf-method="elephant"]');
    await page.fill('#wf-wip', '2');
    await page.dispatchEvent('#wf-wip', 'change');
    await page.click('#btn-save-workflow');
    await page.waitForTimeout(1000);

    const saved = await (await fetch(`${API_URL}/__dump`)).json();
    const policy = saved.policies.find((p) => p.project_id === PROJECT);
    eq('it reached the server', !!policy, true);
    eq('with the two steps removed', policy.workflow.steps.includes('habit'), false);
    eq('and the method dropped', policy.workflow.methods.choose.includes('elephant'), false);
    eq('and the WIP limit set', policy.workflow.wipLimit, 2);

    console.log('\n--- and the wizard follows it ---');
    await page.click('#tab-tasks .nav-row__label');
    await page.waitForTimeout(600);
    await openSection(page, 'sec-task-list');
    eq('the project still has its tasks after syncing',
       (await page.locator('#tracker-body tr').count()) > 0, true);
    await open(page, 1);
    eq('five steps now, not seven',
       (await page.textContent('#wizard-eyebrow')).includes('Step 1 of 5'), true);
    eq('and the elephant is not offered',
       (await page.$$eval('.wizard-method__name', (e) => e.map((x) => x.textContent)))
         .includes('Elephant'), false);
    eq('the rail is shorter too', await page.locator('.wizard-step').count(), 6);

    console.log('\n--- a required step cannot be skipped ---');
    await page.click('#btn-wizard-close');
    await page.waitForTimeout(300);
    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(800);
    await openSection(page, 'sec-settings-workflow');
    await page.check('[data-step-required="choose"]');
    await page.click('#btn-save-workflow');
    await page.waitForTimeout(900);

    await page.click('#tab-tasks .nav-row__label');
    await page.waitForTimeout(600);
    await openSection(page, 'sec-task-list');
    await open(page, 1);
    eq('the skip button is withdrawn', await page.locator('#btn-wizard-skip').isVisible(), false);
    eq('and Next is refused until a method is chosen',
       await page.locator('#btn-wizard-next').isDisabled(), true);
    await page.click('[data-method="frog"]');
    await page.waitForTimeout(250);
    eq('choosing one releases it', await page.locator('#btn-wizard-next').isDisabled(), false);

    await context.close();
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
