'use client';

import PageShell from '@/components/layout/PageShell';
import { useEffect, useState, useCallback } from 'react';
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
  const [rows,    setRows]    = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [search,  setSearch]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/leaderboard/global');
    const d   = await res.json();
    const lb  = d.leaderboard ?? [];

    if (lb.length === 0 && !d.error) {
      // Auto-seed on first visit — no manual step required
      setSeeding(true);
      await fetch('/api/admin/sync/gamification', { method: 'POST' });
      setSeeding(false);
      const res2 = await fetch('/api/leaderboard/global');
      const d2   = await res2.json();
      setRows(d2.leaderboard ?? []);
    } else {
      setRows(lb);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || (r.company_name ?? '').toLowerCase().includes(q);
  });

  return (
    <PageShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Global Leaderboard</h1>
          <p className="page-subtitle">Top learners across all companies ranked by engagement points</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {!loading && (
            <button className="btn btn-secondary btn-sm" onClick={load}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M4 10a6 6 0 1 0 1.27-3.77" strokeLinecap="round"/>
                <path d="M4 6v4h4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Refresh
            </button>
          )}
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rows.length} ranked</span>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 380, marginBottom: '1.25rem' }}>
        <svg style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" placeholder="Search learners or companies…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', paddingLeft: '2.25rem' }} />
      </div>

      {loading || seeding ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem', width: '1.5rem', height: '1.5rem' }} />
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {seeding ? 'Calculating points from all activity — this takes ~10 seconds on first run…' : 'Loading leaderboard…'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <h3>{rows.length === 0 ? 'No data yet' : 'No results'}</h3>
          <p>{rows.length === 0 ? 'Could not calculate points. Check that activity data has been synced.' : `No matches for "${search}"`}</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                {['Rank', 'Learner', 'Company', 'Points', 'Sessions', 'Streak'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.learner_id}>
                  <td style={{ width: 64, fontWeight: 700, color: r.rank <= 3 ? 'var(--primary)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.rank <= 3 ? MEDAL[r.rank - 1] : `#${r.rank}`}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.full_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.email}</div>
                  </td>
                  <td>
                    {r.company_slug ? (
                      <Link href={`/company/${r.company_slug}`} style={{ color: 'var(--primary)', fontSize: '0.8125rem' }}>
                        {r.company_name}
                      </Link>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.total_points.toLocaleString()}</td>
                  <td style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{r.sessions_attended}</td>
                  <td style={{ color: r.current_streak_days >= 7 ? 'var(--success)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
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
