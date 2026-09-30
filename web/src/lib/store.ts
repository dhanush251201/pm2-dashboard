// Long-lived client stores fed by the WebSocket (process list, metrics history,
// events, jobs, daemon status). Kept outside React so pages share one copy.
import { useSyncExternalStore } from 'react';
import { api } from './api';
import { subscribe } from './ws';
import type { Job, PmEvent, Point, Proc } from './types';

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}

const MAX_POINTS = 450;
const MAX_EVENTS = 500;

export const processesStore = createStore<Proc[] | null>(null);
export const statusStore = createStore<{ online: boolean; daemonPid: number | null }>({ online: true, daemonPid: null });
export const historyStore = createStore<{ processes: Record<number, Point[]>; host: Point[] }>({ processes: {}, host: [] });
export const eventsStore = createStore<PmEvent[]>([]);
export const jobsStore = createStore<Job[]>([]);

type EventListener = (e: PmEvent) => void;
const eventListeners = new Set<EventListener>();
export function onPmEvent(fn: EventListener): () => void {
  eventListeners.add(fn);
  return () => {
    eventListeners.delete(fn);
  };
}

let started = false;
export async function startStores() {
  if (started) return;
  started = true;

  subscribe('processes', (list: Proc[]) => processesStore.set(list));
  subscribe('status', (s) => statusStore.set(s));
  subscribe('jobs', (jobs: Job[]) => jobsStore.set(jobs));
  subscribe('events', (e: PmEvent) => {
    const next = [...eventsStore.get(), e].sort((a, b) => a.at - b.at);
    if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS);
    eventsStore.set(next);
    eventListeners.forEach((l) => l(e));
  });
  subscribe('metrics', (m: { t: number; points: Record<number, Point>; host: Point }) => {
    const prev = historyStore.get();
    const processes: Record<number, Point[]> = {};
    for (const [id, p] of Object.entries(m.points)) {
      const arr = [...(prev.processes[Number(id)] || []), p];
      if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
      processes[Number(id)] = arr;
    }
    const host = [...prev.host, m.host];
    if (host.length > MAX_POINTS) host.splice(0, host.length - MAX_POINTS);
    historyStore.set({ processes, host });
  });

  const [history, events, jobs] = await Promise.all([
    api.get('/api/metrics/history'),
    api.get<PmEvent[]>('/api/events'),
    api.get<Job[]>('/api/jobs'),
  ]);
  historyStore.set(history);
  eventsStore.set(events);
  if (jobsStore.get().length === 0) jobsStore.set(jobs);
}

export const useProcesses = () => useStore(processesStore);
export const useStatus = () => useStore(statusStore);
export const useHistory = () => useStore(historyStore);
export const useEvents = () => useStore(eventsStore);
export const useJobs = () => useStore(jobsStore);
