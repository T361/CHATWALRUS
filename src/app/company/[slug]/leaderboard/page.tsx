'use client';

import PageShell from '@/components/layout/PageShell';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface LeaderboardRow {
  rank: number;
  learner_id: string;
  full_name: string;
  email: string;
  department: string | null;
  total_points: number;
  sessions_attended: number;
  current_streak_days: number;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function CompanyLeaderboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const [rows, setRows]       = useState<LeaderboardRow[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    fetch(`/api/companies/${slug}/leaderboard`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.leaderboard ?? []);
        setCompanyName(d.company_name ?? slug);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || (r.department ?? '').toLowerCase().includes(q);
  });

  return (
    <PageShell>
      <Link href={`/company/${slug}`} className="back-link">← {companyName || 'Dashboard'}</Link>

      <div className="page-header" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1 className="page-title">{companyName} — Leaderboard</h1>
          <p className="page-subtitle">Top learners by total engagement points</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link href="/leaderboard" style={{ fontSize: '0.8125rem', color: 'var(--accent)', textDecoration: 'none' }}>
            Global Leaderboard →
          </Link>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {rows.length} ranked
          </span>
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <input
          type="text"
          placeholder="Search learners…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', maxWidth: 320, padding: '0.5rem 0.75rem',
            background: 'var(--surface-raised)', border: '1px solid var(--border)',
            borderRadius: '0.5rem', fontSize: '0.875rem', color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '2rem 0' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
          {rows.length === 0 ? 'No points data yet — run "Recalculate Points" from Admin Settings.' : 'No results.'}
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          {rows.length >= 3 && (
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
              {[rows[1], rows[0], rows[2]].map((r, i) => {
                const podiumRank = i === 0 ? 2 : i === 1 ? 1 : 3;
                const height = podiumRank === 1 ? 120 : podiumRank === 2 ? 90 : 75;
                return (
                  <div key={r.learner_id} style={{ textAlign: 'center', flex: '0 0 140px' }}>
                    <div style={{ fontSize: podiumRank === 1 ? '2rem' : '1.5rem', marginBottom: '0.25rem' }}>
                      {MEDAL[podiumRank - 1]}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text-primary)', marginBottom: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.full_name.split(' ')[0]}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      {r.department ?? ''}
                    </div>
                    <div style={{
                      height, background: podiumRank === 1 ? 'var(--accent)' : 'var(--surface-raised)',
                      border: '1px solid var(--border)', borderRadius: '0.5rem 0.5rem 0 0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', gap: '0.125rem',
                    }}>
                      <span style={{ fontWeight: 800, fontSize: podiumRank === 1 ? '1.125rem' : '0.875rem', color: podiumRank === 1 ? '#fff' : 'var(--text-primary)' }}>
                        {r.total_points.toLocaleString()}
                      </span>
                      <span style={{ fontSize: '0.6875rem', color: podiumRank === 1 ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>pts</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
                  {['Rank', 'Learner', 'Department', 'Points', 'Sessions', 'Streak'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.learner_id} style={{ borderBottom: '1px solid var(--border-muted)', background: r.rank <= 3 ? 'var(--surface-raised)' : 'transparent' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: r.rank <= 3 ? 'var(--accent)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.rank <= 3 ? MEDAL[r.rank - 1] : `#${r.rank}`}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.email}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                      {r.department ?? '—'}
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
        </>
      )}
    </PageShell>
  );
}
