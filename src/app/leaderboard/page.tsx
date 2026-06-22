'use client';

import PageShell from '@/components/layout/PageShell';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import React from 'react';

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

const POINT_LEGEND = [
  { icon: '🎯', label: 'Zoom Session',    pts: 50  },
  { icon: '📚', label: 'Lesson Complete', pts: 10  },
  { icon: '✅', label: 'Quiz Pass',       pts: 25  },
  { icon: '🏆', label: 'Course Complete', pts: 100 },
  { icon: '📝', label: 'Assignment',      pts: 20  },
  { icon: '📊', label: 'Survey',          pts: 15  },
  { icon: '🔥', label: '7-Day Streak',    pts: 50  },
  { icon: '⚡', label: '30-Day Streak',   pts: 200 },
  { icon: '⏰', label: 'On Pace',         pts: 30  },
];

function RankLimitInput({ limit }: { limit: number }) {
  const [val, setVal] = React.useState(String(limit));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <input
        type="number"
        value={val}
        min={10}
        max={500}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            const p = new URLSearchParams(window.location.search);
            p.set('limit', val);
            window.location.assign('/leaderboard?' + p.toString());
          }
        }}
        style={{ width: 70, textAlign: 'center', fontWeight: 700 }}
      />
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ranked</span>
    </div>
  );
}

function getLimitFromSearch(): number {
  if (typeof window === 'undefined') return 100;
  const p = new URLSearchParams(window.location.search);
  const v = parseInt(p.get('limit') ?? '100', 10);
  if (isNaN(v) || v < 10) return 10;
  if (v > 500) return 500;
  return v;
}

