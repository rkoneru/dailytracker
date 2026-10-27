// The admin a sprint leaves behind — the summary and the retrospective notes —
// drafted from the record rather than typed from memory. Pure.
//
// Every line is a fact the project already holds: what was committed and
// delivered, what finished and what did not, what was blocked and for how
// long, whose load ran over, whether the backlog moved after the commitment.
// The draft is where the retrospective starts, not what it concludes: the
// team still decides what to change, so the Actions section is left for them.

import { sprintLoad, sprintResult, commitmentState } from './sprints.js';
import { isBlocked } from './flow.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v !== null ? n : null; };

/** What the sprint delivered, and what it did not, from its items as they stand. */
export function sprintSummary(project, sprint) {
  const items = sprintLoad(project, sprint).items;
  const byId = new Map((project.dashTasks || []).map((t) => [t.id, t]));
  const { committed, delivered } = sprint.closed || sprintResult(project, sprint);
  const done = items.filter((t) => t.status === 'Complete');
  const open = items.filter((t) => t.status !== 'Complete');
  const blocked = items.filter((t) => (t.statusHistory || []).some((e) => e.blocked && e.at >= sprint.start && e.at <= `${sprint.end}T23:59`) || (t.status !== 'Complete' && isBlocked(t, byId)));
  const over = items.filter((t) => num(t.spent) !== null && num(t.estimate) !== null && num(t.spent) > num(t.estimate));
  return {
    committed, delivered,
    ratio: committed ? delivered / committed : null,
    done, open, blocked, over,
    commitment: commitmentState(project, sprint),
    people: [...new Set(items.map((t) => String(t.assigned || '').trim()).filter(Boolean))],
  };
}

const pct = (r) => (r === null ? '—' : `${Math.round(r * 100)}%`);

export function summaryText(project, sprint) {
  const s = sprintSummary(project, sprint);
  const list = (items, empty) => (items.length ? items.map((t) => `  • ${t.name || 'Untitled'}${t.assigned ? ` — ${t.assigned}` : ''}`) : [`  • ${empty}`]);
  return [
    `${sprint.name || 'Sprint'} summary, ${sprint.start} to ${sprint.end}`,
    `Goal: ${sprint.goal || 'not set'}`,
    `Delivered ${s.delivered} of ${s.committed} committed hours (${pct(s.ratio)}).`,
    '',
    'Done:', ...list(s.done, 'nothing finished'),
    '',
    'Not done:', ...list(s.open, 'nothing left'),
    ...(s.blocked.length ? ['', 'Blocked during the sprint:', ...list(s.blocked, '')] : []),
  ].join('\n');
}

/** The retrospective's first draft: what went well and what did not, as facts. */
export function retroDraft(project, sprint) {
  const s = sprintSummary(project, sprint);
  const well = [];
  const worse = [];
  if (s.ratio !== null && s.ratio >= 0.9) well.push(`Delivered ${pct(s.ratio)} of the commitment (${s.delivered} of ${s.committed} h).`);
  else if (s.ratio !== null) worse.push(`Delivered ${pct(s.ratio)} of the commitment (${s.delivered} of ${s.committed} h).`);
  if (s.done.length) well.push(`Finished: ${s.done.map((t) => t.name || 'Untitled').join(', ')}.`);
  if (s.commitment === 'committed') well.push('The backlog held to the commitment.');
  if (s.commitment === 'changed') worse.push('The backlog changed after the team committed to it.');
  if (s.commitment === 'none') worse.push('No commitment was recorded for this sprint.');
  if (s.open.length) worse.push(`Not finished: ${s.open.map((t) => t.name || 'Untitled').join(', ')}.`);
  if (s.blocked.length) worse.push(`Blocked during the sprint: ${s.blocked.map((t) => t.name || 'Untitled').join(', ')}.`);
  if (s.over.length) worse.push(`Took longer than estimated: ${s.over.map((t) => `${t.name || 'Untitled'} (${t.spent} of ${t.estimate} h)`).join(', ')}.`);
  if (!sprint.goal) worse.push('The sprint had no goal.');
  return { well, worse, people: s.people };
}

export function retroNotes(draft) {
  return [
    'What went well',
    ...(draft.well.length ? draft.well.map((l) => `- ${l}`) : ['- (the record shows nothing here — add what the team saw)']),
    '',
    'What did not',
    ...(draft.worse.length ? draft.worse.map((l) => `- ${l}`) : ['- (nothing in the record — add what the team saw)']),
    '',
    'Actions',
    '- (the team decides these in the meeting — each with an owner and a date)',
  ].join('\n');
}
