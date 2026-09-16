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

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) { passed += 1; return; }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

const byKey = new Map(ALL_REGISTERS.map((d) => [d.key, d]));

TEMPLATES.forEach((template) => {
  const project = template.build();

  byKey.forEach((def, key) => {
    const rows = project[key];
    if (!Array.isArray(rows) || rows.length === 0) return;

    const allowed = new Set(['id', ...def.columns.map((c) => c.field).filter((f) => f !== '_ref')]);
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

console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) {
  failures.forEach((f) => console.log(`  FAIL ${f}`));
  process.exit(1);
}
