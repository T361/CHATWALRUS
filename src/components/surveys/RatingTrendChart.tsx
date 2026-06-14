'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface TrendPoint { date: string; average_rating: number; count: number }

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: TrendPoint }>;
  label?: string;
}

function DarkTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.8125rem',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontWeight: 600, color: 'var(--warning)' }}>{Number(payload[0].value).toFixed(1)} avg</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{d.count} responses</p>
    </div>
  );
}

export default function RatingTrendChart({ data, scale = 5 }: { data: TrendPoint[]; scale?: number }) {
  if (data.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Rating Trend</h3>
        <div className="empty-state" style={{ padding: '1rem' }}><p>No trend data.</p></div>
      </div>
    );
  }

  const goodThresh = scale === 10 ? 8 : 4;

  return (
    <div className="card">
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
        Rating Trend Over Time
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, scale]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<DarkTooltip />} />
          <ReferenceLine y={goodThresh} stroke="var(--on-track)" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Line
            type="monotone" dataKey="average_rating"
            stroke="var(--warning)" strokeWidth={2}
            dot={{ fill: 'var(--warning)', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'var(--warning)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
