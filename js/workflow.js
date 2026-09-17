import { defaultWorkflow, sanitiseWorkflow } from './playbook.js';

// The execution workflow in force for this project.
//
// Same shape and same reasoning as the page policy next door: an administrator
// decides it, it arrives with the sync, and it is cached so the app opens
// correctly offline. It lives in workspace_policy alongside the page policy
// because that table is already admin-write-only and the policy is proven
// against a real Postgres in tests/test-rls.js.
//
// Worth being clear about what kind of thing this is, because it is not the
// same kind as the page policy. Page access is about what somebody may reach.
// This is a working agreement: which of the seven steps this team walks, which
// methods they use, what their WIP limit is. Nobody is kept out of anything by
// it, and an unconfigured project simply gets the whole map.

const CACHE_KEY = 'projectPlannerWorkflow_v1';

let workflow = null;
let source = 'default';
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Could not read the cached workflow.', err);
    return null;
  }
}

function write(value) {
  try {
    if (value) localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    else localStorage.removeItem(CACHE_KEY);
  } catch (err) {
    console.warn('Could not cache the workflow.', err);
  }
}

export function getWorkflow() {
  if (workflow === null) {
    const cached = read();
    workflow = cached ? sanitiseWorkflow(cached) : defaultWorkflow();
    source = cached ? 'workspace' : 'default';
  }
  return workflow;
}

/** True when an administrator configured this, rather than it being the default. */
export function isConfigured() {
  getWorkflow();
  return source === 'workspace';
}

export function setWorkflow(raw) {
  workflow = sanitiseWorkflow(raw);
  source = 'workspace';
  write(workflow);
  emit();
  return workflow;
}

export function clearWorkflow() {
  workflow = defaultWorkflow();
  source = 'default';
  write(null);
  emit();
}

export function onWorkflowChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(getWorkflow()));
}
