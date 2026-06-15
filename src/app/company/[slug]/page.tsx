export const dynamic = 'force-dynamic';

import PageShell from '@/components/layout/PageShell';
import KpiCard from '@/components/company/KpiCard';
import AlertBanner from '@/components/company/AlertBanner';
import TimelineToggle from '@/components/company/TimelineToggle';
import LearnerStatusChart from '@/components/company/LearnerStatusChart';
import CompletionTrendChart from '@/components/company/CompletionTrendChart';
import LearnerStatusBar from '@/components/company/LearnerStatusBar';
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
        <div className="card" style={{ background: 'var(--warning-bg)', borderColor: 'rgba(245,158,11,0.25)' }}>
          <p style={{ color: 'var(--warning)' }}>Database not connected.</p>
        </div>
      </PageShell>
    );
  }

  const { data: company } = await db.from('companies').select('*').eq('slug', slug).single();
  if (!company) notFound();

  const [
    { count: totalEnrolled },
    { count: courseCompletions },
    { count: totalAssignments },
    { count: submittedAssignments },
    { data: latestMilestone },
    { data: alerts },
    { data: trendData },
  ] = await Promise.all([
    db.from('learners').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
    db.from('enrollments').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true).not('completed_at', 'is', null),
    db.from('assignments').select('*', { count: 'exact', head: true }).eq('company_id', company.id),
    db.from('assignments').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('submitted', true),
    db.from('milestone_checks').select('*').eq('company_id', company.id).order('checked_at', { ascending: false }).limit(1).single(),
    db.from('alerts').select('*').eq('company_id', company.id).eq('status', 'open').order('created_at', { ascending: false }).limit(5),
    db.from('daily_snapshots').select('snapshot_date, completion_percent').eq('company_id', company.id).order('snapshot_date', { ascending: false }).limit(30),
  ]);

  // Use milestone average_completion_percent which is calculated with full pagination
  const avgProgress = Number(latestMilestone?.average_completion_percent ?? 0);
  const submissionRate = totalAssignments
    ? Math.round(((submittedAssignments ?? 0) / totalAssignments) * 100)
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

  const trendByDate = new Map<string, number[]>();
  for (const row of trendData || []) {
    const date = row.snapshot_date;
    if (!trendByDate.has(date)) trendByDate.set(date, []);
    trendByDate.get(date)!.push(safeNumber(row.completion_percent));
  }
  // trendData is DESC (newest first); reverse to chronological order for the chart
  const trend = Array.from(trendByDate.entries())
    .map(([date, vals]) => ({ date, average_completion: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .reverse();

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
      <Link href="/" className="back-link">← Companies</Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{company.name}</h1>
          {programLabel && (
            <p className="page-subtitle">
              {programLabel}
              {latestMilestone && (
                <span style={{ color: 'var(--text-muted)', marginLeft: '0.75rem' }}>
                  · Day {latestMilestone.milestone_day} · Benchmark {Number(latestMilestone.benchmark_percent).toFixed(0)}%
                </span>
              )}
            </p>
          )}
        </div>
        <TimelineToggle slug={slug} current={isDaysView ? 'days' : 'calendar'} />
      </div>

      <AlertBanner alerts={alerts || []} />

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <KpiCard title="Total Enrolled" value={totalEnrolled ?? 0} />
        <KpiCard title="Completions" value={courseCompletions ?? 0} />
        <KpiCard title="Avg Progress" value={`${avgProgress.toFixed(1)}%`} />
        <KpiCard title="Assignment Rate" value={`${submissionRate}%`} />
        <KpiCard title="On Pace" value={`${onPace}%`} color="var(--on-track)" />
        <KpiCard title="Slightly Behind" value={slightlyBehind} color="var(--slightly-behind)" href={`/company/${slug}/learners?status=slightly_behind`} />
        <KpiCard title="At Risk" value={atRisk} color="var(--at-risk)" href={`/company/${slug}/learners?status=at_risk`} />
        <KpiCard title="Not Started" value={notStarted} color="var(--not-started)" href={`/company/${slug}/learners?status=not_started`} />
      </div>

      <LearnerStatusBar
        highEngagement={highEngagement}
        onTrack={onTrack}
        slightlyBehind={slightlyBehind}
        atRisk={atRisk}
        notStarted={notStarted}
      />

      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <LearnerStatusChart data={statusDistribution} />
        <CompletionTrendChart data={trend} />
      </div>

      {latestMilestone && (
        <div className="card" style={{ marginBottom: '1.25rem', display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
          <div>
            <p className="kpi-label">Avg Completion</p>
            <p className="kpi-value tabular">{Number(latestMilestone.average_completion_percent).toFixed(1)}%</p>
          </div>
          <div>
            <p className="kpi-label">Benchmark</p>
            <p className="kpi-value tabular">{Number(latestMilestone.benchmark_percent).toFixed(1)}%</p>
          </div>
          <div>
            <p className="kpi-label">At Risk %</p>
            <p className="kpi-value tabular" style={{ color: Number(latestMilestone.at_risk_percent) > 20 ? 'var(--danger)' : 'var(--text)' }}>
              {Number(latestMilestone.at_risk_percent).toFixed(1)}%
            </p>
          </div>
          {latestMilestone.alert_triggered && (
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', display: 'inline-block', boxShadow: '0 0 6px var(--warning)' }} />
              Alert triggered
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem' }}>
        {[
          { href: `/company/${slug}/learners`, icon: '⌀', label: 'Learner Breakdown', sub: `${totalEnrolled ?? 0} learners · progress & status` },
          { href: `/company/${slug}/assessments`, icon: '◈', label: 'Assessments', sub: `${courseCompletions} completions · ${submissionRate}% assignment rate` },
          { href: `/company/${slug}/export`, icon: '↓', label: 'Export Data', sub: 'Download CSV and JSON reports' },
        ].map(({ href, icon, label, sub }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card card-hover" style={{ minHeight: 80 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary)', fontFamily: 'monospace' }}>{icon}</span>
                <h3 className="section-title" style={{ marginBottom: 0 }}>{label}</h3>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
