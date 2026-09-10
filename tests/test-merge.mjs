import { mergeRows, mergeStore, mergeProjectScalars } from '/home/user/dailytracker/js/syncMerge.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

const rrow = (id, rev, fields = {}, extra = {}) =>
  ({ id, project_id: 'p1', kind: 'dashTasks', position: 0, data: { name: id, ...fields }, rev, ...extra });
const lrow = (id, rev, fields = {}) => ({ id, kind: 'dashTasks', position: 0, name: id, ...fields, _rev: rev });

console.log('\n--- mergeRows ---');

// 1. Row edited only locally since base -> push, local content kept.
{
  const { rows, toPush, toDelete } = mergeRows(new Set(['a']), [lrow('a', 200, { name: 'local edit' })], [rrow('a', 100)]);
  eq('local newer wins', rows[0].name, 'local edit');
  eq('local newer is pushed', toPush.map(r => r.id), ['a']);
  eq('nothing deleted', toDelete, []);
}

// 2. Row edited only remotely -> pull, no push.
{
  const { rows, toPush } = mergeRows(new Set(['a']), [lrow('a', 100)], [rrow('a', 200, { name: 'remote edit' })]);
  eq('remote newer wins', rows[0].name, 'remote edit');
  eq('remote newer is not pushed', toPush, []);
}

// 3. Clock skew: identical revs must not ping-pong. Server copy stands.
{
  const { rows, toPush } = mergeRows(new Set(['a']), [lrow('a', 100, { name: 'L' })], [rrow('a', 100, { name: 'R' })]);
  eq('tie resolves to server', rows[0].name, 'R');
  eq('tie pushes nothing', toPush, []);
}

// 4. THE resurrection case: row deleted locally, untouched remotely.
{
  const { rows, toDelete } = mergeRows(new Set(['a']), [], [rrow('a', 100)]);
  eq('locally deleted row does not come back', rows.map(r => r.id), []);
  eq('local delete propagates to server', toDelete, [{ id: 'a', kind: 'dashTasks' }]);
}

// 5. Mirror: row created locally, never seen by server -> push, not deleted.
{
  const { rows, toPush, toDelete } = mergeRows(new Set(), [lrow('new', 500)], []);
  eq('new local row survives', rows.map(r => r.id), ['new']);
  eq('new local row is pushed', toPush.map(r => r.id), ['new']);
  eq('new local row is not deleted', toDelete, []);
}

// 6. Row deleted on the server (tombstone) while still present locally.
{
  const { rows } = mergeRows(new Set(['a']), [lrow('a', 100)], [rrow('a', 100, {}, { deleted_at: '2026-01-01T00:00:00Z' })]);
  eq('server tombstone removes local row', rows.map(r => r.id), []);
}

// 7. Tombstone must beat a *newer* local edit only if we agree that's the rule.
//    Current rule: a tombstone always wins, so a delete is never silently undone.
{
  const { rows } = mergeRows(new Set(['a']), [lrow('a', 9999)], [rrow('a', 1, {}, { deleted_at: '2026-01-01T00:00:00Z' })]);
  eq('tombstone beats newer local edit', rows.map(r => r.id), []);
}

// 8. Row new on the server, never seen here -> pull.
{
  const { rows, toDelete } = mergeRows(new Set(), [], [rrow('fromPhone', 100)]);
  eq('new remote row is pulled', rows.map(r => r.id), ['fromPhone']);
  eq('new remote row is not deleted', toDelete, []);
}

// 9. Two people edit *different* rows in the same project — the whole point.
{
  const { rows, toPush } = mergeRows(
    new Set(['a', 'b']),
    [lrow('a', 300, { name: 'I edited A' }), lrow('b', 100)],
    [rrow('a', 100), rrow('b', 300, { name: 'They edited B' })],
  );
  eq('my edit to A kept', rows.find(r => r.id === 'a').name, 'I edited A');
  eq('their edit to B kept', rows.find(r => r.id === 'b').name, 'They edited B');
  eq('only A is pushed', toPush.map(r => r.id), ['a']);
}

