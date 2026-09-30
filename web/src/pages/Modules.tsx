// pm2 install / uninstall / module:update / module:generate / package / publish,
// plus per-module config (pm2 set <module>:<key> <value>).
import { useState } from 'react';
import { Boxes, Download, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Empty, Field, IconButton, PageHeader, Spinner, StatusBadge, Toggle } from '../components/ui';
import { PathInput } from '../components/PathInput';
import { useJobPanel } from '../components/JobsDrawer';
import { useFetch } from '../lib/useFetch';
import { useAction, useFeedback } from '../lib/feedback';
import { api, enc } from '../lib/api';
import { bytes, pct } from '../lib/format';
import type { Proc } from '../lib/types';

interface Mod {
  name: string;
  installed: Record<string, unknown> | null;
  processes: Proc[];
  config: Record<string, string>;
}

const SUGGESTED = [
  { name: 'pm2-logrotate', desc: 'Rotate pm2 log files by size or date' },
  { name: 'pm2-server-monit', desc: 'Report host CPU, memory, disk and network as metrics' },
  { name: 'pm2-auto-pull', desc: 'Periodically git pull and reload apps' },
];

export function ModuleConfig({ mod, onChange }: { mod: string; onChange?: () => void }) {
  const { data, reload } = useFetch<Record<string, any>>('/api/config');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const { run } = useAction();
  const conf: Record<string, string> = (data?.[mod] && typeof data[mod] === 'object' ? data[mod] : {}) as any;

  const set = async (k: string, v: string) => {
    const r = await run(`set:${k}`, () => api.put('/api/config', { key: `${mod}:${k}`, value: v }), `${mod}:${k} = ${v}`);
    if (r) {
      reload();
      onChange?.();
      setEdits((e) => {
        const n = { ...e };
        delete n[k];
        return n;
      });
    }
  };

  return (
    <div>
      {Object.keys(conf).length === 0 ? (
        <p className="text-xs text-muted">No settings stored for this module.</p>
      ) : (
        <table className="w-full text-[13px]">
          <tbody>
            {Object.entries(conf).map(([k, v]) => (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="w-1/3 py-1.5 pr-3 font-mono text-xs">{k}</td>
                <td className="py-1.5">
                  <div className="flex gap-2">
                    <input
                      className="input font-mono text-xs"
                      value={edits[k] ?? String(v)}
                      onChange={(e) => setEdits((s) => ({ ...s, [k]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && edits[k] !== undefined && set(k, edits[k])}
                      aria-label={k}
                    />
                    {edits[k] !== undefined && edits[k] !== String(v) && (
                      <Button size="sm" variant="primary" onClick={() => set(k, edits[k])}>
                        Save
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-2 flex gap-2">
        <input className="input font-mono text-xs" placeholder="new key" value={key} onChange={(e) => setKey(e.target.value)} aria-label="New key" />
        <input className="input font-mono text-xs" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} aria-label="New value" />
        <Button
          size="sm"
          icon={<Plus className="size-3.5" />}
          disabled={!key.trim()}
          onClick={async () => {
            await set(key.trim(), value);
            setKey('');
            setValue('');
          }}
        >
          Set
        </Button>
      </div>
      <p className="hint">Most modules pick up changes automatically; otherwise restart the module.</p>
    </div>
  );
}

function Developer() {
  const { start } = useJobPanel();
  const [name, setName] = useState('');
  const [dir, setDir] = useState('');
  const [pkgDir, setPkgDir] = useState('');
  const [npm, setNpm] = useState(false);
  return (
    <Card title="Module development" subtitle="pm2 module:generate · package · publish">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Generate a module skeleton">
          <div className="flex flex-col gap-2">
            <input className="input" placeholder="module name" value={name} onChange={(e) => setName(e.target.value)} />
            <PathInput mode="dir" value={dir} onChange={setDir} placeholder="in folder…" />
            <Button disabled={!name || !dir} onClick={() => start(() => api.post('/api/modules/generate', { name, dir }))}>
              Generate
            </Button>
          </div>
        </Field>
        <Field label="Package or publish a module folder">
          <div className="flex flex-col gap-2">
            <PathInput mode="dir" value={pkgDir} onChange={setPkgDir} placeholder="module folder" />
            <Toggle checked={npm} onChange={setNpm} label="Publish to npm (--npm)" />
            <div className="flex gap-2">
              <Button disabled={!pkgDir} onClick={() => start(() => api.post('/api/modules/package', { dir: pkgDir }))}>
                Package (tarball)
              </Button>
              <Button disabled={!pkgDir} onClick={() => start(() => api.post('/api/modules/publish', { dir: pkgDir, npm }))}>
                Publish
              </Button>
            </div>
          </div>
        </Field>
      </div>
    </Card>
  );
}

export default function ModulesPage() {
  const mods = useFetch<Mod[]>('/api/modules');
  const [name, setName] = useState('');
  const [safe, setSafe] = useState(false);
  const [tarball, setTarball] = useState(false);
  const [yarn, setYarn] = useState(false);
  const { start } = useJobPanel();
  const { confirm } = useFeedback();

  const install = (n: string, opts: object = {}) => start(() => api.post('/api/modules/install', { name: n, ...opts })).then(() => setTimeout(mods.reload, 3000));

  return (
    <>
      <PageHeader title="Modules" subtitle="pm2 modules are plugins that run as managed processes (log rotation, monitoring, …)" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card
            title="Installed modules"
            actions={
              <IconButton label="Refresh" onClick={mods.reload}>
                <RefreshCw className="size-3.5" />
              </IconButton>
            }
          >
            {mods.loading && !mods.data ? (
              <Spinner />
            ) : !mods.data?.length ? (
              <Empty icon={<Boxes className="size-8" />} title="No modules installed" />
            ) : (
              <div className="flex flex-col gap-4">
                {mods.data.map((m) => (
                  <div key={m.name} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{m.name}</h3>
                      {m.processes.map((p) => (
                        <span key={p.pm_id} className="flex items-center gap-1.5 text-xs text-muted tabular">
                          <StatusBadge status={p.status} /> {pct(p.cpu)} · {bytes(p.memory)}
                        </span>
                      ))}
                      {m.processes.length === 0 && <Badge tone="warning">not running</Badge>}
                      <div className="ml-auto flex gap-1.5">
                        <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => start(() => api.post('/api/modules/update', { name: m.name })).then(() => setTimeout(mods.reload, 3000))}>
                          Update
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<Trash2 className="size-3.5" />}
                          onClick={async () => {
                            if (await confirm({ title: `Uninstall ${m.name}?`, confirmText: 'Uninstall', danger: true }))
                              start(() => api.post('/api/modules/uninstall', { name: m.name })).then(() => setTimeout(mods.reload, 3000));
                          }}
                        >
                          Uninstall
                        </Button>
                      </div>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-ink-2">Settings</summary>
                      <div className="mt-2">
                        <ModuleConfig mod={m.name} />
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Developer />
        </div>
        <div className="flex flex-col gap-4">
          <Card title="Install a module" subtitle="pm2 install">
            <div className="flex flex-col gap-3">
              <input
                className="input font-mono"
                placeholder="pm2-logrotate, user/repo, or a tarball path"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Module name"
              />
              <Toggle checked={safe} onChange={setSafe} label="Safe mode (--safe)" hint="Keep a backup and roll back if the new version fails" />
              <Toggle checked={tarball} onChange={setTarball} label="Local tarball (--tarball)" />
              <Toggle checked={yarn} onChange={setYarn} label="Run yarn install first (--install)" />
              <Button variant="primary" disabled={!name.trim()} onClick={() => install(name.trim(), { safe, tarball, yarnInstall: yarn })}>
                Install
              </Button>
            </div>
          </Card>
          <Card title="Popular modules">
            <ul className="flex flex-col gap-3">
              {SUGGESTED.map((s) => {
                const installed = mods.data?.some((m) => m.name === s.name);
                return (
                  <li key={s.name} className="flex items-start justify-between gap-3">
                    <div>
                      <a href={`https://www.npmjs.com/package/${enc(s.name)}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] hover:text-accent">
                        {s.name}
                      </a>
                      <p className="text-xs text-muted">{s.desc}</p>
                    </div>
                    {installed ? (
                      <Badge tone="good">installed</Badge>
                    ) : (
                      <Button size="sm" onClick={() => install(s.name)}>
                        Install
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
