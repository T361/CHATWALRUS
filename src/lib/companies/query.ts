import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { readThroughTtlCache } from '@/lib/cache/serverCache';
import { withServerTiming } from '@/lib/perf';

export interface CompanyCardRow {
  id: string;
  name: string;
  slug: string;
  start_date: string | null;
  is_active: boolean;
  learner_count: number;
  avg_progress: number | null;
  at_risk_count: number;
}

export async function getCompanyCardRows(): Promise<CompanyCardRow[]> {
  return readThroughTtlCache('companies:cards', 60_000, async () => {
    return withServerTiming('companies.cards.load', async () => {
      const db = createAdminClient();
      const [{ data: companies, error: companiesError }, { data: rollups, error: rollupsError }] = await Promise.all([
        db.from('companies').select('id, name, slug, start_date, is_active').order('name'),
        db.from('company_summary_rollups').select('company_id, learner_count, avg_progress, at_risk_count'),
      ]);

      if (companiesError) throw companiesError;
      if (rollupsError) throw rollupsError;

      const rollupByCompany = new Map((rollups || []).map((row) => [row.company_id, row]));

      if ((rollups || []).length === 0 && (companies || []).length > 0) {
        const { data: checks, error: checksError } = await db
          .from('milestone_checks')
          .select('company_id, average_completion_percent, not_started_count, slightly_behind_count, at_risk_count, on_track_count, high_engagement_count, checked_at')
          .order('checked_at', { ascending: false });
        if (checksError) throw checksError;
        for (const check of checks || []) {
          if (!rollupByCompany.has(check.company_id)) {
            const learnerCount = Number(check.not_started_count ?? 0)
              + Number(check.slightly_behind_count ?? 0)
              + Number(check.at_risk_count ?? 0)
              + Number(check.on_track_count ?? 0)
              + Number(check.high_engagement_count ?? 0);
            rollupByCompany.set(check.company_id, {
              company_id: check.company_id,
              learner_count: learnerCount,
              avg_progress: check.average_completion_percent,
              at_risk_count: check.at_risk_count,
            });
          }
        }
      }

      return (companies || []).map((company) => {
        const rollup = rollupByCompany.get(company.id);
        return {
          id: company.id,
          name: company.name,
          slug: company.slug,
          start_date: company.start_date,
          is_active: company.is_active,
          learner_count: Number(rollup?.learner_count ?? 0),
          avg_progress: rollup?.avg_progress === null || rollup?.avg_progress === undefined
            ? null
            : Number(rollup.avg_progress),
          at_risk_count: Number(rollup?.at_risk_count ?? 0),
        };
      });
    });
  });
}
