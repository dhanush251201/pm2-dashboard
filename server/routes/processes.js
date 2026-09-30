// Process lifecycle: list, describe, start, stop/restart/reload/delete/reset,
// scale, signals, custom actions, stdin, logs, git operations.
import fs from 'node:fs';
import path from 'node:path';
import { pm2 } from '../pm2client.js';
import { getSnapshot, getHistory, refreshNow } from '../metrics.js';
import { getEvents } from '../bus.js';
import { tail, search, fileInfo } from '../logs.js';
import { runPm2 } from '../jobs.js';
import { badRequest } from '../errors.js';
import { inheritedKeys } from '../envfilter.js';

// Options accepted by the "New process" form, mapped onto pm2 app config keys.
const STRING_KEYS = [
  'name', 'namespace', 'cwd', 'interpreter', 'interpreter_args', 'node_args', 'exec_mode',
  'max_memory_restart', 'cron_restart', 'out_file', 'error_file', 'log_file', 'log_date_format',
  'log_type', 'instance_var', 'pid_file', 'source_map_support',
];
const NUMBER_KEYS = [
  'max_restarts', 'min_uptime', 'restart_delay', 'exp_backoff_restart_delay', 'kill_timeout',
  'listen_timeout',
];
const BOOL_KEYS = [
  'merge_logs', 'time', 'autorestart', 'wait_ready', 'shutdown_with_message', 'vizion',
  'force', 'disable_logs', 'treekill', 'autostart',
];

function cleanStartOptions(body) {
  const opts = {};
  if (typeof body.script !== 'string' || !body.script.trim()) throw badRequest('script is required');
  const cwd = typeof body.cwd === 'string' && body.cwd.trim() ? path.resolve(body.cwd.trim()) : undefined;
  const script = body.script.trim();
  // Keep bare commands (e.g. "npm", "python3") as-is; resolve file paths against cwd.
  const looksLikePath = script.includes('/') || script.includes('.');
  opts.script = looksLikePath && cwd && !path.isAbsolute(script) ? path.resolve(cwd, script) : script;
  if (cwd) opts.cwd = cwd;

  for (const k of STRING_KEYS) {
    if (k === 'cwd') continue;
    if (typeof body[k] === 'string' && body[k].trim()) opts[k] = body[k].trim();
  }
  for (const k of NUMBER_KEYS) {
    if (body[k] !== undefined && body[k] !== '' && !Number.isNaN(Number(body[k]))) opts[k] = Number(body[k]);
  }
  for (const k of BOOL_KEYS) {
    if (typeof body[k] === 'boolean') opts[k] = body[k];
  }
  if (body.instances !== undefined && body.instances !== '') {
    opts.instances = body.instances === 'max' ? 'max' : Number(body.instances);
  }
  if (typeof body.args === 'string' && body.args.trim()) opts.args = body.args.trim();
  if (Array.isArray(body.args) && body.args.length) opts.args = body.args.map(String);
  if (body.watch === true) opts.watch = true;
  if (Array.isArray(body.watch) && body.watch.length) opts.watch = body.watch.map(String);
  if (Array.isArray(body.ignore_watch) && body.ignore_watch.length) opts.ignore_watch = body.ignore_watch.map(String);
  if (body.env && typeof body.env === 'object') {
    opts.env = Object.fromEntries(
      Object.entries(body.env)
        .filter(([k]) => k.trim())
        .map(([k, v]) => [k.trim(), String(v)]),
    );
  }
  return opts;
}

async function logPaths(id) {
  const [proc] = await pm2.describe(id);
  const env = proc.pm2_env;
  return {
    name: proc.name,
    out: env.pm_out_log_path,
    err: env.pm_err_log_path,
    combined: env.pm_log_path || null,
  };
}

function pickLogFile(paths, type) {
  const file = type === 'err' ? paths.err : type === 'combined' ? paths.combined : paths.out;
  if (!file) throw badRequest(`no ${type} log file for this process`);
  return file;
}

