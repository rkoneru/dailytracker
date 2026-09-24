import { el } from './dom.js';

// In-page tabs, so a page is one thing at a time.
//
// The app grew by adding cards to pages. Service & Support ended up five
// registers tall, Resources five, the Planner four — and the nav's answer to
// "take me to Releases" was to land you at the top and smooth-scroll you past
// four tables you didn't ask for. That scroll is most of what made the app feel
// clumsy: every page was a pile, and the pile got taller with every feature.
//
// Nothing is removed here. Each pile becomes a strip of tabs across the top of
// the page, and the nav leaf that used to scroll now selects. The sections are
// the same sections, in the same order, built by the same code — this module
// only decides which one of them is on screen.
//
// Printing and exporting ignore the tabs entirely (see the print rules in
// styles.css): a status report that quietly dropped four of five registers
// because of a UI affordance would be a data-loss bug wearing a nice hat.

const KEY = 'projectPlannerPageTab_v1';

/**
 * Which sections each page holds, in the order they appear.
 *
 * `id` is what the nav and the router name, so it doubles as the section's
 * element id when `sections` is left out. `sections` exists for the two cases
 * where one tab covers more than one card — Availability and the bench list
 * answer the same question, and so do the Legend and the reading tips.
 */
export const PAGE_TABS = {
  'page-planner': [
    { id: 'sec-milestones', label: 'Milestones', sections: ['sec-method', 'sec-milestones'] },
    { id: 'sec-ticks', label: 'Edit Timeline' },
    { id: 'sec-budget', label: 'Budget & Baseline' },
    { id: 'sec-notes', label: 'Notes' },
  ],
  'page-tasks': [
    { id: 'sec-task-list', label: 'Task List' },
    { id: 'sec-task-board', label: 'Priority Board' },
    { id: 'sec-task-help', label: 'Legend & Tips' },
  ],
  'page-raid': [
    { id: 'sec-raid-log', label: 'Risks & Issues' },
    { id: 'sec-dependencies', label: 'Dependencies' },
  ],
  'page-scope': [
    { id: 'sec-charter', label: 'Charter' },
    { id: 'sec-deliverables', label: 'Deliverables' },
    { id: 'sec-change-requests', label: 'Change Requests' },
  ],
  'page-people': [
    { id: 'sec-roster', label: 'Team Roster' },
    { id: 'sec-raci', label: 'Who Does What' },
    { id: 'sec-stakeholders', label: 'Stakeholders' },
    { id: 'sec-comms', label: 'Communications' },
  ],
  'page-service': [
    { id: 'sec-service-levels', label: 'Service Levels' },
    { id: 'sec-sac', label: 'Go-Live Checklist' },
    { id: 'sec-releases', label: 'Releases' },
    { id: 'sec-changes', label: 'Change Control' },
    { id: 'sec-known-errors', label: 'Known Issues' },
  ],
  'page-improve': [
    { id: 'sec-csi', label: 'Improvements' },
    { id: 'sec-lessons', label: 'Lessons Learned' },
  ],
  // The tabs are in the order a meeting happens in: prepare, discuss, follow
  // up. A page whose tabs follow the work needs no explaining.
  'page-meetings': [
    { id: 'sec-meeting-overview', label: 'Overview' },
    { id: 'sec-meeting-agenda', label: 'Agenda' },
    { id: 'sec-meeting-attendees', label: 'Attendees' },
    { id: 'sec-meeting-notes', label: 'Discussion Notes' },
    { id: 'sec-meeting-decisions', label: 'Decisions' },
    { id: 'sec-meeting-actions', label: 'Action Items' },
    { id: 'sec-meeting-followups', label: 'Follow-up' },
    { id: 'sec-meeting-transcript', label: 'Recording & Transcript' },
  ],
  'page-settings': [
    { id: 'sec-settings-account', label: 'Account' },
    { id: 'sec-settings-workspace', label: 'Workspace' },
    { id: 'sec-settings-people', label: 'People & Roles' },
    { id: 'sec-settings-pages', label: 'Page Access' },
    { id: 'sec-settings-workflow', label: 'Task Execution' },
    { id: 'sec-settings-security', label: 'Security' },
    { id: 'sec-settings-data', label: 'Data' },
  ],
  'page-kpis': [
    { id: 'sec-kpi-schedule', label: 'Schedule' },
    { id: 'sec-kpi-cost', label: 'Cost' },
    { id: 'sec-kpi-scope', label: 'Scope & Change' },
    { id: 'sec-kpi-risk', label: 'Risk & Issue' },
    { id: 'sec-kpi-quality', label: 'Quality & Resource' },
    { id: 'sec-kpi-improvement', label: 'Improvement' },
    { id: 'sec-kpi-basis', label: 'How These Work' },
    { id: 'sec-kpi-framework', label: 'PM Framework' },
  ],
  'page-resources': [
    { id: 'sec-people', label: 'People' },
    { id: 'sec-allocations', label: 'Allocations' },
    { id: 'sec-availability', label: 'Availability', sections: ['sec-availability'] },
    { id: 'sec-timesheets', label: 'Timesheets' },
    { id: 'sec-conflicts', label: 'Worth Looking At' },
  ],
};

