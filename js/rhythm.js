// The project's operating rhythm: a daily stand-up, a weekly review and a
// monthly steering, each with a purpose, a length, who attends, what it
// focuses on, what it produces, and when something it hears must go up to the
// next one. Pure.
//
// The rhythm is the plan for the meetings; the meetings themselves are the
// Meetings page's, one home each. A cadence becomes a meeting series
// (`seriesMeeting`), and the series carries `cadence` so the rhythm can say
// when each was last held and next due without keeping a second calendar.
//
// "Escalate when" is not a list of reminders here. Each trigger is read off
// the project as it stands — a task blocked more than a day, a dependency at
// risk, a person booked past their time, SPI or CPI under 0.9 — so the
// rhythm says what is waiting to go up now. A trigger the project has no data
// for is null (grey), not zero: nobody has measured it, which is different
// from nothing being wrong. Information flows up for decisions and down for
// clarity; this is the up.

import { isBlocked } from './flow.js';
import { derivedStatus } from './changeControl.js';

export const RHYTHM_ROLES = ['Core team', 'Project manager', 'Functional leads', 'Stakeholders', 'Steering committee'];
export const RACI = [
  { code: 'R', label: 'Responsible' },
  { code: 'C', label: 'Contribute' },
  { code: 'I', label: 'Inform' },
  { code: '', label: 'Not required' },
];

export const TRIGGERS = {
  blocker: 'Blocker for more than a day',
  scope: 'Scope conflict',
  external: 'External dependency at risk',
  risk: 'Risk to scope, schedule or budget',
  resource: 'Resource conflict',
  crossteam: 'Cross-team impact',
  variance: 'Variance against plan',
  budget: 'Budget overrun',
  scopechange: 'Scope change',
  strategic: 'Strategic risk',
};

// Where each trigger's evidence lives, so the page can link to it.
export const TRIGGER_HOME = {
  blocker: 'tab-tasks', scope: 'tab-scope', external: 'nav-dependencies', risk: 'nav-raid-log', resource: 'tab-resources',
  crossteam: 'nav-dependencies', variance: 'tab-kpis', budget: 'tab-planner', scopechange: 'tab-scope', strategic: 'nav-raid-log',
};

export function defaultRhythm() {
  return {
    reviewedAt: '',
    cadences: [
      {
        id: 'daily', label: 'Daily stand-up', every: 'Daily', repeat: 'Weekdays', minutes: 15, weekday: '', time: '09:15', on: true,
        purpose: 'Sync progress, surface blockers, plan the day.',
        focus: [{ text: 'Yesterday and today', minutes: 5 }, { text: 'Blockers', minutes: 5 }, { text: 'Commitments', minutes: 5 }],
        output: 'Clear next actions and owners',
        escalate: ['blocker', 'scope', 'external'],
        attend: { 'Core team': 'R', 'Project manager': 'R', 'Functional leads': '', Stakeholders: '', 'Steering committee': '' },
      },
      {
        id: 'weekly', label: 'Weekly review', every: 'Weekly', repeat: 'Weekly', minutes: 60, weekday: '1', time: '10:00', on: true,
        purpose: 'Review progress, adjust the plan, manage risks.',
        focus: [{ text: 'Progress against plan', minutes: 20 }, { text: 'Risks and issues', minutes: 20 }, { text: 'Decisions needed', minutes: 15 }],
        output: 'Updated plan, decisions and actions',
        escalate: ['risk', 'resource', 'crossteam'],
        attend: { 'Core team': 'R', 'Project manager': 'R', 'Functional leads': 'R', Stakeholders: 'C', 'Steering committee': '' },
      },
      {
        id: 'monthly', label: 'Monthly steering', every: 'Monthly', repeat: 'Monthly', minutes: 90, weekday: '', time: '14:00', on: true,
        purpose: 'Evaluate outcomes, reprioritise, remove roadblocks.',
        focus: [{ text: 'Outcomes and value', minutes: 20 }, { text: 'Budget and forecast', minutes: 20 }, { text: 'Major risks', minutes: 20 }, { text: 'Strategic decisions', minutes: 25 }],
        output: 'Decisions, resourcing and direction',
        escalate: ['variance', 'budget', 'scopechange', 'strategic'],
        attend: { 'Core team': 'I', 'Project manager': 'R', 'Functional leads': 'C', Stakeholders: 'R', 'Steering committee': 'R' },
      },
    ],
  };
}

