// Runs pm2 CLI commands as child processes and streams their output.
// Used for operations that are long-running or only print text
// (module installs, deploys, startup, profiling, report, ...).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PM2_BIN, pm2 } from './pm2client.js';
import { publish } from './hub.js';

const MAX_JOBS = 50;
const MAX_OUTPUT = 1024 * 1024;
const jobs = new Map(); // id -> job (insertion ordered)

function publicJob(job, withOutput = false) {
  const { child, ...rest } = job;
  return withOutput ? rest : { ...rest, output: undefined };
}

function publishList() {
  publish('jobs', listJobs(), { retain: true });
}

export function listJobs() {
  return [...jobs.values()].reverse().map((j) => publicJob(j));
}

export function getJob(id) {
  const job = jobs.get(id);
  return job ? publicJob(job, true) : null;
}

// pm2 6 installs modules with bun whenever bun is on PATH, but `bun install --cwd`
// walks up to the nearest package.json and installs there instead of the module
// folder. Hiding bun makes pm2 fall back to `npm --prefix <module dir>`.
function pathWithoutBun() {
  return (process.env.PATH || '')
    .split(path.delimiter)
    .filter((dir) => dir && !fs.existsSync(path.join(dir, process.platform === 'win32' ? 'bun.exe' : 'bun')))
    .join(path.delimiter);
}

const MODULE_COMMANDS = new Set(['install', 'module:install', 'module:update', 'uninstall', 'module:uninstall']);

// The startup script embeds the path of the pm2 binary that generated it, so it
// should be the user's global pm2, not the copy inside this project.
const GLOBAL_COMMANDS = new Set(['startup', 'unstartup']);
const projectRoot = path.resolve(path.dirname(PM2_BIN), '../../..');
function globalPm2() {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, process.platform === 'win32' ? 'pm2.cmd' : 'pm2');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (!fs.realpathSync(candidate).startsWith(projectRoot + path.sep)) return candidate;
    } catch {
      // not here
    }
  }
  return null;
}

// runPm2(['install', 'pm2-logrotate'], { cwd, title })
export function runPm2(args, { cwd = os.homedir(), title, stdin } = {}) {
  const id = crypto.randomUUID().slice(0, 8);
  const job = {
    id,
    title: title || `pm2 ${args.join(' ')}`,
    command: `pm2 ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`,
    cwd,
    status: 'running',
    code: null,
    startedAt: Date.now(),
    endedAt: null,
    output: '',
    bytes: 0,
    sudo: null,
  };

  const globalBin = GLOBAL_COMMANDS.has(args[0]) ? globalPm2() : null;
  const [bin, binArgs] = globalBin ? [globalBin, args] : [process.execPath, [PM2_BIN, ...args]];
  const child = spawn(bin, binArgs, {
    cwd,
    env: {
      ...process.env,
      PM2_HOME: pm2.home,
      FORCE_COLOR: '1',
      PM2_PROGRAMMATIC: '',
      ...(MODULE_COMMANDS.has(args[0]) ? { PATH: pathWithoutBun() } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  job.child = child;
  child.stdin.on('error', () => {});
  if (stdin !== undefined) child.stdin.end(stdin);
  else child.stdin.end();

  // offset lets clients stitch the fetched backlog and live chunks without gaps or repeats.
  const onData = (buf) => {
    const text = buf.toString();
    const offset = job.bytes;
    job.bytes += text.length;
    if (job.output.length < MAX_OUTPUT) job.output += text;
    publish(`job:${id}`, { type: 'data', data: text, offset });
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  const finish = (code, errMsg) => {
    if (job.status !== 'running') return;
    if (errMsg) onData(Buffer.from(`\r\n${errMsg}\r\n`));
    job.code = code;
    job.endedAt = Date.now();
    // pm2 startup / logrotate print a sudo command the user has to run themselves
    // (and exit 1), which is a hand-off rather than a failure.
    const plain = job.output.replace(/\x1b\[[0-9;]*m/g, '');
    const m = plain.match(/^\s*(?:\[PM2\]\s*)?(sudo (?:env )?.+)$/m);
    if (m) job.sudo = m[1].trim();
    job.status = job.killed ? 'killed' : code === 0 ? 'success' : job.sudo ? 'needs_sudo' : 'failed';
    delete job.child;
    publish(`job:${id}`, { type: 'exit', code, status: job.status, sudo: job.sudo });
    publishList();
  };
  child.on('error', (err) => finish(-1, err.message));
  child.on('close', (code) => finish(code ?? -1));

  jobs.set(id, job);
  while (jobs.size > MAX_JOBS) {
    const oldest = [...jobs.values()].find((j) => j.status !== 'running');
    if (!oldest) break;
    jobs.delete(oldest.id);
  }
  publishList();
  return publicJob(job);
}

export function killJob(id) {
  const job = jobs.get(id);
  if (!job || job.status !== 'running' || !job.child) return false;
  job.killed = true;
  job.child.kill('SIGTERM');
  return true;
}

// Resolves when the job finishes (for callers that want a result).
export function waitJob(id) {
  return new Promise((resolve) => {
    const check = () => {
      const job = jobs.get(id);
      if (!job || job.status !== 'running') return resolve(getJob(id));
      setTimeout(check, 200);
    };
    check();
  });
}
