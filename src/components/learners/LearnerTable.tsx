import LearnerStatusBadge from './LearnerStatusBadge';
import Link from 'next/link';
import type { LearnerStatus } from '@/types/learner';

interface LearnerRow {
  id: string;
  full_name: string;
  email: string | null;
  department: string | null;
  title: string | null;
  progress_percent: number;
  status: LearnerStatus;
  courses_enrolled: number;
  last_active_at: string | null;
  live_sessions_last_30_days: number;
}

interface LearnerTableProps {
  learners: LearnerRow[];
  companySlug: string;
}

export default function LearnerTable({ learners, companySlug }: LearnerTableProps) {
  if (learners.length === 0) {
    return (
      <div className="empty-state card">
        <h3>No Learners Found</h3>
        <p>Adjust filters or sync data from Thinkific.</p>
      </div>
    );
  }

  return (
    <div className="card card-flush" style={{ overflow: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Department</th>
            <th>Progress</th>
            <th>Status</th>
            <th>Courses</th>
            <th>Last Active</th>
            <th style={{ textAlign: 'center' }}>Sessions</th>
          </tr>
        </thead>
        <tbody>
          {learners.map((l) => {
            const progress = Math.min(100, l.progress_percent);
            const progressColor = progress >= 70 ? 'var(--on-track)' : progress >= 40 ? 'var(--primary)' : 'var(--at-risk)';
            return (
              <tr key={l.id}>
                <td>
                  <div>
                    <Link href={`/company/${companySlug}/learners/${l.id}`} style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.875rem' }}>
                      {l.full_name || 'Unknown'}
                    </Link>
                    {l.email && <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 1 }}>{l.email}</p>}
                  </div>
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{l.department || '—'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 56, height: 4, background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: progressColor, borderRadius: '9999px' }} />
                    </div>
                    <span className="tabular" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{l.progress_percent.toFixed(0)}%</span>
                  </div>
                </td>
                <td><LearnerStatusBadge status={l.status} /></td>
                <td className="tabular" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{l.courses_enrolled}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {l.last_active_at ? new Date(l.last_active_at).toLocaleDateString() : '—'}
                </td>
                <td className="tabular" style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  {l.live_sessions_last_30_days}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
