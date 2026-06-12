// =============================================================================
// Learner Status Calculator
// =============================================================================

import type { LearnerStatus } from '@/types/learner';
import { calculateBenchmark } from './benchmark';

export interface StatusInput {
  completionPercent: number;
  milestoneDay: number;
  learningTimelineDays: number;
  hasActivity: boolean;
  hasLoggedIn: boolean;
  liveSessionsLast30Days: number;
}

/**
 * Calculate a learner's engagement status based on their progress vs benchmark.
 *
 * Statuses:
 * - not_started: No login, no activity, no progress
 * - at_risk: completion < benchmark * 0.8
 * - slightly_behind: completion >= benchmark * 0.8 AND < benchmark
 * - on_track: completion >= benchmark
 * - high_engagement:
 *     Before day 90: completion > benchmark
 *     Day 90+: completion >= benchmark AND live_sessions >= 2
 */
export function calculateLearnerStatus(input: StatusInput): {
  status: LearnerStatus;
  reason: string;
} {
  const {
    completionPercent,
    milestoneDay,
    learningTimelineDays,
    hasActivity,
    hasLoggedIn,
    liveSessionsLast30Days,
  } = input;

  // Not Started: never logged in or no activity and no progress
  if (!hasLoggedIn || (!hasActivity && completionPercent === 0)) {
    return {
      status: 'not_started',
      reason: 'Learner has not logged in or has no activity.',
    };
  }

  const benchmark = calculateBenchmark(milestoneDay, learningTimelineDays);

  // High Engagement check
  if (milestoneDay < 90) {
    // Before Day 90: completion must be strictly above benchmark
    if (completionPercent > benchmark) {
      return {
        status: 'high_engagement',
        reason: `Completion ${completionPercent.toFixed(1)}% exceeds benchmark ${benchmark.toFixed(1)}% (before Day 90).`,
      };
    }
  } else {
    // Day 90+: completion >= benchmark AND at least 2 live sessions in last 30 days
    if (completionPercent >= benchmark && liveSessionsLast30Days >= 2) {
      return {
        status: 'high_engagement',
        reason: `Completion ${completionPercent.toFixed(1)}% meets benchmark ${benchmark.toFixed(1)}% with ${liveSessionsLast30Days} live sessions (Day 90+).`,
      };
    }
  }

  // On Track: completion >= benchmark
  if (completionPercent >= benchmark) {
    return {
      status: 'on_track',
      reason: `Completion ${completionPercent.toFixed(1)}% meets benchmark ${benchmark.toFixed(1)}%.`,
    };
  }

  // Slightly Behind: completion >= 80% of benchmark but < benchmark
  const slightlyBehindThreshold = benchmark * 0.8;
  if (completionPercent >= slightlyBehindThreshold) {
    return {
      status: 'slightly_behind',
      reason: `Completion ${completionPercent.toFixed(1)}% is close to benchmark ${benchmark.toFixed(1)}%.`,
    };
  }

  // At Risk: completion < 80% of benchmark
  return {
    status: 'at_risk',
    reason: `Completion ${completionPercent.toFixed(1)}% is significantly below benchmark ${benchmark.toFixed(1)}%.`,
  };
}
