'use client';

import { useRouter } from 'next/navigation';

export default function CompanyFilter({ companies, companyId }: { companies: Array<{ id: string; name: string }>, companyId: string }) {
  const router = useRouter();
  return (
    <select
      value={companyId}
      onChange={e => {
        const params = new URLSearchParams(window.location.search);
        if (e.target.value) params.set('company_id', e.target.value);
        else params.delete('company_id');
        router.push('/courses?' + params.toString());
      }}
      style={{ minWidth: '200px' }}
    >
      <option value="">All Companies</option>
      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
