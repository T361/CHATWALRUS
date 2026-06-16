-- =============================================================================
-- Migration 004: Add UNIQUE constraint on assignments.thinkific_assignment_id
-- Required for upsert with onConflict: 'thinkific_assignment_id' to work.
-- Apply in Supabase Dashboard → SQL Editor
-- =============================================================================

-- Remove any duplicate thinkific_assignment_id rows before adding constraint.
-- Keep the most recently created row for each duplicate set.
DELETE FROM assignments a1
  USING assignments a2
  WHERE a1.thinkific_assignment_id = a2.thinkific_assignment_id
    AND a1.thinkific_assignment_id IS NOT NULL
    AND a1.created_at < a2.created_at;

-- Add the UNIQUE constraint so upsert onConflict works correctly.
ALTER TABLE assignments
  ADD CONSTRAINT IF NOT EXISTS assignments_thinkific_assignment_id_unique
  UNIQUE (thinkific_assignment_id);
