import { el } from './dom.js';
import { roleShows, getRole, isShowingEverything } from './roles.js';

// Sidebar navigation, as a real tree, filtered to the role that is looking.
//
// The flat list worked while there were four pages. There are now fifteen, two
// side panels, and pages long enough that their own sections are worth jumping
// to — so the nav is a tree: top-level groups, pages under them, and the tabs
// of a page as leaves. Every leaf is a real destination: a page's sections are
// tabs now (see tabs.js), so a leaf selects one rather than scrolling to it.
//
// It follows the WAI-ARIA tree pattern rather than approximating it: roving
// tabindex, arrow keys to move and expand, aria-expanded on every parent. A
// tree that announces itself as a tree but doesn't answer arrow keys is worse
// than a list, so the keyboard half isn't optional.

const EXPANDED_KEY = 'projectPlannerNavExpanded_v1';

// `id` doubles as the DOM id of the row, so the ids pages already reach for
// (tab-planner, btn-projects…) are preserved and existing wiring keeps working.
export const NAV_TREE = [
  // Five groups, named for what you would be doing rather than for a department:
  // everything, then planning it, then running it, then telling people about it,
  // then the housekeeping. Each page's tabs hang off it as leaves, so the nav is
  // a map of every surface in the app and nothing is more than two clicks away.
  {
    id: 'group-across',
    label: 'Across Projects',
    children: [
      { id: 'tab-mywork', label: 'My Work', icon: '🎯', page: 'page-mywork', title: 'My Work' },
      { id: 'tab-portfolio', label: 'Portfolio', icon: '🗂', page: 'page-portfolio', title: 'Portfolio' },
      {
        id: 'tab-resources',
        label: 'Resources',
        icon: '👥',
        page: 'page-resources',
        title: 'Resources',
        children: [
          { id: 'nav-pool', label: 'People', page: 'page-resources', title: 'Resources', section: 'sec-people' },
          { id: 'nav-allocations', label: 'Allocations', page: 'page-resources', title: 'Resources', section: 'sec-allocations' },
          { id: 'nav-availability', label: 'Availability', page: 'page-resources', title: 'Resources', section: 'sec-availability' },
          { id: 'nav-timesheets', label: 'Timesheets', page: 'page-resources', title: 'Resources', section: 'sec-timesheets' },
          { id: 'nav-conflicts', label: 'Worth Looking At', page: 'page-resources', title: 'Resources', section: 'sec-conflicts' },
        ],
      },
    ],
  },
  {
    id: 'group-plan',
    label: 'Plan & Build',
    children: [
      { id: 'tab-dashboard', label: 'Dashboard', icon: '📊', page: 'page-dashboard', title: 'Dashboard' },
      {
        id: 'tab-tasks',
        label: 'Tasks',
        icon: '✅',
        page: 'page-tasks',
        title: 'Tasks',
        children: [
          { id: 'nav-task-list', label: 'Task List', page: 'page-tasks', title: 'Tasks', section: 'sec-task-list' },
          { id: 'nav-task-board', label: 'Priority Board', page: 'page-tasks', title: 'Tasks', section: 'sec-task-board' },
          { id: 'nav-task-help', label: 'Legend & Tips', page: 'page-tasks', title: 'Tasks', section: 'sec-task-help' },
        ],
      },
      {
        id: 'tab-planner',
        label: 'Plan',
        icon: '📝',
        page: 'page-planner',
        title: 'Plan',
        children: [
          { id: 'nav-milestones', label: 'Milestones', page: 'page-planner', title: 'Plan', section: 'sec-milestones' },
          { id: 'nav-ticks', label: 'Tick Timeline', page: 'page-planner', title: 'Plan', section: 'sec-ticks' },
          { id: 'nav-budget', label: 'Budget & Baseline', page: 'page-planner', title: 'Plan', section: 'sec-budget' },
          { id: 'nav-notes', label: 'Notes', page: 'page-planner', title: 'Plan', section: 'sec-notes' },
        ],
      },
      {
        id: 'tab-scope',
        label: 'Scope & Contract',
        icon: '🤝',
        page: 'page-scope',
        title: 'Scope & Contract',
        children: [
          { id: 'nav-charter', label: 'Charter', page: 'page-scope', title: 'Scope & Contract', section: 'sec-charter' },
          { id: 'nav-deliverables', label: 'Deliverables', page: 'page-scope', title: 'Scope & Contract', section: 'sec-deliverables' },
          { id: 'nav-change-requests', label: 'Change Requests', page: 'page-scope', title: 'Scope & Contract', section: 'sec-change-requests' },
        ],
      },
    ],
  },
  {
    id: 'group-run',
    label: 'Run & Support',
    children: [
      {
        id: 'tab-raid',
        label: 'Risks & Issues',
        icon: '⚠️',
        page: 'page-raid',
        title: 'Risks, Issues & Dependencies',
        children: [
          { id: 'nav-raid-log', label: 'RAID Log', page: 'page-raid', title: 'Risks, Issues & Dependencies', section: 'sec-raid-log' },
          { id: 'nav-dependencies', label: 'Dependencies', page: 'page-raid', title: 'Risks, Issues & Dependencies', section: 'sec-dependencies' },
        ],
      },
      {
        id: 'tab-service',
        label: 'Service & Support',
        icon: '🛠',
        page: 'page-service',
        title: 'Service & Support',
        children: [
          { id: 'nav-service-levels', label: 'Service Levels', page: 'page-service', title: 'Service & Support', section: 'sec-service-levels' },
          { id: 'nav-sac', label: 'Go-Live Checklist', page: 'page-service', title: 'Service & Support', section: 'sec-sac' },
          { id: 'nav-releases', label: 'Releases', page: 'page-service', title: 'Service & Support', section: 'sec-releases' },
          { id: 'nav-changes', label: 'Change Control', page: 'page-service', title: 'Service & Support', section: 'sec-changes' },
          { id: 'nav-known-errors', label: 'Known Issues', page: 'page-service', title: 'Service & Support', section: 'sec-known-errors' },
        ],
      },
      {
        id: 'tab-improve',
        label: 'Improvement & Lessons',
        icon: '💡',
        page: 'page-improve',
        title: 'Improvement & Lessons',
        children: [
          { id: 'nav-csi', label: 'Improvements', page: 'page-improve', title: 'Improvement & Lessons', section: 'sec-csi' },
          { id: 'nav-lessons', label: 'Lessons Learned', page: 'page-improve', title: 'Improvement & Lessons', section: 'sec-lessons' },
        ],
      },
    ],
  },
  {
    // What the numbers say, the pack that says it, and who gets told. The
    // stakeholder map and the communications plan belong here for the same
    // reason the reports do: they all answer "who needs telling what".
    id: 'group-share',
    label: 'Report & Share',
    children: [
      {
        id: 'tab-meetings',
        label: 'Meetings',
        icon: '🗒',
        page: 'page-meetings',
        title: 'Meetings',
        children: [
          { id: 'nav-meeting-overview', label: 'Overview', page: 'page-meetings', title: 'Meetings', section: 'sec-meeting-overview' },
          { id: 'nav-meeting-agenda', label: 'Agenda', page: 'page-meetings', title: 'Meetings', section: 'sec-meeting-agenda' },
          { id: 'nav-meeting-attendees', label: 'Attendees', page: 'page-meetings', title: 'Meetings', section: 'sec-meeting-attendees' },
          { id: 'nav-meeting-notes', label: 'Discussion Notes', page: 'page-meetings', title: 'Meetings', section: 'sec-meeting-notes' },
          { id: 'nav-meeting-decisions', label: 'Decisions', page: 'page-meetings', title: 'Meetings', section: 'sec-meeting-decisions' },
          { id: 'nav-meeting-actions', label: 'Action Items', page: 'page-meetings', title: 'Meetings', section: 'sec-meeting-actions' },
          { id: 'nav-meeting-followups', label: 'Follow-up', page: 'page-meetings', title: 'Meetings', section: 'sec-meeting-followups' },
          { id: 'nav-meeting-transcript', label: 'Recording & Transcript', page: 'page-meetings', title: 'Meetings', section: 'sec-meeting-transcript' },
        ],
      },
      {
        id: 'tab-kpis',
        label: 'KPIs',
        icon: '📐',
        page: 'page-kpis',
        title: 'Project KPIs',
        children: [
          { id: 'nav-kpi-schedule', label: 'Schedule', page: 'page-kpis', title: 'Project KPIs', section: 'sec-kpi-schedule' },
          { id: 'nav-kpi-cost', label: 'Cost', page: 'page-kpis', title: 'Project KPIs', section: 'sec-kpi-cost' },
          { id: 'nav-kpi-scope', label: 'Scope & Change', page: 'page-kpis', title: 'Project KPIs', section: 'sec-kpi-scope' },
          { id: 'nav-kpi-risk', label: 'Risk & Issue', page: 'page-kpis', title: 'Project KPIs', section: 'sec-kpi-risk' },
          { id: 'nav-kpi-quality', label: 'Quality & Resource', page: 'page-kpis', title: 'Project KPIs', section: 'sec-kpi-quality' },
          { id: 'nav-kpi-basis', label: 'How These Work', page: 'page-kpis', title: 'Project KPIs', section: 'sec-kpi-basis' },
        ],
      },
      {
        id: 'tab-people',
        label: 'People & Stakeholders',
        icon: '👥',
        page: 'page-people',
        title: 'People & Stakeholders',
        children: [
          { id: 'nav-roster', label: 'Team Roster', page: 'page-people', title: 'People & Stakeholders', section: 'sec-roster' },
          { id: 'nav-raci', label: 'Who Does What', page: 'page-people', title: 'People & Stakeholders', section: 'sec-raci' },
          { id: 'nav-stakeholders', label: 'Stakeholders', page: 'page-people', title: 'People & Stakeholders', section: 'sec-stakeholders' },
          { id: 'nav-comms', label: 'Communications', page: 'page-people', title: 'People & Stakeholders', section: 'sec-comms' },
        ],
      },
      {
        id: 'tab-reports',
        label: 'Reports',
        icon: '📈',
        page: 'page-reports',
        title: 'Reports',
        children: [
          { id: 'nav-report-daily', label: 'Daily', page: 'page-reports', title: 'Reports', report: 'daily' },
          { id: 'nav-report-weekly', label: 'Weekly', page: 'page-reports', title: 'Reports', report: 'weekly' },
          { id: 'nav-report-steerco', label: 'SteerCo', page: 'page-reports', title: 'Reports', report: 'steerco' },
          { id: 'nav-report-exec', label: 'Executive', page: 'page-reports', title: 'Reports', report: 'executive' },
        ],
      },
    ],
  },
  {
    id: 'group-manage',
    label: 'Manage',
    children: [
      { id: 'btn-projects', label: 'Projects', icon: '📁', panel: 'projects' },
      { id: 'tab-sync', label: 'Sync & Team', icon: '🔄', page: 'page-sync', title: 'Sync & Team' },
      { id: 'tab-changelog', label: 'Change Log', icon: '🕓', page: 'page-changelog', title: 'Change Log' },
      { id: 'tab-trash', label: 'Trash', icon: '🗑', page: 'page-trash', title: 'Trash', badge: 'trash-count' },
      { id: 'btn-export-panel', label: 'Export / Share', icon: '📤', panel: 'export' },
    ],
  },
];