/** A saved rhythm with any missing piece filled from the default. */
export function rhythmOf(project) {
  const saved = project?.rhythm;
  const base = defaultRhythm();
  if (!saved || !Array.isArray(saved.cadences)) return base;
  return {
    reviewedAt: saved.reviewedAt || '',
    cadences: base.cadences.map((d) => {
      const c = saved.cadences.find((x) => x.id === d.id) || {};
      return { ...d, ...c, attend: { ...d.attend, ...(c.attend || {}) }, focus: Array.isArray(c.focus) ? c.focus : d.focus, escalate: Array.isArray(c.escalate) ? c.escalate : d.escalate };
    }),
  };
}

// ---------- dates ----------

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function day(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY_MS = 86400000;
function stamp(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)) : null;
}

/** The first date on or after `from` the cadence meets: a weekday, the chosen weekday, or the first working day of next month. */
export function firstDate(cadence, from = new Date()) {
  const d = startOf(from);
  if (cadence.id === 'monthly' || cadence.every === 'Monthly') {
    const first = new Date(d.getFullYear(), d.getMonth() + (d.getDate() === 1 ? 0 : 1), 1);
    while (first.getDay() === 0 || first.getDay() === 6) first.setDate(first.getDate() + 1);
    return iso(first);
  }
  const want = cadence.every === 'Weekly' && cadence.weekday !== '' ? Number(cadence.weekday) : null;
  for (let i = 0; i < 14; i += 1) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    const wd = x.getDay();
    if (want === null ? wd !== 0 && wd !== 6 : wd === want) return iso(x);
  }
  return iso(d);
}

function plus(time, minutes) {
  const [h, m] = String(time || '09:00').split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + Number(minutes || 0));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * The fields of the first meeting in a cadence's series: timed agenda from
 * the focus items, the purpose and output, the repeat, and `cadence` so the
 * rhythm can find its meetings again. Invitees are added by the page, which
 * knows the team.
 */
export function seriesMeeting(cadence, from = new Date()) {
  return {
    name: cadence.label,
    date: firstDate(cadence, from),
    startTime: cadence.time || '09:00',
    endTime: plus(cadence.time, cadence.minutes),
    repeat: cadence.repeat,
    cadence: cadence.id,
    purpose: cadence.purpose,
    expectedOutput: cadence.id === 'daily' ? 'Plan' : 'Decision',
    agenda: (cadence.focus || []).map((f) => ({ topic: f.text, minutes: f.minutes || '' })),
  };
}

/** When each cadence last met and next meets, read off its meetings. */
export function cadenceHealth(project, cadence, today = new Date()) {
  const t = iso(today);
  const mine = (project.meetings || []).filter((m) => m.cadence === cadence.id && m.date && m.status !== 'Cancelled');
  const held = mine.filter((m) => m.date <= t && m.status !== 'Scheduled').map((m) => m.date).sort();
  const coming = mine.filter((m) => m.date >= t).map((m) => m.date).sort();
  const last = held[held.length - 1] || '';
  // A cadence whose last meeting is more than two of its intervals ago has lapsed.
  const interval = { Daily: 1, Weekly: 7, Monthly: 31 }[cadence.every] || 7;
  const gap = last ? Math.round((startOf(today) - day(last)) / DAY_MS) : null;
  return {
    series: mine.length > 0,
    last,
    next: coming[0] || '',
    lapsed: mine.length > 0 && (gap === null ? !coming.length : gap > interval * 2 + (cadence.every === 'Daily' ? 2 : 0)),
  };
}

