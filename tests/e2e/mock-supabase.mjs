// Local transport fixture only. This does NOT test PostgreSQL RLS.
// No production credentials or remote database access.
import http from 'node:http';
const id = '11111111-1111-4111-8111-111111111111';
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  let role = 'user';
  try { role = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).test_role ?? 'user'; } catch {}
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Range', '0-0/0');
  if (url.pathname === '/health') return res.end('{}');
  if (url.pathname === '/auth/v1/user') {
    if (!token.includes('.')) { res.statusCode = 401; return res.end('{"message":"No session"}'); }
    return res.end(JSON.stringify({id, aud:'authenticated', role:'authenticated', email:'preview@example.invalid', user_metadata:{full_name:'Preview User'}, app_metadata:{}, created_at:'2026-01-01T00:00:00Z'}));
  }
  if (url.pathname === '/rest/v1/profiles') return res.end(JSON.stringify({role}));
  if (req.method !== 'GET' && req.method !== 'POST') { res.statusCode = 405; return res.end('{}'); }
  res.end('[]');
}).listen(54329, '127.0.0.1', () => console.log('Local fixture listening on 54329'));
