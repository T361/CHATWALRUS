'use client';

import PageShell from '@/components/layout/PageShell';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface LeaderboardRow {
  rank: number;
  learner_id: string;
  full_name: string;
  email: string;
  company_name: string | null;
  company_slug: string | null;
  total_points: number;
  sessions_attended: number;
  current_streak_days: number;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function GlobalLeaderboardPage() {
  const [rows, setRows]     = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/leaderboard/global')
      .then((r) => r.json())
      .then((d) => setRows(d.leaderboard ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || (r.company_name ?? '').toLowerCase().includes(q);
  });

  return (
    <PageShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Global Leaderboard</h1>
          <p className="page-subtitle">Top learners across all companies by total engagement points</p>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: '0.375rem' }}>
          {rows.length} ranked
        </span>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <input
          type="text"
          placeholder="Search learners or companies…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', maxWidth: 360, padding: '0.5rem 0.75rem',
            background: 'var(--surface-raised)', border: '1px solid var(--border)',
            borderRadius: '0.5rem', fontSize: '0.875rem', color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '2rem 0' }}>Loading leaderboard…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
          {rows.length === 0 ? 'No points data yet — run "Recalculate Points" from Admin Settings.' : 'No results.'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
                {['Rank', 'Learner', 'Company', 'Points', 'Sessions', 'Streak'].map((h) => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.learner_id} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: r.rank <= 3 ? 'var(--accent)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.rank <= 3 ? MEDAL[r.rank - 1] : `#${r.rank}`}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.full_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.email}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {r.company_slug ? (
                      <Link href={`/company/${r.company_slug}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8125rem' }}>
                        {r.company_name}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.total_points.toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.sessions_attended}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: r.current_streak_days >= 7 ? 'var(--success)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.current_streak_days > 0 ? `${r.current_streak_days}d 🔥` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
