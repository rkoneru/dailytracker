// The sign-in screen and the demo accounts.
//
// Two things are being checked, and the first matters more than the second.
//
// One: that adding a login screen did not quietly add a login wall. This app
// works with no account, offline, and a fresh device must still open straight
// into it. A gate appears only where one was asked for.
//
// Two: that the demo is a demo all the way down — that it drives the real
// identity code rather than a parallel imitation of it, that the delegation
// rules the server enforces are the rules it demonstrates, and that every
// screen which normally says "enforced by the server" stops saying so when
// there is no server.

const { APP_URL, launch, createChecks, openSection } = require('./harness');

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
    await page.waitForTimeout(900);
    return { context, page };
  }

  const visibleNav = (page) => page.$$eval('.nav-row:visible', (els) => els
    .filter((e) => !e.classList.contains('nav-row--group'))
    .map((e) => e.querySelector('.nav-row__label').textContent));

  // ---------- the constraint ----------

  console.log('\n--- a fresh device is not asked to sign in ---');
  {
    const { context, page } = await fresh();
    eq('the app opens, not the login screen', await page.locator('#login-screen').isVisible(), false);
    eq('and it is usable', await page.locator('#page-dashboard').isVisible(), true);
    eq('with no demo banner', await page.locator('#demo-banner').isVisible(), false);

    console.log('\n--- but it is one click away ---');
    eq('the account button offers it', await page.textContent('#account-name'), 'Sign in');
    await page.click('#btn-account');
    await page.waitForTimeout(400);
    eq('and opens it', await page.locator('#login-screen').isVisible(), true);
    eq('with the whole cast', await page.locator('.login-account').count(), 5);
    eq('the administrator is marked out',
       await page.locator('.login-account.is-admin').count(), 2);
    eq('and there is a way past it', await page.locator('#btn-login-skip').isVisible(), true);

    console.log('\n--- the screen says what a demo account is not ---');
    const warning = await page.textContent('.login__warn');
    eq('that the people are invented', warning.includes('are not real'), true);
    eq('that there is no password', warning.includes('no password'), true);
    eq('and that it unlocks nothing', warning.includes('unlocks nothing'), true);

    await page.click('#btn-login-skip');
    await page.waitForTimeout(300);
    eq('declining closes it', await page.locator('#login-screen').isVisible(), false);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    eq('and is remembered', await page.locator('#login-screen').isVisible(), false);
    await context.close();
  }

  // ---------- signing in as the administrator ----------

  console.log('\n--- signing in as the administrator ---');
  {
    const { context, page } = await fresh();
    await page.click('#btn-account');
    await page.waitForTimeout(300);
    await page.click('[data-demo="demo-admin"]');
    await page.waitForTimeout(900);

    eq('the screen closes', await page.locator('#login-screen').isVisible(), false);
    eq('the banner comes up', await page.locator('#demo-banner').isVisible(), true);
    const banner = await page.textContent('#demo-banner-text');
    eq('naming who you are pretending to be', banner.includes('Avery Stone'), true);
    eq('and saying it is not enforced', banner.includes('Nothing here is enforced'), true);
    eq('there is no way to dismiss it',
       await page.locator('#demo-banner .btn-icon').count(), 0);
    eq('the sidebar agrees', await page.textContent('#account-role'), 'Demo account');

    console.log('\n--- and the admin screens are actually there ---');
    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(700);
    await openSection(page, 'sec-settings-people');
    eq('the member table is offered', await page.locator('#admin-people').isVisible(), true);
    eq('with everybody in it', await page.locator('#members-body tr').count(), 5);
    eq('and not the "you cannot" panel', await page.locator('#admin-denied').isVisible(), false);

    await openSection(page, 'sec-settings-pages');
    eq('so is the page policy editor', await page.locator('#admin-pages').isVisible(), true);
    await openSection(page, 'sec-settings-workflow');
    eq('and the workflow editor', await page.locator('#admin-workflow').isVisible(), true);

    console.log('\n--- your own row is still not yours to edit ---');
    const own = page.locator('#members-body tr[data-user="demo-admin"]');
    eq('not your access', await own.locator('[data-field="accessRole"]').isDisabled(), true);
    eq('not your job role', await own.locator('[data-field="jobRole"]').isDisabled(), true);

    console.log('\n--- an assignment sticks ---');
    await openSection(page, 'sec-settings-people');
    const dev = page.locator('#members-body tr[data-user="demo-dev"]');
    await dev.locator('[data-field="jobRole"]').selectOption('scrum-master');
    await page.waitForTimeout(600);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(700);
    await openSection(page, 'sec-settings-people');
    eq('across a reload',
       await page.locator('#members-body tr[data-user="demo-dev"] [data-field="jobRole"]').inputValue(),
       'scrum-master');

    console.log('\n--- Settings withdraws its own guarantees ---');
    await openSection(page, 'sec-settings-security');
    const facts = await page.$$eval('.security-fact', (els) => els.map((e) => ({
      title: e.querySelector('.security-fact__title').textContent,
      body: e.querySelector('.security-fact__body').textContent,
      tone: [...e.classList].find((c) => c.startsWith('is-')),
    })));
    eq('by adding one above them', facts.length, 6);
    eq('which is the first thing read', facts[0].title.includes('demo account'), true);
    eq('at the strongest tone on the page', facts[0].tone, 'is-bad');
    eq('and says the rest do not apply', facts[0].body.includes('Nothing below applies'), true);

    await openSection(page, 'sec-settings-workspace');
    eq('the mode tile says demo', await page.textContent('#ws-count-mode .kpi__value'), 'Demo');
    eq('and the access tile refuses to claim enforcement',
       await page.textContent('#ws-count-access .kpi__sub'), 'Nothing is enforced in a demo');
    await context.close();
  }

  // ---------- the delegation fences ----------

  console.log('\n--- a delegated administrator hits the same three walls ---');
  {
    const { context, page } = await fresh();
    await page.click('#btn-account');
    await page.waitForTimeout(300);
    await page.click('[data-demo="demo-manager"]');
    await page.waitForTimeout(900);

    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(700);
    await openSection(page, 'sec-settings-people');
    eq('they can administer', await page.locator('#admin-people').isVisible(), true);

    const owner = page.locator('#members-body tr[data-user="demo-admin"]');
    eq('the owner is not theirs to change',
       await owner.locator('[data-field="accessRole"]').isDisabled(), true);
    const dev = page.locator('#members-body tr[data-user="demo-dev"]');
    eq('nor is making a second administrator',
       await dev.locator('[data-field="canAdmin"]').isDisabled(), true);
    const self = page.locator('#members-body tr[data-user="demo-manager"]');
    eq('nor their own membership',
       await self.locator('[data-field="jobRole"]').isDisabled(), true);

    // Disabling a control is a courtesy, not the rule. The rule is in the
    // module, and it is the rule that has to hold when the control is bypassed
    // — which is exactly what a determined person does.
    console.log('\n--- and the rule holds when the controls are bypassed ---');
    const refused = await page.evaluate(async () => {
      const demo = await import('./js/demoAccounts.js');
      const tryIt = (userId, patch) => {
        try { demo.assignDemoMember(userId, patch); return 'allowed'; } catch (err) { return err.message; }
      };
      return {
        promote: tryIt('demo-dev', { accessRole: 'owner' }),
        anoint: tryIt('demo-dev', { canAdmin: true }),
        itself: tryIt('demo-manager', { accessRole: 'owner' }),
        owner: tryIt('demo-admin', { accessRole: 'viewer' }),
        allowed: tryIt('demo-dev', { jobRole: 'tester' }),
      };
    });
    eq('nobody is promoted to owner', refused.promote.includes('Only the owner'), true);
    eq('no second administrator is made', refused.anoint.includes('Only the owner'), true);
    eq('they cannot edit themselves', refused.itself.includes('their own membership'), true);
    eq('they cannot touch the owner', refused.owner.includes('cannot change the owner'), true);
    eq('while what they may do still works', refused.allowed, 'allowed');
    await context.close();
  }

  // ---------- a narrower account ----------

  console.log('\n--- signing in as the tester narrows the app ---');
  {
    const { context, page } = await fresh();
    await page.click('#btn-account');
    await page.waitForTimeout(300);
    await page.click('[data-demo="demo-tester"]');
    await page.waitForTimeout(1000);

    eq('the role follows the account', await page.inputValue('#role-select'), 'tester');
    eq('and is not theirs to change', await page.locator('#role-select').isDisabled(), true);
    eq('with the escape hatch withdrawn',
       await page.locator('#role-show-all-row').isVisible(), false);
    const nav = await visibleNav(page);
    eq('the nav loses the commercial pages', nav.includes('Scope & Contract'), false);
    eq('and keeps the ones a tester uses', nav.includes('Tasks') && nav.includes('My Work'), true);

    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(700);
    await openSection(page, 'sec-settings-people');
    eq('and there are no admin controls', await page.locator('#admin-denied').isVisible(), true);

    console.log('\n--- leaving the demo puts everything back ---');
    await page.click('#btn-demo-leave');
    await page.waitForTimeout(1000);
    eq('the banner goes', await page.locator('#demo-banner').isVisible(), false);
    eq('the picker is yours again', await page.locator('#role-select').isDisabled(), false);
    eq('and nothing claims an assignment', await page.locator('#role-assigned').isVisible(), false);
    await context.close();
  }

  // ---------- the one case that is a gate ----------

  console.log('\n--- "require sign-in" turns the screen into a door ---');
  {
    const { context, page } = await fresh();
    await page.click('#btn-account');
    await page.waitForTimeout(300);
    await page.click('[data-demo="demo-admin"]');
    await page.waitForTimeout(900);

    await page.click('#tab-settings .nav-row__label');
    await page.waitForTimeout(700);
    await openSection(page, 'sec-settings-pages');
    await page.check('#policy-require-signin');
    await page.click('#btn-save-policy');
    await page.waitForTimeout(800);

    // Signing out of the account, rather than leaving the workspace: the
    // requirement was the workspace's, so it must outlive the account.
    await openSection(page, 'sec-settings-account');
    await page.click('#btn-signout');
    await page.waitForTimeout(700);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);

    eq('the app opens onto it', await page.locator('#login-screen').isVisible(), true);
    eq('with no way past', await page.locator('#btn-login-skip').isVisible(), false);
    // And it says what it is rather than implying a lock.
    const note = await page.textContent('#login-forced-note');
    eq('and says it is a request, not a lock', note.includes('not a lock it enforces'), true);

    console.log('\n--- and leaving the workspace takes the requirement with it ---');
    await page.click('[data-demo="demo-admin"]');
    await page.waitForTimeout(900);
    await page.click('#btn-demo-leave');
    await page.waitForTimeout(900);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    eq('so nobody is shut out of their own device',
       await page.locator('#login-screen').isVisible(), false);
    await context.close();
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
