// =============================================================================
// Daily Snapshot Service
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
  let count = 0;

  const { data: learners } = await db
    .from('learners')
    .select('id, company_id, last_active_at')
    .eq('is_active', true);

  if (!learners) return 0;

  for (const learner of learners) {
    if (!learner.company_id) continue;

    // Get enrollment data
    const { data: enrollments } = await db
      .from('enrollments')
      .select('course_id, progress_percent, completed_at')
      .eq('learner_id', learner.id)
      .eq('is_active', true);

    // Get total and completed lessons
    const { count: totalLessons } = await db
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .in('course_id', (enrollments || []).map((e) => e.course_id));

    const { count: completedLessons } = await db
      .from('lesson_progress')
      .select('*', { count: 'exact', head: true })
      .eq('learner_id', learner.id)
      .eq('completed', true);

    // Get yesterday's snapshot for daily delta
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString().split('T')[0];

    const { data: prevSnapshot } = await db
      .from('daily_snapshots')
      .select('cumulative_lessons_completed')
      .eq('learner_id', learner.id)
      .eq('snapshot_date', yesterdayISO)
      .single();

    const cumulative = safeNumber(completedLessons);
    const prevCumulative = safeNumber(prevSnapshot?.cumulative_lessons_completed);
    const daily = Math.max(0, cumulative - prevCumulative);
    const total = safeNumber(totalLessons);
    const completionPercent = total > 0 ? clampPercent((cumulative / total) * 100) : 0;

    const coursesEnrolled = enrollments?.length ?? 0;
    const coursesCompleted = enrollments?.filter((e) => e.completed_at).length ?? 0;

    await db.from('daily_snapshots').upsert(
      {
        company_id: learner.company_id,
        learner_id: learner.id,
        snapshot_date: snapshotDate,
        total_lessons: total,
        completed_lessons: cumulative,
        daily_lessons_completed: daily,
        cumulative_lessons_completed: cumulative,
        completion_percent: completionPercent,
        courses_enrolled: coursesEnrolled,
        courses_completed: coursesCompleted,
        last_active_at: learner.last_active_at,
      },
      { onConflict: 'learner_id,snapshot_date' }
    );
    count++;
  }

  return count;
}
