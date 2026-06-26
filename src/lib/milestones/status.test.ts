import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Partial mock: replace only calculateBenchmark so we can control it in
// status tests while still testing the real implementation separately.
// ---------------------------------------------------------------------------
vi.mock('./benchmark', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./benchmark')>();
  return {
    ...actual,
    calculateBenchmark: vi.fn(),
  };
});

import { calculateLearnerStatus } from './status';
import { calculateBenchmark, getMilestoneDay } from './benchmark';

const mockCalculateBenchmark = calculateBenchmark as ReturnType<typeof vi.fn>;

// For real-implementation tests, bypass the mock by importing the actual module.
let realCalculateBenchmark: (milestoneDay: number, learningTimelineDays?: number) => number;
let realGetMilestoneDay: (startDate: string | null) => number | null;

beforeEach(async () => {
  const actual = await vi.importActual<typeof import('./benchmark')>('./benchmark');
  realCalculateBenchmark = actual.calculateBenchmark;
  realGetMilestoneDay = actual.getMilestoneDay;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeInput(
  overrides: Partial<Parameters<typeof calculateLearnerStatus>[0]> = {}
) {
  return {
    completionPercent: 0,
    milestoneDay: 30,
    learningTimelineDays: 90,
    hasActivity: false,
    hasLoggedIn: false,
    liveSessionsLast30Days: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateLearnerStatus — exhaustive status determination
// ---------------------------------------------------------------------------
describe('calculateLearnerStatus', () => {
  beforeEach(() => {
    // Default: benchmark is 33.33% (day 30 of 90)
    mockCalculateBenchmark.mockReturnValue(33.33);
  });

  // -------------------------------------------------------------------------
  // not_started
  // -------------------------------------------------------------------------
  describe('not_started', () => {
    it('returns not_started when progress=0, no login, no activity', () => {
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasLoggedIn: false, hasActivity: false })
      );
      expect(status).toBe('not_started');
    });

    it('includes a reason string', () => {
      const { reason } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasLoggedIn: false, hasActivity: false })
      );
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeGreaterThan(0);
    });

    it('does NOT return not_started when learner has logged in even with 0 progress', () => {
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasLoggedIn: true, hasActivity: false })
      );
      expect(status).not.toBe('not_started');
    });

    it('does NOT return not_started when learner has activity even with 0 progress', () => {
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasLoggedIn: false, hasActivity: true })
      );
      expect(status).not.toBe('not_started');
    });

    it('does NOT return not_started when progress > 0', () => {
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 1, hasLoggedIn: false, hasActivity: false })
      );
      expect(status).not.toBe('not_started');
    });

    it('treats completionPercent=0 as no progress (not_started guard)', () => {
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasLoggedIn: false, hasActivity: false })
      );
      expect(status).toBe('not_started');
    });
  });

  // -------------------------------------------------------------------------
  // 100% completion
  // -------------------------------------------------------------------------
  describe('100% completion', () => {
    it('returns high_engagement (before day 90) when completion is 100%', () => {
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 100, milestoneDay: 30 })
      );
      expect(status).toBe('high_engagement');
    });

    it('returns on_track when completion=100%, day>=90, live sessions < 2', () => {
      mockCalculateBenchmark.mockReturnValue(100);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 100, milestoneDay: 90, liveSessionsLast30Days: 1 })
      );
      expect(status).toBe('on_track');
    });

    it('returns high_engagement when completion=100%, day>=90, live sessions >= 2', () => {
      mockCalculateBenchmark.mockReturnValue(100);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 100, milestoneDay: 90, liveSessionsLast30Days: 2 })
      );
      expect(status).toBe('high_engagement');
    });
  });

  // -------------------------------------------------------------------------
  // on_track (exactly at benchmark)
  // -------------------------------------------------------------------------
  describe('on_track', () => {
    it('returns on_track when completion equals benchmark exactly (before day 90)', () => {
      mockCalculateBenchmark.mockReturnValue(50);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 50, milestoneDay: 45 })
      );
      expect(status).toBe('on_track');
    });

    it('returns on_track when completion equals benchmark exactly (day >= 90, sessions < 2)', () => {
      mockCalculateBenchmark.mockReturnValue(100);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 100, milestoneDay: 90, liveSessionsLast30Days: 0 })
      );
      expect(status).toBe('on_track');
    });

    it('returns on_track when completion === benchmark before day 90 (not strictly above)', () => {
      mockCalculateBenchmark.mockReturnValue(40);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 40, milestoneDay: 60 })
      );
      expect(status).toBe('on_track');
    });
  });

  // -------------------------------------------------------------------------
  // high_engagement — before day 90 (strictly above benchmark)
  // -------------------------------------------------------------------------
  describe('high_engagement before day 90', () => {
    it('returns high_engagement when completion is strictly above benchmark and milestoneDay < 90', () => {
      mockCalculateBenchmark.mockReturnValue(40);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 41, milestoneDay: 60 })
      );
      expect(status).toBe('high_engagement');
    });

    it('does NOT return high_engagement when completion equals benchmark (before day 90)', () => {
      mockCalculateBenchmark.mockReturnValue(40);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 40, milestoneDay: 60 })
      );
      expect(status).not.toBe('high_engagement');
    });

    it('returns high_engagement when milestoneDay is 0 and completion > benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(0);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 1, milestoneDay: 0 })
      );
      expect(status).toBe('high_engagement');
    });

    it('handles milestoneDay exactly = 89 (pre-90 branch)', () => {
      mockCalculateBenchmark.mockReturnValue(40);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 41, milestoneDay: 89 })
      );
      expect(status).toBe('high_engagement');
    });
  });

  // -------------------------------------------------------------------------
  // high_engagement — day 90+ (>= benchmark AND sessions >= 2)
  // -------------------------------------------------------------------------
  describe('high_engagement at day 90+', () => {
    it('returns high_engagement at exactly day 90 with sessions >= 2 and completion >= benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(80);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 80, milestoneDay: 90, liveSessionsLast30Days: 2 })
      );
      expect(status).toBe('high_engagement');
    });

    it('returns on_track at day 90 with sessions = 1 even if completion >= benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(80);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 80, milestoneDay: 90, liveSessionsLast30Days: 1 })
      );
      expect(status).toBe('on_track');
    });

    it('returns on_track at day 120 with sessions = 0', () => {
      mockCalculateBenchmark.mockReturnValue(90);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 90, milestoneDay: 120, liveSessionsLast30Days: 0 })
      );
      expect(status).toBe('on_track');
    });

    it('returns high_engagement at day 120 with sessions = 3 and completion >= benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(90);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 95, milestoneDay: 120, liveSessionsLast30Days: 3 })
      );
      expect(status).toBe('high_engagement');
    });

    it('does NOT return high_engagement at day 90+ when completion < benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(80);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 70, milestoneDay: 90, liveSessionsLast30Days: 5 })
      );
      expect(status).not.toBe('high_engagement');
    });

    it('handles milestoneDay = 90 — above benchmark, sessions < 2 → on_track not high_engagement', () => {
      mockCalculateBenchmark.mockReturnValue(40);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 41, milestoneDay: 90, liveSessionsLast30Days: 0 })
      );
      expect(status).toBe('on_track');
    });
  });

  // -------------------------------------------------------------------------
  // slightly_behind (>= 80% of benchmark, < benchmark)
  // -------------------------------------------------------------------------
  describe('slightly_behind', () => {
    it('returns slightly_behind when completion is exactly 80% of benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(50);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 40, milestoneDay: 45 })
      );
      expect(status).toBe('slightly_behind');
    });

    it('returns slightly_behind when completion is just below benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(50);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 49, milestoneDay: 45 })
      );
      expect(status).toBe('slightly_behind');
    });

    it('returns slightly_behind when completion is between 80% and 100% of benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(50);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 45, milestoneDay: 45 })
      );
      expect(status).toBe('slightly_behind');
    });

    it('does NOT return slightly_behind when completion is below 80% of benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(50);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 39, milestoneDay: 45 })
      );
      expect(status).not.toBe('slightly_behind');
    });
  });

  // -------------------------------------------------------------------------
  // at_risk (completion < 80% of benchmark)
  // -------------------------------------------------------------------------
  describe('at_risk', () => {
    it('returns at_risk when completion is far below benchmark', () => {
      mockCalculateBenchmark.mockReturnValue(50);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 10, milestoneDay: 45 })
      );
      expect(status).toBe('at_risk');
    });

    it('returns at_risk when completion = 0 but learner has logged in (not not_started)', () => {
      mockCalculateBenchmark.mockReturnValue(50);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasLoggedIn: true, hasActivity: false, milestoneDay: 45 })
      );
      expect(status).toBe('at_risk');
    });

    it('returns at_risk when completion = 0 and benchmark > 0, learner has activity', () => {
      mockCalculateBenchmark.mockReturnValue(30);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasActivity: true, hasLoggedIn: false, milestoneDay: 30 })
      );
      expect(status).toBe('at_risk');
    });

    it('returns at_risk for milestoneDay=1 with benchmark > 0 and no progress (but has login)', () => {
      mockCalculateBenchmark.mockReturnValue(1.11);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasLoggedIn: true, milestoneDay: 1 })
      );
      expect(status).toBe('at_risk');
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles benchmark = 0 — on_track when completion=0 but has login (not not_started)', () => {
      mockCalculateBenchmark.mockReturnValue(0);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasLoggedIn: true, milestoneDay: 0 })
      );
      expect(status).toBe('on_track');
    });

    it('handles benchmark = 0 with no progress and no login → not_started', () => {
      mockCalculateBenchmark.mockReturnValue(0);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, hasLoggedIn: false, hasActivity: false, milestoneDay: 0 })
      );
      expect(status).toBe('not_started');
    });

    it('handles very large milestoneDay (well beyond 90)', () => {
      mockCalculateBenchmark.mockReturnValue(100);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 100, milestoneDay: 180, liveSessionsLast30Days: 5 })
      );
      expect(status).toBe('high_engagement');
    });

    it('returns a reason string for every status path', () => {
      const scenarios: Array<Parameters<typeof calculateLearnerStatus>[0]> = [
        makeInput({ completionPercent: 0, hasLoggedIn: false, hasActivity: false }),
        makeInput({ completionPercent: 60, milestoneDay: 60 }),
        makeInput({ completionPercent: 33.33, milestoneDay: 60 }),
        makeInput({ completionPercent: 28, milestoneDay: 60 }),
        makeInput({ completionPercent: 5, milestoneDay: 60 }),
      ];
      for (const input of scenarios) {
        const { reason } = calculateLearnerStatus(input);
        expect(typeof reason).toBe('string');
        expect(reason.length).toBeGreaterThan(0);
      }
    });

    it('progress above benchmark bypasses not_started check (completionPercent > 0)', () => {
      mockCalculateBenchmark.mockReturnValue(10);
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 20, hasLoggedIn: false, hasActivity: false, milestoneDay: 30 })
      );
      expect(status).toBe('high_engagement');
    });

    it('day 1 with no login, no activity, 0% progress → not_started', () => {
      const { status } = calculateLearnerStatus(
        makeInput({ completionPercent: 0, milestoneDay: 1, hasLoggedIn: false, hasActivity: false })
      );
      expect(status).toBe('not_started');
    });
  });
});

