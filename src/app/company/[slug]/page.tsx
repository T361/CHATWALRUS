import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/company/KpiCard';
import AlertBanner from '@/components/company/AlertBanner';
import TimelineToggle from '@/components/company/TimelineToggle';
import LearnerStatusChart from '@/components/company/LearnerStatusChart';
import CompletionTrendChart from '@/components/company/CompletionTrendChart';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { safeNumber } from '@/lib/utils/normalize';

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
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

  const { data: company } = await db.from('companies').select('*').eq('slug', slug).single();
  if (!company) notFound();

  const [
    { count: totalEnrolled },
    { data: enrollments },
    { data: latestMilestone },
    { data: alerts },
    { data: trendData },
    { data: assignments },
  ] = await Promise.all([
    db.from('learners').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
    db.from('enrollments').select('progress_percent, completed_at').eq('company_id', company.id).eq('is_active', true),
    db.from('milestone_checks').select('*').eq('company_id', company.id).order('checked_at', { ascending: false }).limit(1).single(),
    db.from('alerts').select('*').eq('company_id', company.id).eq('status', 'open').order('created_at', { ascending: false }).limit(5),
    db.from('daily_snapshots').select('snapshot_date, completion_percent').eq('company_id', company.id).order('snapshot_date', { ascending: true }).limit(30),
    db.from('assignments').select('submitted').eq('company_id', company.id),
  ]);

  const avgProgress = enrollments?.length
    ? enrollments.reduce((s, e) => s + safeNumber(e.progress_percent), 0) / enrollments.length
    : 0;
  const courseCompletions = enrollments?.filter((e) => e.completed_at).length ?? 0;
  const submissionRate = assignments?.length
    ? Math.round((assignments.filter((a) => a.submitted).length / assignments.length) * 100)
    : 0;

  const onTrack = latestMilestone?.on_track_count ?? 0;
  const slightlyBehind = latestMilestone?.slightly_behind_count ?? 0;
  const atRisk = latestMilestone?.at_risk_count ?? 0;
  const notStarted = latestMilestone?.not_started_count ?? 0;
  const highEngagement = latestMilestone?.high_engagement_count ?? 0;
  const total = Math.max(safeNumber(totalEnrolled), 1);
  const onPace = Math.round(((onTrack + highEngagement) / total) * 100);

  const statusDistribution = [
    { status: 'high_engagement', count: highEngagement },
    { status: 'on_track', count: onTrack },
    { status: 'slightly_behind', count: slightlyBehind },
    { status: 'at_risk', count: atRisk },
    { status: 'not_started', count: notStarted },
  ];

  // Aggregate trend: average completion per day across all learners
  const trendByDate = new Map<string, number[]>();
  for (const row of trendData || []) {
    const date = row.snapshot_date;
    if (!trendByDate.has(date)) trendByDate.set(date, []);
    trendByDate.get(date)!.push(safeNumber(row.completion_percent));
  }
  const trend = Array.from(trendByDate.entries()).map(([date, vals]) => ({
    date,
    average_completion: vals.reduce((a, b) => a + b, 0) / vals.length,
  }));

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
              {latestMilestone && (
                <span style={{ marginLeft: '0.75rem', color: '#9ca3af' }}>
                  · Milestone Day {latestMilestone.milestone_day} · Benchmark {Number(latestMilestone.benchmark_percent).toFixed(0)}%
                </span>
              )}
            </p>
          )}
        </div>
        <TimelineToggle slug={slug} current={isDaysView ? 'days' : 'calendar'} />
      </div>

      <AlertBanner alerts={alerts || []} />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <KpiCard title="Total Enrolled" value={totalEnrolled ?? 0} />
        <KpiCard title="Course Completions" value={courseCompletions} />
        <KpiCard title="Avg Progress" value={`${avgProgress.toFixed(1)}%`} />
        <KpiCard title="Assignment Rate" value={`${submissionRate}%`} />
        <KpiCard title="On Pace" value={`${onPace}%`} color="#059669" />
        <KpiCard title="Slightly Behind" value={slightlyBehind} color="#d97706" />
        <KpiCard title="At Risk" value={atRisk} color="#dc2626" />
        <KpiCard title="Not Started" value={notStarted} color="#9ca3af" />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <LearnerStatusChart data={statusDistribution} />
        <CompletionTrendChart data={trend} />
      </div>

      {/* Milestone summary */}
      {latestMilestone && (
        <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '2rem', alignItems: 'center', background: '#f9fafb' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Average Completion</p>
            <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{Number(latestMilestone.average_completion_percent).toFixed(1)}%</p>
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Benchmark</p>
            <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{Number(latestMilestone.benchmark_percent).toFixed(1)}%</p>
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>At Risk %</p>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: Number(latestMilestone.at_risk_percent) > 20 ? '#dc2626' : '#111827' }}>
              {Number(latestMilestone.at_risk_percent).toFixed(1)}%
            </p>
          </div>
          {latestMilestone.alert_triggered && (
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>⚠️ Alert triggered</span>
          )}
        </div>
      )}

      {/* Navigation cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
        <Link href={`/company/${slug}/learners`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>👥 Learner Breakdown</h3>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              {totalEnrolled} learners · progress, status, last active
            </p>
          </div>
        </Link>
        <Link href={`/company/${slug}/assessments`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>📝 Assessments</h3>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              {courseCompletions} completions · {submissionRate}% assignment rate
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
