import type { RainTrendResult } from '../types/weather';

interface RainTrendCardProps {
  trend: RainTrendResult;
}

export function RainTrendCard({ trend }: RainTrendCardProps) {
  const color = trend.riscoInundacaoSubita ? 'var(--status-alerta)' : 'var(--status-informativo)';

  return (
    <div
      className="rounded-xl border p-6"
      style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-hairline)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Tendência de chuva (últimas 3h)
      </p>

      <div className="mt-3 flex items-center gap-3">
        <span aria-hidden="true" className="text-2xl">
          {trend.riscoInundacaoSubita ? '⚠' : '✓'}
        </span>
        <p className="text-2xl font-bold" style={{ color }}>
          {trend.mediaChuva.toFixed(2)} mm
          <span className="ml-1 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
            média
          </span>
        </p>
      </div>

      <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {trend.mensagem}
      </p>
    </div>
  );
}
