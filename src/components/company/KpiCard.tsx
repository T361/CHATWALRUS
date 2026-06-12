interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}

export default function KpiCard({ title, value, subtitle, color }: KpiCardProps) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </span>
      <span style={{ fontSize: '1.75rem', fontWeight: 700, color: color || '#111827' }}>
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{subtitle}</span>
      )}
    </div>
  );
}
