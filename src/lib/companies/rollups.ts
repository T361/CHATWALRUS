import 'server-only';

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { todayISO } from '@/lib/utils/dates';
import { invalidateCachePrefix } from '@/lib/cache/serverCache';
import { withServerTiming } from '@/lib/perf';

type RollupRow = {
  company_id: string;
  learner_count: number;
  avg_progress: number;
  at_risk_count: number;
  slightly_behind_count: number;
  not_started_count: number;
  on_track_count: number;
  high_engagement_count: number;
  snapshot_date: string;
};

export async function refreshCompanySummaryRollups(companyIds?: string[]): Promise<number> {
  if (!isAdminConfigured()) return 0;

  return withServerTiming('rollups.refresh', async () => {
    const db = createAdminClient();
    const scopedCompanyIds = companyIds && companyIds.length > 0 ? new Set(companyIds) : null;

    const companies: Array<{ id: string }> = [];
    for (let offset = 0; ; offset += 1000) {
      let query = db
        .from('companies')
        .select('id')
        .eq('is_active', true)
        .order('id')
        .range(offset, offset + 999);

      if (scopedCompanyIds) {
        query = query.in('id', Array.from(scopedCompanyIds));
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;
      companies.push(...data);
      if (data.length < 1000) break;
    }

    if (companies.length === 0) return 0;

    const allChecks: Array<{
      company_id: string;
      average_completion_percent: number | null;
      not_started_count: number | null;
      slightly_behind_count: number | null;
      at_risk_count: number | null;
      on_track_count: number | null;
      high_engagement_count: number | null;
      checked_at: string | null;
    }> = [];

    for (let offset = 0; ; offset += 1000) {
      let query = db
        .from('milestone_checks')
        .select('company_id, average_completion_percent, not_started_count, slightly_behind_count, at_risk_count, on_track_count, high_engagement_count, checked_at')
        .order('checked_at', { ascending: false })
        .range(offset, offset + 999);

      if (scopedCompanyIds) {
        query = query.in('company_id', Array.from(scopedCompanyIds));
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;
      allChecks.push(...data);
      if (data.length < 1000) break;
    }

    const latestCheckByCompany = new Map<string, typeof allChecks[number]>();
    for (const check of allChecks) {
      if (!latestCheckByCompany.has(check.company_id)) {
        latestCheckByCompany.set(check.company_id, check);
      }
    }

    const rollupRows: RollupRow[] = companies.map((company) => {
      const latest = latestCheckByCompany.get(company.id);
      const notStarted = Number(latest?.not_started_count ?? 0);
      const slightlyBehind = Number(latest?.slightly_behind_count ?? 0);
      const atRisk = Number(latest?.at_risk_count ?? 0);
      const onTrack = Number(latest?.on_track_count ?? 0);
      const highEngagement = Number(latest?.high_engagement_count ?? 0);
      return {
        company_id: company.id,
        learner_count: notStarted + slightlyBehind + atRisk + onTrack + highEngagement,
        avg_progress: Number(latest?.average_completion_percent ?? 0),
        at_risk_count: atRisk,
        slightly_behind_count: slightlyBehind,
        not_started_count: notStarted,
        on_track_count: onTrack,
        high_engagement_count: highEngagement,
        snapshot_date: latest?.checked_at?.slice(0, 10) ?? todayISO(),
      };
    });

    if (rollupRows.length > 0) {
      const { error } = await db
        .from('company_summary_rollups')
        .upsert(rollupRows, { onConflict: 'company_id' });
      if (error) throw error;
    }

    invalidateCachePrefix('companies:');
    return rollupRows.length;
  }, { company_count: companyIds?.length ?? 'all' });
}
