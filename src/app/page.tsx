import PageShell from '@/components/layout/PageShell';
import CompanyCard from '@/components/company/CompanyCard';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function HomePage() {
  let companies: Array<{
    id: string; name: string; slug: string;
    start_date: string | null; is_active: boolean;
    learner_count?: number;
    avg_progress?: number;
    at_risk_count?: number;
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
      const companyIds = data.map((c) => c.id);

      const [{ data: learnerRows }, { data: enrollmentRows }, { data: milestoneRows }] = await Promise.all([
        db.from('learners').select('company_id').in('company_id', companyIds).eq('is_active', true),
        db.from('enrollments').select('company_id, progress_percent').in('company_id', companyIds).eq('is_active', true),
        db.from('milestone_checks').select('company_id, at_risk_count').in('company_id', companyIds).order('checked_at', { ascending: false }),
      ]);

      const countMap = new Map<string, number>();
      for (const row of learnerRows || []) {
        countMap.set(row.company_id, (countMap.get(row.company_id) ?? 0) + 1);
      }

      const progressMap = new Map<string, number[]>();
      for (const row of enrollmentRows || []) {
        if (!progressMap.has(row.company_id)) progressMap.set(row.company_id, []);
        progressMap.get(row.company_id)!.push(Number(row.progress_percent ?? 0));
      }

      const atRiskMap = new Map<string, number>();
      for (const row of milestoneRows || []) {
        if (!atRiskMap.has(row.company_id)) {
          atRiskMap.set(row.company_id, row.at_risk_count ?? 0);
        }
      }

      companies = data.map((c) => {
        const prog = progressMap.get(c.id) ?? [];
        const avg = prog.length ? prog.reduce((a, b) => a + b, 0) / prog.length : undefined;
        return {
          ...c,
          learner_count: countMap.get(c.id) ?? 0,
          avg_progress: avg,
          at_risk_count: atRiskMap.get(c.id),
        };
      });
    }
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
          {companies.length} active
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
        <div className="company-grid">
          {companies.map((company) => (
            <CompanyCard
              key={company.id}
              name={company.name}
              slug={company.slug}
              learnerCount={company.learner_count ?? 0}
              startDate={company.start_date}
              avgProgress={company.avg_progress}
              atRiskCount={company.at_risk_count}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
