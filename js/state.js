import { sampleData } from './sampleData.js';

const STORAGE_KEY = 'projectPlannerData_v1';
const SAVE_DEBOUNCE_MS = 400;

let state = null;
let saveTimer = null;
const saveStatusListeners = new Set();

function clone(obj) {
  return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

function readFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to read saved data, falling back to sample data.', err);
    return null;
  }
}

function writeToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('Failed to save data locally (storage full or unavailable).', err);
    return false;
  }
}

export function getState() {
  if (!state) {
    state = readFromStorage() || clone(sampleData);
  }
  return state;
}

export function onSaveStatusChange(listener) {
  saveStatusListeners.add(listener);
  return () => saveStatusListeners.delete(listener);
}

function emitSaveStatus(status) {
  saveStatusListeners.forEach((fn) => fn(status));
}

// Call after any mutation to the state object. Debounces the actual
// localStorage write so rapid edits (typing, dragging) don't thrash it.
export function scheduleSave() {
  emitSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeToStorage(getState());
    emitSaveStatus('saved');
  }, SAVE_DEBOUNCE_MS);
}

export function saveImmediately() {
  clearTimeout(saveTimer);
  writeToStorage(getState());
  emitSaveStatus('saved');
}

export function resetToSampleData() {
  clearTimeout(saveTimer);
  state = clone(sampleData);
  writeToStorage(state);
  emitSaveStatus('saved');
  return state;
}

// Dot-path helpers so a single input can bind to nested fields
// (e.g. "pending.decisions") without every caller writing its own walk.
export function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, key) => acc[key], obj);
  target[last] = value;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
