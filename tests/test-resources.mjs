// The resourcing arithmetic, on its own.
//
// Capacity against commitment is the kind of maths that is confidently wrong:
// overlapping windows, an open-ended booking, leave in the middle of an
// allocation, a part-timer. Every case below produces a believable wrong
// number if it is got wrong, which is why none of them are left to the UI.

import {
  skillMatch, rankBySkill, allocatedPercent, utilisation,
  findConflicts, overlapDays, overlaps, weekStart, toISO, resourceIdFor,
  marginPerHour, marginPercent, timesheetTotals, timesheetValue, newResource,
} from '../js/resourceModel.js';

let passed = 0;
const failures = [];

function eq(label, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) { passed += 1; return; }
  failures.push(`${label}\n       got  ${a}\n       want ${b}`);
}

const person = (name, extra = {}) => newResource({ name, email: `${name.toLowerCase()}@x.test`, ...extra });
const alloc = (resourceId, projectId, percent, from, to, extra = {}) =>
  ({ id: `a-${resourceId}-${projectId}-${from}`, resourceId, projectId, percent, from, to, billable: true, ...extra });

console.log('\n--- an id follows identity, so two devices agree ---');
eq('the same email gives the same id',
   resourceIdFor({ email: 'Priya.D@Example.com', name: 'Priya D.' }),
   resourceIdFor({ email: 'priya.d@example.com', name: 'Priya Dhawan' }));
eq('a different email does not',
   resourceIdFor({ email: 'a@x.test' }) === resourceIdFor({ email: 'b@x.test' }), false);
eq('with no email it falls back to the name',
   resourceIdFor({ name: 'Sam P.' }), resourceIdFor({ name: 'sam p.' }));

console.log('\n--- overlapping windows ---');
eq('touching at one day is an overlap', overlapDays('2026-01-05', '2026-01-09', '2026-01-09', '2026-01-12'), 1);
eq('apart is not', overlaps('2026-01-05', '2026-01-09', '2026-01-10', '2026-01-12'), false);
eq('an open end runs forever', overlaps('2026-01-05', '', '2030-01-01', '2030-01-02'), true);
eq('an open start reaches back', overlaps('', '2026-01-09', '2020-01-01', '2020-01-02'), true);
eq('a window inside another counts as the inner one',
   overlapDays('2026-01-01', '2026-12-31', '2026-03-01', '2026-03-10'), 10);

console.log('\n--- weeks start on Monday, whatever day you ask about ---');
eq('a Wednesday', toISO(weekStart('2026-09-16')), '2026-09-14');
eq('the Monday itself', toISO(weekStart('2026-09-14')), '2026-09-14');
eq('a Sunday belongs to the week it ends', toISO(weekStart('2026-09-20')), '2026-09-14');

console.log('\n--- breadth of skill beats depth in one ---');
{
  const deep = person('Deep', { skills: [{ name: 'Kubernetes', level: 'Expert' }] });
  const broad = person('Broad', {
    skills: [
      { name: 'Kubernetes', level: 'Working' },
      { name: 'Terraform', level: 'Working' },
      { name: 'Postgres', level: 'Working' },
    ],
  });
  const need = ['Kubernetes', 'Terraform', 'Postgres'];
  eq('the broader person ranks first',
     rankBySkill([deep, broad], need)[0].resource.name, 'Broad');
  eq('and the gap is named', skillMatch(deep, need).missing, ['Terraform', 'Postgres']);
  eq('coverage is reported too', skillMatch(broad, need).missing, []);
}

console.log('\n--- depth breaks ties at equal coverage ---');
{
  const junior = person('Junior', { skills: [{ name: 'Java', level: 'Working' }] });
  const senior = person('Senior', { skills: [{ name: 'Java', level: 'Expert' }] });
  eq('the deeper of two equally broad people wins',
     rankBySkill([junior, senior], ['Java'])[0].resource.name, 'Senior');
}

console.log('\n--- asking for nothing matches nobody in particular ---');
eq('no required skills is a zero score, not a perfect one',
   skillMatch(person('Anyone', { skills: [{ name: 'Java', level: 'Expert' }] }), []).score, 0);

