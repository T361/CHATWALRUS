// =============================================================================
// Auto-detect company start dates from earliest enrollment activity
// =============================================================================
// For companies with no start_date set, infer it from the earliest
// enrollment.activated_at / started_at across all learners in that company.
// This is called after enrollment sync so the data is fresh.

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import type { SyncResult } from './syncCore';

export async function syncStartDates(): Promise<SyncResult> {
  if (!isAdminConfigured()) {
    return { syncType: 'start_dates', status: 'skipped', recordsProcessed: 0, errorMessage: 'Admin client not configured' };
  }

  const db = createAdminClient();
  let updated = 0;

  try {
    // Find all active companies with no start_date
    const companiesWithoutDate: Array<{ id: string; name: string }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: page } = await db
        .from('companies')
        .select('id, name')
        .eq('is_active', true)
        .is('start_date', null)
        .range(offset, offset + 999);
      if (!page || page.length === 0) break;
      companiesWithoutDate.push(...page);
      if (page.length < 1000) break;
    }

    if (companiesWithoutDate.length === 0) {
      return { syncType: 'start_dates', status: 'success', recordsProcessed: 0 };
    }

    console.log(`[SyncStartDates] ${companiesWithoutDate.length} companies need start_date inference`);

    // Batch: fetch the earliest enrollment date per company in one query
    const companyIds = companiesWithoutDate.map((c) => c.id);
    const earliestByCompany = new Map<string, string>();

    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('enrollments')
        .select('company_id, activated_at, started_at')
        .in('company_id', companyIds)
        .eq('is_active', true)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const e of data) {
        const ts = e.activated_at || e.started_at;
        if (!ts) continue;
        const existing = earliestByCompany.get(e.company_id);
        if (!existing || ts < existing) earliestByCompany.set(e.company_id, ts);
      }
      if (data.length < 1000) break;
    }

    for (const company of companiesWithoutDate) {
      const inferredDate = earliestByCompany.get(company.id) ?? null;

      if (!inferredDate) {
        console.log(`[SyncStartDates] No enrollment data for ${company.name} — skipping`);
        continue;
      }

      // Store only the date portion (YYYY-MM-DD)
      const dateOnly = inferredDate.slice(0, 10);

      const { error } = await db
        .from('companies')
        .update({ start_date: dateOnly })
        .eq('id', company.id)
        .is('start_date', null); // guard: only update if still null

      if (error) {
        console.warn(`[SyncStartDates] Failed to update ${company.name}: ${error.message}`);
      } else {
        console.log(`[SyncStartDates] Set start_date=${dateOnly} for ${company.name}`);
        updated++;
      }
    }

    return { syncType: 'start_dates', status: 'success', recordsProcessed: updated };
  } catch (error) {
    return {
      syncType: 'start_dates',
      status: 'error',
      recordsProcessed: updated,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
