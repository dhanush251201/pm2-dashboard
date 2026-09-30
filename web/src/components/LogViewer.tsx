// Live log stream with backlog, filtering, pause and download.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Eraser, Pause, Play, WrapText } from 'lucide-react';
import { useChannel } from '../lib/ws';
import { api } from '../lib/api';
import { time } from '../lib/format';
import type { LogLine } from '../lib/types';
import { DownloadLink, IconButton } from './ui';

const MAX_LINES = 5000;
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

interface Row {
  key: number;
  at: number | null;
  type: 'out' | 'err' | 'sep';
  name?: string;
  pm_id?: number;
  text: string;
}

let seq = 0;

function explode(l: LogLine): Row[] {
  const parts = l.data.replace(ANSI, '').split('\n');
  if (parts.at(-1) === '') parts.pop();
  return parts.map((text) => ({ key: seq++, at: l.at, type: l.type, name: l.name, pm_id: l.pm_id, text }));
}

export function LogViewer({
  source,
  showName,
  height = 'h-[60vh]',
  historyLines = 300,
}: {
  source: number | 'all';
  showName?: boolean;
  height?: string;
  historyLines?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [stream, setStream] = useState<'both' | 'out' | 'err'>('both');
  const [wrap, setWrap] = useState(true);
  const [stick, setStick] = useState(true);
  const [loading, setLoading] = useState(source !== 'all');
  const buffer = useRef<Row[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Backlog from log files (per-process only).
  useEffect(() => {
    setRows([]);
    if (source === 'all') return;
    setLoading(true);
    api
      .get<{ out: string[]; err: string[] }>(`/api/processes/${source}/logs?lines=${historyLines}`)
      .then((r) => {
        // Files have no shared timestamps, so history is shown per stream, then live lines.
        const sep = (text: string): Row => ({ key: seq++, at: null, type: 'sep', text });
        const hist: Row[] = [
          sep(`stdout — last ${r.out.length} lines from file`),
          ...r.out.map((text) => ({ key: seq++, at: null, type: 'out' as const, text: text.replace(ANSI, '') })),
          sep(`stderr — last ${r.err.length} lines from file`),
          ...r.err.map((text) => ({ key: seq++, at: null, type: 'err' as const, text: text.replace(ANSI, '') })),
          sep('live'),
        ];
        setRows((live) => [...hist, ...live].slice(-MAX_LINES));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [source, historyLines]);

  // Batch incoming lines so bursts don't re-render per line.
  useEffect(() => {
    const t = setInterval(() => {
      if (pausedRef.current || buffer.current.length === 0) return;
      const add = buffer.current;
      buffer.current = [];
      setRows((r) => {
        const next = r.concat(add);
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    }, 150);
    return () => clearInterval(t);
  }, []);

  useChannel(`logs:${source}`, (l: LogLine) => {
    buffer.current.push(...explode(l));
    if (buffer.current.length > MAX_LINES) buffer.current.splice(0, buffer.current.length - MAX_LINES);
  });

  const visible = useMemo(() => {
    let r = rows;
    if (stream !== 'both') r = r.filter((x) => x.type === stream || x.type === 'sep');
    if (filter) {
      const m = /^\/(.+)\/([a-z]*)$/.exec(filter);
      let test: (s: string) => boolean;
      try {
        if (m) {
          const rx = new RegExp(m[1], m[2].replace('g', ''));
          test = (s) => rx.test(s);
        } else {
          const q = filter.toLowerCase();
          test = (s) => s.toLowerCase().includes(q);
        }
      } catch {
        test = () => true;
      }
      r = r.filter((x) => x.type === 'sep' || test(x.text) || (x.name ? test(x.name) : false));
    }
    return r;
  }, [rows, stream, filter]);

  useLayoutEffect(() => {
    if (stick && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [visible, stick]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-72"
          placeholder="Filter lines… (text or /regex/)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter log lines"
        />
        <select className="input w-auto" value={stream} onChange={(e) => setStream(e.target.value as any)} aria-label="Stream">
          <option value="both">stdout + stderr</option>
          <option value="out">stdout</option>
          <option value="err">stderr</option>
        </select>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-xs text-muted tabular">
            {visible.length.toLocaleString()} lines{paused && buffer.current.length ? ` · ${buffer.current.length} queued` : ''}
          </span>
          <IconButton label={paused ? 'Resume' : 'Pause'} onClick={() => setPaused((p) => !p)}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </IconButton>
          <IconButton label={wrap ? 'No wrap' : 'Wrap lines'} onClick={() => setWrap((w) => !w)} className={wrap ? 'text-accent' : ''}>
            <WrapText className="size-4" />
          </IconButton>
          <IconButton label="Clear view" onClick={() => setRows([])}>
            <Eraser className="size-4" />
          </IconButton>
          {source !== 'all' && (
            <>
              <DownloadLink href={`/api/processes/${source}/logs/download?type=out`}>out</DownloadLink>
              <DownloadLink href={`/api/processes/${source}/logs/download?type=err`}>err</DownloadLink>
            </>
          )}
        </div>
      </div>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={onScroll}
          className={`${height} overflow-auto rounded-lg border border-line bg-[var(--term-bg)] p-2 font-mono text-[12px] leading-[1.45]`}
          role="log"
          aria-live="off"
        >
          {loading && <p className="text-muted">Loading history…</p>}
          {!loading && visible.every((r) => r.type === 'sep') && <p className="text-muted">{filter ? 'No lines match the filter.' : 'Waiting for output…'}</p>}
          {visible.map((r) =>
            r.type === 'sep' ? (
              <div key={r.key} className="my-1 flex items-center gap-2 text-[11px] text-muted select-none">
                <span className="h-px flex-1 bg-line" />
                {r.text}
                <span className="h-px flex-1 bg-line" />
              </div>
            ) : (
            <div key={r.key} className={`flex gap-2 ${wrap ? '' : 'whitespace-pre'}`}>
              <span className="w-[62px] shrink-0 text-muted tabular select-none">{r.at ? time(r.at) : ''}</span>
              {showName && r.name && <span className="w-28 shrink-0 truncate text-accent select-none">{r.name}</span>}
              <span className={`min-w-0 ${wrap ? 'break-all whitespace-pre-wrap' : ''} ${r.type === 'err' ? 'text-critical-ink' : 'text-[var(--term-fg)]'}`}>
                {r.text || ' '}
              </span>
            </div>
            ),
          )}
        </div>
        {!stick && (
          <button
            className="absolute right-4 bottom-3 flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white shadow-lg cursor-pointer"
            onClick={() => setStick(true)}
          >
            <ArrowDownToLine className="size-3.5" /> Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}
