// pm2 ls, live: table of every process with inline lifecycle actions and bulk actions.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Eraser,
  FileText,
  Layers,
  MoreHorizontal,
  Play,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Badge, Button, Card, Empty, IconButton, Menu, MenuItem, MenuSeparator, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { Sparkline } from '../components/charts';
import { useHistory, useProcesses } from '../lib/store';
import { useProcActions } from '../lib/procActions';
import { useAction } from '../lib/feedback';
import { api } from '../lib/api';
import { bytes, pct, since } from '../lib/format';
import type { Proc } from '../lib/types';

function ScaleDialog({ proc, onClose }: { proc: Proc | null; onClose: () => void }) {
  const [n, setN] = useState('');
  const { act, busy } = useProcActions();
  const current = useProcesses()?.filter((p) => proc && p.name === proc.name).length ?? 0;
  return (
    <Modal
      open={!!proc}
      onClose={onClose}
      title={`Scale ${proc?.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={!!busy}
            disabled={!/^[+-]?\d+$/.test(n.trim())}
            onClick={async () => {
              if (proc && (await act(proc.name, 'scale', { instances: n.trim() }, proc.name))) onClose();
            }}
          >
            Scale
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-ink-2">
        Currently <strong className="text-ink">{current}</strong> instance{current === 1 ? '' : 's'}. Enter a total (e.g. <code>4</code>) or a change (
        <code>+2</code>, <code>-1</code>).
      </p>
      <div className="flex gap-2">
        <Button onClick={() => setN('-1')}>−1</Button>
        <input className="input text-center font-mono" value={n} onChange={(e) => setN(e.target.value)} placeholder={String(current)} autoFocus aria-label="Instances" />
        <Button onClick={() => setN('+1')}>+1</Button>
      </div>
      {proc?.exec_mode !== 'cluster_mode' && <p className="hint">This process runs in fork mode; scaling will start extra forked copies.</p>}
    </Modal>
  );
}

export default function ProcessesPage() {
  const procs = useProcesses();
  const history = useHistory();
  const navigate = useNavigate();
  const { act, busy } = useProcActions();
  const { run, busy: sysBusy } = useAction();
  const [query, setQuery] = useState('');
  const [ns, setNs] = useState('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [scaling, setScaling] = useState<Proc | null>(null);
  const [showModules, setShowModules] = useState(false);

  const namespaces = useMemo(() => [...new Set((procs ?? []).map((p) => p.namespace))].sort(), [procs]);
  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return (procs ?? []).filter(
      (p) =>
        (showModules || !p.is_module) &&
        (ns === 'all' || p.namespace === ns) &&
        (!q || p.name.toLowerCase().includes(q) || String(p.pm_id) === q || p.script?.toLowerCase().includes(q)),
    );
  }, [procs, query, ns, showModules]);

  const moduleCount = procs?.filter((p) => p.is_module).length ?? 0;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.pm_id));
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulk = async (action: 'restart' | 'reload' | 'stop' | 'delete' | 'reset') => {
    const ids = [...selected];
    for (const id of ids) {
      const p = procs?.find((x) => x.pm_id === id);
      await act(id, action, {}, p ? `${p.name} (#${id})` : `#${id}`);
    }
    setSelected(new Set());
  };

  if (!procs)
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-6" />
      </div>
    );

  return (
    <>
      <PageHeader
        title="Processes"
        subtitle={`${procs.filter((p) => p.status === 'online').length} of ${procs.length} online`}
        actions={
          <>
            <Menu
              trigger={
                <Button icon={<Layers className="size-3.5" />}>
                  All processes <ChevronDown className="size-3.5" />
                </Button>
              }
            >
              <MenuItem icon={<RefreshCw className="size-3.5" />} onClick={() => act('all', 'restart', {}, 'all processes')}>
                Restart all
              </MenuItem>
              <MenuItem icon={<RotateCcw className="size-3.5" />} onClick={() => act('all', 'reload', {}, 'all processes')}>
                Reload all (zero-downtime)
              </MenuItem>
              <MenuItem icon={<RefreshCw className="size-3.5" />} onClick={() => act('all', 'restart', { updateEnv: true }, 'all processes')}>
                Restart all with updated env
              </MenuItem>
              <MenuItem icon={<Undo2 className="size-3.5" />} onClick={() => act('all', 'reset', {}, 'all processes')}>
                Reset all counters
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Save className="size-3.5" />} onClick={() => run('save', () => api.post('/api/system/save'), 'Process list saved (pm2 save)')}>
                Save process list
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Square className="size-3.5" />} danger onClick={() => act('all', 'stop', {}, 'all processes')}>
                Stop all
              </MenuItem>
              <MenuItem icon={<Eraser className="size-3.5" />} danger onClick={() => act('all', 'flush', {}, 'all processes')}>
                Flush all logs
              </MenuItem>
              <MenuItem icon={<Trash2 className="size-3.5" />} danger onClick={() => act('all', 'delete', {}, 'all processes')}>
                Delete all
              </MenuItem>
            </Menu>
            <Button variant="primary" icon={<PlusCircle className="size-3.5" />} onClick={() => navigate('/new')}>
              Start process
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-64">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-muted" />
          <input className="input pl-8" placeholder="Filter by name, id or script" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter processes" />
        </div>
        <select className="input w-auto" value={ns} onChange={(e) => setNs(e.target.value)} aria-label="Namespace">
          <option value="all">All namespaces</option>
          {namespaces.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {ns !== 'all' && (
          <Menu trigger={<Button size="sm">Namespace “{ns}” ▾</Button>} align="left">
            <MenuItem onClick={() => act(ns, 'restart', {}, `namespace ${ns}`)}>Restart namespace</MenuItem>
            <MenuItem onClick={() => act(ns, 'reload', {}, `namespace ${ns}`)}>Reload namespace</MenuItem>
            <MenuItem danger onClick={() => act(ns, 'stop', {}, `namespace ${ns}`)}>
              Stop namespace
            </MenuItem>
            <MenuItem danger onClick={() => act(ns, 'delete', {}, `namespace ${ns}`)}>
              Delete namespace
            </MenuItem>
          </Menu>
        )}
        {moduleCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={showModules} onChange={(e) => setShowModules(e.target.checked)} /> Show {moduleCount} module
            {moduleCount === 1 ? '' : 's'}
          </label>
        )}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1">
            <span className="px-1 text-xs font-medium text-accent">{selected.size} selected</span>
            <Button size="sm" onClick={() => bulk('restart')}>
              Restart
            </Button>
            <Button size="sm" onClick={() => bulk('reload')}>
              Reload
            </Button>
            <Button size="sm" onClick={() => bulk('stop')}>
              Stop
            </Button>
            <Button size="sm" variant="danger" onClick={() => bulk('delete')}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>

      <Card padded={false}>
        {procs.length === 0 ? (
          <Empty icon={<Layers className="size-8" />} title="No processes yet">
            pm2 isn't managing anything.{' '}
            <Link to="/new" className="text-accent hover:underline">
              Start a process
            </Link>
            ,{' '}
            <Link to="/ecosystem" className="text-accent hover:underline">
              apply an ecosystem file
            </Link>{' '}
            or{' '}
            <button className="text-accent hover:underline cursor-pointer" onClick={() => run('res', () => api.post('/api/system/resurrect'), 'Saved processes restored')}>
              resurrect the saved list
            </button>
            .
          </Empty>
        ) : rows.length === 0 ? (
          <Empty title="No processes match the filter" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="w-9 py-2 pl-4">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.pm_id)))}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="w-12 py-2 font-medium">id</th>
                  <th className="py-2 font-medium">name</th>
                  <th className="py-2 font-medium">status</th>
                  <th className="py-2 font-medium">cpu</th>
                  <th className="py-2 font-medium">memory</th>
                  <th className="py-2 font-medium">uptime</th>
                  <th className="py-2 pr-3 font-medium" title="restarts">↺</th>
                  <th className="py-2 font-medium">pid</th>
                  <th className="py-2 pr-4 text-right font-medium">actions</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {rows.map((p) => {
                  const pts = history.processes[p.pm_id] || [];
                  const running = p.status === 'online' || p.status === 'launching';
                  const isBusy = busy?.startsWith(`${p.pm_id}:`);
                  return (
                    <tr key={p.pm_id} className={`border-b border-line last:border-0 hover:bg-surface-2/60 ${selected.has(p.pm_id) ? 'bg-accent/5' : ''}`}>
                      <td className="py-2 pl-4">
                        <input type="checkbox" checked={selected.has(p.pm_id)} onChange={() => toggle(p.pm_id)} aria-label={`Select ${p.name}`} />
                      </td>
                      <td className="py-2 text-muted">{p.pm_id}</td>
                      <td className="max-w-[260px] py-2">
                        <Link to={`/process/${p.pm_id}`} className="font-medium text-ink hover:text-accent">
                          {p.name}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {p.namespace !== 'default' && <Badge>{p.namespace}</Badge>}
                          {p.exec_mode === 'cluster_mode' && <Badge tone="accent">cluster</Badge>}
                          {p.watch && <Badge>watching</Badge>}
                          {p.is_module && <Badge>module</Badge>}
                          {p.version && p.version !== 'N/A' && <span className="text-[11px] text-muted">v{p.version}</span>}
                        </div>
                      </td>
                      <td className="py-2">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-11 text-right">{running ? pct(p.cpu) : '—'}</span>
                          <Sparkline points={pts} field="cpu" color="var(--series-1)" />
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-right">{running ? bytes(p.memory) : '—'}</span>
                          <Sparkline points={pts} field="mem" color="var(--series-2)" />
                        </div>
                      </td>
                      <td className="py-2 text-ink-2">{running ? since(p.uptime) : '—'}</td>
                      <td className="py-2 pr-3">
                        <span className={p.unstable_restarts > 0 ? 'font-medium text-critical-ink' : 'text-ink-2'} title={`${p.unstable_restarts} unstable restarts`}>
                          {p.restarts}
                        </span>
                      </td>
                      <td className="py-2 text-muted">{p.pid || '—'}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center justify-end gap-0.5">
                          {isBusy && <Spinner className="mr-1 size-3.5" />}
                          {running ? (
                            <IconButton label="Stop" onClick={() => act(p.pm_id, 'stop', {}, p.name)}>
                              <Square className="size-3.5" />
                            </IconButton>
                          ) : (
                            <IconButton label="Start" onClick={() => act(p.pm_id, 'restart', {}, p.name)}>
                              <Play className="size-3.5" />
                            </IconButton>
                          )}
                          <IconButton label="Restart" onClick={() => act(p.pm_id, 'restart', {}, p.name)}>
                            <RefreshCw className="size-3.5" />
                          </IconButton>
                          <IconButton label="Logs" onClick={() => navigate(`/process/${p.pm_id}?tab=logs`)}>
                            <FileText className="size-3.5" />
                          </IconButton>
                          <Menu
                            trigger={
                              <IconButton label="More actions">
                                <MoreHorizontal className="size-4" />
                              </IconButton>
                            }
                          >
                            <MenuItem icon={<RotateCcw className="size-3.5" />} onClick={() => act(p.pm_id, 'reload', {}, p.name)}>
                              Reload (zero-downtime)
                            </MenuItem>
                            <MenuItem icon={<RefreshCw className="size-3.5" />} onClick={() => act(p.pm_id, 'restart', { updateEnv: true }, p.name)}>
                              Restart with updated env
                            </MenuItem>
                            <MenuItem icon={<Layers className="size-3.5" />} onClick={() => setScaling(p)}>
                              Scale instances…
                            </MenuItem>
                            <MenuItem icon={<Undo2 className="size-3.5" />} onClick={() => act(p.pm_id, 'reset', {}, p.name)}>
                              Reset counters
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem icon={<Eraser className="size-3.5" />} danger onClick={() => act(p.pm_id, 'flush', {}, p.name)}>
                              Flush logs
                            </MenuItem>
                            <MenuItem icon={<Trash2 className="size-3.5" />} danger onClick={() => act(p.pm_id, 'delete', {}, p.name)}>
                              Delete
                            </MenuItem>
                          </Menu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sysBusy && <span className="sr-only">Working…</span>}
      <ScaleDialog proc={scaling} onClose={() => setScaling(null)} />
    </>
  );
}
