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
    return <PageShell><div className="card"><p style={{ color: 'var(--warning)' }}>Database not connected.</p></div></PageShell>;
  }

  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) notFound();

  const [
    { count: totalLearners },
    { data: enrollments },
    { data: quizzes },
    { data: assignments },
  ] = await Promise.all([
    db.from('learners').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
    db.from('enrollments').select('progress_percent, completed_at, course_id').eq('company_id', company.id).eq('is_active', true),
    db.from('quizzes').select('score, passed').eq('company_id', company.id),
    db.from('assignments').select('submitted').eq('company_id', company.id),
  ]);

  const uniqueCourses   = new Set(enrollments?.map((e) => e.course_id) || []);
  const avgCompletion   = enrollments?.length
    ? enrollments.reduce((s, e) => s + Number(e.progress_percent || 0), 0) / enrollments.length : 0;
  const completedCourses = enrollments?.filter((e) => e.completed_at).length ?? 0;
  const quizScores      = (quizzes || []).filter((q) => q.score !== null).map((q) => Number(q.score));
  const medianQuiz      = median(quizScores);
  const passed          = (quizzes || []).filter((q) => q.passed === true).length;
  const submissionRate  = assignments?.length
    ? Math.round((assignments.filter((a) => a.submitted).length / assignments.length) * 100) : null;

  return (
    <PageShell>
      <Link href={`/company/${slug}`} className="back-link">← {company.name}</Link>

      <div className="page-header">
        <h1 className="page-title">Assessments</h1>
      </div>

      <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
        <KpiCard title="Total Learners"          value={totalLearners ?? 0} />
        <KpiCard title="Courses Tracked"         value={uniqueCourses.size} />
        <KpiCard title="Avg Completion"          value={`${avgCompletion.toFixed(1)}%`} />
        <KpiCard title="Completed Courses"       value={completedCourses} />
        <KpiCard title="Median Quiz Score"       value={medianQuiz !== null ? `${medianQuiz.toFixed(0)}%` : '—'} />
        <KpiCard title="Assignment Submission"   value={submissionRate !== null ? `${submissionRate}%` : '—'} />
      </div>

      <div className="grid-2">
        <div className="card">
          <p className="section-title">Quiz Summary</p>
          {!quizzes || quizzes.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem 0' }}><p>No quiz data available.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Total attempts</span>
                <span className="tabular" style={{ fontWeight: 600 }}>{quizzes.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Passed</span>
                <span className="tabular" style={{ fontWeight: 600, color: 'var(--on-track)' }}>{passed}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Pass rate</span>
                <span className="tabular" style={{ fontWeight: 600 }}>
                  {quizzes.length > 0 ? `${Math.round((passed / quizzes.length) * 100)}%` : '—'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <p className="section-title">Assignment Summary</p>
          {!assignments || assignments.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem 0' }}><p>No assignment data available.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Total tracked</span>
                <span className="tabular" style={{ fontWeight: 600 }}>{assignments.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Submitted</span>
                <span className="tabular" style={{ fontWeight: 600, color: 'var(--on-track)' }}>
                  {assignments.filter((a) => a.submitted).length}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Submission rate</span>
                <span className="tabular" style={{ fontWeight: 600 }}>
                  {submissionRate !== null ? `${submissionRate}%` : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
