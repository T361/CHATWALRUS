-- =============================================================================
-- Migration 002: Lesson progress tracking + Slack routing
-- Apply in Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Add company_id to lesson_progress for efficient per-company queries
--    (avoids IN(learner_ids) URL-length blowup on companies with 100+ learners)
ALTER TABLE lesson_progress
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lesson_progress_company_id
  ON lesson_progress(company_id);

-- 2. Track when each enrollment's lesson-level data was last synced
--    so the incremental sync can skip unchanged completed enrollments
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS lesson_progress_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_enrollments_lesson_progress_needs_sync
  ON enrollments(lesson_progress_synced_at NULLS FIRST, updated_at DESC)
  WHERE is_active = true;

-- 3. Slack DM routing and CSM email per company
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS csm_owner_email TEXT,
  ADD COLUMN IF NOT EXISTS slack_routing TEXT DEFAULT 'channel_only'
    CHECK (slack_routing IN ('channel_only', 'dm_only', 'both'));

-- 4. UNIQUE constraint on quizzes so upsert works reliably
--    First remove any existing duplicates (keep most recent)
DELETE FROM quizzes q1
  USING quizzes q2
  WHERE q1.learner_id = q2.learner_id
    AND q1.thinkific_quiz_id = q2.thinkific_quiz_id
    AND q1.created_at < q2.created_at;

ALTER TABLE quizzes
  ADD CONSTRAINT IF NOT EXISTS quizzes_learner_quiz_unique
  UNIQUE (learner_id, thinkific_quiz_id);
