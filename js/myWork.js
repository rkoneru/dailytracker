// My Work: one list, every project, sorted by when it is wanted.
//
// Until now the app could only be read a project at a time, which is the right
// shape for the person running one engagement and the wrong shape for everyone
// else — a developer on three projects had to open three projects to find out
// what today looked like. This page inverts that: it starts from a person and
// gathers what is on them, wherever it happens to live.
//
// It is assembled, never stored. Every row here is a view of a row that has a
// home somewhere else, and clicking it goes to that home — so there is still
// exactly one copy of everything, which is the rule the rest of the app is
// built on.

import { listFullProjects, getActiveProjectId } from './state.js';
import { el } from './dom.js';
import { parseDate } from './charts.js';
import { getMe, setMe, isMine, onMeChange } from './me.js';
import { WORK_REGISTERS, isOpenRow } from './registerDefs.js';

let onGo = null;
let scope = 'mine';       // 'mine' | 'everyone'
let showDone = false;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(dateStr, today) {
  const d = parseDate(dateStr);
  if (!d) return null;
  return Math.round((d - today) / 86400000);
}

/**
 * Four buckets, because they are the four different conversations: something
 * late needs an explanation, something this week needs a plan, something later
 * needs nothing today, and something with no date needs a date.
 */
const BUCKETS = [
  { id: 'overdue', label: 'Overdue', hint: 'Past its date and not finished.' },
  { id: 'week', label: 'Next 7 days', hint: 'Due between today and a week out.' },
  { id: 'later', label: 'Later', hint: 'Dated, but not yet.' },
  { id: 'undated', label: 'No date', hint: 'On someone, but not due by anything.' },
];

function bucketFor(days) {
  if (days === null) return 'undated';
  if (days < 0) return 'overdue';
  if (days <= 7) return 'week';
  return 'later';
}

// ---------- gathering ----------

function item({ title, kind, owner, due, status, projectId, projectName, navId, rowId, done }) {
  return { title, kind, owner, due, status, projectId, projectName, navId, rowId, done };
}

function gather(me) {
  const today = startOfToday();
  const mineOnly = scope === 'mine';
  const rows = [];

  listFullProjects().forEach((project) => {
    const base = { projectId: project.id, projectName: project.projectName || 'Untitled project' };

    project.dashTasks.forEach((t) => {
      const done = t.status === 'Complete';
      if (done && !showDone) return;
      if (mineOnly && !isMine(t.assigned, me)) return;
      rows.push(item({
        ...base, title: t.name || '(untitled task)', kind: 'Task', owner: t.assigned,
        due: t.end, status: t.status, navId: 'tab-tasks', rowId: t.id, done,
      }));
    });

    (project.raid || []).forEach((r) => {
      const done = r.status === 'Closed';
      if (done && !showDone) return;
      if (mineOnly && !isMine(r.owner, me)) return;
      rows.push(item({
        ...base, title: r.title || '(untitled entry)', kind: r.type || 'RAID', owner: r.owner,
        due: r.due, status: r.status, navId: 'tab-raid', rowId: r.id, done,
      }));
    });

    WORK_REGISTERS.forEach((def) => {
      (project[def.key] || []).forEach((row) => {
        const done = !isOpenRow(def, row);
        if (done && !showDone) return;
        const owner = row[def.ownerField];
        if (mineOnly && !isMine(owner, me)) return;
        const label = String(row[def.searchFields[0]] || '').trim();
        rows.push(item({
          ...base, title: label || `(blank ${def.rowLabel})`, kind: def.title, owner,
          due: def.dueField ? row[def.dueField] : '', status: row.status,
          navId: def.navId, rowId: row.id, done,
        }));
      });
    });
  });

  // Soonest first inside a bucket; undated rows keep the order they were
  // gathered in, which is project order and at least stable.
  rows.forEach((r) => { r.days = daysUntil(r.due, today); r.bucket = bucketFor(r.days); });
  rows.sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
  return rows;
}

// ---------- rendering ----------

function dueLabel(row) {
  if (!row.due) return '—';
  const d = parseDate(row.due);
  if (!d) return row.due;
  const nice = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (row.days === 0) return 'Today';
  if (row.days === 1) return 'Tomorrow';
  if (row.days < 0) return `${nice} · ${Math.abs(row.days)}d late`;
  return nice;
}

