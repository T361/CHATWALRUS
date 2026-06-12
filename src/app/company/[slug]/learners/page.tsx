'use client';

import PageShell from '@/components/layout/PageShell';
import LearnerStatusBadge from '@/components/learners/LearnerStatusBadge';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  const slug = params.slug as string;
  const [learners, setLearners] = useState<LearnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyName, setCompanyName] = useState('');

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
    const matchesSearch =
      !search ||
      (l.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.email || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <PageShell>
      <div style={{ marginBottom: '1rem' }}>
        <Link href={`/company/${slug}`} style={{ fontSize: '0.8125rem', color: '#6b7280', textDecoration: 'none' }}>
          ← Back to {companyName || 'Dashboard'}
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Learners</h1>
        <a
          href={`/api/companies/${slug}/export/csv`}
          className="btn btn-secondary"
          style={{ textDecoration: 'none' }}
        >
          📥 Export CSV
        </a>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px' }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="at_risk">At Risk</option>
          <option value="slightly_behind">Slightly Behind</option>
          <option value="on_track">On Track</option>
          <option value="high_engagement">High Engagement</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
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
                <th>Email</th>
                <th>Department</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Courses</th>
                <th>Last Active</th>
                <th>Live Sessions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link
                      href={`/company/${slug}/learners/${l.id}`}
                      style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {l.full_name || 'Unknown'}
                    </Link>
                  </td>
                  <td style={{ color: '#6b7280' }}>{l.email || '—'}</td>
                  <td style={{ color: '#6b7280' }}>{l.department || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '60px', height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, l.progress_percent)}%`, height: '100%', background: '#2563eb', borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontSize: '0.75rem' }}>{l.progress_percent.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td><LearnerStatusBadge status={l.status} /></td>
                  <td>{l.courses_enrolled}</td>
                  <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {l.last_active_at ? new Date(l.last_active_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>{l.live_sessions_last_30_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}
