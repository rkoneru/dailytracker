import {
  listProjects, listTemplates, getActiveProjectId, switchProject,
  createProject, cloneProject, renameProject, deleteProject, importProjectFromJSON,
} from './state.js';
import { readJSONFile } from './export.js';
import { confirmAction, promptText, toast } from './dialog.js';
import { el } from './dom.js';

function formatUpdatedAt(ts) {
  if (!ts) return 'never';
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
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
          el('span', { class: 'hint', text: `${p.dueDate ? `Due ${p.dueDate} · ` : ''}Updated ${formatUpdatedAt(p.updatedAt)}${isActive ? ' · Current' : ''}` }),
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

  function refreshAll() {
    renderProjectList();
    refreshActiveLabel();
  }

  function open() {
    renderTemplateGrid();
    renderProjectList();
    nameInput.value = '';
    overlay.hidden = false;
    document.body.classList.remove('sidebar-open');
  }
  function close() { overlay.hidden = true; }

  document.getElementById('btn-projects').addEventListener('click', open);
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

  document.getElementById('btn-create-project').addEventListener('click', () => {
    const templateKey = templateGrid.querySelector('input[name="template"]:checked')?.value;
    const name = nameInput.value.trim();
    createProject({ name, templateKey });
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
