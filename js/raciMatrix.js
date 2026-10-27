// The RACI matrix: who does what, activity by activity, as a grid. Pure.
//
// The rows are the "Who Does What (RACI)" register's own rows — the grid is a
// second way of editing them, not a second copy. A row keeps its people in
// four fields (responsible, accountable, consulted, informed), each a name or
// a comma-separated list, so the register stays readable and the grid's
// columns are simply every party named anywhere, in the order the project
// keeps (`project.raciParties`) and then the order they were first named.
// Setting a cell moves that party between the four fields of that row and
// nowhere else.
//
// The three rules of thumb are checked per row: exactly one A (one person
// answers for it), at least one R (someone does it), and C's kept lean —
// a soft check, raised only when more than half the columns are consulted
// (and never for fewer than LEAN_C), since some rows rightly ask many.

export const LETTERS = [
  { id: 'R', field: 'responsible', label: 'Responsible', hint: 'Does the work' },
  { id: 'A', field: 'accountable', label: 'Accountable', hint: 'Owns the outcome' },
  { id: 'C', field: 'consulted', label: 'Consulted', hint: 'Gives input before' },
  { id: 'I', field: 'informed', label: 'Informed', hint: 'Kept up to date' },
];
export const CYCLE = ['', 'R', 'A', 'C', 'I'];
export const PHASES = ['Initiation', 'Planning', 'Execution', 'Monitoring & Control', 'Closure'];
/** Above this many C's on one row, the matrix asks whether each is needed. */
export const LEAN_C = 4;

const clean = (s) => String(s || '').trim();
const keyOf = (s) => clean(s).toLowerCase();
export const splitNames = (v) => String(v || '').split(/[,;]/).map(clean).filter(Boolean);

/** Every party named on the matrix: the kept order first, then as first named. */
export function parties(project) {
  const seen = new Map();
  (project?.raciParties || []).forEach((n) => { if (clean(n) && !seen.has(keyOf(n))) seen.set(keyOf(n), clean(n)); });
  (project?.raci || []).forEach((row) => LETTERS.forEach((l) => splitNames(row[l.field]).forEach((n) => { if (!seen.has(keyOf(n))) seen.set(keyOf(n), n); })));
  return [...seen.values()];
}

/** The letter a party holds on a row, or '' — the first field that names them, in R, A, C, I order. */
export function cellOf(row, party) {
  const k = keyOf(party);
  const hit = LETTERS.find((l) => splitNames(row[l.field]).some((n) => keyOf(n) === k));
  return hit ? hit.id : '';
}

/** The row's four fields with `party` set to `letter` ('' clears): a patch, nothing else touched. */
export function setCell(row, party, letter) {
  const k = keyOf(party);
  const patch = {};
  LETTERS.forEach((l) => {
    const names = splitNames(row[l.field]).filter((n) => keyOf(n) !== k);
    if (l.id === letter) names.push(clean(party));
    patch[l.field] = names.join(', ');
  });
  return patch;
}

/** The next letter in the cycle — blank, R, A, C, I, blank. */
export const nextLetter = (letter) => CYCLE[(CYCLE.indexOf(letter || '') + 1) % CYCLE.length];

/** The rules of thumb for one row: { a, r, c, oneA, someR, leanC }. `columns` is how many parties the matrix has. */
export function rowRules(row, columns = 0) {
  const count = (field) => splitNames(row[field]).length;
  const a = count('accountable');
  const r = count('responsible');
  const c = count('consulted');
  return { a, r, c, oneA: a === 1, someR: r >= 1, leanC: c <= Math.max(LEAN_C, Math.floor(columns / 2)) };
}

/** The rows grouped by phase, in the lifecycle's order; rows with none come last. */
export function byPhase(project) {
  const rows = (project?.raci || []).filter((r) => clean(r.activity) || LETTERS.some((l) => clean(r[l.field])));
  const groups = PHASES.map((p) => ({ phase: p, rows: rows.filter((r) => r.phase === p) }));
  const other = rows.filter((r) => !PHASES.includes(r.phase));
  if (other.length) groups.push({ phase: '', rows: other });
  return groups.filter((g) => g.rows.length);
}

