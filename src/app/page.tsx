export const dynamic = 'force-dynamic';

import PageShell from '@/components/layout/PageShell';
import CompanySearch from '@/components/company/CompanySearch';
import Link from 'next/link';
import { getCompanyCardRows } from '@/lib/companies/query';
import { withServerTiming } from '@/lib/perf';

export default async function HomePage() {
  let companies: Array<{
    id: string; name: string; slug: string;
    start_date: string | null; is_active: boolean;
    learner_count?: number;
    avg_progress?: number | null;
    at_risk_count?: number;
  }> = [];
  let dbError = false;

  try {
    companies = await withServerTiming('home.company_list.load', async () => getCompanyCardRows());
  } catch {
    dbError = true;
  }

  return (
    <PageShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Companies</h1>
          <p className="page-subtitle">Select a company to view engagement details</p>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', paddingTop: '0.375rem' }}>
          {companies.length} companies
        </span>
      </div>

      {dbError && (
        <div className="card" style={{ background: 'var(--warning-bg)', borderColor: 'rgba(245,158,11,0.25)', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--warning)' }}>
            Database unavailable. Check Supabase environment variables and credentials.
          </p>
        </div>
      )}

      {companies.length === 0 && !dbError ? (
        <div className="empty-state card">
          <h3>No Companies Found</h3>
          <p>Sync data from Thinkific or add companies via the admin settings.</p>
          <Link href="/admin/settings" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Go to Settings
          </Link>
        </div>
      ) : (
        <CompanySearch companies={companies} />
      )}
    </PageShell>
  );
}
