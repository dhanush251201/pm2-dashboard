// One shared WebSocket with channel subscriptions, auto-reconnect and resubscribe.
import { useEffect, useRef, useSyncExternalStore } from 'react';

type Handler = (data: any) => void;

const handlers = new Map<string, Set<Handler>>();
let socket: WebSocket | null = null;
let connected = false;
let started = false;
const connListeners = new Set<() => void>();

function send(msg: object) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function setConnected(v: boolean) {
  connected = v;
  connListeners.forEach((l) => l());
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;
  ws.onopen = () => {
    setConnected(true);
    for (const ch of handlers.keys()) send({ type: 'sub', ch });
  };
  ws.onmessage = (e) => {
    try {
      const { ch, data } = JSON.parse(e.data);
      handlers.get(ch)?.forEach((h) => h(data));
    } catch {
      // ignore malformed frames
    }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    setConnected(false);
    setTimeout(connect, 1500);
  };
}

export function startSocket() {
  if (started) return;
  started = true;
  connect();
}

export function subscribe(ch: string, fn: Handler): () => void {
  let set = handlers.get(ch);
  if (!set) {
    set = new Set();
    handlers.set(ch, set);
    send({ type: 'sub', ch });
  }
  set.add(fn);
  return () => {
    const s = handlers.get(ch);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) {
      handlers.delete(ch);
      send({ type: 'unsub', ch });
    }
  };
}

export function useChannel(ch: string | null, fn: Handler) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!ch) return;
    return subscribe(ch, (d) => ref.current(d));
  }, [ch]);
}

export function useSocketConnected() {
  return useSyncExternalStore(
    (cb) => {
      connListeners.add(cb);
      return () => connListeners.delete(cb);
    },
    () => connected,
  );
}
