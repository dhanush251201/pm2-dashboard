// Minimal data-fetching hook with manual reload.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api.get<T>(url);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e: any) {
      if (n === seq.current) setError(e.message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
