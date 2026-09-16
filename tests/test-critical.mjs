// The dependency graph, on its own.
//
// Everything here is a case where getting it wrong produces a plausible-looking
// wrong answer rather than a crash: a cycle that hangs, a critical path that
// picks the wrong chain, a conflict that is not reported. Testing it away from
// the browser means each one is three lines instead of a page of clicking.

import { analyse, wouldCycle, durationDays } from '../js/critical.js';

let passed = 0;
const failures = [];

function eq(label, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) { passed += 1; return; }
  failures.push(`${label}\n       got  ${a}\n       want ${b}`);
}

const task = (id, start, end, extra = {}) =>
  ({ id, name: id, start, end, status: 'Not Started', dependsOn: [], ...extra });

console.log('\n--- duration is inclusive of both ends ---');
eq('a one-day task is one day', durationDays(task('a', '2026-01-05', '2026-01-05')), 1);
eq('Monday to Friday is five', durationDays(task('a', '2026-01-05', '2026-01-09')), 5);
eq('a task with no dates still counts as a day',
   durationDays({ id: 'a' }), 1);

console.log('\n--- a chain orders itself ---');
{
  const tasks = [
    task('c', '2026-01-09', '2026-01-10', { dependsOn: ['b'] }),
    task('a', '2026-01-05', '2026-01-06'),
    task('b', '2026-01-07', '2026-01-08', { dependsOn: ['a'] }),
  ];
  const r = analyse(tasks);
  eq('order respects the edges, not the array', r.order, ['a', 'b', 'c']);
  eq('nothing is cyclic', r.cyclic, []);
  eq('the whole chain is critical', r.critical, ['a', 'b', 'c']);
  eq('and its length is the sum of the durations', r.criticalDays, 6);
}

console.log('\n--- the critical path is the longest chain, not the first ---');
{
  // Two branches from a, rejoining at d. The lower branch is longer in days
  // even though the upper one has more tasks — which is the case a naive
  // "most hops" implementation gets wrong.
  const tasks = [
    task('a', '2026-01-01', '2026-01-02'),                              // 2d
    task('short1', '2026-01-03', '2026-01-03', { dependsOn: ['a'] }),   // 1d
    task('short2', '2026-01-04', '2026-01-04', { dependsOn: ['short1'] }), // 1d
    task('long', '2026-01-03', '2026-01-12', { dependsOn: ['a'] }),     // 10d
    task('d', '2026-01-13', '2026-01-14', { dependsOn: ['short2', 'long'] }), // 2d
  ];
  const r = analyse(tasks);
  eq('it follows the longer branch', r.critical, ['a', 'long', 'd']);
  eq('length is 2 + 10 + 2', r.criticalDays, 14);
}

console.log('\n--- a cycle is reported, not hung on ---');
{
  const tasks = [
    task('a', '2026-01-01', '2026-01-02', { dependsOn: ['c'] }),
    task('b', '2026-01-03', '2026-01-04', { dependsOn: ['a'] }),
    task('c', '2026-01-05', '2026-01-06', { dependsOn: ['b'] }),
    task('free', '2026-01-01', '2026-01-01'),
  ];
  const r = analyse(tasks);
  eq('the loop is named', r.cyclic.sort(), ['a', 'b', 'c']);
  eq('the task outside it is still ordered', r.order, ['free']);
}

console.log('\n--- an edge is refused before it closes a loop ---');
{
  const tasks = [
    task('a', '2026-01-01', '2026-01-02'),
    task('b', '2026-01-03', '2026-01-04', { dependsOn: ['a'] }),
    task('c', '2026-01-05', '2026-01-06', { dependsOn: ['b'] }),
  ];
  eq('a depending on c would close the loop', wouldCycle(tasks, 'a', 'c'), true);
  eq('a depending on b would too', wouldCycle(tasks, 'a', 'b'), true);
  eq('but c depending on a is just a shortcut', wouldCycle(tasks, 'c', 'a'), false);
  eq('and nothing may depend on itself', wouldCycle(tasks, 'a', 'a'), true);
}

console.log('\n--- an edge to a deleted task is dropped, not fatal ---');
{
  const tasks = [
    task('a', '2026-01-01', '2026-01-02', { dependsOn: ['gone'] }),
    task('b', '2026-01-03', '2026-01-04', { dependsOn: ['a'] }),
  ];
  const r = analyse(tasks);
  eq('the plan still orders', r.order, ['a', 'b']);
  eq('and nothing is stuck', r.cyclic, []);
}

console.log('\n--- the plan disagreeing with itself is reported ---');
{
  const tasks = [
    task('a', '2026-01-05', '2026-01-09'),
    // Starts three days before the thing it waits for has finished.
    task('b', '2026-01-07', '2026-01-10', { dependsOn: ['a'] }),
    task('ok', '2026-01-10', '2026-01-11', { dependsOn: ['a'] }),
  ];
  const r = analyse(tasks);
  eq('one conflict', r.conflicts.length, 1);
  eq('it names both ends', [r.conflicts[0].taskId, r.conflicts[0].blockerId], ['b', 'a']);
  eq('and says how far it has to move', r.conflicts[0].overlapDays, 3);
}

console.log('\n--- blocked means waiting on something unfinished ---');
{
  const tasks = [
    task('done', '2026-01-01', '2026-01-02', { status: 'Complete' }),
    task('open', '2026-01-01', '2026-01-02'),
    task('clear', '2026-01-03', '2026-01-04', { dependsOn: ['done'] }),
    task('waiting', '2026-01-03', '2026-01-04', { dependsOn: ['open'] }),
    task('partly', '2026-01-03', '2026-01-04', { dependsOn: ['done', 'open'] }),
  ];
  const r = analyse(tasks);
  eq('only the ones with unfinished prerequisites', r.blocked.sort(), ['partly', 'waiting']);
}

console.log('\n--- an empty or dependency-free plan has no critical path ---');
{
  eq('nothing at all', analyse([]).critical, []);
  eq('one task is not a chain', analyse([task('a', '2026-01-01', '2026-01-09')]).critical, []);
  const loose = analyse([task('a', '2026-01-01', '2026-01-02'), task('b', '2026-01-03', '2026-01-04')]);
  eq('two unconnected tasks are not a chain either', loose.critical, []);
}

console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) {
  failures.forEach((f) => console.log(`  FAIL ${f}`));
  process.exit(1);
}
