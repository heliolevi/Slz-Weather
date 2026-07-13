import { useMemo } from 'react';
import { weatherApi } from '../api/client';
import { usePolling } from './usePolling';

const POLL_INTERVAL_MS = 60_000;

export function useCurrentAlert() {
  const fetcher = useMemo(() => weatherApi.getCurrentWeather, []);
  return usePolling(fetcher, POLL_INTERVAL_MS);
}
