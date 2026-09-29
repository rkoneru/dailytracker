// Quotes and the proposal document.
//
// Pins the arithmetic (line discounts, then the overall discount, then tax),
// the states a quote moves through without anyone choosing them (expired,
// accepted, changed since accepted), the one number the deal is worth once a
// quote exists, and the proposal: everything the client should read and
// nothing that is ours alone — no delivery cost, no margin — with every value
// escaped.

const fs = require('fs');
const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
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
    const q = await import('/js/quotes.js');
    const d = await import('/js/deals.js');
    const sig = await import('/js/signatureModel.js');
    const today = new Date(2026, 9, 5);
    const quote = {
      id: 'a', number: 'Q-001', version: 1, status: 'Sent', validUntil: '2026-10-31', createdAt: 1,
      discountPct: 10, taxPct: 20, paymentTermsDays: 30, terms: 'Fixed price.',
      lines: [
        { description: 'Build', qty: 1, unitPrice: 100000, discountPct: 0 },
        { description: 'Licences', qty: 10, unitPrice: 1000, discountPct: 50 },
        { description: 'Unpriced', qty: 2, unitPrice: '' },
      ],
    };
    const t = q.quoteTotals(quote);
    const accepted = { ...quote, acceptance: sig.createSignature({ name: 'Dana', statement: 'x', content: q.quoteContent(quote) }) };
    const edited = { ...accepted, lines: [{ description: 'Build', qty: 1, unitPrice: 90000 }] };
    const [old, revised] = q.reviseQuote(accepted, 5);
    const uc = (quotes, deal = { stage: 'Proposal', value: 50000 }) => ({ name: 'OCR', quotes, deal });
    return {
      amounts: t.lines.map((l) => l.amount),
      totals: [t.subtotal, t.discount, t.net, t.tax, t.total],
      empty: q.quoteTotals({ lines: [{ description: 'x' }] }).total,
      states: [
        q.quoteState({ ...quote, status: 'Draft' }, today),
        q.quoteState(quote, today),
        q.quoteState({ ...quote, validUntil: '2026-10-04' }, today),
        q.quoteState({ ...quote, validUntil: '2026-10-05' }, today),
        q.quoteState(accepted, today),
        q.quoteState(edited, today),
        q.quoteState({ ...quote, status: 'Declined' }, today),
      ],
      revise: [old.status, revised.version, revised.status, revised.acceptance, revised.number, revised.lines !== accepted.lines],
      numbers: [q.nextQuoteNumber({}), q.nextQuoteNumber({ quotes: [{ number: 'Q-001' }, { number: 'Q-004' }] })],
      typed: d.dealOf(uc([]), today).value,
      draftOnly: d.dealOf(uc([{ ...quote, status: 'Draft' }]), today).value,
      sent: [d.dealOf(uc([quote]), today).value, d.dealOf(uc([quote]), today).valueFrom],
      acceptedWins: d.dealOf(uc([{ ...accepted, createdAt: 1 }, { ...quote, id: 'b', number: 'Q-002', lines: [{ qty: 1, unitPrice: 1 }], createdAt: 9 }]), today).value,
      expiredIgnored: d.dealOf(uc([{ ...quote, validUntil: '2026-09-01' }]), today).value,
      fileNames: new Set([q.proposalFileName(uc([]), quote), q.proposalFileName(uc([]), edited)]).size,
    };
  });
  eq('each line: qty × price, less its own discount', r.amounts, [100000, 5000, null]);
  eq('then the overall discount, then tax on the net', r.totals, [105000, 10500, 94500, 18900, 113400]);
  eq('no priced line, no total', r.empty, null);
  eq('draft, sent, expired, last valid day, accepted, changed, declined', r.states,
     ['draft', 'sent', 'expired', 'sent', 'accepted', 'changed', 'declined']);
  eq('a revision supersedes, bumps the version, and starts unsigned', r.revise, ['Superseded', 2, 'Draft', null, 'Q-001', true]);
  eq('quote numbers run on', r.numbers, ['Q-001', 'Q-005']);
  eq('with no quote the typed value stands', r.typed, 50000);
  eq('a draft is not with the client, so it does not set the value', r.draftOnly, 50000);
  eq('a sent quote does, and says which', r.sent, [113400, 'Q-001 v1']);
  eq('an accepted quote beats a later one still open', r.acceptedWins, 113400);
  eq('an expired quote is not pipeline', r.expiredIgnored, 50000);
  eq('two versions never share a file name', r.fileNames, 2);

  console.log('\n--- on the page ---');
  await page.evaluate(async () => {
    (await import('/js/roles.js')).setRole('client-partner');
    const s = await import('/js/useCaseStore.js');
    const pid = (await import('/js/state.js')).getActiveProjectId();
    s.createUseCase(pid, {
      name: 'Invoice OCR', client: 'Contoso <Retail>', sponsor: 'Dana Ruiz', methodology: 'project',
      problem: 'Invoices are keyed by hand.', outcome: 'Invoices read automatically.',
      scores: { value: 4, fit: 4, feasibility: 4, data: 4, risk: 4 },
      costs: [{ label: 'Build', type: 'One-off', amount: 50000, source: 'SOW' }],
      benefits: [{ label: 'Time', kind: 'Time saved', hoursPerWeek: 40, rate: 40, source: 'Study' }],
      deal: { stage: 'Proposal', value: 60000, deliveryCost: 70000 },
    });
  });
  await openDestination(page, 'nav-uc-quote');
  eq('Quote is a tab', (await page.textContent('#page-usecases .page-tab.is-active')).startsWith('Quote'), true);
  await page.click('#uc-quote [data-q-action="new"]');
  await page.waitForTimeout(200);
  eq('a new quote is numbered and seeded with a line', await page.inputValue('#uc-quote [data-uc="quotes.0.lines.0.description"]'), 'Invoice OCR');
  await page.fill('#uc-quote [data-uc="quotes.0.lines.0.unitPrice"]', '80000');
  await page.click('#uc-quote [data-uc-add="quotes.0.lines"]');
  await page.waitForTimeout(200);
  await page.fill('#uc-quote [data-uc="quotes.0.lines.1.description"]', 'Support, first year');
  await page.fill('#uc-quote [data-uc="quotes.0.lines.1.unitPrice"]', '20000');
  await page.fill('#uc-quote [data-uc="quotes.0.taxPct"]', '10');
  eq('typing keeps the caret while the totals move', await page.evaluate(() => document.activeElement.dataset.uc), 'quotes.0.taxPct');
  const totals = await page.textContent('#uc-quote-totals');
  eq('the total is worked out', totals.includes('$110,000'), true);
  eq('and the margin, against our delivery cost', totals.includes('$30,000 (30%)'), true);
  eq('a draft has no acceptance button', await page.locator('[data-q-action="accept"]').count(), 0);

  await page.selectOption('#uc-quote [data-uc="quotes.0.status"]', 'Sent');
  await page.waitForTimeout(200);
  await openDestination(page, 'nav-uc-pipeline');
  eq('once sent, the deal is worth the quote', await page.inputValue('#uc-deal-value-quoted'), '$110,000 — from Q-001 v1');

  await openDestination(page, 'nav-uc-quote');
  await page.click('[data-q-action="accept"]');
  await page.waitForSelector('#sig-name');
  eq('the client signs against the quote', (await page.textContent('.sig-dialog')).includes('I accept quote Q-001 version 1 for $110,000'), true);
  eq('named as the sponsor', await page.inputValue('#sig-name'), 'Dana Ruiz');
  await page.check('#sig-agree');
  await page.click('.sig-dialog button[type="submit"]');
  await page.waitForTimeout(300);
  eq('accepted', await page.textContent('#uc-quote-state'), 'Accepted — signed by the client');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-q-action="download"]')]);
  const html = fs.readFileSync(await download.path(), 'utf8');
  // What the client reads, without the stylesheet (where "margin" is CSS).
  const words = html.replace(/<style[\s\S]*?<\/style>/, '');
  eq('the proposal downloads as a page', download.suggestedFilename().startsWith('proposal-contoso-retail-q-001-v1-'), true);
  eq('it carries the problem and the quote', html.includes('Invoices are keyed by hand.') && html.includes('$110,000'), true);
  eq('and the acceptance', html.includes('Accepted by Dana Ruiz'), true);
  eq('never our delivery cost or margin', ['70,000', '70000', 'margin', 'probability'].filter((x) => words.toLowerCase().includes(x)), []);
  eq('the client’s name is escaped, not markup', html.includes('Contoso &lt;Retail&gt;') && !html.includes('<Retail>'), true);
  eq('no scripts', /<script/i.test(html), false);

  await page.fill('#uc-quote [data-uc="quotes.0.lines.1.unitPrice"]', '25000');
  await page.waitForTimeout(200);
  eq('editing an accepted quote voids the acceptance', (await page.textContent('#uc-quote-state')).startsWith('Changed since the client accepted it'), true);
  await page.fill('#uc-quote [data-uc="quotes.0.lines.1.unitPrice"]', '20000');
  await page.waitForTimeout(200);
  eq('putting it back restores it', await page.textContent('#uc-quote-state'), 'Accepted — signed by the client');

  await page.click('[data-q-action="revise"]');
  await page.waitForTimeout(200);
  const after = await page.evaluate(async () => (await import('/js/useCaseStore.js')).listUseCases()[0].quotes.map((x) => [x.number, x.version, x.status, !!x.acceptance]));
  eq('revising keeps the old one, superseded, and starts v2', after, [['Q-001', 1, 'Superseded', true], ['Q-001', 2, 'Draft', false]]);
  eq('the accepted v1 still sets the deal value', await page.evaluate(async () => {
    const d = await import('/js/deals.js');
    return d.dealOf((await import('/js/useCaseStore.js')).listUseCases()[0]).value;
  }), 110000);

  console.log('\n--- nothing of it reaches project data ---');
  eq('quotes stay in the use case store', await page.evaluate(() => localStorage.getItem('projectPlannerStore_v2').includes('Support, first year')), false);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
