// Meeting audio, kept on this device.
//
// localStorage holds strings and a few megabytes; an hour of audio is more
// than that on its own. IndexedDB holds blobs and is what the browser offers
// for exactly this. It is deliberately not synced: recordings are large, they
// are the most sensitive thing a meeting produces, and the workspace database
// has no business receiving everyone's audio because one person pressed
// record. The page says so beside every recording, and says that clearing the
// browser's site data deletes them.

const DB = 'projectPlannerAudio_v1';
const STORE = 'recordings';

let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser has no storage for audio.')); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('meetingId', 'meetingId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  opening.catch(() => { opening = null; });
  return opening;
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('The browser refused to save the audio (storage may be full).'));
  }));
}

export function saveRecording(record) {
  return run('readwrite', (store) => store.put(record));
}

/** A meeting's recordings, oldest first. */
export function listRecordings(meetingId) {
  return run('readonly', (store) => store.index('meetingId').getAll(meetingId))
    .then((rows) => (rows || []).sort((a, b) => a.createdAt - b.createdAt));
}

export function deleteRecording(id) {
  return run('readwrite', (store) => store.delete(id));
}
