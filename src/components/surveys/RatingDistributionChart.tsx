'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface RatingBucket {
  rating: number;
  count: number;
}

export default function RatingDistributionChart({ data }: { data: RatingBucket[] }) {
  if (data.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Rating Distribution</h3>
        <div className="empty-state" style={{ padding: '1rem' }}><p>No ratings data.</p></div>
      </div>
    );
  }

  const chartData = [1, 2, 3, 4, 5].map((r) => ({
    rating: `${r}★`,
    count: data.find((d) => d.rating === r)?.count ?? 0,
  }));

  return (
    <div className="card">
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>Rating Distribution</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
