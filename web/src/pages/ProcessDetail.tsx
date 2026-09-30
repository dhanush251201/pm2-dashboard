// pm2 describe/show/env/logs/monit/attach/sendSignal/trigger/pull for one process.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Terminal } from '@xterm/xterm';
import {
  ArrowLeft,
  ChevronDown,
  Eraser,
  Eye,
  EyeOff,
  GitBranch,
  Layers,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
  Zap,
} from 'lucide-react';
import { Badge, Button, Card, Empty, Field, KV, Menu, MenuItem, MenuSeparator, PageHeader, Spinner, StatusBadge, Tabs, Toggle } from '../components/ui';
import { TimeChart } from '../components/charts';
import { LogViewer } from '../components/LogViewer';
import { XTerm } from '../components/XTerm';
import { CodeEditor } from '../components/CodeEditor';
import { CopyButton } from '../components/JobConsole';
import { useJobPanel } from '../components/JobsDrawer';
import { useHistory, useProcesses } from '../lib/store';
import { useProcActions } from '../lib/procActions';
import { useAction } from '../lib/feedback';
import { useFetch } from '../lib/useFetch';
import { useChannel } from '../lib/ws';
import { api } from '../lib/api';
import { bytes, dateTime, pct, since } from '../lib/format';
import type { LogLine, Proc } from '../lib/types';

type Tab = 'overview' | 'logs' | 'metrics' | 'env' | 'terminal' | 'actions' | 'git' | 'raw';

const SECRET = /(SECRET|TOKEN|PASSW|PWD|KEY|AUTH|CREDENTIAL|PRIVATE|COOKIE|SESSION|DSN|DATABASE_URL)/i;

function yesNo(v: unknown) {
  return v === undefined || v === null ? '—' : v ? 'yes' : 'no';
}

