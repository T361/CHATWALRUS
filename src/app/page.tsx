import PageShell from '@/components/layout/PageShell';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function HomePage() {
  let companies: Array<{
    id: string; name: string; slug: string;
    start_date: string | null; is_active: boolean;
    learner_count?: number;
  }> = [];
  let dbError = false;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from('companies')
      .select('id, name, slug, start_date, is_active')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    if (data) {
      // Bulk-fetch all active learner counts in one query, group in memory
      const companyIds = data.map((c) => c.id);
      const { data: learnerRows } = await db
        .from('learners')
        .select('company_id')
        .in('company_id', companyIds)
        .eq('is_active', true);

      const countMap = new Map<string, number>();
      for (const row of learnerRows || []) {
        countMap.set(row.company_id, (countMap.get(row.company_id) ?? 0) + 1);
      }

      companies = data.map((c) => ({ ...c, learner_count: countMap.get(c.id) ?? 0 }));
    }
  } catch {
    dbError = true;
  }

  return (
    <PageShell>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Companies</h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Select a company to view engagement details
        </p>
      </div>

      {dbError && (
        <div className="card" style={{ background: '#fffbeb', border: '1px solid #fde68a', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#92400e' }}>
            ⚠️ Database unavailable. Check Supabase environment variables and credentials.
          </p>
        </div>
      )}

      {companies.length === 0 && !dbError ? (
        <div className="empty-state card">
          <h3>No Companies Found</h3>
          <p>Sync data from Thinkific or add companies via the admin settings.</p>
          <Link href="/admin/settings" className="btn btn-primary" style={{ marginTop: '1rem', textDecoration: 'none' }}>
            Go to Settings
          </Link>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}>
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/company/${company.slug}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s ease' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  {company.name}
                </h3>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                  <span>{company.learner_count ?? 0} learners</span>
                  {company.start_date && (
                    <span>Started {company.start_date}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
