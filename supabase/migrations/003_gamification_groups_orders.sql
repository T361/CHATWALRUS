-- =============================================================================
-- Migration 003: Gamification + Thinkific Groups + Orders + Zoom Webinars
-- Apply in Supabase Dashboard → SQL Editor
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Companies — attach Thinkific Group IDs for canonical mapping
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS thinkific_group_id   INTEGER,
  ADD COLUMN IF NOT EXISTS thinkific_group_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_thinkific_group_id
  ON companies(thinkific_group_id) WHERE thinkific_group_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Zoom Sessions — add session_type to distinguish meetings vs webinars
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE zoom_sessions
  ADD COLUMN IF NOT EXISTS zoom_webinar_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_zoom_sessions_webinar_id
  ON zoom_sessions(zoom_webinar_id) WHERE zoom_webinar_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Orders — Thinkific enrollment purchase history
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thinkific_order_id  BIGINT      UNIQUE NOT NULL,
  learner_id          UUID        REFERENCES learners(id) ON DELETE SET NULL,
  company_id          UUID        REFERENCES companies(id) ON DELETE SET NULL,
  product_name        TEXT,
  product_id          BIGINT,
  amount_cents        INTEGER     NOT NULL DEFAULT 0,
  coupon_code         TEXT,
  status              TEXT,
  ordered_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_learner   ON orders(learner_id);
