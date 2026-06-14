// =============================================================================
// Thinkific Surveys/Reviews Sync
// =============================================================================
// Syncs course review data from Thinkific as survey/feedback responses.
// Thinkific's /course_reviews endpoint provides per-course ratings and comments.

import { thinkificGet, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';

interface ThinkificReview {
  id: number;
  user_id: number;
  course_id: number;
  rating: number;
  title: string | null;
  review_text: string | null;
  approved: boolean;
  created_at: string;
}

interface ThinkificReviewResponse {
  items: ThinkificReview[];
  meta: {
    pagination: {
      current_page: number;
      next_page: number | null;
      total_pages: number;
      total_items: number;
    };
  };
}

/**
 * Sync survey/review responses from Thinkific.
 * Uses the /course_reviews endpoint to fetch ratings and feedback per course.
 */
export async function syncSurveys(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'surveys', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('surveys', async () => {
    const db = createAdminClient();
    let count = 0;

    // Fetch all courses to iterate
    const { data: courses } = await db
      .from('courses')
      .select('id, thinkific_course_id, name');

    if (!courses || courses.length === 0) return 0;

    // Pre-load learner map: thinkific_user_id → { id, company_id }
    const { data: allLearners } = await db
      .from('learners')
      .select('id, thinkific_user_id, company_id');
    const learnerMap = new Map(
      (allLearners || []).map((l) => [l.thinkific_user_id, { id: l.id, company_id: l.company_id }])
    );

    for (const course of courses) {
      if (!course.thinkific_course_id) continue;

      try {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await thinkificGet<ThinkificReviewResponse>(
            `/course_reviews`,
            { course_id: course.thinkific_course_id, page: String(page), limit: '25' }
          );

          if (!response.items || response.items.length === 0) {
            hasMore = false;
            break;
          }

          // Build records using pre-loaded map — zero extra DB queries
          const records = response.items.map((review) => {
            const learner = learnerMap.get(String(review.user_id));
            return {
              thinkific_response_id: String(review.id),  // matches schema UNIQUE column
              company_id: learner?.company_id || null,
              learner_id: learner?.id || null,
              course_id: course.id,
              rating: review.rating,
              feedback_text: review.review_text || review.title || null,
              proficiency_level: null,
              submitted_at: review.created_at,
            };
          });

          if (records.length > 0) {
            const { error } = await db.from('surveys').upsert(records, {
              onConflict: 'thinkific_response_id',  // matches schema UNIQUE column
            });
            if (error) {
              console.warn(`[SurveySync] Upsert error for course ${course.name}:`, error.message);
            }
            count += records.length;
          }

          hasMore = response.meta?.pagination?.next_page !== null;
          page++;
        }
      } catch (error) {
        // Non-fatal: some courses may not have reviews enabled
        console.warn(`[SurveySync] Error fetching reviews for course ${course.name}:`, error);
      }
    }

    return count;
  });
}
