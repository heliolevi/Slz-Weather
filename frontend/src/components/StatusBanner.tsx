interface StatusBannerProps {
  tone: 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}

const TONE_STYLES: Record<StatusBannerProps['tone'], { color: string; icon: string }> = {
  error: { color: 'var(--status-emergencia)', icon: '⛔' },
  warning: { color: 'var(--status-atencao)', icon: '▲' },
  info: { color: 'var(--status-informativo)', icon: 'ℹ' },
};

export function StatusBanner({ tone, title, description }: StatusBannerProps) {
  const { color, icon } = TONE_STYLES[tone];
  return (
    <div
      className="flex items-start gap-3 rounded-lg border px-4 py-3"
      style={{
        color,
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
      role="status"
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {icon}
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-sm opacity-90">{description}</p>}
      </div>
    </div>
  );
}
