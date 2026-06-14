import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/company/KpiCard';
import AlertBanner from '@/components/company/AlertBanner';
import TimelineToggle from '@/components/company/TimelineToggle';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const start = new Date(dateStr);
  const today = new Date();
  return Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function CompanyDashboardPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }
) {
  const { slug } = await props.params;
  const { view } = await props.searchParams;
  const isDaysView = view === 'days';

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

  const { data: alerts } = await db
    .from('alerts')
    .select('*')
    .eq('company_id', company.id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(5);

  // Timeline display
  const programDayNumber = daysSince(company.start_date);
  const totalDays = company.learning_timeline_days ?? null;

  const programLabel = isDaysView
    ? programDayNumber !== null
      ? `Day ${programDayNumber}${totalDays ? ` of ${totalDays}` : ''}`
      : 'Program not started'
    : company.start_date
      ? `${company.start_date}${company.end_date ? ` — ${company.end_date}` : ''}`
      : null;

  return (
    <PageShell>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/" style={{ fontSize: '0.8125rem', color: '#6b7280', textDecoration: 'none' }}>
          ← Back to Companies
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{company.name}</h1>
          {programLabel && (
            <p style={{ color: '#6b7280', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
              Program: {programLabel}
            </p>
          )}
        </div>
        <TimelineToggle slug={slug} current={isDaysView ? 'days' : 'calendar'} />
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

      {latestMilestone && (
        <div className="card" style={{ marginBottom: '1rem', background: '#f9fafb' }}>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Latest Milestone Check — Day {latestMilestone.milestone_day}
          </p>
          <p style={{ fontSize: '0.875rem', color: '#111827' }}>
            Average completion <strong>{Number(latestMilestone.average_completion_percent).toFixed(1)}%</strong> vs benchmark <strong>{Number(latestMilestone.benchmark_percent).toFixed(1)}%</strong>
            {latestMilestone.alert_triggered && (
              <span style={{ color: '#dc2626', marginLeft: '0.5rem' }}>⚠️ Alert triggered</span>
            )}
          </p>
        </div>
      )}

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
