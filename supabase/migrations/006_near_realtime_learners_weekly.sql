-- =============================================================================
-- Migration 006: Near-real-time learner directory + weekly report read models
-- =============================================================================

CREATE TABLE IF NOT EXISTS learner_directory_rollups (
  learner_id UUID PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  company_name TEXT,
  company_slug TEXT,
  full_name TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  last_active_at TIMESTAMPTZ,
  courses_enrolled INTEGER NOT NULL DEFAULT 0,
  avg_progress NUMERIC NOT NULL DEFAULT 0,
  active_course_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  status TEXT NOT NULL DEFAULT 'not_started',
  completion_percent NUMERIC NOT NULL DEFAULT 0,
  benchmark_percent NUMERIC NOT NULL DEFAULT 0,
  live_sessions_last_30_days INTEGER NOT NULL DEFAULT 0,
  snapshot_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learner_directory_rollups_company_name
  ON learner_directory_rollups(company_id, full_name, learner_id);

CREATE INDEX IF NOT EXISTS idx_learner_directory_rollups_status_name
  ON learner_directory_rollups(status, full_name, learner_id);

CREATE INDEX IF NOT EXISTS idx_learner_directory_rollups_company_status_name
  ON learner_directory_rollups(company_id, status, full_name, learner_id);

CREATE INDEX IF NOT EXISTS idx_learner_directory_rollups_active_courses
  ON learner_directory_rollups USING GIN(active_course_ids);

CREATE INDEX IF NOT EXISTS idx_learner_directory_rollups_email_lower
  ON learner_directory_rollups(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_learner_directory_rollups_name_lower
  ON learner_directory_rollups(LOWER(full_name));

CREATE TABLE IF NOT EXISTS company_weekly_rollups (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  learners INTEGER NOT NULL DEFAULT 0,
  active_this_week INTEGER NOT NULL DEFAULT 0,
  course_completions INTEGER NOT NULL DEFAULT 0,
  zoom_attendances INTEGER NOT NULL DEFAULT 0,
  assignments_submitted INTEGER NOT NULL DEFAULT 0,
  surveys_submitted INTEGER NOT NULL DEFAULT 0,
  high_engagement_count INTEGER NOT NULL DEFAULT 0,
  on_track_count INTEGER NOT NULL DEFAULT 0,
  slightly_behind_count INTEGER NOT NULL DEFAULT 0,
  at_risk_count INTEGER NOT NULL DEFAULT 0,
  not_started_count INTEGER NOT NULL DEFAULT 0,
  avg_completion NUMERIC NOT NULL DEFAULT 0,
  top_learners_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  open_alerts_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_company_weekly_rollups_updated_at
  ON company_weekly_rollups(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_learners_company_active_last_active
  ON learners(company_id, is_active, last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_company_completed_at
  ON enrollments(company_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_company_submitted_at
  ON assignments(company_id, submitted, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_surveys_company_submitted_at
  ON surveys(company_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_learner_points_company_total_points
  ON learner_points(company_id, total_points DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_company_status_created_at
  ON alerts(company_id, status, created_at DESC);
