// Daemon-level operations: status, ping/kill, save/resurrect, startup, logs,
// profiling, report, updates, sysmonit, pm2 config (set/get/unset), PM2 Plus.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pm2, PM2_VERSION } from '../pm2client.js';
import { hostInfo, refreshNow } from '../metrics.js';
import { runPm2 } from '../jobs.js';
import { tail } from '../logs.js';
import { PROFILES_DIR } from '../state.js';
import { badRequest, notFound } from '../errors.js';

const require = createRequire(import.meta.url);
const Configuration = require('pm2/lib/Configuration.js');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function pidAlive(file) {
  try {
    const pid = parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function dumpInfo() {
  const file = pm2.conf.DUMP_FILE_PATH;
  try {
    const st = fs.statSync(file);
    const apps = readJson(file) || [];
    return {
      path: file,
      mtime: st.mtimeMs,
      apps: apps.map((a) => ({ name: a.name, pm_id: a.pm_id, script: a.pm_exec_path, status: a.status })),
    };
  } catch {
    return { path: file, mtime: null, apps: [] };
  }
}

function startupInfo() {
  const user = os.userInfo().username;
  const candidates = [
    path.join(os.homedir(), 'Library/LaunchAgents', `pm2.${user}.plist`),
    `/Library/LaunchDaemons/pm2.${user}.plist`,
    `/etc/systemd/system/pm2-${user}.service`,
    `/etc/init.d/pm2-init.sh`,
    `/etc/rc.d/pm2`,
  ];
  const found = candidates.filter((f) => fs.existsSync(f));
  return { enabled: found.length > 0, files: found, platform: process.platform };
}

function plusInfo() {
  const conf = pm2.conf;
  const interactorPid = pidAlive(conf.INTERACTOR_PID_PATH);
  const interaction = readJson(conf.INTERACTION_CONF) || {};
  return {
    linked: !!interactorPid,
    interactorPid,
    public_key: interaction.public_key || null,
    machine_name: interaction.machine_name || null,
    // never expose the secret key
    url: interaction.public_key ? `https://app.pm2.io/#/r/${interaction.public_key}` : 'https://app.pm2.io',
  };
}

export default async function systemRoutes(app) {
  app.get('/api/system', async () => {
    let daemonVersion = null;
    if (pm2.online) {
      try {
        daemonVersion = await pm2.call('getVersion');
      } catch {
        // offline
      }
    }
    return {
      online: pm2.online,
      daemonPid: pm2.daemonPid(),
      daemonVersion,
      libVersion: PM2_VERSION,
      home: pm2.home,
      paths: {
        log: pm2.conf.PM2_LOG_FILE_PATH,
        pid: pm2.conf.PM2_PID_FILE_PATH,
        dump: pm2.conf.DUMP_FILE_PATH,
        modules: pm2.conf.DEFAULT_MODULE_PATH,
        logs: pm2.conf.DEFAULT_LOG_PATH,
      },
      host: hostInfo(),
      dump: dumpInfo(),
      startup: startupInfo(),
      plus: plusInfo(),
      dashboard: { pid: process.pid, node: process.version },
    };
  });

  // Start the daemon if needed (pm2 ping) and connect to it.
  app.post('/api/system/ping', async () => {
    const ok = await pm2.connect({ launch: true });
    if (!ok) throw new Error('Could not start or reach the pm2 daemon');
    await refreshNow();
    return { ok: true, daemonPid: pm2.daemonPid() };
  });

  app.post('/api/system/kill', async () => {
    await pm2.call('killDaemon');
    pm2.teardown();
    pm2.setOnline(false);
    return { ok: true };
  });

  app.post('/api/system/save', async (req) => {
    await pm2.call('dump', !!req.body?.force);
    return { ok: true, dump: dumpInfo() };
  });

  app.post('/api/system/resurrect', async () => {
    await pm2.call('resurrect');
    await refreshNow();
    return { ok: true };
  });

  app.post('/api/system/cleardump', async () => {
    await pm2.call('clearDump');
    return { ok: true, dump: dumpInfo() };
  });

  app.post('/api/system/flush', async () => {
    await pm2.call('flush', undefined);
    return { ok: true };
  });

  app.post('/api/system/reloadLogs', async () => {
    await pm2.call('reloadLogs');
    return { ok: true };
  });

  app.get('/api/system/pm2log', async (req) => {
    const lines = Math.min(parseInt(req.query.lines, 10) || 300, 5000);
    return { path: pm2.conf.PM2_LOG_FILE_PATH, lines: await tail(pm2.conf.PM2_LOG_FILE_PATH, lines) };
  });

  // Commands that stream text output are run as jobs.
  const JOB_COMMANDS = {
    update: () => ['update'],
    deepUpdate: () => ['deepUpdate'],
    report: () => ['report'],
    logrotate: () => ['logrotate'],
    sysmonit: () => ['sysmonit'],
    startup: (b) => (b.platform ? ['startup', b.platform] : ['startup']),
    unstartup: (b) => (b.platform ? ['unstartup', b.platform] : ['unstartup']),
    unlink: () => ['unlink'],
    logout: () => ['logout'],
  };

  app.post('/api/system/job/:command', async (req) => {
    const build = JOB_COMMANDS[req.params.command];
    if (!build) throw badRequest(`unknown command ${req.params.command}`);
    const body = req.body || {};
    if (body.platform && !/^[a-z0-9-]+$/.test(body.platform)) throw badRequest('invalid platform');
    return runPm2(build(body));
  });

  // pm2 link <secret> <public> [machine]
  app.post('/api/system/plus/link', async (req) => {
    const { secret, public: pub, name } = req.body || {};
    if (!secret || !pub) throw badRequest('secret and public keys are required');
    const args = ['link', String(secret), String(pub)];
    if (name) args.push(String(name));
    const job = runPm2(args, { title: 'pm2 link (PM2 Plus)' });
    job.command = 'pm2 link ****** ******' + (name ? ` ${name}` : '');
    return job;
  });

  // Profile the pm2 daemon itself (pm2 profile:cpu|mem [time]).
  app.post('/api/system/profile', async (req) => {
    const { type, time } = req.body || {};
    if (!['cpu', 'mem'].includes(type)) throw badRequest('type must be cpu or mem');
    const seconds = Math.min(Math.max(parseInt(time, 10) || 10, 1), 300);
    return runPm2([`profile:${type}`, String(seconds)], { cwd: PROFILES_DIR });
  });

  app.get('/api/system/profiles', async () => {
    const files = fs.readdirSync(PROFILES_DIR).map((f) => {
      const st = fs.statSync(path.join(PROFILES_DIR, f));
      return { name: f, size: st.size, mtime: st.mtimeMs };
    });
    return files.sort((a, b) => b.mtime - a.mtime);
  });

  app.get('/api/system/profiles/:file', async (req, reply) => {
    const name = path.basename(req.params.file);
    const file = path.join(PROFILES_DIR, name);
    if (!fs.existsSync(file)) throw notFound('profile not found');
    reply.header('content-disposition', `attachment; filename="${name}"`);
    reply.header('content-type', 'application/octet-stream');
    return reply.send(fs.createReadStream(file));
  });

  // pm2 slist / sysinfos (requires sysmonit to be running)
  app.get('/api/system/slist', async () => {
    try {
      return await pm2.remote('getSystemData', {});
    } catch (err) {
      if (/does not exist/.test(err.message)) {
        throw Object.assign(new Error('System monitoring is not running. Start it with "Enable sysmonit" first.'), { statusCode: 409 });
      }
      throw err;
    }
  });

  // pm2 get/set/unset/multiset/conf — stored in module_conf.json
  app.get('/api/config', async () => Configuration.getAllSync() || {});

  app.put('/api/config', async (req) => {
    const { key, value } = req.body || {};
    if (!key || typeof key !== 'string') throw badRequest('key is required');
    await new Promise((resolve, reject) =>
      Configuration.set(key, String(value ?? ''), (err) => (err ? reject(err) : resolve())),
    );
    return Configuration.getAllSync();
  });

  app.delete('/api/config', async (req) => {
    const key = req.query.key;
    if (!key) throw badRequest('key is required');
    await new Promise((resolve, reject) => Configuration.unset(key, (err) => (err ? reject(err) : resolve())));
    return Configuration.getAllSync();
  });

  app.post('/api/config/multiset', async (req) => {
    const serial = String(req.body?.serial || '').trim();
    if (!serial) throw badRequest('serial is required ("key1 val1 key2 val2")');
    await new Promise((resolve, reject) =>
      Configuration.multiset(serial, (err) => (err ? reject(err) : resolve())),
    );
    return Configuration.getAllSync();
  });
}
