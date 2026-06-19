-- =============================================================================
-- Recovery/read-performance helpers for learner directories
-- =============================================================================

CREATE OR REPLACE VIEW learner_course_filter_options_v AS
SELECT
  'global'::TEXT AS scope_type,
  NULL::UUID AS company_id,
  c.id AS course_id,
  c.name AS course_name,
  COUNT(DISTINCT e.learner_id)::INTEGER AS active_learners
FROM enrollments e
JOIN courses c ON c.id = e.course_id
WHERE e.is_active = TRUE
  AND e.course_id IS NOT NULL
GROUP BY c.id, c.name

UNION ALL

SELECT
  'company'::TEXT AS scope_type,
  e.company_id,
  c.id AS course_id,
  c.name AS course_name,
  COUNT(DISTINCT e.learner_id)::INTEGER AS active_learners
FROM enrollments e
JOIN courses c ON c.id = e.course_id
WHERE e.is_active = TRUE
  AND e.course_id IS NOT NULL
  AND e.company_id IS NOT NULL
GROUP BY e.company_id, c.id, c.name;

CREATE INDEX IF NOT EXISTS idx_enrollments_active_course_company_learner
  ON enrollments(course_id, company_id, learner_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_enrollments_company_active_course_learner
  ON enrollments(company_id, course_id, learner_id)
  WHERE is_active = TRUE;
