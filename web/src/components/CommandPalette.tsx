// ⌘K palette: jump to pages and processes, or run actions on them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useProcesses } from '../lib/store';
import { useProcActions } from '../lib/procActions';
import { NAV } from './nav';

interface Item {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

function score(q: string, text: string) {
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 2 + (t.startsWith(q) ? 1 : 0);
  // subsequence match
  let i = 0;
  for (const c of t) if (c === q[i]) i++;
  return i === q.length ? 1 : 0;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const procs = useProcesses() ?? [];
  const navigate = useNavigate();
  const { act } = useProcActions();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = NAV.map((n) => ({ id: `nav:${n.to}`, label: `Go to ${n.label}`, hint: 'page', run: () => navigate(n.to) }));
    const names = new Map<string, number>();
    for (const p of procs) {
      out.push({ id: `open:${p.pm_id}`, label: `Open ${p.name}`, hint: `#${p.pm_id} · ${p.status}`, run: () => navigate(`/process/${p.pm_id}`) });
      names.set(p.name, (names.get(p.name) || 0) + 1);
    }
    for (const [name] of names) {
      for (const a of ['restart', 'reload', 'stop', 'reset'] as const) {
        out.push({ id: `${a}:${name}`, label: `${a[0].toUpperCase()}${a.slice(1)} ${name}`, hint: 'action', run: () => act(name, a) });
      }
      out.push({ id: `logs:${name}`, label: `Logs of ${name}`, hint: 'page', run: () => navigate(`/process/${procs.find((p) => p.name === name)?.pm_id}?tab=logs`) });
    }
    for (const a of ['restart', 'reload', 'stop'] as const) {
      out.push({ id: `${a}:all`, label: `${a[0].toUpperCase()}${a.slice(1)} all processes`, hint: 'action', run: () => act('all', a) });
    }
    return out;
  }, [procs, navigate, act]);

  const query = q.trim().toLowerCase();
  const results = items
    .map((it) => ({ it, s: score(query, it.label) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.it);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const choose = (it?: Item) => {
    if (!it) return;
    onClose();
    it.run();
  };

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-black/40 p-4 pt-[14vh]" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-muted" />
          <input
            autoFocus
            className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
            placeholder="Search processes, pages and actions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === 'Enter') choose(results[sel]);
              else if (e.key === 'Escape') onClose();
            }}
            aria-label="Command search"
          />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-80 overflow-auto p-1" role="listbox">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No matches</li>}
          {results.map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === sel}>
              <button
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] cursor-pointer ${i === sel ? 'bg-accent text-white' : 'text-ink'}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => choose(it)}
              >
                <span>{it.label}</span>
                {it.hint && <span className={`text-xs ${i === sel ? 'text-white/80' : 'text-muted'}`}>{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