// ---------------------------------------------------------------------------
// calculateBenchmark — real implementation tests (via vi.importActual)
// ---------------------------------------------------------------------------
describe('calculateBenchmark (real implementation)', () => {
  it('returns 0 when milestoneDay = 0', async () => {
    expect(realCalculateBenchmark(0, 90)).toBe(0);
  });

  it('returns 100 when milestoneDay equals learningTimelineDays', () => {
    expect(realCalculateBenchmark(90, 90)).toBe(100);
  });

  it('returns 100 when milestoneDay exceeds learningTimelineDays', () => {
    expect(realCalculateBenchmark(120, 90)).toBe(100);
  });

  it('returns interpolated value for day within range (day 45 of 90 → 50%)', () => {
    expect(realCalculateBenchmark(45, 90)).toBeCloseTo(50, 5);
  });

  it('returns ~33.33% for day 30 of 90', () => {
    expect(realCalculateBenchmark(30, 90)).toBeCloseTo(33.33, 1);
  });

  it('returns 100 when learningTimelineDays = 0 (guard against divide-by-zero)', () => {
    expect(realCalculateBenchmark(30, 0)).toBe(100);
  });

  it('returns 100 when learningTimelineDays is negative', () => {
    expect(realCalculateBenchmark(30, -1)).toBe(100);
  });

  it('uses default learningTimelineDays = 90 when not supplied', () => {
    expect(realCalculateBenchmark(45)).toBeCloseTo(50, 5);
  });

  it('returns 100 when learningTimelineDays = 0 regardless of milestoneDay (guard fires first)', () => {
    expect(realCalculateBenchmark(0, 0)).toBe(100);
  });

  it('clamps negative milestoneDay result to 0', () => {
    expect(realCalculateBenchmark(-30, 90)).toBe(0);
  });

  it('handles fractional days', () => {
    expect(realCalculateBenchmark(1, 90)).toBeCloseTo(1.111, 2);
  });

  it('clamps very large milestone day to 100', () => {
    expect(realCalculateBenchmark(9999, 90)).toBe(100);
  });

  it('returns 50 at the midpoint of a 30-day timeline', () => {
    expect(realCalculateBenchmark(15, 30)).toBeCloseTo(50, 5);
  });

  it('returns 50 at the midpoint of a 120-day timeline', () => {
    expect(realCalculateBenchmark(60, 120)).toBeCloseTo(50, 5);
  });
});