let onActivate = null;
let expanded = null;
let rows = [];            // every rendered row, in document order

// ---------- expansion state ----------

function defaultExpanded() {
  // Groups open, pages closed: the top level is the map, and a page's own
  // sections are detail you ask for.
  return new Set(NAV_TREE.map((node) => node.id));
}

function readExpanded() {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return raw ? new Set(JSON.parse(raw)) : defaultExpanded();
  } catch (err) {
    console.warn('Could not read the saved nav state.', err);
    return defaultExpanded();
  }
}

function saveExpanded() {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  } catch (err) {
    console.warn('Could not save the nav state.', err);
  }
}

// ---------- rendering ----------

function buildRow(node, level) {
  const hasChildren = (node.children || []).some(visible);
  const isGroup = !node.page && !node.panel;

  const row = el('div', {
    id: node.id,
    class: `nav-row${isGroup ? ' nav-row--group' : ''}${level > 2 ? ' nav-row--leaf' : ''}`,
    role: 'treeitem',
    tabindex: '-1',
    'aria-level': String(level),
  });
  if (hasChildren) {
    row.setAttribute('aria-expanded', String(expanded.has(node.id)));
    // The child list is a sibling in the DOM, not a descendant, so the
    // treeitem has to claim it explicitly — otherwise aria-expanded refers to
    // nothing and assistive tech sees a flat list of items.
    row.setAttribute('aria-owns', `${node.id}-group`);
  }

  row.appendChild(el('span', {
    class: `nav-twisty${hasChildren ? '' : ' is-empty'}`,
    'aria-hidden': 'true',
    text: hasChildren ? '▸' : '',
  }));
  if (node.icon) row.appendChild(el('span', { class: 'nav-row__icon', 'aria-hidden': 'true', text: node.icon }));
  row.appendChild(el('span', { class: 'nav-row__label', text: node.label }));
  if (node.badge) row.appendChild(el('span', { id: node.badge, class: 'nav-row__badge', hidden: true }));

  row._node = node;
  return row;
}

