-- =============================================================================
-- Migration 005: Performance rollups, learner directory views, and hot-path indexes
-- =============================================================================

CREATE TABLE IF NOT EXISTS company_summary_rollups (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  learner_count INTEGER NOT NULL DEFAULT 0,
  avg_progress NUMERIC NOT NULL DEFAULT 0,
  at_risk_count INTEGER NOT NULL DEFAULT 0,
  slightly_behind_count INTEGER NOT NULL DEFAULT 0,
  not_started_count INTEGER NOT NULL DEFAULT 0,
  on_track_count INTEGER NOT NULL DEFAULT 0,
  high_engagement_count INTEGER NOT NULL DEFAULT 0,
  snapshot_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_summary_rollups_snapshot_date
  ON company_summary_rollups(snapshot_date DESC);

CREATE OR REPLACE VIEW learner_enrollment_stats_v AS
SELECT
  e.learner_id,
  e.company_id,
  COUNT(*) FILTER (WHERE e.is_active) AS courses_enrolled,
  COALESCE(AVG(e.progress_percent) FILTER (WHERE e.is_active), 0) AS avg_progress
FROM enrollments e
GROUP BY e.learner_id, e.company_id;

CREATE OR REPLACE VIEW latest_learner_status_v AS
SELECT DISTINCT ON (s.learner_id)
  s.learner_id,
  s.company_id,
  s.status,
  s.completion_percent,
  s.benchmark_percent,
  s.live_sessions_last_30_days,
  s.snapshot_date
FROM learner_status_snapshots s
ORDER BY s.learner_id, s.snapshot_date DESC, s.created_at DESC;

CREATE OR REPLACE VIEW learner_directory_v AS
WITH active_enrollment_agg AS (
  SELECT
    e.learner_id,
    e.company_id,
    COUNT(*) FILTER (WHERE e.is_active) AS courses_enrolled,
    COALESCE(AVG(e.progress_percent) FILTER (WHERE e.is_active), 0) AS avg_progress,
    COALESCE(
      ARRAY_AGG(DISTINCT e.course_id) FILTER (WHERE e.is_active AND e.course_id IS NOT NULL),
      '{}'::UUID[]
    ) AS active_course_ids
  FROM enrollments e
  GROUP BY e.learner_id, e.company_id
)
SELECT
  l.id AS learner_id,
  l.company_id,
  c.name AS company_name,
  c.slug AS company_slug,
  l.full_name,
  l.email,
  l.department,
  l.title,
  l.last_active_at,
  l.is_active,
  COALESCE(ea.courses_enrolled, 0) AS courses_enrolled,
  COALESCE(ea.avg_progress, 0) AS avg_progress,
  COALESCE(ea.active_course_ids, '{}'::UUID[]) AS active_course_ids,
  COALESCE(ls.status, 'not_started') AS status,
  COALESCE(ls.completion_percent, 0) AS completion_percent,
  COALESCE(ls.benchmark_percent, 0) AS benchmark_percent,
  COALESCE(ls.live_sessions_last_30_days, 0) AS live_sessions_last_30_days,
  ls.snapshot_date
FROM learners l
LEFT JOIN companies c ON c.id = l.company_id
LEFT JOIN active_enrollment_agg ea ON ea.learner_id = l.id
LEFT JOIN latest_learner_status_v ls ON ls.learner_id = l.id
WHERE l.is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_learner_status_snapshots_learner_date_desc
  ON learner_status_snapshots(learner_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_learner_status_snapshots_company_date_desc
  ON learner_status_snapshots(company_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_company_course_learner_active
  ON enrollments(company_id, course_id, learner_id, is_active);

CREATE INDEX IF NOT EXISTS idx_enrollments_learner_active
  ON enrollments(learner_id, is_active);

CREATE INDEX IF NOT EXISTS idx_learners_company_active_name
  ON learners(company_id, is_active, full_name);

CREATE INDEX IF NOT EXISTS idx_zoom_attendance_company_join_time_desc
  ON zoom_attendance(company_id, join_time DESC);

CREATE INDEX IF NOT EXISTS idx_zoom_attendance_learner_join_time_desc
  ON zoom_attendance(learner_id, join_time DESC);

CREATE INDEX IF NOT EXISTS idx_zoom_sessions_start_time_desc
  ON zoom_sessions(start_time DESC);
