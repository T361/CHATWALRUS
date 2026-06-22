'use client';

const ROLES = ['Other','Operations','Marketing','Finance','Creative','IT','HR','Product','Sales'];

export function RoleFilter({ role }: { role: string }) {
  return (
    <select value={role} onChange={e => {
      const p = new URLSearchParams(window.location.search);
      if (e.target.value) p.set('role', e.target.value); else p.delete('role');
      window.location.assign('/courses?' + p.toString());
    }} style={{ minWidth: '140px' }}>
      <option value="">All Roles</option>
      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}
