import type { WeatherAlert } from '../types/weather';
import { SeverityBadge } from './SeverityBadge';

interface AlertsHistoryTableProps {
  alerts: WeatherAlert[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AlertsHistoryTable({ alerts }: AlertsHistoryTableProps) {
  if (alerts.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Nenhum registro histórico disponível ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border-hairline)' }}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr style={{ backgroundColor: 'var(--surface-card-raised)' }}>
            {['Data/Hora', 'Tipo', 'Severidade', 'Vento', 'Chuva', 'Temp.', 'Zonas afetadas'].map((head) => (
              <th
                key={head}
                className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id} className="border-t" style={{ borderColor: 'var(--border-hairline)' }}>
              <td className="whitespace-nowrap px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                {formatTime(alert.timestamp)}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                {alert.tipoAlerta.replace('_', ' ')}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <SeverityBadge nivel={alert.nivelSeveridade} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                {alert.velocidadeVento} km/h
              </td>
              <td className="whitespace-nowrap px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                {alert.precipitacao} mm
              </td>
              <td className="whitespace-nowrap px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                {alert.temperatura} °C
              </td>
              <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                {alert.zonasAfetadas.join(', ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
