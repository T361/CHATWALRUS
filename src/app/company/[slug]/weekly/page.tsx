import CompanyShell from '@/components/layout/CompanyShell';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { getWeeklyReportResultByCompanySlug } from '@/lib/weekly/rollups';

const STATUS_COLORS: Record<string, string> = {
  high_engagement: 'var(--high-engagement)',
  on_track: 'var(--on-track)',
  slightly_behind: 'var(--slightly-behind)',
  at_risk: 'var(--at-risk)',
  not_started: 'var(--not-started)',
};

const STATUS_LABELS: Record<string, string> = {
  high_engagement: 'High Engagement',
  on_track: 'On Track',
  slightly_behind: 'Slightly Behind',
  at_risk: 'At Risk',
  not_started: 'Not Started',
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default async function WeeklyPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const result = await getWeeklyReportResultByCompanySlug(slug);
  const data = result.report;

  if (!data) {
    return (
      <CompanyShell slug={slug}>
        <div className="empty-state card">
          <h3>Could not load report</h3>
          <p>{result.error || 'Weekly report data is unavailable.'}</p>
        </div>
      </CompanyShell>
    );
  }

  const { totals, status_distribution, top_learners, open_alerts } = data;
  const activeRate = totals.learners > 0 ? Math.round((totals.active_this_week / totals.learners) * 100) : 0;
  const totalStatus = Object.values(status_distribution).reduce((a, b) => a + b, 0) || 1;

  return (
    <CompanyShell slug={slug} companyName={data.company.name}>
      <div className="page-header" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1 className="page-title">Weekly Summary</h1>
          <p className="page-subtitle">{fmt(data.week_start)} – {fmt(data.week_end)} · {data.company.name}</p>
        </div>
        <Link href={`/company/${slug}/interventions`} className="btn btn-secondary btn-sm">
          + Log Intervention
        </Link>
      </div>

      <div className="kpi-grid animate-fade-in-up" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Learners', value: totals.learners, sub: `${activeRate}% active this week` },
          { label: 'Active This Week', value: totals.active_this_week, color: activeRate >= 70 ? 'var(--on-track)' : 'var(--warning)' },
          { label: 'Course Completions', value: totals.course_completions },
          { label: 'Zoom Attendances', value: totals.zoom_attendances },
          { label: 'Assignments', value: totals.assignments_submitted },
          { label: 'Surveys', value: totals.surveys_submitted },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="card card-sm kpi-card">
            <p className="kpi-label">{label}</p>
            <p className="kpi-value" style={{ color: color ?? 'var(--text)', fontSize: '1.625rem' }}>{value}</p>
            {sub && <p className="kpi-sub">{sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <div className="card animate-fade-in-up stagger-1">
          <h3 className="section-title">Learner Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(status_distribution).map(([status, count]) => (
              <div key={status}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  <span style={{ color: STATUS_COLORS[status] }}>{STATUS_LABELS[status]}</span>
                  <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {count} ({Math.round((count / totalStatus) * 100)}%)
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${(count / totalStatus) * 100}%`, background: STATUS_COLORS[status] }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-muted)' }}>
            <p className="kpi-label">Avg Completion</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>
              {data.avg_completion.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="card animate-fade-in-up stagger-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Top 5 Learners</h3>
            <Link href={`/company/${slug}/leaderboard`} style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>
              Full leaderboard →
            </Link>
          </div>
          {top_learners.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No points data yet — run Recalculate Points.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {top_learners.map((learner, index) => (
                <div key={`${learner.full_name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.75rem', color: index < 3 ? 'var(--primary)' : 'var(--text-muted)', width: 20, textAlign: 'center' }}>
                    #{index + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {learner.full_name}
                    </p>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                      {learner.sessions_attended} sessions
                    </p>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {learner.total_points.toLocaleString()} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {open_alerts.length > 0 && (
        <div className="card animate-fade-in-up stagger-3">
          <h3 className="section-title">Open Alerts ({open_alerts.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {open_alerts.map((alert, index) => (
              <div
                key={`${alert.alert_type}-${index}`}
                className="alert-row"
                style={{
                  '--alert-bg': alert.severity === 'critical' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                  '--alert-border': alert.severity === 'critical' ? 'rgba(248,113,113,0.2)' : 'rgba(245,158,11,0.2)',
                  '--alert-accent': alert.severity === 'critical' ? 'var(--danger)' : 'var(--warning)',
                } as CSSProperties}
              >
                <div className="alert-dot" />
                <p className="alert-title">{alert.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </CompanyShell>
  );
}
