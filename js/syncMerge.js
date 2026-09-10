// Pure merge logic for sync. No network, no DOM, no storage — everything here
// is a function of its arguments, so the awkward cases (concurrent edits,
// deletes racing edits, skewed clocks) can be tested directly.
//
// The model is three-way: `base` is what this device last agreed with the
// server, `local` is what it has now, `remote` is what the server has now.
// Comparing both sides against base is what separates "I deleted this" from
// "I haven't received this yet" — the distinction a two-way merge can't make
// and the reason a naive sync resurrects deleted rows.
//
// When both sides changed the same row, the higher `rev` wins. Revs are client
// clocks and clocks drift, so a tie falls back to the server's copy: it is the
// one every other device already agrees on, which keeps devices converging
// instead of ping-ponging.

import { ROW_KINDS } from './syncModel.js';

const REMOTE = 'remote';
const LOCAL = 'local';

function indexById(rows) {
  const map = new Map();
  rows.forEach((r) => map.set(r.id, r));
  return map;
}

/**
 * Decides the fate of one row id.
 * `base` here is just a boolean: was this row present at the last sync?
 */
function decideRow(existedAtBase, local, remote) {
  const remoteLive = remote && !remote.deleted_at ? remote : null;

  if (local && remoteLive) {
    const localRev = local._rev || 0;
    const remoteRev = remoteLive.rev || 0;
    if (localRev > remoteRev) return { action: 'push', winner: LOCAL };
    if (remoteRev > localRev) return { action: 'pull', winner: REMOTE };
    return { action: 'none', winner: REMOTE };   // equal revs: server copy stands
  }

  if (local && !remoteLive) {
    // Gone on the server. Deleted there if we'd seen it before, otherwise
    // it's simply a row this device created and hasn't pushed yet.
    if (remote && remote.deleted_at) return { action: 'delete-local', winner: REMOTE };
    return existedAtBase
      ? { action: 'delete-local', winner: REMOTE }
      : { action: 'push', winner: LOCAL };
  }

  if (!local && remoteLive) {
    // Present on the server but not here: deleted here if we'd seen it
    // before, otherwise it's new to this device.
    return existedAtBase
      ? { action: 'delete-remote', winner: LOCAL }
      : { action: 'pull', winner: REMOTE };
  }

  return { action: 'none', winner: REMOTE };
}

/**
 * Merges one project's rows.
 *
 * @param baseRowIds  Set of row ids present at the last successful sync.
 * @param localRows   [{ id, kind, position, _rev, ...fields }]
 * @param remoteRows  [{ id, kind, position, rev, deleted_at, data }]
 * @returns { rows, toPush, toDelete } — `rows` is the merged local shape,
 *          `toDelete` is [{ id, kind }] for tombstoning on the server.
 */
export function mergeRows(baseRowIds, localRows, remoteRows) {
  const localById = indexById(localRows);
  const remoteById = indexById(remoteRows);
  const ids = new Set([...localById.keys(), ...remoteById.keys(), ...baseRowIds]);

  const rows = [];
  const toPush = [];
  const toDelete = [];

  ids.forEach((id) => {
    const local = localById.get(id) || null;
    const remote = remoteById.get(id) || null;
    const { action, winner } = decideRow(baseRowIds.has(id), local, remote);

    switch (action) {
      case 'push':
        rows.push(local);
        toPush.push(local);
        break;
      case 'pull':
        rows.push(remoteToLocal(remote));
        break;
      case 'delete-local':
        break;                       // drop it: the server says it's gone
      case 'delete-remote':
        // `kind` comes from the server copy — the local one is already gone,
        // and the tombstone still has to satisfy the table's kind constraint.
        toDelete.push({ id, kind: remote.kind });
        break;
      default:
        // Nothing to send either way. On equal revs the two copies are
        // normally identical; when they aren't (two devices edited within the
        // same millisecond, or a clock is off) the server's copy is the one
        // every other device already has, so take it and stop oscillating.
        if (winner === REMOTE && remote && !remote.deleted_at) rows.push(remoteToLocal(remote));
        else if (local) rows.push(local);
    }
  });

  rows.sort((a, b) => (a.position || 0) - (b.position || 0));
  return { rows, toPush, toDelete };
}

