import type { WeatherAlert } from '../types/weather';
import { parseContingency } from '../types/weather';
import { SeverityBadge } from './SeverityBadge';

interface EmergencyFeedProps {
  emergencies: WeatherAlert[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EmergencyFeed({ emergencies }: EmergencyFeedProps) {
  if (emergencies.length === 0) {
    return (
      <div
        className="rounded-xl border p-8 text-center"
        style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--surface-card)' }}
      >
        <p className="text-2xl" aria-hidden="true">✓</p>
        <p className="mt-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
          Nenhuma emergência ativa
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Nenhum evento de ALERTA ou EMERGÊNCIA nas últimas 24 horas.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {emergencies.map((event) => {
        const { descricaoLimpa } = parseContingency(event.descricao);
        return (
          <li
            key={event.id}
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--surface-card)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {event.tipoAlerta.replace('_', ' ')}
              </span>
              <SeverityBadge nivel={event.nivelSeveridade} />
            </div>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {descricaoLimpa}
            </p>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatTime(event.timestamp)} · {event.zonasAfetadas.join(', ') || 'sem zona registrada'}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