let chosen = null;

// Counts live here as well as on the buttons, because the strip is rebuilt
// when a page's tab set changes and a count is written by whatever rendered
// the section — usually long before, or long after, that rebuild.
const counts = new Map();

function readChosen() {
  if (chosen) return chosen;
  try {
    const raw = localStorage.getItem(KEY);
    chosen = raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Could not read the saved tab.', err);
    chosen = {};
  }
  return chosen;
}

function remember(pageId, tabId) {
  readChosen()[pageId] = tabId;
  try {
    localStorage.setItem(KEY, JSON.stringify(chosen));
  } catch (err) {
    console.warn('Could not save the tab.', err);
  }
}

/** The block directly under `host` that contains `node`. */
function topLevel(host, node) {
  let current = node;
  while (current && current.parentElement && current.parentElement !== host) {
    current = current.parentElement;
  }
  return current && current.parentElement === host ? current : null;
}

function sectionsOf(tab) {
  return (tab.sections || [tab.id])
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

/** The tab a section belongs to, so a link to a row can open the right one. */
export function tabHolding(pageId, sectionId) {
  const tabs = PAGE_TABS[pageId] || [];
  return tabs.find((tab) => (tab.sections || [tab.id]).includes(sectionId)) || null;
}

/**
 * Which tab, on which page, contains this element — used by the router when it
 * is about to scroll to a row that a tab is currently hiding. Reading it off
 * the DOM rather than a lookup table means a register that moves page cannot
 * leave a stale mapping behind.
 */
export function locate(node) {
  const page = node && node.closest('.page');
  if (!page || !PAGE_TABS[page.id]) return null;
  const tabs = PAGE_TABS[page.id];
  for (const tab of tabs) {
    if (sectionsOf(tab).some((section) => section.contains(node))) {
      return { pageId: page.id, tabId: tab.id };
    }
  }
  return null;
}

// ---------- rendering ----------

function present(pageId) {
  // Register cards are built at render time, so a tab whose section has not
  // been mounted yet is skipped rather than rendered as a dead button.
  return (PAGE_TABS[pageId] || []).filter((tab) => sectionsOf(tab).length > 0);
}

function apply(pageId, tabId) {
  const tabs = present(pageId);
  tabs.forEach((tab) => {
    const on = tab.id === tabId;
    sectionsOf(tab).forEach((section) => {
      section.classList.toggle('is-tab-hidden', !on);
      section.setAttribute('role', 'tabpanel');
      section.setAttribute('aria-labelledby', `tab-${tab.id}`);
    });
    const button = document.getElementById(`tab-${tab.id}`);
    if (button) {
      button.setAttribute('aria-selected', String(on));
      button.setAttribute('tabindex', on ? '0' : '-1');
      button.classList.toggle('is-active', on);
    }
  });
}

/**
 * Picks the tab to open: the one asked for, else the one last used here, else
 * the first. A remembered tab whose section has since disappeared falls back
 * rather than leaving the page blank.
 */
function resolve(pageId, wanted) {
  const tabs = present(pageId);
  if (!tabs.length) return null;
  const ids = tabs.map((t) => t.id);
  if (wanted && ids.includes(wanted)) return wanted;
  const saved = readChosen()[pageId];
  if (saved && ids.includes(saved)) return saved;
  return ids[0];
}

function onKeyDown(e) {
  const button = e.target.closest('.page-tab');
  if (!button) return;
  const strip = button.parentElement;
  const buttons = [...strip.querySelectorAll('.page-tab')];
  const index = buttons.indexOf(button);
  let next = null;
  if (e.key === 'ArrowRight') next = buttons[(index + 1) % buttons.length];
  else if (e.key === 'ArrowLeft') next = buttons[(index - 1 + buttons.length) % buttons.length];
  else if (e.key === 'Home') next = buttons[0];
  else if (e.key === 'End') next = buttons[buttons.length - 1];
  else return;
  e.preventDefault();
  next.focus();
  next.click();
}

/**
 * Builds (or rebuilds) the strip for a page and shows one tab. Safe to call on
 * every arrival: register pages remount their cards, so the strip has to be
 * able to catch up with sections that did not exist last time.
 */
export function mountTabs(pageId, wanted) {
  const page = document.getElementById(pageId);
  if (!page || !PAGE_TABS[pageId]) return null;
  const tabs = present(pageId);

  const host = page.querySelector('.print-page') || page;
  let strip = host.querySelector(':scope > .page-tabs');

  // One section is not a choice. Drop the strip and leave the page as it was,
  // so a register page that is still loading never shows a single dead tab.
  if (tabs.length < 2) {
    if (strip) strip.remove();
    (PAGE_TABS[pageId] || []).forEach((tab) => {
      sectionsOf(tab).forEach((section) => section.classList.remove('is-tab-hidden'));
    });
    return null;
  }

  // The strip goes in front of the first section — but register cards live
  // inside a host div of their own, so what the strip is actually inserted
  // before is that div, the first section's own top-level block.
  const anchor = topLevel(host, sectionsOf(tabs[0])[0]);
  if (!strip) {
    strip = el('div', { class: 'page-tabs no-print', role: 'tablist', 'aria-label': 'Sections' });
    strip.addEventListener('keydown', onKeyDown);
  }
  // A remount can insert new blocks above the strip, so it is repositioned on
  // every pass rather than only when it is first built.
  if (anchor && strip.nextElementSibling !== anchor) host.insertBefore(strip, anchor);

  // Rebuilt only when the set of tabs actually changed. Arriving at a page is
  // not a reason to throw away buttons that are already correct — and the
  // counts written on them since the last visit would go with them.
  const signature = tabs.map((tab) => tab.id).join('|');
  if (strip.dataset.tabs !== signature) {
    strip.dataset.tabs = signature;
    strip.innerHTML = '';
    tabs.forEach((tab) => {
      const button = el('button', {
        type: 'button',
        class: 'page-tab',
        id: `tab-${tab.id}`,
        role: 'tab',
        tabindex: '-1',
        'aria-selected': 'false',
        'aria-controls': (tab.sections || [tab.id]).join(' '),
        text: tab.label,
      });
      button.addEventListener('click', () => showSection(pageId, tab.id));
      strip.appendChild(button);
    });
    tabs.forEach((tab) => applyCount(tab.id));
  }

  const active = resolve(pageId, wanted);
  apply(pageId, active);
  return active;
}

/** Selects a tab by the section it holds, and remembers it for next time. */
export function showSection(pageId, sectionId, { remember: save = true } = {}) {
  const tab = tabHolding(pageId, sectionId);
  const id = tab ? tab.id : sectionId;
  const active = resolve(pageId, id);
  if (!active) return false;
  apply(pageId, active);
  if (save) remember(pageId, active);
  return true;
}

function applyCount(sectionId) {
  const button = document.getElementById(`tab-${sectionId}`);
  if (!button) return;
  const value = counts.get(sectionId);
  const existing = button.querySelector('.page-tab__count');
  if (value === undefined) {
    if (existing) existing.remove();
    return;
  }
  const badge = existing || el('span', { class: 'page-tab__count' });
  badge.textContent = String(value);
  if (!existing) button.appendChild(badge);
}

/** Counts for the tab strip, e.g. "Releases 3". Empty values clear the badge. */
export function setTabCount(sectionId, value) {
  if (value === '' || value === null || value === undefined) counts.delete(sectionId);
  else counts.set(sectionId, value);
  applyCount(sectionId);
}
