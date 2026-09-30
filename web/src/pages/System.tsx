// Daemon & machine-level operations: ping/kill/update, save/resurrect, startup,
// log rotation, pm2 set/get/unset, sysmonit/slist, profiling, PM2 Plus, dashboard prefs.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ExternalLink, Power, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Badge, Button, Card, DownloadLink, Field, KV, PageHeader, Spinner, Toggle } from '../components/ui';
import { useJobPanel } from '../components/JobsDrawer';
import { ModuleConfig } from './Modules';
import { useFetch } from '../lib/useFetch';
import { useAction, useFeedback } from '../lib/feedback';
import { api, enc } from '../lib/api';
import { ago, bytes, dateTime, duration } from '../lib/format';
import { notificationsEnabled, setNotificationsEnabled } from '../lib/prefs';
import type { SystemInfo } from '../lib/types';

const PLATFORMS = ['', 'launchd', 'systemd', 'upstart', 'openrc', 'rcd', 'systemv', 'smf', 'windows'];

function Daemon({ sys, reload }: { sys: SystemInfo; reload: () => void }) {
  const { run, busy } = useAction();
  const { confirm } = useFeedback();
  const { start } = useJobPanel();
  return (
    <Card
      title="pm2 daemon"
      actions={sys.online ? <Badge tone="good">● online</Badge> : <Badge tone="critical">✕ offline</Badge>}
    >
      <KV
        items={[
          ['daemon pid', sys.daemonPid ?? '—'],
          ['daemon version', sys.daemonVersion ?? '—'],
          ['dashboard pm2 lib', sys.libVersion],
          ['PM2_HOME', <code className="font-mono text-xs">{sys.home}</code>],
          ['logs folder', <code className="font-mono text-xs">{sys.paths.logs}</code>],
        ]}
      />
      {sys.daemonVersion && sys.daemonVersion !== sys.libVersion && (
        <p className="mt-3 rounded-lg bg-warning/15 p-2 text-xs text-ink">
          The running daemon ({sys.daemonVersion}) differs from the dashboard's pm2 library ({sys.libVersion}). Use “Update in-memory pm2” if you upgraded pm2.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon={<Power className="size-3.5" />} loading={busy === 'ping'} onClick={() => run('ping', () => api.post('/api/system/ping'), 'Daemon is up (pong)').then(reload)}>
          {sys.online ? 'Ping' : 'Start daemon'}
        </Button>
        <Button onClick={() => start(() => api.post('/api/system/job/update'))}>Update in-memory pm2</Button>
        <Button onClick={() => start(() => api.post('/api/system/job/report'))}>Generate report</Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (
              await confirm({
                title: 'Deep update pm2?',
                body: 'Runs npm install -g pm2@latest and then reloads the daemon. It may need permissions to write global packages.',
                confirmText: 'Deep update',
                danger: true,
              })
            )
              start(() => api.post('/api/system/job/deepUpdate'));
          }}
        >
          Deep update
        </Button>
        <Button
          variant="danger"
          disabled={!sys.online}
          loading={busy === 'kill'}
          onClick={async () => {
            if (
              await confirm({
                title: 'Kill the pm2 daemon?',
                body: 'Every managed process is stopped and the daemon exits. Save the process list first if you want to resurrect it later.',
                confirmText: 'Kill daemon',
                danger: true,
                typeToConfirm: 'kill',
              })
            )
              run('kill', () => api.post('/api/system/kill'), 'pm2 daemon killed').then(reload);
          }}
        >
          Kill daemon
        </Button>
      </div>
    </Card>
  );
}

