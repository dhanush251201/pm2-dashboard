// App shell: sidebar navigation, top bar (daemon status, jobs, search, theme),
// offline banner, and crash alerts.
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Command, Moon, Power, Sun, SunMoon, TerminalSquare, Unplug } from 'lucide-react';
import { NAV } from './nav';
import { Button, Spinner } from './ui';
import { CommandPalette } from './CommandPalette';
import { useJobPanel } from './JobsDrawer';
import { onPmEvent, useJobs, useProcesses, useStatus } from '../lib/store';
import { useSocketConnected } from '../lib/ws';
import { useAction, useFeedback } from '../lib/feedback';
import { api } from '../lib/api';
import { notificationsEnabled } from '../lib/prefs';

type Theme = 'system' | 'light' | 'dark';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || 'system');
  const cycle = () => {
    const next: Theme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
    setTheme(next);
    try {
      if (next === 'system') {
        delete document.documentElement.dataset.theme;
        localStorage.removeItem('pm2dash-theme');
      } else {
        document.documentElement.dataset.theme = next;
        localStorage.setItem('pm2dash-theme', next);
      }
    } catch {
      // storage blocked
    }
  };
  return [theme, cycle];
}

// Toast (and optionally desktop-notify) on crashes and crash loops, throttled per
// process: at most one crash/exception toast per 20s, one crash-loop alert per minute.
function useCrashAlerts() {
  const { toast } = useFeedback();
  const exits = useRef(new Map<number, number[]>());
  const lastToast = useRef(new Map<number, number>());
  const loopMuted = useRef(new Map<number, number>());
  useEffect(
    () =>
      onPmEvent((e) => {
        if (e.pm_id == null) return;
        const id = e.pm_id;
        const now = Date.now();
        const quiet = now - (lastToast.current.get(id) ?? 0) < 20_000;

        if (e.kind === 'exception') {
          if (quiet) return;
          lastToast.current.set(id, now);
          toast({ tone: 'error', title: `Exception in ${e.name}`, body: e.message });
          return;
        }
        if (e.kind !== 'process') return;

        if (e.event === 'exit' && !e.manually) {
          const list = (exits.current.get(id) || []).filter((t) => now - t < 60_000);
          list.push(now);
          exits.current.set(id, list);
          const loop = list.length >= 3;
          if (loop) {
            if ((loopMuted.current.get(id) ?? 0) > now) return;
            loopMuted.current.set(id, now + 60_000);
          } else if (quiet) return;
          lastToast.current.set(id, now);
          const title = loop ? `${e.name} is crash-looping` : `${e.name} exited unexpectedly`;
          const body = loop ? `${list.length} exits in the last minute.` : `Exit code ${e.exit_code ?? '?'} — pm2 will restart it if autorestart is on.`;
          toast({ tone: loop ? 'error' : 'warning', title, body });
          if (notificationsEnabled() && 'Notification' in window && Notification.permission === 'granted' && (loop || document.hidden)) {
            new Notification(title, { body, tag: `pm2-${id}` });
          }
        } else if (e.event === 'errored') {
          toast({ tone: 'error', title: `${e.name} errored`, body: 'pm2 stopped restarting it (too many unstable restarts).' });
        }
      }),
    [toast],
  );
}

function OfflineBanner() {
  const status = useStatus();
  const { busy, run } = useAction();
  if (status.online) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-warning/50 bg-warning/15 px-5 py-2.5 text-[13px]">
      <Unplug className="size-4 text-warning-ink" />
      <span className="text-ink">
        <strong>The pm2 daemon is not running.</strong> Nothing is being managed right now.
      </span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="primary" loading={busy === 'ping'} icon={<Power className="size-3.5" />} onClick={() => run('ping', () => api.post('/api/system/ping'), 'pm2 daemon started')}>
          Start daemon
        </Button>
        <Button
          size="sm"
          loading={busy === 'res'}
          onClick={() =>
            run(
              'res',
              async () => {
                await api.post('/api/system/ping');
                return api.post('/api/system/resurrect');
              },
              'Restored saved processes',
            )
          }
        >
          Start + resurrect saved list
        </Button>
      </div>
    </div>
  );
}

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, cycleTheme] = useTheme();
  const status = useStatus();
  const connected = useSocketConnected();
  const jobs = useJobs();
  const procs = useProcesses();
  const { show } = useJobPanel();
  useCrashAlerts();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const running = jobs.filter((j) => j.status === 'running').length;
  const online = procs?.filter((p) => p.status === 'online').length ?? 0;
  const errored = procs?.filter((p) => p.status === 'errored').length ?? 0;

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <div className="flex size-7 items-center justify-center rounded-lg bg-accent text-white">
            <svg viewBox="0 0 32 32" className="size-5" aria-hidden="true">
              <path d="M5 20l6-7 5 5 5-8 6 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">PM2 Dashboard</div>
            <div className="text-[11px] text-muted">localhost</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium ${
                  isActive ? 'bg-accent/12 text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              <n.icon className="size-4" />
              {n.label}
              {n.to === '/jobs' && running > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 text-[10px] text-white">{running}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3 text-xs text-muted tabular">
          <div className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${status.online ? 'bg-good' : 'bg-critical'}`} aria-hidden="true" />
            {status.online ? `Daemon online · pid ${status.daemonPid ?? '—'}` : 'Daemon offline'}
          </div>
          <div className="mt-0.5">
            {online} online{errored ? ` · ${errored} errored` : ''} · {procs?.length ?? 0} total
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:hidden" aria-label="Main (mobile)">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                title={n.label}
                className={({ isActive }) => `rounded-md p-1.5 ${isActive ? 'bg-accent/12 text-accent' : 'text-ink-2'}`}
              >
                <n.icon className="size-4" />
              </NavLink>
            ))}
          </nav>
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden h-8 w-72 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 text-[13px] text-muted hover:border-accent md:flex cursor-pointer"
          >
            <Command className="size-3.5" />
            Search or run a command…
            <kbd className="ml-auto rounded border border-line px-1 text-[10px]">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            {!connected && (
              <span className="flex items-center gap-1.5 text-xs text-warning-ink">
                <Spinner className="size-3.5" /> Reconnecting…
              </span>
            )}
            <Button size="sm" variant="ghost" icon={<TerminalSquare className="size-3.5" />} onClick={() => show()}>
              Jobs{running ? ` (${running} running)` : ''}
            </Button>
            <button
              onClick={cycleTheme}
              className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer"
              title={`Theme: ${theme}`}
              aria-label={`Theme: ${theme}. Click to change.`}
            >
              {theme === 'dark' ? <Moon className="size-4" /> : theme === 'light' ? <Sun className="size-4" /> : <SunMoon className="size-4" />}
            </button>
          </div>
        </header>
        <OfflineBanner />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
