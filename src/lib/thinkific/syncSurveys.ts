// =============================================================================
// Thinkific Course Review Sync
// =============================================================================
// Current live integration proves /course_reviews per course_id, but does not
// prove the generic /reviews endpoint. Keep this sync scoped to course_reviews
// so the behavior matches the currently retrievable upstream surface.

import { thinkificPaginate, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';

interface ThinkificReview {
  id: number;
  user_id?: number;
  course_id?: number;
  rating: number;
  review_text?: string | null;
  review?: string | null;
  created_at: string;
}

export async function syncSurveys(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'surveys', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('surveys', async () => {
    const db = createAdminClient();
    let count = 0;
    const { data: courses } = await db
      .from('courses')
      .select('id, thinkific_course_id, name');

    const courseMap = new Map(
      (courses || []).map((course) => [String(course.thinkific_course_id), course.id]),
    );

    const { data: allLearners } = await db
      .from('learners')
      .select('id, thinkific_user_id, company_id');
    const learnerMap = new Map(
      (allLearners || []).map((l) => [l.thinkific_user_id, { id: l.id, company_id: l.company_id }])
    );

    const reviews: ThinkificReview[] = [];
    for (const course of courses || []) {
      if (!course.thinkific_course_id) continue;
      try {
        const items = await thinkificPaginate<ThinkificReview>('/course_reviews', {
          course_id: String(course.thinkific_course_id),
        });
        reviews.push(...items);
      } catch (error) {
        console.warn(`[SurveySync] /course_reviews failed for course ${course.thinkific_course_id}:`, error);
      }
    }
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
      if (error) console.warn('[SurveySync] Upsert error:', error.message);
      count += Math.min(BATCH, records.length - i);
    }

    console.log(`[SurveySync] Done — ${count} survey records upserted`);
    return count;
  });
}
