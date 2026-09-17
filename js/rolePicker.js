// The "I'm working as" control in the sidebar.
//
// It sits immediately above the nav it filters, and it says out loud what it
// is doing — a page that has simply vanished reads as a missing feature, so
// the count of hidden pages and the way to get them back are both on screen.

import { el } from './dom.js';
import {
  ROLES, getRole, getRoleId, setRole, onRoleChange,
  isShowingEverything, setShowEverything, roleShows,
  roleIsAssigned, canShowEverything,
} from './roles.js';
import { renderNav, NAV_TREE } from './nav.js';

function describe(role) {
  return role.aka ? `${role.blurb} Also: ${role.aka.toLowerCase()}.` : role.blurb;
}

function renderBlurb() {
  const blurb = document.getElementById('role-blurb');
  if (blurb) blurb.textContent = describe(getRole());
}

/**
 * Landing on a page the new role cannot see would be a dead end: the nav row
 * that got you there is gone, so there is no way back except the role picker
 * you just used. Move to the role's own home instead.
 */
function goHomeIfStranded(activePageId) {
  if (!activePageId) return;
  const node = NAV_TREE.flatMap(function flat(n) {
    return [n, ...(n.children || []).flatMap(flat)];
  }).find((n) => n.page === activePageId);
  if (node && roleShows(node.id)) return;
  document.getElementById(getRole().home)?.click();
}

/**
 * Reflects who is deciding.
 *
 * When an administrator has assigned the role, the picker becomes a label:
 * disabled, marked as assigned, and with the "show every page" escape hatch
 * withdrawn. None of that is what enforces the assignment — the server is, and
 * it re-states the assignment on every load. This only stops the control from
 * claiming a choice the person does not have.
 */
function renderAssignment() {
  const select = document.getElementById('role-select');
  const assigned = roleIsAssigned();
  const note = document.getElementById('role-assigned');
  const showAllRow = document.getElementById('role-show-all-row');

  select.disabled = assigned;
  if (note) note.hidden = !assigned;
  if (showAllRow) showAllRow.hidden = !canShowEverything();
}

export function initRolePicker() {
  const select = document.getElementById('role-select');
  if (!select) return;

  ROLES.forEach((role) => {
    select.appendChild(el('option', { value: role.id, text: role.label }));
  });
  select.value = getRoleId();
  renderBlurb();
  renderAssignment();

  const showAll = document.getElementById('role-show-all');
  showAll.checked = isShowingEverything();

  select.addEventListener('change', (e) => {
    // Refused while assigned, so put the control back to what is true rather
    // than leaving it showing a role nobody granted.
    if (!setRole(e.target.value)) select.value = getRoleId();
  });
  showAll.addEventListener('change', (e) => setShowEverything(e.target.checked));

  onRoleChange(() => {
    select.value = getRoleId();
    showAll.checked = isShowingEverything();
    renderBlurb();
    renderAssignment();
    const active = document.querySelector('.page.is-active')?.id;
    renderNav();
    goHomeIfStranded(active);
  });
}
