// A stand-in for the subset of Supabase this app uses: GoTrue's user endpoint
// and PostgREST select/upsert on the two sync tables. Enough to drive the real
// client and the real engine over a real network hop.
const http = require('http');

const db = {
  projects: new Map(),
  project_rows: new Map(),
  project_members: new Map(),
  project_invites: new Map(),
  profiles: new Map(),
  workspace_policy: new Map(),
};
let requests = 0;

// GoTrue's own settings, which the app's setup check reads to explain why a
// magic link might never arrive. A test flips these to stand up each failure.
let authSettings = { disable_signup: false, mailer_autoconfirm: false };

function send(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  requests += 1;
  const url = new URL(req.url, 'http://x');
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = body ? JSON.parse(body) : null;

    if (url.pathname === '/auth/v1/otp') return send(res, 200, {});
    if (url.pathname === '/auth/v1/settings') return send(res, 200, authSettings);
    // Lets a test reproduce the "accepted but never delivered" configurations.
    if (url.pathname === '/__auth-settings') {
      authSettings = { ...authSettings, ...(json || {}) };
      return send(res, 200, authSettings);
    }
    if (url.pathname === '/auth/v1/user') {
      return send(res, 200, { id: '00000000-0000-4000-8000-000000000001', email: 'tester@x.test' });
    }
    if (url.pathname === '/__reset') {
      Object.values(db).forEach((store) => store.clear());
      authSettings = { disable_signup: false, mailer_autoconfirm: false };
      return send(res, 200, {});
    }
    // Lets a test stand up an account without a mail round trip.
    if (url.pathname === '/__seed') {
      (json.profiles || []).forEach((p) => db.profiles.set(p.id, p));
      (json.members || []).forEach((m) => db.project_members.set(`${m.project_id}:${m.user_id}`, { ...m, id: `${m.project_id}:${m.user_id}` }));
      (json.policies || []).forEach((p) => db.workspace_policy.set(p.project_id, { ...p, id: p.project_id }));
      (json.projects || []).forEach((p) => db.projects.set(p.id, p));
      (json.rows || []).forEach((r) => db.project_rows.set(r.id, r));
      return send(res, 200, {});
    }
    if (url.pathname === '/__dump') {
      return send(res, 200, {
        projects: [...db.projects.values()],
        rows: [...db.project_rows.values()],
        members: [...db.project_members.values()],
        invites: [...db.project_invites.values()],
        policies: [...db.workspace_policy.values()],
        requests,
      });
    }

    const table = url.pathname.replace('/rest/v1/', '');
    const store = db[table];
    if (!store) return send(res, 404, { message: `no table ${table}` });

    if (req.method === 'GET') {
      // Just enough PostgREST: eq. filters and in.(...) on any column, which
      // is all the client uses. Nothing here enforces RLS — the policies are
      // tested against a real Postgres, and this stands in for the wire.
      let rows = [...store.values()];
      url.searchParams.forEach((raw, key) => {
        if (key === 'select' || key === 'on_conflict' || key === 'order') return;
        if (raw.startsWith('eq.')) {
          const want = decodeURIComponent(raw.slice(3));
          rows = rows.filter((r) => String(r[key]) === want);
        } else if (raw.startsWith('in.(')) {
          const wanted = raw.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''));
          rows = rows.filter((r) => wanted.includes(String(r[key])));
        }
      });
      return send(res, 200, rows);
    }

    if (req.method === 'DELETE') {
      let matched = [...store.entries()];
      url.searchParams.forEach((raw, key) => {
        if (!raw.startsWith('eq.')) return;
        const want = decodeURIComponent(raw.slice(3));
        matched = matched.filter(([, r]) => String(r[key]) === want);
      });
      matched.forEach(([k]) => store.delete(k));
      return send(res, 204);
    }
    // PATCH, for the admin screens. Like the GET filters, this enforces
    // nothing: what a real server would refuse is proved in tests/test-rls.js
    // against Postgres, and this only has to carry the request faithfully.
    if (req.method === 'PATCH') {
      let matched = [...store.entries()];
      url.searchParams.forEach((raw, key) => {
        if (!raw.startsWith('eq.')) return;
        const want = decodeURIComponent(raw.slice(3));
        matched = matched.filter(([, r]) => String(r[key]) === want);
      });
      matched.forEach(([k, row]) => store.set(k, { ...row, ...json }));
      return send(res, 204);
    }

    if (req.method === 'POST') {
      (Array.isArray(json) ? json : [json]).forEach((row) => {
        // Composite keys, for the tables whose primary key is not `id`.
        const key = table === 'workspace_policy'
          ? row.project_id
          : (row.id || `${row.project_id}:${row.user_id || row.email}`);
        const stored = { ...(store.get(key) || {}), ...row };
        if (!stored.id) stored.id = key;
        store.set(key, stored);
      });
      return send(res, 201, []);
    }
    return send(res, 405, { message: 'not implemented' });
  });
});

server.listen(8767, () => console.log('fake supabase on 8767'));