export default async function processRoutes(app) {
  app.get('/api/processes', async () => getSnapshot());

  app.get('/api/metrics/history', async () => getHistory());

  app.get('/api/events', async () => getEvents());

  app.get('/api/processes/:id', async (req) => {
    const [proc] = await pm2.describe(req.params.id);
    return { ...proc, inherited_env_keys: inheritedKeys(proc.pm2_env?.env, proc.name) };
  });

  // Raw jlist output (pm2 jlist / prettylist)
  app.get('/api/jlist', async () => pm2.list());

  app.post('/api/processes', async (req) => {
    const body = req.body || {};

    // pm2 serve <path> <port>
    if (body.serve) {
      const s = body.serve;
      if (!s.path) throw badRequest('serve.path is required');
      const opts = { spa: !!s.spa };
      if (s.homepage) opts.homepage = s.homepage;
      if (s.username && s.password) {
        opts.basicAuthUsername = s.username;
        opts.basicAuthPassword = s.password;
      }
      if (s.monitor) opts.monitor = s.monitor;
      const commander = body.name ? { name: body.name } : {};
      const procs = await pm2.call('serve', path.resolve(s.path), Number(s.port) || 8080, opts, commander);
      await refreshNow();
      return { started: (procs || []).map((p) => ({ pm_id: p.pm2_env?.pm_id, name: p.pm2_env?.name })) };
    }

    const opts = cleanStartOptions(body);
    const procs = await pm2.call('start', opts);
    await refreshNow();
    return { started: (procs || []).map((p) => ({ pm_id: p.pm2_env?.pm_id, name: p.pm2_env?.name })) };
  });

  // Lifecycle + per-process operations. :target is an id, name, namespace or "all".
  app.post('/api/processes/:target/:action', async (req) => {
    const { target, action } = req.params;
    const body = req.body || {};
    let result = null;

    switch (action) {
      case 'stop':
        await pm2.call('stop', target);
        break;
      case 'restart':
        await pm2.call('restart', target, { updateEnv: !!body.updateEnv });
        break;
      case 'reload':
        await pm2.call('reload', target, { updateEnv: !!body.updateEnv });
        break;
      case 'delete':
        await pm2.call('delete', target);
        break;
      case 'reset':
        await pm2.call('reset', target);
        break;
      case 'flush':
        await pm2.call('flush', target);
        break;
      case 'scale': {
        const n = String(body.instances ?? '').trim();
        if (!/^[+-]?\d+$/.test(n)) throw badRequest('instances must be a number, +N or -N');
        await pm2.call('scale', target, n);
        break;
      }
      case 'signal': {
        const signal = String(body.signal || '').toUpperCase();
        if (!/^SIG[A-Z0-9]+$/.test(signal)) throw badRequest('invalid signal');
        if (/^\d+$/.test(target)) await pm2.call('sendSignalToProcessId', signal, Number(target));
        else await pm2.call('sendSignalToProcessName', signal, target);
        break;
      }
      case 'trigger':
        if (!body.action) throw badRequest('action is required');
        result = await pm2.trigger(target, body.action, body.params);
        break;
      case 'inspect':
        result = await pm2.trigger(target, 'internal:inspect');
        break;
      case 'stdin':
        if (typeof body.line !== 'string') throw badRequest('line is required');
        await pm2.call('sendLineToStdin', Number(target), body.line, body.separator ?? null);
        break;
      case 'pull':
        return runPm2(body.commit ? ['pull', target, body.commit] : ['pull', target], { title: `git pull ${target}` });
      case 'forward':
      case 'backward':
        return runPm2([action, target], { title: `git ${action} ${target}` });
      case 'monitor':
      case 'unmonitor':
        return runPm2([action, target]);
      default:
        throw badRequest(`unknown action ${action}`);
    }
    await refreshNow();
    return { ok: true, result };
  });

  app.get('/api/processes/:id/logs', async (req) => {
    const lines = Math.min(parseInt(req.query.lines, 10) || 500, 10_000);
    const paths = await logPaths(req.params.id);
    const [out, err] = await Promise.all([tail(paths.out, lines), paths.err === paths.out ? [] : tail(paths.err, lines)]);
    return {
      out,
      err,
      files: {
        out: fileInfo(paths.out),
        err: fileInfo(paths.err),
        combined: paths.combined ? fileInfo(paths.combined) : null,
      },
    };
  });

  app.get('/api/processes/:id/logs/search', async (req) => {
    const q = String(req.query.q || '');
    if (!q) throw badRequest('q is required');
    const paths = await logPaths(req.params.id);
    try {
      return await search(pickLogFile(paths, req.query.type || 'out'), q);
    } catch (err) {
      if (err instanceof SyntaxError) throw badRequest(`invalid regex: ${err.message}`);
      throw err;
    }
  });

  app.get('/api/processes/:id/logs/download', async (req, reply) => {
    const type = req.query.type || 'out';
    const paths = await logPaths(req.params.id);
    const file = pickLogFile(paths, type);
    if (!fs.existsSync(file)) throw badRequest('log file does not exist');
    reply.header('content-type', 'text/plain; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="${paths.name.replace(/[^\w.-]/g, '_')}-${type}.log"`);
    return reply.send(fs.createReadStream(file));
  });
}
