// =============================================================================
// Thinkific Progress Sync (Optimized)
// =============================================================================

import { thinkificGet, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';
import { normalizeCompleted, normalizeProgressPercent } from '@/lib/utils/normalize';

const CONCURRENCY = 10;   // parallel Thinkific calls at a time
const UPSERT_BATCH = 100; // lesson_progress rows per upsert

/**
 * Run async tasks with bounded concurrency.
 */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Sync lesson-level progress for all active enrollments.
 * Optimized: parallel Thinkific calls (10 at a time), pre-loaded
 * lesson map, batched upserts, single SQL for last_active_at.
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
    let count = 0;
    let errors = 0;

    // --- Load all enrollments (unbounded, same as before) ---
    const { data: enrollments, error: enrollErr } = await db
      .from('enrollments')
      .select('id, thinkific_enrollment_id, learner_id, course_id')
      .eq('is_active', true);

    if (enrollErr || !enrollments) {
      throw new Error(`Failed to fetch enrollments: ${enrollErr?.message}`);
    }

    // --- Pre-load ALL lessons into a Map (eliminates per-lesson DB query) ---
    const { data: allLessons } = await db
      .from('lessons')
      .select('id, thinkific_lesson_id');

    const lessonMap = new Map(
      (allLessons || []).map((l) => [l.thinkific_lesson_id, l.id])
    );
    console.log(`[SyncProgress] ${enrollments.length} enrollments, ${lessonMap.size} lessons pre-loaded`);

    // --- Collect lesson_progress rows to batch-upsert ---
    const pendingUpserts: Array<Record<string, unknown>> = [];

    async function flushUpserts() {
      if (pendingUpserts.length === 0) return;
      const batch = pendingUpserts.splice(0, pendingUpserts.length);
      const { error } = await db
        .from('lesson_progress')
        .upsert(batch, { onConflict: 'learner_id,course_id,lesson_id', ignoreDuplicates: false });
      if (error) console.warn('[SyncProgress] Upsert error:', error.message);
      count += batch.length;
    }

    // --- Process enrollments with bounded concurrency ---
    await withConcurrency(enrollments, CONCURRENCY, async (enrollment) => {
      if (!enrollment.thinkific_enrollment_id) return;

      try {
        const progressData = await thinkificGet<{
          items?: Array<{
            content_id: number;
            completed: boolean;
            completed_at?: string;
            percentage_completed?: number;
            [key: string]: unknown;
          }>;
          percentage_completed?: number;
        }>(`/enrollments/${enrollment.thinkific_enrollment_id}`);

        // Update enrollment-level progress percent
        if (progressData.percentage_completed !== undefined) {
          await db
            .from('enrollments')
            .update({
              progress_percent: normalizeProgressPercent(
                progressData as unknown as Record<string, unknown>
              ),
            })
            .eq('id', enrollment.id);
        }

        // Accumulate lesson-level progress rows
        if (progressData.items) {
          for (const item of progressData.items) {
            const lessonId = lessonMap.get(String(item.content_id));
            if (!lessonId) continue;

            const raw = item as unknown as Record<string, unknown>;
            pendingUpserts.push({
              learner_id: enrollment.learner_id,
              course_id: enrollment.course_id,
              lesson_id: lessonId,
              completed: normalizeCompleted(raw),
              completed_at: item.completed_at || null,
              progress_percent: normalizeProgressPercent(raw),
              raw_payload: raw,
            });

            // Flush when batch is full
            if (pendingUpserts.length >= UPSERT_BATCH) {
              await flushUpserts();
            }
          }
        }
      } catch (err) {
        errors++;
        console.warn(
          `[SyncProgress] Error on enrollment ${enrollment.thinkific_enrollment_id}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    });

    // Flush any remaining rows
    await flushUpserts();

    // --- Update last_active_at for all learners in a single query ---
    // Uses Supabase rpc to run one UPDATE...FROM instead of N queries
    try {
      await db.rpc('update_learner_last_active');
    } catch {
      // Fallback: skip last_active_at if the RPC doesn't exist yet
      console.warn('[SyncProgress] update_learner_last_active RPC not found — skipping last_active_at update');
    }

    console.log(`[SyncProgress] Done: ${count} lesson records, ${errors} enrollment errors`);
    return count;
  });
}