function Overview({ d, live }: { d: any; live: Proc }) {
  const e = d.pm2_env || {};
  const siblings = (useProcesses() ?? []).filter((p) => p.name === live.name && p.pm_id !== live.pm_id);
  const metrics = Object.entries(live.axm_monitor || {});
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Process">
        <KV
          items={[
            ['id', live.pm_id],
            ['pid', live.pid || '—'],
            ['status', <StatusBadge status={live.status} />],
            ['namespace', live.namespace],
            ['exec mode', e.exec_mode],
            ['instances', e.exec_mode === 'cluster_mode' ? `${siblings.length + 1} running (${e.instances} configured)` : e.instances],
            ['uptime', live.status === 'online' ? since(live.uptime) : '—'],
            ['created', dateTime(e.created_at)],
            ['restarts', `${live.restarts} (${live.unstable_restarts} unstable)`],
            ['user', e.username],
          ]}
        />
      </Card>
      <Card title="Script">
        <KV
          items={[
            ['script', <code className="font-mono text-xs">{e.pm_exec_path}</code>],
            ['cwd', <code className="font-mono text-xs">{e.pm_cwd}</code>],
            ['interpreter', e.exec_interpreter],
            ['interpreter args', (e.node_args || []).join(' ') || '—'],
            ['args', Array.isArray(e.args) ? e.args.join(' ') || '—' : e.args || '—'],
            ['version', e.version],
            ['node', e.node_version],
          ]}
        />
      </Card>
      <Card title="Restart behaviour">
        <KV
          items={[
            ['autorestart', yesNo(e.autorestart !== false)],
            ['watch', e.watch ? (Array.isArray(e.watch) ? e.watch.join(', ') : 'yes') : 'no'],
            ['ignore watch', Array.isArray(e.ignore_watch) ? e.ignore_watch.join(', ') : e.ignore_watch || '—'],
            ['max memory restart', e.max_memory_restart ? bytes(e.max_memory_restart) : '—'],
            ['cron restart', e.cron_restart || '—'],
            ['max restarts', e.max_restarts ?? '—'],
            ['min uptime', e.min_uptime ? `${e.min_uptime} ms` : '—'],
            ['restart delay', e.restart_delay ? `${e.restart_delay} ms` : '—'],
            ['exp backoff', e.exp_backoff_restart_delay ? `${e.exp_backoff_restart_delay} ms` : '—'],
            ['kill timeout', e.kill_timeout ? `${e.kill_timeout} ms` : '—'],
          ]}
        />
      </Card>
      <Card title="Logs">
        <KV
          items={[
            ['out', <code className="font-mono text-xs">{e.pm_out_log_path}</code>],
            ['error', <code className="font-mono text-xs">{e.pm_err_log_path}</code>],
            ['combined', e.pm_log_path ? <code className="font-mono text-xs">{e.pm_log_path}</code> : '—'],
            ['date format', e.log_date_format || '—'],
            ['merge logs', yesNo(e.merge_logs)],
            ['pid file', <code className="font-mono text-xs">{e.pm_pid_path}</code>],
          ]}
        />
      </Card>
      {metrics.length > 0 && (
        <Card title="Runtime metrics" subtitle="Reported by the app through pm2's io/pmx probes" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {metrics.map(([k, m]) => (
              <div key={k} className="rounded-lg border border-line p-3">
                <div className="text-xs text-muted">{k}</div>
                <div className="mt-1 text-lg font-semibold">
                  {String(m.value)}
                  {m.unit && <span className="ml-1 text-xs font-normal text-ink-2">{m.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {siblings.length > 0 && (
        <Card title="Other instances" className="lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            {siblings.map((s) => (
              <Link key={s.pm_id} to={`/process/${s.pm_id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] hover:border-accent">
                #{s.pm_id} <StatusBadge status={s.status} /> <span className="text-muted tabular">{pct(s.cpu)} · {bytes(s.memory)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function EnvTab({ d }: { d: any }) {
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [revealAll, setRevealAll] = useState(false);
  const [showInherited, setShowInherited] = useState(false);
  const [q, setQ] = useState('');
  const env: Record<string, string> = d.pm2_env?.env || {};
  const inherited = new Set<string>(d.inherited_env_keys || []);
  const keys = Object.keys(env)
    .filter((k) => showInherited || !inherited.has(k))
    .filter((k) => !q || k.toLowerCase().includes(q.toLowerCase()))
    .sort();
  const dotenv = Object.keys(env)
    .filter((k) => !inherited.has(k))
    .map((k) => `${k}=${JSON.stringify(String(env[k]))}`)
    .join('\n');
  return (
    <Card
      title="Environment variables"
      subtitle={`${Object.keys(env).length - inherited.size} set for this app · ${inherited.size} inherited from the shell that started pm2`}
      actions={<CopyButton text={dotenv} label="Copy as .env" />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <input className="input max-w-60" placeholder="Filter variables" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter variables" />
        <Toggle checked={showInherited} onChange={setShowInherited} label="Show inherited shell variables" />
        <Toggle checked={revealAll} onChange={setRevealAll} label="Reveal secret-looking values" />
      </div>
      {keys.length === 0 ? (
        <p className="text-[13px] text-muted">No variables to show.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <tbody>
              {keys.map((k) => {
                const secret = SECRET.test(k) && !revealAll && !reveal.has(k);
                return (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="w-1/3 py-1.5 pr-4 align-top font-mono text-xs font-medium break-all">
                      {k} {inherited.has(k) && <Badge>inherited</Badge>}
                    </td>
                    <td className="py-1.5 font-mono text-xs break-all text-ink-2">
                      {secret ? (
                        <button className="inline-flex items-center gap-1 text-muted hover:text-ink cursor-pointer" onClick={() => setReveal((s) => new Set(s).add(k))}>
                          •••••••• <Eye className="size-3.5" />
                        </button>
                      ) : (
                        <span className="inline-flex items-start gap-1">
                          {String(env[k])}
                          {reveal.has(k) && (
                            <button
                              aria-label="Hide"
                              className="text-muted hover:text-ink cursor-pointer"
                              onClick={() =>
                                setReveal((s) => {
                                  const n = new Set(s);
                                  n.delete(k);
                                  return n;
                                })
                              }
                            >
                              <EyeOff className="size-3.5" />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint mt-3">
        To change variables, edit them in your ecosystem file and use “Restart with updated env”, or start the process again from the Start process page.
      </p>
    </Card>
  );
}

// pm2 attach: live stdout/stderr plus a line-buffered stdin.
function TerminalTab({ proc }: { proc: Proc }) {
  const term = useRef<Terminal | null>(null);
  const line = useRef('');
  const prompt = '\x1b[38;5;244m› \x1b[0m';
  const { run } = useAction();

  const redrawInput = () => term.current?.write(`\r\x1b[2K${prompt}${line.current}`);

  useChannel(`logs:${proc.pm_id}`, (l: LogLine) => {
    const t = term.current;
    if (!t) return;
    const text = l.data.endsWith('\n') ? l.data : l.data + '\n';
    t.write('\r\x1b[2K' + (l.type === 'err' ? `\x1b[31m${text}\x1b[0m` : text));
    redrawInput();
  });

  const send = (text: string) => api.post(`/api/processes/${proc.pm_id}/stdin`, { line: text });

  const onData = (data: string) => {
    const t = term.current;
    if (!t) return;
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        const text = line.current;
        line.current = '';
        t.write('\r\n');
        send(text).catch((e) => t.write(`\x1b[31m[stdin failed: ${e.message}]\x1b[0m\r\n`));
        redrawInput();
      } else if (ch === '\x7f' || ch === '\b') {
        if (line.current) {
          line.current = line.current.slice(0, -1);
          t.write('\b \b');
        }
      } else if (ch === '\x03') {
        line.current = '';
        t.write('^C\r\n');
        run('sigint', () => api.post(`/api/processes/${proc.pm_id}/signal`, { signal: 'SIGINT' }), `Sent SIGINT to ${proc.name}`);
        redrawInput();
      } else if (ch === '\x15') {
        line.current = '';
        redrawInput();
      } else if (ch >= ' ' || ch === '\t') {
        line.current += ch;
        t.write(ch);
      }
    }
  };

  return (
    <Card
      title={`Attached to ${proc.name} (#${proc.pm_id})`}
      subtitle="Output streams live. Type a line and press Enter to write it to the process's stdin. Ctrl+C sends SIGINT."
    >
      <XTerm
        className="h-[60vh]"
        cursor
        onData={onData}
        onReady={(t) => {
          term.current = t;
          t.write(`\x1b[38;5;244m-- attached to ${proc.name}; only new output is shown --\x1b[0m\r\n`);
          redrawInput();
          t.focus();
        }}
      />
      {proc.exec_mode === 'cluster_mode' && <p className="hint mt-2">Cluster workers may not read stdin; fork mode apps usually do.</p>}
    </Card>
  );
}

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGUSR1', 'SIGUSR2', 'SIGQUIT', 'SIGKILL', 'SIGSTOP', 'SIGCONT', 'SIGWINCH'];

function ActionsTab({ proc }: { proc: Proc }) {
  const [signal, setSignal] = useState('SIGUSR2');
  const [params, setParams] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, unknown>>({});
  const { run, busy } = useAction();
  const { start } = useJobPanel();
  const custom = proc.axm_actions.filter((a) => a.type !== 'internal');
  const internal = proc.axm_actions.filter((a) => a.type === 'internal');

  const trigger = async (action: string) => {
    let p: unknown = params[action];
    if (typeof p === 'string' && p.trim()) {
      try {
        p = JSON.parse(p);
      } catch {
        // pass as plain string
      }
    } else p = undefined;
    const r = await run(`trigger:${action}`, () => api.post(`/api/processes/${proc.pm_id}/trigger`, { action, params: p }), `Ran ${action}`);
    if (r) setResults((s) => ({ ...s, [action]: r.result }));
  };

  // A render helper (not a component) so inputs keep focus across re-renders.
  const actionRow = (name: string, arity: number) => (
    <div key={name} className="border-b border-line py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-44 font-mono text-[13px]">{name}</code>
        {arity > 1 && (
          <input
            className="input max-w-72 flex-1 font-mono text-xs"
            placeholder="params (JSON or text)"
            value={params[name] ?? ''}
            onChange={(e) => setParams((s) => ({ ...s, [name]: e.target.value }))}
            aria-label={`Parameters for ${name}`}
          />
        )}
        <Button size="sm" icon={<Zap className="size-3.5" />} loading={busy === `trigger:${name}`} onClick={() => trigger(name)}>
          Run
        </Button>
      </div>
      {results[name] !== undefined && (
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-xs">{JSON.stringify(results[name], null, 2)}</pre>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Send a signal" subtitle="pm2 sendSignal">
        <div className="flex gap-2">
          <select className="input" value={signal} onChange={(e) => setSignal(e.target.value)} aria-label="Signal">
            {SIGNALS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <Button variant="primary" loading={busy === 'signal'} onClick={() => run('signal', () => api.post(`/api/processes/${proc.pm_id}/signal`, { signal }), `${signal} sent to ${proc.name}`)}>
            Send
          </Button>
        </div>
        <p className="hint">Signals go to process #{proc.pm_id} only. SIGKILL and SIGSTOP cannot be handled by the app.</p>
      </Card>
      <Card title="Debugging" subtitle="pm2 inspect · PM2 Plus monitoring">
        <div className="flex flex-wrap gap-2">
          <Button
            loading={busy === 'inspect'}
            onClick={() =>
              run('inspect', () => api.post(`/api/processes/${proc.pm_id}/inspect`), (r: any) =>
                r?.result?.[0]?.return === '' ? 'Inspector disabled' : 'Inspector enabled — open chrome://inspect',
              )
            }
          >
            Toggle Node inspector
          </Button>
          <Button onClick={() => start(() => api.post(`/api/processes/${encodeURIComponent(proc.name)}/monitor`))}>Monitor in PM2 Plus</Button>
          <Button onClick={() => start(() => api.post(`/api/processes/${encodeURIComponent(proc.name)}/unmonitor`))}>Unmonitor</Button>
        </div>
      </Card>
      <Card title="Custom actions" subtitle="pm2 trigger — actions the app registered with @pm2/io" className="lg:col-span-2">
        {custom.length === 0 ? (
          <p className="text-[13px] text-muted">
            This app hasn't registered any actions. Apps can expose buttons here with <code className="font-mono">io.action('name', cb)</code> from{' '}
            <code className="font-mono">@pm2/io</code>.
          </p>
        ) : (
          custom.map((a) => actionRow(a.name, a.arity))
        )}
        {internal.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted">Built-in pm2 actions ({internal.length})</summary>
            {internal.map((a) => actionRow(a.name, a.arity))}
          </details>
        )}
      </Card>
    </div>
  );
}

function GitTab({ proc }: { proc: Proc }) {
  const { start } = useJobPanel();
  const [commit, setCommit] = useState('');
  const v = proc.versioning;
  const name = encodeURIComponent(proc.name);
  if (!v)
    return (
      <Card>
        <Empty icon={<GitBranch className="size-8" />} title="No version control detected">
          pm2 found no git metadata for this app (it isn't in a git repo, or version tracking is off for it).
        </Empty>
      </Card>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Repository">
        <KV
          items={[
            ['type', v.type],
            ['url', v.url],
            ['branch', v.branch],
            ['revision', <code className="font-mono text-xs">{v.revision}</code>],
            ['comment', v.comment],
            ['unstaged changes', yesNo(v.unstaged)],
            ['ahead of remote', yesNo(v.ahead)],
            ['previous rev', v.prev_rev ? <code className="font-mono text-xs">{v.prev_rev}</code> : '—'],
            ['next rev', v.next_rev ? <code className="font-mono text-xs">{v.next_rev}</code> : '—'],
          ]}
        />
      </Card>
      <Card title="Update code" subtitle="Each command pulls/checks out and then reloads the app">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => start(() => api.post(`/api/processes/${name}/pull`))}>
              Pull latest (pm2 pull)
            </Button>
            <Button disabled={!v.prev_rev} onClick={() => start(() => api.post(`/api/processes/${name}/backward`))}>
              Previous commit (backward)
            </Button>
            <Button disabled={!v.next_rev} onClick={() => start(() => api.post(`/api/processes/${name}/forward`))}>
              Next commit (forward)
            </Button>
          </div>
          <Field label="Check out a specific commit">
            <div className="flex gap-2">
              <input className="input font-mono" value={commit} onChange={(e) => setCommit(e.target.value)} placeholder="commit id" />
              <Button disabled={!commit.trim()} onClick={() => start(() => api.post(`/api/processes/${name}/pull`, { commit: commit.trim() }))}>
                Pull commit
              </Button>
            </div>
          </Field>
        </div>
      </Card>
    </div>
  );
}

export default function ProcessDetailPage() {
  const { id } = useParams();
  const pmId = Number(id);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const procs = useProcesses();
  const history = useHistory();
  const live = procs?.find((p) => p.pm_id === pmId);
  const { data, error, reload } = useFetch<any>(`/api/processes/${pmId}`);
  const { act, busy } = useProcActions();
  const navigate = useNavigate();

  // Refresh the full description when status or restart count changes.
  const sig = `${live?.status}:${live?.restarts}:${live?.pid}`;
  useEffect(() => {
    if (live) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const points = history.processes[pmId] || [];
  const tabs = useMemo(
    () =>
      [
        { id: 'overview', label: 'Overview' },
        { id: 'logs', label: 'Logs' },
        { id: 'metrics', label: 'Metrics' },
        { id: 'env', label: 'Environment' },
        { id: 'terminal', label: 'Terminal' },
        { id: 'actions', label: 'Signals & actions' },
        { id: 'git', label: 'Git' },
        { id: 'raw', label: 'Raw JSON' },
      ] as { id: Tab; label: string }[],
    [],
  );

  if (procs && !live)
    return (
      <Card>
        <Empty title={`Process #${id} not found`}>
          It may have been deleted.{' '}
          <Link to="/" className="text-accent hover:underline">
            Back to processes
          </Link>
        </Empty>
      </Card>
    );
  if (!live || (!data && !error))
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-6" />
      </div>
    );

  const running = live.status === 'online' || live.status === 'launching';

  return (
    <>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Processes
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {live.name} <span className="text-base font-normal text-muted">#{live.pm_id}</span> <StatusBadge status={live.status} />
          </span>
        }
        subtitle={
          <span className="tabular">
            {running ? `${pct(live.cpu)} CPU · ${bytes(live.memory)} · up ${since(live.uptime)} · ` : ''}
            {live.restarts} restarts · {live.exec_mode === 'cluster_mode' ? 'cluster' : 'fork'} mode
          </span>
        }
        actions={
          <>
            {busy && <Spinner />}
            {running ? (
              <Button icon={<Square className="size-3.5" />} onClick={() => act(pmId, 'stop', {}, live.name)}>
                Stop
              </Button>
            ) : (
              <Button icon={<Play className="size-3.5" />} onClick={() => act(pmId, 'restart', {}, live.name)}>
                Start
              </Button>
            )}
            <Button variant="primary" icon={<RefreshCw className="size-3.5" />} onClick={() => act(pmId, 'restart', {}, live.name)}>
              Restart
            </Button>
            <Menu
              trigger={
                <Button>
                  More <ChevronDown className="size-3.5" />
                </Button>
              }
            >
              <MenuItem icon={<RotateCcw className="size-3.5" />} onClick={() => act(pmId, 'reload', {}, live.name)}>
                Reload (zero-downtime)
              </MenuItem>
              <MenuItem icon={<RefreshCw className="size-3.5" />} onClick={() => act(pmId, 'restart', { updateEnv: true }, live.name)}>
                Restart with updated env
              </MenuItem>
              <MenuItem icon={<RefreshCw className="size-3.5" />} onClick={() => act(live.name, 'restart', {}, `all instances of ${live.name}`)}>
                Restart all instances of {live.name}
              </MenuItem>
              <MenuItem icon={<Layers className="size-3.5" />} onClick={() => act(live.name, 'scale', { instances: '+1' }, live.name)}>
                Scale up (+1 instance)
              </MenuItem>
              <MenuItem icon={<Layers className="size-3.5" />} onClick={() => act(live.name, 'scale', { instances: '-1' }, live.name)}>
                Scale down (−1 instance)
              </MenuItem>
              <MenuItem icon={<Undo2 className="size-3.5" />} onClick={() => act(pmId, 'reset', {}, live.name)}>
                Reset counters
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Eraser className="size-3.5" />} danger onClick={() => act(pmId, 'flush', {}, live.name)}>
                Flush logs
              </MenuItem>
              <MenuItem
                icon={<Trash2 className="size-3.5" />}
                danger
                onClick={async () => {
                  if (await act(pmId, 'delete', {}, live.name)) navigate('/');
                }}
              >
                Delete
              </MenuItem>
            </Menu>
          </>
        }
      />
      <div className="mb-4">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>
      {error && <p className="mb-3 text-[13px] text-critical-ink">{error}</p>}
      {data && tab === 'overview' && <Overview d={data} live={live} />}
      {tab === 'logs' && (
        <Card padded>
          <LogViewer source={pmId} />
        </Card>
      )}
      {tab === 'metrics' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <TimeChart title="CPU" points={points} field="cpu" colorVar="--series-1" />
          </Card>
          <Card>
            <TimeChart title="Memory" points={points} field="mem" colorVar="--series-2" />
          </Card>
          <p className="text-xs text-muted lg:col-span-2">Sampled every 2 seconds; the dashboard keeps the last 15 minutes in memory.</p>
        </div>
      )}
      {data && tab === 'env' && <EnvTab d={data} />}
      {tab === 'terminal' && <TerminalTab key={pmId} proc={live} />}
      {tab === 'actions' && <ActionsTab proc={live} />}
      {tab === 'git' && <GitTab proc={live} />}
      {data && tab === 'raw' && (
        <Card title="pm2 describe" actions={<CopyButton text={JSON.stringify(data, null, 2)} />}>
          <CodeEditor value={JSON.stringify(data, null, 2)} language="json" readOnly height="60vh" />
        </Card>
      )}
    </>
  );
}
