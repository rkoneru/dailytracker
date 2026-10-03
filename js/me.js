// Who you are, as far as this browser is concerned.
//
// The app knows plenty about who owns what — every task has an assignee and
// every register row an owner — but it never knew which of those people was
// looking at the screen, so it could not answer "what is mine?". This is that
// missing piece: a name, held on the device, matched against the names already
// written into the rows.
//
// It is deliberately not an account. Sign-in exists in Settings → Sync and governs
// what may be written; this governs what gets shown first. Someone reviewing a
// colleague's workload can set it to their colleague's name, and should be
// able to — it is a lens, not a login.

const ME_KEY = 'projectPlannerMe_v1';

let cached = null;
const listeners = new Set();

export function getMe() {
  if (cached === null) {
    try { cached = localStorage.getItem(ME_KEY) || ''; } catch { cached = ''; }
  }
  return cached;
}

export function setMe(name) {
  cached = String(name || '').trim();
  try {
    if (cached) localStorage.setItem(ME_KEY, cached);
    else localStorage.removeItem(ME_KEY);
  } catch (err) {
    console.warn('Could not remember who you are.', err);
  }
  listeners.forEach((fn) => fn(cached));
}

export function onMeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * A signed-in account is a good guess and a bad override: it fills the blank
 * on a device that has never said who it is, and otherwise leaves a stated
 * name alone.
 */
export function seedMeFrom(email, displayName) {
  if (getMe()) return false;
  const seeded = (displayName || '').trim() || String(email || '').split('@')[0].trim();
  if (!seeded) return false;
  setMe(seeded);
  return true;
}

/**
 * Names in this app are typed by people, so matching is forgiving: case and
 * surrounding space never matter, and "Priya" finds "Priya N." because that is
 * how the same person gets written down twice.
 */
export function isMine(owner, me = getMe()) {
  if (!me) return false;
  const a = String(owner || '').trim().toLowerCase();
  if (!a) return false;
  const b = me.toLowerCase();
  if (a === b) return true;
  // Only a whole leading word counts, so "Sam" does not claim "Samira".
  const boundary = (hay, needle) => hay.startsWith(needle)
    && (hay.length === needle.length || /[\s.,]/.test(hay[needle.length]));
  return boundary(a, b) || boundary(b, a);
}
