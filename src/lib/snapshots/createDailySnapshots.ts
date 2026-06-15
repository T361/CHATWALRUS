// =============================================================================
// Daily Snapshot Service
// Uses enrollments.progress_percent (synced from Thinkific) as the source of
// truth for completion — lesson_progress is not populated by any sync job.
// =============================================================================

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { todayISO } from '@/lib/utils/dates';
import { safeNumber, clampPercent } from '@/lib/utils/normalize';

export async function createDailySnapshots(): Promise<number> {
  if (!isAdminConfigured()) {
    console.warn('[Snapshots] Admin client not configured.');
    return 0;
  }

  const db = createAdminClient();
  const snapshotDate = todayISO();

  // Fetch all active learners
  const { data: learners } = await db
    .from('learners')
    .select('id, company_id, last_active_at')
    .eq('is_active', true);

  if (!learners || learners.length === 0) return 0;

  const learnerIds = learners.map((l) => l.id);

  // Bulk-fetch enrollments in batches of 500 to avoid Supabase URL length limits.
  // Passing all 4k+ UUIDs at once generates a ~150k-char URL that silently returns empty.
  type Enrollment = { learner_id: string; course_id: string; progress_percent: number | null; completed_at: string | null };
  const allEnrollments: Enrollment[] = [];
  const IN_BATCH = 500;
  for (let i = 0; i < learnerIds.length; i += IN_BATCH) {
    const batch = learnerIds.slice(i, i + IN_BATCH);
    const { data } = await db
      .from('enrollments')
      .select('learner_id, course_id, progress_percent, completed_at')
      .in('learner_id', batch)
      .eq('is_active', true);
    if (data) allEnrollments.push(...data);
  }

  // Build lookup: learner_id → enrollments[]
  const enrollmentsByLearner = new Map<string, Enrollment[]>();
  for (const e of allEnrollments) {
    if (!enrollmentsByLearner.has(e.learner_id)) enrollmentsByLearner.set(e.learner_id, []);
    enrollmentsByLearner.get(e.learner_id)!.push(e);
  }

  // Build all snapshot records in memory
  const snapshotBatch: Array<Record<string, unknown>> = [];

  for (const learner of learners) {
    if (!learner.company_id) continue;

    const enrollments = enrollmentsByLearner.get(learner.id) || [];
    const progressValues = enrollments.map((e) => safeNumber(e.progress_percent));
    const avgCompletion = progressValues.length > 0
      ? clampPercent(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
      : 0;

    snapshotBatch.push({
      company_id:               learner.company_id,
      learner_id:               learner.id,
      snapshot_date:            snapshotDate,
      // lesson-level columns: set to 0 since lesson_progress is not synced
      total_lessons:            0,
      completed_lessons:        0,
      daily_lessons_completed:  0,
      cumulative_lessons_completed: 0,
      // progress comes from enrollments.progress_percent
      completion_percent:       avgCompletion,
      courses_enrolled:         enrollments.length,
      courses_completed:        enrollments.filter((e) => e.completed_at).length,
      last_active_at:           learner.last_active_at,
    });
  }

  // Batch upsert in chunks of 100
  const BATCH = 100;
  for (let i = 0; i < snapshotBatch.length; i += BATCH) {
    const { error } = await db.from('daily_snapshots').upsert(
      snapshotBatch.slice(i, i + BATCH),
      { onConflict: 'learner_id,snapshot_date' }
    );
    if (error) console.warn('[Snapshots] Batch upsert error:', error.message);
  }

  return snapshotBatch.length;
}
