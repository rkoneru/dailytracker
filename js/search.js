// One search box for everything the app knows.
//
// The app reached twelve pages, fourteen registers and any number of projects,
// which is the point at which per-table search boxes stop being enough: you
// can only search a table you have already found. Every SaaS tool of this
// shape answers that with one keystroke that searches the lot, and that is
// what this is.
//
// The index is built on demand rather than maintained. With a few thousand
// rows in localStorage a full rebuild is well under a millisecond, and an
// index kept up to date by hand is an index that is eventually wrong — which
// for a search box is worse than being slow.

import { ALL_REGISTERS } from './registerDefs.js';

/**
 * Where a hit lives, in the vocabulary the router already speaks. Anything
 * with a `rowId` is reachable as a link; the rest open their page.
 */
function hit({ title, subtitle, kind, projectId, projectName, navId, rowId = '', haystack }) {
  return { title, subtitle, kind, projectId, projectName, navId, rowId, haystack: haystack.toLowerCase() };
}

const RAID_NAV = 'tab-raid';

function taskHits(project, out) {
  project.dashTasks.forEach((t) => {
    out.push(hit({
      title: t.name || '(untitled task)',
      subtitle: [t.assigned, t.status, t.end].filter(Boolean).join(' · '),
      kind: 'Task',
      projectId: project.id,
      projectName: project.projectName,
      navId: 'tab-tasks',
      rowId: t.id,
      haystack: [t.name, t.assigned, t.status, t.prio, t.comments].join(' '),
    }));
  });
}

function milestoneHits(project, out) {
  (project.milestones || []).forEach((m) => {
    out.push(hit({
      title: m.text || '(untitled milestone)',
      subtitle: [m.done ? 'Done' : 'Open', m.due].filter(Boolean).join(' · '),
      kind: 'Milestone',
      projectId: project.id,
      projectName: project.projectName,
      navId: 'tab-planner',
      rowId: m.id,
      haystack: [m.text, m.due].join(' '),
    }));
  });
}

function raidHits(project, out) {
  (project.raid || []).forEach((r) => {
    out.push(hit({
      title: r.title || '(untitled entry)',
      subtitle: [r.type, r.owner, r.status].filter(Boolean).join(' · '),
      kind: r.type || 'RAID',
      projectId: project.id,
      projectName: project.projectName,
      navId: RAID_NAV,
      rowId: r.id,
      haystack: [r.title, r.type, r.owner, r.status, r.action].join(' '),
    }));
  });
}

function registerHits(project, out) {
  ALL_REGISTERS.forEach((def) => {
    const rows = project[def.key];
    if (!Array.isArray(rows)) return;
    // A register declares which of its columns are worth searching; the first
    // of them is also what the row is called, which is why the title is taken
    // from the same list rather than guessed at.
    const fields = def.searchFields || [];
    rows.forEach((row) => {
      const title = String(row[fields[0]] || '').trim();
      out.push(hit({
        title: title || `(blank ${def.rowLabel})`,
        subtitle: fields.slice(1).map((f) => row[f]).filter(Boolean).join(' · ') || def.title,
        kind: def.title,
        projectId: project.id,
        projectName: project.projectName,
        navId: def.navId,
        rowId: row.id,
        haystack: fields.map((f) => row[f]).join(' '),
      }));
    });
  });
}

function noteHits(project, out) {
  (project.notes || []).forEach((n) => {
    if (!n.text) return;
    out.push(hit({
      title: n.text.length > 70 ? `${n.text.slice(0, 70)}…` : n.text,
      subtitle: 'Note',
      kind: 'Note',
      projectId: project.id,
      projectName: project.projectName,
      navId: 'tab-planner',
      rowId: n.id,
      haystack: n.text,
    }));
  });
}

/** Everything searchable in one flat list. `projects` is listFullProjects(). */
export function buildIndex(projects) {
  const out = [];
  projects.forEach((project) => {
    taskHits(project, out);
    milestoneHits(project, out);
    raidHits(project, out);
    registerHits(project, out);
    noteHits(project, out);
  });
  return out;
}

/**
 * Every term has to appear somewhere in the row, in any order. Typing
 * "priya risk" to find Priya's risks is the behaviour people arrive with, and
 * it costs nothing beyond splitting on whitespace.
 */
function termsOf(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Ranking, cheapest signal first: a hit in the current project outranks one
 * elsewhere (you are almost always looking for something in front of you), a
 * title match outranks a match buried in another column, and a match at the
 * start of the title outranks one in the middle.
 */
function score(entry, terms, activeProjectId) {
  const title = entry.title.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (!entry.haystack.includes(term)) return -1;
    if (title.startsWith(term)) total += 6;
    else if (title.includes(term)) total += 3;
    else total += 1;
  }
  if (entry.projectId === activeProjectId) total += 4;
  return total;
}

export function searchIndex(index, query, { activeProjectId = '', limit = 30 } = {}) {
  const terms = termsOf(query);
  if (!terms.length) return [];
  const scored = [];
  for (const entry of index) {
    const s = score(entry, terms, activeProjectId);
    if (s >= 0) scored.push({ entry, s });
  }
  scored.sort((a, b) => b.s - a.s || a.entry.title.localeCompare(b.entry.title));
  return scored.slice(0, limit).map((x) => x.entry);
}

/**
 * Highlighting is done on the plain string rather than with innerHTML: a row
 * title is user data, and the one place it would be interpreted as markup is
 * the one place it must not be.
 */
export function highlightParts(text, query) {
  const terms = termsOf(query).sort((a, b) => b.length - a.length);
  if (!terms.length) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  terms.forEach((term) => {
    let from = lower.indexOf(term);
    while (from !== -1) {
      for (let i = from; i < from + term.length; i += 1) marks[i] = true;
      from = lower.indexOf(term, from + term.length);
    }
  });
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const match = marks[i];
    let j = i;
    while (j < text.length && marks[j] === match) j += 1;
    parts.push({ text: text.slice(i, j), match });
    i = j;
  }
  return parts;
}
