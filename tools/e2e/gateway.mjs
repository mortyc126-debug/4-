// Мини-Supabase для сквозного стенда (см. шапку up.sh):
//   /auth/v1/*      — анонимный вход (signup/token/user) с настоящими JWT;
//   /rest/v1/*      — в PostgREST; не-JWT ключ клиента (sb_publishable_…)
//                     подменяется анонимным JWT, как это делает Supabase;
//   /functions/v1/* — настоящие supabase/functions/<имя>/index.js под Node:
//                     импорт supabase-js с esm.sh заменяется на npm-пакет,
//                     Deno.serve/Deno.env — заглушки;
//   /__log          — последние ответы функций (кроме опроса и тикера).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';
const REPO = process.env.REPO;   // корень репозитория — передаёт up.sh
if (!REPO) throw new Error('REPO не задан: запускайте стенд через tools/e2e/up.sh');
const SECRET = 'local-test-secret-local-test-secret-0123456789';
const PORT = 54321, URL_SELF = `http://localhost:${PORT}`;
const sign = (claims) => jwt.sign({ aud: 'authenticated', ...claims }, SECRET, { expiresIn: '6h' });
const ANON = sign({ role: 'anon' }), SERVICE = sign({ role: 'service_role' });
const db = new pg.Pool({ host: 'localhost', port: 5499, user: 'postgres', database: 'game' });
const ENV = { SUPABASE_URL: URL_SELF, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE };
const handlers = {}; let loading = null;
globalThis.Deno = { serve(h) { handlers[loading] = h; }, env: { get: (k) => ENV[k] ?? process.env[k] } };
const log = []; globalThis.__fnLog = log;
async function fnHandler(name) {
  if (handlers[name]) return handlers[name];
  const src = fs.readFileSync(`${REPO}/supabase/functions/${name}/index.js`, 'utf8')
    .replace(/from\s+["']https:\/\/esm\.sh\/@supabase\/supabase-js@2["']/g, 'from "@supabase/supabase-js"');
  fs.mkdirSync(new URL('./fn', import.meta.url).pathname, { recursive: true });
  const f = new URL(`./fn/${name}.mjs`, import.meta.url).pathname; fs.writeFileSync(f, src);
  loading = name; await import(f + '?v=' + Date.now()); loading = null;
  return handlers[name];
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Expose-Headers': '*' };
const body = (req) => new Promise((res) => { const ch = []; req.on('data', (c) => ch.push(c)); req.on('end', () => res(Buffer.concat(ch))); });
const isJwt = (t) => { try { jwt.verify(t, SECRET); return true; } catch { return false; } };
const send = (res, code, obj, extra = {}) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json', ...extra }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
const refresh = new Map();
async function session(uid) {
  const access_token = sign({ sub: uid, role: 'authenticated', is_anonymous: true });
  const refresh_token = crypto.randomBytes(16).toString('hex'); refresh.set(refresh_token, uid);
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token, token_type: 'bearer', expires_in: 21600, expires_at: Math.floor(Date.now() / 1000) + 21600, refresh_token, user };
}
http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const u = new URL(req.url, URL_SELF);
    const raw = await body(req);
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (u.pathname === '/auth/v1/signup') {
      const uid = crypto.randomUUID(); await db.query('insert into auth.users(id) values ($1)', [uid]);
      return send(res, 200, await session(uid));
    }
    if (u.pathname === '/auth/v1/token') {
      const j = JSON.parse(raw.toString() || '{}'); const uid = refresh.get(j.refresh_token);
      return uid ? send(res, 200, await session(uid)) : send(res, 400, { error: 'invalid_grant' });
    }
    if (u.pathname === '/auth/v1/user') {
      try { const c = jwt.verify(bearer, SECRET); if (!c.sub) throw 0;
        return send(res, 200, { id: c.sub, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {} });
      } catch { return send(res, 401, { msg: 'invalid JWT' }); }
    }
    if (u.pathname.startsWith('/auth/v1/logout')) { res.writeHead(204, cors); return res.end(); }
    if (u.pathname.startsWith('/rest/v1/')) {
      const headers = { ...req.headers }; delete headers.host; delete headers['content-length'];
      headers.authorization = 'Bearer ' + (isJwt(bearer) ? bearer : ANON);
      const r = await fetch('http://127.0.0.1:3300' + u.pathname.slice('/rest/v1'.length) + u.search, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw });
      const out = Buffer.from(await r.arrayBuffer());
      const h = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) h[k.toLowerCase()] = v; }); for (const [k, v] of Object.entries(cors)) if (!(k.toLowerCase() in h)) h[k.toLowerCase()] = v;
      res.writeHead(r.status, h); return res.end(out);
    }
    if (u.pathname.startsWith('/functions/v1/')) {
      const name = u.pathname.split('/')[3];
      const h = await fnHandler(name);
      const request = new Request(URL_SELF + u.pathname, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw });
      const t0 = Date.now(); const r = await h(request); const out = Buffer.from(await r.arrayBuffer());
      if (name !== 'mp-tick' && name !== 'mp-join') { const s = out.toString(); log.push({ name, status: r.status, ms: Date.now() - t0, body: raw.toString().slice(0, 300), out: s.slice(0, 300) }); if (log.length > 500) log.shift(); }
      const hh = {}; r.headers.forEach((v, k) => { hh[k.toLowerCase()] = v; }); for (const [k, v] of Object.entries(cors)) if (!(k.toLowerCase() in hh)) hh[k.toLowerCase()] = v; res.writeHead(r.status, hh); return res.end(out);
    }
    if (u.pathname === '/__log') return send(res, 200, log);
    send(res, 404, { msg: 'no route ' + u.pathname });
  } catch (e) { console.error('gateway', e); send(res, 500, { err: String(e && e.message || e) }); }
}).listen(PORT, () => console.log('gateway on', PORT));
