'use client';

import PageShell from '@/components/layout/PageShell';
import LearnerStatusBadge from '@/components/learners/LearnerStatusBadge';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LearnerStatus } from '@/types/learner';

interface LearnerRow {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  title: string | null;
  progress_percent: number;
  status: LearnerStatus;
  courses_enrolled: number;
  last_active_at: string | null;
  live_sessions_last_30_days: number;
}

export default function LearnersPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const [learners,     setLearners]    = useState<LearnerRow[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [search,       setSearch]      = useState('');
  const [statusFilter, setStatusFilter]= useState<string>(searchParams.get('status') || 'all');
  const [companyName,  setCompanyName] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/companies/${slug}/learners`);
        if (res.ok) {
          const data = await res.json();
          setLearners(data.learners || []);
          setCompanyName(data.company_name || slug);
        }
      } catch { /* empty */ }
      setLoading(false);
    }
    load();
  }, [slug]);

  const filtered = learners.filter((l) => {
    const matchesSearch = !search
      || (l.full_name || '').toLowerCase().includes(search.toLowerCase())
      || (l.email || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <PageShell>
      <Link href={`/company/${slug}`} className="back-link">
        ← {companyName || 'Dashboard'}
      </Link>

      <div className="page-header">
        <h1 className="page-title">Learners</h1>
        <a href={`/api/companies/${slug}/export/csv`} className="btn btn-secondary btn-sm">
          ↓ Export CSV {learners.length > 0 && `(${learners.length})`}
        </a>
      </div>

      <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px' }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: '160px' }}>
          <option value="all">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="at_risk">At Risk</option>
          <option value="slightly_behind">Slightly Behind</option>
          <option value="on_track">On Track</option>
          <option value="high_engagement">High Engagement</option>
        </select>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {filtered.length} learner{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="card card-flush" style={{ overflow: 'auto' }}>
        {loading ? (
          <div className="empty-state"><span className="spinner" /><p>Loading learners...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No Learners Found</h3>
            <p>Adjust filters or sync data from Thinkific.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Courses</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'center' }}>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const progress = Math.min(100, l.progress_percent);
                const progressColor = progress >= 70 ? 'var(--on-track)' : progress >= 40 ? 'var(--primary)' : 'var(--at-risk)';
                return (
                  <tr key={l.id}>
                    <td>
                      <div>
                        <Link
                          href={`/company/${slug}/learners/${l.id}`}
                          style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.875rem' }}
                        >
                          {l.full_name || 'Unknown'}
                        </Link>
                        <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '1px' }}>{l.email || '—'}</p>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{l.title || l.department || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 56, height: 4, background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ width: `${progress}%`, height: '100%', background: progressColor, borderRadius: '9999px' }} />
                        </div>
                        <span className="tabular" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{l.progress_percent.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td><LearnerStatusBadge status={l.status} /></td>
                    <td className="tabular" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{l.courses_enrolled}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {l.last_active_at ? new Date(l.last_active_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="tabular" style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {l.live_sessions_last_30_days}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}
