'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  not_started: '#9ca3af',
  at_risk: '#ef4444',
  slightly_behind: '#f59e0b',
  on_track: '#22c55e',
  high_engagement: '#3b82f6',
};

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  at_risk: 'At Risk',
  slightly_behind: 'Slightly Behind',
  on_track: 'On Track',
  high_engagement: 'High Engagement',
};

interface StatusItem {
  status: string;
  count: number;
}

export default function LearnerStatusChart({ data }: { data: StatusItem[] }) {
  const chartData = data
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: STATUS_LABELS[d.status] || d.status,
      value: d.count,
      color: STATUS_COLORS[d.status] || '#6b7280',
    }));

  if (chartData.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Learner Status Distribution</h3>
        <div className="empty-state" style={{ padding: '1rem' }}>
          <p>No status data available. Run milestone checks first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>Learner Status Distribution</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
