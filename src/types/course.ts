// =============================================================================
// Course Types
// =============================================================================

export interface Course {
  id: string;
  thinkific_course_id: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  total_lessons: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  thinkific_lesson_id: string | null;
  course_id: string;
  name: string | null;
  chapter_name: string | null;
  position: number | null;
  lesson_type: string | null;
  is_video: boolean;
  created_at: string;
  updated_at: string;
}
