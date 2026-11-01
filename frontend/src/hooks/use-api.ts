'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/lib/api-client';

export interface QueryState<T> {
  data: T | undefined;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
}

/**
 * Minimal data-fetching hook. `key` changes trigger a refetch; responses that
 * arrive after a newer request started are ignored (no stale overwrites).
 * `refreshMs` re-reads the server periodically while the tab is visible
 * (silently: no loading flicker, and a failed refresh keeps the last data).
 */
export function useApi<T>(fetcher: (() => Promise<T>) | null, key: unknown[] = [], opts: { refreshMs?: number } = {}): QueryState<T> {
  const [data, setData] = React.useState<T>();
  const [error, setError] = React.useState<ApiError | Error | null>(null);
  const [loading, setLoading] = React.useState(!!fetcher);
  const requestId = React.useRef(0);
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = React.useCallback(async () => {
    const f = fetcherRef.current;
    if (!f) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await f();
      if (id === requestId.current) setData(result);
    } catch (err) {
      if (id === requestId.current) setError(err as Error);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const serialized = JSON.stringify(key);
  React.useEffect(() => {
    void reload();
  }, [serialized, reload, !!fetcher]); // eslint-disable-line react-hooks/exhaustive-deps

  const { refreshMs } = opts;
  React.useEffect(() => {
    if (!refreshMs || !fetcher) return;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || !fetcherRef.current) return;
      const id = ++requestId.current;
      try {
        const result = await fetcherRef.current();
        if (id === requestId.current) {
          setData(result);
          setError(null);
        }
      } catch {
        /* keep showing the last good data; the next tick retries */
      }
    };
    const t = setInterval(() => void refresh(), refreshMs);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshMs, serialized, !!fetcher]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload, setData };
}

/** Wraps a mutation with pending state and toast feedback. Errors are surfaced, never swallowed. */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { success?: string | ((r: R) => string); onSuccess?: (r: R) => void; onError?: (e: ApiError | Error) => void } = {}) {
  const [pending, setPending] = React.useState(false);
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  const run = React.useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      try {
        const r = await fn(...args);
        const s = optsRef.current.success;
        if (s) toast.success(typeof s === 'function' ? s(r) : s);
        optsRef.current.onSuccess?.(r);
        return r;
      } catch (err) {
        if (optsRef.current.onError) optsRef.current.onError(err as Error);
        else toast.error(errorMessage(err));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