console.log('\n--- commitment is time-phased ---');
{
  const allocations = [
    alloc('r1', 'p1', 60, '2026-01-01', '2026-03-31'),
    alloc('r1', 'p2', 40, '2026-04-01', '2026-06-30'),
  ];
  eq('only what overlaps the window counts',
     allocatedPercent(allocations, 'r1', '2026-02-01', '2026-02-28'), 60);
  eq('a window spanning both sums them',
     allocatedPercent(allocations, 'r1', '2026-03-01', '2026-04-30'), 100);
  eq('and a window outside both is free',
     allocatedPercent(allocations, 'r1', '2026-08-01', '2026-08-31'), 0);
}

console.log('\n--- leave reduces what there was to give ---');
{
  const r = person('Away');
  const absences = [{ resourceId: r.id, type: 'Annual leave', from: '2026-02-09', to: '2026-02-15' }];
  const allocations = [alloc(r.id, 'p1', 80, '2026-02-01', '2026-02-28')];
  // 7 of 28 days away is a quarter of the month, so 75% was ever available.
  const u = utilisation(r, allocations, absences, '2026-02-01', '2026-02-28');
  eq('capacity drops with the leave', u.effectiveCapacity, 75);
  eq('and an 80% booking is now over-committed', u.over, 5);
  eq('the days away are reported', u.awayDays, 7);
  eq('bench is nothing, not negative', u.bench, 0);
}

console.log('\n--- leave is capped at the window, not double counted ---');
{
  const r = person('Long');
  const absences = [{ resourceId: r.id, type: 'Sabbatical', from: '2026-01-01', to: '2026-12-31' }];
  const u = utilisation(r, [], absences, '2026-02-01', '2026-02-28');
  eq('a year off leaves no February', u.effectiveCapacity, 0);
  eq('and away days stop at the window', u.awayDays, 28);
}

console.log('\n--- hours follow the person, not a standard week ---');
{
  const full = person('Full', { capacityHours: 40 });
  const part = person('Part', { capacityHours: 20 });
  const a = (r) => [alloc(r.id, 'p1', 50, '2026-01-01', '2026-01-31')];
  eq('half of a full week', utilisation(full, a(full), [], '2026-01-01', '2026-01-31').hoursCommitted, 20);
  eq('half of a half week', utilisation(part, a(part), [], '2026-01-01', '2026-01-31').hoursCommitted, 10);
}

console.log('\n--- billable time is tracked apart from busy time ---');
{
  const r = person('Mixed');
  const allocations = [
    alloc(r.id, 'p1', 60, '2026-01-01', '2026-01-31'),
    alloc(r.id, 'internal', 20, '2026-01-01', '2026-01-31', { billable: false }),
  ];
  const u = utilisation(r, allocations, [], '2026-01-01', '2026-01-31');
  eq('busy is everything', u.allocated, 80);
  eq('billable is only the chargeable part', u.billable, 60);
  eq('and the ratio says how much of the week earns', Math.round(u.billableRatio * 100), 75);
}

console.log('\n--- margin is unknown, not zero, when a rate is missing ---');
{
  eq('both rates', marginPerHour(person('P', { costRate: 60, billRate: 100 })), 40);
  eq('as a percentage', marginPercent(person('P', { costRate: 60, billRate: 100 })), 0.4);
  eq('no bill rate is unknown', marginPerHour(person('P', { costRate: 60 })), null);
  eq('no cost rate is unknown', marginPerHour(person('P', { billRate: 100 })), null);
  eq('a loss is reported as a loss', marginPerHour(person('P', { costRate: 120, billRate: 100 })), -20);
}

