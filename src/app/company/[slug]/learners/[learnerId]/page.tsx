export const dynamic = 'force-dynamic';

import CompanyShell from '@/components/layout/CompanyShell';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import LearnerStatusBadge from '@/components/learners/LearnerStatusBadge';
import type { LearnerStatus } from '@/types/learner';
import type { LearnerSessionHistoryItem } from '@/types/zoom';

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ width: `${clamped}%`, height: '100%', background: color, borderRadius: 9999, transition: 'width 0.4s ease' }} />
      </div>
      <span className="tabular" style={{ fontSize: '0.8125rem', fontWeight: 600, color, minWidth: 36, textAlign: 'right' }}>
        {clamped.toFixed(0)}%
      </span>
    </div>
  );
}

function statusColor(pct: number) {
  if (pct >= 70) return 'var(--on-track)';
  if (pct >= 40) return 'var(--warning)';
  return 'var(--at-risk)';
}

export default async function LearnerDetailPage(
  props: { params: Promise<{ slug: string; learnerId: string }> }
) {
  const { slug, learnerId } = await props.params;
  const db = createAdminClient();

  if (!db) {
    return <CompanyShell slug={slug}><div className="card"><p style={{ color: 'var(--warning)' }}>Database not connected.</p></div></CompanyShell>;
  }

  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) notFound();

  const { data: learner } = await db
    .from('learners').select('*').eq('id', learnerId).eq('company_id', company.id).single();
  if (!learner) notFound();

  const [
    { data: enrollments },
    { data: statusSnap },
    { data: quizzes },
    { data: assignments },
    { data: zoomSessions },
    { data: pointsRow },
    { data: companyRank },
  ] = await Promise.all([
    db.from('enrollments').select('*, courses(name, id)').eq('learner_id', learnerId).order('started_at', { ascending: true }),
    db.from('learner_status_snapshots').select('status, completion_percent, benchmark_percent, snapshot_date').eq('learner_id', learnerId).order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
    db.from('quizzes').select('*, courses(name)').eq('learner_id', learnerId).order('attempted_at', { ascending: false }),
    db.from('assignments').select('*, courses(name)').eq('learner_id', learnerId).order('submitted_at', { ascending: false }),
    db.from('zoom_attendance').select('id, zoom_session_id, learner_id, company_id, attendee_name, attendee_email, join_time, leave_time, duration_minutes, attended, created_at, zoom_sessions(topic, session_type, host_email, start_time, end_time)').eq('learner_id', learnerId).order('join_time', { ascending: false }),
    db.from('learner_points').select('total_points, zoom_attendance_points, lesson_completion_points, quiz_points, course_completion_points, assignment_points, streak_bonus_points, sessions_attended').eq('learner_id', learnerId).maybeSingle(),
    db.from('learner_points').select('learner_id').eq('company_id', company.id).gte('total_points', 0).order('total_points', { ascending: false }),
  ]);

  const currentStatus     = (statusSnap?.status || 'not_started') as LearnerStatus;
  const overallCompletion = Number(statusSnap?.completion_percent ?? 0);
  const benchmark         = Number(statusSnap?.benchmark_percent ?? 0);

  const totalPoints = Number(pointsRow?.total_points ?? 0);
  const companyRankIdx = companyRank?.findIndex((r) => r.learner_id === learnerId) ?? -1;
  const rank = companyRankIdx >= 0 ? companyRankIdx + 1 : null;

  // Compute per-course quiz stats
  const quizByCourse = new Map<string, { scores: number[]; passed: number; total: number }>();
  for (const q of quizzes || []) {
    const name = (q as Record<string, unknown>).courses
      ? ((q as Record<string, unknown>).courses as Record<string, string>).name
      : '?';
    const ex = quizByCourse.get(name) ?? { scores: [], passed: 0, total: 0 };
    if (q.score !== null) ex.scores.push(Number(q.score));
    if (q.passed) ex.passed++;
    ex.total++;
    quizByCourse.set(name, ex);
  }

  const sessionHistory: LearnerSessionHistoryItem[] = (zoomSessions || []).map((row) => {
    const session = Array.isArray(row.zoom_sessions) ? row.zoom_sessions[0] : row.zoom_sessions;
    return {
      id: row.id,
      zoom_session_id: row.zoom_session_id,
      learner_id: row.learner_id,
      company_id: row.company_id,
      attendee_name: row.attendee_name,
      attendee_email: row.attendee_email,
      join_time: row.join_time,
      leave_time: row.leave_time,
      duration_minutes: row.duration_minutes,
      attended: row.attended,
      created_at: row.created_at,
      session_topic: session?.topic ?? null,
      session_type: session?.session_type ?? null,
      session_host_email: session?.host_email ?? null,
      session_start_time: session?.start_time ?? null,
      session_end_time: session?.end_time ?? null,
    };
  });

  const zoomTotal = sessionHistory.length;
  const zoomAttended = sessionHistory.filter((z) => z.attended).length;

  return (
    <CompanyShell slug={slug} companyName={company.name}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">{learner.full_name || 'Unknown'}</h1>
          <p className="page-subtitle">
            {learner.email || '—'} · {company.name}
            {learner.department && <span style={{ color: 'var(--text-muted)' }}> · {learner.department}</span>}
            {learner.title && <span style={{ color: 'var(--text-muted)' }}> · {learner.title}</span>}
          </p>
        </div>
        <LearnerStatusBadge status={currentStatus} />
      </div>

      {/* KPI row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', marginBottom: '1.5rem' }}>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Overall Progress</span>
          <span className="kpi-value tabular" style={{ color: statusColor(overallCompletion) }}>
            {overallCompletion.toFixed(1)}%
          </span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Benchmark</span>
          <span className="kpi-value tabular">{benchmark.toFixed(1)}%</span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Courses Enrolled</span>
          <span className="kpi-value tabular">{enrollments?.length ?? 0}</span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Quiz Attempts</span>
          <span className="kpi-value tabular">{quizzes?.length ?? 0}</span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Live Sessions</span>
          <span className="kpi-value tabular">{zoomAttended}<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>/{zoomTotal}</span></span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Last Active</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
            {learner.last_active_at ? new Date(learner.last_active_at).toLocaleDateString() : '—'}
          </span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Total Points</span>
          <span className="kpi-value tabular" style={{ color: 'var(--primary)' }}>
            {totalPoints.toLocaleString()}
          </span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Company Rank</span>
          <span className="kpi-value tabular">
            {rank ? `#${rank}` : '—'}
          </span>
        </div>
      </div>

      {/* vs benchmark */}
      {statusSnap && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="section-title" style={{ marginBottom: '0.875rem' }}>Progress vs Benchmark</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Learner Progress</span>
              </div>
              <ProgressBar pct={overallCompletion} color={statusColor(overallCompletion)} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Program Benchmark</span>
              </div>
              <ProgressBar pct={benchmark} color="var(--border-accent)" />
            </div>
            {overallCompletion < benchmark && (
              <p style={{ fontSize: '0.75rem', color: 'var(--at-risk)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--at-risk)', display: 'inline-block', boxShadow: '0 0 6px var(--at-risk)' }} />
                {(benchmark - overallCompletion).toFixed(1)}% behind benchmark
              </p>
            )}
          </div>
        </div>
      )}

      {/* Points Breakdown */}
      {pointsRow && totalPoints > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="section-title" style={{ marginBottom: '0.875rem' }}>Points Breakdown</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem' }}>
            {[
              { label: '🎯 Zoom Sessions',    pts: pointsRow.zoom_attendance_points,    suffix: `(${pointsRow.sessions_attended} sessions)` },
              { label: '📚 Lessons',          pts: pointsRow.lesson_completion_points,   suffix: '' },
              { label: '✅ Quizzes',          pts: pointsRow.quiz_points,               suffix: '' },
              { label: '🏆 Course Complete',  pts: pointsRow.course_completion_points,  suffix: '' },
              { label: '📝 Assignments',      pts: pointsRow.assignment_points,         suffix: '' },
{ label: '🔥 Streaks & Pace',   pts: pointsRow.streak_bonus_points,       suffix: '' },
            ]
              .filter((item) => Number(item.pts) > 0)
              .map((item) => (
                <div key={item.label} style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '0.5rem 0.875rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.125rem',
                  minWidth: 120,
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(item.pts).toLocaleString()} pts
                  </span>
                  {item.suffix && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.suffix}</span>}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Session History */}
      <h2 className="section-title" style={{ marginBottom: '0.75rem' }}>Session History</h2>
      {sessionHistory.length === 0 ? (
        <div className="card empty-state" style={{ marginBottom: '1.25rem' }}>
          <p>No learner-linked Zoom attendance history found.</p>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: '1.25rem', overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Type</th>
                <th>Session Start</th>
                <th>Join</th>
                <th>Leave</th>
                <th style={{ textAlign: 'center' }}>Duration</th>
                <th>Host</th>
              </tr>
            </thead>
            <tbody>
              {sessionHistory.map((session) => (
                <tr key={session.id}>
                  <td>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                        {session.session_topic || 'Untitled Session'}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {session.attendee_email || learner.email || '—'}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-not-started" style={{ textTransform: 'capitalize' }}>
                      {session.session_type || 'meeting'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {session.session_start_time ? new Date(session.session_start_time).toLocaleString() : '—'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {session.join_time ? new Date(session.join_time).toLocaleString() : '—'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {session.leave_time ? new Date(session.leave_time).toLocaleString() : '—'}
                  </td>
                  <td className="tabular" style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text)' }}>
                    {session.duration_minutes !== null ? `${session.duration_minutes}m` : '—'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {session.session_host_email || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Course Progress */}
      <h2 className="section-title" style={{ marginBottom: '0.75rem' }}>Course Progress</h2>
      {!enrollments || enrollments.length === 0 ? (
        <div className="card empty-state" style={{ marginBottom: '1.25rem' }}><p>No course enrollments found.</p></div>
      ) : (
        <div className="card" style={{ marginBottom: '1.25rem', overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th style={{ width: 200 }}>Progress</th>
                <th>Started</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => {
                const courseName = (e as Record<string, unknown>).courses
                  ? ((e as Record<string, unknown>).courses as Record<string, string>).name
                  : '—';
                const pct = Number(e.progress_percent || 0);
                return (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 500 }}>{courseName}</td>
                    <td>
                      <ProgressBar pct={pct} color={statusColor(pct)} />
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {e.started_at ? new Date(e.started_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      {e.completed_at
                        ? <span className="badge badge-success">Completed</span>
                        : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
        {/* Quiz Attempts */}
        <div>
          <h2 className="section-title" style={{ marginBottom: '0.75rem' }}>Quiz Attempts</h2>
          {!quizzes || quizzes.length === 0 ? (
            <div className="card empty-state"><p>No quiz data available.</p></div>
          ) : (
            <div className="card card-flush" style={{ overflow: 'auto' }}>
              <table>
                <thead><tr><th>Course</th><th>Score</th><th>Result</th><th>Date</th></tr></thead>
                <tbody>
                  {quizzes.map((q) => {
                    const courseName = (q as Record<string, unknown>).courses
                      ? ((q as Record<string, unknown>).courses as Record<string, string>).name
                      : '—';
                    return (
                      <tr key={q.id}>
                        <td style={{ fontSize: '0.8125rem' }}>{courseName}</td>
                        <td className="tabular" style={{ fontWeight: 600, color: q.score !== null ? (q.score >= 70 ? 'var(--on-track)' : 'var(--at-risk)') : 'var(--text-muted)' }}>
                          {q.score !== null ? `${q.score}%` : '—'}
                        </td>
                        <td>
                          {q.passed === true
                            ? <span className="badge badge-success">Pass</span>
                            : q.passed === false
                              ? <span className="badge badge-danger">Fail</span>
                              : <span className="badge badge-not-started">—</span>}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {q.attempted_at ? new Date(q.attempted_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Assignments */}
        <div>
          <h2 className="section-title" style={{ marginBottom: '0.75rem' }}>Assignments</h2>
          {!assignments || assignments.length === 0 ? (
            <div className="card empty-state"><p>No assignment data.</p></div>
          ) : (
            <div className="card card-flush" style={{ overflow: 'auto' }}>
              <table>
                <thead><tr><th>Course</th><th>Status</th><th>Score</th><th>Date</th></tr></thead>
                <tbody>
                  {assignments.map((a) => {
                    const courseName = (a as Record<string, unknown>).courses
                      ? ((a as Record<string, unknown>).courses as Record<string, string>).name
                      : '—';
                    return (
                      <tr key={a.id}>
                        <td style={{ fontSize: '0.8125rem' }}>{courseName}</td>
                        <td>
                          {a.submitted
                            ? <span className="badge badge-success">Submitted</span>
                            : <span className="badge badge-not-started">Pending</span>}
                        </td>
                        <td className="tabular" style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                          {a.score !== null ? a.score : '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </CompanyShell>
  );
}