function rowNode(row, activeProjectId) {
  return el('li', {
    class: `work-row ${row.done ? 'is-done' : ''} work-row--${row.bucket}`,
    'data-project': row.projectId,
    'data-nav': row.navId,
    'data-row': row.rowId,
    tabindex: '0',
    role: 'button',
  }, [
    el('span', { class: 'work-row__kind', text: row.kind }),
    el('span', { class: 'work-row__title', text: row.title }),
    el('span', { class: 'work-row__status', text: row.status || '' }),
    // The project is the whole point of this page when it is not the one you
    // are in, and clutter when it is.
    el('span', {
      class: `work-row__project ${row.projectId === activeProjectId ? 'is-current' : ''}`,
      text: row.projectName,
    }),
    el('span', { class: 'work-row__due', text: dueLabel(row) }),
  ]);
}

function renderCounts(rows) {
  const by = (id) => rows.filter((r) => r.bucket === id && !r.done).length;
  const set = (id, value) => { document.getElementById(id).textContent = String(value); };
  set('mywork-count-overdue', by('overdue'));
  set('mywork-count-week', by('week'));
  set('mywork-count-open', rows.filter((r) => !r.done).length);
  set('mywork-count-projects', new Set(rows.filter((r) => !r.done).map((r) => r.projectId)).size);
}

/** Every name the app has seen, so the "you are" box can offer rather than ask. */
function knownNames() {
  const names = new Set();
  listFullProjects().forEach((p) => {
    (p.roster || []).forEach((r) => { if (r.name) names.add(r.name.trim()); });
    p.dashTasks.forEach((t) => { if (t.assigned) names.add(t.assigned.trim()); });
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function renderMyWork() {
  const host = document.getElementById('mywork-buckets');
  if (!host) return;

  const me = getMe();
  const nameInput = document.getElementById('mywork-name');
  if (nameInput && document.activeElement !== nameInput) nameInput.value = me;

  const list = document.getElementById('mywork-names');
  if (list) {
    list.innerHTML = '';
    knownNames().forEach((n) => list.appendChild(el('option', { value: n })));
  }

  const needsName = scope === 'mine' && !me;
  document.getElementById('mywork-noname').hidden = !needsName;

  const rows = needsName ? [] : gather(me);
  renderCounts(rows);

  host.innerHTML = '';
  const activeProjectId = getActiveProjectId();
  BUCKETS.forEach((bucket) => {
    const inBucket = rows.filter((r) => r.bucket === bucket.id);
    if (!inBucket.length) return;
    host.appendChild(el('section', { class: `work-bucket work-bucket--${bucket.id}` }, [
      el('header', { class: 'work-bucket__head' }, [
        el('h3', { class: 'work-bucket__title', text: bucket.label }),
        el('span', { class: 'work-bucket__count', text: String(inBucket.length) }),
        el('span', { class: 'work-bucket__hint', text: bucket.hint }),
      ]),
      el('ul', { class: 'work-list' }, inBucket.map((r) => rowNode(r, activeProjectId))),
    ]));
  });

  const empty = document.getElementById('mywork-empty');
  empty.hidden = rows.length > 0 || needsName;
  empty.textContent = scope === 'mine'
    ? `Nothing is waiting on ${me || 'you'} right now — across every project.`
    : 'Nothing is outstanding in any project.';
}

export function initMyWork(go) {
  onGo = go;
  const host = document.getElementById('mywork-buckets');
  if (!host) return;

  const name = document.getElementById('mywork-name');
  name.addEventListener('change', () => { setMe(name.value); renderMyWork(); });
  name.addEventListener('blur', () => { setMe(name.value); renderMyWork(); });

  document.getElementById('mywork-scope').addEventListener('change', (e) => {
    scope = e.target.value;
    renderMyWork();
  });
  document.getElementById('mywork-done').addEventListener('change', (e) => {
    showDone = e.target.checked;
    renderMyWork();
  });

  const open = (node) => {
    if (!node) return;
    onGo({ projectId: node.dataset.project, navId: node.dataset.nav, rowId: node.dataset.row });
  };
  host.addEventListener('click', (e) => open(e.target.closest('.work-row')));
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target.closest('.work-row')); }
  });

  onMeChange(() => {
    if (document.getElementById('page-mywork').classList.contains('is-active')) renderMyWork();
  });
}
