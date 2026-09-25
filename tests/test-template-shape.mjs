// Every template row must fit the register it lands in.
//
// A template is the only place in the app where register rows are written by
// hand rather than by the table that owns them, so it is the only place a
// field name can be misspelt or a status invented. Nothing would throw: the
// row would simply render with an empty cell, or a select would quietly show
// the first option instead of the value it was given — which is worse than an
// error, because it looks like data.
//
// Runs in node with no browser: it is a check on data, not on behaviour.

import { TEMPLATES } from '../js/sampleData.js';
import { ALL_REGISTERS, CHARTER_FIELDS } from '../js/registerDefs.js';
import { analyse } from '../js/critical.js';
import { SKILL_LEVELS, ORG_TYPES, ONBOARDING, RESOURCE_STATUS, resourceIdFor } from '../js/resourceModel.js';

let passed = 0;
const failures = [];

/**
 * `ok` must be a boolean. It used to accept anything truthy, which quietly
 * turned `check(label, list.length, 0)` — written as if it compared — into
 * "passes whenever the list is non-empty", the exact inverse of the intent.
 */
function check(label, ok, detail = '') {
  if (typeof ok !== 'boolean') {
    failures.push(`${label} — check() needs a boolean, got ${typeof ok}. Compare explicitly.`);
    return;
  }
  if (ok) { passed += 1; return; }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

const byKey = new Map(ALL_REGISTERS.map((d) => [d.key, d]));

TEMPLATES.forEach((template) => {
  const project = template.build();

  byKey.forEach((def, key) => {
    const rows = project[key];
    if (!Array.isArray(rows) || rows.length === 0) return;

    // `hiddenFields` are data a register keeps without a column of their own —
    // a deliverable's typed sign-off, filled from its signature.
    const allowed = new Set(['id', ...def.columns.map((c) => c.field).filter((f) => !f.startsWith('_')), ...(def.hiddenFields || [])]);
    const selects = def.columns.filter((c) => c.type === 'select');

    rows.forEach((row, i) => {
      const where = `${template.key}/${key}[${i}]`;

      Object.keys(row).forEach((field) => {
        check(`${where}: unknown field "${field}"`, allowed.has(field),
          `the register has ${[...allowed].join(', ')}`);
      });

      selects.forEach((col) => {
        const value = row[col.field];
        // Blank is always legitimate — plenty of rows are honestly undecided.
        if (value === undefined || value === '') return;
        check(`${where}: ${col.field} = "${value}"`, col.options.includes(value),
          `not one of ${col.options.join(' | ')}`);
      });

      check(`${where}: has an id`, typeof row.id === 'string' && row.id.length > 0);
    });
  });

  // Charter fields are plain strings on the project, and a template that puts
  // an object or a number there would render "[object Object]" into a textarea.
  CHARTER_FIELDS.forEach(({ field }) => {
    const value = project[field];
    check(`${template.key}: charter ${field} is text`,
      value === undefined || typeof value === 'string');
  });

  // Ids have to be unique across the whole project, because a link names a row
  // by id alone and the first match wins.
  const ids = [];
  ['dashTasks', 'milestones', 'raid', 'notes', ...byKey.keys()].forEach((key) => {
    (project[key] || []).forEach((row) => ids.push(row.id));
  });
  const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
  check(`${template.key}: every row id is unique`, dupes.length === 0, `repeated: ${[...new Set(dupes)].join(', ')}`);
});

// The point of the services templates is that they fill the registers, so that
// is worth asserting rather than assuming.
['transition', 'servicedesk'].forEach((key) => {
  const template = TEMPLATES.find((t) => t.key === key);
  check(`${key} exists`, !!template);
  if (!template) return;
  const project = template.build();
  const empty = [...byKey.keys()].filter((k) => !(project[k] || []).length);
  check(`${key} populates every register`, empty.length === 0, `empty: ${empty.join(', ')}`);
  check(`${key} has a charter`, (project.charterScopeIn || '').length > 20);
});

// Dependencies are written by hand in a template, by id, which is the one place
// an edge can point at nothing or close a loop before anyone opens the app.
TEMPLATES.forEach((template) => {
  const project = template.build();
  const tasks = project.dashTasks || [];
  const ids = new Set(tasks.map((t) => t.id));

  tasks.forEach((task) => {
    (task.dependsOn || []).forEach((dep) => {
      check(`${template.key}: ${task.name} waits for a task that exists`, ids.has(dep), `missing ${dep}`);
      check(`${template.key}: ${task.name} does not wait for itself`, dep !== task.id);
    });
    (task.checklist || []).forEach((item, i) => {
      check(`${template.key}: ${task.name} checklist[${i}] has an id`, typeof item.id === 'string' && !!item.id);
      check(`${template.key}: ${task.name} checklist[${i}] has text`, typeof item.text === 'string' && item.text.length > 0);
    });
    ['estimate', 'spent'].forEach((field) => {
      const v = task[field];
      check(`${template.key}: ${task.name} ${field} is a number or blank`,
        v === undefined || v === '' || (typeof v === 'number' && v >= 0), `got ${JSON.stringify(v)}`);
    });
  });

  const graph = analyse(tasks);
  check(`${template.key}: no dependency loops`, graph.cyclic.length === 0, graph.cyclic.join(', '));
});

// People a template seeds into the shared pool. A bad level or org type here
// renders as an empty select rather than an error, and the person quietly loses
// the attribute the pool exists to hold.
TEMPLATES.forEach((template) => {
  const project = template.build();
  const seeded = project.seedResources || [];
  const ids = new Set();

  seeded.forEach((person, i) => {
    const where = `${template.key}/seedResources[${i}]`;
    check(`${where}: has a name`, typeof person.name === 'string' && person.name.length > 0);
    check(`${where}: org type`, ORG_TYPES.includes(person.org), `got ${person.org}`);
    check(`${where}: onboarding`, ONBOARDING.includes(person.onboarding), `got ${person.onboarding}`);
    check(`${where}: status`, RESOURCE_STATUS.includes(person.status), `got ${person.status}`);
    (person.skills || []).forEach((skill, j) => {
      check(`${where}.skills[${j}]: level`, SKILL_LEVELS.includes(skill.level), `got ${skill.level}`);
      check(`${where}.skills[${j}]: name`, typeof skill.name === 'string' && skill.name.length > 0);
    });

    // Two people with the same email would collapse into one in the pool.
    const id = resourceIdFor(person);
    check(`${where}: identity is unique within the template`, !ids.has(id), person.email);
    ids.add(id);
  });

  // Everyone on the roster should be in the pool the template seeds, or they
  // arrive as a bare name with no skills, rates or capacity.
  (project.roster || []).forEach((row) => {
    if (!row.name || !seeded.length) return;
    check(`${template.key}: ${row.name} is seeded into the pool`, ids.has(resourceIdFor(row)), row.email || row.name);
  });
});

// The transition template is the worked example of the dependency features, so
// it has to actually demonstrate them.
{
  const project = TEMPLATES.find((t) => t.key === 'transition').build();
  const graph = analyse(project.dashTasks);
  check('transition has a critical path', graph.critical.length > 3);
  check('transition shows one deliberate fast-tracked overlap, no more',
    graph.conflicts.length === 1, `got ${graph.conflicts.length}`);
  check('transition has a checklist somewhere',
    project.dashTasks.some((t) => (t.checklist || []).length > 0), true);
  check('transition estimates most of its work',
    project.dashTasks.filter((t) => t.estimate !== '').length >= 8);
  check('transition seeds a pool worth opening', (project.seedResources || []).length >= 6);
  check('and most of them have rates, so margin is not all dashes',
    (project.seedResources || []).filter((p) => p.costRate && p.billRate).length >= 4);
  check('and skills, so the skill search finds somebody',
    (project.seedResources || []).every((p) => (p.skills || []).length > 0), true);
}

// Templates that name their own row ids hand the same ids to every project
// built from them. That is intentional — a task has to be able to say which
// other task blocks it — and it is why state.js regenerates them per project.
// Here we only pin down that the hazard is real, so the guard cannot be
// removed as unnecessary; the guard itself is tested in the browser, where
// there is a store to create projects in.
{
  const hazardous = TEMPLATES.filter((t) => {
    const a = t.build();
    const b = t.build();
    const idsB = new Set(b.dashTasks.map((x) => x.id));
    return a.dashTasks.some((x) => idsB.has(x.id));
  });
  check('at least one template reuses row ids across builds', hazardous.length > 0,
    'if this ever becomes zero, the regeneration in buildProjectFromTemplate is no longer load-bearing');

  hazardous.forEach((t) => {
    const p = t.build();
    const ids = new Set(p.dashTasks.map((x) => x.id));
    const dangling = p.dashTasks.flatMap((x) => (x.dependsOn || []).filter((d) => !ids.has(d)));
    check(`${t.key}: its fixed ids are internally consistent`,
      dangling.length === 0, `dangling: ${dangling.join(', ')}`);
  });
}

// ---------- the templates open on today ----------
// A template written against a fixed calendar decays into "everything is
// overdue". Each is moved, in whole weeks, so its status date sits near today.
{
  const day = (iso) => new Date(`${iso}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  TEMPLATES.forEach((t) => {
    const p = t.build();
    const anchor = p.dashDate || p.dashTasks.map((x) => x.start).filter(Boolean).sort()[0];
    if (!anchor) return;
    const gap = Math.round((day(anchor) - today) / 86400000);
    check(`${t.key}: its status date is within three days of today`, Math.abs(gap) <= 3, `${anchor} is ${gap} days off`);
  });
  // Whole weeks, so a Monday in the template is still a Monday.
  const raw = TEMPLATES.find((t) => t.key === 'marketing').build();
  const weekdays = raw.dashTasks.map((x) => day(x.start).getDay());
  check('marketing: weekdays survive the move', weekdays.join() === ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08', '2026-09-09', '2026-09-12', '2026-09-14', '2026-09-27'].map((d) => day(d).getDay()).join(), weekdays.join());
}

console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) {
  failures.forEach((f) => console.log(`  FAIL ${f}`));
  process.exit(1);
}
