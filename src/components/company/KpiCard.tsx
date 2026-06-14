interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export default function KpiCard({ title, value, subtitle, color, trend }: KpiCardProps) {
  const trendColor = trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : undefined;
  const valueColor = color || trendColor || 'var(--text)';

  return (
    <div className="card card-sm kpi-card">
      <span className="kpi-label">{title}</span>
      <span className="kpi-value tabular" style={{ color: valueColor }}>{value}</span>
      {subtitle && <span className="kpi-sub">{subtitle}</span>}
    </div>
  );
}
