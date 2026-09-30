// Capacity, week by week: who is loaded when, who is free soon, which skills
// are short, and what to do about someone booked past their time. Pure.
//
// Everything here is read off the same allocations and leave the Resources
// page already holds — the utilisation of one person over one week, repeated
// across the grid. Nothing is stored.
//
// Load is measured against what a person could give that week, not against a
// full week: someone booked at 60% in a week they are away for three days is
// over, which is exactly the case a flat percentage hides.
//
// A recommendation names people. "Rebalance workload" is advice anyone could
// give without looking; "move 30% of Website Redesign to Emily Davis, who has
// the skills and 40% free" is a decision someone can take. When nobody fits,
// it says so and names the other levers instead of inventing a candidate.

import { utilisation, weekStart, toISO, addDays, skillNames } from './resourceModel.js';

export const BANDS = [
  { id: 'free', label: 'Free', max: 0 },
  { id: 'optimal', label: '1–70% · optimal', max: 70 },
  { id: 'high', label: '71–100% · high', max: 100 },
  { id: 'over', label: '101%+ · over allocated', max: Infinity },
];

export function bandOf(load) {
  if (load === null) return 'away';
  return BANDS.find((b) => load <= b.max).id;
}

/** Monday-start weeks from `fromISO`, as [{ from, to }]. */
export function weeksFrom(fromISO, count = 12) {
  const start = weekStart(fromISO);
  return Array.from({ length: count }, (_, i) => ({ from: toISO(addDays(start, i * 7)), to: toISO(addDays(start, i * 7 + 6)) }));
}

/**
 * Each person's load, week by week, as a percentage of the time they had that
 * week. Null when they were away the whole week and booked on nothing.
 */
export function capacityGrid(resources, allocations, absences, fromISO, count = 12) {
  const weeks = weeksFrom(fromISO, count);
  const rows = resources.map((r) => ({
    resource: r,
    cells: weeks.map((w) => {
      const u = utilisation(r, allocations, absences, w.from, w.to);
      const load = u.effectiveCapacity > 0 ? Math.round((u.allocated / u.effectiveCapacity) * 100) : u.allocated > 0 ? 999 : null;
      return { ...w, load, band: bandOf(load), free: u.bench, allocated: u.allocated, away: u.awayDays };
    }),
  }));
  return { weeks, rows };
}

/**
 * When each person next has a quarter of their time free: now (this week),
 * in one to two weeks, in three to four, or not within four weeks.
 */
export function availabilityOutlook(grid, { threshold = 25 } = {}) {
  const buckets = { now: [], soon: [], later: [], none: [] };
  grid.rows.forEach(({ resource, cells }) => {
    const i = cells.slice(0, 5).findIndex((c) => c.free >= threshold);
    const key = i === 0 ? 'now' : i === 1 || i === 2 ? 'soon' : i === 3 || i === 4 ? 'later' : 'none';
    buckets[key].push({ name: resource.name || 'Unnamed', free: i >= 0 ? cells[i].free : 0, week: i >= 0 ? cells[i].from : '' });
  });
  return buckets;
}

const splitSkills = (value) => (Array.isArray(value) ? value : String(value || '').split(','))
  .map((s) => String(s.name || s).split(':')[0].trim())
  .filter(Boolean);

const key = (s) => s.toLowerCase();

/**
 * Skill demand against supply over a window, in full-time equivalents.
 * Demand: bookings that name the skills they need, at their share of a week.
 * Supply: the time people holding the skill have in the window, after leave.
 */
export function skillBalance(resources, allocations, absences, from, to) {
  const demand = new Map();
  const names = new Map();
  allocations.forEach((a) => {
    const needs = splitSkills(a.skills);
    if (!needs.length) return;
    const u = utilisation({ id: '__demand' }, [{ ...a, resourceId: '__demand' }], [], from, to);
    if (!u.allocated) return;
    needs.forEach((s) => {
      names.set(key(s), names.get(key(s)) || s);
      demand.set(key(s), (demand.get(key(s)) || 0) + (Number(a.percent) || 0) / 100);
    });
  });
  const supply = new Map();
  resources.forEach((r) => {
    const u = utilisation(r, allocations, absences, from, to);
    skillNames(r).forEach((s) => {
      names.set(key(s), names.get(key(s)) || s);
      supply.set(key(s), (supply.get(key(s)) || 0) + u.effectiveCapacity / 100);
    });
  });
  const rows = [...names.keys()].map((k) => {
    const need = Math.round((demand.get(k) || 0) * 10) / 10;
    const have = Math.round((supply.get(k) || 0) * 10) / 10;
    const gap = Math.round((have - need) * 10) / 10;
    return { skill: names.get(k), demand: need, available: have, gap, status: gap < 0 ? 'Shortage' : gap < 0.5 && need > 0 ? 'Low' : 'Balanced' };
  });
  const order = { Shortage: 0, Low: 1, Balanced: 2 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.gap - b.gap || b.demand - a.demand);
}

/**
 * For each person booked past their time: which booking to move, and who
 * could take it — people with enough time free who hold the skills it names
 * (or, where it names none, the same job title).
 */
