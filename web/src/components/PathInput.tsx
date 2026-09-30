// Text input with a server-side file/directory browser.
import { useEffect, useState } from 'react';
import { ArrowUp, File, Folder, FolderOpen, Home } from 'lucide-react';
import { Button, IconButton, Modal, Spinner } from './ui';
import { api, enc } from '../lib/api';

interface Listing {
  path: string;
  parent: string | null;
  home: string;
  entries: { name: string; dir: boolean }[];
}

function join(dir: string, name: string) {
  return dir.endsWith('/') ? dir + name : `${dir}/${name}`;
}

export function PathBrowser({
  open,
  onClose,
  onPick,
  mode,
  start,
  filter,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (path: string) => void;
  mode: 'file' | 'dir';
  start?: string;
  filter?: RegExp;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = (p?: string) => {
    setError(null);
    api
      .get<Listing>(`/api/fs/ls?path=${enc(p || '')}${hidden ? '&hidden=1' : ''}`)
      .then(setListing)
      .catch((e) => {
        setError(e.message);
        if (p) api.get<Listing>('/api/fs/ls').then(setListing);
      });
  };

  useEffect(() => {
    if (open) load(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hidden]);

  const entries = listing?.entries.filter((e) => e.dir || (mode === 'file' && (!filter || filter.test(e.name)))) ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={mode === 'dir' ? 'Choose a folder' : 'Choose a file'}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Show hidden files
          </label>
          <Button onClick={onClose}>Cancel</Button>
          {mode === 'dir' && (
            <Button variant="primary" disabled={!listing} onClick={() => listing && (onPick(listing.path), onClose())}>
              Use this folder
            </Button>
          )}
        </>
      }
    >
      <div className="mb-2 flex items-center gap-1">
        <IconButton label="Home folder" onClick={() => load(listing?.home)}>
          <Home className="size-4" />
        </IconButton>
        <IconButton label="Parent folder" disabled={!listing?.parent} onClick={() => load(listing?.parent ?? undefined)}>
          <ArrowUp className="size-4" />
        </IconButton>
        <input
          className="input font-mono text-xs"
          value={listing?.path ?? ''}
          onChange={(e) => setListing((l) => (l ? { ...l, path: e.target.value } : l))}
          onKeyDown={(e) => e.key === 'Enter' && load((e.target as HTMLInputElement).value)}
          aria-label="Current folder"
        />
      </div>
      {error && <p className="mb-2 text-xs text-critical-ink">{error}</p>}
      <div className="h-80 overflow-auto rounded-lg border border-line">
        {!listing ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <p className="p-4 text-[13px] text-muted">Nothing here.</p>
        ) : (
          <ul>
            {entries.map((e) => (
              <li key={e.name}>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-2 cursor-pointer"
                  onClick={() => {
                    const p = join(listing.path, e.name);
                    if (e.dir) load(p);
                    else {
                      onPick(p);
                      onClose();
                    }
                  }}
                >
                  {e.dir ? <Folder className="size-4 text-accent" /> : <File className="size-4 text-muted" />}
                  <span className="truncate">{e.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export function PathInput({
  value,
  onChange,
  mode = 'file',
  placeholder,
  start,
  filter,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  mode?: 'file' | 'dir';
  placeholder?: string;
  start?: string;
  filter?: RegExp;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const startDir = value ? (mode === 'dir' ? value : value.replace(/\/[^/]*$/, '') || '/') : start;
  return (
    <div className="flex gap-2">
      <input id={id} className="input font-mono text-xs" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <Button type="button" icon={<FolderOpen className="size-3.5" />} onClick={() => setOpen(true)}>
        Browse
      </Button>
      <PathBrowser open={open} onClose={() => setOpen(false)} onPick={onChange} mode={mode} start={startDir} filter={filter} />
    </div>
  );
}
