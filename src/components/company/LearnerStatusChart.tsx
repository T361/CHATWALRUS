'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  not_started:     '#475569',
  at_risk:         '#f87171',
  slightly_behind: '#fbbf24',
  on_track:        '#34d399',
  high_engagement: '#60a5fa',
};

const STATUS_LABELS: Record<string, string> = {
  not_started:     'Not Started',
  at_risk:         'At Risk',
  slightly_behind: 'Slightly Behind',
  on_track:        'On Track',
  high_engagement: 'High Engagement',
};

interface StatusItem {
  status: string;
  count: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { color: string } }[] }) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: { color } } = payload[0];
  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--border-accent)',
      borderRadius: 'var(--radius)',
      padding: '0.5rem 0.75rem',
      boxShadow: 'var(--shadow)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{name}:</span>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export default function LearnerStatusChart({ data }: { data: StatusItem[] }) {
  const chartData = data
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: STATUS_LABELS[d.status] || d.status,
      value: d.count,
      color: STATUS_COLORS[d.status] || '#64748b',
    }));

  const total = chartData.reduce((s, d) => s + d.value, 0);

  if (chartData.length === 0) {
    return (
      <div className="card">
        <p className="section-title">Learner Status Distribution</p>
        <div className="empty-state"><p>No status data. Run milestone checks first.</p></div>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="section-title">Learner Status Distribution</p>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {chartData.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {chartData.map((d) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{d.name}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {d.value}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({((d.value / total) * 100).toFixed(0)}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
