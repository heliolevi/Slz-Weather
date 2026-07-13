import type { NivelSeveridade } from '../types/weather';

interface SeverityConfig {
  label: string;
  color: string;
  icon: string;
  pulse?: boolean;
}

const SEVERITY_CONFIG: Record<NivelSeveridade, SeverityConfig> = {
  INFORMATIVO: { label: 'Informativo', color: 'var(--status-informativo)', icon: 'ℹ' },
  'ATENÇÃO': { label: 'Atenção', color: 'var(--status-atencao)', icon: '▲' },
  ALERTA: { label: 'Alerta', color: 'var(--status-alerta)', icon: '⚠' },
  'EMERGÊNCIA': { label: 'Emergência', color: 'var(--status-emergencia)', icon: '⛔', pulse: true },
};

interface SeverityBadgeProps {
  nivel: NivelSeveridade;
  size?: 'sm' | 'lg';
}

export function SeverityBadge({ nivel, size = 'sm' }: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[nivel];
  const sizeClasses = size === 'lg' ? 'text-base px-4 py-1.5 gap-2' : 'text-xs px-2.5 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold uppercase tracking-wide ${sizeClasses} ${config.pulse ? 'animate-pulse' : ''}`}
      style={{
        color: config.color,
        borderColor: config.color,
        backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
      }}
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
}

export { SEVERITY_CONFIG };
