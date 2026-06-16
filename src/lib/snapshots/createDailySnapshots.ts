// =============================================================================
// Daily Snapshot Service
//
// Completion source priority:
//   1. lesson_progress table (lesson-level "completed" boolean) — accurate:
//      only fully-watched videos/completed lessons count, per the brief.
//   2. enrollments.progress_percent (Thinkific's rolled-up %) — fallback
//      for learners who haven't had their lesson_progress synced yet.
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

  // ── Load all active learners ──
  type LearnerRow = { id: string; company_id: string | null; last_active_at: string | null };
  const allLearners: LearnerRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('learners')
      .select('id, company_id, last_active_at')
      .eq('is_active', true)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allLearners.push(...data);
    if (data.length < 1000) break;
  }
  if (allLearners.length === 0) return 0;

  const companyIds = [...new Set(allLearners.filter(l => l.company_id).map(l => l.company_id as string))];

  // ── Load all enrollments by company (avoids large .in() on learner IDs) ──
  type Enrollment = {
    learner_id: string;
    course_id: string;
    progress_percent: number | null;
    completed_at: string | null;
  };
  const enrollmentsByLearner = new Map<string, Enrollment[]>();
  const courseTotalLessons = new Map<string, number>(); // course_id → total_lessons

  for (const companyId of companyIds) {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('enrollments')
        .select('learner_id, course_id, progress_percent, completed_at, courses(total_lessons)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const e of data as unknown as Array<Enrollment & { courses: { total_lessons: number } | null }>) {
        if (!enrollmentsByLearner.has(e.learner_id)) enrollmentsByLearner.set(e.learner_id, []);
        enrollmentsByLearner.get(e.learner_id)!.push(e);
        if (e.courses?.total_lessons && !courseTotalLessons.has(e.course_id)) {
          courseTotalLessons.set(e.course_id, e.courses.total_lessons);
        }
      }
      if (data.length < 1000) break;
    }
  }

  // ── Load lesson_progress counts per learner ──
  // Query in batches of 100 learners to avoid URL length limits
  // Maps: learner_id → completed_lesson_count
  const completedLessonsByLearner = new Map<string, number>();
  const learnerIds = allLearners.map(l => l.id);

  for (let i = 0; i < learnerIds.length; i += 100) {
    const chunk = learnerIds.slice(i, i + 100);
    // Count completed lessons per learner in this batch
    const { data } = await db
      .from('lesson_progress')
      .select('learner_id')
      .in('learner_id', chunk)
      .eq('completed', true);
    if (data) {
      for (const row of data) {
        completedLessonsByLearner.set(
          row.learner_id,
          (completedLessonsByLearner.get(row.learner_id) ?? 0) + 1
        );
      }
    }
  }

  const learnersWithLessonData = completedLessonsByLearner.size;
  console.log(`[Snapshots] ${learnersWithLessonData} learners have lesson_progress data`);

  // ── Build snapshot records ──
  const snapshotBatch: Array<Record<string, unknown>> = [];

  for (const learner of allLearners) {
    if (!learner.company_id) continue;

    const enrollments = enrollmentsByLearner.get(learner.id) || [];
    const coursesEnrolled = enrollments.length;
    const coursesCompleted = enrollments.filter(e => e.completed_at).length;

    let completionPercent: number;
    let totalLessons = 0;
    let completedLessons = 0;

    if (completedLessonsByLearner.has(learner.id)) {
      // Source 1: lesson_progress — count-based, accurate
      completedLessons = completedLessonsByLearner.get(learner.id) ?? 0;
      totalLessons = enrollments.reduce(
        (sum, e) => sum + (courseTotalLessons.get(e.course_id) ?? 0),
        0
      );
      completionPercent = totalLessons > 0
        ? clampPercent((completedLessons / totalLessons) * 100)
        : 0;
    } else {
      // Source 2: enrollment percentage fallback
      const progressValues = enrollments.map(e => safeNumber(e.progress_percent));
      completionPercent = progressValues.length > 0
        ? clampPercent(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
        : 0;
    }

    snapshotBatch.push({
      company_id:                  learner.company_id,
      learner_id:                  learner.id,
      snapshot_date:               snapshotDate,
      completion_percent:          completionPercent,
      courses_enrolled:            coursesEnrolled,
      courses_completed:           coursesCompleted,
      total_lessons:               totalLessons || null,
      completed_lessons:           completedLessons || null,
      last_active_at:              learner.last_active_at,
    });
  }

  // ── Batch upsert in chunks of 100 ──
  const BATCH = 100;
  for (let i = 0; i < snapshotBatch.length; i += BATCH) {
    const { error } = await db.from('daily_snapshots').upsert(
      snapshotBatch.slice(i, i + BATCH),
      { onConflict: 'learner_id,snapshot_date' }
    );
    if (error) console.warn('[Snapshots] Batch upsert error:', error.message);
  }

  console.log(`[Snapshots] ${snapshotBatch.length} snapshots written (${learnersWithLessonData} from lesson data, ${snapshotBatch.length - learnersWithLessonData} from enrollment %)`);
  return snapshotBatch.length;
}
