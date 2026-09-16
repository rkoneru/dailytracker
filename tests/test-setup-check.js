// The Supabase setup check.
//
// It exists for one failure that is otherwise invisible: `/auth/v1/otp` answers
// 200 whether or not an email was sent, so a misconfigured project produces
// "check your inbox" followed by nothing, forever, with no error anywhere.
//
// Each case below is a real configuration that behaves exactly like that, plus
// the setup mistake that costs the most time — never having run the schema.
// The one thing that genuinely cannot be tested from here is delivery itself,
// and the check says so rather than implying otherwise.

const { APP_URL, API_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

const API = API_URL;

async function configure(page) {
  await page.evaluate((api) => {
    localStorage.clear();
    localStorage.setItem('projectPlannerSupabaseConfig_v1', JSON.stringify({ url: api, anonKey: 'anon' }));
  }, API);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('#tab-sync');
  await page.waitForTimeout(350);
}

async function runCheck(page) {
  await page.click('#btn-sync-check');
  await page.waitForFunction(
    () => !document.getElementById('sync-check-results').textContent.includes('Checking'),
    null, { timeout: 8000 },
  );
  return page.$$eval('#sync-check-results .setup-check__item', (items) => items.map((i) => ({
    ok: i.classList.contains('is-ok'),
    label: i.querySelector('.setup-check__label')?.textContent || '',
    detail: i.querySelector('.setup-check__detail')?.textContent || '',
  })));
}

const authSettings = (body) => fetch(`${API}/__auth-settings`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await fetch(`${API}/__reset`);
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });

  console.log('\n--- a healthy project passes ---');
  await configure(page);
  let results = await runCheck(page);
  eq('three things are checked', results.length, 3);
  eq('all pass', results.every((r) => r.ok), true);
  eq('and it is honest about what it cannot see',
     results.find((r) => r.label === 'Email sign-in').detail.includes('cannot be checked from here'), true);

  console.log('\n--- signups disabled: the link is accepted and dropped ---');
  await authSettings({ disable_signup: true });
  results = await runCheck(page);
  const disabled = results.find((r) => r.label === 'Email sign-in');
  eq('email sign-in is flagged', disabled.ok, false);
  eq('and names the cause', disabled.detail.includes('Signups are disabled'), true);
  eq('and says what to do', disabled.detail.includes('Enable signups'), true);
  eq('the other checks still pass', results.filter((r) => r.ok).length, 2);

  console.log('\n--- auto-confirm on: no email is sent at all ---');
  await authSettings({ disable_signup: false, mailer_autoconfirm: true });
  results = await runCheck(page);
  const auto = results.find((r) => r.label === 'Email sign-in');
  eq('auto-confirm is flagged', auto.ok, false);
  eq('and names where to turn it off', auto.detail.includes('Authentication → Providers → Email'), true);

  console.log('\n--- an unreachable project fails first and stops ---');
  await authSettings({ mailer_autoconfirm: false });
  await page.evaluate(() => {
    localStorage.setItem('projectPlannerSupabaseConfig_v1',
      JSON.stringify({ url: 'http://127.0.0.1:9', anonKey: 'anon' }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('#tab-sync');
  await page.waitForTimeout(350);
  results = await runCheck(page);
  eq('it reports one failure and does not guess at the rest', results.length, 1);
  eq('the failure is reachability', results[0].label, 'Project reachable');
  eq('and it points at the likely cause', results[0].detail.includes('typo'), true);

  console.log('\n--- sign-in does not claim an email was delivered ---');
  await configure(page);
  await page.fill('#sync-email', 'tester@x.test');
  await page.click('#btn-sync-signin');
  await page.waitForTimeout(700);
  const msg = await page.textContent('#sync-signin-message');
  eq('it says requested, not sent', msg.includes('Requested a link'), true);
  eq('and tells you what to do if nothing arrives', msg.includes('Check setup'), true);

  console.log('\n--- a magic-link return still signs in, with the router sharing the hash ---');
  // Both GoTrue and the router write to the fragment. Sign-in has to read the
  // tokens before the router can replace them, or the session is dropped in
  // silence — which is exactly the failure this whole page exists to prevent.
  await page.evaluate(() => localStorage.clear());
  await page.evaluate((api) => {
    localStorage.setItem('projectPlannerSupabaseConfig_v1', JSON.stringify({ url: api, anonKey: 'anon' }));
  }, API);
  // The query string matters: navigating to the same path with only a
  // different fragment is a same-document navigation, so no script re-runs and
  // the test would be measuring nothing. A magic link from an inbox is always
  // a real load.
  await page.goto(
    `${APP_URL}/index.html?signin=1#access_token=faketoken&refresh_token=fakerefresh&expires_in=3600`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForTimeout(1800);
  const session = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('projectPlannerSupabaseSession_v1') || 'null'); } catch { return null; }
  });
  eq('the session was stored', !!(session && session.access_token), true);
  eq('and the account was loaded', session && session.user && session.user.email, 'tester@x.test');
  eq('the tokens are scrubbed from the address bar',
     (await page.evaluate(() => location.hash)).includes('access_token'), false);
  eq('and the app still has a usable route',
     (await page.evaluate(() => location.hash)).startsWith('#/'), true);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
