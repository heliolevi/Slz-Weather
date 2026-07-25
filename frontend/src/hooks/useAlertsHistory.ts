import { useEffect, useMemo, useRef } from 'react';
import { weatherApi } from '../api/client';
import { usePolling } from './usePolling';

const POLL_INTERVAL_MS = 60_000;

export function useAlertsHistory(page: number) {
  const fetcher = useMemo(() => () => weatherApi.getAlertsHistory(page), [page]);
  const polling = usePolling(fetcher, POLL_INTERVAL_MS);
  const isFirstRender = useRef(true);

  // usePolling já faz a carga inicial sozinho; este efeito só força um refetch imediato quando
  // a página muda DEPOIS do mount (sem isso, a nova página só apareceria no próximo ciclo de
  // polling, até 60s depois de trocar de página).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    polling.refresh();
  }, [page, polling.refresh]);

  return polling;
}
