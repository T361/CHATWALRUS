'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface RatingBucket { rating: number; count: number }

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function DarkTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.8125rem',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Rating {label}</p>
      <p style={{ fontWeight: 600, color: 'var(--warning)' }}>{payload[0].value} responses</p>
    </div>
  );
}

export default function RatingDistributionChart({ data, scale = 5 }: { data: RatingBucket[]; scale?: number }) {
  if (data.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Rating Distribution</h3>
        <div className="empty-state" style={{ padding: '1rem' }}><p>No ratings data.</p></div>
      </div>
    );
  }

  const chartData = Array.from({ length: scale }, (_, i) => i + 1).map((r) => ({
    rating: `${r}`,
    count: data.find((d) => d.rating === r)?.count ?? 0,
  }));

  return (
    <div className="card">
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
        Rating Distribution
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="rating" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'var(--surface)' }} />
          <Bar dataKey="count" fill="var(--warning)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
