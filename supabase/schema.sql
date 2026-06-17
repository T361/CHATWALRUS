-- =============================================================================
-- ChatWalrus Engagement Dashboard - Supabase Schema
-- =============================================================================
-- Run this SQL in the Supabase SQL editor to create all tables.
-- This schema uses uuid primary keys, timestamptz for timestamps,
-- and date for snapshot/program dates.
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Helper: updated_at trigger function
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Table: companies
-- =============================================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  thinkific_company_id TEXT,
  thinkific_group_id TEXT,
  start_date DATE,
  end_date DATE,
  learning_timeline_days INTEGER DEFAULT 90,
  risk_threshold_percent NUMERIC DEFAULT 30,
  slack_channel_id TEXT,
  csm_owner_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_companies_thinkific_company_id ON companies(thinkific_company_id);

CREATE TRIGGER set_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Table: company_summary_rollups
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_summary_rollups_snapshot_date ON company_summary_rollups(snapshot_date DESC);

-- =============================================================================
-- Table: learners
-- =============================================================================
CREATE TABLE IF NOT EXISTS learners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thinkific_user_id TEXT UNIQUE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  email TEXT,
  department TEXT,
  title TEXT,
  role TEXT,
  last_login_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learners_company_id ON learners(company_id);
CREATE INDEX idx_learners_thinkific_user_id ON learners(thinkific_user_id);
CREATE INDEX idx_learners_email ON learners(email);
CREATE INDEX idx_learners_company_active_name ON learners(company_id, is_active, full_name);

CREATE TRIGGER set_learners_updated_at
  BEFORE UPDATE ON learners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Table: courses
-- =============================================================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thinkific_course_id TEXT UNIQUE,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  total_lessons INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_courses_thinkific_course_id ON courses(thinkific_course_id);

CREATE TRIGGER set_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Table: lessons
-- =============================================================================
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thinkific_lesson_id TEXT UNIQUE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT,
  chapter_name TEXT,
  position INTEGER,
  lesson_type TEXT,
  is_video BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lessons_course_id ON lessons(course_id);
CREATE INDEX idx_lessons_thinkific_lesson_id ON lessons(thinkific_lesson_id);

CREATE TRIGGER set_lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Table: enrollments
-- =============================================================================
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thinkific_enrollment_id TEXT UNIQUE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  progress_percent NUMERIC DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enrollments_company_id ON enrollments(company_id);
CREATE INDEX idx_enrollments_learner_id ON enrollments(learner_id);
CREATE INDEX idx_enrollments_course_id ON enrollments(course_id);
CREATE INDEX idx_enrollments_thinkific_enrollment_id ON enrollments(thinkific_enrollment_id);
CREATE INDEX idx_enrollments_company_course_learner_active ON enrollments(company_id, course_id, learner_id, is_active);
CREATE INDEX idx_enrollments_learner_active ON enrollments(learner_id, is_active);

CREATE TRIGGER set_enrollments_updated_at
  BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Table: lesson_progress
-- =============================================================================
CREATE TABLE IF NOT EXISTS lesson_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  progress_percent NUMERIC DEFAULT 0,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(learner_id, course_id, lesson_id)
);

CREATE INDEX idx_lesson_progress_learner_id ON lesson_progress(learner_id);
CREATE INDEX idx_lesson_progress_course_id ON lesson_progress(course_id);
CREATE INDEX idx_lesson_progress_lesson_id ON lesson_progress(lesson_id);

CREATE TRIGGER set_lesson_progress_updated_at
  BEFORE UPDATE ON lesson_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Table: daily_snapshots
-- =============================================================================
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_lessons INTEGER DEFAULT 0,
  completed_lessons INTEGER DEFAULT 0,
  daily_lessons_completed INTEGER DEFAULT 0,
  cumulative_lessons_completed INTEGER DEFAULT 0,
  completion_percent NUMERIC DEFAULT 0,
  courses_enrolled INTEGER DEFAULT 0,
  courses_completed INTEGER DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(learner_id, snapshot_date)
);

CREATE INDEX idx_daily_snapshots_company_id ON daily_snapshots(company_id);
CREATE INDEX idx_daily_snapshots_learner_id ON daily_snapshots(learner_id);
CREATE INDEX idx_daily_snapshots_snapshot_date ON daily_snapshots(snapshot_date);

-- =============================================================================
-- Table: milestone_checks
-- =============================================================================
CREATE TABLE IF NOT EXISTS milestone_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  milestone_day INTEGER NOT NULL,
  benchmark_percent NUMERIC NOT NULL,
  average_completion_percent NUMERIC DEFAULT 0,
  at_risk_percent NUMERIC DEFAULT 0,
  not_started_count INTEGER DEFAULT 0,
  slightly_behind_count INTEGER DEFAULT 0,
  at_risk_count INTEGER DEFAULT 0,
  on_track_count INTEGER DEFAULT 0,
  high_engagement_count INTEGER DEFAULT 0,
  alert_triggered BOOLEAN DEFAULT FALSE,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, milestone_day)
);

CREATE INDEX idx_milestone_checks_company_id ON milestone_checks(company_id);

