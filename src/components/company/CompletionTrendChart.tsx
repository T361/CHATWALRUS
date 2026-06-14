'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface TrendPoint {
  date: string;
  average_completion: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = label ? new Date(label) : null;
  const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : label;
  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--border-accent)',
      borderRadius: 'var(--radius)',
      padding: '0.5rem 0.875rem',
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {dateStr}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
        <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
          {Number(payload[0].value).toFixed(1)}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>% avg completion</span>
      </div>
    </div>
  );
}

export default function CompletionTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="card">
        <p className="section-title">Completion Trend</p>
        <div className="empty-state"><p>No trend data. Create daily snapshots first.</p></div>
      </div>
    );
  }

  const latest = data[data.length - 1]?.average_completion ?? 0;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.875rem' }}>
        <p className="section-title" style={{ marginBottom: 0 }}>Completion Trend</p>
        <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
          {latest.toFixed(1)}<span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>%</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickFormatter={(v: string) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-accent)', strokeWidth: 1 }} />
          <ReferenceLine y={70} stroke="var(--on-track)" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.5} />
          <Line
            type="monotone"
            dataKey="average_completion"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--surface-raised)', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
