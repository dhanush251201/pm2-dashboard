// Ecosystem files (view/edit/apply/generate/export), deploy, and a small
// filesystem browser used by path pickers in the UI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pm2 } from '../pm2client.js';
import { getSnapshot } from '../metrics.js';
import { runPm2 } from '../jobs.js';
import { getState, pushRecent, setState } from '../state.js';
import { badRequest, notFound } from '../errors.js';
import { ownEnv } from '../envfilter.js';

// Same rule pm2 uses (Common.isConfigFile) to decide a file is an ecosystem file.
const CONFIG_FILE = /(\.json|\.ya?ml|\.config\.[cm]?js)$/;
const DISCOVER = ['ecosystem.config.js', 'ecosystem.config.cjs', 'ecosystem.config.mjs', 'ecosystem.json', 'process.json', 'pm2.json'];

function checkConfigPath(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) throw badRequest('an absolute file path is required');
  if (!CONFIG_FILE.test(p)) throw badRequest('file must be .json, .yml/.yaml or *.config.js/.cjs/.mjs');
  return path.normalize(p);
}

// Evaluate a config file in a child process and return it as JSON.
function loadConfig(file) {
  const code = `
    const f = process.argv[1];
    (async () => {
      let c;
      if (/\\.ya?ml$/.test(f)) { console.log(JSON.stringify({ yaml: true })); return; }
      if (f.endsWith('.mjs')) c = (await import('file://' + f)).default;
      else if (f.endsWith('.json')) c = JSON.parse(require('fs').readFileSync(f, 'utf8'));
      else c = require(f);
      console.log(JSON.stringify(c, (k, v) => typeof v === 'function' ? undefined : v));
    })().catch(e => { console.error(e.message); process.exit(1); });
  `;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['-e', code, file], { timeout: 5000, cwd: path.dirname(file) }, (err, stdout, stderr) => {
      if (err) return reject(badRequest(`could not load ${path.basename(file)}: ${stderr.trim() || err.message}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(badRequest('config did not produce JSON'));
      }
    });
  });
}

// Build an ecosystem.config.js from the running process list.
function exportEcosystem(list) {
  const seen = new Set();
  const apps = [];
  for (const p of list) {
    const e = p.pm2_env || {};
    if (e.pmx_module || seen.has(p.name)) continue;
    seen.add(p.name);
    const app = { name: p.name, script: e.pm_exec_path, cwd: e.pm_cwd };
    if (e.args?.length) app.args = e.args;
    if (e.exec_interpreter && !['node', 'none'].includes(e.exec_interpreter)) app.interpreter = e.exec_interpreter;
    if (e.node_args?.length) app.node_args = e.node_args;
    if (e.namespace && e.namespace !== 'default') app.namespace = e.namespace;
    if (e.exec_mode === 'cluster_mode') {
      app.exec_mode = 'cluster';
      app.instances = list.filter((x) => x.name === p.name).length;
    }
    if (e.watch) app.watch = e.watch;
    if (e.ignore_watch) app.ignore_watch = e.ignore_watch;
    if (e.max_memory_restart) app.max_memory_restart = e.max_memory_restart;
    if (e.cron_restart) app.cron_restart = e.cron_restart;
    if (e.autorestart === false) app.autorestart = false;
    // Only the app's own env, not the shell env pm2 merges in.
    const own = ownEnv(e.env, p.name);
    if (Object.keys(own).length) app.env = own;
    for (const k of Object.keys(e)) if (k.startsWith('env_') && typeof e[k] === 'object') app[k] = e[k];
    apps.push(app);
  }
  const body = JSON.stringify({ apps }, null, 2).replace(/"([A-Za-z_$][\w$]*)":/g, '$1:');
  return `module.exports = ${body};\n`;
}

export default async function ecosystemRoutes(app) {
  app.get('/api/ecosystem/files', async () => {
    const recent = getState('ecosystemFiles', []).filter((f) => fs.existsSync(f));
    const discovered = new Set();
    for (const p of getSnapshot()) {
      for (const dir of [p.cwd, p.script && path.dirname(p.script)]) {
        if (!dir) continue;
        for (const name of DISCOVER) {
          const f = path.join(dir, name);
          if (fs.existsSync(f)) discovered.add(f);
        }
      }
    }
    return { recent, discovered: [...discovered].filter((f) => !recent.includes(f)) };
  });

  app.delete('/api/ecosystem/files', async (req) => {
    setState('ecosystemFiles', getState('ecosystemFiles', []).filter((f) => f !== req.query.path));
    return { ok: true };
  });

  app.get('/api/ecosystem/file', async (req) => {
    const file = checkConfigPath(req.query.path);
    if (!fs.existsSync(file)) throw notFound('file does not exist');
    pushRecent('ecosystemFiles', file);
    return { path: file, content: fs.readFileSync(file, 'utf8') };
  });

  app.put('/api/ecosystem/file', async (req) => {
    const file = checkConfigPath(req.body?.path);
    if (typeof req.body.content !== 'string') throw badRequest('content is required');
    if (!fs.existsSync(path.dirname(file))) throw badRequest('directory does not exist');
    fs.writeFileSync(file, req.body.content);
    pushRecent('ecosystemFiles', file);
    return { ok: true, path: file };
  });

  // Parsed config: app names + deploy environments.
  app.get('/api/ecosystem/parsed', async (req) => {
    const file = checkConfigPath(req.query.path);
    const cfg = await loadConfig(file);
    if (cfg.yaml) return { apps: [], deploy: {}, envs: [] };
    const apps = Array.isArray(cfg.apps) ? cfg.apps : Array.isArray(cfg) ? cfg : cfg.apps ? [cfg.apps] : [];
    const envs = new Set();
    for (const a of apps) for (const k of Object.keys(a || {})) if (k.startsWith('env_')) envs.add(k.slice(4));
    return {
      apps: apps.map((a) => ({ name: a.name, script: a.script, instances: a.instances, exec_mode: a.exec_mode })),
      envs: [...envs],
      deploy: Object.fromEntries(
        Object.entries(cfg.deploy || {}).map(([k, v]) => [k, { host: v.host, ref: v.ref, repo: v.repo, path: v.path, user: v.user }]),
      ),
    };
  });

  // pm2 start|startOrRestart|startOrReload|restart|reload|stop|delete <file>
  const APPLY = new Set(['start', 'startOrRestart', 'startOrReload', 'startOrGracefulReload', 'restart', 'reload', 'stop', 'delete']);
  app.post('/api/ecosystem/apply', async (req) => {
    const { action, only, env, updateEnv } = req.body || {};
    const file = checkConfigPath(req.body?.path);
    if (!APPLY.has(action)) throw badRequest('invalid action');
    const args = [action, file];
    if (only) {
      if (!/^[\w.,@-]+$/.test(only)) throw badRequest('invalid --only value');
      args.push('--only', only);
    }
    if (env) {
      if (!/^[\w-]+$/.test(env)) throw badRequest('invalid --env value');
      args.push('--env', env);
    }
    if (updateEnv) args.push('--update-env');
    pushRecent('ecosystemFiles', file);
    return runPm2(args, { cwd: path.dirname(file) });
  });

  // pm2 init / ecosystem [simple]
  app.post('/api/ecosystem/generate', async (req) => {
    const dir = req.body?.dir;
    if (!dir || !path.isAbsolute(dir) || !fs.existsSync(dir)) throw badRequest('an existing absolute directory is required');
    const target = path.join(dir, 'ecosystem.config.js');
    if (fs.existsSync(target) && !req.body.overwrite) throw badRequest(`${target} already exists`);
    const args = req.body.simple ? ['init', 'simple'] : ['init'];
    const job = runPm2(args, { cwd: dir });
    pushRecent('ecosystemFiles', target);
    return { ...job, file: target };
  });

  app.get('/api/ecosystem/export', async () => {
    const list = await pm2.list();
    return { content: exportEcosystem(list) };
  });

  // pm2 deploy <file> <env> <command...>
  const DEPLOY_CMDS = new Set(['setup', 'update', 'revert', 'curr', 'current', 'prev', 'previous', 'list', 'exec', 'ref']);
  app.post('/api/deploy', async (req) => {
    const { env, command, arg, force } = req.body || {};
    const file = checkConfigPath(req.body?.path);
    if (!env || !/^[\w-]+$/.test(env)) throw badRequest('invalid environment');
    if (!DEPLOY_CMDS.has(command)) throw badRequest('invalid deploy command');
    const args = ['deploy', file, env];
    if (command === 'ref') {
      if (!arg) throw badRequest('ref is required');
      args.push(String(arg));
    } else {
      args.push(command);
      if (command === 'revert' && arg) args.push(String(parseInt(arg, 10) || 1));
      if (command === 'exec') {
        if (!arg) throw badRequest('command to exec is required');
        args.push(String(arg));
      }
    }
    if (force) args.push('--force');
    pushRecent('ecosystemFiles', file);
    return runPm2(args, { cwd: path.dirname(file), title: `deploy ${env} ${command}` });
  });

  // Directory listing for path pickers.
  app.get('/api/fs/ls', async (req) => {
    let dir = typeof req.query.path === 'string' && req.query.path ? req.query.path : os.homedir();
    if (dir.startsWith('~')) dir = path.join(os.homedir(), dir.slice(1));
    dir = path.resolve(dir);
    let stat;
    try {
      stat = fs.statSync(dir);
    } catch {
      throw notFound('path does not exist');
    }
    if (!stat.isDirectory()) dir = path.dirname(dir);
    const showHidden = req.query.hidden === '1';
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => showHidden || !d.name.startsWith('.'))
      .map((d) => {
        let isDir = d.isDirectory();
        if (d.isSymbolicLink()) {
          try {
            isDir = fs.statSync(path.join(dir, d.name)).isDirectory();
          } catch {
            // dangling link
          }
        }
        return { name: d.name, dir: isDir };
      })
      .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    return { path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), home: os.homedir(), entries };
  });
}
