// Portfolio: every project on one line.
//
// The Dashboard answers "how is this project?" very well and cannot answer
// "how are all of them?" at all — which is the first question an engagement
// lead or a delivery manager actually asks, and the reason a spreadsheet keeps
// getting made alongside the tool. Each column here is a number the app is
// already computing per project; the only new thing is putting them side by
// side and totalling them.
//
// Sorting is a view preference, not data, so it lives here rather than in the
// store: a column someone sorted by last Tuesday is not worth syncing.

import { listFullProjects, getActiveProjectId } from './state.js';
import { el } from './dom.js';
import { parseDate } from './charts.js';

let onGo = null;
let sortKey = 'due';
let sortDir = 1;

const RAG_TONE = { 'ON TRACK': 'is-good', 'AT RISK': 'is-warn', 'OFF TRACK': 'is-bad' };

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** One project, reduced to the dozen numbers a portfolio review runs on. */
function summarise(project, today) {
  const tasks = project.dashTasks || [];
  const complete = tasks.filter((t) => t.status === 'Complete').length;
  const overdue = tasks.filter((t) => {
    if (t.status === 'Complete') return false;
    const end = parseDate(t.end);
    return !!(end && end < today);
  }).length;

  const openRaid = (project.raid || []).filter((r) => r.status !== 'Closed');
  const critical = openRaid.filter((r) => r.severity === 'Critical' || r.severity === 'High').length;

  const nextMilestone = (project.milestones || [])
    .filter((m) => !m.done && parseDate(m.due))
    .sort((a, b) => parseDate(a.due) - parseDate(b.due))[0] || null;

  const deliverables = project.deliverables || [];
  const accepted = deliverables.filter((d) => d.status === 'Accepted').length;

  const breached = (project.serviceLevels || []).filter((s) => s.status === 'Breached').length;

  const planned = Number(project.budgetPlanned) || 0;
  const actual = Number(project.budgetActual) || 0;

  const due = parseDate(project.dueDate);
  return {
    id: project.id,
    name: project.projectName || 'Untitled project',
    rag: (project.dashStatus || '').trim().toUpperCase(),
    total: tasks.length,
    complete,
    pct: tasks.length ? Math.round((complete / tasks.length) * 100) : 0,
    overdue,
    risks: openRaid.length,
    critical,
    deliverables: deliverables.length,
    accepted,
    breached,
    planned,
    actual,
    dueDate: project.dueDate || '',
    dueSort: due ? due.getTime() : Infinity,
    daysLeft: due ? Math.round((due - today) / 86400000) : null,
    nextMilestone: nextMilestone ? nextMilestone.text : '',
    nextMilestoneDue: nextMilestone ? nextMilestone.due : '',
    updatedAt: project.updatedAt || 0,
  };
}

const COLUMNS = [
  { key: 'name', label: 'Project', cls: 'col-name' },
  { key: 'rag', label: 'RAG' },
  { key: 'pct', label: 'Progress', numeric: true },
  { key: 'overdue', label: 'Overdue', numeric: true },
  { key: 'risks', label: 'Open risks', numeric: true },
  { key: 'accepted', label: 'Accepted', numeric: true },
  { key: 'breached', label: 'SLA breached', numeric: true },
  { key: 'planned', label: 'Budget', numeric: true },
  { key: 'due', label: 'Due', numeric: true },
  { key: 'next', label: 'Next milestone', cls: 'col-wide' },
];

function sortValue(row, key) {
  if (key === 'due') return row.dueSort;
  if (key === 'next') return row.nextMilestoneDue || '';
  if (key === 'rag') return ['ON TRACK', 'AT RISK', 'OFF TRACK'].indexOf(row.rag);
  return row[key];
}

