// The accounting link: invoices out as the import files Xero and QuickBooks
// Online take, payments back from their exports.
//
// Pins what goes out (only numbered, priced milestones ready to invoice or
// invoiced, with the reason for each one left behind), that a typed name
// cannot become a spreadsheet formula, and what comes back: matched by
// invoice number, part payments reported rather than rounded up, previewed,
// and written only on the last click.

const fs = require('fs');
const { APP_URL, launch, createChecks, openDestination, chooseLifecycle } = require('./harness');

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

  console.log('\n--- invoices out ---');
  const out = await page.evaluate(async () => {
    const a = await import('/js/accounting.js');
    const today = new Date(2026, 9, 5);
    const project = {
      projectName: 'Orders, transition',
      paymentTermsDays: 14,
      accounting: { billTo: '=HYPERLINK("x")', accountCode: '200', taxType: 'OUTPUT2', currency: 'gbp', dateFormat: 'DD/MM/YYYY' },
      billing: [
        { id: 'a', milestone: 'Mobilisation', amount: 48000, status: 'Paid', invoiceNo: 'INV-1', invoiced: '2026-08-10' },
        { id: 'b', milestone: 'Knowledge transfer, complete', amount: 48000, status: 'Invoiced', invoiceNo: 'INV-2', invoiced: '2026-08-31' },
        { id: 'c', milestone: 'Parallel run', amount: 72000, status: 'Ready to invoice', invoiceNo: 'INV-3' },
        { id: 'd', milestone: 'No number', amount: 10, status: 'Ready to invoice', invoiceNo: '' },
        { id: 'e', milestone: 'No amount', amount: '', status: 'Invoiced', invoiceNo: 'INV-5' },
        { id: 'f', milestone: 'Later', amount: 72000, status: 'Planned', invoiceNo: '' },
      ],
    };
    const plan = a.invoicesFor(project, today);
    const xero = a.invoiceCsv(project, 'xero', today).split('\r\n');
    const qbo = a.invoiceCsv(project, 'quickbooks', today).split('\r\n');
    return {
      included: plan.included.map((i) => i.number),
      left: plan.left.map((l) => l.why.split(' —')[0]),
      blocked: a.invoicesFor({ billing: [] }, today).blocked !== '',
      warnings: a.invoicesFor({ accounting: { billTo: 'x' } }, today).warnings.length,
      xeroHead: xero[0].split(',').slice(0, 1).concat(xero[0].split(',').slice(10, 14)),
      xeroRow: xero[1],
      qboHead: qbo[0],
      qboRow: qbo[2],
      lines: xero.length,
      dates: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((f) => a.formatDateAs(new Date(2026, 1, 3), f)),
      parse: [a.parseDateAs('03/02/2026', 'DD/MM/YYYY'), a.parseDateAs('03/02/2026', 'MM/DD/YYYY'), a.parseDateAs('2026-02-03', 'MM/DD/YYYY'), a.parseDateAs('31/02/2026', 'DD/MM/YYYY')]
        .map((d) => (d ? d.toDateString() : null)),
    };
  });
  eq('only numbered, priced milestones ready to invoice or invoiced', out.included, ['INV-2', 'INV-3']);
  eq('and each left behind says why', out.left, ['no invoice number', 'no amount']);
  eq('nobody to bill blocks the export', out.blocked, true);
  eq('missing account code and tax type are warned about', out.warnings, 2);
  eq('Xero’s required columns, in its order', out.xeroHead, ['*ContactName', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate']);
  eq('a typed formula is defused, and quoted', out.xeroRow.startsWith(`"'=HYPERLINK(""x"")"`), true);
  eq('commas in a title are quoted; due date is invoice date plus terms',
     out.xeroRow.includes('INV-2,BM-02 Orders, transition'.replace('BM-02 Orders, transition', '"BM-02 Orders, transition"')) && out.xeroRow.includes('31/08/2026,14/09/2026'), true);
  eq('QuickBooks Online’s columns', out.qboHead, 'InvoiceNo,Customer,InvoiceDate,DueDate,Terms,Memo,Item(Product/Service),ItemDescription,ItemQuantity,ItemRate,ItemAmount,Currency');
  eq('a ready milestone is dated today, on the project’s terms', out.qboRow.includes('05/10/2026,19/10/2026,Net 14') && out.qboRow.endsWith('72000.00,72000.00,GBP'), true);
  eq('a header, two invoices and a final line break', out.lines, 4);
  eq('dates written the way the accounts expect', out.dates, ['03/02/2026', '02/03/2026', '2026-02-03']);
  eq('and read back the same way; ISO always; impossible dates refused', out.parse,
     ['Tue Feb 03 2026', 'Mon Mar 02 2026', 'Tue Feb 03 2026', null]);

  console.log('\n--- payments back ---');
  const back = await page.evaluate(async () => {
    const a = await import('/js/accounting.js');
    const project = () => ({
      accounting: { dateFormat: 'DD/MM/YYYY' },
      billing: [
        { id: 'a', milestone: 'One', amount: 1000, status: 'Invoiced', invoiceNo: 'INV-1' },
        { id: 'b', milestone: 'Two', amount: 2000, status: 'Invoiced', invoiceNo: 'INV-2' },
        { id: 'c', milestone: 'Three', amount: 3000, status: 'Invoiced', invoiceNo: 'inv-3' },
        { id: 'd', milestone: 'Four', amount: 500, status: 'Paid', invoiceNo: 'INV-4', paid: '2026-09-01' },
      ],
    });
    const csv = [
      'Invoice Number,Payment Date,Amount Paid,Note',
      'INV-1,02/10/2026,"1,000.00",in full',
      'INV-2,01/10/2026,500,first half',
      'INV-3,03/10/2026,3000,"case, and a ""quote"""',
      'INV-4,04/10/2026,500,again',
      'INV-9,04/10/2026,10,someone else',
      'INV-2,31/02/2026,5,bad date',
      ',04/10/2026,10,no number',
    ].join('\r\n');
    const p = project();
    const m = a.matchPayments(p, csv);
    const n = a.applyPayments(p, m);
    const twice = project();
    const whole = a.matchPayments(twice, 'Invoice No,Date,Amount\nINV-2,01/10/2026,1500\nINV-2,05/10/2026,500\n');
    return {
      toPay: m.toPay.map((x) => [x.number, x.paidOn]),
      partial: m.partial.map((x) => [x.number, x.paid]),
      already: m.already.map((x) => x.number),
      skipped: m.skipped.map((x) => x.line),
      applied: [n, p.billing.map((b) => [b.status, b.paid || ''])],
      whole: whole.toPay.map((x) => [x.number, x.paid, x.paidOn]),
      noColumns: a.matchPayments(project(), 'Ref,When\nINV-1,today').error,
      empty: a.matchPayments(project(), '').error,
      parsed: a.parseCsv('a,"b,c","d ""e"""\r\n\r\n"multi\nline",2'),
    };
  });
  eq('paid in full, matched case-insensitively, under our own number', back.toPay, [['INV-1', '2026-10-02'], ['inv-3', '2026-10-03']]);
  eq('a part payment is reported, not rounded up', back.partial, [['INV-2', 500]]);
  eq('already paid here is left alone', back.already, ['INV-4']);
  eq('unknown numbers, bad dates and blank numbers are not used, by line', back.skipped, [6, 7, 8]);
  eq('applying writes only the full payments, with their dates', back.applied,
     [2, [['Paid', '2026-10-02'], ['Invoiced', ''], ['Paid', '2026-10-03'], ['Paid', '2026-09-01']]]);
  eq('two part payments that add up are paid, on the later date', back.whole, [['INV-2', 2000, '2026-10-05']]);
  eq('a file without the columns says which', back.noColumns.startsWith('No invoice number, payment date, amount column'), true);
  eq('an empty file says so', back.empty, 'The file is empty.');
  eq('CSV quoting, doubled quotes, blank lines and line breaks in a field', back.parsed, [['a', 'b,c', 'd "e"'], ['multi\nline', '2']]);

  console.log('\n--- on the page, from the transition template ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-transition');
  await chooseLifecycle(page);
  await page.click('#btn-create-project');
  await page.waitForTimeout(1200);
  await openDestination(page, 'nav-billing');
  eq('the accounting card is on the Billing tab', await page.isVisible('#sec-billing-accounting'), true);
  eq('export waits for someone to bill', await page.isDisabled('[data-acct-export="xero"]'), true);
  await page.fill('[data-acct="billTo"]', 'Orders Platform Ltd');
  await page.fill('[data-acct="accountCode"]', '200');
  await page.fill('[data-acct="taxType"]', 'OUTPUT2');
  await page.waitForTimeout(200);
  eq('typing keeps the caret', await page.evaluate(() => document.activeElement.dataset.acct), 'taxType');
  eq('one invoice to export', (await page.textContent('#acct-summary')).startsWith('1 invoice ready to export'), true);
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('[data-acct-export="xero"]')]);
  const csv = fs.readFileSync(await file.path(), 'utf8');
  eq('the Xero file names the knowledge-transfer invoice', csv.split('\r\n')[1].startsWith('Orders Platform Ltd,') && csv.includes('INV-2077'), true);

  await page.setInputFiles('#acct-payments-file', {
    name: 'payments.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Invoice Number,Payment Date,Amount\nINV-2077,03/10/2026,48000\nINV-9999,03/10/2026,1\n'),
  });
  await page.waitForSelector('#acct-preview-summary');
  eq('the preview says what it will do', await page.textContent('#acct-preview-summary'), '2 lines read. 1 to mark paid, 0 part paid, 0 already paid, 1 not used.');
  eq('and nothing is written yet', await page.evaluate(async () => (await import('/js/state.js')).getState().billing[1].status), 'Invoiced');
  await page.click('#acct-cancel');
  eq('cancel leaves it as it was', [await page.textContent('#acct-preview'), await page.evaluate(async () => (await import('/js/state.js')).getState().billing[1].status)], ['', 'Invoiced']);
  await page.setInputFiles('#acct-payments-file', {
    name: 'payments.csv', mimeType: 'text/csv', buffer: Buffer.from('Invoice Number,Payment Date,Amount\nINV-2077,03/10/2026,48000\n'),
  });
  await page.waitForSelector('#acct-apply');
  await page.click('#acct-apply');
  await page.waitForTimeout(300);
  const row = await page.evaluate(async () => { const b = (await import('/js/state.js')).getState().billing[1]; return [b.status, b.paid]; });
  eq('marked paid on the date the payment arrived', row, ['Paid', '2026-10-03']);
  eq('the table shows it', await page.$eval('#sec-billing tbody tr:nth-child(2) [data-field="status"]', (s) => s.value), 'Paid');
  eq('and nothing is overdue any more', (await page.textContent('#scope-count-billing')).includes('overdue'), false);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