-- =============================================================================
-- Table: learner_status_snapshots
-- =============================================================================
CREATE TABLE IF NOT EXISTS learner_status_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  milestone_day INTEGER,
  status TEXT NOT NULL,
  completion_percent NUMERIC DEFAULT 0,
  benchmark_percent NUMERIC DEFAULT 0,
  live_sessions_last_30_days INTEGER DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(learner_id, snapshot_date)
);

CREATE INDEX idx_learner_status_snapshots_company_id ON learner_status_snapshots(company_id);
CREATE INDEX idx_learner_status_snapshots_learner_id ON learner_status_snapshots(learner_id);
CREATE INDEX idx_learner_status_snapshots_learner_date_desc ON learner_status_snapshots(learner_id, snapshot_date DESC);
CREATE INDEX idx_learner_status_snapshots_company_date_desc ON learner_status_snapshots(company_id, snapshot_date DESC);

-- =============================================================================
-- Views: learner directory performance helpers
-- =============================================================================
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

-- =============================================================================
-- Table: alerts
-- =============================================================================
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  milestone_check_id UUID REFERENCES milestone_checks(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT DEFAULT 'warning',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  actioned_by TEXT,
  actioned_at TIMESTAMPTZ,
  slack_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_company_id ON alerts(company_id);
CREATE INDEX idx_alerts_status ON alerts(status);

CREATE TRIGGER set_alerts_updated_at
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Table: zoom_sessions
-- =============================================================================
CREATE TABLE IF NOT EXISTS zoom_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zoom_meeting_id TEXT UNIQUE,
  topic TEXT,
  host_email TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  session_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_zoom_sessions_zoom_meeting_id ON zoom_sessions(zoom_meeting_id);
CREATE INDEX idx_zoom_sessions_start_time_desc ON zoom_sessions(start_time DESC);

-- =============================================================================
-- Table: zoom_attendance
-- =============================================================================
CREATE TABLE IF NOT EXISTS zoom_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zoom_session_id UUID REFERENCES zoom_sessions(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  dedupe_key TEXT UNIQUE,
  attendee_name TEXT,
  attendee_email TEXT,
  join_time TIMESTAMPTZ,
  leave_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  attended BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_zoom_attendance_zoom_session_id ON zoom_attendance(zoom_session_id);
CREATE INDEX idx_zoom_attendance_learner_id ON zoom_attendance(learner_id);
CREATE INDEX idx_zoom_attendance_attendee_email ON zoom_attendance(attendee_email);
CREATE INDEX idx_zoom_attendance_company_join_time_desc ON zoom_attendance(company_id, join_time DESC);
CREATE INDEX idx_zoom_attendance_learner_join_time_desc ON zoom_attendance(learner_id, join_time DESC);

-- =============================================================================
-- Table: surveys
-- =============================================================================
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thinkific_response_id TEXT UNIQUE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  rating NUMERIC,
  feedback_text TEXT,
  proficiency_level TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_surveys_company_id ON surveys(company_id);
CREATE INDEX idx_surveys_learner_id ON surveys(learner_id);

-- =============================================================================
-- Table: assignments
-- =============================================================================
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thinkific_assignment_id TEXT,
  learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  submitted BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMPTZ,
  score NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assignments_learner_id ON assignments(learner_id);
CREATE INDEX idx_assignments_company_id ON assignments(company_id);

-- =============================================================================
-- Table: quizzes
-- =============================================================================
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thinkific_quiz_id TEXT,
  learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  score NUMERIC,
  passed BOOLEAN,
  attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quizzes_learner_id ON quizzes(learner_id);
CREATE INDEX idx_quizzes_company_id ON quizzes(company_id);

-- =============================================================================
-- Table: passcodes
-- =============================================================================
CREATE TABLE IF NOT EXISTS passcodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_passcodes_updated_at
  BEFORE UPDATE ON passcodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Table: sync_logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_sync_type ON sync_logs(sync_type);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);

-- =============================================================================
-- Function: update_learner_last_active
-- Updates last_active_at for all learners in one query instead of N queries.
-- Called by syncProgress after lesson_progress upserts are complete.
-- =============================================================================
CREATE OR REPLACE FUNCTION update_learner_last_active()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE learners l
  SET last_active_at = subq.latest
  FROM (
    SELECT
      learner_id,
      MAX(COALESCE(completed_at, viewed_at)) AS latest
    FROM lesson_progress
    WHERE completed_at IS NOT NULL OR viewed_at IS NOT NULL
    GROUP BY learner_id
  ) subq
  WHERE l.id = subq.learner_id
    AND (l.last_active_at IS NULL OR subq.latest > l.last_active_at);
$$;

-- =============================================================================
-- RLS Notes:
-- For internal dashboard, RLS can be minimal.
-- If needed, enable RLS and add policies per table.
-- Service role key bypasses RLS for sync operations.
-- Anon key with RLS for dashboard reads if public access is needed.
-- =============================================================================

-- Example RLS enable (uncomment if needed):
-- ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow read access" ON companies FOR SELECT USING (true);
