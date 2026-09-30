// Polls the daemon for the process list, keeps a rolling CPU/memory history
// per process, and publishes both to WebSocket subscribers.
import os from 'node:os';
import { pm2 } from './pm2client.js';
import { publish } from './hub.js';

const INTERVAL_MS = 2_000;
const HISTORY_POINTS = 450; // 15 minutes at 2s

const history = new Map(); // pm_id -> [{ t, cpu, mem }]
const hostHistory = [];
let snapshot = [];
let lastCpuTimes = null;

export function summarize(p) {
  const env = p.pm2_env || {};
  return {
    pm_id: p.pm_id,
    name: p.name,
    namespace: env.namespace,
    status: env.status,
    pid: p.pid,
    cpu: p.monit?.cpu ?? 0,
    memory: p.monit?.memory ?? 0,
    uptime: env.pm_uptime,
    created_at: env.created_at,
    restarts: env.restart_time ?? 0,
    unstable_restarts: env.unstable_restarts ?? 0,
    exec_mode: env.exec_mode,
    instances: env.instances,
    version: env.version,
    node_version: env.node_version,
    interpreter: env.exec_interpreter,
    script: env.pm_exec_path,
    cwd: env.pm_cwd,
    watch: !!env.watch,
    autorestart: env.autorestart !== false,
    is_module: !!env.pmx_module,
    axm_monitor: env.axm_monitor || {},
    axm_actions: (env.axm_actions || []).map((a) => ({ name: a.action_name, type: a.action_type, arity: a.arity })),
    versioning: env.versioning
      ? {
          type: env.versioning.type,
          branch: env.versioning.branch,
          revision: env.versioning.revision,
          comment: env.versioning.comment,
          url: env.versioning.url,
          unstaged: env.versioning.unstaged,
          ahead: env.versioning.ahead,
          next_rev: env.versioning.next_rev,
          prev_rev: env.versioning.prev_rev,
        }
      : null,
  };
}

function hostCpuPercent() {
  const cpus = os.cpus();
  const totals = cpus.reduce(
    (acc, c) => {
      const t = c.times;
      acc.idle += t.idle;
      acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
      return acc;
    },
    { idle: 0, total: 0 },
  );
  let pct = 0;
  if (lastCpuTimes) {
    const dIdle = totals.idle - lastCpuTimes.idle;
    const dTotal = totals.total - lastCpuTimes.total;
    pct = dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 1000) / 10 : 0;
  }
  lastCpuTimes = totals;
  return pct;
}

export function hostInfo() {
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model,
    totalmem: os.totalmem(),
    freemem: os.freemem(),
    loadavg: os.loadavg(),
    uptime: os.uptime(),
    node: process.version,
    cpu: hostHistory.at(-1)?.cpu ?? 0,
  };
}

function push(arr, point) {
  arr.push(point);
  if (arr.length > HISTORY_POINTS) arr.splice(0, arr.length - HISTORY_POINTS);
}

async function tick() {
  const t = Date.now();
  push(hostHistory, { t, cpu: hostCpuPercent(), mem: os.totalmem() - os.freemem() });

  if (!pm2.online) {
    if (snapshot.length) {
      snapshot = [];
      publish('processes', snapshot, { retain: true });
    }
    return;
  }
  try {
    const list = await pm2.list();
    snapshot = list.map(summarize);
    const seen = new Set();
    const points = {};
    for (const p of snapshot) {
      seen.add(p.pm_id);
      if (!history.has(p.pm_id)) history.set(p.pm_id, []);
      const point = { t, cpu: p.cpu, mem: p.memory };
      push(history.get(p.pm_id), point);
      points[p.pm_id] = point;
    }
    for (const id of history.keys()) if (!seen.has(id)) history.delete(id);

    publish('processes', snapshot, { retain: true });
    publish('metrics', { t, points, host: hostHistory.at(-1) });
  } catch (err) {
    // pm2client flips to offline if the daemon is gone
  }
}

export function getSnapshot() {
  return snapshot;
}

export function getHistory() {
  return { processes: Object.fromEntries(history), host: hostHistory };
}

export function refreshNow() {
  return tick();
}

export function startMetrics() {
  hostCpuPercent();
  tick();
  setInterval(tick, INTERVAL_MS).unref();
}
