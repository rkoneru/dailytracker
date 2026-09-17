import * as api from './supabase.js';
import { setPolicy, clearPolicy, sanitisePolicy, defaultPolicy } from './policy.js';
import { setWorkflow, clearWorkflow } from './workflow.js';
import { defaultWorkflow, sanitiseWorkflow } from './playbook.js';
import { setAssignedRole, clearAssignedRole } from './roles.js';

// Who you are in this workspace, and what that lets you do.
//
// There are two facts and they are often confused, so they are kept apart here
// and named differently everywhere in the app:
//
//   ACCESS ROLE   viewer / contributor / editor / owner. What you may read and
//                 write. Enforced by Postgres. Nothing the client does can
//                 widen it, and nothing the client does is required to narrow
//                 it — a viewer who edits the DOM still cannot save.
//
//   JOB ROLE      project manager, tester, service manager… What you do, which
//                 decides the pages the app offers you. Assigned by an
//                 administrator. This is workspace policy: useful, and not a
//                 security boundary.
//
// `canAdmin` is the third: the grant that lets an engagement manager run the
// workspace — manage people, assign job roles, set page access — without
// owning the project or being able to delete it.

const LAST_KEY = 'projectPlannerIdentity_v1';

let current = {
  user: null,          // { id, email } or null when nobody is signed in
  accessRole: null,    // viewer | contributor | editor | owner
  jobRole: null,       // assigned, or null when this device decides
  canAdmin: false,
  isOwner: false,
  projectId: '',
  loaded: false,
};

const listeners = new Set();

export function onIdentityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(getIdentity()));
}

export function getIdentity() {
  return { ...current };
}

export function isSignedIn() {
  return !!(current.user && current.user.id);
}

/**
 * Whether this person may administer the workspace.
 *
 * False when nobody is signed in — not because a lone user is untrusted, but
 * because there is no workspace to administer. Their own device is entirely
 * theirs and the Settings page says so rather than showing an empty admin
 * panel that governs nobody.
 */
export function canAdminister() {
  return isSignedIn() && (current.isOwner || current.canAdmin);
}

/** A short sentence for the UI: what you are, in this workspace. */
export function describeIdentity() {
  if (!isSignedIn()) return 'Signed out — everything stays on this device.';
  const who = current.user.email;
  if (current.isOwner) return `${who} · owner of this project`;
  if (current.canAdmin) return `${who} · ${current.accessRole || 'member'}, can administer`;
  return `${who} · ${current.accessRole || 'member'}`;
}

function remember() {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({
      email: current.user ? current.user.email : '',
      accessRole: current.accessRole,
      jobRole: current.jobRole,
      canAdmin: current.canAdmin,
      isOwner: current.isOwner,
      projectId: current.projectId,
    }));
  } catch (err) {
    console.warn('Could not remember who was signed in.', err);
  }
}

function forget() {
  try { localStorage.removeItem(LAST_KEY); } catch (err) { /* nothing to do */ }
}

/**
 * Reads the signed-in user's membership of a project and installs everything
 * that follows from it: access role, assigned job role, admin grant, and the
 * page policy the administrator set.
 *
 * Deliberately re-read on every load rather than trusted from cache. A cached
 * "you are an admin" is a claim the browser is making about itself; the server
 * is the only thing entitled to make it, and it is cheap to ask.
 */
export async function refreshIdentity(projectId) {
  const user = api.getUser();

  if (!user || !api.isConfigured()) {
    current = { user: null, accessRole: null, jobRole: null, canAdmin: false, isOwner: false, projectId: '', loaded: true };
    clearAssignedRole();
    clearPolicy();
    forget();
    emit();
    return getIdentity();
  }

  current.user = { id: user.id, email: user.email };
  current.projectId = projectId || '';

  if (!projectId) {
    current.loaded = true;
    emit();
    return getIdentity();
  }

  try {
    const [projects, members, policies] = await Promise.all([
      api.select('projects', `id=eq.${projectId}&select=id,owner_id`),
      api.select('project_members', `project_id=eq.${projectId}&user_id=eq.${user.id}&select=role,job_role,can_admin`),
      api.select('workspace_policy', `project_id=eq.${projectId}&select=pages,require_sign_in,workflow`),
    ]);

    const isOwner = Array.isArray(projects) && projects.some((p) => p.owner_id === user.id);
    const membership = Array.isArray(members) && members[0] ? members[0] : null;

    current.isOwner = isOwner;
    current.accessRole = isOwner ? 'owner' : (membership ? membership.role : null);
    current.jobRole = membership ? (membership.job_role || null) : null;
    // The owner administers by definition; the column only matters for people
    // the owner has delegated to.
    current.canAdmin = isOwner || !!(membership && membership.can_admin);
    current.loaded = true;

    const row = Array.isArray(policies) && policies[0] ? policies[0] : null;
    if (row) {
      setPolicy({
        pages: sanitisePolicy(row.pages),
        requireSignIn: !!row.require_sign_in,
        projectId,
      });
      // An empty object means the administrator has not configured the
      // workflow, which is different from configuring it as empty: the first
      // gets the whole map, the second would get nothing.
      if (row.workflow && Object.keys(row.workflow).length) setWorkflow(row.workflow);
      else clearWorkflow();
    } else {
      clearPolicy();
      clearWorkflow();
    }

    // An assignment wins over whatever this device had chosen. Applying it
    // here rather than in the picker means someone cannot keep a role by
    // never opening Settings.
    if (current.jobRole) setAssignedRole(current.jobRole);
    else clearAssignedRole();

    remember();
  } catch (err) {
    // A failed read must not quietly promote anyone. Falling back to "not an
    // admin, no policy" is the only safe direction to fail in.
    console.warn('Could not read your membership; treating you as a plain member.', err);
    current.isOwner = false;
    current.canAdmin = false;
    current.accessRole = current.accessRole || null;
    current.loaded = true;
  }

  emit();
  return getIdentity();
}

