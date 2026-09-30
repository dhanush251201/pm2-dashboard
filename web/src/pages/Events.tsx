// Timeline of process lifecycle events, exceptions and daemon status changes.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, CircleStop, History, Play, Power, RotateCw, XCircle } from 'lucide-react';
import { Badge, Card, Empty, PageHeader } from '../components/ui';
import { useEvents } from '../lib/store';
import { dateTime } from '../lib/format';
import type { PmEvent } from '../lib/types';

function describe(e: PmEvent) {
  if (e.kind === 'daemon') return { icon: <Power className="size-4 text-muted" />, tone: 'neutral' as const, text: e.event };
  if (e.kind === 'exception') return { icon: <AlertOctagon className="size-4 text-critical" />, tone: 'critical' as const, text: e.message || 'exception' };
  switch (e.event) {
    case 'online':
      return { icon: <Play className="size-4 text-good" />, tone: 'good' as const, text: 'came online' };
    case 'start':
      return { icon: <Play className="size-4 text-good" />, tone: 'good' as const, text: 'started' };
    case 'restart':
      return { icon: <RotateCw className="size-4 text-accent" />, tone: 'accent' as const, text: 'restarted' };
    case 'reload':
      return { icon: <RotateCw className="size-4 text-accent" />, tone: 'accent' as const, text: 'reloaded' };
    case 'stop':
      return { icon: <CircleStop className="size-4 text-muted" />, tone: 'neutral' as const, text: 'stopped' };
    case 'exit':
      return e.manually
        ? { icon: <CircleStop className="size-4 text-muted" />, tone: 'neutral' as const, text: `exited (code ${e.exit_code ?? '?'})` }
        : { icon: <XCircle className="size-4 text-critical" />, tone: 'critical' as const, text: `crashed / exited unexpectedly (code ${e.exit_code ?? '?'})` };
    case 'delete':
      return { icon: <CircleStop className="size-4 text-muted" />, tone: 'neutral' as const, text: 'deleted' };
    case 'errored':
      return { icon: <XCircle className="size-4 text-critical" />, tone: 'critical' as const, text: 'errored — too many unstable restarts' };
    default:
      return { icon: <History className="size-4 text-muted" />, tone: 'neutral' as const, text: e.event };
  }
}

export default function EventsPage() {
  const events = useEvents();
  const [filter, setFilter] = useState<'all' | 'problems'>('all');
  const [name, setName] = useState('');
  const names = useMemo(() => [...new Set(events.map((e) => e.name).filter(Boolean))] as string[], [events]);
  const rows = [...events]
    .reverse()
    .filter((e) => (filter === 'all' ? true : e.kind === 'exception' || (e.event === 'exit' && !e.manually) || e.event === 'errored'))
    .filter((e) => !name || e.name === name);

  return (
    <>
      <PageHeader title="Events" subtitle="Starts, restarts, crashes and exceptions since the dashboard started (last 500)" />
      <div className="mb-3 flex gap-2">
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as any)} aria-label="Event type">
          <option value="all">All events</option>
          <option value="problems">Crashes & exceptions only</option>
        </select>
        <select className="input w-auto" value={name} onChange={(e) => setName(e.target.value)} aria-label="Process">
          <option value="">All processes</option>
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </div>
      <Card padded={false}>
        {rows.length === 0 ? (
          <Empty icon={<History className="size-8" />} title="No events yet">
            Events appear here as processes start, stop, restart or crash.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((e, i) => {
              const d = describe(e);
              return (
                <li key={`${e.at}-${i}`} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                  <div className="mt-0.5">{d.icon}</div>
                  <div className="min-w-0 flex-1">
                    {e.name ? (
                      <Link to={`/process/${e.pm_id}`} className="font-medium hover:text-accent">
                        {e.name}
                      </Link>
                    ) : (
                      <span className="font-medium">pm2</span>
                    )}{' '}
                    <span className={d.tone === 'critical' ? 'text-critical-ink' : 'text-ink-2'}>{d.text}</span>
                    {e.kind === 'process' && e.manually && <Badge>manual</Badge>}
                  </div>
                  <time className="shrink-0 text-xs text-muted tabular">{dateTime(e.at)}</time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
