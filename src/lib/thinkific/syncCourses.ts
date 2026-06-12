// =============================================================================
// Thinkific Course Sync
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

/**
 * Sync courses from Thinkific to Supabase.
 */
export async function syncCourses(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'courses', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('courses', async () => {
    const courses = await thinkificPaginate<ThinkificCourse>('/courses');
    const db = createAdminClient();
    let count = 0;

    for (const course of courses) {
      await db.from('courses').upsert(
        {
          thinkific_course_id: String(course.id),
          name: course.name || 'Untitled Course',
          slug: course.slug || null,
          description: course.description || null,
          total_lessons: course.content_count ?? 0,
          is_active: true,
        },
        { onConflict: 'thinkific_course_id' }
      );
      count++;
    }

    // TODO: After course sync, also sync chapters/lessons for each course
    // via /courses/{id}/chapters endpoint

    return count;
  });
}

/**
 * Sync lessons for a specific course from Thinkific.
 */
export async function syncCourseLessons(thinkificCourseId: string): Promise<number> {
  if (!isThinkificConfigured()) return 0;

  const db = createAdminClient();

  // Find internal course ID
  const { data: course } = await db
    .from('courses')
    .select('id')
    .eq('thinkific_course_id', thinkificCourseId)
    .single();

  if (!course) return 0;

  // TODO: Thinkific chapters endpoint may vary.
  // Typical: GET /courses/{id}/chapters -> chapters with content_ids
  // For now, implement skeleton.

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

  try {
    const chapters = await thinkificPaginate<ThinkificChapter>(
      `/courses/${thinkificCourseId}/chapters`
    );

    let count = 0;
    for (const chapter of chapters) {
      if (chapter.contents) {
        for (const content of chapter.contents) {
          await db.from('lessons').upsert(
            {
              thinkific_lesson_id: String(content.id),
              course_id: course.id,
              name: content.name || null,
              chapter_name: chapter.name || null,
              position: content.position ?? null,
              lesson_type: content.content_type || null,
              is_video: content.content_type === 'video',
            },
            { onConflict: 'thinkific_lesson_id' }
          );
          count++;
        }
      }
    }

    return count;
  } catch (error) {
    console.warn(`[SyncCourseLessons] Failed for course ${thinkificCourseId}:`, error);
    return 0;
  }
}
