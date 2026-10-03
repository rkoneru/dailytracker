import { registerPanel } from './nav.js';
import {
  listProjects, listTemplates, templateMethodology, getActiveProjectId, switchProject,
  createProject, cloneProject, renameProject, deleteProject, importProjectFromJSON,
  listResources, allocateResource, listAllAllocations, listAbsences,
} from './state.js';
import { KEY_ROLES, rankBySkill, utilisation, skillMatch, toISO, weekStart, addDays } from './resourceModel.js';
import { readJSONFile } from './export.js';
import { confirmAction, promptText, toast } from './dialog.js';
import { el } from './dom.js';
import { formatDate } from './dates.js';
import { METHODOLOGIES } from './methodology.js';

function formatUpdatedAt(ts) {
  if (!ts) return 'never';
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDate(new Date(ts));
}

export function initProjects({ onProjectChange }) {
  const overlay = document.getElementById('projects-overlay');
  const list = document.getElementById('project-list');
  const templateGrid = document.getElementById('template-grid');
  const nameInput = document.getElementById('new-project-name');
  const importFileInput = document.getElementById('import-project-file');
  const activeLabel = document.getElementById('active-project-label');

  function refreshActiveLabel() {
    const activeId = getActiveProjectId();
    const active = listProjects().find((p) => p.id === activeId);
    activeLabel.textContent = active ? active.name : 'Project';
  }

  function renderProjectList() {
    const activeId = getActiveProjectId();
    list.innerHTML = '';
    listProjects().forEach((p) => {
      const isActive = p.id === activeId;
      list.appendChild(el('li', { class: `project-list__item${isActive ? ' is-active' : ''}`, 'data-id': p.id }, [
        el('div', { class: 'project-list__info' }, [
          el('strong', { text: p.name }),
          el('span', { class: 'hint', text: `${p.dueDate ? `Due ${formatDate(p.dueDate)} · ` : ''}Updated ${formatUpdatedAt(p.updatedAt)}${isActive ? ' · Current' : ''}` }),
        ]),
        el('div', { class: 'project-list__actions' }, [
          ...(isActive ? [] : [el('button', { type: 'button', class: 'btn btn-small', 'data-action': 'open-project', text: 'Open' })]),
          el('button', { type: 'button', class: 'btn btn-small', 'data-action': 'clone-project', text: 'Clone' }),
          el('button', { type: 'button', class: 'btn btn-small', 'data-action': 'rename-project', text: 'Rename' }),
          el('button', { type: 'button', class: 'btn btn-small btn-danger', 'data-action': 'delete-project', text: 'Delete' }),
        ]),
      ]));
    });
  }

  // ---------- The lifecycle, which every new project must have ----------
  //
  // Chosen here rather than defaulted: it decides the phases the Gantt is laid
  // out with. A template that follows one proposes it, but only until the
  // person picks for themselves — switching template must not silently undo a
  // choice they made.
  const lifecycle = document.getElementById('new-project-lifecycle');
  const lifecycleError = document.getElementById('new-project-lifecycle-error');
  let lifecycleChosen = false;

  function buildLifecycleOptions() {
    lifecycle.innerHTML = '';
    lifecycle.appendChild(el('option', { value: '', text: 'Choose a lifecycle…' }));
    [['lifecycle', 'Lifecycles — phases in order'], ['practice', 'Practices — capabilities, no order']].forEach(([kind, label]) => {
      const group = el('optgroup', { label });
      METHODOLOGIES.filter((m) => m.kind === kind).forEach((m) => group.appendChild(
        el('option', { value: m.id, text: `${m.label} — ${m.full}` })));
      lifecycle.appendChild(group);
    });
  }

  function proposeLifecycle() {
    if (lifecycleChosen) return;
    const key = templateGrid.querySelector('input[name="template"]:checked')?.value;
    lifecycle.value = key ? templateMethodology(key) : '';
  }

  function showLifecycleError(show) {
    lifecycleError.hidden = !show;
    lifecycle.setAttribute('aria-invalid', String(show));
  }

  buildLifecycleOptions();
  lifecycle.addEventListener('change', () => {
    lifecycleChosen = true;
    showLifecycleError(false);
  });
  templateGrid.addEventListener('change', proposeLifecycle);

  // Grouped by category so the list stays scannable as templates are added.
  function renderTemplateGrid() {
    templateGrid.innerHTML = '';
    const templates = listTemplates();
    const categories = [...new Set(templates.map((t) => t.category || 'Other'))];

    categories.forEach((category) => {
      templateGrid.appendChild(el('h4', { class: 'template-group', text: category }));
      const grid = el('div', { class: 'template-group__grid' });
      templates.filter((t) => (t.category || 'Other') === category).forEach((t) => {
        const inputId = `template-${t.key}`;
        grid.appendChild(el('label', { class: 'template-card', for: inputId }, [
          el('input', { type: 'radio', name: 'template', value: t.key, id: inputId, checked: t.key === templates[0].key }),
          el('span', { class: 'template-card__label', text: t.label }),
          el('span', { class: 'template-card__desc', text: t.description }),
        ]));
      });
      templateGrid.appendChild(grid);
    });
  }

  // ---------- Staffing the new project ----------
  //
  // A project with no named Engagement Manager, Project Manager or Product
  // Owner is the single most common way an engagement goes quiet, and the
  // cheapest moment to fix it is while the project is being created. These are
  // offered rather than required: a project started before anyone is assigned
  // is a real situation, and refusing to create it would just push people into
  // typing a placeholder name.

  const staffing = { skills: '', team: new Set(), roles: {} };

  function staffingWindow() {
    const start = weekStart(new Date());
    return { from: toISO(start), to: toISO(addDays(start, 83)) };
  }

  /** The pool, ranked by the skills asked for, with what each is already committed to. */
  function candidates() {
    const pool = listResources();
    const required = staffing.skills.split(',').map((x) => x.trim()).filter(Boolean);
    const ordered = required.length
      ? rankBySkill(pool, required).map((x) => x.resource)
      : pool.slice().sort((a, b) => a.name.localeCompare(b.name));
    const allocations = listAllAllocations();
    const absences = listAbsences();
    const win = staffingWindow();
    return ordered.map((resource) => ({
      resource,
      util: utilisation(resource, allocations, absences, win.from, win.to),
      match: required.length ? skillMatch(resource, required) : null,
    }));
  }

  function renderRolePickers(people) {
    const host = document.getElementById('new-project-roles');
    if (!host) return;
    host.innerHTML = '';
    KEY_ROLES.forEach((role) => {
      const select = el('select', { class: 'field-input', id: `role-pick-${role.id}`, 'data-role': role.id });
      select.appendChild(el('option', { value: '', text: 'Not assigned yet' }));
      people.forEach(({ resource, util }) => {
        select.appendChild(el('option', {
          value: resource.id,
          // The commitment is shown in the option itself: choosing someone
          // already at 100% should feel like a decision, not an accident.
          text: `${resource.name}${resource.title ? ` — ${resource.title}` : ''} (${util.allocated}% booked)`,
          selected: staffing.roles[role.id] === resource.id,
        }));
      });
      host.appendChild(el('label', { class: 'field-label field-label--block staffing__role' }, [
        document.createTextNode(role.label),
        el('span', { class: 'hint staffing__blurb', text: role.blurb }),
        select,
      ]));
    });
  }

  function renderTeamPicker(people) {
    const host = document.getElementById('new-project-team');
    if (!host) return;
    host.innerHTML = '';
    people.forEach(({ resource, util, match }) => {
      const id = `team-pick-${resource.id}`;
      const tone = util.over > 0 ? 'is-over' : util.allocated >= 85 ? 'is-full' : '';
      host.appendChild(el('li', { class: `staffing__member ${tone}` }, [
        el('input', {
          type: 'checkbox', id, value: resource.id, 'data-member': resource.id,
          checked: staffing.team.has(resource.id),
        }),
        el('label', { class: 'staffing__member-label', htmlFor: id }, [
          el('span', { class: 'staffing__name', text: resource.name || '(unnamed)' }),
          el('span', { class: 'staffing__meta', text: [resource.title, (resource.skills || []).map((sk) => sk.name).join(', ')].filter(Boolean).join(' · ') }),
        ]),
        match
          ? el('span', {
            class: `skill-match ${match.missing.length ? 'is-partial' : 'is-full'}`,
            text: match.missing.length ? `missing ${match.missing.join(', ')}` : 'covers all',
          })
          : null,
        el('span', { class: `staffing__util ${tone}`, text: `${util.allocated}%` }),
      ]));
    });
    document.getElementById('new-project-pool-empty').hidden = people.length > 0;
  }

  function renderStaffing() {
    const people = candidates();
    renderRolePickers(people);
    renderTeamPicker(people);
  }

  /** Turns the form's choices into allocations on the freshly made project. */
  function applyStaffing(projectId) {
    const win = staffingWindow();
    const done = new Set();

    KEY_ROLES.forEach((role) => {
      const resourceId = staffing.roles[role.id];
      if (!resourceId) return;
      const resource = listResources().find((r) => r.id === resourceId);
      allocateResource(projectId, {
        resourceId,
        name: resource ? resource.name : '',
        role: role.label,
        keyRole: role.id,
        percent: 20,
        from: win.from,
        to: win.to,
      });
      done.add(resourceId);
    });

    staffing.team.forEach((resourceId) => {
      // Someone picked as both a key role and a team member is one allocation,
      // not two — the key role already books them.
      if (done.has(resourceId)) return;
      const resource = listResources().find((r) => r.id === resourceId);
      allocateResource(projectId, {
        resourceId,
        name: resource ? resource.name : '',
        role: resource ? resource.title : '',
        percent: 50,
        from: win.from,
        to: win.to,
      });
    });
  }

  function refreshAll() {
    renderProjectList();
    refreshActiveLabel();
  }

  function open() {
    renderTemplateGrid();
    renderProjectList();
    nameInput.value = '';
    lifecycleChosen = false;
    showLifecycleError(false);
    proposeLifecycle();
    // Choices from the last project created are not choices about this one.
    staffing.skills = '';
    staffing.team = new Set();
    staffing.roles = {};
    document.getElementById('new-project-skills').value = '';
    renderStaffing();
    overlay.hidden = false;
    document.body.classList.remove('sidebar-open');
  }
  function close() { overlay.hidden = true; }

  // The nav row is registered by name, not bound to: the row is replaced on
  // every nav re-render. The dashboard's own button is an ordinary element
  // that stays put, so it binds directly.
  registerPanel('projects', open);
  document.getElementById('btn-projects-2').addEventListener('click', open);
  document.getElementById('btn-close-projects').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });

  list.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-id]');
    if (!item) return;
    const id = item.dataset.id;

    if (e.target.closest('[data-action="open-project"]')) {
      switchProject(id);
      refreshAll();
      onProjectChange();
      close();
    } else if (e.target.closest('[data-action="clone-project"]')) {
      cloneProject(id);
      refreshAll();
      onProjectChange();
    } else if (e.target.closest('[data-action="rename-project"]')) {
      const current = item.querySelector('strong').textContent;
      const name = await promptText({
        title: 'Rename project', label: 'Project name', value: current, confirmLabel: 'Rename',
      });
      if (name && name.trim()) {
        renameProject(id, name.trim());
        refreshAll();
        if (id === getActiveProjectId()) onProjectChange();
      }
    } else if (e.target.closest('[data-action="delete-project"]')) {
      const name = item.querySelector('strong').textContent;
      const ok = await confirmAction({
        title: `Delete "${name}"?`,
        message: 'Everything in the project goes with it — tasks, milestones, notes and RAID entries.',
        confirmLabel: 'Delete project',
        tone: 'danger',
      });
      if (ok) {
        deleteProject(id);
        refreshAll();
        onProjectChange();
        toast(`Deleted "${name}".`);
      }
    }
  });

  document.getElementById('new-project-skills').addEventListener('input', (e) => {
    staffing.skills = e.target.value;
    renderStaffing();
  });

  document.getElementById('new-project-roles').addEventListener('change', (e) => {
    const role = e.target.dataset.role;
    if (!role) return;
    staffing.roles[role] = e.target.value;
    // One person cannot hold two of the three; picking them for a second
    // clears the first rather than silently double-booking the title.
    Object.keys(staffing.roles).forEach((other) => {
      if (other !== role && staffing.roles[other] && staffing.roles[other] === e.target.value) {
        staffing.roles[other] = '';
      }
    });
    renderStaffing();
  });

  document.getElementById('new-project-team').addEventListener('change', (e) => {
    const id = e.target.dataset.member;
    if (!id) return;
    if (e.target.checked) staffing.team.add(id);
    else staffing.team.delete(id);
  });

  document.getElementById('btn-create-project').addEventListener('click', () => {
    const templateKey = templateGrid.querySelector('input[name="template"]:checked')?.value;
    const name = nameInput.value.trim();
    if (!lifecycle.value) {
      showLifecycleError(true);
      lifecycle.focus();
      return;
    }
    const project = createProject({ name, templateKey, methodology: lifecycle.value });
    applyStaffing(project.id);
    refreshAll();
    onProjectChange();
    close();
  });

  importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files[0];
    if (!file) return;
    try {
      const data = await readJSONFile(file);
      const name = file.name.replace(/\.json$/i, '');
      importProjectFromJSON(data, name);
      refreshAll();
      onProjectChange();
      close();
    } catch (err) {
      toast(err.message || 'Could not import that file.', 'error');
    } finally {
      importFileInput.value = '';
    }
  });

  refreshActiveLabel();
}
