// Forwards pm2 bus traffic (logs, lifecycle events, exceptions) to WebSocket
// channels and keeps a short in-memory event history.
import { pm2 } from './pm2client.js';
import { publish } from './hub.js';

const MAX_EVENTS = 500;
const MANUAL_WINDOW_MS = 2_000;
const EXIT_SETTLE_MS = 1_000;
const events = [];
const lastManual = new Map(); // pm_id -> time of the last manual action

function pushEvent(e) {
  // cluster workers report "exit" twice (stopping, then stopped); keep one
  if (e.event === 'exit' && events.some((x) => x.event === 'exit' && x.pm_id === e.pm_id && Math.abs(x.at - e.at) < 1_000)) return;
  // keep chronological order even when an exit was held back
  let i = events.length;
  while (i > 0 && events[i - 1].at > e.at) i--;
  events.splice(i, 0, e);
  if (events.length > MAX_EVENTS) events.shift();
  publish('events', e);
}

function recentlyManual(pmId, at) {
  return Math.abs(at - (lastManual.get(pmId) ?? -Infinity)) < MANUAL_WINDOW_MS;
}

// pm2 reports the exit of a stop/restart/reload *before* the manual event that
// caused it, with manually=false. Hold exits briefly so they can be classified.
function onExit(e) {
  if (e.status === 'stopping' || recentlyManual(e.pm_id, e.at)) {
    e.manually = true;
    return pushEvent(e);
  }
  setTimeout(() => {
    if (recentlyManual(e.pm_id, e.at)) e.manually = true;
    pushEvent(e);
  }, EXIT_SETTLE_MS);
}

export function getEvents() {
  return events;
}

export function startBus() {
  pm2.on('bus', (event, data) => {
    if (!data || typeof data !== 'object') return;
    const proc = data.process || {};

    if (event === 'log:out' || event === 'log:err') {
      const line = {
        pm_id: proc.pm_id,
        name: proc.name,
        type: event === 'log:out' ? 'out' : 'err',
        at: data.at || Date.now(),
        data: String(data.data ?? ''),
      };
      publish(`logs:${proc.pm_id}`, line);
      publish('logs:all', line);
      return;
    }

    if (event === 'process:event') {
      if (data.manually) lastManual.set(proc.pm_id, data.at || Date.now());
      const e = {
        kind: 'process',
        event: data.event,
        manually: !!data.manually,
        pm_id: proc.pm_id,
        name: proc.name,
        namespace: proc.namespace,
        status: proc.status,
        restarts: proc.restart_time,
        exit_code: proc.exit_code,
        at: data.at || Date.now(),
      };
      if (e.event === 'exit' && !e.manually) onExit(e);
      else pushEvent(e);
      return;
    }

    if (event === 'process:exception') {
      pushEvent({
        kind: 'exception',
        event: 'exception',
        pm_id: proc.pm_id,
        name: proc.name,
        message: data.data?.message || data.data?.stack || JSON.stringify(data.data).slice(0, 500),
        at: data.at || Date.now(),
      });
    }
  });

  pm2.on('status', (online) => {
    publish('status', { online, daemonPid: pm2.daemonPid() }, { retain: true });
    pushEvent({ kind: 'daemon', event: online ? 'daemon online' : 'daemon offline', at: Date.now() });
  });
  publish('status', { online: pm2.online, daemonPid: pm2.daemonPid() }, { retain: true });
}
