import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

interface PollingState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  lastUpdatedAt: Date | null;
  refresh: () => void;
}

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
      setLastUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Erro inesperado.', 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, [load, intervalMs]);

  return { data, error, loading, lastUpdatedAt, refresh: load };
}
