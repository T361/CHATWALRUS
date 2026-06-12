// =============================================================================
// Thinkific Enrollment Sync
// =============================================================================

import { thinkificPaginate, isThinkificConfigured } from './client';
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
 */
export async function syncEnrollments(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'enrollments', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('enrollments', async () => {
    const enrollments = await thinkificPaginate<ThinkificEnrollment>('/enrollments');
    const db = createAdminClient();
    let count = 0;

    for (const enrollment of enrollments) {
      // Look up internal learner ID
      const { data: learner } = await db
        .from('learners')
        .select('id, company_id')
        .eq('thinkific_user_id', String(enrollment.user_id))
        .single();

      if (!learner) {
        console.warn(`[SyncEnrollments] Learner not found for Thinkific user ${enrollment.user_id}`);
        continue;
      }

      // Look up internal course ID
      const { data: course } = await db
        .from('courses')
        .select('id')
        .eq('thinkific_course_id', String(enrollment.course_id))
        .single();

      if (!course) {
        console.warn(`[SyncEnrollments] Course not found for Thinkific course ${enrollment.course_id}`);
        continue;
      }

      const progressPercent = clampPercent(safeNumber(enrollment.percentage_completed));

      await db.from('enrollments').upsert(
        {
          thinkific_enrollment_id: String(enrollment.id),
          company_id: learner.company_id,
          learner_id: learner.id,
          course_id: course.id,
          progress_percent: progressPercent,
          started_at: enrollment.started_at || null,
          completed_at: enrollment.completed_at || null,
          expires_at: enrollment.expiry_date || null,
          is_active: !enrollment.expired,
        },
        { onConflict: 'thinkific_enrollment_id' }
      );
      count++;
    }

    return count;
  });
}