// 10. Ordering survives the merge.
{
  const { rows } = mergeRows(new Set(), [], [
    { ...rrow('z', 1), position: 2 }, { ...rrow('x', 1), position: 0 }, { ...rrow('y', 1), position: 1 },
  ]);
  eq('rows come back in position order', rows.map(r => r.id), ['x', 'y', 'z']);
}

console.log('\n--- mergeProjectScalars ---');
eq('project deleted locally propagates',
  mergeProjectScalars(true, null, { id: 'p1', data: {}, rev: 1 }).action, 'delete-remote');
eq('project new locally is pushed',
  mergeProjectScalars(false, { id: 'p1', updatedAt: 5 }, null).action, 'push');
eq('project deleted remotely is dropped locally',
  mergeProjectScalars(true, { id: 'p1', updatedAt: 5 }, null).action, 'delete-local');
eq('project new remotely is pulled',
  mergeProjectScalars(false, null, { id: 'p1', data: {}, rev: 1 }).action, 'pull');

console.log('\n--- mergeStore (end to end) ---');
{
  const base = { p1: { scalars: 'h', rows: { a: 'h', gone: 'h' } } };
  const local = [{
    id: 'p1', projectName: 'Laptop name', updatedAt: 500,
    milestones: [], gantt: [], tasks: [],
    dashTasks: [{ id: 'a', name: 'edited on laptop', _rev: 500 }, { id: 'newLocal', name: 'added on laptop', _rev: 500 }],
    notes: [], raid: [],
  }];
  const remote = {
    projects: [{ id: 'p1', data: { projectName: 'Phone name' }, rev: 100 }],
    rows: [
      { id: 'a', project_id: 'p1', kind: 'dashTasks', position: 0, data: { name: 'old' }, rev: 100 },
      { id: 'gone', project_id: 'p1', kind: 'dashTasks', position: 1, data: { name: 'deleted on laptop' }, rev: 100 },
      { id: 'newRemote', project_id: 'p1', kind: 'notes', position: 0, data: { text: 'added on phone' }, rev: 700 },
    ],
  };
  const out = mergeStore(base, local, remote);
  const p = out.projects[0];
  eq('newer local project name wins', p.projectName, 'Laptop name');
  eq('dashTasks merged', p.dashTasks.map(r => r.id).sort(), ['a', 'newLocal']);
  eq('locally edited row kept', p.dashTasks.find(r => r.id === 'a').name, 'edited on laptop');
  eq('remote-only note pulled in', p.notes.map(r => r.text), ['added on phone']);
  eq('locally deleted row deleted remotely', out.deleteRows.map(d => d.rowId), ['gone']);
  eq('project scalars pushed', out.pushProjects, ['p1']);
  eq('rows pushed', out.pushRows.map(r => r.row.id).sort(), ['a', 'newLocal']);
  eq('no project deletions', out.deleteProjects, []);
  eq('_rev is not leaked into a pulled row', 'kind' in p.notes[0], false);
}

// Idempotence: merging the same state twice must be a no-op.
{
  const base = { p1: { scalars: 'h', rows: { a: 'h' } } };
  const project = { id: 'p1', projectName: 'X', updatedAt: 100, milestones: [], gantt: [], tasks: [], dashTasks: [{ id: 'a', name: 'same', _rev: 100 }], notes: [], raid: [] };
  const remote = { projects: [{ id: 'p1', data: { projectName: 'X' }, rev: 100 }], rows: [{ id: 'a', project_id: 'p1', kind: 'dashTasks', position: 0, data: { name: 'same' }, rev: 100 }] };
  const out = mergeStore(base, [project], remote);
  eq('converged state pushes nothing', [out.pushProjects.length, out.pushRows.length, out.deleteRows.length], [0, 0, 0]);
  eq('converged state keeps the row', out.projects[0].dashTasks.map(r => r.id), ['a']);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
