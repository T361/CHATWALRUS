// =============================================================================
// Thinkific Chapter Feedback Sync
// =============================================================================
// Syncs chapter-level feedback from Thinkific's /reviews endpoint.
// These are 1-10 ratings learners leave after completing individual chapters —
// NOT course_reviews (public 1-5 star ratings), which almost nobody fills out.
//
// Previous implementation used /course_reviews → always 0 results.
// Fix: use /reviews?content_type=Chapter for the actual feedback data.

import { thinkificPaginateFast, thinkificPaginate, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';

interface ThinkificReview {
  id: number;
  user_id: number;
  content_type: string;  // "Chapter" | "Course"
  content_id: number;    // chapter ID (for Chapter reviews)
  rating: number;        // 1-10 for chapters
  review_text: string | null;
  created_at: string;
}

interface ThinkificChapter {
  id: number;
  name?: string;
  position?: number;
}

export async function syncSurveys(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'surveys', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('surveys', async () => {
    const db = createAdminClient();
    let count = 0;

    // -----------------------------------------------------------------------
    // Step 1: Build chapter_thinkific_id → internal course_id map
    // We need this because /reviews returns a chapter ID, not a course ID.
    // syncCourses already fetches chapters via /courses/{id}/chapters —
    // we do the same here to build the lookup.
    // -----------------------------------------------------------------------
    const { data: courses } = await db
      .from('courses')
      .select('id, thinkific_course_id, name');

    const chapterToCourse = new Map<string, string>(); // thinkific chapter id → our course uuid

    for (const course of courses || []) {
      if (!course.thinkific_course_id) continue;
      try {
        const chapters = await thinkificPaginate<ThinkificChapter>(
          `/courses/${course.thinkific_course_id}/chapters`
        );
        for (const ch of chapters) {
          chapterToCourse.set(String(ch.id), course.id);
        }
      } catch {
        // some courses may not have accessible chapters — skip silently
      }
    }

    // -----------------------------------------------------------------------
    // Step 2: Learner map: thinkific_user_id → { id, company_id }
    // -----------------------------------------------------------------------
    const { data: allLearners } = await db
      .from('learners')
      .select('id, thinkific_user_id, company_id');
    const learnerMap = new Map(
      (allLearners || []).map((l) => [l.thinkific_user_id, { id: l.id, company_id: l.company_id }])
    );

    // -----------------------------------------------------------------------
    // Step 3: Fetch all chapter reviews from /reviews
    // Falls back to /course_reviews if /reviews is unavailable.
    // -----------------------------------------------------------------------
    let reviews: ThinkificReview[] = [];
    try {
      reviews = await thinkificPaginateFast<ThinkificReview>('/reviews');
      console.log(`[SurveySync] /reviews returned ${reviews.length} total reviews`);
    } catch (err) {
      console.warn('[SurveySync] /reviews endpoint failed, falling back to /course_reviews:', err);
      // Fallback: fetch course_reviews for each course
      for (const course of courses || []) {
        if (!course.thinkific_course_id) continue;
        try {
          const items = await thinkificPaginate<ThinkificReview>('/course_reviews', {
            course_id: String(course.thinkific_course_id),
          });
          reviews.push(...items);
        } catch { /* skip */ }
      }
      console.log(`[SurveySync] /course_reviews fallback returned ${reviews.length} reviews`);
    }

    // Filter to chapter-level reviews only (content_type might be "Chapter" or "chapter")
    const chapterReviews = reviews.filter(
      (r) => r.content_type?.toLowerCase() === 'chapter'
    );
    console.log(`[SurveySync] ${chapterReviews.length} chapter reviews to upsert`);

    if (chapterReviews.length === 0 && reviews.length > 0) {
      // /reviews returned data but none typed as "Chapter" — sync all regardless of content_type
      console.log('[SurveySync] No chapter-typed reviews found — syncing all reviews as fallback');
      chapterReviews.push(...reviews);
    }

    // -----------------------------------------------------------------------
    // Step 4: Map reviews → DB records and batch upsert
    // -----------------------------------------------------------------------
    const records = chapterReviews.map((review) => {
      const learner   = learnerMap.get(String(review.user_id));
      const chId      = String(review.content_id);
      const courseId  = chapterToCourse.get(chId) || null;

      return {
        thinkific_response_id: String(review.id),
        company_id:            learner?.company_id  || null,
        learner_id:            learner?.id          || null,
        course_id:             courseId,
        lesson_id:             chId,               // store chapter thinkific ID
        rating:                review.rating,
        feedback_text:         review.review_text  || null,
        proficiency_level:     null,
        submitted_at:          review.created_at,
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
