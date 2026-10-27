// Quotes on a use case, and the proposal document that carries one. Pure.
//
// A quote is what the client is asked to pay: lines, a discount, tax, how long
// the offer stands and on what terms. Its totals are arithmetic, never typed.
// It is accepted when the client signs it — against exactly the lines, prices
// and terms below — and, like every signature in the app, editing it afterwards
// voids the acceptance rather than carrying it over to numbers nobody agreed.
// A sent quote past its date has expired: an offer the client can no longer
// take up is not pipeline.
//
// Once there is a quote, the deal is worth what it says. The accepted quote
// wins; failing that, the latest one still open with the client; failing that,
// the value typed on the pipeline. One number, one home.
//
// The proposal is a page the client can read, print and sign. It is built from
// the use case and the quote, and leaves out everything that is ours alone:
// delivery cost, margin, probability and the internal notes. Every value is
// escaped — a client's name is data, not markup.

import { fingerprint, signatureState } from './signatureModel.js';
import { roiModel, openAssumptions } from './useCaseModel.js';

export const QUOTE_STATUSES = ['Draft', 'Sent', 'Declined', 'Superseded'];

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n) => Math.round(n * 100) / 100;
const pctOf = (value) => Math.min(100, Math.max(0, num(value) ?? 0)) / 100;

/** Line amounts and the totals below them. Total is null until a line is priced. */
export function quoteTotals(quote) {
  const lines = (quote?.lines || []).map((l) => {
    const qty = num(l.qty) ?? 1;
    const price = num(l.unitPrice);
    const gross = price === null ? null : qty * price;
    return { ...l, amount: gross === null ? null : round2(gross * (1 - pctOf(l.discountPct))) };
  });
  const priced = lines.filter((l) => l.amount !== null);
  if (!priced.length) return { lines, subtotal: null, discount: null, net: null, tax: null, total: null };
  const subtotal = round2(priced.reduce((n, l) => n + l.amount, 0));
  const discount = round2(subtotal * pctOf(quote.discountPct));
  const net = round2(subtotal - discount);
  const tax = round2(net * pctOf(quote.taxPct));
  return { lines, subtotal, discount, net, tax, total: round2(net + tax) };
}

/** Exactly what a client signs when accepting. */
export function quoteContent(quote) {
  return {
    number: String(quote.number || ''),
    version: Number(quote.version) || 1,
    lines: (quote.lines || []).map(({ description, qty, unitPrice, discountPct }) => ({ description, qty, unitPrice, discountPct })),
    discountPct: quote.discountPct ?? '',
    taxPct: quote.taxPct ?? '',
    validUntil: quote.validUntil || '',
    paymentTermsDays: quote.paymentTermsDays ?? '',
    terms: String(quote.terms || ''),
    total: quoteTotals(quote).total,
  };
}

