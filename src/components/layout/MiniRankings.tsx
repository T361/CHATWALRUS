'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';

interface MiniRow {
  rank: number;
  learner_id: string;
  full_name: string;
  company_name: string | null;
  company_slug: string | null;
  total_points: number;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function MiniRankings() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState<MiniRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function toggle() {
    if (!open && !loaded) {
      setLoading(true);
      try {
        const res = await fetch('/api/leaderboard/global');
        const d   = await res.json();
        setRows((d.leaderboard ?? []).slice(0, 10));
        setLoaded(true);
      } finally {
        setLoading(false);
      }
    }
    setOpen(v => !v);
  }

  return (
    <div ref={ref} style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200 }}>
      {/* Floating panel */}
      {open && (
        <div className="card" style={{
          position: 'absolute', bottom: '3rem', right: 0,
          width: 280, padding: 0, overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
          border: '1px solid var(--border)',
        }}>
          {/* Header */}
          <div style={{
            padding: '0.625rem 0.875rem',
            background: 'var(--surface-raised)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' }}>
              🏆 Live Rankings
            </span>
            <Link href="/leaderboard" style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none' }}
              onClick={() => setOpen(false)}>
              Full →
            </Link>
          </div>

          {/* Point legend strip */}
          <div style={{
            padding: '0.375rem 0.875rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
            display: 'flex', flexWrap: 'wrap', gap: '0.375rem',
          }}>
            {[
              { icon: '🎯', pts: 50 }, { icon: '📚', pts: 10 }, { icon: '✅', pts: 25 },
              { icon: '🏆', pts: 100 }, { icon: '🔥', pts: 50 }, { icon: '⚡', pts: 200 },
            ].map(({ icon, pts }) => (
              <span key={icon} style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                {icon}<span style={{ fontWeight: 600, color: 'var(--primary)' }}>+{pts}</span>
              </span>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div className="spinner" style={{ width: '1.125rem', height: '1.125rem', margin: '0 auto' }} />
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              No rankings yet
            </div>
          ) : (
            <div>
              {rows.map((r) => (
                <div key={r.learner_id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 0.875rem',
                  borderBottom: '1px solid var(--border-muted)',
                  background: r.rank <= 3 ? 'var(--surface-raised)' : 'transparent',
                }}>
                  <span style={{ width: 24, textAlign: 'center', fontSize: r.rank <= 3 ? '1rem' : '0.75rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {r.rank <= 3 ? MEDAL[r.rank - 1] : `#${r.rank}`}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.full_name}
                    </div>
                    {r.company_slug ? (
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.company_name}
                      </div>
                    ) : null}
                  </div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {r.total_points.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={toggle}
        title="Live Rankings"
        style={{
          width: 44, height: 44,
          borderRadius: '50%',
          background: open ? 'var(--primary)' : 'var(--bg-raised)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1.25rem',
          transition: 'all 150ms',
          color: open ? '#fff' : 'var(--text)',
        }}
      >
        🏆
      </button>
    </div>
  );
}