export default function GlobalLeaderboardPage() {
  const [rows,    setRows]    = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [search,  setSearch]  = useState('');
  const [showLegend, setShowLegend] = useState(false);
  const [limit, setLimit] = useState(100);
  const didInit = useRef(false);

  const load = useCallback(async (lim: number) => {
    setLoading(true);
    const res = await fetch(`/api/leaderboard/global?limit=${lim}`);
    const d   = await res.json();
    const lb  = d.leaderboard ?? [];

    if (lb.length === 0 && !d.error) {
      setSeeding(true);
      await fetch('/api/admin/sync/gamification', { method: 'POST' });
      setSeeding(false);
      const res2 = await fetch(`/api/leaderboard/global?limit=${lim}`);
      const d2   = await res2.json();
      setRows(d2.leaderboard ?? []);
    } else {
      setRows(lb);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const lim = getLimitFromSearch();
    setLimit(lim);
    load(lim);
  }, [load]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || (r.company_name ?? '').toLowerCase().includes(q);
  });

  const top3 = rows.slice(0, 3);

  return (
    <PageShell>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Global Leaderboard</h1>
          <p className="page-subtitle">Top learners across all companies ranked by engagement points</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          {/* Row 1: Refresh + ranked input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            {!loading && (
              <button className="btn btn-secondary btn-sm" onClick={() => load(limit)}>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M4 10a6 6 0 1 0 1.27-3.77" strokeLinecap="round"/>
                  <path d="M4 6v4h4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Refresh
              </button>
            )}
            <RankLimitInput limit={limit} />
          </div>
          {/* Row 2: Points Legend button */}
          <button
            onClick={() => setShowLegend(v => !v)}
            className="btn btn-secondary btn-sm"
            title="Points legend"
            style={{ alignSelf: 'flex-end' }}
          >
            📊 Points Legend
          </button>
        </div>
      </div>

      {/* Points legend panel */}
      {showLegend && (
        <div className="card" style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' }}>How Points are Earned</h3>
            <button onClick={() => setShowLegend(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {POINT_LEGEND.map(({ icon, label, pts }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                background: 'var(--surface-raised)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', fontSize: '0.75rem',
              }}>
                <span>{icon}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontWeight: 700, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>+{pts}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Points are idempotent — each unique activity is counted once. Streaks and on-pace bonuses are calculated daily.
          </p>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 380, width: '100%', marginBottom: '1.25rem' }}>
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
            {seeding ? 'Calculating points from all activity — first run takes ~10 seconds…' : 'Loading leaderboard…'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <h3>{rows.length === 0 ? 'No data yet' : 'No results'}</h3>
          <p>{rows.length === 0 ? 'Could not calculate points. Ensure activity has been synced first.' : `No matches for "${search}"`}</p>
        </div>
      ) : (
        <>
          {/* Top 3 podium (only when not searching) */}
          {!search && top3.length >= 3 && (
            <div className="podium-row" style={{ marginBottom: '1.75rem', alignItems: 'flex-end' }}>
              {[top3[1], top3[0], top3[2]].map((r, podiumI) => {
                const rank = podiumI === 0 ? 2 : podiumI === 1 ? 1 : 3;
                const barH = rank === 1 ? 130 : rank === 2 ? 100 : 80;
                const accent = rank === 1 ? 'var(--primary)' : rank === 2 ? 'rgba(148,163,184,0.4)' : 'rgba(180,120,70,0.35)';
                return (
                  <div key={r.learner_id} className="podium-card">
                    <div style={{ fontSize: rank === 1 ? '2.25rem' : '1.75rem', marginBottom: '0.25rem' }}>{MEDAL[rank - 1]}</div>
                    {r.company_slug ? (
                      <Link href={`/company/${r.company_slug}/learners/${r.learner_id}`} style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none', display: 'block', marginBottom: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 0.25rem' }}>
                        {r.full_name.split(' ')[0]}
                      </Link>
                    ) : (
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', marginBottom: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 0.25rem' }}>
                        {r.full_name.split(' ')[0]}
                      </div>
                    )}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 0.25rem' }}>
                      {r.company_name ?? ''}
                    </div>
                    <div style={{
                      height: barH,
                      background: accent,
                      border: '1px solid var(--border)',
                      borderRadius: '0.5rem 0.5rem 0 0',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.125rem',
                    }}>
                      <span style={{ fontWeight: 800, fontSize: rank === 1 ? '1.25rem' : '1rem', color: rank === 1 ? '#fff' : 'var(--text)' }}>
                        {r.total_points.toLocaleString()}
                      </span>
                      <span style={{ fontSize: '0.6875rem', color: rank === 1 ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>pts</span>
                      {r.sessions_attended > 0 && (
                        <span style={{ fontSize: '0.625rem', color: rank === 1 ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', marginTop: '0.25rem' }}>
                          🎯 {r.sessions_attended} sessions
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {/* Mini legend strip above table */}
            {!showLegend && (
              <div style={{
                padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)',
                background: 'var(--surface-raised)',
                display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                minWidth: 0,
              }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Points key:</span>
                {POINT_LEGEND.map(({ icon, pts }) => (
                  <span key={icon} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {icon} <span style={{ fontWeight: 600, color: 'var(--primary)' }}>+{pts}</span>
                  </span>
                ))}
                <button onClick={() => setShowLegend(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Details →
                </button>
              </div>
            )}
            <table>
              <thead>
                <tr>
                  {['Rank', 'Learner', 'Company', 'Points', 'Sessions', 'Streak'].map((h) => (
                    <th key={h} style={{ fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.learner_id} style={{ background: r.rank <= 3 ? 'var(--surface-raised)' : 'transparent' }}>
                    <td style={{ width: 64, fontWeight: 700, color: r.rank <= 3 ? 'var(--primary)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.rank <= 3 ? MEDAL[r.rank - 1] : `#${r.rank}`}
                    </td>
                    <td>
                      {r.company_slug ? (
                        <Link href={`/company/${r.company_slug}/learners/${r.learner_id}`} style={{ fontWeight: 500, color: 'var(--primary)', textDecoration: 'none' }}>
                          {r.full_name}
                        </Link>
                      ) : (
                        <div style={{ fontWeight: 500 }}>{r.full_name}</div>
                      )}
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
        </>
      )}
    </PageShell>
  );
}
