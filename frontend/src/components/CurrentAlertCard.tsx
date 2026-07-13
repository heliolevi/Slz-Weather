import type { WeatherAlert } from '../types/weather';
import { parseContingency } from '../types/weather';
import { SeverityBadge } from './SeverityBadge';
import { ZonasAfetadasChips } from './ZonasAfetadasChips';

interface CurrentAlertCardProps {
  alert: WeatherAlert;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const METRICS: Array<{
  key: keyof Pick<WeatherAlert, 'velocidadeVento' | 'precipitacao' | 'temperatura'>;
  label: string;
  unit: string;
  icon: string;
}> = [
  { key: 'velocidadeVento', label: 'Vento', unit: 'km/h', icon: '💨' },
  { key: 'precipitacao', label: 'Precipitação', unit: 'mm', icon: '🌧' },
  { key: 'temperatura', label: 'Temperatura', unit: '°C', icon: '🌡' },
];

export function CurrentAlertCard({ alert }: CurrentAlertCardProps) {
  const { emContingencia, descricaoLimpa } = parseContingency(alert.descricao);

  return (
    <div
      className="rounded-xl border p-6"
      style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-hairline)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {alert.cidade} · {alert.tipoAlerta.replace('_', ' ')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Atualizado em {formatTimestamp(alert.timestamp)}
          </p>
        </div>
        <SeverityBadge nivel={alert.nivelSeveridade} size="lg" />
      </div>

      {emContingencia && (
        <div
          className="mt-4 rounded-md border px-3 py-2 text-xs font-medium"
          style={{
            borderColor: 'var(--brand-accent)',
            color: 'var(--brand-accent)',
            backgroundColor: 'color-mix(in srgb, var(--brand-accent) 12%, transparent)',
          }}
        >
          ⚡ Modo contingência — exibindo o último dado válido em cache. A fonte externa pode estar indisponível.
        </div>
      )}

      <p className="mt-4 text-lg leading-snug" style={{ color: 'var(--text-primary)' }}>
        {descricaoLimpa}
      </p>

      <div
        className="mt-3 rounded-md border-l-4 px-4 py-2 text-sm"
        style={{ borderColor: 'var(--brand-accent)', backgroundColor: 'var(--surface-card-raised)', color: 'var(--text-secondary)' }}
      >
        <span className="font-semibold" style={{ color: 'var(--brand-accent)' }}>
          Ação preventiva:
        </span>{' '}
        {alert.acaoPreventiva}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {METRICS.map((metric) => (
          <div
            key={metric.key}
            className="rounded-lg border p-3 text-center"
            style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--surface-card-raised)' }}
          >
            <p className="text-xl" aria-hidden="true">
              {metric.icon}
            </p>
            <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {alert[metric.key]} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{metric.unit}</span>
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {metric.label}
            </p>
          </div>
        ))}
      </div>

      {alert.zonasAfetadas.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Zonas afetadas
          </p>
          <ZonasAfetadasChips zonas={alert.zonasAfetadas} />
        </div>
      )}
    </div>
  );
}
