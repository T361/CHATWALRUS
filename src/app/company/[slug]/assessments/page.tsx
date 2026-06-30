'use client';

import CompanyShell from '@/components/layout/CompanyShell';
import { useEffect, useState, use } from 'react';

interface AssignmentRow {
  id: string;
  submitted: boolean | null;
  score: number | null;
  submitted_at: string | null;
  courses?: { name: string } | null;
  learners?: { full_name: string } | null;
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card card-sm kpi-card">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value tabular" style={color ? { color } : {}}>{value}</span>
    </div>
  );
}

type Tab = 'overview' | 'assignments';

export default function AssessmentsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = use(props.params);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [tab,         setTab]         = useState<Tab>('overview');
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        const [assessRes, compRes] = await Promise.all([
          fetch(`/api/companies/${slug}/assessments`),
          fetch(`/api/companies/${slug}`),
        ]);
        if (assessRes.ok) {
          const d = await assessRes.json();
          setAssignments(d.assignments || []);
        } else {
          setError('Could not load assessments.');
        }
        if (compRes.ok) {
          const c = await compRes.json();
          setCompanyName(c.company?.name || '');
        }
      } catch { setError('Could not load assessments.'); }
      setLoading(false);
    }
    load();
  }, [slug]);

  const submitted   = assignments.filter((a) => a.submitted === true).length;
  const subRate     = assignments.length > 0 ? Math.round((submitted / assignments.length) * 100) : null;
  const uniqueCourses = new Set(assignments.map((a) => a.courses?.name).filter(Boolean)).size;

  const tabStyle = (t: Tab) => ({
    padding: '0.375rem 0.875rem',
    borderRadius: 6,
    border: 'none',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer',
    background: tab === t ? 'var(--primary)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
    transition: 'all 0.15s ease',
  } as React.CSSProperties);

  return (
    <CompanyShell slug={slug} companyName={companyName}>
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <h1 className="page-title">Assessments</h1>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--surface)', padding: '0.25rem', borderRadius: 8, border: '1px solid var(--border)' }}>
          <button style={tabStyle('overview')}    onClick={() => setTab('overview')}>Overview</button>
          <button style={tabStyle('assignments')} onClick={() => setTab('assignments')}>Assignments ({assignments.length})</button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state card" style={{ minHeight: 240 }}>
          <span className="spinner" />
          <p>Loading assessments...</p>
        </div>
      ) : error ? (
        <div className="empty-state card"><h3>Error</h3><p>{error}</p></div>
      ) : (
        <>
          {tab === 'overview' && (
            <>
              <div className="kpi-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <KpiCard label="Courses Tracked"    value={uniqueCourses} />
                <KpiCard label="Assignments Tracked" value={assignments.length} />
                <KpiCard
                  label="Submission Rate"
                  value={subRate !== null ? `${subRate}%` : '—'}
                  color={subRate !== null ? (subRate >= 80 ? 'var(--on-track)' : subRate >= 60 ? 'var(--warning)' : 'var(--at-risk)') : undefined}
                />
              </div>

              <div className="card">
                <p className="section-title">Assignment Summary</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', maxWidth: 360 }}>
                  {[
                    { label: 'Total tracked',   value: assignments.length },
                    { label: 'Submitted',        value: submitted, color: 'var(--on-track)' },
                    { label: 'Pending',          value: assignments.length - submitted, color: 'var(--warning)' },
                    { label: 'Submission rate',  value: subRate !== null ? `${subRate}%` : '—' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{label}</span>
                      <span className="tabular" style={{ fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'assignments' && (
            <div className="card card-flush" style={{ overflow: 'auto' }}>
              {assignments.length === 0 ? (
                <div className="empty-state"><p>No assignment data available.</p></div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th><strong>Learner</strong></th>
                      <th><strong>Course</strong></th>
                      <th><strong>Status</strong></th>
                      <th><strong>Score</strong></th>
                      <th><strong>Submitted</strong></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{a.learners?.full_name ?? '—'}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{a.courses?.name ?? '—'}</td>
                        <td>
                          {a.submitted
                            ? <span className="badge badge-success">Submitted</span>
                            : <span className="badge badge-not-started">Pending</span>}
                        </td>
                        <td className="tabular" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                          {a.score !== null ? a.score : '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </CompanyShell>
  );
}