function remoteToLocal(remote) {
  return { ...remote.data, id: remote.id, kind: remote.kind, position: remote.position || 0, _rev: remote.rev || 0 };
}

/**
 * Merges the scalar half of a project (name, dates, budget, status…).
 * These are edited on the project header by one person at a time, so they're
 * treated as a single value rather than field by field.
 */
export function mergeProjectScalars(existedAtBase, localProject, remoteProject) {
  const remoteLive = remoteProject && !remoteProject.deleted_at ? remoteProject : null;

  if (localProject && remoteLive) {
    const localRev = localProject.updatedAt || 0;
    const remoteRev = remoteLive.rev || 0;
    return localRev > remoteRev
      ? { action: 'push', data: localProject }
      : { action: remoteRev > localRev ? 'pull' : 'none', data: remoteLive };
  }
  if (localProject && !remoteLive) {
    return existedAtBase ? { action: 'delete-local', data: null } : { action: 'push', data: localProject };
  }
  if (!localProject && remoteLive) {
    return existedAtBase ? { action: 'delete-remote', data: null } : { action: 'pull', data: remoteLive };
  }
  return { action: 'none', data: null };
}

/**
 * Whole-store merge. Returns the merged set of projects in the app's shape
 * plus the work the caller has to send back to the server.
 *
 * @param base    { [projectId]: { scalars, rows: { [rowId]: hash } } }
 * @param local   [{ id, ...project }]  (app shape)
 * @param remote  { projects: [wire rows], rows: [wire rows] }
 */
export function mergeStore(base, local, remote) {
  const localById = indexById(local);
  const remoteProjectsById = indexById(remote.projects || []);
  const remoteRowsByProject = new Map();
  (remote.rows || []).forEach((r) => {
    if (!remoteRowsByProject.has(r.project_id)) remoteRowsByProject.set(r.project_id, []);
    remoteRowsByProject.get(r.project_id).push(r);
  });

  const ids = new Set([
    ...localById.keys(),
    ...remoteProjectsById.keys(),
    ...Object.keys(base || {}),
  ]);

  const projects = [];
  const pushProjects = [];
  const pushRows = [];
  const deleteProjects = [];
  const deleteRows = [];

  ids.forEach((id) => {
    const localProject = localById.get(id) || null;
    const remoteProject = remoteProjectsById.get(id) || null;
    const baseEntry = (base || {})[id] || null;
    const scalar = mergeProjectScalars(!!baseEntry, localProject, remoteProject);

    if (scalar.action === 'delete-local') return;
    if (scalar.action === 'delete-remote') { deleteProjects.push(id); return; }

    const baseRowIds = new Set(Object.keys((baseEntry && baseEntry.rows) || {}));
    const localRows = flattenRows(localProject);
    const remoteRows = remoteRowsByProject.get(id) || [];
    const merged = mergeRows(baseRowIds, localRows, remoteRows);

    const scalarSource = scalar.action === 'pull'
      ? { ...remoteProject.data, id, updatedAt: remoteProject.rev || 0 }
      : { ...stripRows(localProject), id };

    projects.push(unflattenRows(scalarSource, merged.rows));
    if (scalar.action === 'push') pushProjects.push(id);
    merged.toPush.forEach((row) => pushRows.push({ projectId: id, row }));
    merged.toDelete.forEach((row) => deleteRows.push({ projectId: id, rowId: row.id, kind: row.kind }));
  });

  return { projects, pushProjects, pushRows, deleteProjects, deleteRows };
}

function flattenRows(project) {
  if (!project) return [];
  const out = [];
  ROW_KINDS.forEach((kind) => {
    (project[kind] || []).forEach((row, index) => {
      out.push({ ...row, kind, position: index });
    });
  });
  return out;
}

function stripRows(project) {
  const copy = { ...project };
  ROW_KINDS.forEach((kind) => { delete copy[kind]; });
  return copy;
}

function unflattenRows(scalars, rows) {
  const project = { ...scalars };
  ROW_KINDS.forEach((kind) => { project[kind] = []; });
  rows.forEach((row) => {
    const { kind, position, ...rest } = row;
    if (ROW_KINDS.includes(kind)) project[kind].push(rest);
  });
  return project;
}
