import { useState } from 'react';
import { Header } from './components/Header';
import { CurrentAlertCard } from './components/CurrentAlertCard';
import { RainTrendCard } from './components/RainTrendCard';
import { EmergencyFeed } from './components/EmergencyFeed';
import { AlertsHistoryTable } from './components/AlertsHistoryTable';
import { StatusBanner } from './components/StatusBanner';
import { useCurrentAlert } from './hooks/useCurrentAlert';
import { useRainTrend } from './hooks/useRainTrend';
import { useEmergencies } from './hooks/useEmergencies';
import { useAlertsHistory } from './hooks/useAlertsHistory';

type Tab = 'painel' | 'emergencias' | 'historico';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'painel', label: 'Painel' },
  { id: 'emergencias', label: 'Emergências' },
  { id: 'historico', label: 'Histórico' },
];

function Skeleton() {
  return (
    <div
      className="h-40 animate-pulse rounded-xl border"
      style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--surface-card)' }}
    />
  );
}

function App() {
  const [tab, setTab] = useState<Tab>('painel');
  const currentAlert = useCurrentAlert();
  const rainTrend = useRainTrend();
  const emergencies = useEmergencies();
  const history = useAlertsHistory();

  const isOnline = currentAlert.error === null || currentAlert.error.status !== 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--surface-page)' }}>
      <Header lastUpdatedAt={currentAlert.lastUpdatedAt} isOnline={isOnline} />

      <nav className="mx-auto flex max-w-6xl gap-1 px-4 pt-4 sm:px-6">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: active ? 'var(--surface-card)' : 'transparent',
                color: active ? 'var(--brand-accent)' : 'var(--text-muted)',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <main
        className="mx-auto max-w-6xl border-t px-4 py-6 sm:px-6"
        style={{ borderColor: 'var(--border-hairline)' }}
      >
        {tab === 'painel' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Situação atual — São Luís
              </h1>
              <button
                onClick={() => {
                  currentAlert.refresh();
                  rainTrend.refresh();
                }}
                className="rounded-md border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-secondary)' }}
              >
                ↻ Atualizar agora
              </button>
            </div>

            {currentAlert.error && (
              <StatusBanner
                tone={currentAlert.error.status === 422 ? 'warning' : 'error'}
                title={
                  currentAlert.error.status === 422
                    ? 'Fonte de dados externa fora do contrato esperado'
                    : 'Falha ao consultar a situação atual'
                }
                description={currentAlert.error.message}
              />
            )}

            {!currentAlert.error && currentAlert.loading && !currentAlert.data && <Skeleton />}
            {currentAlert.data && <CurrentAlertCard alert={currentAlert.data} />}

            {rainTrend.error && (
              <StatusBanner tone="error" title="Falha ao consultar tendência de chuva" description={rainTrend.error.message} />
            )}
            {!rainTrend.error && rainTrend.loading && !rainTrend.data && <Skeleton />}
            {rainTrend.data && <RainTrendCard trend={rainTrend.data} />}
          </div>
        )}

        {tab === 'emergencias' && (
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Emergências ativas (últimas 24h)
            </h1>
            {emergencies.error && (
              <StatusBanner tone="error" title="Falha ao consultar emergências" description={emergencies.error.message} />
            )}
            {!emergencies.error && emergencies.loading && !emergencies.data && <Skeleton />}
            {emergencies.data && <EmergencyFeed emergencies={emergencies.data} />}
          </div>
        )}

        {tab === 'historico' && (
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Histórico de alertas
            </h1>
            {history.error && (
              <StatusBanner tone="error" title="Falha ao consultar histórico" description={history.error.message} />
            )}
            {!history.error && history.loading && !history.data && <Skeleton />}
            {history.data && <AlertsHistoryTable alerts={history.data} />}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
