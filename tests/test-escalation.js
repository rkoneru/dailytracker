// Risk review and escalation: a heat map of open risks, the log's own reasons
// to escalate, a pack that holds what a decision-maker needs, and a decision
// recorded against it.
//
// Pins that the app suggests but never escalates by itself; that a pack cannot
// be sent without impact, options, a recommendation, who decides and by when;
// that an escalation past its date with no decision is overdue by the dates,
// not by a choice; and that the heat map filters the log.

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
    const e = await import('/js/escalation.js');
    const today = new Date(2026, 9, 1);
    const late = { type: 'Risk', title: 'Vendor may slip', status: 'Open', severity: 'High', likelihood: 'Medium', due: '2026-09-20' };
    const waiting = { type: 'Decision', title: 'Pick the budget split', status: 'Open', severity: 'Medium', raised: '2026-09-10', due: '2026-12-01' };
    const calm = { type: 'Risk', title: 'Minor font issue', status: 'Open', severity: 'Low', likelihood: 'Low', due: '2026-12-01' };
    const closed = { ...late, status: 'Closed' };
    const pack = e.newPack(late, today);
    const missingAll = e.packMissing(pack);
    Object.assign(pack, { impact: 'Launch slips two weeks', options: 'Pay for expedite\nCut scope', recommendation: 'Pay for expedite', to: 'Sponsor', decideBy: '2026-10-05', level: 'owner' });
    const item = { ...late, escalation: pack };
    const states = [e.escalationState(item, today)];
    pack.sentAt = '2026-10-01T09:00:00Z';
    states.push(e.escalationState(item, today), e.escalationState(item, new Date(2026, 9, 6)));
    pack.decidedAt = '2026-10-06T09:00:00Z';
    states.push(e.escalationState(item, new Date(2026, 9, 6)));
    const project = { raid: [late, calm, { ...late, id: 'x' }, closed, { type: 'Issue', status: 'Open', severity: 'High' }] };
    return {
      late: e.suggestedTriggers(late, today),
      waiting: e.suggestedTriggers(waiting, today),
      calm: [e.shouldEscalate(calm, today), e.shouldEscalate(closed, today)],
      prefilled: e.newPack(late, today).triggers,
      missing: missingAll,
      ready: e.packMissing(pack),
      states,
      text: e.packText(item, { projectName: 'Website' }),
      heat: e.heatMap(project),
    };
  });
  eq('past its due date and in the top band: timeline at risk', r.late, ['timeline']);
  eq('a decision waiting more than ten days is blocked; its title names the budget', r.waiting, ['decision', 'budget']);
  eq('nothing to suggest for a quiet risk or a closed one', r.calm, [false, false]);
  eq('a new pack starts with the log’s reasons ticked', r.prefilled, ['timeline']);
  eq('an empty pack names everything it lacks',
     r.missing, ['the impact', 'at least one option', 'a recommendation', 'who decides', 'a date the decision is needed by', 'the level that can decide']);
  eq('a filled pack is ready', r.ready, []);
  eq('draft, awaiting, overdue by the date, decided', r.states, ['draft', 'awaiting', 'overdue', 'decided']);
  eq('the message leads with the item, says who decides by when, and ends on the one line',
     [r.text.split('\n')[0], r.text.includes('  2. Cut scope'), r.text.includes('Decision needed from Sponsor by 2026-10-05.'), r.text.trim().split('\n').pop().startsWith('We are blocked by Vendor may slip.')],
     ['Escalation — Website: Vendor may slip', true, true, true]);
  eq('the heat map counts open risks only', r.heat, { 'Medium|High': 2, 'Low|Low': 1 });

  console.log('\n--- the heat map on the page ---');
  await openDestination(page, 'nav-raid-log');
  eq('the heat map sits above the log', await page.isVisible('#risk-heatmap'), true);
  const cell = '#risk-heatmap [data-like="Medium"][data-sev="High"]';
  eq('the starter’s open risk is Medium × High, in the amber band',
     [await page.textContent(cell), await page.getAttribute(cell, 'class')], ['1', 'heat-cell is-med']);
  await page.click(cell);
  await page.waitForTimeout(200);
  eq('picking a square filters the log to those risks', await page.$$eval('#raid-body tr:not([hidden])', (e) => e.length), 1);
  eq('and says so, with a way back', (await page.textContent('#raid-heatmap-filter')).includes('Medium likelihood × High impact'), true);
  await page.click('#raid-heatmap-filter [data-action="clear-heat"]');
  await page.waitForTimeout(200);
  eq('show all brings the log back', await page.$$eval('#raid-body tr:not([hidden])', (e) => e.length) > 1, true);

  console.log('\n--- escalating ---');
  const suggested = await page.$$eval('#raid-body .raid-escalate.is-suggested', (e) => e.length);
  eq('the log suggests escalating the items that are late', suggested > 0, true);
  const title = await page.$eval('#raid-body .raid-escalate.is-suggested', (b) => b.closest('tr').querySelector('[data-field="title"]').value);
  await page.click('#raid-body .raid-escalate.is-suggested >> nth=0');
  await page.waitForTimeout(300);
  eq('escalate opens the Escalations tab', (await page.textContent('#page-raid .page-tab.is-active')).startsWith('Escalations'), true);
  const card = `#raid-escalations .escalation`;
  eq('with a draft for that item, caret in Impact',
     [await page.textContent(`${card} .escalation__head strong`), await page.evaluate(() => document.activeElement.dataset.pack)], [title, 'impact']);
  eq('the log’s reasons are ticked', await page.$$eval(`${card} [data-trigger]:checked`, (e) => e.length) > 0, true);
  await page.click(`${card} [data-esc="send"]`);
  await page.waitForTimeout(200);
  eq('it will not send an empty pack', [await page.isVisible('.toast--error'), await page.evaluate(async () => (await import('/js/state.js')).getState().raid.some((i) => i.escalation?.sentAt))], [true, false]);

  await page.fill(`${card} [data-pack="impact"]`, 'Launch slips a week');
  eq('typing keeps the caret while the note updates',
     [await page.evaluate(() => document.activeElement.dataset.pack), (await page.textContent(`${card} [data-missing]`)).includes('the impact')], ['impact', false]);
  await page.fill(`${card} [data-pack="options"]`, 'Run organic only\nDelay launch a week');
  await page.fill(`${card} [data-pack="recommendation"]`, 'Run organic only');
  await page.fill(`${card} [data-pack="to"]`, 'Sponsor');
  await page.fill(`${card} [data-pack="decideBy"]`, '2026-10-03');
  await page.selectOption(`${card} [data-pack="level"]`, 'owner');
  eq('ready to send', await page.textContent(`${card} [data-missing]`), 'Ready to send.');
  await page.click(`${card} [data-esc="send"]`);
  await page.waitForSelector('.dialog');
  eq('sending shows the pack', (await page.textContent('.dialog')).includes('Recommendation: Run organic only'), true);
  await page.click('.dialog .btn-ghost');
  await page.waitForTimeout(300);
  const sent = await page.evaluate(async () => (await import('/js/state.js')).getState().raid.find((i) => i.escalation));
  eq('sent: the item is Escalated and the pack is dated', [sent.status, !!sent.escalation.sentAt], ['Escalated', true]);
  eq('the card now awaits a decision', await page.textContent(`${card} .escalation__state`), 'Awaiting decision');

  await page.click(`${card} [data-esc="decide"]`);
  await page.waitForTimeout(200);
  eq('a decision needs words', await page.evaluate(async () => !(await import('/js/state.js')).getState().raid.find((i) => i.escalation).escalation.decidedAt), true);
  await page.fill(`${card} [data-pack="decision"]`, 'Go organic; revisit paid in week 2');
  await page.click(`${card} [data-esc="decide"]`);
  await page.waitForTimeout(300);
  const decided = await page.evaluate(async () => (await import('/js/state.js')).getState().raid.find((i) => i.escalation));
  eq('decided: back to being worked, decision kept', [decided.status, decided.escalation.decision], ['In Progress', 'Go organic; revisit paid in week 2']);
  eq('the card says decided and points to the follow-up', (await page.textContent(`${card}`)).includes('Tell the people it affects, update the plan'), true);

  console.log('\n--- overdue by the dates ---');
  await page.evaluate(async () => {
    const st = await import('/js/state.js');
    const item = st.getState().raid.find((i) => i.escalation);
    item.escalation.decidedAt = '';
    item.escalation.decideBy = '2026-01-01';
    st.scheduleSave();
    (await import('/js/raid.js')).renderRaid();
  });
  await page.waitForTimeout(200);
  eq('past the date with no decision is overdue', [await page.textContent(`${card} .escalation__state`), (await page.textContent('#raid-escalation-count')).includes('1 overdue')], ['Overdue — no decision by the date', true]);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
