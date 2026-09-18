// Accounts you can sign in to without a server.
//
// The app has had real sign-in for a while — a magic link, a Supabase project,
// row level security behind it — and that is the right thing for real data and
// completely useless for looking around. Nobody wants to stand up a Postgres
// instance to find out what the admin screens look like, and the honest answer
// to "how do I log in as an administrator?" was several paragraphs long.
//
// So: five people who do not exist, on this device, with no password. Pick one
// and the whole app behaves as it would for them — the nav they get, the
// screens they can open, the assignments they may change.
//
// What this is emphatically NOT is a security feature, and it is worth being
// blunt about why rather than leaving it implied. There is no secret here.
// Everyone is offered every account. The roster lives in localStorage, where
// anyone with the device can edit it. Signing in as the administrator proves
// nothing to anybody and unlocks nothing that was locked. It is a costume, and
// the app says so on the login screen, in the banner that stays up while one is
// worn, and in the Settings list of what is and is not enforced.
//
// The one thing it does take seriously is the *shape* of the rules. When the
// demo administrator tries to promote somebody to owner, or to make a second
// administrator, or to edit their own row, this refuses — exactly as the
// Postgres policies in supabase/schema.sql refuse, and for the same reasons.
// A demo that let you do things the real thing forbids would be teaching the
// wrong lesson about the product, which is the only lesson it is here to teach.

const DEMO_KEY = 'projectPlannerDemo_v1';

/**
 * The cast.
 *
 * Chosen to cover the four states worth seeing rather than to fill a page:
 * an owner who administers, a delegated administrator who hits the delegation
 * fences, two contributors whose job roles give them visibly different navs,
 * and a viewer who can read everything and save nothing.
 */
export const DEMO_ACCOUNTS = [
  {
    id: 'demo-admin',
    name: 'Avery Stone',
    email: 'avery@demo.local',
    title: 'Administrator',
    accessRole: 'owner',
    jobRole: 'engagement-lead',
    canAdmin: true,
    blurb: 'Owns the project. Sees every page, assigns everyone else’s role, '
      + 'decides which pages each role is offered, and sets the task workflow.',
  },
  {
    id: 'demo-manager',
    name: 'Priya Nadar',
    email: 'priya@demo.local',
    title: 'Engagement Manager',
    accessRole: 'editor',
    jobRole: 'project-manager',
    canAdmin: true,
    blurb: 'Administers the workspace without owning it — so the three things '
      + 'delegation must not hand over are refused here, as the server refuses them.',
  },
  {
    id: 'demo-dev',
    name: 'Sam Okafor',
    email: 'sam@demo.local',
    title: 'Developer',
    accessRole: 'contributor',
    jobRole: 'developer',
    canAdmin: false,
    blurb: 'A narrower sidebar: their own queue, the board, what is blocked. '
      + 'No commercial pages, no admin screens.',
  },
  {
    id: 'demo-tester',
    name: 'Jo Whitfield',
    email: 'jo@demo.local',
    title: 'Tester / QA',
    accessRole: 'contributor',
    jobRole: 'tester',
    canAdmin: false,
    blurb: 'Much the same set as the developer, landing somewhere different — '
      + 'useful for seeing what a page policy actually changes.',
  },
  {
    id: 'demo-service',
    name: 'Chris Doyle',
    email: 'chris@demo.local',
    title: 'Service Manager',
    accessRole: 'viewer',
    jobRole: 'service-manager',
    canAdmin: false,
    blurb: 'Read-only on a real workspace: service levels, releases and known '
      + 'errors, with nothing they can save.',
  },
];

export const DEMO_ADMIN_ID = 'demo-admin';

export function findDemoAccount(id) {
  return DEMO_ACCOUNTS.find((account) => account.id === id) || null;
}

// ---------- what the demo remembers ----------

function blank() {
  return { accountId: '', members: {}, pages: null, requireSignIn: false, workflow: null };
}

let cached = null;

