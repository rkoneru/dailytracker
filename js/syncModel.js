// Shape conversion between the app's project object and the wire shape the
// sync tables use, plus the change detection that drives it.
//
// The app stores a project as one object with six embedded row collections.
// The server stores it as one `projects` row (the scalar fields) plus N
// `project_rows` rows, so two people editing different tasks don't collide.
//
// Change detection is deliberately central: every edit handler in the app
// already calls scheduleSave(), but none of them knows *which* row changed.
// Rather than thread that through five files, the save path hashes each row
// and stamps `_rev` on the ones whose contents actually moved. The hashes
// live in their own storage key so they never sync as noise.

// The Planner's old `tasks` and `gantt` lists were folded into `dashTasks`.
// Rows of those kinds may still sit in an already-synced database; they are
// simply never read or written again, and the schema's CHECK still permits
// them so an older client on the same account keeps working.
export const ROW_KINDS = ['milestones', 'dashTasks', 'notes', 'raid'];

// Fields the app keeps locally that must never be pushed to the server.
// `updatedAt` is carried as the wire `rev` column, so it must not also be
// duplicated inside the jsonb blob.
const LOCAL_ONLY_PROJECT_FIELDS = ['id', 'updatedAt', ...ROW_KINDS];
const LOCAL_ONLY_ROW_FIELDS = ['id', '_rev'];

/**
 * Order-independent JSON, so two objects with the same content hash the same
 * regardless of key insertion order (which differs between a template-built
 * row and one round-tripped through the server).
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** FNV-1a. Not cryptographic — this only ever answers "did this change?". */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function hashRow(row) {
  const copy = {};
  Object.keys(row).forEach((k) => { if (!LOCAL_ONLY_ROW_FIELDS.includes(k)) copy[k] = row[k]; });
  return hash(stableStringify(copy));
}

function hashScalars(project) {
  const copy = {};
  Object.keys(project).forEach((k) => {
    if (!LOCAL_ONLY_PROJECT_FIELDS.includes(k) && !k.startsWith('_')) copy[k] = project[k];
  });
  return hash(stableStringify(copy));
}

/**
 * Stamps `_rev` on rows whose content changed since the last call, and
 * returns the new hash record for this project.
 *
 * `previous` is the record from the last call: { scalars, rows: { id: hash } }.
 * Rows present in `previous` but missing now are reported as `deleted`, which
 * is what lets a delete on this device propagate instead of looking like a row
 * the device simply hasn't received yet.
 */
export function stampRevisions(project, previous, now = Date.now()) {
  // No previous record means this project has never been hashed — a store
  // that predates sync, or a project just built from a template. Its rows
  // haven't "just been edited", so they adopt the project's own timestamp
  // instead of `now`; otherwise every row would look freshly edited and win
  // every merge against a device that has had the project for weeks.
  const first = !previous;
  const prevRows = (previous && previous.rows) || {};
  const rows = {};
  let changed = first;

  ROW_KINDS.forEach((kind) => {
    (project[kind] || []).forEach((row) => {
      const h = hashRow(row);
      rows[row.id] = h;
      if (first) {
        if (row._rev === undefined) row._rev = project.updatedAt || now;
      } else if (prevRows[row.id] !== h) {
        row._rev = now;
        changed = true;
      } else if (row._rev === undefined) {
        row._rev = project.updatedAt || now;
      }
    });
  });

  const scalars = hashScalars(project);
  const deleted = Object.keys(prevRows).filter((id) => !(id in rows));
  if (deleted.length > 0) changed = true;
  if (previous && previous.scalars !== scalars) changed = true;

  return { record: { scalars, rows }, deleted, changed };
}

// ---------- app shape <-> wire shape ----------

/** Splits a project into the `projects` row and its `project_rows` rows. */
export function toWire(project) {
  const data = {};
  Object.keys(project).forEach((k) => {
    if (!LOCAL_ONLY_PROJECT_FIELDS.includes(k) && !k.startsWith('_')) data[k] = project[k];
  });

  const rows = [];
  ROW_KINDS.forEach((kind) => {
    (project[kind] || []).forEach((row, index) => {
      const rowData = {};
      Object.keys(row).forEach((k) => { if (!LOCAL_ONLY_ROW_FIELDS.includes(k)) rowData[k] = row[k]; });
      rows.push({
        id: row.id,
        project_id: project.id,
        kind,
        position: index,
        data: rowData,
        // Promoted out of the jsonb blob into its own column, because this is
        // the one field the database itself has to read: the contributor
        // policy compares it against auth.uid().
        assignee_user_id: row.assigneeUserId || null,
        rev: row._rev || project.updatedAt || 0,
      });
    });
  });

  return {
    project: { id: project.id, data, rev: project.updatedAt || 0 },
    rows,
  };
}

/** Rebuilds a project object from a `projects` row plus its `project_rows`. */
export function fromWire(projectRow, rows) {
  const project = { ...projectRow.data, id: projectRow.id, updatedAt: projectRow.rev || 0 };

  ROW_KINDS.forEach((kind) => { project[kind] = []; });
  rows
    .filter((r) => !r.deleted_at && ROW_KINDS.includes(r.kind))
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .forEach((r) => {
      project[r.kind].push({
        ...r.data,
        id: r.id,
        assigneeUserId: r.assignee_user_id || '',
        _rev: r.rev || 0,
      });
    });

  return project;
}