// ---------------------------------------------------------------------------
// getMilestoneDay — real implementation tests (via vi.importActual)
// ---------------------------------------------------------------------------
describe('getMilestoneDay (real implementation)', () => {
  it('returns 30 when startDate is null (default safe value)', () => {
    expect(realGetMilestoneDay(null)).toBe(30);
  });

  it('returns 30 for a future start date (daysSince clamps to 0, fallback to 30)', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const result = realGetMilestoneDay(future.toISOString().split('T')[0]);
    expect(result).toBe(30);
  });

  it('returns 30 for a program started today', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = realGetMilestoneDay(today);
    expect(result).toBe(30);
  });

  it('returns 30 for a program started 1 day ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const result = realGetMilestoneDay(d.toISOString().split('T')[0]);
    expect(result).toBe(30);
  });

  it('returns 30 for a program started 29 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    const result = realGetMilestoneDay(d.toISOString().split('T')[0]);
    expect(result).toBe(30);
  });

  it('returns 30 for a program started exactly 30 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const result = realGetMilestoneDay(d.toISOString().split('T')[0]);
    expect(result).toBe(30);
  });

  it('returns 60 for a program started exactly 60 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    const result = realGetMilestoneDay(d.toISOString().split('T')[0]);
    expect(result).toBe(60);
  });

  it('returns 90 for a program started exactly 90 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    const result = realGetMilestoneDay(d.toISOString().split('T')[0]);
    expect(result).toBe(90);
  });

  it('returns 120 for a program started exactly 120 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    const result = realGetMilestoneDay(d.toISOString().split('T')[0]);
    expect(result).toBe(120);
  });

  it('rounds down to nearest 30-day milestone (e.g. 89 days → 60 or 90 depending on calendar)', () => {
    const d = new Date();
    d.setDate(d.getDate() - 89);
    const result = realGetMilestoneDay(d.toISOString().split('T')[0]);
    expect([60, 90]).toContain(result);
  });

  it('returns a multiple of 30 for any valid start date', () => {
    const d = new Date();
    d.setDate(d.getDate() - 75);
    const result = realGetMilestoneDay(d.toISOString().split('T')[0]);
    expect(result).not.toBeNull();
    expect(result! % 30).toBe(0);
    expect(result).toBeGreaterThanOrEqual(30);
  });
});