// ---------- administration ----------

/**
 * Everyone in the project, for the admin screens.
 *
 * Returns [] rather than throwing when the read is refused: a non-admin asking
 * is not an error, it is the policy working, and the caller shows the "you
 * cannot manage this workspace" panel instead.
 */
export async function listMembership(projectId) {
  if (!projectId || !isSignedIn()) return [];
  try {
    const [members, profiles] = await Promise.all([
      api.select('project_members', `project_id=eq.${projectId}&select=user_id,role,job_role,can_admin`),
      api.select('profiles', 'select=id,email,display_name'),
    ]);
    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    return (members || []).map((m) => ({
      userId: m.user_id,
      email: (byId.get(m.user_id) || {}).email || '',
      name: (byId.get(m.user_id) || {}).display_name || '',
      accessRole: m.role,
      jobRole: m.job_role || '',
      canAdmin: !!m.can_admin,
    }));
  } catch (err) {
    console.warn('Could not list the workspace members.', err);
    return [];
  }
}

/**
 * Writes one member's assignment.
 *
 * The client checks `canAdminister()` first only to avoid showing a pointless
 * failure — it is not what enforces this. The server refuses the write outright
 * for anyone else, including the three escalations delegation could otherwise
 * allow (promoting to owner, granting can_admin, editing your own row).
 */
export async function assignMember(projectId, userId, patch) {
  if (!canAdminister()) throw new Error('Only an administrator can change assignments.');
  const body = {};
  if (patch.accessRole !== undefined) body.role = patch.accessRole;
  if (patch.jobRole !== undefined) body.job_role = patch.jobRole || null;
  if (patch.canAdmin !== undefined) body.can_admin = !!patch.canAdmin;
  await api.patch('project_members', `project_id=eq.${projectId}&user_id=eq.${userId}`, body);
}

export async function savePolicy(projectId, { pages, requireSignIn, workflow }) {
  if (!canAdminister()) throw new Error('Only an administrator can change page access.');
  const clean = sanitisePolicy(pages);
  const cleanWorkflow = sanitiseWorkflow(workflow || {});
  await api.upsert('workspace_policy', [{
    project_id: projectId,
    pages: clean,
    require_sign_in: !!requireSignIn,
    workflow: cleanWorkflow,
    updated_at: new Date().toISOString(),
    updated_by: current.user ? current.user.id : null,
  }], 'project_id');
  setPolicy({ pages: clean, requireSignIn, projectId });
  setWorkflow(cleanWorkflow);
}

export async function readPolicyFor(projectId) {
  const blank = { pages: defaultPolicy(), requireSignIn: false, workflow: defaultWorkflow(), existing: false };
  try {
    const rows = await api.select('workspace_policy',
      `project_id=eq.${projectId}&select=pages,require_sign_in,workflow`);
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return blank;
    return {
      pages: { ...defaultPolicy(), ...sanitisePolicy(row.pages) },
      requireSignIn: !!row.require_sign_in,
      workflow: row.workflow && Object.keys(row.workflow).length
        ? sanitiseWorkflow(row.workflow)
        : defaultWorkflow(),
      existing: true,
    };
  } catch (err) {
    console.warn('Could not read the page policy.', err);
    return blank;
  }
}

// ---------- sessions ----------

export async function signOut({ wipeLocal = false } = {}) {
  await api.signOut();
  clearAssignedRole();
  clearPolicy();
  forget();
  current = { user: null, accessRole: null, jobRole: null, canAdmin: false, isOwner: false, projectId: '', loaded: true };
  // Signing out of a shared computer should be able to mean it: the projects
  // are still on the server for anyone who signs back in, and leaving a copy
  // in localStorage on a machine somebody else uses is the obvious hole.
  if (wipeLocal) {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('projectPlanner'))
        .forEach((key) => localStorage.removeItem(key));
    } catch (err) {
      console.warn('Could not clear local data.', err);
    }
  }
  // Whatever role this device had chosen for itself is left alone: a personal
  // install should be unchanged by signing out of a workspace it never
  // belonged to, and clearAssignedRole above has already released the
  // assignment that was overriding it.
  emit();
}
