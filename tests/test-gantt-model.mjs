// js/ganttModel.js away from the browser: how a lifecycle is first laid out.

import { layOut, orderedActivities, sanitiseActivity } from '../js/ganttModel.js';
import { findMethod } from '../js/methodology.js';

let passed = 0;
const failures = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed += 1; else failures.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const project = (fields) => ({ dashTasks: [], milestones: [], ...fields });

// A lifecycle fills the project exactly: first phase on the start, last phase
// ending on the due date, no gaps and no overlaps between phases in sequence.
{
  const p = project({ methodology: 'sdlc', dashTasks: [{ start: '2026-10-01' }], dueDate: '2026-11-29' });
  const rows = layOut(p);
  eq('sdlc: one activity per phase', rows.map((r) => r.phase), findMethod('sdlc').phases.map((ph) => ph.id));
  eq('sdlc: starts on the first task', rows[0].start, '2026-10-01');
  eq('sdlc: ends on the due date', rows[rows.length - 1].end, '2026-11-29');
  const next = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  eq('sdlc: each phase starts the day after the last ends', rows.slice(1).every((r, i) => r.start === next(rows[i].end)), true);
}

// A phase that runs alongside another takes its dates rather than a slot.
{
  const rows = layOut(project({ methodology: 'project', dashDate: '2026-10-05', dueDate: '2026-12-31' }));
  const byId = Object.fromEntries(rows.map((r) => [r.phase, r]));
  eq('project: monitoring runs alongside executing', [byId.monitoring.start, byId.monitoring.end], [byId.executing.start, byId.executing.end]);
  eq('project: closing ends on the due date', byId.closing.end, '2026-12-31');
}

// With no due date, each phase is a fortnight.
{
  const rows = layOut(project({ methodology: 'crisp-dm', dashDate: '2026-10-05' }));
  eq('no due date: six fortnights', [rows[0].start, rows[5].end], ['2026-10-05', '2026-12-27']);
}

// A practice has no order, so every capability spans the whole window.
{
  const rows = layOut(project({ methodology: 'mlops', dashDate: '2026-10-05', dueDate: '2026-12-31' }));
  eq('practice: all in parallel', new Set(rows.map((r) => `${r.start}|${r.end}`)).size, 1);
}

// Drawn in the method's order, with activities from another lifecycle last.
{
  const p = project({
    methodology: 'sdlc',
    ganttActivities: [
      { id: 'a', phase: 'testing', name: 'Test' },
      { id: 'b', phase: 'business', name: 'From CRISP-DM' },
      { id: 'c', phase: 'requirements', name: 'Reqs' },
    ],
  });
  eq('order: by phase, orphans last', orderedActivities(p).map((a) => a.id), ['c', 'a', 'b']);
}

eq('sanitise: progress is clamped', sanitiseActivity({ progress: 140 }).progress, 100);
eq('sanitise: a bad date is dropped', sanitiseActivity({ start: 'soon' }).start, '');
eq('no method: nothing to lay out', layOut(project({ methodology: '' })), []);

console.log(`${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) {
  failures.forEach((f) => console.log(`  FAIL ${f}`));
  process.exit(1);
}
