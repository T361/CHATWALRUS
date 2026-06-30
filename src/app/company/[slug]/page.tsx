export const dynamic = 'force-dynamic';

import CompanyShell from '@/components/layout/CompanyShell';
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
import { getCompanySessionLists, getCompanyZoomAnalytics } from '@/lib/zoom/analytics';

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
      <CompanyShell slug={slug}>
        <div className="card" style={{ background: 'var(--warning-bg)', borderColor: 'rgba(245,158,11,0.25)' }}>
          <p style={{ color: 'var(--warning)' }}>Database not connected.</p>
        </div>
      </CompanyShell>
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
    { data: top3 },
    zoomAnalytics,
    recentSessions,
  ] = await Promise.all([
    db.from('learners').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
    db.from('enrollments').select('*', { count: 'exact', head: true }).eq('company_id', company.id).not('completed_at', 'is', null),
    db.from('assignments').select('*', { count: 'exact', head: true }).eq('company_id', company.id),
    db.from('assignments').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('submitted', true),
    db.from('milestone_checks').select('*').eq('company_id', company.id).order('checked_at', { ascending: false }).limit(1).single(),
    db.from('alerts').select('*').eq('company_id', company.id).eq('status', 'open').order('created_at', { ascending: false }).limit(5),
    db.from('daily_snapshots').select('snapshot_date, completion_percent').eq('company_id', company.id).order('snapshot_date', { ascending: false }).limit(30),
    db.from('learner_points').select('learner_id, total_points, learners(full_name)').eq('company_id', company.id).order('total_points', { ascending: false }).limit(3),
    getCompanyZoomAnalytics(company.id, 84),
    getCompanySessionLists(company.id, 3),
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
    <CompanyShell slug={slug} companyName={company.name}>
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

      {!company.start_date && (
        <div style={{ marginBottom: '1rem', padding: '0.625rem 0.875rem', background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--warning)' }}>
          No start date set — benchmark calculations default to Day 30. Set a start date in Company Settings.
        </div>
      )}

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <KpiCard
          title="Total Enrolled"
          value={totalEnrolled ?? 0}
          tooltip="Total number of active learners enrolled in courses for this company"
        />
        <KpiCard
          title="Completions"
          value={courseCompletions ?? 0}
          tooltip="Number of course enrollments that have been fully completed (100% progress)"
        />
        <KpiCard
          title="Avg Progress"
          value={`${avgProgress.toFixed(1)}%`}
          tooltip="Average course completion percentage across all active learners in this company"
        />
        <KpiCard
          title="Assignment Rate"
          value={`${submissionRate}%`}
          tooltip="Percentage of assignments that have been submitted out of total assignments available"
        />
        <KpiCard
          title="On Pace"
          value={`${onPace}%`}
          color="var(--on-track)"
          tooltip="Percentage of learners who are On Track or High Engagement (meeting or exceeding the benchmark)"
        />
        <KpiCard
          title="Session Reach"
          value={`${zoomAnalytics.attendance_rate.toFixed(1)}%`}
          color="var(--primary)"
          href={`/company/${slug}/sessions`}
          tooltip="Percentage of learners who have attended at least one live Zoom session"
        />
        <KpiCard
          title="Slightly Behind"
          value={slightlyBehind}
          color="var(--slightly-behind)"
          href={`/company/${slug}/learners?status=slightly_behind`}
          tooltip="Learners who are progressing but below the current benchmark (click to view list)"
        />
        <KpiCard
          title="At Risk"
          value={atRisk}
          color="var(--at-risk)"
          href={`/company/${slug}/learners?status=at_risk`}
          tooltip="Learners significantly behind the benchmark or with low engagement (click to view list)"
        />
        <KpiCard
          title="Not Started"
          value={notStarted}
          color="var(--not-started)"
          href={`/company/${slug}/learners?status=not_started`}
          tooltip="Learners who have enrolled but have not yet logged in or started any coursework (click to view list)"
        />
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
        <div className="card" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {[
            { label: 'Avg Completion', value: `${Number(latestMilestone.average_completion_percent).toFixed(1)}%` },
            { label: 'Benchmark',      value: `${Number(latestMilestone.benchmark_percent).toFixed(1)}%` },
          ].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, padding: '0.25rem 1rem', borderRight: '1px solid var(--border-muted)' }}>
              <p className="kpi-label">{label}</p>
              <p className="kpi-value tabular">{value}</p>
            </div>
          ))}
          {latestMilestone.alert_triggered && (
            <span style={{ paddingLeft: '1rem', fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem', whiteSpace: 'nowrap' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', display: 'inline-block', boxShadow: '0 0 6px var(--warning)', flexShrink: 0 }} />
              Alert triggered
            </span>
          )}
        </div>
      )}

      {top3 && top3.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
            <p className="section-title" style={{ marginBottom: 0 }}>🏆 Top Learners</p>
            <Link href={`/company/${slug}/leaderboard`} style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none' }}>Full leaderboard →</Link>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {top3.map((row, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              const learner = (row as Record<string, unknown>).learners as Record<string, string> | null;
              const name = learner?.full_name ?? 'Learner';
              return (
                <Link
                  key={row.learner_id}
                  href={`/company/${slug}/learners/${row.learner_id}`}
                  style={{ flex: 1, textDecoration: 'none', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}
                >
                  <span style={{ fontSize: '1.25rem' }}>{medals[i]}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name.split(' ')[0]}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(row.total_points).toLocaleString()} pts
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
          <p className="section-title" style={{ marginBottom: 0 }}>Live Session Activity</p>
          <Link href={`/company/${slug}/sessions`} style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none' }}>View all sessions →</Link>
        </div>
        {recentSessions.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No learner-linked Zoom attendance is currently available for this company.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {recentSessions.map((session) => (
              <div key={session.session_id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 0.875rem' }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>{session.topic || 'Untitled session'}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  {session.start_time ? new Date(session.start_time).toLocaleString() : 'Unknown start'}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  <span>{session.attendee_count} attendees</span>
                  <span>{session.session_type || 'session'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem' }}>
        {[
          { href: `/company/${slug}/learners`, icon: '⌀', label: 'Learner Breakdown', sub: `${totalEnrolled ?? 0} learners · progress & status` },
          { href: `/company/${slug}/leaderboard`, icon: '🏆', label: 'Leaderboard', sub: 'Top learners by engagement points' },
          { href: `/company/${slug}/assessments`, icon: '◈', label: 'Assessments', sub: `${courseCompletions} completions · ${submissionRate}% assignment rate` },
          { href: `/company/${slug}/sessions`, icon: '▣', label: 'Sessions', sub: `${zoomAnalytics.attendance_rate.toFixed(1)}% reach · ${recentSessions.length} recent sessions` },
          { href: `/company/${slug}/interventions`, icon: '📋', label: 'Interventions', sub: 'CSM notes, calls and follow-ups' },
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
    </CompanyShell>
  );
}
