-- Performance indexes identified during audit
-- Eliminates sequential scans on hot query paths

-- Milestone check: Zoom attendance filtered by company + attended + join_time (last 30 days)
CREATE INDEX IF NOT EXISTS idx_zoom_attendance_company_attended_jointime
  ON zoom_attendance (company_id, attended, join_time);

-- Enrollment queries filtered by company + active status (milestone + progress checks)
CREATE INDEX IF NOT EXISTS idx_enrollments_company_active
  ON enrollments (company_id, is_active);

-- Lesson progress queries filtered by learner + completed (achievement awards, milestone checks)
CREATE INDEX IF NOT EXISTS idx_lesson_progress_learner_completed
  ON lesson_progress (learner_id, completed);