export function overloadFixes(resources, allocations, absences, from, to, projectName = () => 'a project') {
  const fixes = [];
  const others = resources.map((r) => ({ r, u: utilisation(r, allocations, absences, from, to) }));
  others.filter((x) => x.u.over > 0).forEach(({ r, u }) => {
    const mine = allocations.filter((a) => a.resourceId === r.id && utilisation({ id: '__x' }, [{ ...a, resourceId: '__x' }], [], from, to).allocated > 0)
      .sort((a, b) => (Number(b.percent) || 0) - (Number(a.percent) || 0));
    const booking = mine[0];
    if (!booking) return;
    const move = Math.min(u.over, Number(booking.percent) || 0);
    const needs = splitSkills(booking.skills).map(key);
    const candidates = others
      .filter((o) => o.r.id !== r.id && o.u.bench >= move)
      .map((o) => {
        const held = skillNames(o.r).map(key);
        const matched = needs.length ? needs.filter((n) => held.includes(n)).length : (String(o.r.title || '').trim().toLowerCase() === String(r.title || '').trim().toLowerCase() && r.title ? 1 : 0);
        return { name: o.r.name || 'Unnamed', free: o.u.bench, matched, fullMatch: needs.length ? matched === needs.length : matched > 0 };
      })
      .filter((c) => c.fullMatch)
      .sort((a, b) => b.free - a.free)
      .slice(0, 3);
    const where = projectName(booking.projectId);
    fixes.push({
      name: r.name || 'Unnamed',
      over: u.over,
      project: where,
      move,
      candidates,
      text: candidates.length
        ? `Move ${move}% of ${where} to ${candidates.map((c) => `${c.name} (${c.free}% free)`).join(' or ')}.`
        : `Nobody with ${needs.length ? `the skills ${splitSkills(booking.skills).join(', ')}` : 'the same role'} has ${move}% free in this window — reduce the booking, move its dates, or add a person.`,
    });
  });
  return fixes.sort((a, b) => b.over - a.over);
}

// ---------- day by day ----------

const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const dayOf = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`) : null);

/**
 * Each person's days: the hours their tasks ask of them, against the hours
 * they have that day. A task's estimate is spread evenly over the working
 * days it runs, which is the honest reading of "40 hours, Monday to Friday"
 * when nobody has said which day does what. A task with no estimate asks an
 * unknown amount — it is counted and named, never guessed as zero.
 *
 * `tasks` are { name, assigned, start, end, estimate, status, project }
 * from every project, so one person's week is whole, not one project's
 * share of it. Leave is its own state; a weekend has no hours.
 *
 * Returns { days: [iso], groups: [{ name, people: [{ resource, cells,
 * tasks, unestimated }] }], summary: [{ hours, capacity, load }] }.
 */
export function dailySchedule(resources, tasks, absences, fromISO, count = 14) {
  const start = dayOf(fromISO);
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));
  const iso = days.map((d) => toISO(d));
  const summary = iso.map(() => ({ hours: 0, capacity: 0 }));

  const people = resources.map((r) => {
    const perDay = (Number(r.capacityHours) || 40) / 5;
    const away = absences.filter((a) => a.resourceId === r.id);
    const mine = tasks.filter((t) => String(t.assigned || '').trim().toLowerCase() === String(r.name || '').trim().toLowerCase()
      && t.status !== 'Complete' && (t.start || t.end));
    const bars = [];
    const hours = iso.map(() => 0);
    const unestimated = [];
    mine.forEach((t) => {
      const s = dayOf(t.start || t.end);
      const e = dayOf(t.end || t.start);
      const span = [];
      for (let d = new Date(s); d <= e; d = addDays(d, 1)) if (!isWeekend(d)) span.push(toISO(d));
      if (!span.length) return;
      const estimate = Number(t.estimate);
      const known = t.estimate !== '' && t.estimate !== undefined && t.estimate !== null && Number.isFinite(estimate) && estimate > 0;
      if (!known) unestimated.push(t.name || 'Untitled');
      const each = known ? estimate / span.length : null;
      const inWindow = span.filter((d) => iso.includes(d));
      if (!inWindow.length) return;
      if (each !== null) inWindow.forEach((d) => { hours[iso.indexOf(d)] += each; });
      bars.push({ name: t.name || 'Untitled', project: t.project || '', from: inWindow[0], to: inWindow[inWindow.length - 1], perDay: each === null ? null : Math.round(each * 10) / 10, total: known ? estimate : null });
    });
    const cells = days.map((d, i) => {
      const leave = away.find((a) => a.from && a.from <= iso[i] && (a.to || a.from) >= iso[i]);
      if (isWeekend(d)) return { date: iso[i], state: 'weekend', hours: 0, capacity: 0, load: null };
      if (leave) return { date: iso[i], state: 'away', type: leave.type || 'Leave', hours: Math.round(hours[i] * 10) / 10, capacity: 0, load: null };
      const h = Math.round(hours[i] * 10) / 10;
      summary[i].hours += h;
      summary[i].capacity += perDay;
      const load = Math.round((h / perDay) * 100);
      return { date: iso[i], state: load > 100 ? 'over' : load > 0 ? 'booked' : 'free', hours: h, capacity: perDay, load };
    });
    return { resource: r, cells, tasks: bars, unestimated, perDay };
  });

  const groups = new Map();
  people.forEach((p) => {
    const key = String(p.resource.location || p.resource.org || 'Team').trim() || 'Team';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return {
    days: iso,
    groups: [...groups].map(([name, list]) => ({ name, people: list })),
    summary: summary.map((s) => ({ hours: Math.round(s.hours * 10) / 10, capacity: s.capacity, load: s.capacity ? Math.round((s.hours / s.capacity) * 100) : null })),
  };
}
