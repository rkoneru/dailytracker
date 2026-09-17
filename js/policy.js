import { ROLES as JOB_ROLES, DEFAULT_ROLE, ALWAYS_AVAILABLE } from './roles.js';
import { NAV_TREE } from './nav.js';

// What each job role is offered, and who decides it.
//
// This used to be a personal setting: the picker on the sidebar let anybody
// call themselves an engagement lead and see every page. That is fine for one
// person on one laptop and wrong the moment a workspace has an administrator,
// because a preference everyone sets for themselves is not a policy.
//
// So there are two modes, and the difference between them is worth stating
// plainly because it is the difference between a convenience and a control:
//
//   * ON THIS DEVICE — no account. The data is in this browser and nobody else
//     can reach it, so the role picker is a personal view filter and stays
//     self-service. There is nothing here to protect you from yourself.
//
//   * IN A WORKSPACE — signed in. Your job role is assigned by an
//     administrator and arrives with the sync; the page policy comes with it.
//     You cannot change either, and the server will not let you: see the
//     project_members and workspace_policy policies in supabase/schema.sql,
//     which are executed and attacked by tests/test-rls.js.
//
// And the thing this module must never be read as claiming: hiding a page is
// not access control. A person who wants to can open a console and unhide it.
// What stops them reading or changing data they should not is row level
// security on the server, which is a different mechanism with a different
// guarantee. The Settings page says so in as many words.

const CACHE_KEY = 'projectPlannerPolicy_v1';

/** Every destination the nav can reach, which is what a policy assigns. */
export function allNavIds() {
  const out = [];
  const walk = (nodes) => nodes.forEach((node) => {
    if (node.page || node.panel) out.push(node.id);
    if (node.children) walk(node.children);
  });
  walk(NAV_TREE);
  return out;
}

/**
 * The pages an administrator is offered, and their labels.
 *
 * Deliberately excludes the ones no policy may take away: offering a tick box
 * that is ignored would be worse than not offering it, because the
 * administrator would believe they had removed something.
 */
export function navLabels() {
  const out = new Map();
  const walk = (nodes, trail) => nodes.forEach((node) => {
    if ((node.page || node.panel) && !ALWAYS_AVAILABLE.includes(node.id)) {
      out.set(node.id, { label: node.label, group: trail });
    }
    if (node.children) walk(node.children, trail || node.label);
  });
  walk(NAV_TREE, '');
  return out;
}

/**
 * The policy a workspace starts with: whatever each role's built-in nav list
 * says. An administrator edits from there rather than from a blank sheet,
 * because a blank sheet means everyone sees nothing on the first save.
 */
export function defaultPolicy() {
  const every = allNavIds();
  const pages = {};
  JOB_ROLES.forEach((role) => {
    pages[role.id] = role.nav === null ? every.slice() : role.nav.slice();
  });
  return pages;
}

// ---------- the policy in force ----------

let policy = null;          // { pages, requireSignIn, source, projectId }
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Could not read the cached policy.', err);
    return null;
  }
}

function write(value) {
  try {
    if (value) localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    else localStorage.removeItem(CACHE_KEY);
  } catch (err) {
    console.warn('Could not cache the policy.', err);
  }
}

export function getPolicy() {
  if (policy === null) policy = read() || { pages: null, requireSignIn: false, source: 'local', projectId: '' };
  return policy;
}

/**
 * Installs the policy that came down with the sync.
 *
 * Cached so the app opens correctly offline — but the cache is a copy of an
 * administrator's decision, not a place to make one: nothing in the app writes
 * it except this function, and the server is the only thing that writes the
 * source. Someone editing the cache by hand gets a different view of their own
 * browser and no additional access to anything.
 */
export function setPolicy({ pages, requireSignIn, projectId }) {
  policy = {
    pages: pages && Object.keys(pages).length ? pages : null,
    requireSignIn: !!requireSignIn,
    source: 'workspace',
    projectId: projectId || '',
  };
  write(policy);
  emit();
  return policy;
}

/** Forgets a workspace policy — on sign-out, or when a project has none. */
export function clearPolicy() {
  policy = { pages: null, requireSignIn: false, source: 'local', projectId: '' };
  write(null);
  emit();
}

export function onPolicyChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(getPolicy()));
}

/** True when an administrator, rather than this device, decides the nav. */
export function isManaged() {
  const current = getPolicy();
  return current.source === 'workspace' && current.pages !== null;
}

/**
 * The pages a job role may see.
 *
 * An unknown role gets the most restrictive answer rather than everything: a
 * typo in an assignment, or a role this build does not know about yet, must
 * fail closed. Falling back to "show it all" would mean a misspelling was the
 * way past the policy.
 */
export function pagesFor(jobRoleId) {
  const current = getPolicy();
  if (!isManaged()) {
    const role = JOB_ROLES.find((r) => r.id === jobRoleId);
    return role ? role.nav : null;
  }
  const assigned = current.pages[jobRoleId];
  if (Array.isArray(assigned)) return assigned;
  const fallback = JOB_ROLES.find((r) => r.id === DEFAULT_ROLE);
  return fallback && fallback.nav ? fallback.nav : [];
}

/**
 * Normalises whatever came back from the server.
 *
 * The column is free-form JSON, so this is the boundary where a hand-edited or
 * half-written policy stops being trusted: anything that is not a known role
 * mapped to an array of known nav ids is dropped rather than carried inward.
 */
export function sanitisePolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const known = new Set(allNavIds());
  const roles = new Set(JOB_ROLES.map((r) => r.id));
  const out = {};
  Object.entries(raw).forEach(([role, ids]) => {
    if (!roles.has(role) || !Array.isArray(ids)) return;
    out[role] = ids.filter((id) => typeof id === 'string' && known.has(id));
  });
  return out;
}
