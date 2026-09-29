// Billing: what the contract is worth, when it is billed, and whether the
// money has come in. Pure.
//
// Delivery that never checks the money is half a picture: a project can be on
// time and on budget while the client has paid for none of it. Each billing
// milestone moves Planned → Ready to invoice → Invoiced → Paid (or Disputed,
// or Written off); an invoice past its payment terms and unpaid is overdue,
// worked out from the dates rather than typed.
//
// The contract value is the project's, visible to everyone on it — the team
// needs to know what was sold. The margin on it is not: that stays with the
// deal, on Use Cases, where only client partners can read it.

export const BILLING_STATUSES = ['Planned', 'Ready to invoice', 'Invoiced', 'Paid', 'Disputed', 'Written off'];
const BILLED = ['Invoiced', 'Paid', 'Disputed'];

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function day(value) {
  const [y, m, d] = String(value || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((b - a) / DAY_MS);

export function termsOf(project) {
  const n = num(project?.paymentTermsDays);
  return n !== null && n >= 0 ? n : 30;
}

/** One milestone's collection state: when it is due, and how late if it is. */
export function collectionState(row, terms, today = new Date()) {
  const invoiced = day(row.invoiced);
  const paid = day(row.paid);
  if (row.status === 'Paid') {
    return { state: 'paid', days: invoiced && paid ? daysBetween(invoiced, paid) : null };
  }
  if (row.status === 'Written off') return { state: 'written-off', days: null };
  if (BILLED.includes(row.status)) {
    if (!invoiced) return { state: 'no-date', days: null };
    const dueBy = new Date(invoiced.getTime() + terms * DAY_MS);
    const late = daysBetween(dueBy, today);
    return late > 0
      ? { state: 'overdue', days: late, dueBy }
      : { state: row.status === 'Disputed' ? 'disputed' : 'awaiting', days: -late, dueBy };
  }
  const due = day(row.due);
  if (row.status === 'Ready to invoice') return { state: 'ready', days: null };
  if (due && due < today) return { state: 'late-to-bill', days: daysBetween(due, today) };
  return { state: 'planned', days: null };
}

/**
 * The project's money. `dso` is the mean days from invoice to payment over the
 * invoices already paid — null until one has been, because a collection time
 * with no collections behind it is not a number.
 */
export function billingMetrics(project, today = new Date()) {
  const rows = project?.billing || [];
  const terms = termsOf(project);
  const amount = (r) => num(r.amount) ?? 0;
  const sum = (list) => list.reduce((n, r) => n + amount(r), 0);
  const contract = num(project?.contractValue);
  const scheduled = sum(rows.filter((r) => r.status !== 'Written off'));
  const billed = sum(rows.filter((r) => BILLED.includes(r.status)));
  const paid = sum(rows.filter((r) => r.status === 'Paid'));
  const states = rows.map((r) => ({ r, c: collectionState(r, terms, today) }));
  const overdue = states.filter((x) => x.c.state === 'overdue');
  const collected = states.filter((x) => x.c.state === 'paid' && x.c.days !== null).map((x) => x.c.days);
  return {
    contract,
    scheduled,
    billed,
    paid,
    outstanding: billed - paid,
    overdueAmount: sum(overdue.map((x) => x.r)),
    overdueCount: overdue.length,
    lateToBill: states.filter((x) => x.c.state === 'late-to-bill').length,
    unscheduled: contract !== null ? contract - scheduled : null,
    billedPct: contract ? billed / contract : null,
    paidPct: contract ? paid / contract : null,
    dso: collected.length ? collected.reduce((a, b) => a + b, 0) / collected.length : null,
    terms,
    count: rows.length,
  };
}