CREATE INDEX IF NOT EXISTS idx_orders_company   ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_date      ON orders(ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_product   ON orders(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Gamification — learner_points (fast leaderboard reads)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learner_points (
  id                          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id                  UUID      UNIQUE NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  company_id                  UUID      REFERENCES companies(id) ON DELETE CASCADE,
  total_points                INTEGER   NOT NULL DEFAULT 0,
  zoom_attendance_points      INTEGER   NOT NULL DEFAULT 0,
  lesson_completion_points    INTEGER   NOT NULL DEFAULT 0,
  quiz_points                 INTEGER   NOT NULL DEFAULT 0,
  course_completion_points    INTEGER   NOT NULL DEFAULT 0,
  assignment_points           INTEGER   NOT NULL DEFAULT 0,
  survey_points               INTEGER   NOT NULL DEFAULT 0,
  streak_bonus_points         INTEGER   NOT NULL DEFAULT 0,
  sessions_attended           INTEGER   NOT NULL DEFAULT 0,
  current_streak_days         INTEGER   NOT NULL DEFAULT 0,
  longest_streak_days         INTEGER   NOT NULL DEFAULT 0,
  last_calculated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learner_points_total
  ON learner_points(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_learner_points_company
  ON learner_points(company_id, total_points DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Gamification — points_events (audit trail, hard dedup via UNIQUE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS points_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    UUID        NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  company_id    UUID        REFERENCES companies(id) ON DELETE SET NULL,
  event_type    TEXT        NOT NULL,
  -- 'zoom_session' | 'lesson_complete' | 'quiz_pass' | 'course_complete'
  -- 'assignment'  | 'survey'           | 'streak_7'  | 'streak_30' | 'on_pace'
  points_earned INTEGER     NOT NULL,
  reference_id  TEXT,
  earned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, event_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_points_events_learner   ON points_events(learner_id, event_type);
CREATE INDEX IF NOT EXISTS idx_points_events_company   ON points_events(company_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_events_earned_at ON points_events(earned_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Gamification — achievements (seeded definitions)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievements (
  slug            TEXT    PRIMARY KEY,
  name            TEXT    NOT NULL,
  description     TEXT    NOT NULL,
  icon            TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  -- 'attendance' | 'learning' | 'assessment' | 'streak' | 'engagement'
  criteria_type   TEXT    NOT NULL,
  -- 'zoom_sessions' | 'lessons_complete' | 'courses_complete'
  -- 'quiz_passes' | 'streak_days' | 'surveys_submitted' | 'rank_global'
  criteria_value  INTEGER NOT NULL,
  bonus_points    INTEGER NOT NULL DEFAULT 0
);

-- Seed achievements (safe to re-run — ON CONFLICT DO NOTHING)
INSERT INTO achievements (slug, name, description, icon, category, criteria_type, criteria_value, bonus_points) VALUES
  ('first-session',     'First Step',         'Attended your first live session',                      '🎯', 'attendance',  'zoom_sessions',     1,   0),
  ('regular-attendee',  'Regular Attendee',   'Attended 5 live sessions',                              '📅', 'attendance',  'zoom_sessions',     5,  25),
  ('session-champion',  'Session Champion',   'Attended 20 live sessions',                             '🏆', 'attendance',  'zoom_sessions',    20, 100),
  ('top-of-board',      'Top of the Board',   'Reached #1 on the global leaderboard',                 '👑', 'engagement',  'rank_global',        1, 200),
  ('quick-starter',     'Quick Starter',      'Completed a lesson within 7 days of enrolling',        '⚡', 'learning',    'lessons_complete',   1,  10),
  ('on-fire',           'On Fire',            'Maintained a 7-day learning streak',                   '🔥', 'streak',      'streak_days',        7,  50),
  ('unstoppable',       'Unstoppable',        'Maintained a 30-day learning streak',                  '💪', 'streak',      'streak_days',       30, 200),
  ('first-complete',    'Course Complete',    'Completed your first course',                           '🎓', 'learning',    'courses_complete',   1,  50),
  ('course-crusher',    'Course Crusher',     'Completed 3 courses',                                  '💥', 'learning',    'courses_complete',   3, 150),
  ('quiz-ace',          'Quiz Ace',           'Passed 5 quizzes',                                     '🧠', 'assessment',  'quiz_passes',        5,  50),
  ('perfect-score',     'Perfect Score',      'Scored 100% on a quiz',                                '⭐', 'assessment',  'perfect_quiz',       1,  75),
  ('feedback-star',     'Feedback Star',      'Submitted 5 surveys',                                  '💬', 'engagement',  'surveys_submitted',  5,  25),
  ('overachiever',      'Overachiever',       'Exceeded your benchmark by 20% at a milestone',        '🚀', 'learning',    'benchmark_120',      1, 100),
  ('consistent',        'Consistent',         'On-pace at 3 consecutive milestone checks',            '📈', 'learning',    'onpace_streak',      3,  75)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Gamification — learner_achievements (earned badges)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learner_achievements (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id       UUID        NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  company_id       UUID        REFERENCES companies(id) ON DELETE SET NULL,
  achievement_slug TEXT        NOT NULL REFERENCES achievements(slug),
  earned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, achievement_slug)
);

CREATE INDEX IF NOT EXISTS idx_learner_achievements_learner
  ON learner_achievements(learner_id);
CREATE INDEX IF NOT EXISTS idx_learner_achievements_company
  ON learner_achievements(company_id, earned_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Gamification — leaderboard_snapshots (daily rank history)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id       UUID    NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  company_id       UUID    REFERENCES companies(id) ON DELETE SET NULL,
  snapshot_date    DATE    NOT NULL,
  total_points     INTEGER NOT NULL DEFAULT 0,
  global_rank      INTEGER,
  company_rank     INTEGER,
  prev_global_rank INTEGER,
  UNIQUE (learner_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_date
  ON leaderboard_snapshots(snapshot_date DESC, total_points DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_company
  ON leaderboard_snapshots(company_id, snapshot_date DESC, total_points DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CSM Operations — interventions log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interventions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  learner_id          UUID        REFERENCES learners(id) ON DELETE SET NULL,
  csm_email           TEXT,
  intervention_type   TEXT        NOT NULL DEFAULT 'note',
  -- 'note' | 'call' | 'email' | 'action_taken' | 'follow_up_set'
  note                TEXT        NOT NULL,
  follow_up_date      DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interventions_company  ON interventions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_learner  ON interventions(learner_id, created_at DESC);
