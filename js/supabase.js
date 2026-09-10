// A small hand-rolled Supabase client.
//
// The official SDK is ~120KB gzipped once auth, postgrest and realtime are
// pulled in — more than triples this app's payload for a feature most people
// won't switch on. Supabase is PostgREST and GoTrue over plain HTTP, so the
// parts this app needs fit in a couple of hundred lines of fetch with no
// dependency and no build step.
//
// Credentials live in localStorage, never in the repo: the project URL and
// anon key are per-install and the anon key is publishable by design (row
// level security is what protects the data — see supabase/schema.sql).

const CONFIG_KEY = 'projectPlannerSupabaseConfig_v1';
const SESSION_KEY = 'projectPlannerSupabaseSession_v1';

let config = null;
let session = null;

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn(`Could not read ${key}.`, err);
    return null;
  }
}

function writeJSON(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`Could not save ${key}.`, err);
    return false;
  }
}

// ---------- configuration ----------

export function getConfig() {
  if (config === null) config = readJSON(CONFIG_KEY);
  return config;
}

export function isConfigured() {
  const c = getConfig();
  return !!(c && c.url && c.anonKey);
}

export function setConfig(url, anonKey) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+/.test(trimmed)) {
    throw new Error('That does not look like a Supabase project URL (it should start with https://).');
  }
  if (!String(anonKey || '').trim()) throw new Error('The anon key is required.');
  config = { url: trimmed, anonKey: String(anonKey).trim() };
  writeJSON(CONFIG_KEY, config);
  return config;
}

export function clearConfig() {
  config = null;
  session = null;
  writeJSON(CONFIG_KEY, null);
  writeJSON(SESSION_KEY, null);
}

// ---------- session ----------

export function getSession() {
  if (session === null) session = readJSON(SESSION_KEY);
  return session;
}

export function getUser() {
  const s = getSession();
  return s && s.user ? s.user : null;
}

function storeSession(next) {
  // GoTrue returns expires_in (seconds); turn it into an absolute deadline so
  // a session restored from storage days later is correctly seen as stale.
  session = next
    ? { ...next, expires_at: next.expires_at || Math.floor(Date.now() / 1000) + (next.expires_in || 3600) }
    : null;
  writeJSON(SESSION_KEY, session);
  return session;
}

async function request(path, { method = 'GET', headers = {}, body, auth = true } = {}) {
  const c = getConfig();
  if (!c) throw new Error('Sync is not configured yet.');

  const finalHeaders = { apikey: c.anonKey, 'Content-Type': 'application/json', ...headers };
  if (auth) {
    const token = await accessToken();
    finalHeaders.Authorization = `Bearer ${token || c.anonKey}`;
  }

  const response = await fetch(`${c.url}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const message = (payload && (payload.error_description || payload.message || payload.msg || payload.error))
      || `${response.status} ${response.statusText}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return payload;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return text; }
}

/** Returns a valid access token, refreshing it first if it's about to expire. */
async function accessToken() {
  const s = getSession();
  if (!s) return null;
  const secondsLeft = (s.expires_at || 0) - Math.floor(Date.now() / 1000);
  if (secondsLeft > 60) return s.access_token;
  if (!s.refresh_token) return s.access_token;

  try {
    const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      auth: false,
      body: { refresh_token: s.refresh_token },
    });
    return storeSession(refreshed).access_token;
  } catch (err) {
    // Refresh token rejected (revoked, or expired while the app was closed).
    console.warn('Could not refresh the sync session; signing out.', err);
    storeSession(null);
    return null;
  }
}

// ---------- auth ----------

/**
 * Sends a magic link. No passwords to store, and nothing for this app to get
 * wrong — the link lands in the inbox and returns to `redirectTo` carrying the
 * tokens in the URL fragment.
 */
export async function sendMagicLink(email, redirectTo) {
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
  await request(`/auth/v1/otp${query}`, {
    method: 'POST',
    auth: false,
    body: { email, create_user: true },
  });
}

/**
 * Consumes the `#access_token=...` fragment GoTrue appends when the magic link
 * returns, then scrubs it from the address bar so the tokens aren't left in
 * history or leaked by a copied URL.
 */
export async function consumeAuthRedirect() {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessTokenValue = params.get('access_token');
  if (!accessTokenValue) return null;

  storeSession({
    access_token: accessTokenValue,
    refresh_token: params.get('refresh_token'),
    expires_in: Number(params.get('expires_in')) || 3600,
  });
  history.replaceState(null, '', location.pathname + location.search);

  try {
    const user = await request('/auth/v1/user');
    storeSession({ ...getSession(), user });
  } catch (err) {
    console.warn('Signed in, but could not load the account details.', err);
  }
  return getSession();
}

export async function signOut() {
  try {
    if (getSession()) await request('/auth/v1/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Sign-out call failed; clearing the local session anyway.', err);
  }
  storeSession(null);
}

// ---------- PostgREST ----------

export async function select(table, query = '') {
  return request(`/rest/v1/${table}${query ? `?${query}` : ''}`) || [];
}

/**
 * Upsert. `onConflict` names the primary key so a repeat push updates instead
 * of failing, which is what makes a retried sync safe.
 */
export async function upsert(table, rows, onConflict = 'id') {
  if (!rows || rows.length === 0) return [];
  return request(`/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: rows,
  }) || [];
}

export async function remove(table, filter) {
  return request(`/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

/** `in` filter helper — PostgREST wants in.(a,b,c) with quoted values. */
export function inList(values) {
  return `in.(${values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')})`;
}