function read() {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cached = parsed && typeof parsed === 'object' ? { ...blank(), ...parsed } : blank();
  } catch (err) {
    console.warn('Could not read the demo workspace.', err);
    cached = blank();
  }
  // An account id this build does not have is dropped rather than carried: a
  // saved costume for a person who no longer exists would leave the app signed
  // in as nobody.
  if (cached.accountId && !findDemoAccount(cached.accountId)) cached.accountId = '';
  return cached;
}

function write(next) {
  cached = next;
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('Could not save the demo workspace.', err);
  }
}

/** The demo account currently signed in, or null. */
export function activeDemo() {
  const account = findDemoAccount(read().accountId);
  if (!account) return null;
  return { ...account, ...overrideFor(account.id), isOwner: account.accessRole === 'owner' };
}

export function isDemoSignedIn() {
  return activeDemo() !== null;
}

export function signInDemo(id) {
  const account = findDemoAccount(id);
  if (!account) return false;
  write({ ...read(), accountId: account.id });
  return true;
}

export function signOutDemo() {
  write({ ...read(), accountId: '' });
}

/**
 * Forgets the demo workspace entirely — the roster edits and the policy, not
 * just who is wearing which costume.
 */
export function resetDemo() {
  cached = null;
  try { localStorage.removeItem(DEMO_KEY); } catch (err) { /* nothing to do */ }
}

// ---------- the roster, as the admin screens see it ----------

function overrideFor(id) {
  const saved = read().members[id];
  return saved && typeof saved === 'object' ? saved : {};
}

/** Everyone, with whatever the demo administrator has since changed. */
export function demoMembers() {
  return DEMO_ACCOUNTS.map((account) => {
    const patch = overrideFor(account.id);
    return {
      userId: account.id,
      email: account.email,
      name: account.name,
      accessRole: patch.accessRole || account.accessRole,
      jobRole: patch.jobRole === undefined ? account.jobRole : patch.jobRole,
      canAdmin: patch.canAdmin === undefined ? account.canAdmin : !!patch.canAdmin,
    };
  });
}

/**
 * Applies one assignment, refusing the three things delegation must not allow.
 *
 * These are the same three the `project_members_write` policy refuses in
 * supabase/schema.sql, restated here rather than merely trusted, because the
 * point of the demo is to show how the product behaves. A demo administrator
 * who could quietly promote themselves would be demonstrating a product that
 * does not exist.
 */
export function assignDemoMember(userId, patch) {
  const me = activeDemo();
  if (!me || !(me.isOwner || me.canAdmin)) {
    throw new Error('Only an administrator can change assignments.');
  }
  const target = demoMembers().find((m) => m.userId === userId);
  if (!target) throw new Error('No such person in this workspace.');

  if (!me.isOwner) {
    if (userId === me.id) throw new Error('An administrator cannot edit their own membership.');
    if (target.accessRole === 'owner') throw new Error('An administrator cannot change the owner.');
    if (patch.accessRole === 'owner') throw new Error('Only the owner can make somebody else the owner.');
    if (patch.canAdmin) throw new Error('Only the owner can make another administrator.');
  }

  const state = read();
  const next = { ...state, members: { ...state.members, [userId]: { ...overrideFor(userId), ...patch } } };
  write(next);
}

// ---------- the policy the demo administrator sets ----------

export function demoPolicy() {
  const state = read();
  return { pages: state.pages, requireSignIn: !!state.requireSignIn, workflow: state.workflow };
}

export function saveDemoPolicy({ pages, requireSignIn, workflow }) {
  const me = activeDemo();
  if (!me || !(me.isOwner || me.canAdmin)) {
    throw new Error('Only an administrator can change page access.');
  }
  write({
    ...read(),
    pages: pages && Object.keys(pages).length ? pages : null,
    requireSignIn: !!requireSignIn,
    workflow: workflow && Object.keys(workflow).length ? workflow : null,
  });
}
