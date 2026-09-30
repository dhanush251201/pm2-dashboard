// PM2 Dashboard server: REST + WebSocket API over the pm2 programmatic API,
// serving the React UI from web/dist in production.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { pm2 } from './pm2client.js';
import { guard, setAuthCookie, tokenMatches, TOKEN, COOKIE } from './auth.js';
import { startBus } from './bus.js';
import { startMetrics } from './metrics.js';
import { listJobs, getJob, killJob } from './jobs.js';
import processRoutes from './routes/processes.js';
import systemRoutes from './routes/system.js';
import moduleRoutes from './routes/modules.js';
import ecosystemRoutes from './routes/ecosystem.js';
import wsRoutes from './ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../web/dist');
const DEV = process.argv.includes('--dev');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PM2_DASHBOARD_PORT || process.env.PORT || 9700);
const VITE_PORT = Number(process.env.VITE_PORT || 5173);

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'warn' }, bodyLimit: 5 * 1024 * 1024 });

await app.register(fastifyCookie);
app.addHook('onRequest', guard);
await app.register(fastifyWebsocket);

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) req.log.error(err);
  reply.code(status).send({ error: err.message || String(err) });
});

// Exchange the token printed on startup for a cookie.
app.post('/api/auth', async (req, reply) => {
  if (!tokenMatches(req.body?.token)) return reply.code(401).send({ error: 'Invalid token' });
  setAuthCookie(reply);
  return { ok: true };
});

app.get('/api/auth', async (req) => ({ authed: tokenMatches(req.cookies?.[COOKIE]) }));

app.get('/api/jobs', async () => listJobs());
app.get('/api/jobs/:id', async (req, reply) => getJob(req.params.id) ?? reply.code(404).send({ error: 'job not found' }));
app.post('/api/jobs/:id/kill', async (req) => ({ ok: killJob(req.params.id) }));

await app.register(processRoutes);
await app.register(systemRoutes);
await app.register(moduleRoutes);
await app.register(ecosystemRoutes);
await app.register(wsRoutes);

const hasDist = fs.existsSync(path.join(DIST, 'index.html'));
if (hasDist) {
  await app.register(fastifyStatic, { root: DIST });
}
app.setNotFoundHandler((req, reply) => {
  // SPA fallback for client routes; real 404s for API calls and missing assets.
  const isAsset = /\.[a-z0-9]+$/i.test(req.url.split('?')[0]);
  if (req.method === 'GET' && hasDist && !isAsset && !req.url.startsWith('/api/') && !req.url.startsWith('/ws')) {
    return reply.sendFile('index.html');
  }
  reply.code(404).send({ error: 'Not found' });
});

pm2.on('warn', (msg) => app.log.warn(msg));
startBus();
await pm2.connect();
startMetrics();

await app.listen({ host: HOST, port: PORT });

const uiPort = DEV ? VITE_PORT : PORT;
const url = `http://localhost:${uiPort}/?t=${TOKEN}`;
console.log('');
console.log('  PM2 Dashboard');
console.log(`  API     http://${HOST}:${PORT}`);
console.log(`  Open    ${url}`);
console.log(`  pm2     ${pm2.online ? `connected (daemon pid ${pm2.daemonPid()}, home ${pm2.home})` : 'daemon not running — start it from the UI'}`);
if (!DEV && !hasDist) console.log('  (web/dist missing — run `npm run build` or use `npm run dev`)');
console.log('');

const shutdown = async () => {
  try {
    pm2.teardown();
    await app.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
