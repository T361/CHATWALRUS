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

    // Read from Supabase enrollments — no Thinkific API call needed.
    // Paginate to avoid the 1,000-row server cap (64k+ enrollments in DB).
    type EnrollmentRow = { id: string; thinkific_enrollment_id: number; learner_id: string; company_id: string; course_id: string; progress_percent: number; completed_at: string | null; is_active: boolean };
    const enrollments: EnrollmentRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from('enrollments')
        .select('id, thinkific_enrollment_id, learner_id, company_id, course_id, progress_percent, completed_at, is_active')
        .eq('is_active', true)
        .range(offset, offset + 999);
      if (error) throw new Error(`Failed to fetch enrollments at offset ${offset}: ${error.message}`);
      if (!data || data.length === 0) break;
      enrollments.push(...(data as EnrollmentRow[]));
      if (data.length < 1000) break;
    }

    if (enrollments.length === 0) return 0;

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
