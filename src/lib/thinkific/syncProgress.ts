// =============================================================================
// Thinkific Progress Sync
// =============================================================================

import { thinkificGet, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';
import { normalizeCompleted, normalizeProgressPercent } from '@/lib/utils/normalize';

/**
 * Sync lesson-level progress for all enrollments.
 * This pulls detailed completion data per lesson per learner.
 */
export async function syncProgress(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'progress', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('progress', async () => {
    const db = createAdminClient();
    let count = 0;

    // Get all active enrollments
    const { data: enrollments, error } = await db
      .from('enrollments')
      .select('id, thinkific_enrollment_id, learner_id, course_id')
      .eq('is_active', true);

    if (error || !enrollments) {
      throw new Error(`Failed to fetch enrollments: ${error?.message}`);
    }

    for (const enrollment of enrollments) {
      if (!enrollment.thinkific_enrollment_id) continue;

      try {
        // TODO: Exact Thinkific endpoint for lesson progress may vary.
        // Possible endpoints:
        //   GET /enrollments/{id}/progress
        //   GET /course_progress?user_id=X&course_id=Y
        //   GET /chapters/contents/{id}/completions
        // Implementing the most common pattern:
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

        // Update enrollment-level progress
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

        // Update lesson-level progress if available
        if (progressData.items) {
          for (const item of progressData.items) {
            // Find internal lesson ID
            const { data: lesson } = await db
              .from('lessons')
              .select('id')
              .eq('thinkific_lesson_id', String(item.content_id))
              .single();

            if (!lesson) continue;

            const raw = item as unknown as Record<string, unknown>;
            const completed = normalizeCompleted(raw);
            const progressPercent = normalizeProgressPercent(raw);

            await db.from('lesson_progress').upsert(
              {
                learner_id: enrollment.learner_id,
                course_id: enrollment.course_id,
                lesson_id: lesson.id,
                completed,
                completed_at: item.completed_at || null,
                progress_percent: progressPercent,
                raw_payload: raw,
              },
              { onConflict: 'learner_id,course_id,lesson_id', ignoreDuplicates: false }
            );
            count++;
          }
        }
      } catch (err) {
        console.warn(
          `[SyncProgress] Error syncing enrollment ${enrollment.thinkific_enrollment_id}:`,
          err
        );
      }
    }

    // Update learner last_active_at based on latest lesson progress
    const { data: learners } = await db
      .from('learners')
      .select('id')
      .eq('is_active', true);

    if (learners) {
      for (const learner of learners) {
        const { data: latestProgress } = await db
          .from('lesson_progress')
          .select('completed_at, viewed_at')
          .eq('learner_id', learner.id)
          .order('completed_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .single();

        if (latestProgress) {
          const lastActive = latestProgress.completed_at || latestProgress.viewed_at;
          if (lastActive) {
            await db
              .from('learners')
              .update({ last_active_at: lastActive })
              .eq('id', learner.id);
          }
        }
      }
    }

    return count;
  });
}
