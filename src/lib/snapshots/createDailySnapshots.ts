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

  // Paginate learners in chunks of 1,000 — Supabase has a server-side max-rows
  // cap of 1,000 per request; .limit(N) alone cannot exceed it.
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
  const learners = allLearners;
  if (!learners || learners.length === 0) return 0;

  const learnerIds = learners.map((l) => l.id);

  // Fetch enrollments by company to avoid .in(learnerIds) URL length limits entirely.
  // Even batching 500 UUIDs generates ~18k-char URLs that exceed Supabase limits.
  // Querying per-company with eq('company_id') has no URL size issue.
  type Enrollment = { learner_id: string; course_id: string; progress_percent: number | null; completed_at: string | null };
  const allEnrollments: Enrollment[] = [];
  const companyIds = [...new Set(learners.filter(l => l.company_id).map(l => l.company_id as string))];
  for (const companyId of companyIds) {
    const { data } = await db
      .from('enrollments')
      .select('learner_id, course_id, progress_percent, completed_at')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .limit(50000);
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
