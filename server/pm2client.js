// Thin promise wrapper around the pm2 programmatic API.
// Owns the connection to the pm2 daemon (RPC + event bus) and reconnects
// after the daemon is killed or restarted.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const PM2 = require('pm2').custom;

export const PM2_BIN = require.resolve('pm2/bin/pm2');
export const PM2_VERSION = require('pm2/package.json').version;

const CALL_TIMEOUT_MS = 20_000;
const RECONNECT_MS = 3_000;

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`pm2 ${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function toError(err) {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object' && err.message) return new Error(err.message);
  return new Error(String(err));
}

class Pm2Client extends EventEmitter {
  constructor() {
    super();
    this.api = new PM2();
    this.bus = null;
    this.online = false;
    this.connecting = null;
    this.reconnectTimer = null;
  }

  get conf() {
    return this.api._conf;
  }

  get home() {
    return this.api.pm2_home;
  }

  // Returns the daemon pid if the daemon process is alive, else null.
  daemonPid() {
    try {
      const pid = parseInt(fs.readFileSync(this.conf.PM2_PID_FILE_PATH, 'utf8').trim(), 10);
      process.kill(pid, 0);
      return pid;
    } catch {
      return null;
    }
  }

  // Connect to the daemon. With launch=false (default) this never spawns a
  // daemon, so killing pm2 from the UI does not immediately resurrect it.
  connect({ launch = false } = {}) {
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        if (!launch && !this.daemonPid()) {
          this.setOnline(false);
          return false;
        }
        const api = new PM2();
        await withTimeout(
          new Promise((resolve, reject) => api.connect((err) => (err ? reject(toError(err)) : resolve()))),
          CALL_TIMEOUT_MS,
          'connect',
        );
        const bus = await withTimeout(
          new Promise((resolve, reject) => api.launchBus((err, b) => (err ? reject(toError(err)) : resolve(b)))),
          CALL_TIMEOUT_MS,
          'launchBus',
        );
        this.teardown();
        this.api = api;
        this.bus = bus;
        bus.on('*', (event, data) => this.emit('bus', event, data));
        this.setOnline(true);
        return true;
      } catch (err) {
        this.emit('warn', `connect failed: ${err.message}`);
        this.setOnline(false);
        return false;
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  teardown() {
    const old = this.api;
    this.bus = null;
    try {
      old.disconnect(() => {});
    } catch {
      // already closed
    }
  }

  setOnline(online) {
    if (online === this.online) return;
    this.online = online;
    this.emit('status', online);
    if (!online) this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setInterval(async () => {
      if (this.online) {
        clearInterval(this.reconnectTimer);
        this.reconnectTimer = null;
        return;
      }
      if (this.daemonPid()) await this.connect();
    }, RECONNECT_MS);
  }

  // Invoke a callback-style method on the pm2 API and resolve its result.
  call(method, ...args) {
    if (!this.online) return Promise.reject(new Error('pm2 daemon is offline'));
    const api = this.api;
    const p = new Promise((resolve, reject) => {
      api[method](...args, (err, res) => (err ? reject(toError(err)) : resolve(res)));
    });
    return withTimeout(p, CALL_TIMEOUT_MS, method).catch((err) => {
      if (!this.daemonPid()) this.setOnline(false);
      throw err;
    });
  }

  // Call a daemon RPC method directly (the API wrappers print to stdout).
  remote(method, payload) {
    if (!this.online) return Promise.reject(new Error('pm2 daemon is offline'));
    const client = this.api.Client;
    const p = new Promise((resolve, reject) => {
      client.executeRemote(method, payload, (err, res) => (err ? reject(toError(err)) : resolve(res)));
    });
    return withTimeout(p, CALL_TIMEOUT_MS, method);
  }

  list() {
    return this.call('list');
  }

  async describe(id) {
    const res = await this.call('describe', id);
    if (!res || res.length === 0) throw Object.assign(new Error(`process ${id} not found`), { statusCode: 404 });
    return res;
  }

  // pm2's own trigger() replaces the client's bus socket, so reimplement it on
  // top of the events re-emitted from our long-lived bus.
  async trigger(id, action, params) {
    if (!this.bus) throw new Error('pm2 daemon is offline');
    const cmd = { msg: action };
    if (params !== undefined && params !== '') cmd.opts = params;
    if (Number.isNaN(Number(id))) cmd.name = id;
    else cmd.id = Number(id);

    return withTimeout(
      new Promise((resolve, reject) => {
        const results = [];
        let expected = Infinity;
        const onReply = (event, data) => {
          if (event !== 'axm:reply') return;
          const p = data.process || {};
          if (p.name == id || p.pm_id == id || p.namespace == id || id === 'all') {
            results.push({ name: p.name, pm_id: p.pm_id, return: data.data?.return });
            if (results.length >= expected) done();
          }
        };
        const done = () => {
          this.off('bus', onReply);
          resolve(results);
        };
        this.on('bus', onReply);
        this.api.msgProcess(cmd, (err, data) => {
          if (err) {
            this.off('bus', onReply);
            return reject(toError(err));
          }
          if (!data || data.process_count === 0) {
            this.off('bus', onReply);
            return reject(new Error('No process received the action (offline or unknown)'));
          }
          expected = data.process_count;
          if (results.length >= expected) done();
        });
      }),
      CALL_TIMEOUT_MS,
      'trigger',
    );
  }

  pathFor(file) {
    return path.join(this.home, file);
  }
}

export const pm2 = new Pm2Client();
