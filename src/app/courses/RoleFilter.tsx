'use client';

export function RoleFilter({ role, roles }: { role: string; roles: string[] }) {
  return (
    <select
      value={role}
      onChange={e => {
        const p = new URLSearchParams(window.location.search);
        if (e.target.value) p.set('role', e.target.value); else p.delete('role');
        window.location.assign('/courses?' + p.toString());
      }}
      style={{
        fontSize: '0.75rem',
        padding: '0.2rem 0.375rem',
        height: 'auto',
        minWidth: 0,
        width: '100%',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      <option value="">All Roles</option>
      {roles.map(r => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}
