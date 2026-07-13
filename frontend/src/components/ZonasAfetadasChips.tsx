interface ZonasAfetadasChipsProps {
  zonas: string[];
}

export function ZonasAfetadasChips({ zonas }: ZonasAfetadasChipsProps) {
  if (zonas.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma zona afetada no momento.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {zonas.map((zona) => (
        <span
          key={zona}
          className="rounded-md border px-2.5 py-1 text-xs font-medium"
          style={{
            borderColor: 'var(--border-hairline)',
            backgroundColor: 'var(--surface-card-raised)',
            color: 'var(--text-secondary)',
          }}
        >
          📍 {zona}
        </span>
      ))}
    </div>
  );
}
