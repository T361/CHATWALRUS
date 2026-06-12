import type { Passcode } from '@/types/alert';

export default function PasscodeTable({ passcodes }: { passcodes: Passcode[] }) {
  if (passcodes.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '1rem' }}>
        <p>No passcodes configured.</p>
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Role</th>
            <th>Description</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {passcodes.map((p) => (
            <tr key={p.id}>
              <td style={{ fontFamily: 'monospace', fontWeight: 500 }}>{p.code}</td>
              <td>{p.role}</td>
              <td style={{ color: '#6b7280' }}>{p.description || '—'}</td>
              <td>
                <span className={`badge ${p.status === 'active' ? 'badge-on-track' : 'badge-not-started'}`}>
                  {p.status}
                </span>
              </td>
              <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {new Date(p.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
