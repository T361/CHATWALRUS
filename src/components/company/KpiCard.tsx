import Link from 'next/link';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  href?: string;
}

export default function KpiCard({ title, value, subtitle, color, trend, href }: KpiCardProps) {
  const trendColor = trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : undefined;
  const valueColor = color || trendColor || 'var(--text)';

  const card = (
    <div className={`card card-sm kpi-card${href ? ' card-hover' : ''}`}>
      <span className="kpi-label">{title}</span>
      <span className="kpi-value tabular" style={{ color: valueColor }}>{value}</span>
      {subtitle && <span className="kpi-sub">{subtitle}</span>}
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{card}</Link>;
  }
  return card;
}