console.log('\n--- conflicts name what is wrong and how badly ---');
{
  const ok = person('Fine', { onboarding: 'Cleared' });
  const green = person('New', { onboarding: 'In progress' });
  const leaver = person('Leaver', { onboarding: 'Cleared', leavingOn: '2026-03-31' });
  const resources = [ok, green, leaver];
  const allocations = [
    alloc(ok.id, 'p1', 120, '2026-01-01', '2026-06-30'),
    alloc(green.id, 'p1', 50, '2026-01-01', '2026-06-30'),
    alloc(leaver.id, 'p1', 50, '2026-01-01', '2026-06-30'),
    alloc('ghost', 'p1', 50, '2026-01-01', '2026-06-30', { name: 'Not in the pool' }),
  ].map((a) => ({ ...a, projectId: 'p1' }));
  const projects = [{ id: 'p1', name: 'Alpha' }];

  const found = findConflicts({
    resources, allocations, absences: [], projects, from: '2026-01-01', to: '2026-06-30',
  });
  const kinds = found.map((f) => f.kind);
  eq('over-allocation is found', kinds.includes('over-allocated'), true);
  eq('un-onboarded people are found', kinds.includes('not-onboarded'), true);
  eq('booking past a leaving date is found', kinds.includes('after-leaving'), true);
  eq('a resource this device does not have is reported gently',
     found.find((f) => f.kind === 'unknown-resource').severity, 'low');
  eq('every unfilled key role is named',
     kinds.filter((k) => k === 'unfilled-role').length, 3);
  eq('the worst comes first', found[0].severity, 'high');
}

console.log('\n--- booking someone across their leave is flagged ---');
{
  const r = person('Holiday');
  const absences = [{ resourceId: r.id, type: 'Annual leave', from: '2026-02-09', to: '2026-02-13' }];
  const allocations = [{ ...alloc(r.id, 'p1', 50, '2026-02-01', '2026-02-28'), projectId: 'p1' }];
  const found = findConflicts({
    resources: [r], allocations, absences, projects: [{ id: 'p1', name: 'Alpha' }],
    from: '2026-02-01', to: '2026-02-28',
  });
  const clash = found.find((f) => f.kind === 'booked-during-leave');
  eq('it is found', !!clash, true);
  eq('and names the kind of leave', clash.detail.includes('annual leave'), true);
}

console.log('\n--- a fully staffed project raises no role conflicts ---');
{
  const r = person('Everyone');
  const allocations = ['engagement-manager', 'project-manager', 'product-manager'].map((keyRole, i) =>
    ({ ...alloc(r.id, 'p1', 10, '2026-01-01', '2026-06-30'), id: `k${i}`, projectId: 'p1', keyRole }));
  const found = findConflicts({
    resources: [r], allocations, absences: [], projects: [{ id: 'p1', name: 'Alpha' }],
    from: '2026-01-01', to: '2026-06-30',
  });
  eq('no unfilled roles', found.filter((f) => f.kind === 'unfilled-role').length, 0);
  eq('and 30% is not over-allocated', found.filter((f) => f.kind === 'over-allocated').length, 0);
}

console.log('\n--- timesheets total, and say what is not approved ---');
{
  const entries = [
    { resourceId: 'r1', weekStart: '2026-01-05', hours: 40, status: 'Approved' },
    { resourceId: 'r1', weekStart: '2026-01-12', hours: 32, status: 'Submitted' },
    { resourceId: 'r1', weekStart: '2026-01-19', hours: 8, status: 'Draft' },
  ];
  const t = timesheetTotals(entries);
  eq('total hours', t.total, 80);
  eq('approved hours', t.approved, 40);
  eq('submitted but not approved', t.submitted, 32);
  eq('everything not yet approved', t.unapproved, 40);
  eq('a window narrows it',
     timesheetTotals(entries, { from: '2026-01-05', to: '2026-01-11' }).total, 40);
}

console.log('\n--- booked time is priced, and unpriced time is admitted ---');
{
  const priced = person('Priced', { costRate: 50, billRate: 100 });
  const unpriced = person('Unpriced');
  const entries = [
    { resourceId: priced.id, weekStart: '2026-01-05', hours: 10, status: 'Approved' },
    { resourceId: unpriced.id, weekStart: '2026-01-05', hours: 5, status: 'Approved' },
  ];
  const v = timesheetValue(entries, [priced, unpriced]);
  eq('revenue counts only what has rates', v.revenue, 1000);
  eq('cost likewise', v.cost, 500);
  eq('margin follows', v.margin, 500);
  eq('and the rest is reported rather than treated as free', v.unpricedHours, 5);
}

console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) {
  failures.forEach((f) => console.log(`  FAIL ${f}`));
  process.exit(1);
}
