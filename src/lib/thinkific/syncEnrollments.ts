// =============================================================================
// Thinkific Enrollment Sync (Optimized)
// =============================================================================

import { thinkificPaginateFast, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';
import { safeNumber, clampPercent } from '@/lib/utils/normalize';

interface ThinkificEnrollment {
  id: number;
  user_id: number;
  course_id: number;
  percentage_completed: number;
  started_at: string;
  completed_at: string | null;
  expired: boolean;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Sync enrollments from Thinkific to Supabase.
 * Optimized: pre-loads all learners and courses into memory maps,
 * then batch-upserts enrollments in chunks of 100.
 */
export async function syncEnrollments(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'enrollments', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('enrollments', async () => {
    const db = createAdminClient();

    // Pre-load ALL learners and courses into memory for O(1) lookups
    // Paginate learners — Supabase server-side max-rows cap is 1,000 per request
    const allLearners: Array<{ id: string; thinkific_user_id: string; company_id: string }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db.from('learners').select('id, thinkific_user_id, company_id').range(offset, offset + 999);
      if (!data || data.length === 0) break;
      allLearners.push(...data);
      if (data.length < 1000) break;
    }
    const learnerMap = new Map(
      allLearners.map((l) => [l.thinkific_user_id, { id: l.id, company_id: l.company_id }])
    );
    console.log(`[SyncEnrollments] Pre-loaded ${learnerMap.size} learners`);

    const allCourses: Array<{ id: string; thinkific_course_id: string }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: page } = await db
        .from('courses')
        .select('id, thinkific_course_id')
        .range(offset, offset + 999);
      if (!page || page.length === 0) break;
      allCourses.push(...page);
      if (page.length < 1000) break;
    }
    const courseMap = new Map(
      allCourses.map((c) => [c.thinkific_course_id, c.id])
    );
    console.log(`[SyncEnrollments] Pre-loaded ${courseMap.size} courses`);

    // Paginate enrollments from Thinkific
    const enrollments = await thinkificPaginateFast<ThinkificEnrollment>('/enrollments');
    console.log(`[SyncEnrollments] Fetched ${enrollments.length} enrollments from Thinkific`);

    let count = 0;
    let skipped = 0;
    const batchSize = 100;
    let batch: Array<Record<string, unknown>> = [];

    for (const enrollment of enrollments) {
      const learner = learnerMap.get(String(enrollment.user_id));
      const courseId = courseMap.get(String(enrollment.course_id));

      if (!learner || !courseId) {
        skipped++;
        continue;
      }

      // Thinkific returns percentage_completed as a 0–1 decimal fraction — multiply by 100
      const progressPercent = clampPercent(safeNumber(enrollment.percentage_completed) * 100);

      batch.push({
        thinkific_enrollment_id: String(enrollment.id),
        company_id: learner.company_id,
        learner_id: learner.id,
        course_id: courseId,
        progress_percent: progressPercent,
        started_at: enrollment.started_at || null,
        completed_at: enrollment.completed_at || null,
        expires_at: enrollment.expiry_date || null,
        is_active: !enrollment.expired,
      });

      // Flush batch
      if (batch.length >= batchSize) {
        const { error } = await db.from('enrollments').upsert(batch, {
          onConflict: 'thinkific_enrollment_id',
        });
        if (error) {
          console.warn(`[SyncEnrollments] Batch upsert error:`, error.message);
        }
        count += batch.length;
        batch = [];
        // Log progress every 1000 records
        if (count % 1000 === 0) {
          console.log(`[SyncEnrollments] Processed ${count}/${enrollments.length}...`);
        }
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      const { error } = await db.from('enrollments').upsert(batch, {
        onConflict: 'thinkific_enrollment_id',
      });
      if (error) console.warn(`[SyncEnrollments] Final batch error:`, error.message);
      count += batch.length;
    }

    console.log(`[SyncEnrollments] Done: ${count} synced, ${skipped} skipped`);

    // Update last_active_at for all learners derived from enrollment activity
    try {
      await db.rpc('update_learner_last_active');
    } catch {
      console.warn('[SyncEnrollments] update_learner_last_active RPC not found — skipping');
    }

    return count;
  });
}
