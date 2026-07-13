interface HeaderProps {
  lastUpdatedAt: Date | null;
  isOnline: boolean;
}

function formatClock(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function Header({ lastUpdatedAt, isOnline }: HeaderProps) {
  return (
    <header
      className="border-b px-4 py-4 sm:px-6"
      style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--surface-card)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
            <polygon points="16,3 30,28 2,28" fill="none" stroke="var(--brand-accent)" strokeWidth="2.5" strokeLinejoin="round" />
            <rect x="14.5" y="12" width="3" height="9" rx="1" fill="var(--brand-accent)" />
            <rect x="14.5" y="23" width="3" height="3" rx="1" fill="var(--brand-accent)" />
          </svg>
          <div>
            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
              Defesa Civil — São Luís Weather Watch
            </p>
            <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
              Painel de monitoramento climático e alertas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: isOnline ? 'var(--status-informativo)' : 'var(--status-emergencia)' }}
          />
          {isOnline ? 'Conectado' : 'Sem conexão com a API'} · última atualização {formatClock(lastUpdatedAt)}
        </div>
      </div>
    </header>
  );
}
