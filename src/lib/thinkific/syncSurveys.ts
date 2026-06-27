// =============================================================================
// Thinkific Course Review Sync
// =============================================================================
// Current live integration proves /course_reviews per course_id, but does not
// prove the generic /reviews endpoint. Keep this sync scoped to course_reviews
// so the behavior matches the currently retrievable upstream surface.

import { thinkificPaginate, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSyncLog, updateSyncLog, type SyncResult } from './syncCore';

interface ThinkificReview {
  id: number;
  user_id?: number;
  course_id?: number;
  rating: number;
  review_text?: string | null;
  review?: string | null;
  created_at: string;
}

interface SurveySyncMetadata extends Record<string, unknown> {
  courses_checked: number;
  upstream_reviews_found: number;
  records_upserted: number;
  endpoint_errors: Array<{ course_id: string; message: string }>;
}

function safeMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Unknown error');
  }
  return String(error);
}

export async function syncSurveys(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return {
      syncType: 'surveys',
      status: 'skipped',
      recordsProcessed: 0,
      errorMessage: 'Thinkific not configured',
      metadata: {
        courses_checked: 0,
        upstream_reviews_found: 0,
        records_upserted: 0,
        endpoint_errors: [],
      },
    };
  }

  const metadata: SurveySyncMetadata = {
    courses_checked: 0,
    upstream_reviews_found: 0,
    records_upserted: 0,
    endpoint_errors: [],
  };
  const logId = await createSyncLog('surveys', 'running');

  try {
    const db = createAdminClient();
    const { data: courses, error: coursesError } = await db
      .from('courses')
      .select('id, thinkific_course_id, name');
    if (coursesError) throw coursesError;

    const courseMap = new Map(
      (courses || []).map((course) => [String(course.thinkific_course_id), course.id]),
    );

    // Paginate learners — Supabase server-side cap is 1,000 rows per request
    const allLearnerRows: Array<{ id: string; thinkific_user_id: string | null; company_id: string | null }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error: pageErr } = await db
        .from('learners')
        .select('id, thinkific_user_id, company_id')
        .range(offset, offset + 999);
      if (pageErr) throw pageErr;
      if (!data || data.length === 0) break;
      allLearnerRows.push(...data);
      if (data.length < 1000) break;
    }

    const learnerMap = new Map(
      allLearnerRows
        .filter((learner) => learner.thinkific_user_id)
        .map((learner) => [
          String(learner.thinkific_user_id),
          { id: learner.id, company_id: learner.company_id },
        ]),
    );

    const reviews: ThinkificReview[] = [];
    for (const course of courses || []) {
      if (!course.thinkific_course_id) continue;
      metadata.courses_checked += 1;
      try {
        const items = await thinkificPaginate<ThinkificReview>('/course_reviews', {
          course_id: String(course.thinkific_course_id),
        });
        reviews.push(...items);
      } catch (error) {
        metadata.endpoint_errors.push({
          course_id: String(course.thinkific_course_id),
          message: safeMessage(error),
        });
        console.warn(`[SurveySync] /course_reviews failed for course ${course.thinkific_course_id}:`, error);
      }
    }
    metadata.upstream_reviews_found = reviews.length;
    console.log(`[SurveySync] /course_reviews returned ${reviews.length} total reviews`);

    const records = reviews.map((review) => {
      const learner = review.user_id ? learnerMap.get(String(review.user_id)) : null;
      const thinkificCourseId = review.course_id ? String(review.course_id) : null;
      const courseId = thinkificCourseId ? courseMap.get(thinkificCourseId) || null : null;

      return {
        thinkific_response_id: String(review.id),
        company_id: learner?.company_id || null,
        learner_id: learner?.id || null,
        course_id: courseId,
        lesson_id: null,
        rating: review.rating,
        feedback_text: review.review_text || review.review || null,
        proficiency_level: null,
        submitted_at: review.created_at,
      };
    });

    const BATCH = 100;
    for (let i = 0; i < records.length; i += BATCH) {
      const { error } = await db.from('surveys').upsert(
        records.slice(i, i + BATCH),
        { onConflict: 'thinkific_response_id' }
      );
      if (error) throw error;
      metadata.records_upserted += Math.min(BATCH, records.length - i);
    }

    console.log(`[SurveySync] Done — ${metadata.records_upserted} survey records upserted`);
    if (logId) {
      await updateSyncLog(logId, {
        status: 'success',
        records_processed: metadata.records_upserted,
        metadata,
      });
    }

    return {
      syncType: 'surveys',
      status: 'success',
      recordsProcessed: metadata.records_upserted,
      metadata,
      logId: logId ?? undefined,
    };
  } catch (error) {
    const errorMessage = safeMessage(error);
    if (logId) {
      await updateSyncLog(logId, {
        status: 'error',
        records_processed: metadata.records_upserted,
        error_message: errorMessage,
        metadata,
      });
    }

    return {
      syncType: 'surveys',
      status: 'error',
      recordsProcessed: metadata.records_upserted,
      errorMessage,
      metadata,
      logId: logId ?? undefined,
    };
  }
}
