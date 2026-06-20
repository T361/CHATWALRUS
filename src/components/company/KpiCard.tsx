import Link from 'next/link';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  href?: string;
  tooltip?: string;
}

export default function KpiCard({ title, value, subtitle, color, trend, href, tooltip }: KpiCardProps) {
  const trendColor = trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : undefined;
  const valueColor = color || trendColor || 'var(--text)';

  const card = (
    <div
      className={`card card-sm kpi-card${href ? ' card-hover' : ''}`}
      style={{ position: 'relative' }}
      title={tooltip}
    >
      <span className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        {title}
        {tooltip && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              border: '1px solid var(--border)',
              fontSize: '0.625rem',
              color: 'var(--text-muted)',
              cursor: 'help',
              flexShrink: 0,
            }}
          >
            ?
          </span>
        )}
      </span>
      <span className="kpi-value tabular" style={{ color: valueColor }}>{value}</span>
      {subtitle && <span className="kpi-sub">{subtitle}</span>}
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{card}</Link>;
  }
  return card;
}