function day(value) {
  const [y, m, d] = String(value || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/**
 * 'accepted' | 'changed' (accepted, then edited) | 'expired' | 'sent' |
 * 'declined' | 'superseded' | 'draft'.
 */
export function quoteState(quote, today = new Date()) {
  const signed = signatureState(quote.acceptance, quoteContent(quote));
  if (signed === 'signed') return 'accepted';
  if (signed === 'changed') return 'changed';
  if (quote.status === 'Declined') return 'declined';
  if (quote.status === 'Superseded') return 'superseded';
  if (quote.status === 'Sent') {
    const until = day(quote.validUntil);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return until && until < start ? 'expired' : 'sent';
  }
  return 'draft';
}

/** The quote the deal is worth: accepted, else the latest still open with the client. */
export function governingQuote(uc, today = new Date()) {
  const quotes = uc.quotes || [];
  const latest = (list) => list.reduce((best, q) => (!best || (q.createdAt || 0) >= (best.createdAt || 0) ? q : best), null);
  return latest(quotes.filter((q) => quoteState(q, today) === 'accepted' && quoteTotals(q).total !== null))
    || latest(quotes.filter((q) => quoteState(q, today) === 'sent' && quoteTotals(q).total !== null));
}

/** The next quote number on this use case: Q-001, Q-002… */
export function nextQuoteNumber(uc) {
  const used = (uc.quotes || []).map((q) => Number(String(q.number || '').replace(/\D/g, ''))).filter(Number.isFinite);
  return `Q-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
}

/**
 * A revision: the same number, the next version, as a draft with no
 * acceptance, and the old one superseded. Returns [old, revised].
 */
export function reviseQuote(quote, now = Date.now()) {
  const revised = {
    ...JSON.parse(JSON.stringify(quote)),
    id: `${quote.id}-v${(Number(quote.version) || 1) + 1}`,
    version: (Number(quote.version) || 1) + 1,
    status: 'Draft',
    acceptance: null,
    createdAt: now,
  };
  return [{ ...quote, status: 'Superseded' }, revised];
}

// ---------- The proposal document ----------

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
const pct = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`);

/**
 * A standalone HTML proposal: no scripts, no external requests, inline styles,
 * readable offline and printable to PDF. `formatDate` is passed in so this
 * stays free of the DOM-facing date module.
 */
export function proposalHtml(uc, quote, { formatDate = (d) => String(d || ''), preparedBy = '', today = new Date() } = {}) {
  const t = quoteTotals(quote);
  const model = roiModel(uc);
  const open = openAssumptions(uc);
  const state = quoteState(quote, today);
  const para = (text) => (text ? `<p>${esc(text).replace(/\n/g, '<br>')}</p>` : '<p class="muted">Not written yet.</p>');
  const lines = t.lines.map((l) => `<tr><td>${esc(l.description || 'Untitled line')}</td><td class="n">${esc(l.qty === '' || l.qty === undefined ? 1 : l.qty)}</td><td class="n">${money(num(l.unitPrice))}</td><td class="n">${num(l.discountPct) ? `${esc(l.discountPct)}%` : ''}</td><td class="n">${money(l.amount)}</td></tr>`).join('');
  const caseRows = model ? ['low', 'expected', 'high'].map((k) => {
    const s = model[k];
    return `<tr><th>${k[0].toUpperCase()}${k.slice(1)}</th><td class="n">${money(Math.round(s.totalBenefit))}</td><td class="n">${money(Math.round(s.totalCost))}</td><td class="n">${s.roi === null ? '—' : pct(s.roi)}</td><td class="n">${s.payback ? `Month ${s.payback}` : '—'}</td></tr>`;
  }).join('') : '';
  const accepted = state === 'accepted' && quote.acceptance
    ? `<p class="accepted">Accepted by ${esc(quote.acceptance.name)} on ${esc(formatDate(new Date(quote.acceptance.at)))}. Fingerprint ${esc(String(quote.acceptance.hash || '').slice(0, 16))}.</p>`
    : '<table class="sign"><tr><td>Accepted for the client<br><br>Name ____________________</td><td><br><br>Signature ____________________</td><td><br><br>Date ____________</td></tr></table>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`Proposal ${quote.number} — ${uc.name || 'Use case'}`)}</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f1d2b;max-width:820px;margin:32px auto;padding:0 20px}
h1{font-size:1.7rem;margin:0 0 4px}h2{font-size:1.1rem;margin:28px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
.meta{color:#555;margin:0 0 20px}.muted{color:#888;font-style:italic}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}
td.n,th.n{text-align:right;white-space:nowrap}tfoot td{font-weight:600}tfoot tr:last-child td{font-size:1.05rem;border-top:2px solid #1f1d2b}
.note{font-size:.85rem;color:#555}.accepted{padding:10px;border:1px solid #16a34a;color:#14532d;border-radius:6px}
.sign td{border:0;padding-top:24px}.status{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef;font-size:.8rem}
@media print{body{margin:0}h2{break-after:avoid}table{break-inside:avoid}}
</style></head><body>
<h1>${esc(uc.name || 'Proposal')}</h1>
<p class="meta">For ${esc(uc.client || 'the client')}${uc.sponsor ? `, attention ${esc(uc.sponsor)}` : ''} · Quote ${esc(quote.number)} version ${esc(quote.version || 1)}${quote.issued ? ` · issued ${esc(formatDate(quote.issued))}` : ''}${quote.validUntil ? ` · valid until ${esc(formatDate(quote.validUntil))}` : ''}${preparedBy ? ` · prepared by ${esc(preparedBy)}` : ''} <span class="status">${esc({ accepted: 'Accepted', changed: 'Changed since accepted', expired: 'Expired', sent: 'Open', declined: 'Declined', superseded: 'Superseded', draft: 'Draft' }[state])}</span></p>
<h2>The problem</h2>${para(uc.problem)}
<h2>How it is done today</h2>${para(uc.currentProcess)}
<h2>What will be different</h2>${para(uc.outcome)}
<h2>The business case</h2>
${model ? `<table><thead><tr><th></th><th class="n">Benefit</th><th class="n">Cost</th><th class="n">ROI</th><th class="n">Payback</th></tr></thead><tbody>${caseRows}</tbody></table>
<p class="note">Over ${esc(model.assumptions.horizonYears)} years, with benefits building to ${esc(model.assumptions.adoption)}% adoption over ${esc(model.assumptions.rampMonths)} months. Low and high scale the benefits only, never the cost. Net present value at ${esc(model.assumptions.discountRate)}%: ${money(Math.round(model.expected.npv))}.${open.length ? ` ${open.length} figure${open.length === 1 ? ' is' : 's are'} still an assumption rather than a sourced number, and should be confirmed together.` : ''}</p>` : '<p class="muted">Not modelled yet.</p>'}
<h2>Investment</h2>
<table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Discount</th><th class="n">Amount</th></tr></thead>
<tbody>${lines || '<tr><td colspan="5" class="muted">No lines yet.</td></tr>'}</tbody>
<tfoot>
<tr><td colspan="4">Subtotal</td><td class="n">${money(t.subtotal)}</td></tr>
${t.discount ? `<tr><td colspan="4">Discount (${esc(quote.discountPct)}%)</td><td class="n">−${money(t.discount)}</td></tr>` : ''}
${t.tax ? `<tr><td colspan="4">Tax (${esc(quote.taxPct)}%)</td><td class="n">${money(t.tax)}</td></tr>` : ''}
<tr><td colspan="4">Total</td><td class="n">${money(t.total)}</td></tr>
</tfoot></table>
<h2>Terms</h2>
${num(quote.paymentTermsDays) !== null ? `<p>Invoices are payable within ${esc(quote.paymentTermsDays)} days.</p>` : ''}${para(quote.terms)}
<h2>Acceptance</h2>
${accepted}
</body></html>`;
}

/** A content fingerprint for the proposal file name, so two versions never share one. */
export function proposalFileName(uc, quote) {
  const slug = String(uc.client || uc.name || 'proposal').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proposal';
  return `proposal-${slug}-${String(quote.number || 'q').toLowerCase()}-v${quote.version || 1}-${fingerprint(quoteContent(quote)).slice(0, 6)}.html`;
}
