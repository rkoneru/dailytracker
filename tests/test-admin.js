// Administered roles and page access.
//
// The question this suite answers is narrow and important: when an
// administrator assigns a role and a set of pages, does the app stop letting
// the person decide for themselves? Not "can they be stopped by a determined
// attacker" — they cannot, and the app says so on screen — but "does the
// product honour the policy", which is what an administrator is actually
// buying.
//
// What a determined attacker runs into is Postgres, and that is tested for
// real in tests/test-rls.js.

const { APP_URL, API_URL, launch, createChecks, openSection } = require('./harness');

const PROJECT = '10000000-0000-4000-8000-0000000000aa';
const ME = '00000000-0000-4000-8000-00000000000a';
const OWNER = '00000000-0000-4000-8000-00000000000b';

async function signIn(page, { userId = ME, email = 'tester@x.test' } = {}) {
  await page.evaluate(({ api, id, mail }) => {
    localStorage.setItem('projectPlannerSupabaseConfig_v1', JSON.stringify({ url: api, anonKey: 'anon' }));
    localStorage.setItem('projectPlannerSupabaseSession_v1', JSON.stringify({
      access_token: 'fake', refresh_token: 'fake',
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id, email: mail },
    }));
  }, { api: API_URL, id: userId, mail: email });
}

/**
 * Points the app's active project at the one the fake server knows about.
 *
 * The store keys projects by id, so this re-keys rather than editing a field —
 * an earlier version assumed an array, found undefined, and silently did
 * nothing, which made the suite pass for a reason that had nothing to do with
 * what it claimed to test.
 */
