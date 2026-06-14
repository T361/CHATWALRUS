// =============================================================================
// Thinkific Course + Lesson Sync
// =============================================================================

import { thinkificPaginate, isThinkificConfigured } from './client';
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
  contents: Array<{
    id: number;
    name: string;
    content_type: string;
    position: number;
  }>;
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

    // Sync lessons for every course
    let lessonCount = 0;
    for (const course of courses) {
      lessonCount += await syncCourseLessons(String(course.id));
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

    const lessonRecords: Array<Record<string, unknown>> = [];

    for (const chapter of chapters) {
      if (chapter.contents) {
        for (const content of chapter.contents) {
          lessonRecords.push({
            thinkific_lesson_id: String(content.id),
            course_id: course.id,
            name: content.name || null,
            chapter_name: chapter.name || null,
            position: content.position ?? null,
            lesson_type: content.content_type || null,
            is_video: content.content_type === 'video',
          });
        }
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
