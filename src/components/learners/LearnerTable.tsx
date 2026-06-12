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
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Department</th>
            <th>Progress</th>
            <th>Status</th>
            <th>Courses</th>
            <th>Last Active</th>
            <th>Live Sessions</th>
          </tr>
        </thead>
        <tbody>
          {learners.map((l) => (
            <tr key={l.id}>
              <td>
                <Link
                  href={`/company/${companySlug}/learners/${l.id}`}
                  style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
                >
                  {l.full_name || 'Unknown'}
                </Link>
              </td>
              <td style={{ color: '#6b7280' }}>{l.email || '—'}</td>
              <td style={{ color: '#6b7280' }}>{l.department || '—'}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '60px', height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, l.progress_percent)}%`, height: '100%', background: '#2563eb', borderRadius: '3px' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem' }}>{l.progress_percent.toFixed(0)}%</span>
                </div>
              </td>
              <td><LearnerStatusBadge status={l.status} /></td>
              <td>{l.courses_enrolled}</td>
              <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {l.last_active_at ? new Date(l.last_active_at).toLocaleDateString() : '—'}
              </td>
              <td style={{ textAlign: 'center' }}>{l.live_sessions_last_30_days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
