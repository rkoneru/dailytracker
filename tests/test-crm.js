// CRM: contacts at each account, and the activity log.
//
// The activity log earns its place by feeding what is already there rather
// than sitting beside it: a call logged against an account is a touch, so its
// health moves without anyone retyping the date; an open follow-up is work, so
// it is on its owner's list; and a contact's last activity is read off the
// log, never typed.

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
    const cs = await import('/js/customerSuccess.js');
    const defs = await import('/js/registerDefs.js');
    const today = new Date(2026, 9, 5);
    const account = { name: 'Harbour', adoption: 80, lastTouch: '2026-06-01' };
    const map = cs.lastActivityByAccount([
      { account: 'harbour ', date: '2026-09-20' },
      { account: 'Harbour', date: '2026-10-01' },
      { account: 'Harbour', date: 'not a date' },
      { account: '', date: '2026-10-04' },
    ]);
    const acts = defs.ALL_REGISTERS.find((d) => d.key === 'activities');
    return {
      latest: [...map],
      touch: [cs.lastTouchOf(account, '2026-10-01'), cs.lastTouchOf({ lastTouch: '2026-10-03' }, '2026-10-01'), cs.lastTouchOf({ lastTouch: '' }, '')],
      stale: cs.healthOf(account, today).score,
      fresh: cs.healthOf(account, today, cs.signalsFor(account, { activityByAccount: map })).score,
      work: ['No follow-up', 'Follow-up due', 'Done'].map((status) => defs.isOpenRow(acts, { status })),
      shape: [acts.ownerField, acts.dueField],
      newDate: /^\d{4}-\d{2}-\d{2}$/.test(acts.newRow().date),
    };
  });
  eq('the latest activity per account, whatever the case and spacing', r.latest, [['harbour', '2026-10-01']]);
  eq('last touch is the later of the typed date and the log', r.touch, ['2026-10-01', '2026-10-03', '']);
  eq('a stale typed date drags health down', r.stale, 50);
  eq('a call logged this week lifts it', r.fresh, 90);
  eq('only a follow-up still due is work', r.work, [false, true, false]);
  eq('owned and dated by the next step', r.shape, ['owner', 'nextDue']);
  eq('a new activity is dated today', r.newDate, true);

  console.log('\n--- on the page, on the Customer Success template ---');
  await page.evaluate(() => {
    import('/js/state.js').then((s) => {
      s.createProject({ name: 'CS', templateKey: 'customer-success', methodology: 'project' });
      window.__ready = true;
    });
  });
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(700);

  await openDestination(page, 'nav-contacts');
  eq('Contacts is a tab', (await page.textContent('#page-customers .page-tab.is-active')).startsWith('Contacts'), true);
  const last = await page.$$eval('#sec-contacts tbody tr', (rows) => rows.map((tr) => tr.querySelector('.col-custom').textContent));
  eq('a contact’s last activity is their own', last[1].includes('Call') && !last[1].includes('(account)'), true);
  eq('or their account’s, and says so', last[0].includes('(account)'), true);
  eq('or nothing', last.some((t) => t === 'Nothing logged'), false);
  eq('accounts are offered as you type', await page.$$eval('#account-names option', (o) => o.length), 8);

  await openDestination(page, 'nav-activities');
  eq('Activity is a tab', (await page.textContent('#page-customers .page-tab.is-active')).startsWith('Activity'), true);
  const healthBefore = await page.evaluate(async () => {
    const cs = await import('/js/customerSuccess.js');
    const st = (await import('/js/state.js')).getState();
    const a = st.customers.find((x) => x.name === 'Tailspin Travel');
    // Nobody has typed a last touch for it, so the call is its only one.
    a.lastTouch = '';
    return { score: cs.healthOf(a, new Date(), cs.signalsFor(a, cs.accountSignals(st))).score, typed: a.lastTouch };
  });
  await page.click('#sec-activities [data-action="add-row"]');
  await page.waitForTimeout(300);
  const row = '#sec-activities tbody tr:last-child';
  await page.fill(`${row} [data-field="account"]`, 'Tailspin Travel');
  await page.fill(`${row} [data-field="summary"]`, 'Adoption review with the ops team');
  await page.fill(`${row} [data-field="nextStep"]`, 'Send the training plan');
  await page.selectOption(`${row} [data-field="status"]`, 'Follow-up due');
  await page.fill(`${row} [data-field="owner"]`, 'Leo F.');
  await page.waitForTimeout(500);
  const after = await page.evaluate(async () => {
    const cs = await import('/js/customerSuccess.js');
    const st = (await import('/js/state.js')).getState();
    const a = st.customers.find((x) => x.name === 'Tailspin Travel');
    return { score: cs.healthOf(a, new Date(), cs.signalsFor(a, cs.accountSignals(st))).score, typed: a.lastTouch };
  });
  eq('logging it lifts the account’s health', after.score > healthBefore.score, true);
  eq('without touching the typed date', after.typed, healthBefore.typed);
  await openDestination(page, 'nav-accounts');
  const tailspin = await page.$$eval('#sec-customers tbody tr', (rows) => rows.find((tr) => tr.querySelector('[data-field="name"]').value === 'Tailspin Travel').querySelector('.col-custom').textContent);
  eq('and the Accounts table shows it', tailspin.includes(String(after.score)), true);

  console.log('\n--- nothing lost at phone width ---');
  await page.setViewportSize({ width: 390, height: 900 });
  for (const navId of ['nav-contacts', 'nav-activities']) {
    await openDestination(page, navId);
    eq(`${navId}: no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
