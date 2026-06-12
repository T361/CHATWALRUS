// =============================================================================
// Benchmark Calculator
// =============================================================================
// Calculates the expected completion percentage at a given milestone day.

import { daysSince } from '@/lib/utils/dates';
import { clampPercent } from '@/lib/utils/normalize';

/**
 * Calculate the benchmark percentage for a given milestone day.
 * benchmark = min(100, milestone_day / learning_timeline_days * 100)
 */
export function calculateBenchmark(
  milestoneDay: number,
  learningTimelineDays: number = 90
): number {
  if (learningTimelineDays <= 0) return 100;
  const benchmark = (milestoneDay / learningTimelineDays) * 100;
  return clampPercent(benchmark);
}

/**
 * Get the current milestone day for a company based on its start date.
 */
export function getMilestoneDay(startDate: string | null): number {
  const days = daysSince(startDate);
  // Round down to nearest 30-day interval, minimum 30
  const milestone = Math.floor(days / 30) * 30;
  return Math.max(30, milestone);
}

/**
 * Get the raw day count since start (not rounded to milestone).
 */
export function getRawDayCount(startDate: string | null): number {
  return daysSince(startDate);
}
