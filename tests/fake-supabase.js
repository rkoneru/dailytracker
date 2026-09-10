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
};
let requests = 0;

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
    if (url.pathname === '/auth/v1/user') {
      return send(res, 200, { id: '00000000-0000-4000-8000-000000000001', email: 'tester@x.test' });
    }
    if (url.pathname === '/__reset') {
      Object.values(db).forEach((store) => store.clear());
      return send(res, 200, {});
    }
    // Lets a test stand up an account without a mail round trip.
    if (url.pathname === '/__seed') {
      (json.profiles || []).forEach((p) => db.profiles.set(p.id, p));
      (json.members || []).forEach((m) => db.project_members.set(`${m.project_id}:${m.user_id}`, { ...m, id: `${m.project_id}:${m.user_id}` }));
      return send(res, 200, {});
    }
    if (url.pathname === '/__dump') {
      return send(res, 200, {
        projects: [...db.projects.values()],
        rows: [...db.project_rows.values()],
        members: [...db.project_members.values()],
        invites: [...db.project_invites.values()],
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
    if (req.method === 'POST') {
      (Array.isArray(json) ? json : [json]).forEach((row) => {
        // Composite keys, for the tables whose primary key is not `id`.
        const key = row.id || `${row.project_id}:${row.user_id || row.email}`;
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
