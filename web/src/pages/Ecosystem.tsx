// Ecosystem files: open/edit/save, apply (start/startOrRestart/startOrReload/...),
// generate (pm2 init) and export the running process list.
import { useEffect, useState } from 'react';
import { ChevronDown, Download, FileCode2, FilePlus2, FolderOpen, Play, Save, X } from 'lucide-react';
import { Button, Card, Empty, Field, IconButton, Menu, MenuItem, MenuSeparator, Modal, PageHeader, Spinner, Toggle } from '../components/ui';
import { PathBrowser, PathInput } from '../components/PathInput';
import { CodeEditor } from '../components/CodeEditor';
import { useJobPanel } from '../components/JobsDrawer';
import { useFetch } from '../lib/useFetch';
import { useAction, useFeedback } from '../lib/feedback';
import { api, enc } from '../lib/api';

const CONFIG_FILE = /(\.json|\.ya?ml|\.config\.[cm]?js)$/;

interface Parsed {
  apps: { name: string; script: string; instances?: number | string; exec_mode?: string }[];
  envs: string[];
  deploy: Record<string, unknown>;
}

const APPLY: { action: string; label: string; hint: string; danger?: boolean }[] = [
  { action: 'startOrRestart', label: 'Start or restart', hint: 'Start missing apps, restart running ones' },
  { action: 'startOrReload', label: 'Start or reload', hint: 'Like above, zero-downtime reload for cluster apps' },
  { action: 'start', label: 'Start', hint: 'Start apps from this file' },
  { action: 'restart', label: 'Restart', hint: 'Restart apps defined in this file' },
  { action: 'reload', label: 'Reload', hint: 'Zero-downtime reload of apps in this file' },
  { action: 'stop', label: 'Stop', hint: 'Stop apps defined in this file', danger: true },
  { action: 'delete', label: 'Delete', hint: 'Remove apps defined in this file from pm2', danger: true },
];

function GenerateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (file: string) => void }) {
  const [dir, setDir] = useState('');
  const [simple, setSimple] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const { start } = useJobPanel();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate an ecosystem file"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!dir}
            onClick={async () => {
              const job: any = await start(() => api.post('/api/ecosystem/generate', { dir, simple, overwrite }));
              if (job) {
                onClose();
                setTimeout(() => onCreated(job.file), 1200);
              }
            }}
          >
            Generate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Folder" hint="ecosystem.config.js is created here (pm2 init)">
          <PathInput mode="dir" value={dir} onChange={setDir} />
        </Field>
        <Toggle checked={simple} onChange={setSimple} label="Minimal template" hint="pm2 init simple" />
        <Toggle checked={overwrite} onChange={setOverwrite} label="Overwrite if the file exists" />
      </div>
    </Modal>
  );
}

