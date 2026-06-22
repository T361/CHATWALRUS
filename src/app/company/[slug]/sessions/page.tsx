'use client';

import CompanyShell from '@/components/layout/CompanyShell';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type AnalyticsResponse = {
  company_name: string;
  attendance_rate: number;
  active_learners: number;
  attending_learners: number;
  period_start: string;
  period_end: string;
  session_trends: Array<{
    week_start: string;
    sessions_held: number;
    total_attendances: number;
    unique_attendees: number;
    average_duration_minutes: number;
  }>;
};

type SessionsResponse = {
  company_name: string;
  sessions: Array<{
    session_id: string;
    zoom_meeting_id: string | null;
    topic: string | null;
    host_email: string | null;
    start_time: string | null;
    end_time: string | null;
    duration_minutes: number | null;
    session_type: string | null;
    attendee_count: number;
    attendees: Array<{
      attendance_id: string;
      learner_id: string | null;
      attendee_name: string | null;
      attendee_email: string | null;
      join_time: string | null;
      leave_time: string | null;
      duration_minutes: number | null;
      attended: boolean;
    }>;
  }>;
};

type View = 'weekly' | 'sessions';

export default function CompanySessionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [sessions, setSessions] = useState<SessionsResponse['sessions']>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('weekly');

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const [analyticsRes, sessionsRes] = await Promise.all([
          fetch(`/api/companies/${slug}/zoom/analytics`, { cache: 'no-store' }),
          fetch(`/api/companies/${slug}/zoom/sessions?limit=12`, { cache: 'no-store' }),
        ]);

        const analyticsData = await analyticsRes.json();
        const sessionsData = await sessionsRes.json();

        if (ignore) return;
        setAnalytics(analyticsData);
        setSessions(sessionsData.sessions || []);
        setCompanyName(analyticsData.company_name || sessionsData.company_name || slug);
      } catch {
        if (ignore) return;
        setAnalytics(null);
        setSessions([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => { ignore = true; };
  }, [slug]);

  return (
    <CompanyShell slug={slug} companyName={companyName}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sessions</h1>
          <p className="page-subtitle">Attendance reach, weekly trends, and per-session attendee history</p>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '2rem' }}>
          <div className="empty-state"><span className="spinner" /><p>Loading session analytics...</p></div>
        </div>
      ) : !analytics ? (
        <div className="empty-state card">
          <h3>Could not load sessions</h3>
          <p>Check Zoom sync data and try again.</p>
        </div>
      ) : (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', marginBottom: '1.25rem' }}>
            <div className="card card-sm kpi-card">
              <span className="kpi-label">Attendance Reach</span>
              <span className="kpi-value tabular" style={{ color: 'var(--primary)' }}>{analytics.attendance_rate.toFixed(1)}%</span>
              <span className="kpi-sub">{analytics.attending_learners} of {analytics.active_learners} learners</span>
            </div>
            <div className="card card-sm kpi-card">
              <span className="kpi-label">Trend Weeks</span>
              <span className="kpi-value tabular">{analytics.session_trends.length}</span>
              <span className="kpi-sub">Weekly buckets</span>
            </div>
            <div className="card card-sm kpi-card">
              <span className="kpi-label">Recent Sessions</span>
              <span className="kpi-value tabular">{sessions.length}</span>
              <span className="kpi-sub">Most recent records</span>
            </div>
            <div className="card card-sm kpi-card">
              <span className="kpi-label">Analytics Window</span>
              <span className="kpi-value" style={{ fontSize: '1rem' }}>
                {new Date(analytics.period_start).toLocaleDateString()}
              </span>
              <span className="kpi-sub">to {new Date(analytics.period_end).toLocaleDateString()}</span>
            </div>
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <button
              className={view === 'weekly' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => setView('weekly')}
            >
              Weekly Session Trends
            </button>
            <button
              className={view === 'sessions' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => setView('sessions')}
            >
              Per Session Attendance
            </button>
          </div>

          {/* Weekly Session Trends view */}
          {view === 'weekly' && (
            <div className="card card-flush" style={{ overflow: 'auto' }}>
              {analytics.session_trends.length === 0 ? (
                <div className="empty-state"><p>No learner-linked Zoom attendance found for this period.</p></div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th><strong>Date</strong></th>
                      <th><strong>Total Attendances</strong></th>
                      <th><strong>Unique Attendees</strong></th>
                      <th><strong>Avg Minutes</strong></th>
                      <th><strong>Total Sessions</strong></th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.session_trends.map((trend) => (
                      <tr key={trend.week_start}>
                        <td style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                          {new Date(trend.week_start).toLocaleDateString()}
                        </td>
                        <td className="tabular" style={{ fontSize: '0.875rem' }}>{trend.total_attendances}</td>
                        <td className="tabular" style={{ fontSize: '0.875rem' }}>{trend.unique_attendees}</td>
                        <td className="tabular" style={{ fontSize: '0.875rem' }}>{trend.average_duration_minutes.toFixed(1)}</td>
                        <td className="tabular" style={{ fontSize: '0.875rem' }}>{trend.sessions_held}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Per Session Attendance view */}
          {view === 'sessions' && (
            <div className="card card-flush" style={{ overflow: 'auto' }}>
              {sessions.length === 0 ? (
                <div className="empty-state"><p>No learner-linked Zoom attendance history found.</p></div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th><strong>Session Name</strong></th>
                      <th><strong>Date</strong></th>
                      <th><strong>Time</strong></th>
                      <th><strong>Host</strong></th>
                      <th><strong>Attendees</strong></th>
                      <th><strong>Attendance List</strong></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => {
                      const startDate = session.start_time ? new Date(session.start_time) : null;
                      return (
                        <tr key={session.session_id}>
                          <td>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{session.topic || 'Untitled session'}</span>
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                            {startDate ? startDate.toLocaleDateString() : '—'}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                            {startDate ? startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{session.host_email || '—'}</td>
                          <td className="tabular" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{session.attendee_count}</td>
                          <td>
                            <details>
                              <summary style={{ cursor: 'pointer', color: 'var(--primary)', fontSize: '0.8125rem' }}>
                                View attendees
                              </summary>
                              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '320px' }}>
                                {session.attendees.map((attendee) => (
                                  <div key={attendee.attendance_id} style={{ border: '1px solid var(--border-muted)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                                    <p style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{attendee.attendee_name || attendee.attendee_email || 'Unknown attendee'}</p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{attendee.attendee_email || 'No email matched'}</p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                      Joined {attendee.join_time ? new Date(attendee.join_time).toLocaleString() : '—'} · Left {attendee.leave_time ? new Date(attendee.leave_time).toLocaleString() : '—'} · {attendee.duration_minutes ?? 0} mins
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </CompanyShell>
  );
}
