// =============================================================================
// Assignments Sync — Derived from Supabase enrollments (no Thinkific API call)
// =============================================================================
// Thinkific doesn't expose a standalone assignments endpoint. We derive
// assignment records from the enrollments already synced into Supabase.
// This makes Import Assignments instant (no 66k enrollment pagination).

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';

const BATCH = 100;

export async function syncAssignments(): Promise<SyncResult> {
  if (!isAdminConfigured()) {
    return { syncType: 'assignments', status: 'skipped', recordsProcessed: 0, errorMessage: 'Admin DB not configured' };
  }

  return runSync('assignments', async () => {
    const db = createAdminClient();

    // Read from Supabase enrollments — no Thinkific API call needed
    const { data: enrollments, error } = await db
      .from('enrollments')
      .select('id, thinkific_enrollment_id, learner_id, company_id, course_id, progress_percent, completed_at, is_active')
      .eq('is_active', true);

    if (error) throw new Error(`Failed to fetch enrollments: ${error.message}`);
    if (!enrollments || enrollments.length === 0) return 0;

    console.log(`[SyncAssignments] Deriving assignments from ${enrollments.length} local enrollments`);

    let count = 0;
    let batch: Array<Record<string, unknown>> = [];

    for (const e of enrollments) {
      const isCompleted = !!e.completed_at;
      batch.push({
        thinkific_assignment_id: `enrollment-${e.thinkific_enrollment_id}`,
        learner_id: e.learner_id,
        company_id: e.company_id,
        course_id: e.course_id,
        submitted: isCompleted,
        submitted_at: e.completed_at || null,
        score: isCompleted ? 100 : null,
        status: isCompleted ? 'completed' : 'in_progress',
      });

      if (batch.length >= BATCH) {
        const { error: upsertErr } = await db.from('assignments').upsert(batch, {
          onConflict: 'thinkific_assignment_id',
        });
        if (upsertErr) console.warn('[SyncAssignments] Upsert error:', upsertErr.message);
        count += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const { error: upsertErr } = await db.from('assignments').upsert(batch, {
        onConflict: 'thinkific_assignment_id',
      });
      if (upsertErr) console.warn('[SyncAssignments] Final upsert error:', upsertErr.message);
      count += batch.length;
    }

    console.log(`[SyncAssignments] Done: ${count} assignment records from local enrollments`);
    return count;
  });
}
