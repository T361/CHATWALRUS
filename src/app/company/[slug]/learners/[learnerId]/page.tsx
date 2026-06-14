import PageShell from '@/components/layout/PageShell';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import LearnerStatusBadge from '@/components/learners/LearnerStatusBadge';
import type { LearnerStatus } from '@/types/learner';

export default async function LearnerDetailPage(
  props: { params: Promise<{ slug: string; learnerId: string }> }
) {
  const { slug, learnerId } = await props.params;
  const db = createAdminClient();

  if (!db) {
    return <PageShell><div className="card"><p style={{ color: 'var(--warning)' }}>Database not connected.</p></div></PageShell>;
  }

  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) notFound();

  const { data: learner } = await db
    .from('learners').select('*').eq('id', learnerId).eq('company_id', company.id).single();
  if (!learner) notFound();

  const [{ data: enrollments }, { data: statusSnap }, { data: quizzes }, { data: assignments }] = await Promise.all([
    db.from('enrollments').select('*, courses(name)').eq('learner_id', learnerId).eq('is_active', true),
    db.from('learner_status_snapshots').select('status, completion_percent, benchmark_percent').eq('learner_id', learnerId).order('snapshot_date', { ascending: false }).limit(1).single(),
    db.from('quizzes').select('*, courses(name)').eq('learner_id', learnerId).order('attempted_at', { ascending: false }),
    db.from('assignments').select('*, courses(name)').eq('learner_id', learnerId).order('submitted_at', { ascending: false }),
  ]);

  const currentStatus = (statusSnap?.status || 'not_started') as LearnerStatus;

  return (
    <PageShell>
      <Link href={`/company/${slug}/learners`} className="back-link">← Learners</Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{learner.full_name || 'Unknown'}</h1>
          <p className="page-subtitle">
            {learner.email || '—'} · {company.name}
          </p>
        </div>
        <LearnerStatusBadge status={currentStatus} />
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Department</span>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>{learner.department || '—'}</span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Title</span>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>{learner.title || '—'}</span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Last Active</span>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
            {learner.last_active_at ? new Date(learner.last_active_at).toLocaleDateString() : '—'}
          </span>
        </div>
      </div>

      <h2 className="section-title">Enrolled Courses</h2>
      <div className="card card-flush" style={{ overflow: 'auto', marginBottom: '1.25rem' }}>
        {!enrollments || enrollments.length === 0 ? (
          <div className="empty-state"><p>No enrollments found.</p></div>
        ) : (
          <table>
            <thead><tr><th>Course</th><th>Progress</th><th>Started</th><th>Completed</th></tr></thead>
            <tbody>
              {enrollments.map((e) => {
                const courseName = (e as Record<string, unknown>).courses
                  ? ((e as Record<string, unknown>).courses as Record<string, string>).name
                  : '—';
                return (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 500 }}>{courseName}</td>
                    <td className="tabular">{Number(e.progress_percent || 0).toFixed(0)}%</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{e.started_at ? new Date(e.started_at).toLocaleDateString() : '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{e.completed_at ? new Date(e.completed_at).toLocaleDateString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="section-title">Quiz Attempts</h2>
      <div className="card card-flush" style={{ overflow: 'auto', marginBottom: '1.25rem' }}>
        {!quizzes || quizzes.length === 0 ? (
          <div className="empty-state"><p>No quiz data available.</p></div>
        ) : (
          <table>
            <thead><tr><th>Course</th><th>Score</th><th>Passed</th><th>Date</th></tr></thead>
            <tbody>
              {quizzes.map((q) => {
                const courseName = (q as Record<string, unknown>).courses
                  ? ((q as Record<string, unknown>).courses as Record<string, string>).name
                  : '—';
                return (
                  <tr key={q.id}>
                    <td>{courseName}</td>
                    <td className="tabular">{q.score !== null ? `${q.score}%` : '—'}</td>
                    <td>
                      {q.passed === true
                        ? <span className="badge badge-success">Pass</span>
                        : q.passed === false
                          ? <span className="badge badge-danger">Fail</span>
                          : <span className="badge badge-not-started">—</span>}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{q.attempted_at ? new Date(q.attempted_at).toLocaleDateString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="section-title">Assignments</h2>
      <div className="card card-flush" style={{ overflow: 'auto' }}>
        {!assignments || assignments.length === 0 ? (
          <div className="empty-state"><p>No assignment data available.</p></div>
        ) : (
          <table>
            <thead><tr><th>Course</th><th>Status</th><th>Score</th><th>Submitted</th></tr></thead>
            <tbody>
              {assignments.map((a) => {
                const courseName = (a as Record<string, unknown>).courses
                  ? ((a as Record<string, unknown>).courses as Record<string, string>).name
                  : '—';
                return (
                  <tr key={a.id}>
                    <td>{courseName}</td>
                    <td>
                      {a.submitted
                        ? <span className="badge badge-success">Submitted</span>
                        : <span className="badge badge-not-started">Pending</span>}
                    </td>
                    <td className="tabular">{a.score !== null ? a.score : '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}</td>
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
