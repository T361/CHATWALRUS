// =============================================================================
// Learner Types
// =============================================================================

export type LearnerStatus =
  | 'not_started'
  | 'at_risk'
  | 'slightly_behind'
  | 'on_track'
  | 'high_engagement';

export interface Learner {
  id: string;
  thinkific_user_id: string | null;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  department: string | null;
  title: string | null;
  role: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearnerWithProgress extends Learner {
  progress_percent: number;
  status: LearnerStatus;
  courses_enrolled: number;
  courses_completed: number;
  live_sessions_last_30_days: number;
}

export interface LearnerDetail extends LearnerWithProgress {
  enrollments: Enrollment[];
  lesson_progress: LessonProgressRecord[];
  quiz_attempts: QuizAttempt[];
  assignments: AssignmentRecord[];
  survey_responses: SurveyResponse[];
  zoom_attendance: ZoomAttendanceRecord[];
}

export interface Enrollment {
  id: string;
  thinkific_enrollment_id: string | null;
  company_id: string | null;
  learner_id: string;
  course_id: string;
  course_name?: string;
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LessonProgressRecord {
  id: string;
  learner_id: string;
  course_id: string;
  lesson_id: string;
  lesson_name?: string;
  course_name?: string;
  chapter_name?: string;
  completed: boolean;
  completed_at: string | null;
  viewed_at: string | null;
  progress_percent: number;
}

export interface QuizAttempt {
  id: string;
  thinkific_quiz_id: string | null;
  learner_id: string | null;
  company_id: string | null;
  course_id: string | null;
  lesson_id: string | null;
  course_name?: string;
  score: number | null;
  passed: boolean | null;
  attempted_at: string | null;
}

export interface AssignmentRecord {
  id: string;
  thinkific_assignment_id: string | null;
  learner_id: string | null;
  company_id: string | null;
  course_id: string | null;
  lesson_id: string | null;
  course_name?: string;
  submitted: boolean;
  submitted_at: string | null;
  score: number | null;
  status: string | null;
}

export interface SurveyResponse {
  id: string;
  company_id: string | null;
  learner_id: string | null;
  course_id: string | null;
  lesson_id: string | null;
  course_name?: string;
  rating: number | null;
  feedback_text: string | null;
  proficiency_level: string | null;
  submitted_at: string | null;
}

export interface ZoomAttendanceRecord {
  id: string;
  zoom_session_id: string;
  learner_id: string | null;
  company_id: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  join_time: string | null;
  leave_time: string | null;
  duration_minutes: number | null;
  attended: boolean;
  topic?: string;
  session_start?: string;
}

export interface DailySnapshot {
  id: string;
  company_id: string;
  learner_id: string;
  snapshot_date: string;
  total_lessons: number;
  completed_lessons: number;
  daily_lessons_completed: number;
  cumulative_lessons_completed: number;
  completion_percent: number;
  courses_enrolled: number;
  courses_completed: number;
  last_active_at: string | null;
}

export interface LearnerStatusSnapshot {
  id: string;
  company_id: string;
  learner_id: string;
  snapshot_date: string;
  milestone_day: number | null;
  status: LearnerStatus;
  completion_percent: number;
  benchmark_percent: number;
  live_sessions_last_30_days: number;
  reason: string | null;
}
