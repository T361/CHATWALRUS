'use client';

import CompanyShell from '@/components/layout/CompanyShell';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const POINT_LEGEND = [
  { icon: '🎯', label: 'Zoom Session',    pts: 50  },
  { icon: '📚', label: 'Lesson',          pts: 10  },
  { icon: '✅', label: 'Quiz',            pts: 25  },
  { icon: '🏆', label: 'Course',          pts: 100 },
  { icon: '📝', label: 'Assignment',      pts: 20  },
  { icon: '🔥', label: '7d Streak',       pts: 50  },
  { icon: '⚡', label: '30d Streak',      pts: 200 },
  { icon: '⏰', label: 'On Pace',         pts: 30  },
];

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

  const [seeding, setSeeding] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/companies/${slug}/leaderboard`);
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const d   = await res.json();
        setCompanyName(d.company_name ?? slug);
        const lb = d.leaderboard ?? [];
        if (lb.length === 0 && !d.error) {
          setSeeding(true);
          await fetch('/api/admin/sync/gamification', { method: 'POST' });
          setSeeding(false);
          const res2 = await fetch(`/api/companies/${slug}/leaderboard`);
          const d2   = await res2.json();
          setRows(d2.leaderboard ?? []);
        } else {
          setRows(lb);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || (r.department ?? '').toLowerCase().includes(q);
  });

  return (
    <CompanyShell slug={slug} companyName={companyName}>
      <div className="page-header" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1 className="page-title">{companyName} — Leaderboard</h1>
          <p className="page-subtitle">Top learners by total engagement points</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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

      {loading || seeding ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem', width: '1.5rem', height: '1.5rem' }} />
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {seeding ? 'Calculating points — first run takes ~10 seconds…' : 'Loading…'}
          </p>
        </div>
      ) : loadError ? (
        <div className="card" style={{ padding: '1rem', color: 'var(--danger)', fontSize: '0.875rem' }}>{loadError}</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
          {rows.length === 0 ? 'No points data yet. Activity (lessons, sessions, quizzes) must be synced first.' : 'No results.'}
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          {rows.length >= 3 && (
            <div className="podium-row">
              {[rows[1], rows[0], rows[2]].map((r, i) => {
                const podiumRank = i === 0 ? 2 : i === 1 ? 1 : 3;
                const height = podiumRank === 1 ? 120 : podiumRank === 2 ? 90 : 75;
                return (
                  <div key={r.learner_id} className="podium-card">
                    <div style={{ fontSize: podiumRank === 1 ? '2rem' : '1.5rem', marginBottom: '0.25rem' }}>
                      {MEDAL[podiumRank - 1]}
                    </div>
                    <Link href={`/company/${slug}/learners/${r.learner_id}`} style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--primary)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.125rem' }}>
                      {r.full_name.split(' ')[0]}
                    </Link>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      {r.department ?? ''}
                    </div>
                    <div style={{
                      height, background: podiumRank === 1 ? 'var(--primary)' : 'var(--surface-raised)',
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
            {/* Points key strip */}
            <div style={{
              padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)',
              background: 'var(--surface-raised)',
              display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Points:</span>
              {POINT_LEGEND.map(({ icon, label, pts }) => (
                <span key={label} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {icon} {label} <span style={{ fontWeight: 700, color: 'var(--primary)' }}>+{pts}</span>
                </span>
              ))}
            </div>
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
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: r.rank <= 3 ? 'var(--primary)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.rank <= 3 ? MEDAL[r.rank - 1] : `#${r.rank}`}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link href={`/company/${slug}/learners/${r.learner_id}`} style={{ fontWeight: 500, color: 'var(--primary)', textDecoration: 'none' }}>
                        {r.full_name}
                      </Link>
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
    </CompanyShell>
  );
}