/**
 * A destination survives the role filter if the role names it. A group has no
 * page of its own, so it survives on behalf of its children — which is why a
 * role only ever has to list the pages it wants, never the groups.
 *
 * Sections within a page are never filtered: if you can reach the page you can
 * reach all of it, and hiding half a page's own contents would be confusing
 * rather than simplifying.
 */
function visible(node) {
  const isDestination = !!(node.page || node.panel);
  if (isDestination) return roleShows(node.id);
  return (node.children || []).some(visible);
}

function buildBranch(node, level, list) {
  const li = el('li', { role: 'none' });
  const row = buildRow(node, level);
  li.appendChild(row);
  list.push(row);

  const children = (node.children || []).filter(visible);
  if (children.length) {
    const group = el('ul', { id: `${node.id}-group`, role: 'group', class: 'nav-group' });
    group.hidden = !expanded.has(node.id);
    children.forEach((child) => group.appendChild(buildBranch(child, level + 1, list)));
    li.appendChild(group);
  }
  return li;
}

/**
 * The one line that tells you the nav is filtered. Without it, a page that is
 * simply absent reads as a missing feature rather than a hidden one.
 */
function renderFilterNote() {
  const note = document.getElementById('nav-filter-note');
  if (!note) return;
  const hidden = [];
  const walk = (node) => {
    if (node.page || node.panel) { if (!roleShows(node.id)) hidden.push(node.label); return; }
    (node.children || []).forEach(walk);
  };
  NAV_TREE.forEach(walk);

  if (isShowingEverything() || hidden.length === 0) {
    note.hidden = true;
    return;
  }
  note.hidden = false;
  note.textContent = `${hidden.length} more ${hidden.length === 1 ? 'page' : 'pages'} hidden for ${getRole().label}`;
}

