'use client';

import { useRouter } from 'next/navigation';

export function CompanyRoleFilter({
  role,
  roles,
  slug,
  filter,
  sortBy,
  sortDir,
}: {
  role: string;
  roles: string[];
  slug: string;
  filter: string;
  sortBy: string;
  sortDir: string;
}) {
  const router = useRouter();
  return (
    <select
      value={role}
      onChange={e => {
        const params = new URLSearchParams();
        params.set('filter', filter);
        params.set('sort_by', sortBy);
        params.set('sort_dir', sortDir);
        if (e.target.value) params.set('role', e.target.value);
        router.push(`/company/${slug}/courses?` + params.toString());
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