function Snapshot({ sys, reload }: { sys: SystemInfo; reload: () => void }) {
  const { run, busy } = useAction();
  const { confirm } = useFeedback();
  const [force, setForce] = useState(false);
  return (
    <Card title="Saved process list" subtitle="pm2 save / resurrect / cleardump">
      <p className="mb-3 text-[13px] text-ink-2">
        {sys.dump.mtime ? (
          <>
            Last saved <strong className="text-ink">{ago(sys.dump.mtime)}</strong> ({dateTime(sys.dump.mtime)}) with {sys.dump.apps.length} process
            {sys.dump.apps.length === 1 ? '' : 'es'}.
          </>
        ) : (
          'Nothing saved yet.'
        )}
      </p>
      {sys.dump.apps.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {sys.dump.apps.map((a, i) => (
            <Badge key={i}>{a.name}</Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Save className="size-3.5" />} loading={busy === 'save'} onClick={() => run('save', () => api.post('/api/system/save', { force }), 'Process list saved').then(reload)}>
          Save current list
        </Button>
        <Button loading={busy === 'res'} onClick={() => run('res', () => api.post('/api/system/resurrect'), 'Saved processes resurrected')}>
          Resurrect
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 className="size-3.5" />}
          onClick={async () => {
            if (await confirm({ title: 'Clear the saved list?', body: 'The dump file is emptied; running processes are not affected.', confirmText: 'Clear', danger: true }))
              run('clear', () => api.post('/api/system/cleardump'), 'Saved list cleared').then(reload);
          }}
        >
          Clear saved list
        </Button>
      </div>
      <div className="mt-3">
        <Toggle checked={force} onChange={setForce} label="Force save even if the list is empty (--force)" />
      </div>
    </Card>
  );
}

function Startup({ sys }: { sys: SystemInfo }) {
  const { start } = useJobPanel();
  const [platform, setPlatform] = useState('');
  return (
    <Card title="Start on boot" subtitle="pm2 startup / unstartup">
      <p className="mb-3 text-[13px] text-ink-2">
        {sys.startup.enabled ? (
          <>
            <Badge tone="good">✓ enabled</Badge> via <code className="font-mono text-xs">{sys.startup.files.join(', ')}</code>
          </>
        ) : (
          <>
            <Badge>not detected</Badge> pm2 won't come back after a reboot unless a startup script is installed.
          </>
        )}
      </p>
      <p className="mb-3 text-xs text-muted">
        Installing needs administrator rights, so the dashboard shows the exact <code>sudo</code> command to run in your terminal. Save your process list
        afterwards so pm2 knows what to resurrect at boot.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Init system">
          <select className="input w-40" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p || 'auto-detect'}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="primary" onClick={() => start(() => api.post('/api/system/job/startup', { platform: platform || undefined }))}>
          Enable startup
        </Button>
        <Button variant="danger" onClick={() => start(() => api.post('/api/system/job/unstartup', { platform: platform || undefined }))}>
          Disable startup
        </Button>
      </div>
    </Card>
  );
}

function LogRotation() {
  const mods = useFetch<{ name: string }[]>('/api/modules');
  const { start } = useJobPanel();
  const installed = mods.data?.some((m) => m.name === 'pm2-logrotate');
  return (
    <Card title="Log rotation" subtitle="pm2-logrotate module · pm2 logrotate">
      {mods.loading && !mods.data ? (
        <Spinner />
      ) : installed ? (
        <>
          <p className="mb-2 text-[13px] text-ink-2">
            <Badge tone="good">✓ pm2-logrotate installed</Badge> Common keys: <code>max_size</code>, <code>retain</code>, <code>compress</code>,{' '}
            <code>rotateInterval</code>.
          </p>
          <ModuleConfig mod="pm2-logrotate" />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-2">Log files grow forever by default. The pm2-logrotate module rotates them by size (10 MB) and keeps 30 files.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => start(() => api.post('/api/modules/install', { name: 'pm2-logrotate' })).then(() => setTimeout(mods.reload, 4000))}>
              Install pm2-logrotate
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3 border-t border-line pt-3">
        <Button size="sm" onClick={() => start(() => api.post('/api/system/job/logrotate'))}>
          Install system logrotate config instead
        </Button>
        <p className="hint">Writes /etc/logrotate.d/pm2-&lt;user&gt; (Linux, needs sudo — the command is shown).</p>
      </div>
    </Card>
  );
}

function Config() {
  const { data, reload } = useFetch<Record<string, any>>('/api/config');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [serial, setSerial] = useState('');
  const { run } = useAction();
  const { confirm } = useFeedback();
  const rows: [string, string][] = [];
  for (const [top, v] of Object.entries(data ?? {})) {
    if (top.startsWith('module-db')) continue;
    if (v && typeof v === 'object') for (const [k, vv] of Object.entries(v)) rows.push([`${top}:${k}`, typeof vv === 'object' ? JSON.stringify(vv) : String(vv)]);
    else rows.push([top, String(v)]);
  }
  return (
    <Card title="pm2 configuration" subtitle="pm2 set / get / unset / multiset — stored in module_conf.json">
      {rows.length === 0 ? (
        <p className="mb-3 text-[13px] text-muted">No values set.</p>
      ) : (
        <table className="mb-3 w-full text-[13px]">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3 font-mono text-xs">{k}</td>
                <td className="py-1.5 font-mono text-xs break-all text-ink-2">{v}</td>
                <td className="w-8 py-1.5 text-right">
                  <button
                    className="text-muted hover:text-critical cursor-pointer"
                    aria-label={`Unset ${k}`}
                    onClick={async () => {
                      if (await confirm({ title: `Unset ${k}?`, confirmText: 'Unset', danger: true })) run('unset', () => api.del(`/api/config?key=${enc(k)}`), `Unset ${k}`).then(reload);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex gap-2">
        <input className="input font-mono text-xs" placeholder="module:key (e.g. pm2:autodump)" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Key" />
        <input className="input font-mono text-xs" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Value" />
        <Button
          disabled={!key.trim()}
          onClick={() =>
            run('set', () => api.put('/api/config', { key: key.trim(), value }), `Set ${key.trim()}`).then((r) => {
              if (r) {
                setKey('');
                setValue('');
                reload();
              }
            })
          }
        >
          Set
        </Button>
      </div>
      <div className="mt-2 flex gap-2">
        <input className="input font-mono text-xs" placeholder='multiset: "key1 val1 key2 val2"' value={serial} onChange={(e) => setSerial(e.target.value)} aria-label="Multiset" />
        <Button
          disabled={!serial.trim()}
          onClick={() =>
            run('multi', () => api.post('/api/config/multiset', { serial }), 'Values set').then((r) => {
              if (r) {
                setSerial('');
                reload();
              }
            })
          }
        >
          Multiset
        </Button>
      </div>
    </Card>
  );
}

function Host({ sys }: { sys: SystemInfo }) {
  const [slist, setSlist] = useState<unknown>(null);
  const { run, busy } = useAction();
  const { start } = useJobPanel();
  const h = sys.host;
  return (
    <Card title="Host" subtitle="pm2 sysmonit / slist">
      <KV
        items={[
          ['hostname', h.hostname],
          ['platform', h.platform],
          ['cpu', `${h.cpus} × ${h.cpuModel}`],
          ['memory', `${bytes(h.totalmem - h.freemem)} used of ${bytes(h.totalmem)}`],
          ['load average', h.loadavg.map((l) => l.toFixed(2)).join(' · ')],
          ['uptime', duration(h.uptime * 1000)],
          ['node (dashboard)', h.node],
        ]}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => start(() => api.post('/api/system/job/sysmonit'))}>Enable sysmonit</Button>
        <Button loading={busy === 'slist'} onClick={() => run('slist', () => api.get('/api/system/slist')).then((r) => r && setSlist(r))}>
          Show system info (slist)
        </Button>
      </div>
      {slist != null && <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-surface-2 p-2 font-mono text-xs">{JSON.stringify(slist, null, 2)}</pre>}
    </Card>
  );
}

function Profiling() {
  const profiles = useFetch<{ name: string; size: number; mtime: number }[]>('/api/system/profiles');
  const { start } = useJobPanel();
  const [type, setType] = useState<'cpu' | 'mem'>('cpu');
  const [time, setTime] = useState('10');
  return (
    <Card title="Profile the pm2 daemon" subtitle="pm2 profile:cpu / profile:mem — for diagnosing pm2 itself">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Type">
          <select className="input w-32" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="cpu">CPU</option>
            <option value="mem">Heap</option>
          </select>
        </Field>
        <Field label="Seconds">
          <input className="input w-24" type="number" min={1} max={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          onClick={() => start(() => api.post('/api/system/profile', { type, time: Number(time) })).then(() => setTimeout(profiles.reload, (Number(time) + 3) * 1000))}
        >
          Start profiling
        </Button>
        <Button icon={<RefreshCw className="size-3.5" />} onClick={profiles.reload}>
          Refresh
        </Button>
      </div>
      {profiles.data && profiles.data.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-[13px]">
          {profiles.data.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-2 py-1.5">
              <span className="truncate font-mono text-xs">{p.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {bytes(p.size)} · {ago(p.mtime)}
                <DownloadLink href={`/api/system/profiles/${enc(p.name)}`}>download</DownloadLink>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Open .cpuprofile / .heapprofile files in Chrome DevTools. To profile your own app, use its Signals & actions tab.</p>
    </Card>
  );
}

function Plus({ sys, reload }: { sys: SystemInfo; reload: () => void }) {
  const { start } = useJobPanel();
  const [secret, setSecret] = useState('');
  const [pub, setPub] = useState('');
  const [name, setName] = useState('');
  return (
    <Card title="PM2 Plus" subtitle="pm2 link / unlink / logout / open — pm2's hosted monitoring service">
      <p className="mb-3 text-[13px] text-ink-2">
        {sys.plus.linked ? (
          <>
            <Badge tone="good">✓ linked</Badge> {sys.plus.machine_name && <>as {sys.plus.machine_name}</>}
          </>
        ) : (
          <Badge>not linked</Badge>
        )}{' '}
        <a href={sys.plus.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
          Open app.pm2.io <ExternalLink className="size-3" />
        </a>
      </p>
      {!sys.plus.linked ? (
        <div className="grid gap-2 md:grid-cols-3">
          <input className="input font-mono text-xs" type="password" placeholder="secret key" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" aria-label="Secret key" />
          <input className="input font-mono text-xs" placeholder="public key" value={pub} onChange={(e) => setPub(e.target.value)} autoComplete="off" aria-label="Public key" />
          <input className="input text-xs" placeholder="machine name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Machine name" />
          <div className="md:col-span-3">
            <Button
              variant="primary"
              disabled={!secret || !pub}
              onClick={() =>
                start(() => api.post('/api/system/plus/link', { secret, public: pub, name: name || undefined })).then(() => {
                  setSecret('');
                  setTimeout(reload, 4000);
                })
              }
            >
              Link this machine
            </Button>
            <p className="hint">Keys are on app.pm2.io under your bucket's settings. The interactive `pm2 login` flow isn't available in a browser; linking with keys is equivalent.</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => start(() => api.post('/api/system/job/unlink')).then(() => setTimeout(reload, 3000))}>
            Unlink
          </Button>
          <Button onClick={() => start(() => api.post('/api/system/job/logout')).then(() => setTimeout(reload, 3000))}>Log out</Button>
        </div>
      )}
    </Card>
  );
}

function DashboardPrefs({ sys }: { sys: SystemInfo }) {
  const [notify, setNotify] = useState(notificationsEnabled());
  const { toast } = useFeedback();
  return (
    <Card title="This dashboard">
      <div className="flex flex-col gap-3">
        <Toggle
          checked={notify}
          onChange={async (on) => {
            if (on && 'Notification' in window && Notification.permission !== 'granted') {
              const p = await Notification.requestPermission();
              if (p !== 'granted') {
                toast({ tone: 'warning', title: 'Notifications blocked', body: 'Allow notifications for this site in your browser settings.' });
                return;
              }
            }
            setNotificationsEnabled(on);
            setNotify(on);
          }}
          label={
            <span className="inline-flex items-center gap-1.5">
              <Bell className="size-3.5" /> Desktop notifications for crash loops
            </span>
          }
          hint="Also notifies on any crash while this tab is in the background"
        />
        <KV
          items={[
            ['server pid', sys.dashboard.pid],
            ['server node', sys.dashboard.node],
            ['access token', <code className="font-mono text-xs">~/.pm2-dashboard/token</code>],
          ]}
        />
        <p className="text-xs text-muted">
          The server only listens on 127.0.0.1. Delete the token file and restart the server to revoke existing sessions. Jobs are listed on the{' '}
          <Link to="/jobs" className="text-accent hover:underline">
            Jobs page
          </Link>
          .
        </p>
      </div>
    </Card>
  );
}

export default function SystemPage() {
  const { data: sys, reload, error } = useFetch<SystemInfo>('/api/system');
  if (error) return <p className="text-critical-ink">{error}</p>;
  if (!sys)
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-6" />
      </div>
    );
  return (
    <>
      <PageHeader
        title="System"
        subtitle="The pm2 daemon, boot persistence, configuration and integrations"
        actions={
          <Button icon={<RefreshCw className="size-3.5" />} onClick={reload}>
            Refresh
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Daemon sys={sys} reload={reload} />
        <Snapshot sys={sys} reload={reload} />
        <Startup sys={sys} />
        <LogRotation />
        <Config />
        <Host sys={sys} />
        <Profiling />
        <Plus sys={sys} reload={reload} />
        <DashboardPrefs sys={sys} />
      </div>
    </>
  );
}
