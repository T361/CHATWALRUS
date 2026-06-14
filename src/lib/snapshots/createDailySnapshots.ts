// =============================================================================
// Daily Snapshot Service (Optimized)
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

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().split('T')[0];

  // Fetch all active learners
  const { data: learners } = await db
    .from('learners')
    .select('id, company_id, last_active_at')
    .eq('is_active', true);

  if (!learners || learners.length === 0) return 0;

  const learnerIds = learners.map((l) => l.id);

  // Bulk-fetch all active enrollments for these learners
  const { data: allEnrollments } = await db
    .from('enrollments')
    .select('learner_id, course_id, completed_at')
    .in('learner_id', learnerIds)
    .eq('is_active', true);

  // Bulk-fetch completed lesson counts per learner
  const { data: lessonProgressRows } = await db
    .from('lesson_progress')
    .select('learner_id')
    .in('learner_id', learnerIds)
    .eq('completed', true);

  // Bulk-fetch total lessons per course
  const allCourseIds = [...new Set((allEnrollments || []).map((e) => e.course_id))];
  const { data: lessonCountRows } = allCourseIds.length > 0
    ? await db.from('lessons').select('course_id').in('course_id', allCourseIds)
    : { data: [] as Array<{ course_id: string }> };

  // Bulk-fetch yesterday's snapshots for delta calculation
  const { data: prevSnapshots } = await db
    .from('daily_snapshots')
    .select('learner_id, cumulative_lessons_completed')
    .in('learner_id', learnerIds)
    .eq('snapshot_date', yesterdayISO);

  // Build lookup Maps
  const enrollmentsByLearner = new Map<string, Array<{ course_id: string; completed_at: string | null }>>();
  for (const e of allEnrollments || []) {
    if (!enrollmentsByLearner.has(e.learner_id)) enrollmentsByLearner.set(e.learner_id, []);
    enrollmentsByLearner.get(e.learner_id)!.push(e);
  }

  const completedLessonsByLearner = new Map<string, number>();
  for (const row of lessonProgressRows || []) {
    completedLessonsByLearner.set(row.learner_id, (completedLessonsByLearner.get(row.learner_id) ?? 0) + 1);
  }

  const totalLessonsByCourse = new Map<string, number>();
  for (const row of lessonCountRows || []) {
    totalLessonsByCourse.set(row.course_id, (totalLessonsByCourse.get(row.course_id) ?? 0) + 1);
  }

  const prevCumulativeByLearner = new Map<string, number>();
  for (const snap of prevSnapshots || []) {
    prevCumulativeByLearner.set(snap.learner_id, safeNumber(snap.cumulative_lessons_completed));
  }

  // Build all snapshot records in memory — zero per-learner DB queries
  const snapshotBatch: Array<Record<string, unknown>> = [];

  for (const learner of learners) {
    if (!learner.company_id) continue;

    const enrollments = enrollmentsByLearner.get(learner.id) || [];
    const cumulative = completedLessonsByLearner.get(learner.id) ?? 0;
    const prevCumulative = prevCumulativeByLearner.get(learner.id) ?? 0;
    const daily = Math.max(0, cumulative - prevCumulative);
    const total = enrollments.reduce((sum, e) => sum + (totalLessonsByCourse.get(e.course_id) ?? 0), 0);
    const completionPercent = total > 0 ? clampPercent((cumulative / total) * 100) : 0;

    snapshotBatch.push({
      company_id: learner.company_id,
      learner_id: learner.id,
      snapshot_date: snapshotDate,
      total_lessons: total,
      completed_lessons: cumulative,
      daily_lessons_completed: daily,
      cumulative_lessons_completed: cumulative,
      completion_percent: completionPercent,
      courses_enrolled: enrollments.length,
      courses_completed: enrollments.filter((e) => e.completed_at).length,
      last_active_at: learner.last_active_at,
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
