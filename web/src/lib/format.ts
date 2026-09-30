export function bytes(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function duration(ms: number): string {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function since(ts: number | null | undefined): string {
  if (!ts) return '—';
  return duration(Date.now() - ts);
}

export function ago(ts: number | null | undefined): string {
  if (!ts) return 'never';
  const d = Date.now() - ts;
  if (d < 5000) return 'just now';
  return `${duration(d).split(' ')[0]} ago`;
}

export function time(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

export function dateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString([], { hour12: false });
}

export function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(n < 10 ? 1 : 0)}%`;
}
