// The weekly planning board: one person's week across every project. Pure,
// apart from the device store at the bottom.
//
// Half of it is read off the projects — the key projects this person has work
// on (with priority and progress), the meetings they are in this week, and
// the wins the record already shows (tasks finished, milestones reached) — so
// none of it is a second copy. The other half is personal and belongs to no
// project: the week's three objectives, the focus blocks, the typed wins and
// the review. That half is kept on this device, per week, and never synced;
// it is a planning sheet, not project data, and the page says so.

import { isMine } from './me.js';
import { priorityOf, priorityLabel } from './priority.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Monday of the week holding `date`, and the seven days. */
export function weekOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  return { key: days[0], days, from: days[0], to: days[6] };
}

/** Projects with something of this person's in them, highest priority first. */
export function keyProjects(projects, me) {
  return projects.map((p) => {
    const tasks = p.dashTasks || [];
    const mine = tasks.filter((t) => isMine(t.assigned, me));
    const owns = mine.length + (p.raid || []).filter((r) => r.status !== 'Closed' && isMine(r.owner, me)).length
      + (p.milestones || []).filter((m) => !m.done && isMine(m.owner, me)).length;
    const priority = priorityOf(p);
    return {
      id: p.id, name: p.projectName || 'Untitled project', owns,
      priority: priority ? priority.score : null, priorityText: priorityLabel(priority),
      progress: tasks.length ? Math.round((tasks.filter((t) => t.status === 'Complete').length / tasks.length) * 100) : null,
      mineOpen: mine.filter((t) => t.status !== 'Complete').length,
    };
  }).filter((p) => p.owns > 0)
    .sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1) || b.mineOpen - a.mineOpen);
}

/** This person's meetings in the week: invited, or the owner. */
export function weekMeetings(projects, me, week) {
  return projects.flatMap((p) => (p.meetings || [])
    .filter((m) => m.date >= week.from && m.date <= week.to && m.status !== 'Cancelled'
      && (isMine(m.owner, me) || (m.attendees || []).some((a) => isMine(a.name, me))))
    .map((m) => ({ id: m.id, projectId: p.id, project: p.projectName || 'Untitled project', date: m.date, time: m.startTime || '', name: m.name || 'Untitled meeting', purpose: m.purpose || '' })))
    .sort((a, b) => `${a.date}${a.time || '99'}`.localeCompare(`${b.date}${b.time || '99'}`));
}

/** What the record already shows this person finished in the week. */
export function weekWins(projects, me, week) {
  const inWeek = (at) => at && at.slice(0, 10) >= week.from && at.slice(0, 10) <= week.to;
  return projects.flatMap((p) => [
    ...(p.dashTasks || []).filter((t) => isMine(t.assigned, me) && t.status === 'Complete'
      && (t.statusHistory || []).some((e) => e.status === 'Complete' && !e.seen && inWeek(e.at)))
      .map((t) => ({ kind: 'Task', text: t.name || 'Untitled', project: p.projectName || '' })),
    ...(p.milestones || []).filter((m) => m.done && isMine(m.owner, me) && inWeek(m.achieved))
      .map((m) => ({ kind: m.kind === 'gate' ? 'Gate' : 'Milestone', text: m.text || 'Untitled', project: p.projectName || '' })),
  ]);
}

// ---------- the personal half, on this device ----------

const KEY = 'projectPlannerWeekBoard_v1';

export function emptyWeek() {
  return {
    objectives: [{ text: '', done: false }, { text: '', done: false }, { text: '', done: false }],
    focus: { mon: '', tue: '', wed: '', thu: '', fri: '' },
    wins: '', worked: '', improve: '',
  };
}

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function loadWeek(key) {
  const saved = readAll()[key];
  const base = emptyWeek();
  return saved ? { ...base, ...saved, focus: { ...base.focus, ...(saved.focus || {}) }, objectives: base.objectives.map((o, i) => ({ ...o, ...(saved.objectives || [])[i] })) } : base;
}

/** Saves one week; keeps the last twelve so the store cannot grow for ever. */
export function saveWeek(key, week) {
  const all = readAll();
  all[key] = week;
  const keep = Object.keys(all).sort().slice(-12);
  const trimmed = Object.fromEntries(keep.map((k) => [k, all[k]]));
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)); } catch { /* a planning sheet; losing it is an inconvenience, not data loss */ }
}
