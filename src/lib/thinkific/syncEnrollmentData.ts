// =============================================================================
// Combined Enrollment Data Sync
// =============================================================================
// One pagination pass over Thinkific's /enrollments endpoint to update:
//   - enrollments table (upsert with latest progress %)
//   - assignments table (completed enrollments as assignment records)
//
// Replaces running syncEnrollments + syncProgress + syncAssignments separately,
// which would paginate 66k records three times (~180s). One pass = ~60s.

import { thinkificPaginateFast, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';
import { safeNumber, clampPercent } from '@/lib/utils/normalize';

interface ThinkificEnrollment {
  id: number;
  user_id: number;
  course_id: number;
  percentage_completed: string | number;
  completed: boolean;
  completed_at: string | null;
  started_at: string | null;
  activated_at: string | null;
  updated_at: string | null;
  expired: boolean;
  expiry_date: string | null;
}

const BATCH = 100;

export async function syncEnrollmentData(): Promise<{ enrollments: SyncResult; assignments: SyncResult }> {
  if (!isThinkificConfigured()) {
    const skipped: SyncResult = { syncType: 'enrollments', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
    return { enrollments: skipped, assignments: { ...skipped, syncType: 'assignments' } };
  }

  const db = createAdminClient();

  // Pre-load learner and course maps once
  const { data: allLearners } = await db.from('learners').select('id, thinkific_user_id, company_id');
  const learnerMap = new Map((allLearners || []).map((l) => [l.thinkific_user_id, { id: l.id, company_id: l.company_id }]));

  const { data: allCourses } = await db.from('courses').select('id, thinkific_course_id');
  const courseMap = new Map((allCourses || []).map((c) => [c.thinkific_course_id, c.id]));

  console.log(`[SyncEnrollmentData] ${learnerMap.size} learners, ${courseMap.size} courses pre-loaded`);

  // Single pagination pass over all enrollments
  const enrollments = await thinkificPaginateFast<ThinkificEnrollment>('/enrollments');
  console.log(`[SyncEnrollmentData] ${enrollments.length} enrollments fetched`);

  let enrollmentCount = 0;
  let assignmentCount = 0;
  let skipped = 0;

  const enrollmentBatch: Array<Record<string, unknown>> = [];
  const assignmentBatch: Array<Record<string, unknown>> = [];

  async function flushEnrollments() {
    if (!enrollmentBatch.length) return;
    const rows = enrollmentBatch.splice(0);
    const { error } = await db.from('enrollments').upsert(rows, { onConflict: 'thinkific_enrollment_id' });
    if (error) console.warn('[SyncEnrollmentData] Enrollment upsert error:', error.message);
    enrollmentCount += rows.length;
  }

  async function flushAssignments() {
    if (!assignmentBatch.length) return;
    const rows = assignmentBatch.splice(0);
    const { error } = await db.from('assignments').upsert(rows, { onConflict: 'thinkific_assignment_id' });
    if (error) console.warn('[SyncEnrollmentData] Assignment upsert error:', error.message);
    assignmentCount += rows.length;
  }

  for (const e of enrollments) {
    const learner = learnerMap.get(String(e.user_id));
    const courseId = courseMap.get(String(e.course_id));

    if (!learner || !courseId) {
      skipped++;
      continue;
    }

    // Thinkific returns percentage_completed as a 0–1 decimal fraction — multiply by 100
    const progressPercent = clampPercent(safeNumber(e.percentage_completed) * 100);

    // Enrollment record
    enrollmentBatch.push({
      thinkific_enrollment_id: String(e.id),
      company_id: learner.company_id,
      learner_id: learner.id,
      course_id: courseId,
      progress_percent: progressPercent,
      started_at: e.started_at || null,
      completed_at: e.completed_at || null,
      expires_at: e.expiry_date || null,
      is_active: !e.expired,
    });

    // Assignment record (every enrollment = an assignment, completed or in-progress)
    assignmentBatch.push({
      thinkific_assignment_id: `enrollment-${e.id}`,
      learner_id: learner.id,
      company_id: learner.company_id,
      course_id: courseId,
      submitted: e.completed,
      submitted_at: e.completed_at || null,
      score: e.completed ? 100 : null,
      status: e.completed ? 'completed' : 'in_progress',
    });

    if (enrollmentBatch.length >= BATCH) await flushEnrollments();
    if (assignmentBatch.length >= BATCH) await flushAssignments();
  }

  await flushEnrollments();
  await flushAssignments();

  // Update last_active_at in a single SQL call
  try {
    await db.rpc('update_learner_last_active');
  } catch {
    console.warn('[SyncEnrollmentData] update_learner_last_active RPC not found — skipping');
  }

  console.log(`[SyncEnrollmentData] Done: ${enrollmentCount} enrollments, ${assignmentCount} assignments, ${skipped} skipped`);

  return {
    enrollments: { syncType: 'enrollments', status: 'success', recordsProcessed: enrollmentCount },
    assignments: { syncType: 'assignments', status: 'success', recordsProcessed: assignmentCount },
  };
}
