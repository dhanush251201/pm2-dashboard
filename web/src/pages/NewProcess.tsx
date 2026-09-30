// pm2 start <script> [options] and pm2 serve <path> <port>.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Rocket, Trash2 } from 'lucide-react';
import { Button, Card, Field, IconButton, PageHeader, Tabs, Toggle } from '../components/ui';
import { PathInput } from '../components/PathInput';
import { CodeEditor } from '../components/CodeEditor';
import { useAction } from '../lib/feedback';
import { api } from '../lib/api';

const INTERPRETERS = ['', 'node', 'bun', 'python3', 'python', 'bash', 'sh', 'ruby', 'php', 'deno', 'none'];

interface Form {
  script: string;
  name: string;
  cwd: string;
  args: string;
  interpreter: string;
  interpreter_args: string;
  namespace: string;
  exec_mode: 'fork' | 'cluster';
  instances: string;
  autorestart: boolean;
  watch: boolean;
  watchPaths: string;
  ignore_watch: string;
  max_memory_restart: string;
  cron_restart: string;
  max_restarts: string;
  min_uptime: string;
  restart_delay: string;
  exp_backoff_restart_delay: string;
  kill_timeout: string;
  wait_ready: boolean;
  listen_timeout: string;
  out_file: string;
  error_file: string;
  log_file: string;
  merge_logs: boolean;
  time: boolean;
  log_date_format: string;
  disable_logs: boolean;
  env: { key: string; value: string }[];
}

const INITIAL: Form = {
  script: '',
  name: '',
  cwd: '',
  args: '',
  interpreter: '',
  interpreter_args: '',
  namespace: '',
  exec_mode: 'fork',
  instances: '',
  autorestart: true,
  watch: false,
  watchPaths: '',
  ignore_watch: 'node_modules',
  max_memory_restart: '',
  cron_restart: '',
  max_restarts: '',
  min_uptime: '',
  restart_delay: '',
  exp_backoff_restart_delay: '',
  kill_timeout: '',
  wait_ready: false,
  listen_timeout: '',
  out_file: '',
  error_file: '',
  log_file: '',
  merge_logs: false,
  time: false,
  log_date_format: '',
  disable_logs: false,
  env: [{ key: 'NODE_ENV', value: 'production' }],
};

