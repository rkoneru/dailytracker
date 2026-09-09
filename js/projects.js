import {
  listProjects, listTemplates, getActiveProjectId, switchProject,
  createProject, cloneProject, renameProject, deleteProject, importProjectFromJSON,
} from './state.js';
import { readJSONFile } from './export.js';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('data-')) node.setAttribute(key, value);
    else node[key] = value;
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

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

  function renderTemplateGrid() {
    templateGrid.innerHTML = '';
    listTemplates().forEach((t, i) => {
      const inputId = `template-${t.key}`;
      const input = el('input', { type: 'radio', name: 'template', value: t.key, id: inputId, checked: i === 0 });
      templateGrid.appendChild(el('label', { class: 'template-card', for: inputId }, [
        input,
        el('span', { class: 'template-card__label', text: t.label }),
        el('span', { class: 'template-card__desc', text: t.description }),
      ]));
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
  }
  function close() { overlay.hidden = true; }

  document.getElementById('btn-projects').addEventListener('click', open);
  document.getElementById('btn-close-projects').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });

  list.addEventListener('click', (e) => {
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
      const name = window.prompt('Rename project:', current);
      if (name && name.trim()) {
        renameProject(id, name.trim());
        refreshAll();
        if (id === getActiveProjectId()) onProjectChange();
      }
    } else if (e.target.closest('[data-action="delete-project"]')) {
      const name = item.querySelector('strong').textContent;
      if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
        deleteProject(id);
        refreshAll();
        onProjectChange();
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
      window.alert(err.message || 'Could not import that file.');
    } finally {
      importFileInput.value = '';
    }
  });

  refreshActiveLabel();
}
