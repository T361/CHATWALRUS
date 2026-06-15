import type { Passcode } from '@/types/alert';

interface PasscodeTableProps {
  passcodes: Passcode[];
  companies?: Record<string, string>; // id → name
}

export default function PasscodeTable({ passcodes, companies = {} }: PasscodeTableProps) {
  if (passcodes.length === 0) {
    return <div className="empty-state"><p>No passcodes configured.</p></div>;
  }

  return (
    <div style={{ overflow: 'auto' }}>
      <table>
        <thead>
          <tr><th>Code</th><th>Role</th><th>Company</th><th>Description</th><th>Status</th><th>Created</th></tr>
        </thead>
        <tbody>
          {passcodes.map((p) => (
            <tr key={p.id}>
              <td className="mono" style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{p.code}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{p.role}</td>
              <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                {p.company_id ? (companies[p.company_id] || p.company_id.slice(0, 8) + '…') : <span style={{ color: 'var(--text-muted)' }}>All</span>}
              </td>
              <td style={{ color: 'var(--text-secondary)' }}>{p.description || '—'}</td>
              <td>
                <span className={`badge ${p.status === 'active' ? 'badge-on-track' : 'badge-not-started'}`}>
                  {p.status}
                </span>
              </td>
              <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
