// Slide-over panel listing CLI jobs with a live console for the selected one.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { IconButton } from './ui';
import { JobConsole, JobStatus } from './JobConsole';
import { useJobs } from '../lib/store';
import { useFeedback } from '../lib/feedback';
import { ago } from '../lib/format';
import type { Job } from '../lib/types';

interface JobPanelCtx {
  show: (id?: string) => void;
  // Run an API call that returns a Job and open its console.
  start: (fn: () => Promise<Job>) => Promise<Job | undefined>;
}

const Ctx = createContext<JobPanelCtx | null>(null);

export function JobPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { toast } = useFeedback();
  const jobs = useJobs();

  const show = useCallback((id?: string) => {
    if (id) setSelected(id);
    setOpen(true);
  }, []);

  const start = useCallback(
    async (fn: () => Promise<Job>) => {
      try {
        const job = await fn();
        show(job.id);
        return job;
      } catch (err: any) {
        toast({ tone: 'error', title: 'Could not start command', body: err?.message });
        return undefined;
      }
    },
    [show, toast],
  );

  const current = selected ?? jobs[0]?.id ?? null;

  return (
    <Ctx.Provider value={{ show, start }}>
      {children}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={() => setOpen(false)}>
            <aside
              className="flex h-full w-full max-w-3xl flex-col border-l border-line bg-bg shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Jobs"
            >
              <header className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <h2 className="font-semibold">Command jobs</h2>
                  <p className="text-xs text-muted">pm2 CLI commands started from the dashboard</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link to="/jobs" className="text-xs text-accent hover:underline" onClick={() => setOpen(false)}>
                    Open jobs page
                  </Link>
                  <IconButton label="Close" onClick={() => setOpen(false)}>
                    <X className="size-4" />
                  </IconButton>
                </div>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                {current ? <JobConsole key={current} id={current} height="h-[45vh]" /> : <p className="text-[13px] text-muted">No jobs yet.</p>}
                <JobList jobs={jobs} selected={current} onSelect={setSelected} />
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export function JobList({ jobs, selected, onSelect }: { jobs: Job[]; selected: string | null; onSelect: (id: string) => void }) {
  if (!jobs.length) return null;
  return (
    <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto rounded-lg border border-line bg-surface">
      {jobs.map((j) => (
        <li key={j.id}>
          <button
            onClick={() => onSelect(j.id)}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left cursor-pointer hover:bg-surface-2 ${selected === j.id ? 'bg-surface-2' : ''}`}
          >
            <JobStatus status={j.status} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{j.command}</span>
            <span className="shrink-0 text-xs text-muted">{ago(j.startedAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function useJobPanel() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('JobPanelProvider missing');
  return ctx;
}
