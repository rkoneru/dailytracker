// Satisfaction surveys on closed incidents.
//
// Two paths, and the page says which it took. Signed out, the email asks for
// a reply and the score is typed in. Signed in, the email carries a one-time
// link: the token is never stored, only its hash reaches the database, the
// customer answers on survey.html with no account, and the answer comes back
// onto the incident. What the database itself refuses — a pre-answered
// request, a second answer, an expired link — is attacked in
// tests/rls/attack.sql; this drives the app and the page over the wire.

const { APP_URL, API_URL, launch, createChecks, openDestination, chooseLifecycle } = require('./harness');

(async () => {
  const browser = await launch();
  const { eq, done } = createChecks();
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  };

  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  console.log('\n--- the number ---');
  const r = await page.evaluate(async () => {
    const m = await import('/js/serviceDesk.js');
    return {
      none: m.csatOf([{ status: 'Resolved' }]).csat,
      mix: m.csatOf([{ csat: 5 }, { csat: '4' }, { csat: 2 }, { csat: 9 }, { csat: '' }]),
    };
  });
  eq('no answers is not a satisfied customer', r.none, null);
  eq('the share scoring 4 or 5, ignoring anything off the scale', [Math.round(r.mix.csat * 100), r.mix.responses], [67, 3]);

  const newTransition = async (p) => {
    await p.click('#btn-projects');
    await p.waitForTimeout(400);
    await p.check('#template-transition');
    await chooseLifecycle(p);
    await p.click('#btn-create-project');
    await p.waitForTimeout(1200);
    await openDestination(p, 'nav-incidents');
  };
  // The satisfaction cell is the second drawn cell in the row, after the SLA.
  const cell = (p, n) => p.locator(`#sec-incidents tbody tr:nth-child(${n}) .col-custom`).nth(1).textContent();

  console.log('\n--- signed out: by reply ---');
  await newTransition(page);
  eq('a reply already typed in says so', (await cell(page, 1)).includes('4/5') && (await cell(page, 1)).includes('recorded by hand'), true);
  eq('an open incident is not asked yet', await cell(page, 2), 'Asked once it is resolved');
  await page.selectOption('#sec-incidents tbody tr:nth-child(2) [data-field="status"]', 'Resolved');
  await page.waitForTimeout(300);
  await page.click('#sec-incidents tbody tr:nth-child(2) [data-cell-action="survey"]');
  await page.waitForSelector('.dialog');
  const dialog = await page.textContent('.dialog');
  eq('it says why it is a reply, not a link', dialog.includes('Not signed in to a workspace'), true);
  eq('addressed to the reporter, from Contacts', dialog.includes('To marcus.lee@example.com'), true);
  eq('and asks for a number', dialog.includes('reply with a number from 1 (poor) to 5 (excellent)'), true);
  await page.click('.dialog .btn-ghost');
  await page.waitForTimeout(200);
  eq('the cell waits for their reply', (await cell(page, 2)).startsWith('Emailed'), true);
  await page.selectOption('#sec-incidents tbody tr:nth-child(2) [data-field="csat"]', '5');
  await page.waitForTimeout(300);
  eq('recording it saves it on the incident', await page.evaluate(async () => (await import('/js/state.js')).getState().incidents[1].csat), '5');
  eq('and CSAT is measured', await page.evaluate(async () => (await import('/js/kpi.js')).projectKpis((await import('/js/state.js')).getState()).csat), 1);

  console.log('\n--- signed in: a one-time link ---');
  await fetch(`${API_URL}/__reset`);
  const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const app = await ctx2.newPage();
  watch(app);
  await app.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await app.evaluate((api) => {
    localStorage.clear();
    localStorage.setItem('projectPlannerSupabaseConfig_v1', JSON.stringify({ url: api, anonKey: 'anon' }));
    localStorage.setItem('projectPlannerSupabaseSession_v1', JSON.stringify({
      access_token: 'fake', refresh_token: 'fake', expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'tester@x.test' },
    }));
  }, API_URL);
  await app.reload({ waitUntil: 'networkidle' });
  await app.waitForTimeout(900);
  await newTransition(app);
  await app.selectOption('#sec-incidents tbody tr:nth-child(2) [data-field="status"]', 'Resolved');
  await app.waitForTimeout(300);
  await app.click('#sec-incidents tbody tr:nth-child(2) [data-cell-action="survey"]');
  await app.waitForSelector('.dialog');
  const text = await app.textContent('.dialog__message');
  const link = (/(http\S+survey\.html#\S+)/.exec(text) || [])[1] || '';
  eq('a link is ready', (await app.textContent('.dialog__title')) === 'Survey link ready' && link.length > 0, true);
  await app.click('.dialog .btn-ghost');
  const token = new URLSearchParams(link.split('#')[1]).get('t');
  const dump = await (await fetch(`${API_URL}/__dump`)).json();
  const request = dump.surveys[0] || {};
  eq('one request in the database, for this incident', [dump.surveys.length, request.incident_id === await app.evaluate(async () => (await import('/js/state.js')).getState().incidents[1].id)], [1, true]);
  eq('holding a hash, not the token', /^[0-9a-f]{64}$/.test(request.token_hash) && request.token_hash !== token && !JSON.stringify(request).includes(token), true);
  eq('and the token is nowhere in the project', await app.evaluate((t) => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').includes(t)), token), false);
  // The cell redraws once the request is saved; under a loaded run that can
  // land after the dialog closes, so wait for it rather than read it once.
  await app.locator('#sec-incidents tbody tr:nth-child(2) .col-custom').nth(1).filter({ hasText: 'Link sent' }).waitFor({ timeout: 5000 }).catch(() => {});
  eq('the cell says it is waiting', (await cell(app, 2)).includes('Link sent'), true);

  console.log('\n--- the customer answers, with no account ---');
  const customer = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  watch(customer);
  await customer.goto(link, { waitUntil: 'networkidle' });
  eq('the page names what it is about', (await customer.textContent('#subject')).includes('Nightly stock sync'), true);
  eq('and takes the token out of the address bar', customer.url().includes('#'), false);
  eq('it fits a phone', await customer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await customer.check('input[name="score"][value="4"]', { force: true });
  await customer.fill('#comment', 'Quick, but tell us sooner next time.');
  await customer.click('#send');
  await customer.waitForSelector('#message:not([hidden])');
  eq('the answer is taken', await customer.textContent('#message'), 'Thank you — your answer has been recorded.');
  const again = await (await browser.newContext()).newPage();
  await again.goto(link, { waitUntil: 'networkidle' });
  await again.check('input[name="score"][value="1"]', { force: true });
  await again.click('#send');
  await again.waitForSelector('#message:not([hidden])');
  eq('the same link does not answer twice', (await again.textContent('#message')).startsWith('This link has already been used'), true);
  const broken = await (await browser.newContext()).newPage();
  await broken.goto(`${APP_URL}/survey.html#t=nothex&u=javascript:alert(1)&k=anon`, { waitUntil: 'networkidle' });
  eq('a broken or hostile link is refused before anything is sent', [await broken.isHidden('#form'), (await broken.textContent('#message')).startsWith('This survey link is incomplete')], [true, true]);

  console.log('\n--- and the answer comes back ---');
  await openDestination(app, 'tab-dashboard');
  await openDestination(app, 'nav-incidents');
  await app.waitForTimeout(800);
  const back = await app.evaluate(async () => { const i = (await import('/js/state.js')).getState().incidents[1]; return [i.csat, i.csatComment, !!i.csatAt]; });
  eq('onto the incident, with the comment', back, [4, 'Quick, but tell us sooner next time.', true]);
  eq('and the cell says it came by link', (await cell(app, 2)).includes('via link'), true);

  console.log('\n--- a workspace whose schema predates surveys ---');
  await fetch(`${API_URL}/__hide-table`, { method: 'POST', body: JSON.stringify({ tables: ['incident_surveys'] }) });
  await app.evaluate(async () => {
    const s = (await import('/js/state.js')).getState();
    s.incidents[1].survey = null;
    s.incidents[1].csat = '';
    s.incidents[1].csatAt = '';
  });
  await openDestination(app, 'tab-dashboard');
  await openDestination(app, 'nav-incidents');
  await app.click('#sec-incidents tbody tr:nth-child(2) [data-cell-action="survey"]');
  await app.waitForSelector('.dialog');
  eq('it falls back to a reply, and says to re-run the schema', (await app.textContent('.dialog__message')).includes('re-run supabase/schema.sql'), true);
  await app.click('.dialog .btn-ghost');
  await fetch(`${API_URL}/__hide-table`, { method: 'POST', body: JSON.stringify({ show: ['incident_surveys'] }) });

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
