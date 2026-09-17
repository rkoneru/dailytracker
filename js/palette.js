// The command palette: one keystroke, then everything.
//
// Ctrl-K / ⌘-K opens it, typing narrows it, Enter goes there. It searches rows
// in every project — not just the one on screen — because "which project was
// that risk in?" is exactly the question a search box should answer for you.
//
// It also lists the pages themselves, so it doubles as a way to reach a page
// without hunting through the nav. Those entries ignore the role filter on
// purpose: the filter tidies the sidebar, and someone who types the name of a
// page has plainly already found it.

import { el } from './dom.js';
import { listFullProjects, getActiveProjectId } from './state.js';
import { buildIndex, searchIndex, highlightParts } from './search.js';
import { NAV_TREE } from './nav.js';

let overlay = null;
let input = null;
let list = null;
let hintEl = null;
let index = [];
let results = [];
let cursor = 0;
let onGo = null;
let previouslyFocused = null;

/**
 * Pages and their tabs, flattened out of the nav tree so the palette cannot
 * list a destination that no longer exists.
 */
function pageEntries() {
  const out = [];
  const walk = (nodes, trail) => {
    nodes.forEach((node) => {
      if (node.page || node.panel) {
        out.push({
          title: node.label,
          subtitle: trail.join(' › ') || 'Go to',
          // A leaf that names a section or a report is a tab within a page,
          // not a page: calling both "Page" makes the list read as if the app
          // had thirty of them.
          kind: (node.section || node.report) ? 'Section' : 'Page',
          navId: node.id,
          projectId: '',
          projectName: '',
          rowId: '',
          isPage: true,
          haystack: `${node.label} ${trail.join(' ')}`.toLowerCase(),
        });
      }
      if (node.children) walk(node.children, [...trail, node.label]);
    });
  };
  walk(NAV_TREE, []);
  return out;
}

function highlighted(text, query, cls) {
  const span = el('span', { class: cls });
  highlightParts(text, query).forEach((part) => {
    span.appendChild(part.match ? el('mark', { text: part.text }) : document.createTextNode(part.text));
  });
  return span;
}

function renderResults() {
  const query = input.value.trim();
  list.innerHTML = '';

  if (!query) {
    hintEl.hidden = false;
    hintEl.textContent = `Search ${index.length} rows across every project — tasks, milestones, risks, deliverables, `
      + 'releases, lessons. Or type a page name to go there.';
    return;
  }

  hintEl.hidden = results.length > 0;
  if (!results.length) {
    hintEl.textContent = `Nothing matches “${query}”.`;
    return;
  }

  const activeId = getActiveProjectId();
  results.forEach((entry, i) => {
    const where = entry.isPage ? entry.subtitle
      : entry.projectId === activeId ? entry.subtitle
        : [entry.subtitle, entry.projectName].filter(Boolean).join(' · ');

    list.appendChild(el('li', {
      class: `palette__item ${i === cursor ? 'is-cursor' : ''}`,
      role: 'option',
      id: `palette-opt-${i}`,
      'aria-selected': i === cursor ? 'true' : 'false',
      'data-index': String(i),
    }, [
      el('span', { class: 'palette__kind', text: entry.kind }),
      el('span', { class: 'palette__text' }, [
        highlighted(entry.title, query, 'palette__title'),
        el('span', { class: 'palette__meta', text: where }),
      ]),
      // Only worth saying when it is somewhere else — repeating the project
      // you are already in on every row is noise.
      entry.projectId && entry.projectId !== activeId
        ? el('span', { class: 'palette__project', text: entry.projectName || 'Other project' })
        : null,
    ]));
  });

  input.setAttribute('aria-activedescendant', `palette-opt-${cursor}`);
}

function recompute() {
  const query = input.value.trim();
  results = query
    ? [...searchIndex(index, query, { activeProjectId: getActiveProjectId(), limit: 24 }),
      ...pageEntries().filter((p) => query.toLowerCase().split(/\s+/).every((t) => p.haystack.includes(t)))]
    : [];
  cursor = 0;
  renderResults();
}

function move(delta) {
  if (!results.length) return;
  cursor = (cursor + delta + results.length) % results.length;
  renderResults();
  list.querySelector('.is-cursor')?.scrollIntoView({ block: 'nearest' });
}

function choose(i = cursor) {
  const entry = results[i];
  if (!entry) return;
  close();
  onGo(entry);
}

export function isOpen() {
  return overlay && !overlay.hidden;
}

export function open(seed = '') {
  if (isOpen()) return;
  previouslyFocused = document.activeElement;
  // Rebuilt on open rather than cached: an index that is one edit out of date
  // would send someone to a row that no longer says what they searched for.
  index = buildIndex(listFullProjects());
  overlay.hidden = false;
  input.value = seed;
  recompute();
  input.focus();
  input.select();
}

export function close() {
  if (!isOpen()) return;
  overlay.hidden = true;
  input.value = '';
  results = [];
  if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
}

/**
 * `go` receives the chosen entry and does the navigating — the palette has no
 * business knowing how to switch project or reveal a row, and app.js already
 * owns both.
 */
export function initPalette(go) {
  onGo = go;
  overlay = document.getElementById('palette-overlay');
  input = document.getElementById('palette-input');
  list = document.getElementById('palette-results');
  hintEl = document.getElementById('palette-hint');
  if (!overlay) return;

  input.addEventListener('input', recompute);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.palette__item');
    if (item) choose(Number(item.dataset.index));
  });

  // Clicking the backdrop closes; clicking the box itself must not.
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  document.getElementById('btn-palette')?.addEventListener('click', () => open());

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      isOpen() ? close() : open();
      return;
    }
    // "/" is the other convention, but only when it would not otherwise be
    // typed into something — this app is mostly input fields.
    if (e.key === '/' && !isOpen()) {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (!typing) { e.preventDefault(); open(); }
    }
  });
}
