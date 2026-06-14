// =============================================================================
// Thinkific Assignments Sync
// =============================================================================
// Syncs quiz/assessment data from Thinkific enrollments.
// Thinkific doesn't have a dedicated "assignments" API — quizzes and
// assignments are embedded inside course content (lessons of type quiz/survey).
// We extract completion data from enrollment progress as a proxy.

import { thinkificPaginate, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';

interface ThinkificEnrollment {
  id: number;
  user_id: number;
  user_email: string;
  course_id: number;
  course_name: string;
  percentage_completed: string | number;
  completed: boolean;
  completed_at: string | null;
  started_at: string | null;
  activated_at: string | null;
  updated_at: string | null;
}

/**
 * Sync assignment/quiz completion data from Thinkific enrollments.
 * Since Thinkific doesn't expose a standalone assignments endpoint,
 * we derive assignment records from enrollment completion data —
 * each completed enrollment represents a "submitted" assignment.
 */
export async function syncAssignments(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'assignments', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('assignments', async () => {
    const db = createAdminClient();
    let count = 0;

    // Fetch completed enrollments from Thinkific
    const enrollments = await thinkificPaginate<ThinkificEnrollment>(
      '/enrollments',
      { 'completed': 'true' }
    );

    // Batch: pre-load all learners and courses for fast lookup
    const { data: allLearners } = await db
      .from('learners')
      .select('id, thinkific_user_id, company_id');
    const learnerMap = new Map(
      (allLearners || []).map((l) => [l.thinkific_user_id, { id: l.id, company_id: l.company_id }])
    );

    const { data: allCourses } = await db
      .from('courses')
      .select('id, thinkific_course_id');
    const courseMap = new Map(
      (allCourses || []).map((c) => [c.thinkific_course_id, c.id])
    );

    // Process in batches of 50
    const batchSize = 50;
    const records: Array<Record<string, unknown>> = [];

    for (const enrollment of enrollments) {
      const learner = learnerMap.get(String(enrollment.user_id));
      const courseId = courseMap.get(String(enrollment.course_id));
      if (!learner || !courseId) continue;

      records.push({
        thinkific_assignment_id: `enrollment-${enrollment.id}`,
        learner_id: learner.id,
        company_id: learner.company_id || null,
        course_id: courseId,
        submitted: enrollment.completed,
        submitted_at: enrollment.completed_at,
        score: enrollment.completed ? 100 : null,
        status: enrollment.completed ? 'completed' : 'in_progress',
      });

      // Flush batch
      if (records.length >= batchSize) {
        const { error } = await db.from('assignments').upsert(records, {
          onConflict: 'thinkific_assignment_id',
        });
        if (error) console.warn('[AssignmentSync] Batch upsert error:', error.message);
        count += records.length;
        records.length = 0;
      }
    }

    // Flush remaining
    if (records.length > 0) {
      const { error } = await db.from('assignments').upsert(records, {
        onConflict: 'thinkific_assignment_id',
      });
      if (error) console.warn('[AssignmentSync] Final batch error:', error.message);
      count += records.length;
    }

    return count;
  });
}
