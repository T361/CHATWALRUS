// =============================================================================
// Thinkific Progress Sync (Optimized)
// =============================================================================
// Refreshes enrollment-level progress percentages from Thinkific.
// Uses parallel page fetching (10 concurrent) to handle 66k+ enrollments
// within Vercel's 300s function timeout (~60s vs 609s sequential).

import { thinkificPaginateFast, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';
import { safeNumber, clampPercent } from '@/lib/utils/normalize';

interface ThinkificEnrollment {
  id: number;
  user_id: number;
  course_id: number;
  percentage_completed: string | number;
  completed_at: string | null;
  updated_at: string | null;
}

const UPSERT_BATCH = 100;

/**
 * Sync enrollment progress percentages from Thinkific.
 * Uses parallel pagination (10 pages at once) — no per-enrollment API calls.
 */
export async function syncProgress(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return {
      syncType: 'progress',
      status: 'skipped',
      recordsProcessed: 0,
      errorMessage: 'Thinkific not configured',
    };
  }

  return runSync('progress', async () => {
    const db = createAdminClient();

    console.log('[SyncProgress] Fetching all enrollments in parallel...');
    const enrollments = await thinkificPaginateFast<ThinkificEnrollment>('/enrollments');
    console.log(`[SyncProgress] Fetched ${enrollments.length} enrollments`);

    let count = 0;
    let batch: Array<Record<string, unknown>> = [];

    for (const enrollment of enrollments) {
      const progressPercent = clampPercent(safeNumber(enrollment.percentage_completed) * 100);

      batch.push({
        thinkific_enrollment_id: String(enrollment.id),
        progress_percent: progressPercent,
        completed_at: enrollment.completed_at || null,
      });

      if (batch.length >= UPSERT_BATCH) {
        const { error } = await db.from('enrollments').upsert(batch, {
          onConflict: 'thinkific_enrollment_id',
        });
        if (error) console.warn('[SyncProgress] Upsert error:', error.message);
        count += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const { error } = await db.from('enrollments').upsert(batch, {
        onConflict: 'thinkific_enrollment_id',
      });
      if (error) console.warn('[SyncProgress] Final upsert error:', error.message);
      count += batch.length;
    }

    // Update last_active_at for all learners in a single SQL call
    try {
      await db.rpc('update_learner_last_active');
    } catch {
      console.warn('[SyncProgress] update_learner_last_active RPC not found — skipping');
    }

    console.log(`[SyncProgress] Done: ${count} enrollment records updated`);
    return count;
  });
}