async function useProject(page) {
  // The store is written on boot, and localStorage was cleared a moment ago,
  // so the app has to run once before there is anything to point at.
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
}

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
    return { context, page };
  }

  const visibleNav = (page) => page.$$eval('.nav-row:visible', (els) => els
    .filter((e) => !e.classList.contains('nav-row--group'))
    .map((e) => e.querySelector('.nav-row__label').textContent));

  // ---------- on a device of your own ----------

  console.log('\n--- with no account, the role is yours to set ---');
  {
    const { context, page } = await fresh();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    eq('the picker is usable', await page.locator('#role-select').isDisabled(), false);
    eq('nothing claims it was assigned', await page.locator('#role-assigned').isVisible(), false);
    eq('and the escape hatch is offered', await page.locator('#role-show-all-row').isVisible(), true);

    await page.selectOption('#role-select', 'tester');
    await page.waitForTimeout(400);
    eq('choosing a role narrows the nav', (await visibleNav(page)).includes('Plan'), false);
    eq('and it sticks', await page.inputValue('#role-select'), 'tester');

    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(600);
    eq('Settings says this is a local device',
       await page.textContent('#ws-count-mode .kpi__value'), 'This device');
    eq('and that access is unrestricted here',
       await page.textContent('#ws-count-access .kpi__value'), 'Full');
    await openSection(page, 'sec-settings-people');
    eq('the admin panel explains itself rather than appearing empty',
       await page.locator('#admin-denied').isVisible(), true);
    await context.close();
  }

  // ---------- governed by a workspace ----------

  console.log('\n--- an assignment overrides what the device chose ---');
  {
    await fetch(`${API_URL}/__reset`);
    await fetch(`${API_URL}/__seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projects: [{ id: PROJECT, owner_id: OWNER, data: { projectName: 'Governed' }, rev: 1 }],
        profiles: [{ id: ME, email: 'tester@x.test', display_name: 'Tester' }],
        members: [{ project_id: PROJECT, user_id: ME, role: 'contributor', job_role: 'tester', can_admin: false }],
        policies: [{
          project_id: PROJECT,
          pages: { tester: ['tab-mywork', 'tab-tasks', 'tab-settings'] },
          require_sign_in: true,
        }],
      }),
    });

    const { context, page } = await fresh();
    await signIn(page);
    await useProject(page);
    // The role this device had picked for itself, which the assignment must beat.
    await page.evaluate(() => localStorage.setItem('projectPlannerRole_v1', '"engagement-lead"'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    eq('the assigned role is the one in force', await page.inputValue('#role-select'), 'tester');
    eq('the picker is locked', await page.locator('#role-select').isDisabled(), true);
    eq('and says who locked it', await page.locator('#role-assigned').isVisible(), true);
    // The escape hatch has to go with it, or the policy is advisory.
    eq('"show every page" is withdrawn', await page.locator('#role-show-all-row').isVisible(), false);

    const nav = await visibleNav(page);
    eq('the nav is the three pages the policy allows',
       ['My Work', 'Tasks', 'Settings'].every((label) => nav.includes(label)), true);
    eq('and nothing else', nav.includes('Portfolio') || nav.includes('Reports'), false);

    console.log('\n--- and it cannot be argued with from this side ---');
    // Turning the escape hatch on by hand is the obvious try: it is a
    // localStorage flag. It must not reopen the nav.
    await page.evaluate(() => localStorage.setItem('projectPlannerShowAllNav_v1', 'true'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    eq('setting the show-all flag by hand changes nothing',
       (await visibleNav(page)).includes('Portfolio'), false);

    // Writing a different role into localStorage is the other obvious try.
    await page.evaluate(() => localStorage.setItem('projectPlannerRole_v1', '"engagement-lead"'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    eq('so does writing a different role into storage',
       await page.inputValue('#role-select'), 'tester');

    console.log('\n--- Settings reports the governed state honestly ---');
    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(800);
    eq('it says you are in a workspace',
       await page.textContent('#ws-count-mode .kpi__value'), 'Workspace');
    eq('and what your access actually is',
       await page.textContent('#ws-count-access .kpi__value'), 'Contributor');
    eq('and that the job role was assigned',
       await page.textContent('#ws-count-job .kpi__sub'), 'Assigned by an administrator');

    await openSection(page, 'sec-settings-people');
    eq('a contributor cannot reach the admin controls',
       await page.locator('#admin-denied').isVisible(), true);
    eq('nor the page policy editor',
       await page.locator('#admin-pages').isVisible(), false);

    console.log('\n--- the page never claims hiding is security ---');
    await openSection(page, 'sec-settings-security');
    const facts = await page.$$eval('.security-fact', (els) => els.map((e) => ({
      title: e.querySelector('.security-fact__title').textContent,
      body: e.querySelector('.security-fact__body').textContent,
      tone: [...e.classList].find((c) => c.startsWith('is-')),
    })));
    eq('every guarantee is stated', facts.length, 5);
    const pages = facts.find((f) => f.title.includes('pages'));
    eq('page hiding is marked as not a boundary', pages.body.includes('Not a security boundary'), true);
    eq('and is not dressed up as enforced', pages.tone, 'is-warn');
    const data = facts.find((f) => f.title.includes('read and change'));
    eq('while the real boundary says where it lives', data.body.includes('row level security'), true);
    eq('and reads as enforced', data.tone, 'is-good');

    await context.close();
  }

  // ---------- administering ----------

  console.log('\n--- an administrator gets the controls ---');
  {
    await fetch(`${API_URL}/__reset`);
    await fetch(`${API_URL}/__seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projects: [{ id: PROJECT, owner_id: ME, data: { projectName: 'Mine' }, rev: 1 }],
        profiles: [
          { id: ME, email: 'boss@x.test', display_name: 'Boss' },
          { id: OWNER, email: 'dev@x.test', display_name: 'Dev' },
        ],
        members: [
          { project_id: PROJECT, user_id: ME, role: 'owner', job_role: 'engagement-lead', can_admin: true },
          { project_id: PROJECT, user_id: OWNER, role: 'contributor', job_role: '', can_admin: false },
        ],
      }),
    });

    const { context, page } = await fresh();
    await signIn(page, { email: 'boss@x.test' });
    await useProject(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(900);
    await openSection(page, 'sec-settings-people');
    eq('the owner sees the member table', await page.locator('#admin-people').isVisible(), true);
    eq('with everyone in it', await page.locator('#members-body tr').count(), 2);

    // Your own row is the one an admin must not be able to edit — it is the
    // shortest path from "can administer" to "owns everything".
    const own = page.locator(`#members-body tr[data-user="${ME}"]`);
    eq('your own access is not editable',
       await own.locator('[data-field="accessRole"]').isDisabled(), true);
    eq('nor your own job role',
       await own.locator('[data-field="jobRole"]').isDisabled(), true);
    eq('nor your own admin grant',
       await own.locator('[data-field="canAdmin"]').isDisabled(), true);

    console.log('\n--- assigning somebody a job role ---');
    const other = page.locator(`#members-body tr[data-user="${OWNER}"]`);
    await other.locator('[data-field="jobRole"]').selectOption('service-manager');
    await page.waitForTimeout(700);
    const dump = await (await fetch(`${API_URL}/__dump`)).json();
    const saved = dump.members.find((m) => m.user_id === OWNER);
    eq('it reached the server', saved.job_role, 'service-manager');

    console.log('\n--- setting page access ---');
    await openSection(page, 'sec-settings-pages');
    eq('the policy editor is there', await page.locator('#admin-pages').isVisible(), true);
    eq('with a column per job role', await page.locator('.policy-role').count(), 7);
    // Defaults rather than a blank sheet: saving an empty policy would leave
    // every role with nothing.
    const ticked = await page.locator('.policy-page input:checked').count();
    eq('and starts from the defaults, not empty', ticked > 20, true);

    await page.uncheck('#policy-tester-tab-tasks');
    await page.check('#policy-require-signin');
    await page.click('#btn-save-policy');
    await page.waitForTimeout(900);

    const after = await (await fetch(`${API_URL}/__dump`)).json();
    const policy = after.policies.find((p) => p.project_id === PROJECT);
    eq('the policy was written', !!policy, true);
    eq('with the page removed', (policy.pages.tester || []).includes('tab-tasks'), false);
    eq('and the sign-in expectation recorded', policy.require_sign_in, true);

    await context.close();
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