// ---------- escalate when ----------

/** When a blocked task became blocked, from its status history; null if not recorded. */
export function blockedSince(task) {
  const h = task.statusHistory || [];
  if (!h.length || !h[h.length - 1].blocked) return null;
  let i = h.length - 1;
  while (i > 0 && h[i - 1].blocked) i -= 1;
  return h[i].seen ? null : stamp(h[i].at);
}

/**
 * Every trigger, read off the project: { id, label, count, items[], home }.
 * `count` is null when the project holds nothing that could answer it.
 * `context` carries what lives outside the project: overload fixes from the
 * Resources page, and the earned value the KPI page already works out.
 */
export function triggerSignals(project, { today = new Date(), overloads = null, ev = null } = {}) {
  const tasks = project.dashTasks || [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const t0 = startOf(today);
  const out = {};
  const set = (id, count, items = []) => { out[id] = { id, label: TRIGGERS[id], count, items, home: TRIGGER_HOME[id] }; };

  const blocked = tasks.filter((t) => t.status !== 'Complete' && isBlocked(t, byId));
  const long = [];
  let unknown = 0;
  blocked.forEach((t) => {
    const since = blockedSince(t);
    if (!since) { unknown += 1; return; }
    const days = (today - since) / DAY_MS;
    if (days > 1) long.push(`${t.name || 'A task'} — blocked ${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`);
  });
  set('blocker', tasks.length ? long.length : null, unknown ? [...long, `${unknown} more blocked since a date not recorded`] : long);

  const crs = project.changeRequests || [];
  const pending = crs.filter((c) => ['Submitted', 'Under Review'].includes(derivedStatus(c)));
  set('scope', pending.length, pending.map((c) => `${c.title || 'A change request'} — awaiting a decision`));

  const deps = (project.dependencies || []).filter((d) => !['Met', 'Missed'].includes(d.status));
  const soon = (d) => { const n = day(d.neededBy); return n && (n - t0) / DAY_MS <= 7; };
  const atRisk = deps.filter((d) => d.direction !== 'They depend on us' && (d.status === 'At Risk' || (d.status === 'Open' && soon(d))));
  set('external', (project.dependencies || []).length ? atRisk.length : null, atRisk.map((d) => `${d.description || 'A dependency'}${d.party ? ` (${d.party})` : ''}${d.neededBy ? ` — needed ${d.neededBy}` : ''}`));
  const others = deps.filter((d) => d.type === 'Internal' && d.party);
  set('crossteam', (project.dependencies || []).length ? others.length : null, others.map((d) => `${d.party}: ${d.description || 'dependency'}`));

  const open = (project.raid || []).filter((r) => r.status !== 'Closed');
  const score = (r) => ({ Critical: 4, High: 3, Medium: 2, Low: 1 }[r.severity] || 0) * ({ High: 3, Medium: 2, Low: 1 }[r.likelihood] || 0);
  const top = open.filter((r) => (r.type === 'Risk' && score(r) >= 6) || (r.type === 'Issue' && ['Critical', 'High'].includes(r.severity)));
  set('risk', (project.raid || []).length ? top.length : null, top.map((r) => `${r.type}: ${r.title || 'untitled'} (${r.severity}${r.likelihood ? ` × ${r.likelihood}` : ''})`));
  const strategic = open.filter((r) => r.severity === 'Critical');
  set('strategic', (project.raid || []).length ? strategic.length : null, strategic.map((r) => `${r.title || 'untitled'}`));

  set('resource', overloads === null ? null : overloads.length, (overloads || []).map((f) => `${f.name} +${f.over}% — ${f.text}`));

  const spi = ev && ev.pv ? ev.ev / ev.pv : null;
  const cpi = ev && ev.ac ? ev.ev / ev.ac : null;
  const variance = [];
  if (spi !== null && spi < 0.9) variance.push(`SPI ${spi.toFixed(2)} — behind plan`);
  if (cpi !== null && cpi < 0.9) variance.push(`CPI ${cpi.toFixed(2)} — over the hours planned`);
  set('variance', spi === null && cpi === null ? null : variance.length, variance);

  const planned = Number(project.budgetPlanned);
  const actual = Number(project.budgetActual);
  const over = planned > 0 && Number.isFinite(actual) && actual > planned;
  set('budget', planned > 0 && project.budgetActual !== '' && project.budgetActual !== undefined ? (over ? 1 : 0) : null, over ? [`Spent ${actual} of ${planned} planned (${Math.round((actual / planned) * 100)}%)`] : []);

  const month = new Date(t0.getFullYear(), t0.getMonth() - 1, t0.getDate());
  const changed = crs.filter((c) => ['Approved', 'Implemented'].includes(derivedStatus(c)) && day(c.decided) && day(c.decided) >= month);
  set('scopechange', crs.length ? changed.length : null, changed.map((c) => `${c.title || 'A change'} — ${derivedStatus(c).toLowerCase()} ${c.decided}`));
  return out;
}

/** The triggers each cadence listens for, with what is waiting to go up. */
export function escalationsDue(project, rhythm, context) {
  const signals = triggerSignals(project, context);
  return rhythm.cadences.filter((c) => c.on).map((c) => ({
    cadence: c,
    signals: (c.escalate || []).map((id) => signals[id]).filter(Boolean),
  }));
}

// ---------- setup checklist ----------

/**
 * The six steps from the setup checklist, worked out from the rhythm and the
 * meetings: purpose, cadence, attendees, a tight agenda, the flow up, and a
 * monthly review of the rhythm itself.
 */
export function setupChecks(project, rhythm, today = new Date()) {
  const on = rhythm.cadences.filter((c) => c.on);
  const planned = (c) => (c.focus || []).reduce((s, f) => s + (Number(f.minutes) || 0), 0);
  const reviewed = day(rhythm.reviewedAt);
  const sinceReview = reviewed ? Math.round((startOf(today) - reviewed) / DAY_MS) : null;
  const noSeries = on.filter((c) => !cadenceHealth(project, c, today).series);
  return [
    { id: 'purpose', label: 'Define purpose', ok: on.length > 0 && on.every((c) => String(c.purpose || '').trim() && String(c.output || '').trim()), detail: 'Each cadence says what it is for and what it produces.' },
    { id: 'cadence', label: 'Set cadences', ok: on.length > 0 && on.every((c) => c.time && Number(c.minutes) > 0 && (c.every !== 'Weekly' || c.weekday !== '')), detail: 'A day, a time and a length for each.' },
    { id: 'attendees', label: 'Define attendees', ok: on.every((c) => Object.values(c.attend || {}).includes('R')), detail: 'Someone responsible at every cadence; invite only who adds value.' },
    { id: 'agenda', label: 'Design agenda', ok: on.every((c) => (c.focus || []).length && planned(c) > 0 && planned(c) <= Number(c.minutes)), detail: on.filter((c) => planned(c) > Number(c.minutes)).map((c) => `${c.label} is planned at ${planned(c)} of ${c.minutes} min.`).join(' ') || 'Each section timeboxed within the meeting.' },
    { id: 'flow', label: 'Create flow', ok: on.every((c) => (c.escalate || []).length) && noSeries.length === 0, detail: noSeries.length ? `No meetings yet for ${noSeries.map((c) => c.label).join(', ')}.` : 'Each cadence has its triggers and its meetings.' },
    { id: 'review', label: 'Review and improve', ok: sinceReview !== null && sinceReview <= 35, detail: sinceReview === null ? 'The rhythm has not been reviewed yet — retrospect monthly.' : `Last reviewed ${sinceReview} day${sinceReview === 1 ? '' : 's'} ago.` },
  ];
}
