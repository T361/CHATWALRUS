// =============================================================================
// Lesson Progress Sync
// Calls Thinkific GET /course_progress per enrollment to get lesson-level
// completion data. Runs INCREMENTALLY: skips enrollments that haven't changed
// since the last successful run and already have progress records.
//
// Performance profile (example: 2342 learners × 5 courses):
//   ~11k API calls total. At 3 concurrent workers + 500ms inter-batch delay:
//   ~60-90 min for a full first run. Subsequent runs are much faster because
//   completed enrollments are skipped. Scheduled weekly (not daily).
// =============================================================================

import { thinkificPaginate, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';
import { safeNumber } from '@/lib/utils/normalize';

interface ThinkificProgressItem {
  id: number;
  content_id: number;       // = thinkific_lesson_id in our lessons table
  completed: boolean;
  percent_completed: number;
  created_at: string | null;
  updated_at: string | null;
}

// 3 concurrent Thinkific requests — conservative to avoid hitting rate limits
// Thinkific rate limit: ~120 req/min. 3 workers × ~1s per call ≈ 3 req/sec = 180/min.
// Inter-batch delay keeps us from bursting above that.
const CONCURRENCY = 3;
const BATCH_SIZE = 30;
const INTER_BATCH_DELAY_MS = 500;

type EnrollmentToSync = {
  thinkific_enrollment_id: string;
  learner_id: string;
  company_id: string;
  course_id: string;
  thinkific_user_id: string;
  thinkific_course_id: string;
  progress_percent: number;
  updated_at: string | null;
};

export type LessonProgressChunkResult = {
  status: 'success' | 'error' | 'skipped';
  recordsProcessed: number;
  total: number;
  nextOffset: number;
  done: boolean;
  errorMessage?: string;
};

// Processes a slice of enrollments — safe for 60-second Vercel Hobby limit.
// Each chunk handles ~20 enrollments (~25s). The client loops until done=true.
export async function syncLessonProgressChunk(opts: {
  offset: number;
  limit: number;
}): Promise<LessonProgressChunkResult> {
  if (!isThinkificConfigured()) {
    return { status: 'skipped', recordsProcessed: 0, total: 0, nextOffset: 0, done: true, errorMessage: 'Thinkific not configured' };
  }

  const db = createAdminClient();

  try {
    // 1. Load lesson map (DB only — fast)
    const lessonMap = new Map<string, { id: string; lesson_type: string | null; is_video: boolean }>();
    for (let off = 0; ; off += 1000) {
      const { data } = await db.from('lessons').select('id, thinkific_lesson_id, lesson_type, is_video').range(off, off + 999);
      if (!data || data.length === 0) break;
      for (const l of data) lessonMap.set(String(l.thinkific_lesson_id), { id: l.id, lesson_type: l.lesson_type, is_video: l.is_video });
      if (data.length < 1000) break;
    }

    // 2. Last successful sync time
    const { data: lastLog } = await db.from('sync_logs').select('completed_at').eq('sync_type', 'lesson_progress').eq('status', 'success').order('completed_at', { ascending: false }).limit(1).single();
    const lastSyncAt: string | null = lastLog?.completed_at ?? null;

    // 3. Learners that already have progress
    const learnersWithProgress = new Set<string>();
    for (let off = 0; ; off += 1000) {
      const { data } = await db.from('lesson_progress').select('learner_id').range(off, off + 999);
      if (!data || data.length === 0) break;
      data.forEach(r => learnersWithProgress.add(r.learner_id));
      if (data.length < 1000) break;
    }

    // 4. Build full toSync list (same logic as syncLessonProgress), sorted stably
    type RawEnrollment = { thinkific_enrollment_id: string; learner_id: string; company_id: string; course_id: string; progress_percent: number; updated_at: string | null; learners: { thinkific_user_id: string } | null; courses: { thinkific_course_id: string } | null; };
    const toSync: EnrollmentToSync[] = [];
    for (let off = 0; ; off += 1000) {
      const { data } = await db.from('enrollments').select('thinkific_enrollment_id, learner_id, company_id, course_id, progress_percent, updated_at, learners(thinkific_user_id), courses(thinkific_course_id)').eq('is_active', true).order('thinkific_enrollment_id').range(off, off + 999);
      if (!data || data.length === 0) break;
      for (const e of data as unknown as RawEnrollment[]) {
        if (!e.learners?.thinkific_user_id || !e.courses?.thinkific_course_id) continue;
        const pct = safeNumber(e.progress_percent);
        const neverSynced = !learnersWithProgress.has(e.learner_id);
        const recentlyUpdated = lastSyncAt && e.updated_at && e.updated_at > lastSyncAt;
        const incomplete = pct < 100;
        if (neverSynced || recentlyUpdated || incomplete) {
          toSync.push({ thinkific_enrollment_id: e.thinkific_enrollment_id, learner_id: e.learner_id, company_id: e.company_id, course_id: e.course_id, thinkific_user_id: e.learners.thinkific_user_id, thinkific_course_id: e.courses.thinkific_course_id, progress_percent: pct, updated_at: e.updated_at });
        }
      }
      if (data.length < 1000) break;
    }

    const total = toSync.length;
    const chunk = toSync.slice(opts.offset, opts.offset + opts.limit);
    const nextOffset = opts.offset + opts.limit;
    const done = nextOffset >= total || chunk.length === 0;

    if (chunk.length === 0) {
      return { status: 'success', recordsProcessed: 0, total, nextOffset: opts.offset, done: true };
    }

    // 5. Process the chunk with bounded concurrency
    let recordsProcessed = 0;
    const pendingQuizzes: Array<Record<string, unknown>> = [];

    for (let ci = 0; ci < chunk.length; ci += CONCURRENCY) {
      const slice = chunk.slice(ci, ci + CONCURRENCY);
      await Promise.all(slice.map(async (enrollment) => {
        try {
          const progressItems = await thinkificPaginate<ThinkificProgressItem>('/course_progress', { course_id: enrollment.thinkific_course_id, user_id: enrollment.thinkific_user_id });
          const lessonRows: Array<Record<string, unknown>> = [];
          for (const item of progressItems) {
            const lesson = lessonMap.get(String(item.content_id));
            if (!lesson) continue;
            lessonRows.push({ learner_id: enrollment.learner_id, company_id: enrollment.company_id, course_id: enrollment.course_id, lesson_id: lesson.id, completed: item.completed, completed_at: item.completed && item.updated_at ? item.updated_at : null, viewed_at: item.updated_at || null, progress_percent: safeNumber(item.percent_completed) });
            if (lesson.lesson_type?.toLowerCase() === 'quiz' && item.completed) {
              pendingQuizzes.push({ thinkific_quiz_id: String(item.content_id), learner_id: enrollment.learner_id, company_id: enrollment.company_id, course_id: enrollment.course_id, lesson_id: lesson.id, passed: true, score: null, attempted_at: item.updated_at || null });
            }
          }
          for (let i = 0; i < lessonRows.length; i += 100) {
            await db.from('lesson_progress').upsert(lessonRows.slice(i, i + 100), { onConflict: 'learner_id,course_id,lesson_id', ignoreDuplicates: false });
          }
          recordsProcessed += lessonRows.length;
        } catch (err) {
          console.warn(`[ProgressChunk] Failed enrollment ${enrollment.thinkific_enrollment_id}:`, err);
        }
      }));
      if (ci + CONCURRENCY < chunk.length) await new Promise(r => setTimeout(r, INTER_BATCH_DELAY_MS));
    }

    if (pendingQuizzes.length > 0) await flushQuizBatch(db, pendingQuizzes);

    // Mark sync complete only when last chunk finishes
    if (done) {
      await db.from('sync_logs').insert({ sync_type: 'lesson_progress', status: 'success', records_processed: recordsProcessed, completed_at: new Date().toISOString() });
    }

    return { status: 'success', recordsProcessed, total, nextOffset, done };
  } catch (err) {
    return { status: 'error', recordsProcessed: 0, total: 0, nextOffset: opts.offset, done: false, errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncLessonProgress(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return {
      syncType: 'lesson_progress',
      status: 'skipped',
      recordsProcessed: 0,
      errorMessage: 'Thinkific not configured',
    };
  }

  return runSync('lesson_progress', async () => {
    const db = createAdminClient();

    // ── 1. Load all lessons into memory: thinkific_lesson_id → {id, lesson_type} ──
    const lessonMap = new Map<string, { id: string; lesson_type: string | null; is_video: boolean }>();
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('lessons')
        .select('id, thinkific_lesson_id, lesson_type, is_video')
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const l of data) {
        lessonMap.set(String(l.thinkific_lesson_id), {
          id: l.id,
          lesson_type: l.lesson_type,
          is_video: l.is_video,
        });
      }
      if (data.length < 1000) break;
    }
    console.log(`[SyncLessonProgress] Loaded ${lessonMap.size} lessons`);

    // ── 2. Find last successful sync time ──
    const { data: lastLog } = await db
      .from('sync_logs')
      .select('completed_at')
      .eq('sync_type', 'lesson_progress')
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();
    const lastSyncAt: string | null = lastLog?.completed_at ?? null;
    console.log(`[SyncLessonProgress] Last successful sync: ${lastSyncAt ?? 'never'}`);

    // ── 3. Find which learners already have ANY lesson_progress records ──
    //    Used to decide if "never synced" path should be taken.
    const learnersWithProgress = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('lesson_progress')
        .select('learner_id')
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      data.forEach(r => learnersWithProgress.add(r.learner_id));
      if (data.length < 1000) break;
    }
    console.log(`[SyncLessonProgress] ${learnersWithProgress.size} learners already have progress records`);

    // ── 4. Load all active enrollments with learner + course Thinkific IDs ──
    type RawEnrollment = {
      thinkific_enrollment_id: string;
      learner_id: string;
      company_id: string;
      course_id: string;
      progress_percent: number;
      updated_at: string | null;
      learners: { thinkific_user_id: string } | null;
      courses: { thinkific_course_id: string } | null;
    };

    const toSync: EnrollmentToSync[] = [];

    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('enrollments')
        .select(
          'thinkific_enrollment_id, learner_id, company_id, course_id, ' +
          'progress_percent, updated_at, ' +
          'learners(thinkific_user_id), courses(thinkific_course_id)'
        )
        .eq('is_active', true)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;

      for (const e of data as unknown as RawEnrollment[]) {
        if (!e.learners?.thinkific_user_id || !e.courses?.thinkific_course_id) continue;

        const pct = safeNumber(e.progress_percent);
        const neverSynced = !learnersWithProgress.has(e.learner_id);
        const recentlyUpdated = lastSyncAt && e.updated_at && e.updated_at > lastSyncAt;
        const incomplete = pct < 100;

        // Sync if: never synced this learner, OR enrollment changed, OR still in progress
        if (neverSynced || recentlyUpdated || incomplete) {
          toSync.push({
            thinkific_enrollment_id: e.thinkific_enrollment_id,
            learner_id: e.learner_id,
            company_id: e.company_id,
            course_id: e.course_id,
            thinkific_user_id: e.learners.thinkific_user_id,
            thinkific_course_id: e.courses.thinkific_course_id,
            progress_percent: pct,
            updated_at: e.updated_at,
          });
        }
      }
      if (data.length < 1000) break;
    }

    const totalEnrollments = toSync.length;
    console.log(`[SyncLessonProgress] Enrollments to sync: ${totalEnrollments}`);

    let processedCount = 0;
    const pendingQuizzes: Array<Record<string, unknown>> = [];

    // ── 5. Process in batches with bounded concurrency ──
    for (let batchStart = 0; batchStart < toSync.length; batchStart += BATCH_SIZE) {
      const batch = toSync.slice(batchStart, batchStart + BATCH_SIZE);

      for (let ci = 0; ci < batch.length; ci += CONCURRENCY) {
        const chunk = batch.slice(ci, ci + CONCURRENCY);

        await Promise.all(
          chunk.map(async (enrollment) => {
            try {
              const progressItems = await thinkificPaginate<ThinkificProgressItem>(
                '/course_progress',
                {
                  course_id: enrollment.thinkific_course_id,
                  user_id: enrollment.thinkific_user_id,
                }
              );

              const lessonRows: Array<Record<string, unknown>> = [];

              for (const item of progressItems) {
                const lesson = lessonMap.get(String(item.content_id));
                if (!lesson) continue;

                lessonRows.push({
                  learner_id: enrollment.learner_id,
                  company_id: enrollment.company_id,
                  course_id: enrollment.course_id,
                  lesson_id: lesson.id,
                  completed: item.completed,
                  completed_at: item.completed && item.updated_at ? item.updated_at : null,
                  viewed_at: item.updated_at || null,
                  progress_percent: safeNumber(item.percent_completed),
                });

                // Capture quiz completions
                if (lesson.lesson_type?.toLowerCase() === 'quiz' && item.completed) {
                  pendingQuizzes.push({
                    thinkific_quiz_id: String(item.content_id),
                    learner_id: enrollment.learner_id,
                    company_id: enrollment.company_id,
                    course_id: enrollment.course_id,
                    lesson_id: lesson.id,
                    passed: true,
                    score: null,
                    attempted_at: item.updated_at || null,
                  });
                }
              }

              // Upsert lesson_progress in chunks of 100
              for (let i = 0; i < lessonRows.length; i += 100) {
                const { error } = await db
                  .from('lesson_progress')
                  .upsert(lessonRows.slice(i, i + 100), {
                    onConflict: 'learner_id,course_id,lesson_id',
                    ignoreDuplicates: false,
                  });
                if (error) {
                  console.warn(`[SyncLessonProgress] lesson_progress upsert error: ${error.message}`);
                }
              }

              processedCount += lessonRows.length;
            } catch (err) {
              // Non-fatal: log and continue — one failed enrollment doesn't abort the run
              console.warn(
                `[SyncLessonProgress] Failed enrollment ${enrollment.thinkific_enrollment_id}:`,
                err
              );
            }
          })
        );
      }

      // Flush quiz batch every BATCH_SIZE enrollments
      if (pendingQuizzes.length > 0) {
        await flushQuizBatch(db, pendingQuizzes.splice(0));
      }

      // Rate-limit: pause between batches
      if (batchStart + BATCH_SIZE < toSync.length) {
        await new Promise(r => setTimeout(r, INTER_BATCH_DELAY_MS));
      }

      console.log(`[SyncLessonProgress] Progress: ${Math.min(batchStart + BATCH_SIZE, totalEnrollments)}/${totalEnrollments}`);
    }

    // Flush any remaining quizzes
    if (pendingQuizzes.length > 0) {
      await flushQuizBatch(db, pendingQuizzes.splice(0));
    }

    console.log(`[SyncLessonProgress] Complete: ${processedCount} lesson progress records upserted`);
    return processedCount;
  });
}

