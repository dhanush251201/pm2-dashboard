// Channel-based pub/sub between server modules and connected WebSocket clients.
// Channels: status, processes, metrics, events, jobs, logs:all, logs:<pm_id>, job:<id>
const subscribers = new Map(); // channel -> Set<socket>
const retained = new Map(); // channel -> last message, replayed on subscribe

export function subscribe(socket, channel) {
  if (!subscribers.has(channel)) subscribers.set(channel, new Set());
  subscribers.get(channel).add(socket);
  if (retained.has(channel)) send(socket, channel, retained.get(channel));
}

export function unsubscribe(socket, channel) {
  subscribers.get(channel)?.delete(socket);
}

export function unsubscribeAll(socket) {
  for (const set of subscribers.values()) set.delete(socket);
}

export function hasSubscribers(channel) {
  return (subscribers.get(channel)?.size ?? 0) > 0;
}

// retain=true keeps the message so late subscribers get the latest state.
export function publish(channel, data, { retain = false } = {}) {
  if (retain) retained.set(channel, data);
  const set = subscribers.get(channel);
  if (!set) return;
  const msg = JSON.stringify({ ch: channel, data });
  for (const socket of set) {
    if (socket.readyState === 1) socket.send(msg);
  }
}

function send(socket, channel, data) {
  if (socket.readyState === 1) socket.send(JSON.stringify({ ch: channel, data }));
}
