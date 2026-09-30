// pm2 logs / flush / reloadLogs, plus the daemon's own pm2.log.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eraser, FileClock, RefreshCw } from 'lucide-react';
import { Button, Card, PageHeader, Tabs } from '../components/ui';
import { LogViewer } from '../components/LogViewer';
import { useProcesses } from '../lib/store';
import { useFetch } from '../lib/useFetch';
import { useAction, useFeedback } from '../lib/feedback';
import { api } from '../lib/api';

function DaemonLog() {
  const { data, reload, loading } = useFetch<{ path: string; lines: string[] }>('/api/system/pm2log?lines=500');
  return (
    <Card
      title="pm2 daemon log"
      subtitle={data?.path}
      actions={
        <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={reload}>
          Refresh
        </Button>
      }
    >
      <pre className="h-[60vh] overflow-auto rounded-lg border border-line bg-[var(--term-bg)] p-2 font-mono text-[12px] leading-[1.45] whitespace-pre-wrap text-[var(--term-fg)]">
        {data?.lines.join('\n') || 'Empty.'}
      </pre>
    </Card>
  );
}

export default function LogsPage() {
  const procs = useProcesses() ?? [];
  const [tab, setTab] = useState<'apps' | 'daemon'>('apps');
  const [source, setSource] = useState<'all' | number>('all');
  const { run, busy } = useAction();
  const { confirm } = useFeedback();

  return (
    <>
      <PageHeader
        title="Logs"
        subtitle="Live output from every process managed by pm2"
        actions={
          <>
            <Button
              icon={<FileClock className="size-3.5" />}
              loading={busy === 'reload'}
              onClick={() => run('reload', () => api.post('/api/system/reloadLogs'), 'Log files reopened (pm2 reloadLogs)')}
              title="Reopen log files, e.g. after an external tool rotated them"
            >
              Reload log files
            </Button>
            <Button
              variant="danger"
              icon={<Eraser className="size-3.5" />}
              loading={busy === 'flush'}
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Flush all logs?',
                    body: 'Empties the out/error log files of every process and the pm2 daemon log. This cannot be undone.',
                    confirmText: 'Flush all',
                    danger: true,
                  })
                )
                  run('flush', () => api.post('/api/system/flush'), 'All logs flushed');
              }}
            >
              Flush all
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Tabs
          tabs={[
            { id: 'apps', label: 'Application logs' },
            { id: 'daemon', label: 'pm2 daemon log' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'apps' ? (
        <Card
          title={
            <select
              className="input w-auto"
              value={String(source)}
              onChange={(e) => setSource(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              aria-label="Log source"
            >
              <option value="all">All processes (live only)</option>
              {procs.map((p) => (
                <option key={p.pm_id} value={p.pm_id}>
                  {p.name} #{p.pm_id}
                </option>
              ))}
            </select>
          }
          subtitle={source === 'all' ? 'Shows new lines as they arrive. Pick a process to also load its recent history.' : undefined}
        >
          <LogViewer key={String(source)} source={source} showName={source === 'all'} />
          <p className="hint mt-2">
            Automatic log rotation is available as the pm2-logrotate module — see{' '}
            <Link to="/system" className="text-accent hover:underline">
              System → Log rotation
            </Link>
            .
          </p>
        </Card>
      ) : (
        <DaemonLog />
      )}
    </>
  );
}
