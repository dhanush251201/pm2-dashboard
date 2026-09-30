// Local-only access control:
//  - Host header must be a loopback name (blocks DNS rebinding)
//  - Origin, when present, must be a loopback origin (blocks cross-site requests)
//  - A secret token (persisted in ~/.pm2-dashboard/token) is exchanged for an
//    httpOnly SameSite=Strict cookie
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { STATE_DIR } from './state.js';

export const COOKIE = 'pm2dash';
const TOKEN_FILE = path.join(STATE_DIR, 'token');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function loadToken() {
  try {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t.length >= 32) return t;
  } catch {
    // create below
  }
  const t = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
  return t;
}

export const TOKEN = loadToken();

function hostname(hostHeader) {
  if (!hostHeader) return '';
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1);
  return hostHeader.split(':')[0];
}

export function isLoopbackHost(hostHeader) {
  return LOOPBACK.has(hostname(hostHeader).toLowerCase());
}

export function isLoopbackOrigin(origin) {
  if (!origin) return true; // same-origin GETs and non-browser clients omit it
  try {
    return LOOPBACK.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function tokenMatches(candidate) {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Fastify onRequest hook guarding everything.
export function guard(request, reply, done) {
  if (!isLoopbackHost(request.headers.host)) {
    reply.code(403).send({ error: 'Forbidden host' });
    return;
  }
  if (!isLoopbackOrigin(request.headers.origin)) {
    reply.code(403).send({ error: 'Forbidden origin' });
    return;
  }
  const url = request.url;
  const isApi = url.startsWith('/api/') || url === '/ws' || url.startsWith('/ws?');
  const isPublicApi = url.startsWith('/api/auth');
  if (isApi && !isPublicApi && !tokenMatches(request.cookies?.[COOKIE])) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  done();
}

export function setAuthCookie(reply) {
  reply.setCookie(COOKIE, TOKEN, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 365,
  });
}