/** The matrix's standing on the three rules, and each party's load. */
export function matrixSummary(project) {
  const rows = byPhase(project).flatMap((g) => g.rows);
  const columns = parties(project).length;
  const rules = rows.map((r) => rowRules(r, columns));
  const load = parties(project).map((p) => {
    const letters = rows.map((r) => cellOf(r, p));
    return { party: p, A: letters.filter((x) => x === 'A').length, R: letters.filter((x) => x === 'R').length };
  });
  return {
    rows: rows.length,
    oneA: rules.filter((x) => x.oneA).length,
    someR: rules.filter((x) => x.someR).length,
    leanC: rules.filter((x) => x.leanC).length,
    load,
  };
}

// The matrix in the illustrative chart: 27 activities from initiation to
// closure across ten roles. A starting point to edit, not a standard.
const ROLES = ['Executive Sponsor', 'Project Manager', 'Steering Committee', 'Business Analyst', 'Technical Lead', 'Developer', 'QA Lead', 'PMO', 'Operations Lead', 'Customer Rep'];
const T = [
  ['Initiation', 'Submit project request', 'ARCCIIICIC'],
  ['Initiation', 'Review and approve project charter', 'ARCCIIICIC'],
  ['Initiation', 'Identify stakeholders', 'CACRIIICCC'],
  ['Initiation', 'Conduct initial feasibility study', 'CACRCIICCI'],
  ['Initiation', 'Define success criteria and KPIs', 'ARCCIIICIC'],
  ['Planning', 'Develop business case', 'ARCCCIICIC'],
  ['Planning', 'Define project scope', 'CRACCIICIC'],
  ['Planning', 'Gather and analyse requirements', 'IACRCCCIIC'],
  ['Planning', 'Develop project schedule', 'CACCRCICII'],
  ['Planning', 'Plan resource allocation', 'CACCCIIRCI'],
  ['Planning', 'Develop risk management plan', 'IACCCICRCI'],
  ['Planning', 'Develop communication plan', 'IAICIIIRIC'],
  ['Execution', 'Conduct design review', 'CACCRCCICC'],
  ['Execution', 'Build / develop solution', 'ICICARCIII'],
  ['Execution', 'Conduct sprint / iteration reviews', 'IAICRCCIIC'],
  ['Execution', 'Perform testing (system & UAT)', 'IAICCCRIIC'],
  ['Execution', 'Conduct user training', 'IAIRCIIICC'],
  ['Execution', 'Deploy to production', 'CAIIRCCICI'],
  ['Monitoring & Control', 'Track project progress', 'IACCCCCRII'],
  ['Monitoring & Control', 'Manage risks and issues', 'CACCCCCRCI'],
  ['Monitoring & Control', 'Handle change control', 'CACCCCCRCI'],
  ['Monitoring & Control', 'Conduct quality assurance review', 'IAICCCRCCI'],
  ['Monitoring & Control', 'Provide status reporting', 'IACCCCCRCI'],
  ['Closure', 'Obtain customer acceptance', 'CRICCCCIIA'],
  ['Closure', 'Release resources and close contracts', 'IAIIIIIRCI'],
  ['Closure', 'Capture lessons learned', 'CRCCCCCACC'],
  ['Closure', 'Create project closure report', 'CRCCCCCACC'],
];

export function templateRows() {
  return T.map(([phase, activity, letters]) => {
    const row = { phase, activity, responsible: '', accountable: '', consulted: '', informed: '' };
    LETTERS.forEach((l) => { row[l.field] = ROLES.filter((_, i) => letters[i] === l.id).join(', '); });
    return row;
  });
}

export const TEMPLATE_ROLES = ROLES;
