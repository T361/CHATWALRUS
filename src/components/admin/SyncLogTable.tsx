import type { SyncLog } from '@/types/alert';

export default function SyncLogTable({ logs }: { logs: SyncLog[] }) {
  if (logs.length === 0) {
    return <div className="empty-state"><p>No sync logs recorded yet.</p></div>;
  }

  return (
    <div style={{ overflow: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Status</th>
            <th>Records</th>
            <th>Started</th>
            <th>Completed</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td style={{ fontWeight: 500 }}>{log.sync_type}</td>
              <td>
                <span className={`badge ${log.status === 'success' ? 'badge-on-track' : log.status === 'error' ? 'badge-at-risk' : 'badge-slightly-behind'}`}>
                  {log.status}
                </span>
              </td>
              <td className="tabular">{log.records_processed}</td>
              <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(log.started_at).toLocaleString()}</td>
              <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{log.completed_at ? new Date(log.completed_at).toLocaleString() : '—'}</td>
              <td style={{ fontSize: '0.75rem', color: 'var(--danger)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {log.error_message || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
