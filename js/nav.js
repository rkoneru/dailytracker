// Sidebar navigation, as a real tree.
//
// The flat list worked while there were four pages. There are now five, two
// side panels, and a Planner long enough that its own sections are worth
// jumping to — so the nav is a tree: top-level groups, pages under them, and
// the sections or views of a page as leaves.
//
// It follows the WAI-ARIA tree pattern rather than approximating it: roving
// tabindex, arrow keys to move and expand, aria-expanded on every parent. A
// tree that announces itself as a tree but doesn't answer arrow keys is worse
// than a list, so the keyboard half isn't optional.

const EXPANDED_KEY = 'projectPlannerNavExpanded_v1';

// `id` doubles as the DOM id of the row, so the ids pages already reach for
// (tab-planner, btn-projects…) are preserved and existing wiring keeps working.
export const NAV_TREE = [
  {
    id: 'group-workspace',
    label: 'Workspace',
    children: [
      { id: 'tab-dashboard', label: 'Dashboard', icon: '📊', page: 'page-dashboard', title: 'Dashboard' },
      {
        id: 'tab-planner',
        label: 'Planner',
        icon: '📝',
        page: 'page-planner',
        title: 'Planner',
        children: [
          { id: 'nav-milestones', label: 'Milestones', page: 'page-planner', title: 'Planner', section: 'sec-milestones' },
          { id: 'nav-ticks', label: 'Tick Timeline', page: 'page-planner', title: 'Planner', section: 'sec-ticks' },
          { id: 'nav-timeline', label: 'Timeline', page: 'page-planner', title: 'Planner', section: 'sec-timeline' },
          { id: 'nav-tasks', label: 'Tasks', page: 'page-planner', title: 'Planner', section: 'sec-tasks' },
          { id: 'nav-budget', label: 'Budget & Baseline', page: 'page-planner', title: 'Planner', section: 'sec-budget' },
          { id: 'nav-notes', label: 'Notes', page: 'page-planner', title: 'Planner', section: 'sec-notes' },
        ],
      },
      { id: 'tab-raid', label: 'RAID & Issues', icon: '⚠️', page: 'page-raid', title: 'RAID & Issues' },
    ],
  },
  {
    id: 'group-reporting',
    label: 'Reporting',
    children: [
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

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role' || key === 'tabindex') {
      node.setAttribute(key, value);
    } else node[key] = value;
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

function buildRow(node, level) {
  const hasChildren = !!(node.children && node.children.length);
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

  row._node = node;
  return row;
}

function buildBranch(node, level, list) {
  const li = el('li', { role: 'none' });
  const row = buildRow(node, level);
  li.appendChild(row);
  list.push(row);

  if (node.children && node.children.length) {
    const group = el('ul', { id: `${node.id}-group`, role: 'group', class: 'nav-group' });
    group.hidden = !expanded.has(node.id);
    node.children.forEach((child) => group.appendChild(buildBranch(child, level + 1, list)));
    li.appendChild(group);
  }
  return li;
}

function render() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';
  rows = [];
  const tree = el('ul', { role: 'tree', class: 'nav-tree', 'aria-label': 'Sections' });
  NAV_TREE.forEach((node) => tree.appendChild(buildBranch(node, 1, rows)));
  nav.appendChild(tree);
  refreshTabStops();
}

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
