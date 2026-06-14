import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/company/KpiCard';
import AlertBanner from '@/components/company/AlertBanner';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';

export default async function CompanyDashboardPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const db = createAdminClient();

  if (!db) {
    return (
      <PageShell>
        <div className="card" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <p style={{ color: '#92400e' }}>⚠️ Database not connected.</p>
        </div>
      </PageShell>
    );
  }

  const { data: company } = await db
    .from('companies')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!company) notFound();

  // Get metrics
  const { count: totalEnrolled } = await db
    .from('learners')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id)
    .eq('is_active', true);

  const { data: enrollments } = await db
    .from('enrollments')
    .select('progress_percent, completed_at')
    .eq('company_id', company.id)
    .eq('is_active', true);

  const avgProgress = enrollments && enrollments.length > 0
    ? enrollments.reduce((s, e) => s + Number(e.progress_percent || 0), 0) / enrollments.length
    : 0;
  const courseCompletions = enrollments?.filter((e) => e.completed_at).length ?? 0;

  // Status counts from latest milestone check
  const { data: latestMilestone } = await db
    .from('milestone_checks')
    .select('*')
    .eq('company_id', company.id)
    .order('checked_at', { ascending: false })
    .limit(1)
    .single();

  const onTrack = latestMilestone?.on_track_count ?? 0;
  const slightlyBehind = latestMilestone?.slightly_behind_count ?? 0;
  const atRisk = latestMilestone?.at_risk_count ?? 0;
  const notStarted = latestMilestone?.not_started_count ?? 0;
  const highEngagement = latestMilestone?.high_engagement_count ?? 0;
  const onPace = totalEnrolled ? Math.round(((onTrack + highEngagement) / (totalEnrolled || 1)) * 100) : 0;

  // Alerts
  const { data: alerts } = await db
    .from('alerts')
    .select('*')
    .eq('company_id', company.id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <PageShell>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/" style={{ fontSize: '0.8125rem', color: '#6b7280', textDecoration: 'none' }}>
          ← Back to Companies
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{company.name}</h1>
          {company.start_date && (
            <p style={{ color: '#6b7280', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
              Program: {company.start_date} — {company.end_date || 'Ongoing'}
            </p>
          )}
        </div>
      </div>

      <AlertBanner alerts={alerts || []} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        <KpiCard title="Total Enrolled" value={totalEnrolled ?? 0} />
        <KpiCard title="Course Completions" value={courseCompletions} />
        <KpiCard title="Avg Progress" value={`${avgProgress.toFixed(1)}%`} />
        <KpiCard title="On Pace" value={`${onPace}%`} color="#059669" />
        <KpiCard title="Slightly Behind" value={slightlyBehind} color="#d97706" />
        <KpiCard title="At Risk" value={atRisk} color="#dc2626" />
        <KpiCard title="Not Started" value={notStarted} color="#9ca3af" />
        <KpiCard title="High Engagement" value={highEngagement} color="#2563eb" />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '1rem',
      }}>
        <Link href={`/company/${slug}/learners`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>👥 Learner Breakdown</h3>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              View individual learner progress and status
            </p>
          </div>
        </Link>
        <Link href={`/company/${slug}/assessments`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>📝 Assessments</h3>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Quiz scores, assignments, and completions
            </p>
          </div>
        </Link>
        <Link href={`/company/${slug}/export`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>📊 Export Data</h3>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Download CSV and JSON reports
            </p>
          </div>
        </Link>
      </div>
    </PageShell>
  );
}
