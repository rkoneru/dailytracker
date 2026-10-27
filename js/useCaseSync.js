// The use case sync lane: a separate pull and push against `use_cases`.
//
// It runs after the project sync and fails on its own. A workspace whose
// schema predates use cases has no table to talk to; that must not turn the
// project sync red, so this lane reports its own state and the Use Cases page
// shows it ("re-run schema.sql"), while projects carry on syncing.
//
// What comes back is exactly what row level security allows: the use cases in
// workspaces where this person is the owner or a client partner. A row this
// device had synced that no longer comes back has been withheld — the grant
// was taken away — and mergeUseCases drops the local copy rather than
// uploading it again. A row is only pushed into a workspace where this person
// may write use cases; anything else stays on this device and the page says so.

import * as api from './supabase.js';
import { mergeUseCases, contentHash } from './useCaseModel.js';
import { allRowsForSync, replaceFromSync, readBase, writeBase } from './useCaseStore.js';

let state = { status: 'idle', message: '', writable: null };
const listeners = new Set();

export function onUseCaseSyncChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useCaseSyncState() {
  return { ...state, writable: state.writable ? new Set(state.writable) : null };
}

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(useCaseSyncState()));
}

/** Workspaces where this person may write use cases: owned, or partner and not a viewer. */
async function writableProjects(userId) {
  const [owned, memberships] = await Promise.all([
    api.select('projects', `owner_id=eq.${userId}&select=id`),
    api.select('project_members', `user_id=eq.${userId}&select=project_id,role,client_partner`),
  ]);
  const ids = new Set((owned || []).map((p) => p.id));
  (memberships || []).forEach((m) => {
    if (m.client_partner && m.role !== 'viewer') ids.add(m.project_id);
  });
  return ids;
}

function toWire(uc) {
  const { id, projectId, rev, deletedAt, ...data } = uc;
  return {
    id,
    project_id: projectId,
    data,
    rev: rev || 0,
    deleted_at: deletedAt || null,
  };
}

export async function syncUseCases() {
  const user = api.getUser();
  if (!api.isConfigured() || !user) return;
  set({ status: 'syncing' });
  try {
    let remote;
    try {
      remote = await api.select('use_cases', 'select=id,project_id,data,rev,deleted_at');
    } catch (err) {
      // PostgREST answers 404 for a table it does not know, with wording that
      // has changed between versions, so the status is what is trusted.
      if (err.status === 404 || /relation|does not exist|42P01|PGRST205|schema cache/i.test(err.message)) {
        set({ status: 'not-installed', message: 'The use_cases table is not in this Supabase project yet. Re-run supabase/schema.sql to share use cases; until then they stay on this device.' });
        return;
      }
      throw err;
    }
    const writable = await writableProjects(user.id);
    const base = readBase();
    const before = allRowsForSync();
    const { merged, push } = mergeUseCases({
      local: before,
      remote: remote || [],
      base,
      canPush: (uc) => writable.has(uc.projectId),
    });

    if (push.length) await api.upsert('use_cases', push.map(toWire));

    // After a successful push the tombstones have done their job, and the
    // baseline records what the server now holds.
    const nextBase = {};
    const kept = {};
    const serverIds = new Set((remote || []).filter((r) => !r.deleted_at).map((r) => r.id));
    const pushedIds = new Set(push.map((uc) => uc.id));
    Object.values(merged).forEach((uc) => {
      if (uc.deletedAt) return;
      kept[uc.id] = uc;
      if (serverIds.has(uc.id) || pushedIds.has(uc.id)) nextBase[uc.id] = contentHash(uc);
    });
    // Anything edited while the network was busy is newer than what was
    // merged: keep it, and leave it out of the baseline so it pushes next time.
    Object.values(allRowsForSync()).forEach((uc) => {
      const was = before[uc.id];
      if (was && (uc.rev || 0) <= (was.rev || 0)) return;
      if (uc.deletedAt) delete kept[uc.id];
      else kept[uc.id] = uc;
      delete nextBase[uc.id];
    });
    replaceFromSync(kept);
    writeBase(nextBase);
    set({ status: 'synced', message: '', writable: [...writable] });
  } catch (err) {
    // Local data is untouched on every failure path: nothing above replaces
    // it until the pull and the push have both succeeded.
    set({ status: 'error', message: err.message || String(err) });
    console.warn('Use case sync failed; local use cases are unchanged.', err);
  }
}
