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
 * Returns null only when the program is explicitly in the future (start_date > today).
 * When start_date is null (not set), defaults to day 30 so milestone checks still run.
 */
export function getMilestoneDay(startDate: string | null): number | null {
  if (!startDate) {
    // No start date configured — run checks at day 30 as a safe default
    // so status charts aren't permanently empty. Admin should set start_date.
    return 30;
  }
  const days = daysSince(startDate);
  if (days < 0) return null; // program hasn't started yet
  // Round down to nearest 30-day interval, minimum day 30
  return Math.floor(days / 30) * 30 || 30;
}

/**
 * Get the raw day count since start (not rounded to milestone).
 */
export function getRawDayCount(startDate: string | null): number {
  return daysSince(startDate);
}
