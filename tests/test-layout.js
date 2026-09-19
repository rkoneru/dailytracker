// The desktop layout fills the window, and the phone layout is an app.
//
// Two complaints, one suite, because they are the same complaint from opposite
// ends: the app was laid out for a single 1080px column and behaved like it on
// a 2200px monitor (two-thirds of the screen empty) and on a 390px phone (a
// header that wrapped to three rows before any content, and no way to get
// anywhere without the hamburger in the far corner).
//
// The checks here are mostly geometric, which is unusual and deliberate. "It
// looks right" is not something a suite can hold; "the content is within 120px
// of the window width" and "no label in the bottom bar is truncated at 360px"
// are, and they are what actually broke.

const { APP_URL, launch, createChecks } = require('./harness');

const ROLES = ['engagement-lead', 'project-manager', 'scrum-master',
  'developer', 'tester', 'service-manager'];

(async () => {
  const browser = await launch();
  const { eq, done } = createChecks();
  const errors = [];

  async function open(width, height, { role = '', scale = 1 } = {}) {
    const context = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: scale,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate((r) => {
      localStorage.clear();
      if (r) localStorage.setItem('projectPlannerRole_v1', JSON.stringify(r));
    }, role);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    return { context, page };
  }

  const overflows = (page) => page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1);

  // ---------- desktop ----------

  console.log('\n--- a wide window is used, not decorated ---');
  {
    const { context, page } = await open(2200, 1200);
    const box = await page.evaluate(() => {
      const page1 = document.querySelector('#page-dashboard .print-page');
      const rect = page1.getBoundingClientRect();
      return { width: Math.round(rect.width), window: window.innerWidth };
    });
    // The sidebar is 240px and the gutter clamps to 44px a side, so anything
    // near 1080 means the old cap is still in force.
    eq('the content spans the window, less the sidebar and gutters',
       box.width > box.window - 380, true);
    eq('and is nowhere near the old 1080px column', box.width > 1500, true);

    // A strip of readings should spread rather than leave five tiles at the
    // left and half a screen of nothing.
    const glance = await page.evaluate(() => {
      const row = document.querySelector('.dos-glance');
      const tops = [...row.children].map((c) => Math.round(c.getBoundingClientRect().top));
      return { columns: new Set(tops).size === 1 ? row.children.length : 0 };
    });
    eq('the glance tiles sit on one row', glance.columns, 5);
    eq('with no sideways scroll', await overflows(page), false);
    await context.close();
  }

  console.log('\n--- and a normal laptop is unchanged in kind ---');
  {
    const { context, page } = await open(1440, 900);
    eq('the bottom bar is a phone thing', await page.locator('#mobile-tabs').isVisible(), false);
    eq('the sidebar is still a sidebar', await page.locator('.sidebar').isVisible(), true);
    eq('and nothing scrolls sideways', await overflows(page), false);
    await context.close();
  }

  // ---------- phone ----------

  console.log('\n--- a phone gets a bottom bar ---');
  {
    const { context, page } = await open(390, 800, { scale: 2 });
    eq('it is there', await page.locator('#mobile-tabs').isVisible(), true);
    eq('with five slots', await page.locator('.mobile-tab').count(), 5);
    eq('the last of which is More',
       (await page.textContent('.mobile-tab:last-child')).includes('More'), true);
    // Translated off-screen rather than display:none, so this asks where it is
    // rather than whether it is rendered.
    const drawerOff = await page.evaluate(
      () => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
    eq('the sidebar is off to the side', drawerOff, true);

    // The bar is fixed to the bottom of the window, not sitting in the flow.
    const seated = await page.evaluate(() => {
      const rect = document.getElementById('mobile-tabs').getBoundingClientRect();
      return Math.abs(rect.bottom - window.innerHeight) < 2 && rect.height >= 56;
    });
    eq('it is pinned to the bottom, at a thumb-sized height', seated, true);

    console.log('\n--- the header stopped eating the screen ---');
    const header = await page.evaluate(() => {
      const h = document.querySelector('.app-header');
      const t = document.getElementById('page-title');
      return {
        height: Math.round(h.getBoundingClientRect().height),
        title: t.textContent,
        clipped: t.scrollWidth > t.clientWidth + 1,
      };
    });
    // Three wrapped rows measured ~150px. One row is ~50.
    eq('it is one row', header.height < 70, true);
    eq('and the page name survives it', header.clipped, false);
    eq('which is still the page name', header.title, 'Dashboard');

    console.log('\n--- the page clears the bar ---');
    const clears = await page.evaluate(() => {
      const bar = document.getElementById('mobile-tabs').getBoundingClientRect();
      const main = document.getElementById('main');
      const pad = parseFloat(getComputedStyle(main).paddingBottom);
      return pad >= bar.height;
    });
    eq('so the last card is reachable', clears, true);
    eq('and nothing scrolls sideways', await overflows(page), false);

    console.log('\n--- the readings are a strip, not a stack ---');
    const perRow = await page.evaluate(() => {
      const tops = [...document.querySelectorAll('.dos-glance > *')]
        .map((c) => Math.round(c.getBoundingClientRect().top));
      const first = tops[0];
      return tops.filter((t) => t === first).length;
    });
    eq('two across rather than one', perRow, 2);

    console.log('\n--- tapping a tab goes there ---');
    await page.click('#mobile-tabs [data-nav="tab-tasks"]');
    await page.waitForTimeout(600);
    eq('the page changes', await page.locator('#page-tasks').isVisible(), true);
    eq('and the bar says where you are',
       await page.locator('#mobile-tabs [data-nav="tab-tasks"]').getAttribute('aria-current'), 'page');
    eq('only there', await page.locator('.mobile-tab.is-active').count(), 1);

    console.log('\n--- and a jump from elsewhere keeps it honest ---');
    // The drawer is not the bar, so this is the case where the two can disagree.
    await page.click('#mobile-tabs [data-more]');
    await page.waitForTimeout(400);
    eq('More opens the drawer', await page.locator('.sidebar').isVisible(), true);
    await page.click('#tab-mywork .nav-row__label');
    await page.waitForTimeout(600);
    eq('choosing from it closes the drawer',
       await page.evaluate(() => document.body.classList.contains('sidebar-open')), false);
    eq('and the bar follows',
       await page.locator('#mobile-tabs [data-nav="tab-mywork"]').getAttribute('aria-current'), 'page');

    console.log('\n--- the drawer can be closed from inside it ---');
    await page.click('#mobile-tabs [data-more]');
    await page.waitForTimeout(400);
    await page.click('#btn-sidebar-close');
    await page.waitForTimeout(400);
    eq('by its own button',
       await page.evaluate(() => document.body.classList.contains('sidebar-open')), false);
    await context.close();
  }

  // ---------- the bar, for everybody ----------

  console.log('\n--- every role gets a bar it can read ---');
  for (const role of ROLES) {
    const { context, page } = await open(360, 720, { role });
    const tabs = await page.$$eval('.mobile-tab__label', (els) => els.map((n) => ({
      text: n.textContent, cut: n.scrollWidth > n.clientWidth + 1,
    })));
    const hidden = await page.$$eval('#mobile-tabs [data-nav]', (els) => els.map((n) => n.dataset.nav));
    const allowed = await page.evaluate(async (ids) => {
      const roles = await import('./js/roles.js');
      return ids.every((id) => roles.roleShows(id));
    }, hidden);
    eq(`${role}: nothing is truncated`, tabs.filter((t) => t.cut).map((t) => t.text), []);
    eq(`${role}: every slot is a page this role may see`, allowed, true);
    eq(`${role}: no sideways scroll`, await overflows(page), false);
    await context.close();
  }

  console.log('\n--- the bar cannot offer what a policy took away ---');
  {
    // A tester with Tasks removed must lose it from the bar too, or the bottom
    // bar becomes the way around the sidebar.
    //
    // Set through a demo workspace rather than by writing the policy cache:
    // the cache is cleared on boot when nobody is signed in, which is correct
    // — a policy with no workspace behind it governs nothing — and would make
    // a test that wrote it directly pass or fail for the wrong reason.
    const { context, page } = await open(390, 800, { role: 'tester' });
    eq('it is there to begin with',
       await page.locator('#mobile-tabs [data-nav="tab-tasks"]').count(), 1);
    await page.evaluate(() => {
      localStorage.setItem('projectPlannerDemo_v1', JSON.stringify({
        accountId: 'demo-tester',
        members: {},
        pages: { tester: ['tab-mywork', 'tab-dashboard', 'tab-settings'] },
        requireSignIn: false,
        workflow: null,
      }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    eq('and gone once the policy says so',
       await page.locator('#mobile-tabs [data-nav="tab-tasks"]').count(), 0);
    eq('leaving only what is allowed, plus More',
       await page.$$eval('#mobile-tabs [data-nav]', (els) => els.map((n) => n.dataset.nav)),
       ['tab-mywork', 'tab-dashboard', 'tab-settings']);
    eq('so the bar is shorter rather than padded out',
       await page.locator('.mobile-tab').count(), 4);
    await context.close();
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
