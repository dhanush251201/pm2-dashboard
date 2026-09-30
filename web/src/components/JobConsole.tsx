// Live output of a pm2 CLI job (install, deploy, startup, ...), rendered in xterm.
import { useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import { Check, Copy, Square } from 'lucide-react';
import { XTerm } from './XTerm';
import { Badge, Button, Spinner } from './ui';
import { api } from '../lib/api';
import { subscribe } from '../lib/ws';
import { useJobs } from '../lib/store';
import { duration } from '../lib/format';
import type { Job } from '../lib/types';

export function JobStatus({ status }: { status: Job['status'] }) {
  if (status === 'running')
    return (
      <Badge tone="accent">
        <Spinner className="size-3 text-accent" /> running
      </Badge>
    );
  if (status === 'success') return <Badge tone="good">✓ success</Badge>;
  if (status === 'killed') return <Badge tone="warning">■ killed</Badge>;
  if (status === 'needs_sudo') return <Badge tone="warning">! action needed</Badge>;
  return <Badge tone="critical">✕ failed</Badge>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      icon={done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

export function JobConsole({ id, height = 'h-80' }: { id: string; height?: string }) {
  const jobs = useJobs();
  const listed = jobs.find((j) => j.id === id);
  const [job, setJob] = useState<Job | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    let written = 0;
    let ready = false;
    const pending: { data: string; offset: number }[] = [];
    const write = (c: { data: string; offset: number }) => {
      const end = c.offset + c.data.length;
      if (end <= written) return;
      termRef.current?.write(c.data.slice(Math.max(0, written - c.offset)));
      written = end;
    };
    const unsub = subscribe(`job:${id}`, (m) => {
      if (m.type === 'data') {
        if (ready) write(m);
        else pending.push(m);
      } else if (m.type === 'exit') {
        setJob((j) => (j ? { ...j, status: m.status, code: m.code, sudo: m.sudo, endedAt: Date.now() } : j));
      }
    });
    api.get<Job>(`/api/jobs/${id}`).then((j) => {
      setJob(j);
      termRef.current?.write(j.output || '');
      written = (j.output || '').length;
      ready = true;
      pending.forEach(write);
    });
    return unsub;
  }, [id]);

  const status = listed?.status ?? job?.status ?? 'running';
  const sudo = listed?.sudo ?? job?.sudo;
  const started = job?.startedAt ?? listed?.startedAt;
  const ended = listed?.endedAt ?? job?.endedAt;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <JobStatus status={status} />
          <code className="truncate font-mono text-xs text-ink-2">{job?.command ?? listed?.command}</code>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted tabular">
          {started && <span>{duration((ended ?? Date.now()) - started)}</span>}
          {status === 'running' && (
            <Button size="sm" variant="danger" icon={<Square className="size-3" />} onClick={() => api.post(`/api/jobs/${id}/kill`)}>
              Stop
            </Button>
          )}
        </div>
      </div>
      {sudo && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3">
          <p className="mb-2 text-[13px] text-ink">
            This step needs administrator rights. Run this command in your own terminal:
          </p>
          <div className="flex items-start gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-surface px-2 py-1.5 font-mono text-xs whitespace-pre-wrap break-all">{sudo}</code>
            <CopyButton text={sudo} />
          </div>
        </div>
      )}
      <XTerm className={height} onReady={(t) => void (termRef.current = t)} />
    </div>
  );
}
