// =============================================================================
// Thinkific Course + Lesson Sync
// =============================================================================

import { thinkificGet, thinkificPaginate, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';

interface ThinkificCourse {
  id: number;
  name: string;
  slug: string;
  description: string;
  chapter_count?: number;
  content_count?: number;
}

interface ThinkificChapter {
  id: number;
  name: string;
  position: number;
  // Thinkific API returns content_ids (integers), not full content objects.
  // Full details must be fetched individually via /contents/{id}.
  content_ids: number[];
}

interface ThinkificContent {
  id: number;
  name: string;
  contentable_type: string;
  position: number | null;
}

/**
 * Sync courses from Thinkific to Supabase, then sync lessons for each course.
 */
export async function syncCourses(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'courses', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('courses', async () => {
    const courses = await thinkificPaginate<ThinkificCourse>('/courses');
    const db = createAdminClient();
    let count = 0;

    // Batch upsert all courses at once instead of one-at-a-time
    const courseRecords = courses.map((course) => ({
      thinkific_course_id: String(course.id),
      name: course.name || 'Untitled Course',
      slug: course.slug || null,
      description: course.description || null,
      total_lessons: course.content_count ?? 0,
      is_active: true,
    }));

    if (courseRecords.length > 0) {
      const { error } = await db.from('courses').upsert(courseRecords, {
        onConflict: 'thinkific_course_id',
      });
      if (error) console.warn('[SyncCourses] Upsert error:', error.message);
      count += courseRecords.length;
    }

    // Sync lessons sequentially to avoid Vercel 60s limit — each course makes
    // N content fetches. For bulk lesson sync, use scripts/sync-lessons.mjs locally.
    let lessonCount = 0;
    const LESSON_CONCURRENCY = 3;
    for (let i = 0; i < courses.length; i += LESSON_CONCURRENCY) {
      const batch = courses.slice(i, i + LESSON_CONCURRENCY);
      const counts = await Promise.all(batch.map(c => syncCourseLessons(String(c.id))));
      lessonCount += counts.reduce((a, b) => a + b, 0);
    }
    console.log(`[SyncCourses] ${count} courses, ${lessonCount} lessons synced`);

    return count;
  });
}

/**
 * Sync lessons for a specific course from Thinkific chapters endpoint.
 */
export async function syncCourseLessons(thinkificCourseId: string): Promise<number> {
  if (!isThinkificConfigured()) return 0;

  const db = createAdminClient();

  const { data: course } = await db
    .from('courses')
    .select('id')
    .eq('thinkific_course_id', thinkificCourseId)
    .single();

  if (!course) return 0;

  try {
    const chapters = await thinkificPaginate<ThinkificChapter>(
      `/courses/${thinkificCourseId}/chapters`
    );

    // Collect all content IDs from all chapters
    const contentEntries: Array<{ contentId: number; chapterName: string }> = [];
    for (const chapter of chapters) {
      for (const contentId of (chapter.content_ids || [])) {
        contentEntries.push({ contentId, chapterName: chapter.name });
      }
    }

    if (contentEntries.length === 0) return 0;

    // Fetch each content detail individually (Thinkific has no bulk endpoint)
    const CONTENT_CONCURRENCY = 8;
    const lessonRecords: Array<Record<string, unknown>> = [];

    for (let i = 0; i < contentEntries.length; i += CONTENT_CONCURRENCY) {
      const batch = contentEntries.slice(i, i + CONTENT_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(({ contentId, chapterName }) =>
          thinkificGet<ThinkificContent>(`/contents/${contentId}`).then((content) => ({
            thinkific_lesson_id: String(content.id),
            course_id: course.id,
            name: content.name || null,
            chapter_name: chapterName || null,
            position: content.position ?? null,
            lesson_type: content.contentable_type || null,
            is_video: (content.contentable_type || '').toLowerCase() === 'video',
          }))
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled') lessonRecords.push(r.value);
        else console.warn(`[SyncCourseLessons] Content fetch failed:`, r.reason);
      }
    }

    if (lessonRecords.length > 0) {
      const { error } = await db.from('lessons').upsert(lessonRecords, {
        onConflict: 'thinkific_lesson_id',
      });
      if (error) console.warn(`[SyncCourseLessons] Upsert error for course ${thinkificCourseId}:`, error.message);
    }

    return lessonRecords.length;
  } catch (error) {
    console.warn(`[SyncCourseLessons] Failed for course ${thinkificCourseId}:`, error);
    return 0;
  }
}
