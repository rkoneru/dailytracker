// Deep links, so anything in the app can be sent to someone.
//
// Until now the app had one URL. You could not say "look at DEP-03" without
// also saying which project, which page, and how to scroll — which meant the
// answer to every question was a screenshot. A collaboration tool whose
// contents cannot be linked to is a single-player tool.
//
// The route lives in the hash rather than the path because the app is a static
// PWA with no build step and no server of its own: a hash route works on
// GitHub Pages, on a file:// copy and behind any host, with no rewrite rules to
// forget. The cost is an ugly `#`, which is the right trade for "works
// wherever you put it".
//
//   #/tab-raid                        the page, in whatever project is open
//   #/tab-raid/<projectId>            the page, in a named project
//   #/tab-raid/<projectId>/<rowId>    …scrolled to a row, and highlighted
//
// Nav node ids double as route names, so the route vocabulary is the same list
// the sidebar is built from and cannot drift from it.

const listeners = new Set();

// Set while we are the ones writing the hash. Without it, every navigation
// would echo back through hashchange and re-navigate on top of itself.
let writing = false;

export function parseRoute(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  if (!raw) return null;
  const [navId, projectId, rowId] = raw.split('/').map(decodeURIComponent);
  if (!navId) return null;
  return { navId, projectId: projectId || '', rowId: rowId || '' };
}

export function buildRoute({ navId, projectId = '', rowId = '' }) {
  const parts = [navId];
  // A row is meaningless without the project it belongs to, so a row link
  // always carries one.
  if (projectId || rowId) parts.push(projectId);
  if (rowId) parts.push(rowId);
  return `#/${parts.map(encodeURIComponent).join('/')}`;
}

/**
 * Writes the route without re-entering navigation.
 *
 * Page changes push, so Back walks the pages someone actually visited. A row
 * link replaces, because scrolling to a row is not a separate destination and
 * ten Backs to escape one page would be worse than none.
 */
export function setRoute(parts, { replace = false } = {}) {
  const next = buildRoute(parts);
  if (next === window.location.hash) return;
  writing = true;
  try {
    if (replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
  } catch (err) {
    // Some embedded contexts refuse history writes; the app still works, it
    // just stops being linkable.
    console.warn('Could not update the address bar.', err);
  }
  writing = false;
}

export function currentUrl(parts) {
  return `${window.location.origin}${window.location.pathname}${buildRoute(parts)}`;
}

export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initRouter() {
  window.addEventListener('hashchange', () => {
    if (writing) return;
    const route = parseRoute();
    if (route) listeners.forEach((fn) => fn(route));
  });
  // Back and forward past a pushState land here rather than on hashchange in
  // some browsers, so both are honoured.
  window.addEventListener('popstate', () => {
    if (writing) return;
    const route = parseRoute();
    if (route) listeners.forEach((fn) => fn(route));
  });
  return parseRoute();
}

// ---------- Landing on a row ----------

const HIGHLIGHT_MS = 2600;

/**
 * Scrolls to the row a link names and marks it, because "the page it is on" is
 * not an answer when the page holds sixty rows. The mark fades on its own: a
 * highlight that outstays the moment becomes part of the furniture.
 */
export function revealRow(rowId) {
  if (!rowId) return false;
  const row = document.querySelector(`[data-id="${CSS.escape(rowId)}"]`);
  if (!row) return false;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.add('is-linked');
  setTimeout(() => row.classList.remove('is-linked'), HIGHLIGHT_MS);
  return true;
}