export function renderNav() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';
  rows = [];
  const tree = el('ul', { role: 'tree', class: 'nav-tree', 'aria-label': 'Sections' });
  NAV_TREE.filter(visible).forEach((node) => tree.appendChild(buildBranch(node, 1, rows)));
  nav.appendChild(tree);
  renderFilterNote();
  refreshTabStops();
}

const render = renderNav;

/** Rows inside a collapsed parent are skipped by the keyboard and by tabbing. */
function visibleRows() {
  return rows.filter((row) => row.offsetParent !== null || !row.closest('[hidden]'));
}

/**
 * Exactly one row is tabbable at a time. Whoever holds focus keeps it — an
 * expand or collapse mid-keyboard-navigation must not hand the tab stop back
 * to the active row and lose the user's place.
 */
function refreshTabStops() {
  const visible = visibleRows();
  const focused = rows.find((row) => row === document.activeElement);
  const current = focused
    || visible.find((row) => row.classList.contains('is-active'))
    || visible[0];
  rows.forEach((row) => row.setAttribute('tabindex', row === current ? '0' : '-1'));
}

// ---------- expansion ----------

function setExpanded(row, open) {
  const node = row._node;
  if (!node.children || !node.children.length) return;
  if (open) expanded.add(node.id);
  else expanded.delete(node.id);
  row.setAttribute('aria-expanded', String(open));
  const group = row.parentElement.querySelector(':scope > .nav-group');
  if (group) group.hidden = !open;
  saveExpanded();
  refreshTabStops();
}

