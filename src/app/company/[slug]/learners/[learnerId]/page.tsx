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
    return <PageShell><div className="card"><p>⚠️ Database not connected.</p></div></PageShell>;
  }

  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) notFound();

  // Scope learner fetch to this company to prevent cross-company data access
  const { data: learner } = await db
    .from('learners')
    .select('*')
    .eq('id', learnerId)
    .eq('company_id', company.id)
    .single();
  if (!learner) notFound();

  // Get enrollments with course names
  const { data: enrollments } = await db
    .from('enrollments')
    .select('*, courses(name)')
    .eq('learner_id', learnerId)
    .eq('is_active', true);

  // Get latest status
  const { data: statusSnap } = await db
    .from('learner_status_snapshots')
    .select('status, completion_percent, benchmark_percent')
    .eq('learner_id', learnerId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  const currentStatus = (statusSnap?.status || 'not_started') as LearnerStatus;

  // Get quiz attempts
  const { data: quizzes } = await db
    .from('quizzes')
    .select('*, courses(name)')
    .eq('learner_id', learnerId)
    .order('attempted_at', { ascending: false });

  // Get assignments
  const { data: assignments } = await db
    .from('assignments')
    .select('*, courses(name)')
    .eq('learner_id', learnerId)
    .order('submitted_at', { ascending: false });

  return (
    <PageShell>
      <Link href={`/company/${slug}/learners`} style={{ fontSize: '0.8125rem', color: '#6b7280', textDecoration: 'none' }}>
        ← Back to Learners
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{learner.full_name || 'Unknown'}</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {learner.email || '—'} · {company?.name || slug}
          </p>
        </div>
        <LearnerStatusBadge status={currentStatus} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Department</span>
          <p style={{ fontWeight: 600 }}>{learner.department || '—'}</p>
        </div>
        <div className="card">
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Title</span>
          <p style={{ fontWeight: 600 }}>{learner.title || '—'}</p>
        </div>
        <div className="card">
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Last Active</span>
          <p style={{ fontWeight: 600 }}>
            {learner.last_active_at ? new Date(learner.last_active_at).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>

      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Enrolled Courses</h2>
      <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: '1.5rem' }}>
        {!enrollments || enrollments.length === 0 ? (
          <div className="empty-state"><p>No enrollments found.</p></div>
        ) : (
          <table>
            <thead><tr><th>Course</th><th>Progress</th><th>Started</th><th>Completed</th></tr></thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{(e as Record<string, unknown>).courses ? ((e as Record<string, unknown>).courses as Record<string, string>).name : '—'}</td>
                  <td>{Number(e.progress_percent || 0).toFixed(0)}%</td>
                  <td style={{ color: '#6b7280', fontSize: '0.8125rem' }}>{e.started_at ? new Date(e.started_at).toLocaleDateString() : '—'}</td>
                  <td style={{ color: '#6b7280', fontSize: '0.8125rem' }}>{e.completed_at ? new Date(e.completed_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Quiz Attempts</h2>
      <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: '1.5rem' }}>
        {!quizzes || quizzes.length === 0 ? (
          <div className="empty-state"><p>No quiz data available.</p></div>
        ) : (
          <table>
            <thead><tr><th>Course</th><th>Score</th><th>Passed</th><th>Date</th></tr></thead>
            <tbody>
              {quizzes.map((q) => (
                <tr key={q.id}>
                  <td>{(q as Record<string, unknown>).courses ? ((q as Record<string, unknown>).courses as Record<string, string>).name : '—'}</td>
                  <td>{q.score !== null ? `${q.score}%` : '—'}</td>
                  <td>{q.passed === true ? '✅' : q.passed === false ? '❌' : '—'}</td>
                  <td style={{ color: '#6b7280', fontSize: '0.8125rem' }}>{q.attempted_at ? new Date(q.attempted_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Assignments</h2>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {!assignments || assignments.length === 0 ? (
          <div className="empty-state"><p>No assignment data available.</p></div>
        ) : (
          <table>
            <thead><tr><th>Course</th><th>Status</th><th>Score</th><th>Submitted</th></tr></thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>{(a as Record<string, unknown>).courses ? ((a as Record<string, unknown>).courses as Record<string, string>).name : '—'}</td>
                  <td>{a.status || (a.submitted ? 'Submitted' : 'Pending')}</td>
                  <td>{a.score !== null ? a.score : '—'}</td>
                  <td style={{ color: '#6b7280', fontSize: '0.8125rem' }}>{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}