export default function EcosystemPage() {
  const files = useFetch<{ recent: string[]; discovered: string[] }>('/api/ecosystem/files');
  const [path, setPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [only, setOnly] = useState<string[]>([]);
  const [env, setEnv] = useState('');
  const [updateEnv, setUpdateEnv] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [generate, setGenerate] = useState(false);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const { run, busy } = useAction();
  const { confirm, toast } = useFeedback();
  const { start } = useJobPanel();
  const dirty = content !== saved;
  const isNew = exportPath !== null;

  const parse = (p: string) => {
    setParsed(null);
    setParseError(null);
    api
      .get<Parsed>(`/api/ecosystem/parsed?path=${enc(p)}`)
      .then(setParsed)
      .catch((e) => setParseError(e.message));
  };

  const open = async (p: string) => {
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', confirmText: 'Discard', danger: true }))) return;
    setExportPath(null);
    setLoading(true);
    try {
      const r = await api.get<{ path: string; content: string }>(`/api/ecosystem/file?path=${enc(p)}`);
      setPath(r.path);
      setContent(r.content);
      setSaved(r.content);
      setOnly([]);
      setEnv('');
      parse(r.path);
      files.reload();
    } catch (e: any) {
      toast({ tone: 'error', title: 'Could not open file', body: e.message });
    } finally {
      setLoading(false);
    }
  };

  const save = async (target = path) => {
    if (!target) return;
    const r = await run('save', () => api.put('/api/ecosystem/file', { path: target, content }), 'Saved');
    if (r) {
      setPath(target);
      setSaved(content);
      setExportPath(null);
      parse(target);
      files.reload();
    }
  };

  const exportCurrent = async () => {
    const r = await run('export', () => api.get<{ content: string }>('/api/ecosystem/export'));
    if (r) {
      setPath(null);
      setContent(r.content);
      setSaved('');
      setParsed(null);
      setExportPath('');
    }
  };

  const apply = async (action: string, danger?: boolean) => {
    if (!path) return;
    if (dirty && !(await confirm({ title: 'Save changes first?', body: 'pm2 reads the file from disk, so unsaved edits would be ignored.', confirmText: 'Save and apply' }))) return;
    if (dirty) await save();
    if (danger && !(await confirm({ title: `${action} apps from this file?`, confirmText: action, danger: true }))) return;
    start(() => api.post('/api/ecosystem/apply', { path, action, only: only.join(',') || undefined, env: env || undefined, updateEnv }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && path && dirty) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const allFiles = [...(files.data?.recent ?? []).map((f) => ({ f, recent: true })), ...(files.data?.discovered ?? []).map((f) => ({ f, recent: false }))];
  const lang = path?.endsWith('.json') ? 'json' : path && /\.ya?ml$/.test(path) ? 'text' : 'js';

  return (
    <>
      <PageHeader
        title="Ecosystem files"
        subtitle="Declare apps in a config file, then start, reload or stop them together"
        actions={
          <>
            <Button icon={<FolderOpen className="size-3.5" />} onClick={() => setBrowse(true)}>
              Open file
            </Button>
            <Button icon={<FilePlus2 className="size-3.5" />} onClick={() => setGenerate(true)}>
              Generate new
            </Button>
            <Button icon={<Download className="size-3.5" />} loading={busy === 'export'} onClick={exportCurrent}>
              Export running processes
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card title="Files" padded={false}>
          {files.loading && !files.data ? (
            <div className="p-4">
              <Spinner />
            </div>
          ) : allFiles.length === 0 ? (
            <p className="p-4 text-[13px] text-muted">No ecosystem files yet. Open one, generate one, or export your running processes.</p>
          ) : (
            <ul className="max-h-[70vh] overflow-auto py-1">
              {allFiles.map(({ f, recent }) => (
                <li key={f} className="group flex items-center">
                  <button
                    onClick={() => open(f)}
                    className={`min-w-0 flex-1 px-4 py-2 text-left cursor-pointer hover:bg-surface-2 ${f === path ? 'bg-accent/10' : ''}`}
                    title={f}
                  >
                    <div className="truncate text-[13px] font-medium">{f.split('/').pop()}</div>
                    <div className="truncate text-[11px] text-muted">
                      {recent ? '' : 'found in app folder · '}
                      {f.replace(/\/[^/]+$/, '')}
                    </div>
                  </button>
                  {recent && (
                    <IconButton
                      label="Remove from list"
                      className="mr-2 opacity-0 group-hover:opacity-100"
                      onClick={() => api.del(`/api/ecosystem/files?path=${enc(f)}`).then(files.reload)}
                    >
                      <X className="size-3.5" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {loading ? (
            <Card>
              <Spinner />
            </Card>
          ) : !path && !isNew ? (
            <Card>
              <Empty icon={<FileCode2 className="size-8" />} title="Select an ecosystem file">
                Pick a file on the left, or use the buttons above.
              </Empty>
            </Card>
          ) : (
            <>
              <Card
                title={isNew ? 'Exported from running processes (unsaved)' : path?.split('/').pop()}
                subtitle={isNew ? 'Review, then save it somewhere' : path}
                actions={
                  <>
                    {dirty && !isNew && <span className="text-xs text-warning-ink">Unsaved</span>}
                    {isNew ? (
                      <>
                        <input
                          className="input w-80 font-mono text-xs"
                          placeholder="/path/to/ecosystem.config.js"
                          value={exportPath ?? ''}
                          onChange={(e) => setExportPath(e.target.value)}
                          aria-label="Save as"
                        />
                        <Button variant="primary" size="sm" icon={<Save className="size-3.5" />} disabled={!exportPath || !CONFIG_FILE.test(exportPath)} onClick={() => save(exportPath!)}>
                          Save as
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant={dirty ? 'primary' : 'secondary'} icon={<Save className="size-3.5" />} disabled={!dirty} loading={busy === 'save'} onClick={() => save()}>
                        Save
                      </Button>
                    )}
                  </>
                }
              >
                <CodeEditor value={content} onChange={setContent} language={lang as any} height="52vh" />
              </Card>

              {!isNew && (
                <Card title="Apply to pm2" subtitle="Runs pm2 <action> on this file">
                  {parseError && <p className="mb-3 text-xs text-critical-ink">{parseError}</p>}
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Only these apps (--only)" hint={parsed ? `${parsed.apps.length} app(s) in file` : 'Loading…'}>
                      <div className="flex max-h-32 flex-col gap-1 overflow-auto rounded-lg border border-line p-2">
                        {parsed?.apps.map((a) => (
                          <label key={a.name} className="flex items-center gap-2 text-[13px]">
                            <input
                              type="checkbox"
                              checked={only.includes(a.name)}
                              onChange={(e) => setOnly((o) => (e.target.checked ? [...o, a.name] : o.filter((x) => x !== a.name)))}
                            />
                            {a.name}
                            <span className="truncate text-xs text-muted">{a.script}</span>
                          </label>
                        ))}
                        {parsed && parsed.apps.length === 0 && <span className="text-xs text-muted">No apps found</span>}
                      </div>
                    </Field>
                    <Field label="Environment (--env)" hint="Uses the env_<name> block of each app">
                      <select className="input" value={env} onChange={(e) => setEnv(e.target.value)}>
                        <option value="">default (env)</option>
                        {parsed?.envs.map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="flex flex-col justify-between gap-3">
                      <Toggle checked={updateEnv} onChange={setUpdateEnv} label="Update environment (--update-env)" />
                      <div className="flex gap-2">
                        <Button variant="primary" icon={<Play className="size-3.5" />} onClick={() => apply('startOrRestart')}>
                          Start or restart
                        </Button>
                        <Menu
                          trigger={
                            <Button>
                              More <ChevronDown className="size-3.5" />
                            </Button>
                          }
                        >
                          {APPLY.slice(1).map((a, i) => (
                            <div key={a.action}>
                              {a.danger && APPLY[i]?.danger !== true && <MenuSeparator />}
                              <MenuItem danger={a.danger} onClick={() => apply(a.action, a.danger)}>
                                <span>
                                  {a.label}
                                  <span className="block text-[11px] opacity-70">{a.hint}</span>
                                </span>
                              </MenuItem>
                            </div>
                          ))}
                        </Menu>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
      <PathBrowser open={browse} onClose={() => setBrowse(false)} mode="file" filter={CONFIG_FILE} onPick={open} />
      <GenerateDialog open={generate} onClose={() => setGenerate(false)} onCreated={open} />
    </>
  );
}
