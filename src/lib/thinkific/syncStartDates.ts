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

    for (const company of companiesWithoutDate) {
      // Find the earliest enrollment timestamp for any learner in this company
      // Uses activated_at first (when learner actually enrolled), then started_at
      const { data: earliest } = await db
        .from('enrollments')
        .select('activated_at, started_at')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .not('activated_at', 'is', null)
        .order('activated_at', { ascending: true })
        .limit(1);

      let inferredDate: string | null = null;

      if (earliest && earliest.length > 0) {
        inferredDate = earliest[0].activated_at || earliest[0].started_at || null;
      }

      // Fallback: use started_at if no activated_at exists
      if (!inferredDate) {
        const { data: fallback } = await db
          .from('enrollments')
          .select('started_at')
          .eq('company_id', company.id)
          .eq('is_active', true)
          .not('started_at', 'is', null)
          .order('started_at', { ascending: true })
          .limit(1);

        if (fallback && fallback.length > 0) {
          inferredDate = fallback[0].started_at || null;
        }
      }

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
