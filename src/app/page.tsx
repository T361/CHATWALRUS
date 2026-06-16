export const dynamic = 'force-dynamic';

import PageShell from '@/components/layout/PageShell';
import CompanyCard from '@/components/company/CompanyCard';
import CompanySearch from '@/components/company/CompanySearch';
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
      .order('name');

    if (error) throw error;

    if (data) {
      // Use learner_status_snapshots (one row per learner, ~2k rows) instead of
      // raw learners (4k rows) or enrollments (64k rows) — avoids the 1,000-row
      // server cap that silently truncated counts on the old .in(companyIds) queries.
      // Pull the most-recent snapshot per learner by fetching all and deduplicating.
      const allSnapshots: Array<{ company_id: string; learner_id: string; completion_percent: number; status: string; snapshot_date: string }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: page } = await db
          .from('learner_status_snapshots')
          .select('company_id, learner_id, completion_percent, status, snapshot_date')
          .order('snapshot_date', { ascending: false })
          .range(offset, offset + 999);
        if (!page || page.length === 0) break;
        allSnapshots.push(...page);
        if (page.length < 1000) break;
      }

      // Keep only the latest snapshot per learner
      const latestByLearner = new Map<string, typeof allSnapshots[0]>();
      for (const snap of allSnapshots) {
        if (!latestByLearner.has(snap.learner_id)) latestByLearner.set(snap.learner_id, snap);
      }

      // Aggregate per company
      const countMap    = new Map<string, number>();
      const progressMap = new Map<string, number[]>();
      const atRiskMap   = new Map<string, number>();

      for (const snap of latestByLearner.values()) {
        const co = snap.company_id;
        countMap.set(co, (countMap.get(co) ?? 0) + 1);
        if (!progressMap.has(co)) progressMap.set(co, []);
        progressMap.get(co)!.push(Number(snap.completion_percent ?? 0));
        if (snap.status === 'at_risk' || snap.status === 'slightly_behind' || snap.status === 'behind') {
          atRiskMap.set(co, (atRiskMap.get(co) ?? 0) + 1);
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
