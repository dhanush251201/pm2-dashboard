// pm2 monit equivalent: host load plus per-process CPU and memory charts.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageHeader, StatusBadge } from '../components/ui';
import { TimeChart } from '../components/charts';
import { useHistory, useProcesses } from '../lib/store';
import { useFetch } from '../lib/useFetch';
import { bytes, duration, pct } from '../lib/format';
import type { SystemInfo } from '../lib/types';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

export default function MetricsPage() {
  const history = useHistory();
  const procs = (useProcesses() ?? []).filter((p) => !p.is_module);
  const { data: sys } = useFetch<SystemInfo>('/api/system');
  const [focus, setFocus] = useState<number | 'all'>('all');
  const host = history.host;
  const latest = host.at(-1);
  const totalCpu = procs.reduce((a, p) => a + (p.cpu || 0), 0);
  const totalMem = procs.reduce((a, p) => a + (p.memory || 0), 0);
  const shown = focus === 'all' ? procs : procs.filter((p) => p.pm_id === focus);

  return (
    <>
      <PageHeader
        title="Metrics"
        subtitle="Live CPU and memory, sampled every 2 seconds (last 15 minutes)"
        actions={
          <select className="input w-auto" value={String(focus)} onChange={(e) => setFocus(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Process">
            <option value="all">All processes</option>
            {procs.map((p) => (
              <option key={p.pm_id} value={p.pm_id}>
                {p.name} #{p.pm_id}
              </option>
            ))}
          </select>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Host CPU" value={pct(latest?.cpu ?? 0)} sub={sys ? `${sys.host.cpus} cores · load ${sys.host.loadavg.map((l) => l.toFixed(2)).join(' ')}` : undefined} />
        <Stat label="Host memory used" value={bytes(latest?.mem ?? 0)} sub={sys ? `of ${bytes(sys.host.totalmem)}` : undefined} />
        <Stat label="pm2 apps CPU" value={pct(totalCpu)} sub={`${procs.filter((p) => p.status === 'online').length} online processes`} />
        <Stat label="pm2 apps memory" value={bytes(totalMem)} sub={sys ? `host up ${duration(sys.host.uptime * 1000)}` : undefined} />
      </div>
      {focus === 'all' && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <TimeChart title="Host CPU" points={host} field="cpu" colorVar="--series-1" height={160} />
          </Card>
          <Card>
            <TimeChart title="Host memory used" points={host} field="mem" colorVar="--series-2" height={160} />
          </Card>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {shown.map((p) => (
          <Card
            key={p.pm_id}
            title={
              <Link to={`/process/${p.pm_id}?tab=metrics`} className="hover:text-accent">
                {p.name} <span className="font-normal text-muted">#{p.pm_id}</span>
              </Link>
            }
            actions={<StatusBadge status={p.status} />}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <TimeChart title="CPU" points={history.processes[p.pm_id] || []} field="cpu" colorVar="--series-1" height={140} />
              <TimeChart title="Memory" points={history.processes[p.pm_id] || []} field="mem" colorVar="--series-2" height={140} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
