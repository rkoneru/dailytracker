// Who is looking, and therefore what the app should put in front of them.
//
// The app grew to nine pages and twenty-odd registers, which is right for the
// engagement lead and wrong for everyone else: a tester does not open a
// stakeholder map, and a scrum master does not set service levels. Rather than
// cut the features back, each role gets a nav trimmed to the pages it uses and
// a landing page it would have clicked anyway.
//
// This is a view filter, not a permission. Nothing here is security: the data
// lives in this browser's localStorage and anyone can switch role or turn the
// filter off. Saying so plainly in the UI is better than implying a lock that
// does not exist — the real access boundary is the row level security on the
// Supabase side, which governs what a signed-in account can read and write.

const ROLE_KEY = 'projectPlannerRole_v1';
const SHOW_ALL_KEY = 'projectPlannerShowAllNav_v1';

/**
 * `nav` lists the node ids this role sees. A group is kept whenever any of its
 * children survive, so a role never has to name the groups as well.
 */
export const ROLES = [
  {
    id: 'engagement-lead',
    label: 'Engagement Lead',
    aka: 'Engagement manager, account manager, delivery lead, admin',
    blurb: 'Everything, including the commercial and governance pages.',
    // The Dashboard, not the Portfolio: this is also the role nobody has chosen
    // yet, and a first run has exactly one project — a portfolio of one is a
    // worse opening screen than the project itself.
    home: 'tab-dashboard',
    nav: null,          // null means "all of it"
  },
  {
    id: 'project-manager',
    label: 'Project Manager',
    aka: 'Delivery manager, programme manager',
    blurb: 'Plan, tasks, risks and reports, plus the change log.',
    home: 'tab-dashboard',
    nav: ['tab-mywork', 'tab-portfolio', 'tab-resources', 'tab-dashboard', 'tab-tasks', 'tab-planner', 'tab-raid',
      'tab-service', 'tab-improve', 'tab-kpis', 'tab-reports', 'btn-projects', 'tab-sync', 'tab-changelog', 'tab-trash', 'btn-export-panel'],
  },
  {
    id: 'product-manager',
    label: 'Product Manager',
    aka: 'Product owner',
    blurb: 'What is being delivered and why, plus what is landing when.',
    home: 'tab-dashboard',
    nav: ['tab-mywork', 'tab-portfolio', 'tab-resources', 'tab-dashboard', 'tab-tasks', 'tab-planner', 'tab-raid',
      'tab-service', 'tab-improve', 'tab-kpis', 'tab-reports', 'btn-projects', 'btn-export-panel'],
  },
  {
    id: 'scrum-master',
    label: 'Scrum Master',
    aka: 'Agile delivery lead, team lead',
    blurb: 'The board, the plan, what is blocking the team, and retrospectives.',
    home: 'tab-tasks',
    nav: ['tab-mywork', 'tab-dashboard', 'tab-tasks', 'tab-planner', 'tab-raid',
      'tab-improve', 'tab-kpis', 'tab-reports', 'btn-projects', 'btn-export-panel'],
  },
  {
    id: 'developer',
    label: 'Developer',
    aka: 'Engineer, architect',
    blurb: 'What is on you across every project, then what is blocked or shipping.',
    home: 'tab-mywork',
    nav: ['tab-mywork', 'tab-dashboard', 'tab-tasks', 'tab-raid', 'tab-service', 'tab-improve',
      'btn-projects', 'tab-sync', 'btn-export-panel'],
  },
  {
    id: 'tester',
    label: 'Tester / QA',
    aka: 'Test lead, quality engineer',
    blurb: 'What is assigned to you, defects, the go-live checklist and known breakage.',
    home: 'tab-mywork',
    nav: ['tab-mywork', 'tab-dashboard', 'tab-tasks', 'tab-raid', 'tab-service', 'tab-improve',
      'btn-projects', 'tab-sync', 'btn-export-panel'],
  },
  {
    id: 'service-manager',
    label: 'Service Manager',
    aka: 'Service delivery manager, operations, support lead',
    blurb: 'Service levels, releases, change control and known issues.',
    home: 'tab-service',
    nav: ['tab-mywork', 'tab-portfolio', 'tab-resources', 'tab-dashboard', 'tab-raid', 'tab-service', 'tab-improve', 'tab-kpis', 'tab-reports',
      'btn-projects', 'tab-sync', 'tab-changelog', 'btn-export-panel'],
  },
];

export const DEFAULT_ROLE = 'engagement-lead';

/**
 * The project member roles the sync side already has are about access — who may
 * write — not about what someone does. An owner is almost always the person
 * running the engagement, so their account role seeds a sensible starting
 * point; everyone else starts somewhere modest and picks their own.
 */
const SEED_FROM_MEMBER_ROLE = {
  owner: 'engagement-lead',
  editor: 'project-manager',
  contributor: 'developer',
  viewer: 'product-manager',
};

let current = null;
let showAll = null;
const listeners = new Set();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read the saved role.', err);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Could not save the role.', err);
  }
}

export function getRoleId() {
  if (current === null) current = read(ROLE_KEY, DEFAULT_ROLE);
  return ROLES.some((r) => r.id === current) ? current : DEFAULT_ROLE;
}

export function getRole() {
  return ROLES.find((r) => r.id === getRoleId()) || ROLES[0];
}

export function setRole(id) {
  if (!ROLES.some((r) => r.id === id)) return;
  current = id;
  write(ROLE_KEY, id);
  emit();
}

/** True once the person has chosen for themselves, rather than inheriting. */
export function roleWasChosen() {
  return read(ROLE_KEY, null) !== null;
}

/**
 * Seeds the role from the signed-in account's project membership, but never
 * overrides a choice the person made — an inherited default that quietly
 * replaces what someone picked is worse than no default at all.
 */
export function seedRoleFromMembership(memberRole) {
  if (roleWasChosen()) return false;
  const seeded = SEED_FROM_MEMBER_ROLE[memberRole];
  if (!seeded) return false;
  current = seeded;
  write(ROLE_KEY, seeded);
  emit();
  return true;
}

export function isShowingEverything() {
  if (showAll === null) showAll = read(SHOW_ALL_KEY, false);
  return !!showAll;
}

export function setShowEverything(value) {
  showAll = !!value;
  write(SHOW_ALL_KEY, showAll);
  emit();
}

/** Whether a nav node id is part of this role's working set. */
export function roleShows(nodeId) {
  if (isShowingEverything()) return true;
  const role = getRole();
  return role.nav === null || role.nav.includes(nodeId);
}

/** How many top-level destinations the current filter is holding back. */
export function hiddenCount(allNodeIds) {
  const role = getRole();
  if (role.nav === null) return 0;
  return allNodeIds.filter((id) => !role.nav.includes(id)).length;
}

export function onRoleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(getRole()));
}