/**
 * Upsert quiz records — check-then-insert to avoid duplicates
 * (a UNIQUE constraint on quizzes(learner_id, thinkific_quiz_id) is added by migration 002).
 */
async function flushQuizBatch(
  db: ReturnType<typeof createAdminClient>,
  quizzes: Array<Record<string, unknown>>
) {
  if (quizzes.length === 0) return;

  // Group by (learner_id, thinkific_quiz_id) to dedupe within this batch
  const seen = new Set<string>();
  const deduped = quizzes.filter(q => {
    const key = `${q.learner_id}:${q.thinkific_quiz_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Fetch existing records for these learners
  const learnerIds = [...new Set(deduped.map(q => q.learner_id as string))];
  const quizIds = [...new Set(deduped.map(q => q.thinkific_quiz_id as string))];
  const existingKeys = new Set<string>();

  for (let i = 0; i < learnerIds.length; i += 100) {
    const { data } = await db
      .from('quizzes')
      .select('learner_id, thinkific_quiz_id')
      .in('learner_id', learnerIds.slice(i, i + 100));
    if (data) {
      data.forEach(r => {
        if (quizIds.includes(r.thinkific_quiz_id)) {
          existingKeys.add(`${r.learner_id}:${r.thinkific_quiz_id}`);
        }
      });
    }
  }

  const toInsert = deduped.filter(q => !existingKeys.has(`${q.learner_id}:${q.thinkific_quiz_id}`));

  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 100) {
      const { error } = await db.from('quizzes').insert(toInsert.slice(i, i + 100));
      if (error) console.warn(`[SyncLessonProgress] Quiz insert error: ${error.message}`);
    }
    console.log(`[SyncLessonProgress] Inserted ${toInsert.length} quiz records`);
  }
}
