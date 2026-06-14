import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/company/KpiCard';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { median } from '@/lib/utils/normalize';

export default async function AssessmentsPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const db = createAdminClient();

  if (!db) {
    return <PageShell><div className="card"><p>⚠️ Database not connected.</p></div></PageShell>;
  }

  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) notFound();

  // Metrics
  const { count: totalLearners } = await db
    .from('learners').select('*', { count: 'exact', head: true })
    .eq('company_id', company.id).eq('is_active', true);

  const { data: enrollments } = await db
    .from('enrollments').select('progress_percent, completed_at, course_id')
    .eq('company_id', company.id).eq('is_active', true);

  const uniqueCourses = new Set(enrollments?.map((e) => e.course_id) || []);
  const avgCompletion = enrollments && enrollments.length > 0
    ? enrollments.reduce((s, e) => s + Number(e.progress_percent || 0), 0) / enrollments.length : 0;
  const completedCourses = enrollments?.filter((e) => e.completed_at).length ?? 0;

  const { data: quizzes } = await db
    .from('quizzes').select('score, passed')
    .eq('company_id', company.id);

  const quizScores = (quizzes || []).filter((q) => q.score !== null).map((q) => Number(q.score));
  const medianQuiz = median(quizScores);

  const { data: assignments } = await db
    .from('assignments').select('submitted')
    .eq('company_id', company.id);

  const submissionRate = assignments && assignments.length > 0
    ? Math.round((assignments.filter((a) => a.submitted).length / assignments.length) * 100) : null;

  return (
    <PageShell>
      <Link href={`/company/${slug}`} style={{ fontSize: '0.8125rem', color: '#6b7280', textDecoration: 'none' }}>
        ← Back to {company.name}
      </Link>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '1rem 0' }}>Assessments</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <KpiCard title="Total Learners" value={totalLearners ?? 0} />
        <KpiCard title="Courses Tracked" value={uniqueCourses.size} />
        <KpiCard title="Avg Completion" value={`${avgCompletion.toFixed(1)}%`} />
        <KpiCard title="Completed Courses" value={completedCourses} />
        <KpiCard title="Median Quiz Score" value={medianQuiz !== null ? `${medianQuiz.toFixed(0)}%` : '—'} />
        <KpiCard title="Assignment Submission" value={submissionRate !== null ? `${submissionRate}%` : '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>Recent Quizzes</h3>
          {!quizzes || quizzes.length === 0 ? (
            <p className="empty-state" style={{ padding: '1rem' }}>No quiz data available.</p>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
              {quizzes.length} quiz attempt(s) recorded. {(quizzes || []).filter((q) => q.passed === true).length} passed.
            </p>
          )}
        </div>
        <div className="card">
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>Recent Assignments</h3>
          {!assignments || assignments.length === 0 ? (
            <p className="empty-state" style={{ padding: '1rem' }}>No assignment data available.</p>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
              {assignments.length} assignment(s) tracked. {assignments.filter((a) => a.submitted).length} submitted.
            </p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
