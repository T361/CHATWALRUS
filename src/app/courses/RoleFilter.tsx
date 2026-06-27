'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function RoleFilter({ role, roles }: { role: string; roles: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <select
      value={role}
      onChange={e => {
        const p = new URLSearchParams(searchParams.toString());
        if (e.target.value) p.set('role', e.target.value); else p.delete('role');
        router.push('/courses?' + p.toString());
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