function toggle(row) {
  setExpanded(row, row.getAttribute('aria-expanded') !== 'true');
}

// ---------- selection ----------

/**
 * Marks one row current and opens every ancestor so it is actually on screen.
 * Called by the app after a page change, including changes the nav didn't
 * cause (a button elsewhere, restoring state on boot).
 */
export function setActiveNode(id) {
  rows.forEach((row) => {
    const active = row.id === id;
    row.classList.toggle('is-active', active);
    if (active) row.setAttribute('aria-current', 'page');
    else row.removeAttribute('aria-current');
  });

  const row = rows.find((r) => r.id === id);
  if (row) {
    let parentGroup = row.closest('.nav-group');
    while (parentGroup) {
      const parentRow = parentGroup.parentElement.querySelector(':scope > .nav-row');
      if (parentRow) setExpanded(parentRow, true);
      parentGroup = parentGroup.parentElement.closest('.nav-group');
    }
  }
  refreshTabStops();
}

function activate(row) {
  const node = row._node;
  const isGroup = !node.page && !node.panel;

  // A group heading has nothing behind it, so clicking it opens or closes it.
  if (isGroup) { toggle(row); return; }

  // Opening a page reveals what's inside it. Activating never collapses —
  // use the twisty for that — so clicking the page you're already on doesn't
  // hide the section you were aiming for.
  if (node.children && node.children.length) setExpanded(row, true);

  if (onActivate) onActivate(node);
}

// ---------- keyboard (WAI-ARIA tree) ----------

function focusRow(row) {
  if (!row) return;
  rows.forEach((r) => r.setAttribute('tabindex', r === row ? '0' : '-1'));
  row.focus();
}

function onKeyDown(e) {
  const row = e.target.closest('.nav-row');
  if (!row) return;
  const visible = visibleRows();
  const index = visible.indexOf(row);
  const hasChildren = row.hasAttribute('aria-expanded');
  const isOpen = row.getAttribute('aria-expanded') === 'true';

  switch (e.key) {
    case 'ArrowDown': focusRow(visible[index + 1]); break;
    case 'ArrowUp': focusRow(visible[index - 1]); break;
    case 'ArrowRight':
      if (hasChildren && !isOpen) setExpanded(row, true);
      else if (hasChildren) focusRow(visibleRows()[index + 1]);
      else return;
      break;
    case 'ArrowLeft':
      if (hasChildren && isOpen) setExpanded(row, false);
      else {
        const parentGroup = row.closest('.nav-group');
        const parentRow = parentGroup && parentGroup.parentElement.querySelector(':scope > .nav-row');
        if (parentRow) focusRow(parentRow);
        else return;
      }
      break;
    case 'Home': focusRow(visible[0]); break;
    case 'End': focusRow(visible[visible.length - 1]); break;
    case 'Enter':
    case ' ':
      // Panel rows are opened by listeners their own modules put on these ids,
      // which only fire on click. These used to be <button>s, where the
      // browser synthesised that click for us; a div[role=treeitem] doesn't,
      // so without this the panels are mouse-only.
      if (row._node.panel) row.click();
      else activate(row);
      break;
    default: return;
  }
  e.preventDefault();
}

// ---------- boot ----------

export function initNav({ onActivate: handler }) {
  onActivate = handler;
  expanded = readExpanded();
  render();

  const nav = document.getElementById('sidebar-nav');
  nav.addEventListener('click', (e) => {
    const row = e.target.closest('.nav-row');
    if (!row) return;
    // The twisty expands without navigating, so you can look inside a page
    // you aren't on.
    if (e.target.closest('.nav-twisty') && row.hasAttribute('aria-expanded')) {
      toggle(row);
      return;
    }
    activate(row);
  });
  nav.addEventListener('keydown', onKeyDown);
}