function money(n) {
  if (!n) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function dueCell(row) {
  if (!row.dueDate) return el('td', { class: 'num pf-due', text: '—' });
  const late = row.daysLeft !== null && row.daysLeft < 0;
  const soon = row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= 14;
  return el('td', { class: `num pf-due ${late ? 'is-late' : soon ? 'is-soon' : ''}` }, [
    el('span', { text: parseDate(row.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }),
    row.daysLeft !== null
      ? el('span', { class: 'pf-due__rel', text: late ? `${Math.abs(row.daysLeft)}d over` : `${row.daysLeft}d` })
      : null,
  ]);
}

function bar(pct) {
  return el('td', { class: 'num pf-progress' }, [
    el('span', { class: 'pf-bar' }, [el('span', { class: 'pf-bar__fill', style: `width:${pct}%` })]),
    el('span', { class: 'pf-bar__label', text: `${pct}%` }),
  ]);
}

/** A count that is zero is good news, and should not shout like a count that isn't. */
function countCell(n, tone) {
  return el('td', { class: `num ${n > 0 ? tone : 'is-quiet'}`, text: String(n) });
}

export function renderPortfolio() {
  const body = document.getElementById('portfolio-body');
  if (!body) return;

  const today = startOfToday();
  const rows = listFullProjects().map((p) => summarise(p, today));
  rows.sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    if (av === bv) return a.name.localeCompare(b.name);
    return (av > bv ? 1 : -1) * sortDir;
  });

  const activeId = getActiveProjectId();
  body.innerHTML = '';
  rows.forEach((row) => {
    body.appendChild(el('tr', {
      class: `pf-row ${row.id === activeId ? 'is-current' : ''}`,
      'data-project': row.id,
      tabindex: '0',
    }, [
      el('td', { class: 'col-name' }, [
        el('span', { class: 'pf-name', text: row.name }),
        row.id === activeId ? el('span', { class: 'pf-here', text: 'open' }) : null,
      ]),
      el('td', {}, [el('span', { class: `pf-rag ${RAG_TONE[row.rag] || 'is-idle'}`, text: row.rag || 'Not set' })]),
      bar(row.pct),
      countCell(row.overdue, 'is-bad'),
      el('td', { class: `num ${row.critical > 0 ? 'is-bad' : row.risks > 0 ? 'is-warn' : 'is-quiet'}` }, [
        el('span', { text: String(row.risks) }),
        row.critical > 0 ? el('span', { class: 'pf-sub', text: `${row.critical} high` }) : null,
      ]),
      el('td', { class: 'num is-quiet', text: row.deliverables ? `${row.accepted}/${row.deliverables}` : '—' }),
      countCell(row.breached, 'is-bad'),
      el('td', { class: 'num' }, [
        el('span', { text: money(row.planned) }),
        row.planned > 0 ? el('span', { class: `pf-sub ${row.actual > row.planned ? 'is-bad' : ''}`, text: `${money(row.actual)} spent` }) : null,
      ]),
      dueCell(row),
      el('td', { class: 'col-wide pf-next' }, [
        el('span', { text: row.nextMilestone || '—' }),
        row.nextMilestoneDue ? el('span', { class: 'pf-sub', text: row.nextMilestoneDue }) : null,
      ]),
    ]));
  });

  const sum = (f) => rows.reduce((n, r) => n + r[f], 0);
  const foot = document.getElementById('portfolio-foot');
  foot.innerHTML = '';
  foot.appendChild(el('tr', {}, [
    el('td', { class: 'col-name', text: `${rows.length} project${rows.length === 1 ? '' : 's'}` }),
    el('td', { text: '' }),
    el('td', { class: 'num', text: `${rows.length ? Math.round(sum('pct') / rows.length) : 0}%` }),
    el('td', { class: 'num', text: String(sum('overdue')) }),
    el('td', { class: 'num', text: String(sum('risks')) }),
    el('td', { class: 'num', text: `${sum('accepted')}/${sum('deliverables')}` }),
    el('td', { class: 'num', text: String(sum('breached')) }),
    el('td', { class: 'num', text: money(sum('planned')) }),
    el('td', { text: '' }),
    el('td', { text: '' }),
  ]));

  document.getElementById('portfolio-empty').hidden = rows.length > 0;
}

export function initPortfolio(go) {
  onGo = go;
  const head = document.getElementById('portfolio-head');
  if (!head) return;

  head.innerHTML = '';
  head.appendChild(el('tr', {}, COLUMNS.map((col) => el('th', {
    class: `${col.cls || ''} ${col.numeric ? 'num' : ''} pf-th`,
    'data-key': col.key,
    scope: 'col',
    tabindex: '0',
    role: 'columnheader',
  }, [el('span', { text: col.label }), el('span', { class: 'pf-sort', 'aria-hidden': 'true', text: '' })]))));

  const sortBy = (key) => {
    if (!key) return;
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = 1; }
    head.querySelectorAll('.pf-sort').forEach((s) => { s.textContent = ''; });
    const mark = head.querySelector(`[data-key="${key}"] .pf-sort`);
    if (mark) mark.textContent = sortDir === 1 ? '▲' : '▼';
    renderPortfolio();
  };
  head.addEventListener('click', (e) => sortBy(e.target.closest('.pf-th')?.dataset.key));
  head.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(e.target.closest('.pf-th')?.dataset.key); }
  });

  const body = document.getElementById('portfolio-body');
  const open = (tr) => { if (tr) onGo({ projectId: tr.dataset.project, navId: 'tab-dashboard', rowId: '' }); };
  body.addEventListener('click', (e) => open(e.target.closest('.pf-row')));
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target.closest('.pf-row')); }
  });
}