function list(s: string) {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function toPayload(f: Form) {
  const p: Record<string, unknown> = { script: f.script.trim() };
  const str = ['name', 'cwd', 'args', 'interpreter', 'namespace', 'max_memory_restart', 'cron_restart', 'out_file', 'error_file', 'log_file', 'log_date_format'] as const;
  for (const k of str) if (f[k].trim()) p[k] = f[k].trim();
  if (f.interpreter_args.trim()) {
    if (!f.interpreter || f.interpreter === 'node') p.node_args = f.interpreter_args.trim();
    else p.interpreter_args = f.interpreter_args.trim();
  }
  const num = ['max_restarts', 'min_uptime', 'restart_delay', 'exp_backoff_restart_delay', 'kill_timeout', 'listen_timeout'] as const;
  for (const k of num) if (f[k].trim()) p[k] = Number(f[k]);
  if (f.exec_mode === 'cluster') p.exec_mode = 'cluster';
  if (f.instances.trim()) p.instances = f.instances.trim() === 'max' ? 'max' : Number(f.instances);
  if (!f.autorestart) p.autorestart = false;
  if (f.watch) {
    p.watch = f.watchPaths.trim() ? list(f.watchPaths) : true;
    if (f.ignore_watch.trim()) p.ignore_watch = list(f.ignore_watch);
  }
  if (f.wait_ready) p.wait_ready = true;
  if (f.merge_logs) p.merge_logs = true;
  if (f.time) p.time = true;
  if (f.disable_logs) p.disable_logs = true;
  const env = Object.fromEntries(f.env.filter((e) => e.key.trim()).map((e) => [e.key.trim(), e.value]));
  if (Object.keys(env).length) p.env = env;
  return p;
}

function ScriptForm() {
  const [f, setF] = useState<Form>(INITIAL);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const { run, busy } = useAction();
  const navigate = useNavigate();
  const payload = useMemo(() => toPayload(f), [f]);
  const nodeLike = !f.interpreter || f.interpreter === 'node' || f.interpreter === 'bun';

  const submit = async () => {
    const r = await run('start', () => api.post('/api/processes', payload), (r: any) => `Started ${r.started?.map((s: any) => s.name)[0] ?? 'process'}`);
    if (r?.started?.[0]) navigate(`/process/${r.started[0].pm_id}`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        <Card title="What to run">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Script or command *" hint="A file (app.js, server.py) or a binary on PATH (npm, python3)" className="md:col-span-2">
              <PathInput value={f.script} onChange={(v) => set('script', v)} placeholder="/path/to/app.js" start={f.cwd || undefined} />
            </Field>
            <Field label="Arguments" hint='e.g. "start" for npm, or "--port 3000"'>
              <input className="input font-mono" value={f.args} onChange={(e) => set('args', e.target.value)} />
            </Field>
            <Field label="Name" hint="Defaults to the script's file name">
              <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Working directory" className="md:col-span-2">
              <PathInput mode="dir" value={f.cwd} onChange={(v) => set('cwd', v)} placeholder="Directory of the script" />
            </Field>
            <Field label="Interpreter">
              <select className="input" value={f.interpreter} onChange={(e) => set('interpreter', e.target.value)}>
                {INTERPRETERS.map((i) => (
                  <option key={i} value={i}>
                    {i || 'auto-detect'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={nodeLike ? 'Node arguments' : 'Interpreter arguments'} hint={nodeLike ? 'e.g. --max-old-space-size=512' : undefined}>
              <input className="input font-mono" value={f.interpreter_args} onChange={(e) => set('interpreter_args', e.target.value)} />
            </Field>
            <Field label="Namespace">
              <input className="input" value={f.namespace} onChange={(e) => set('namespace', e.target.value)} placeholder="default" />
            </Field>
          </div>
        </Card>

        <Card title="Scaling">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Execution mode" hint="Cluster mode load-balances a Node HTTP server across instances">
              <select className="input" value={f.exec_mode} onChange={(e) => set('exec_mode', e.target.value as Form['exec_mode'])}>
                <option value="fork">fork</option>
                <option value="cluster">cluster</option>
              </select>
            </Field>
            <Field label="Instances" hint='A number, or "max" for one per CPU core'>
              <input className="input" value={f.instances} onChange={(e) => set('instances', e.target.value)} placeholder="1" />
            </Field>
          </div>
        </Card>

        <Card title="Restarts & watching">
          <div className="grid gap-4 md:grid-cols-2">
            <Toggle checked={f.autorestart} onChange={(v) => set('autorestart', v)} label="Restart automatically when it exits" />
            <Toggle checked={f.wait_ready} onChange={(v) => set('wait_ready', v)} label="Wait for process.send('ready')" />
            <Toggle checked={f.watch} onChange={(v) => set('watch', v)} label="Restart when files change (watch)" />
            <div />
            {f.watch && (
              <>
                <Field label="Watch paths" hint="Comma-separated; empty watches the working directory">
                  <input className="input font-mono" value={f.watchPaths} onChange={(e) => set('watchPaths', e.target.value)} />
                </Field>
                <Field label="Ignore paths" hint="Comma-separated">
                  <input className="input font-mono" value={f.ignore_watch} onChange={(e) => set('ignore_watch', e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Max memory before restart" hint="e.g. 300M or 1G">
              <input className="input" value={f.max_memory_restart} onChange={(e) => set('max_memory_restart', e.target.value)} />
            </Field>
            <Field label="Cron restart" hint='e.g. "0 3 * * *" for 3am daily'>
              <input className="input font-mono" value={f.cron_restart} onChange={(e) => set('cron_restart', e.target.value)} />
            </Field>
            <Field label="Max unstable restarts">
              <input className="input" type="number" min={0} value={f.max_restarts} onChange={(e) => set('max_restarts', e.target.value)} placeholder="16" />
            </Field>
            <Field label="Min uptime (ms)" hint="Shorter runs count as unstable">
              <input className="input" type="number" min={0} value={f.min_uptime} onChange={(e) => set('min_uptime', e.target.value)} placeholder="1000" />
            </Field>
            <Field label="Restart delay (ms)">
              <input className="input" type="number" min={0} value={f.restart_delay} onChange={(e) => set('restart_delay', e.target.value)} />
            </Field>
            <Field label="Exponential backoff delay (ms)">
              <input className="input" type="number" min={0} value={f.exp_backoff_restart_delay} onChange={(e) => set('exp_backoff_restart_delay', e.target.value)} />
            </Field>
            <Field label="Kill timeout (ms)" hint="Grace period before SIGKILL">
              <input className="input" type="number" min={0} value={f.kill_timeout} onChange={(e) => set('kill_timeout', e.target.value)} placeholder="1600" />
            </Field>
            {f.wait_ready && (
              <Field label="Listen timeout (ms)">
                <input className="input" type="number" min={0} value={f.listen_timeout} onChange={(e) => set('listen_timeout', e.target.value)} />
              </Field>
            )}
          </div>
        </Card>

        <Card
          title="Environment variables"
          actions={
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => set('env', [...f.env, { key: '', value: '' }])}>
              Add
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            {f.env.length === 0 && <p className="text-[13px] text-muted">No variables.</p>}
            {f.env.map((e, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="input font-mono"
                  placeholder="KEY"
                  value={e.key}
                  onChange={(ev) => set('env', f.env.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x)))}
                  aria-label="Variable name"
                />
                <input
                  className="input font-mono"
                  placeholder="value"
                  value={e.value}
                  onChange={(ev) => set('env', f.env.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)))}
                  aria-label="Variable value"
                />
                <IconButton label="Remove variable" danger onClick={() => set('env', f.env.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Logs">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Output log file" hint="Default: ~/.pm2/logs/<name>-out.log">
              <input className="input font-mono" value={f.out_file} onChange={(e) => set('out_file', e.target.value)} />
            </Field>
            <Field label="Error log file" hint="Default: ~/.pm2/logs/<name>-error.log">
              <input className="input font-mono" value={f.error_file} onChange={(e) => set('error_file', e.target.value)} />
            </Field>
            <Field label="Combined log file">
              <input className="input font-mono" value={f.log_file} onChange={(e) => set('log_file', e.target.value)} />
            </Field>
            <Field label="Log date format" hint="e.g. YYYY-MM-DD HH:mm:ss">
              <input className="input font-mono" value={f.log_date_format} onChange={(e) => set('log_date_format', e.target.value)} />
            </Field>
            <Toggle checked={f.time} onChange={(v) => set('time', v)} label="Prefix lines with a timestamp" />
            <Toggle checked={f.merge_logs} onChange={(v) => set('merge_logs', v)} label="Merge logs of all instances" />
            <Toggle checked={f.disable_logs} onChange={(v) => set('disable_logs', v)} label="Disable log files" />
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4 xl:sticky xl:top-0 xl:self-start">
        <Card title="Ecosystem entry" subtitle="The same settings as a pm2 app config">
          <CodeEditor value={JSON.stringify(payload, null, 2)} language="json" readOnly height="340px" />
        </Card>
        <Button variant="primary" className="h-10" icon={<Rocket className="size-4" />} loading={busy === 'start'} disabled={!f.script.trim()} onClick={submit}>
          Start process
        </Button>
      </div>
    </div>
  );
}

function ServeForm() {
  const [path, setPath] = useState('');
  const [port, setPort] = useState('8080');
  const [name, setName] = useState('');
  const [spa, setSpa] = useState(false);
  const [homepage, setHomepage] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const { run, busy } = useAction();
  const navigate = useNavigate();

  const submit = async () => {
    const r = await run(
      'serve',
      () =>
        api.post('/api/processes', {
          name: name.trim() || undefined,
          serve: { path, port: Number(port), spa, homepage: homepage || undefined, username: user || undefined, password: pass || undefined },
        }),
      `Serving ${path} on port ${port}`,
    );
    if (r?.started?.[0]) navigate(`/process/${r.started[0].pm_id}`);
  };

  return (
    <Card title="Serve a folder over HTTP" subtitle="pm2 serve — a static file server managed like any other process">
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Field label="Folder *" className="md:col-span-2">
          <PathInput mode="dir" value={path} onChange={setPath} placeholder="/path/to/dist" />
        </Field>
        <Field label="Port">
          <input className="input" type="number" value={port} onChange={(e) => setPort(e.target.value)} />
        </Field>
        <Field label="Name" hint={`Default: static-page-server-${port || 8080}`}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Toggle checked={spa} onChange={setSpa} label="Single-page app" hint="Serve index.html for unknown routes" />
        <Field label="Homepage file" hint="Default: /index.html">
          <input className="input font-mono" value={homepage} onChange={(e) => setHomepage(e.target.value)} />
        </Field>
        <Field label="Basic auth username">
          <input className="input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Basic auth password">
          <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="md:col-span-2">
          <Button variant="primary" icon={<Rocket className="size-4" />} loading={busy === 'serve'} disabled={!path.trim()} onClick={submit}>
            Start static server
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function NewProcessPage() {
  const [mode, setMode] = useState<'script' | 'serve'>('script');
  return (
    <>
      <PageHeader title="Start a process" subtitle="Everything pm2 start accepts, as a form. For many apps at once, use an ecosystem file." />
      <div className="mb-4">
        <Tabs
          tabs={[
            { id: 'script', label: 'Script or command' },
            { id: 'serve', label: 'Static file server' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      {mode === 'script' ? <ScriptForm /> : <ServeForm />}
    </>
  );
}
