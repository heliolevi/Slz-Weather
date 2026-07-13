import { useMemo } from 'react';
import { weatherApi } from '../api/client';
import { usePolling } from './usePolling';

const POLL_INTERVAL_MS = 60_000;

export function useEmergencies() {
  const fetcher = useMemo(() => weatherApi.getEmergencies, []);
  return usePolling(fetcher, POLL_INTERVAL_MS);
}
