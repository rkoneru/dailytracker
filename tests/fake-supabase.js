// A stand-in for the subset of Supabase this app uses: GoTrue's user endpoint
// and PostgREST select/upsert on the two sync tables. Enough to drive the real
// client and the real engine over a real network hop.
const http = require('http');

const db = { projects: new Map(), project_rows: new Map() };
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
    if (url.pathname === '/__reset') { db.projects.clear(); db.project_rows.clear(); return send(res, 200, {}); }
    if (url.pathname === '/__dump') {
      return send(res, 200, { projects: [...db.projects.values()], rows: [...db.project_rows.values()], requests });
    }

    const table = url.pathname.replace('/rest/v1/', '');
    const store = db[table];
    if (!store) return send(res, 404, { message: `no table ${table}` });

    if (req.method === 'GET') return send(res, 200, [...store.values()]);
    if (req.method === 'POST') {
      (Array.isArray(json) ? json : [json]).forEach((row) => {
        store.set(row.id, { ...(store.get(row.id) || {}), ...row });
      });
      return send(res, 201, []);
    }
    return send(res, 405, { message: 'not implemented' });
  });
});

server.listen(8767, () => console.log('fake supabase on 8767'));
