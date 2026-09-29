// The link to the accounting system: invoices out, payments back. Pure.
//
// The books are kept elsewhere — Xero, QuickBooks — and this app should not
// pretend to be a ledger. A live connection to either needs OAuth, and OAuth
// needs a server to hold its client secret; this app has no server of its
// own, by design. So the link is files, in both directions:
//
//   out: billing milestones that are ready to invoice, or invoiced, as a CSV
//        in the import layout each system publishes, or a plain one;
//   in:  a payments export from the accounting system, matched to milestones
//        by invoice number, previewed, and only then marked paid.
//
// Both directions say what they left out and why. An invoice with no number
// cannot be matched when the payment comes back, so it is not exported; a
// payment for less than the milestone is a part payment and is reported, not
// rounded up to Paid.
//
// Text cells that begin with = + - or @ are the start of a spreadsheet
// formula, and a CSV opened in a spreadsheet will run them. Customer names and
// milestone titles are typed by people, so those cells get a leading
// apostrophe. Numbers and dates are written by this module and never need it.

import { termsOf } from './billing.js';

export const FORMATS = {
  xero: 'Xero — sales invoices',
  quickbooks: 'QuickBooks Online — invoices',
  plain: 'Plain CSV',
};

export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

const EXPORTABLE = ['Ready to invoice', 'Invoiced'];

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function day(value) {
  const [y, m, d] = String(value || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function formatDateAs(date, format) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  if (format === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  if (format === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
  return `${dd}/${mm}/${yyyy}`;
}

/** A date read back from an accounting export: ISO always, else the configured numeric order. */
export function parseDateAs(text, format) {
  const s = String(text || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  const [dd, mm] = format === 'MM/DD/YYYY' ? [b, a] : [a, b];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(Number(m[3]), mm - 1, dd);
  return d.getMonth() === mm - 1 ? d : null;
}

/** The project's accounting settings, with defaults. */
export function settingsOf(project) {
  const a = project?.accounting || {};
  return {
    billTo: String(a.billTo || '').trim(),
    accountCode: String(a.accountCode || '').trim(),
    taxType: String(a.taxType || '').trim(),
    currency: String(a.currency || '').trim().toUpperCase(),
    dateFormat: DATE_FORMATS.includes(a.dateFormat) ? a.dateFormat : 'DD/MM/YYYY',
  };
}

/**
 * The invoices that would go out, and the milestones left behind with the
 * reason. Blocked (with a reason) when there is nobody to bill.
 */
export function invoicesFor(project, today = new Date()) {
  const s = settingsOf(project);
  const terms = termsOf(project);
  const included = [];
  const left = [];
  (project?.billing || []).forEach((row, index) => {
    const ref = `BM-${String(index + 1).padStart(2, '0')}`;
    const label = row.milestone || ref;
    if (!EXPORTABLE.includes(row.status)) return;
    const amount = num(row.amount);
    if (amount === null || amount <= 0) { left.push({ label, why: 'no amount' }); return; }
    if (!String(row.invoiceNo || '').trim()) { left.push({ label, why: 'no invoice number — nothing to match the payment back to' }); return; }
    const issued = day(row.invoiced) || today;
    const due = new Date(issued.getFullYear(), issued.getMonth(), issued.getDate() + terms);
    included.push({ id: row.id, ref, number: String(row.invoiceNo).trim(), description: label, amount, issued, due });
  });
  const blocked = !s.billTo ? 'Name who the invoices are billed to, as your accounting system knows them.' : '';
  const warnings = [];
  if (!s.accountCode) warnings.push('No revenue account code: Xero requires one on every line.');
  if (!s.taxType) warnings.push('No tax type: Xero requires one on every line.');
  return { included, left, blocked, warnings, settings: s, terms };
}

const FORMULA = /^[=+\-@\t\r]/;

function cell(value, { text = false } = {}) {
  let s = value === null || value === undefined ? '' : String(value);
  if (text && FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const money = (n) => n.toFixed(2);

/** The CSV text for one format, CRLF line endings, as spreadsheets expect. */
export function invoiceCsv(project, format, today = new Date()) {
  const { included, settings: s, terms } = invoicesFor(project, today);
  const date = (d) => formatDateAs(d, s.dateFormat);
  const reference = (inv) => `${inv.ref} ${project.projectName || ''}`.trim();
  let header;
  let rows;
  if (format === 'xero') {
    header = ['*ContactName', 'EmailAddress', 'POAddressLine1', 'POAddressLine2', 'POAddressLine3', 'POAddressLine4', 'POCity', 'PORegion',
      'POPostalCode', 'POCountry', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', 'InventoryItemCode', '*Description',
      '*Quantity', '*UnitAmount', 'Discount', '*AccountCode', '*TaxType', 'TrackingName1', 'TrackingOption1', 'TrackingName2',
      'TrackingOption2', 'Currency', 'BrandingTheme'];
    rows = included.map((inv) => [cell(s.billTo, { text: true }), '', '', '', '', '', '', '', '', '', cell(inv.number, { text: true }),
      cell(reference(inv), { text: true }), date(inv.issued), date(inv.due), '', cell(inv.description, { text: true }), '1',
      money(inv.amount), '', cell(s.accountCode, { text: true }), cell(s.taxType, { text: true }), '', '', '', '', cell(s.currency), '']);
  } else if (format === 'quickbooks') {
    header = ['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Terms', 'Memo', 'Item(Product/Service)', 'ItemDescription',
      'ItemQuantity', 'ItemRate', 'ItemAmount', 'Currency'];
    rows = included.map((inv) => [cell(inv.number, { text: true }), cell(s.billTo, { text: true }), date(inv.issued), date(inv.due),
      cell(`Net ${terms}`), cell(reference(inv), { text: true }), 'Services', cell(inv.description, { text: true }), '1',
      money(inv.amount), money(inv.amount), cell(s.currency)]);
  } else {
    header = ['InvoiceNumber', 'Customer', 'InvoiceDate', 'DueDate', 'Description', 'Amount', 'Currency', 'Reference'];
    rows = included.map((inv) => [cell(inv.number, { text: true }), cell(s.billTo, { text: true }), date(inv.issued), date(inv.due),
      cell(inv.description, { text: true }), money(inv.amount), cell(s.currency), cell(reference(inv), { text: true })]);
  }
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n') + '\r\n';
}

// ---------- Payments back ----------

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const COLUMN = {
  number: /^\*?(invoice\s*(no|number|#|num)|invoiceno|invoicenumber|invoice)$/i,
  date: /^\*?(date\s*paid|paid\s*date|payment\s*date|paymentdate|date)$/i,
  amount: /^\*?(amount\s*paid|paid\s*amount|payment\s*amount|amountpaid|payment|amount|paid)$/i,
};

/**
 * Matches a payments export to the billing milestones. Returns what would be
 * marked paid, what is only part paid, what is already paid, and every line
 * that could not be read or matched, each with why. Writes nothing.
 */
export function matchPayments(project, csvText) {
  const s = settingsOf(project);
  const rows = parseCsv(csvText);
  if (!rows.length) return { error: 'The file is empty.' };
  const header = rows[0].map((h) => h.trim());
  const col = Object.fromEntries(Object.entries(COLUMN).map(([k, re]) => [k, header.findIndex((h) => re.test(h))]));
  const missing = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => ({ number: 'invoice number', date: 'payment date', amount: 'amount' }[k]));
  if (missing.length) return { error: `No ${missing.join(', ')} column. Looked for headings such as “Invoice Number”, “Payment Date” and “Amount”.` };

  const billing = project?.billing || [];
  const byNumber = new Map(billing.map((b) => [String(b.invoiceNo || '').trim().toLowerCase(), b]).filter(([k]) => k));
  const totals = new Map();
  const skipped = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const number = String(r[col.number] || '').trim();
    const amount = Number(String(r[col.amount] || '').replace(/[^0-9.-]/g, ''));
    const date = parseDateAs(r[col.date], s.dateFormat);
    if (!number) { skipped.push({ line, why: 'no invoice number' }); return; }
    const target = byNumber.get(number.toLowerCase());
    if (!target) { skipped.push({ line, why: `${number} is not on this project’s billing plan` }); return; }
    if (!Number.isFinite(amount) || amount <= 0) { skipped.push({ line, why: `${number}: no amount` }); return; }
    if (!date) { skipped.push({ line, why: `${number}: the date “${r[col.date] || ''}” is not a ${s.dateFormat} date` }); return; }
    const t = totals.get(target.id) || { row: target, paid: 0, last: null };
    t.paid += amount;
    if (!t.last || date > t.last) t.last = date;
    totals.set(target.id, t);
  });

  const toPay = [];
  const partial = [];
  const already = [];
  totals.forEach(({ row, paid, last }) => {
    const due = num(row.amount) ?? 0;
    const item = { id: row.id, number: row.invoiceNo, milestone: row.milestone || '', amount: due, paid: Math.round(paid * 100) / 100, paidOn: iso(last) };
    if (row.status === 'Paid') already.push(item);
    else if (paid + 0.005 >= due) toPay.push(item);
    else partial.push(item);
  });
  return { toPay, partial, already, skipped, lines: rows.length - 1 };
}

/** Applies a match: marks each milestone paid on the date its last payment arrived. */
export function applyPayments(project, match) {
  const ids = new Map(match.toPay.map((p) => [p.id, p]));
  let changed = 0;
  (project.billing || []).forEach((row) => {
    const p = ids.get(row.id);
    if (!p) return;
    row.status = 'Paid';
    row.paid = p.paidOn;
    changed += 1;
  });
  return changed;
}
