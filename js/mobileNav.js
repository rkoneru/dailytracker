// The bottom bar, on a phone.
//
// The sidebar is the right nav for a desktop and the wrong one for a phone.
// Folded into a drawer it is still the whole tree — five groups, twenty-odd
// destinations — behind a hamburger in the top-left corner, which is the
// hardest place on a phone to reach and the least likely to be tapped. So the
// four destinations somebody actually uses come out of the drawer and sit
// along the bottom, where a thumb already is, and the drawer keeps everything
// else behind a fifth button that says so.
//
// Which four is not a fixed list, because it cannot be: a tester and a service
// manager do not open the same screens, and an administrator may have taken
// some of them away entirely. So the bar asks the same question the sidebar
// asks — `roleShows` — and fills its slots from a preference order with
// whatever survives. A role with fewer than four visible destinations gets a
// shorter bar rather than a padded one.
//
// Labels and icons are read from NAV_TREE rather than written again here. Two
// lists of the same names drift, and the one on the bottom bar would be the
// copy nobody remembered to update.

import { NAV_TREE } from './nav.js';
import { roleShows, onRoleChange } from './roles.js';
import { onPolicyChange } from './policy.js';
import { onIdentityChange } from './identity.js';
import { el } from './dom.js';

/**
 * The order destinations are offered in, best first.
 *
 * "Best" means what a person on a phone came to do: see what is on them, see
 * where the project stands, work the task list. The planning and governance
 * screens are real work on a laptop and reference material on a phone, so they
 * rank below and stay in the drawer for most roles.
 */
const PREFERRED = [
  'tab-mywork',
  'tab-dashboard',
  'tab-tasks',
  'tab-raid',
  // Above the planning screens on purpose: for a service manager these are
  // slots three and four, and their home page belongs in the bar rather than
  // behind More.
  'tab-service',
  'tab-planner',
  'tab-portfolio',
  'tab-meetings',
  'tab-kpis',
  'tab-reports',
  'tab-resources',
  'tab-settings',
];

/**
 * Shorter labels, for the ones that do not fit in a fifth of a phone.
 *
 * A truncated label is worse than a shorter one: "Risks & Issu…" is longer to
 * read and tells you less than "Risks". Only the names that actually overflow
 * are listed, so the sidebar's wording stays the wording everywhere it fits.
 */
const SHORT = {
  'tab-raid': 'Risks',
  'tab-service': 'Service',
};

const SLOTS = 4;

let goTo = null;
let activeId = '';

/** Every navigable node, flattened, so a preference list can look one up. */
function index() {
  const found = new Map();
  const walk = (nodes) => nodes.forEach((node) => {
    if (node.page) found.set(node.id, node);
    if (node.children) walk(node.children);
  });
  walk(NAV_TREE);
  return found;
}

function chosen() {
  const nodes = index();
  return PREFERRED
    .filter((id) => nodes.has(id) && roleShows(id))
    .slice(0, SLOTS)
    .map((id) => nodes.get(id));
}

function tab({ id, icon, label }) {
  return el('button', {
    type: 'button',
    class: `mobile-tab${id === activeId ? ' is-active' : ''}`,
    'data-nav': id,
    'aria-current': id === activeId ? 'page' : 'false',
  }, [
    el('span', { class: 'mobile-tab__icon', 'aria-hidden': 'true', text: icon || '•' }),
    el('span', { class: 'mobile-tab__label', text: SHORT[id] || label }),
  ]);
}

export function renderMobileNav() {
  const bar = document.getElementById('mobile-tabs');
  if (!bar) return;
  bar.innerHTML = '';
  chosen().forEach((node) => bar.appendChild(tab(node)));
  // Always last, and always present: it is the way to everything the four
  // slots could not hold, and a bar whose final button moved about would be
  // worse than one destination fewer.
  bar.appendChild(el('button', {
    type: 'button',
    class: 'mobile-tab',
    'data-more': 'true',
    'aria-label': 'More sections',
  }, [
    el('span', { class: 'mobile-tab__icon', 'aria-hidden': 'true', text: '☰' }),
    el('span', { class: 'mobile-tab__label', text: 'More' }),
  ]));
}

/**
 * Marks the destination now on screen.
 *
 * Called for every navigation, including ones the bar did not cause, so a jump
 * from the drawer or from a link leaves the bar agreeing with the page. A page
 * with no slot leaves nothing marked, which is honest: none of these four is
 * where you are.
 */
export function setMobileActive(navId) {
  activeId = navId || '';
  const bar = document.getElementById('mobile-tabs');
  if (!bar) return;
  bar.querySelectorAll('[data-nav]').forEach((node) => {
    const on = node.dataset.nav === activeId;
    node.classList.toggle('is-active', on);
    node.setAttribute('aria-current', on ? 'page' : 'false');
  });
}

export function initMobileNav(handler) {
  goTo = handler;
  const bar = document.getElementById('mobile-tabs');
  if (!bar) return;

  bar.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.more) {
      document.body.classList.toggle('sidebar-open');
      return;
    }
    // Opening a destination closes the drawer if it was open: arriving
    // somewhere with the menu still over the top of it is the standard
    // mobile-web annoyance and costs a second tap every time.
    document.body.classList.remove('sidebar-open');
    if (goTo) goTo({ navId: button.dataset.nav });
  });

  const redraw = () => { renderMobileNav(); setMobileActive(activeId); };
  onRoleChange(redraw);
  onPolicyChange(redraw);
  onIdentityChange(redraw);
  renderMobileNav();
}
