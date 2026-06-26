import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase admin before importing module under test
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import * as supabaseAdmin from '@/lib/supabase/admin';
import {
  POINTS,
  awardPoints,
  recalculateAllPoints,
  seedPointsFromActivity,
} from './calculatePoints';
import { awardAchievements } from './awardAchievements';

// ─── DB builder helpers ───────────────────────────────────────────────────────

type UpsertSpy = ReturnType<typeof vi.fn>;
type SelectSpy = ReturnType<typeof vi.fn>;

function makeTableWithUpsert(
  upsertResult: { error: null | { message: string } } = { error: null },
) {
  const upsertSpy = vi.fn().mockResolvedValue(upsertResult);
  return { upsert: upsertSpy, _upsertSpy: upsertSpy };
}

function makeTableWithSelect(rows: unknown[], error: null | { message: string } = null) {
  const selectSpy = vi.fn().mockResolvedValue({ data: rows, error });
  return { select: selectSpy, _selectSpy: selectSpy };
}

/**
 * Build a minimal chainable Supabase `from()` mock.
 * Each table entry is a factory function called with the table name.
 */
function buildDb(
  tableMap: Record<string, () => Record<string, unknown>>,
  fallbackFactory?: () => Record<string, unknown>,
) {
  const from = vi.fn().mockImplementation((table: string) => {
    const factory = tableMap[table] ?? fallbackFactory;
    if (!factory) throw new Error(`Unexpected table: ${table}`);
    return factory();
  });
  return { from };
}

// ─── chainable select().range() helper ────────────────────────────────────────
function makeSelectWithRange(
  pages: Array<{ data: unknown[] | null; error?: null | { message: string } }>,
) {
  let callCount = 0;
  const rangeFn = vi.fn().mockImplementation(() => {
    const page = pages[callCount] ?? { data: [], error: null };
    callCount++;
    return Promise.resolve({ data: page.data, error: page.error ?? null });
  });
  const notFn = vi.fn().mockReturnThis();
  const eqFn = vi.fn().mockReturnThis();
  const selectFn = vi.fn().mockReturnValue({ range: rangeFn, not: notFn, eq: eqFn });
  return { select: selectFn, not: notFn, eq: eqFn, _rangeFn: rangeFn };
}

const mockCreateAdminClient = vi.mocked(supabaseAdmin.createAdminClient);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// POINTS constants
// =============================================================================

describe('POINTS constants', () => {
  it('zoom_session equals 50', () => {
    expect(POINTS.zoom_session).toBe(50);
  });

  it('lesson_complete equals 10', () => {
    expect(POINTS.lesson_complete).toBe(10);
  });

  it('quiz_pass equals 25', () => {
    expect(POINTS.quiz_pass).toBe(25);
  });

  it('course_complete equals 100', () => {
    expect(POINTS.course_complete).toBe(100);
  });

  it('assignment equals 20', () => {
    expect(POINTS.assignment).toBe(20);
  });

  it('survey equals 15', () => {
    expect(POINTS.survey).toBe(15);
  });

  it('streak_7 equals 50', () => {
    expect(POINTS.streak_7).toBe(50);
  });

  it('streak_30 equals 200', () => {
    expect(POINTS.streak_30).toBe(200);
  });

  it('on_pace equals 30', () => {
    expect(POINTS.on_pace).toBe(30);
  });

  it('course_complete is worth more than a single lesson_complete', () => {
    expect(POINTS.course_complete).toBeGreaterThan(POINTS.lesson_complete);
  });

  it('streak_30 is the maximum single-award value', () => {
    expect(POINTS.streak_30).toBe(Math.max(...Object.values(POINTS)));
  });

  it('lesson_complete is the minimum award value', () => {
    expect(POINTS.lesson_complete).toBe(Math.min(...Object.values(POINTS)));
  });

  it('all point values are positive integers', () => {
    for (const [key, value] of Object.entries(POINTS)) {
      expect(value, `${key} should be a positive integer`).toBeGreaterThan(0);
      expect(Number.isInteger(value), `${key} should be an integer`).toBe(true);
    }
  });
});

// =============================================================================
// awardPoints
// =============================================================================

describe('awardPoints', () => {
  it('returns correct points value for lesson_complete', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-1', 'company-1', 'lesson_complete', 'ref-1');
    expect(result).toBe(POINTS.lesson_complete);
  });

  it('returns correct points value for course_complete', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-1', 'company-1', 'course_complete', 'ref-1');
    expect(result).toBe(POINTS.course_complete);
  });

  it('returns correct points value for zoom_session', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-1', null, 'zoom_session', 'zoom-session-1');
    expect(result).toBe(POINTS.zoom_session);
  });

  it('returns correct points value for assignment', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-2', 'company-2', 'assignment', 'assign-1');
    expect(result).toBe(POINTS.assignment);
  });

  it('returns correct points value for quiz_pass', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-3', 'company-3', 'quiz_pass', 'quiz-1');
    expect(result).toBe(POINTS.quiz_pass);
  });

  it('returns correct points value for survey', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-4', 'company-4', 'survey', 'survey-1');
    expect(result).toBe(POINTS.survey);
  });

  it('returns correct points for streak_7', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-5', null, 'streak_7', 'streak-ref');
    expect(result).toBe(POINTS.streak_7);
  });

  it('returns correct points for streak_30', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-5', null, 'streak_30', 'streak-ref');
    expect(result).toBe(POINTS.streak_30);
  });

  it('returns correct points for on_pace', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-6', 'company-6', 'on_pace', 'pace-ref');
    expect(result).toBe(POINTS.on_pace);
  });

  it('returns 0 when DB upsert returns an error', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: { message: 'DB failure' } });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await awardPoints('learner-1', 'company-1', 'lesson_complete', 'ref-1');
    expect(result).toBe(0);
    warnSpy.mockRestore();
  });

  it('logs a warning when DB upsert fails', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: { message: 'connection refused' } });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await awardPoints('learner-1', 'company-1', 'lesson_complete', 'ref-1');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Gamification]'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('passes correct learner_id and company_id to upsert', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    await awardPoints('learner-xyz', 'company-abc', 'lesson_complete', 'lesson-ref');
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        learner_id: 'learner-xyz',
        company_id: 'company-abc',
        event_type: 'lesson_complete',
        points_earned: POINTS.lesson_complete,
        reference_id: 'lesson-ref',
      }),
      expect.objectContaining({ onConflict: 'learner_id,event_type,reference_id', ignoreDuplicates: true }),
    );
  });

  it('accepts null for company_id', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    const result = await awardPoints('learner-1', null, 'lesson_complete', 'ref-99');
    expect(result).toBe(POINTS.lesson_complete);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: null }),
      expect.anything(),
    );
  });

  it('is idempotent — upsert uses ignoreDuplicates:true', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ upsert: upsertSpy }) }) as never,
    );
    await awardPoints('learner-1', 'company-1', 'lesson_complete', 'same-ref');
    await awardPoints('learner-1', 'company-1', 'lesson_complete', 'same-ref');
    const [, opts] = upsertSpy.mock.calls[0];
    expect(opts).toMatchObject({ ignoreDuplicates: true });
  });
});

// =============================================================================
// recalculateAllPoints
// =============================================================================

describe('recalculateAllPoints', () => {
  it('returns 0 when points_events table has no rows', async () => {
    const selectSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ select: selectSpy }) }) as never,
    );
    const result = await recalculateAllPoints();
    expect(result).toBe(0);
  });

  it('returns 0 when points_events data is null', async () => {
    const selectSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ select: selectSpy }) }) as never,
    );
    const result = await recalculateAllPoints();
    expect(result).toBe(0);
  });

  it('throws when fetching events fails', async () => {
    const selectSpy = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } });
    mockCreateAdminClient.mockReturnValue(
      buildDb({ points_events: () => ({ select: selectSpy }) }) as never,
    );
    await expect(recalculateAllPoints()).rejects.toThrow('DB down');
  });

  it('processes a single lesson_complete event and upserts correct totals', async () => {
    const events = [
      { learner_id: 'l1', company_id: 'c1', event_type: 'lesson_complete', points_earned: 10 },
    ];
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    const result = await recalculateAllPoints();
    expect(result).toBe(1);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          learner_id: 'l1',
          company_id: 'c1',
          total_points: 10,
          lesson_completion_points: 10,
        }),
      ]),
      expect.objectContaining({ onConflict: 'learner_id' }),
    );
  });

  it('aggregates zoom_session events and increments sessions_attended', async () => {
    const events = [
      { learner_id: 'l1', company_id: 'c1', event_type: 'zoom_session', points_earned: 50 },
      { learner_id: 'l1', company_id: 'c1', event_type: 'zoom_session', points_earned: 50 },
    ];
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    await recalculateAllPoints();
    const [rows] = upsertSpy.mock.calls[0];
    const learnerRow = (rows as Array<Record<string, unknown>>).find((r) => r.learner_id === 'l1');
    expect(learnerRow).toBeDefined();
    expect(learnerRow!.zoom_attendance_points).toBe(100);
    expect(learnerRow!.sessions_attended).toBe(2);
    expect(learnerRow!.total_points).toBe(100);
  });

  it('aggregates course_complete events into course_completion_points', async () => {
    const events = [
      { learner_id: 'l2', company_id: 'c1', event_type: 'course_complete', points_earned: 100 },
    ];
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    await recalculateAllPoints();
    const [rows] = upsertSpy.mock.calls[0];
    const learnerRow = (rows as Array<Record<string, unknown>>).find((r) => r.learner_id === 'l2');
    expect(learnerRow!.course_completion_points).toBe(100);
  });

  it('aggregates streak_7, streak_30, and on_pace events into streak_bonus_points', async () => {
    const events = [
      { learner_id: 'l3', company_id: 'c1', event_type: 'streak_7', points_earned: 50 },
      { learner_id: 'l3', company_id: 'c1', event_type: 'streak_30', points_earned: 200 },
      { learner_id: 'l3', company_id: 'c1', event_type: 'on_pace', points_earned: 30 },
    ];
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    await recalculateAllPoints();
    const [rows] = upsertSpy.mock.calls[0];
    const learnerRow = (rows as Array<Record<string, unknown>>).find((r) => r.learner_id === 'l3');
    expect(learnerRow!.streak_bonus_points).toBe(280);
    expect(learnerRow!.total_points).toBe(280);
  });

  it('stacks lesson_complete and course_complete into correct total', async () => {
    const events = [
      { learner_id: 'l4', company_id: 'c1', event_type: 'lesson_complete', points_earned: 10 },
      { learner_id: 'l4', company_id: 'c1', event_type: 'course_complete', points_earned: 100 },
    ];
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    await recalculateAllPoints();
    const [rows] = upsertSpy.mock.calls[0];
    const learnerRow = (rows as Array<Record<string, unknown>>).find((r) => r.learner_id === 'l4');
    expect(learnerRow!.total_points).toBe(110);
    expect(learnerRow!.lesson_completion_points).toBe(10);
    expect(learnerRow!.course_completion_points).toBe(100);
  });

  it('handles many learners independently', async () => {
    const events = [
      { learner_id: 'l-a', company_id: 'c1', event_type: 'lesson_complete', points_earned: 10 },
      { learner_id: 'l-b', company_id: 'c2', event_type: 'course_complete', points_earned: 100 },
      { learner_id: 'l-c', company_id: 'c3', event_type: 'zoom_session', points_earned: 50 },
    ];
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    const result = await recalculateAllPoints();
    expect(result).toBe(3);
    const [rows] = upsertSpy.mock.calls[0];
    expect((rows as unknown[]).length).toBe(3);
  });

  it('processes in batches of 100 — upsert called once per batch', async () => {
    const events = Array.from({ length: 150 }, (_, i) => ({
      learner_id: `l${i}`,
      company_id: 'c1',
      event_type: 'lesson_complete',
      points_earned: 10,
    }));
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    const result = await recalculateAllPoints();
    // 150 learners → 2 batches (100 + 50)
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(result).toBe(150);
  });

  it('warns on learner_points upsert error and does not throw', async () => {
    const events = [
      { learner_id: 'l5', company_id: 'c1', event_type: 'assignment', points_earned: 20 },
    ];
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: { message: 'upsert failed' } });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(recalculateAllPoints()).resolves.not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Gamification]'), expect.anything());
    warnSpy.mockRestore();
  });

  it('aggregates assignment and survey events into correct buckets', async () => {
    const events = [
      { learner_id: 'l6', company_id: 'c1', event_type: 'assignment', points_earned: 20 },
      { learner_id: 'l6', company_id: 'c1', event_type: 'survey', points_earned: 15 },
    ];
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    await recalculateAllPoints();
    const [rows] = upsertSpy.mock.calls[0];
    const row = (rows as Array<Record<string, unknown>>).find((r) => r.learner_id === 'l6');
    expect(row!.assignment_points).toBe(20);
    expect(row!.survey_points).toBe(15);
    expect(row!.total_points).toBe(35);
  });

  it('aggregates quiz_pass into quiz_points', async () => {
    const events = [
      { learner_id: 'l7', company_id: 'c1', event_type: 'quiz_pass', points_earned: 25 },
    ];
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    await recalculateAllPoints();
    const [rows] = upsertSpy.mock.calls[0];
    const row = (rows as Array<Record<string, unknown>>).find((r) => r.learner_id === 'l7');
    expect(row!.quiz_points).toBe(25);
  });

  it('handles very large point values without overflow', async () => {
    const events = Array.from({ length: 1 }, () => ({
      learner_id: 'l-big',
      company_id: 'c1',
      event_type: 'course_complete',
      points_earned: Number.MAX_SAFE_INTEGER,
    }));
    const selectSpy = vi.fn().mockResolvedValue({ data: events, error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue(
      buildDb({
        points_events: () => ({ select: selectSpy }),
        learner_points: () => ({ upsert: upsertSpy }),
      }) as never,
    );
    await recalculateAllPoints();
    const [rows] = upsertSpy.mock.calls[0];
    const row = (rows as Array<Record<string, unknown>>).find((r) => r.learner_id === 'l-big');
    expect(row!.total_points).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// =============================================================================
// seedPointsFromActivity
// =============================================================================

describe('seedPointsFromActivity', () => {
  function makeRangeable(pages: Array<unknown[] | null>) {
    let call = 0;
    const rangeFn = vi.fn().mockImplementation(() => {
      const page = pages[call] ?? null;
      call++;
      return Promise.resolve({ data: page });
    });
    const notFn = vi.fn().mockReturnThis();
    const eqFn = vi.fn().mockReturnThis();
    const selectFn = vi.fn().mockReturnValue({ range: rangeFn, not: notFn, eq: eqFn });
    return { select: selectFn, _rangeFn: rangeFn };
  }

  function makeUpsertTable() {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    return { upsert: upsertSpy, _upsertSpy: upsertSpy };
  }

  it('returns empty results array when all tables are empty', async () => {
    const emptyRangeable = () => makeRangeable([null]);
    const emptyUpsertable = () => makeUpsertTable();

    mockCreateAdminClient.mockReturnValue(
      buildDb(
        {
          learners: emptyRangeable,
          zoom_attendance: emptyRangeable,
          enrollments: emptyRangeable,
          lesson_progress: emptyRangeable,
          surveys: emptyRangeable,
          assignments: emptyRangeable,
          points_events: emptyUpsertable,
        },
      ) as never,
    );

    const result = await seedPointsFromActivity();
    expect(result).toEqual([]);
  });

  it('returns a result entry when zoom_attendance has rows', async () => {
    const zoomRows = [{ learner_id: 'l1', company_id: 'c1', zoom_session_id: 'zs-1' }];

    let tableCall = 0;
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'learners') {
        return makeRangeable([null]);
      }
      if (table === 'zoom_attendance') {
        tableCall++;
        if (tableCall === 1) {
          return makeRangeable([zoomRows, null]);
        }
        return makeRangeable([null]);
      }
      if (table === 'points_events') {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return makeRangeable([null]);
    });

    mockCreateAdminClient.mockReturnValue({ from } as never);

    const result = await seedPointsFromActivity();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].eventsInserted).toBe(1);
    expect(result[0].pointsAwarded).toBe(POINTS.zoom_session);
  });

  it('upserts zoom attendance with correct event_type and points_earned', async () => {
    const zoomRows = [
      { learner_id: 'l1', company_id: 'c1', zoom_session_id: 'zs-1' },
      { learner_id: 'l2', company_id: 'c2', zoom_session_id: 'zs-2' },
    ];

    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    let zoomCallCount = 0;

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'learners') return makeRangeable([null]);
      if (table === 'zoom_attendance') {
        zoomCallCount++;
        if (zoomCallCount === 1) return makeRangeable([zoomRows, null]);
        return makeRangeable([null]);
      }
      if (table === 'points_events') return { upsert: upsertSpy };
      return makeRangeable([null]);
    });

    mockCreateAdminClient.mockReturnValue({ from } as never);
    await seedPointsFromActivity();

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'zoom_session',
          points_earned: POINTS.zoom_session,
          learner_id: 'l1',
        }),
      ]),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });

  it('upserts course_complete events for enrollments with completed_at', async () => {
    const enrollmentRows = [{ learner_id: 'l-e', company_id: 'c1', id: 'enroll-1' }];
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'learners') return makeRangeable([null]);
      if (table === 'zoom_attendance') return makeRangeable([null]);
      if (table === 'enrollments') return makeRangeable([enrollmentRows, null]);
      if (table === 'points_events') return { upsert: upsertSpy };
      return makeRangeable([null]);
    });

    mockCreateAdminClient.mockReturnValue({ from } as never);
    await seedPointsFromActivity();

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'course_complete',
          points_earned: POINTS.course_complete,
          reference_id: 'enroll-1',
        }),
      ]),
      expect.anything(),
    );
  });

  it('upserts lesson_complete events for completed lesson_progress rows', async () => {
    const lessonRows = [{ learner_id: 'l-l', company_id: 'c1', id: 'lp-1' }];
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'learners') return makeRangeable([null]);
      if (table === 'zoom_attendance') return makeRangeable([null]);
      if (table === 'enrollments') return makeRangeable([null]);
      if (table === 'lesson_progress') return makeRangeable([lessonRows, null]);
      if (table === 'points_events') return { upsert: upsertSpy };
      return makeRangeable([null]);
    });

    mockCreateAdminClient.mockReturnValue({ from } as never);
    await seedPointsFromActivity();

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'lesson_complete',
          points_earned: POINTS.lesson_complete,
          reference_id: 'lp-1',
        }),
      ]),
      expect.anything(),
    );
  });

  it('upserts survey events for survey rows', async () => {
    const surveyRows = [{ learner_id: 'l-s', company_id: 'c1', id: 'survey-1' }];
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'learners') return makeRangeable([null]);
      if (table === 'zoom_attendance') return makeRangeable([null]);
      if (table === 'enrollments') return makeRangeable([null]);
      if (table === 'lesson_progress') return makeRangeable([null]);
      if (table === 'surveys') return makeRangeable([surveyRows, null]);
      if (table === 'points_events') return { upsert: upsertSpy };
      return makeRangeable([null]);
    });

    mockCreateAdminClient.mockReturnValue({ from } as never);
    await seedPointsFromActivity();

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'survey',
          points_earned: POINTS.survey,
        }),
      ]),
      expect.anything(),
    );
  });

  it('upserts assignment events for assignment rows', async () => {
    const assignRows = [{ learner_id: 'l-a', company_id: 'c1', id: 'assign-1' }];
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'learners') return makeRangeable([null]);
      if (table === 'zoom_attendance') return makeRangeable([null]);
      if (table === 'enrollments') return makeRangeable([null]);
      if (table === 'lesson_progress') return makeRangeable([null]);
      if (table === 'surveys') return makeRangeable([null]);
      if (table === 'assignments') return makeRangeable([assignRows, null]);
      if (table === 'points_events') return { upsert: upsertSpy };
      return makeRangeable([null]);
    });

    mockCreateAdminClient.mockReturnValue({ from } as never);
    await seedPointsFromActivity();

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'assignment',
          points_earned: POINTS.assignment,
        }),
      ]),
      expect.anything(),
    );
  });

  it('returns an array (not throws) when all sources are empty', async () => {
    const from = vi.fn().mockImplementation(() => makeRangeable([null]));
    mockCreateAdminClient.mockReturnValue({ from } as never);
    await expect(seedPointsFromActivity()).resolves.toBeInstanceOf(Array);
  });
});

// =============================================================================
// awardAchievements
// =============================================================================

describe('awardAchievements', () => {
  function buildAchievementsDb({
    achievements = [] as Array<{ slug: string; criteria_type: string; criteria_value: number; bonus_points: number }>,
    achievementsError = null as null | { message: string },
    earnedRows = [] as Array<{ learner_id: string; achievement_slug: string }>,
    learnerPoints = [] as Array<{
      learner_id: string;
      company_id: string | null;
      sessions_attended: number;
      total_points: number;
      current_streak_days: number;
      longest_streak_days: number;
      survey_points: number;
    }>,
    enrollmentCompletions = [] as Array<{ learner_id: string }>,
    quizPasses = [] as Array<{ learner_id: string }>,
    surveys = [] as Array<{ learner_id: string }>,
    upsertAchievementsResult = { error: null } as { error: null | { message: string } },
  } = {}) {
    const achievementsBadgeUpsertSpy = vi.fn().mockResolvedValue(upsertAchievementsResult);
    const pointsEventsUpsertSpy = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'achievements') {
        const selectFn = vi.fn().mockResolvedValue({
          data: achievementsError ? null : achievements,
          error: achievementsError,
        });
        return { select: selectFn };
      }
      if (table === 'learner_achievements') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: earnedRows.length > 0 ? earnedRows : null }),
          }),
          upsert: achievementsBadgeUpsertSpy,
        };
      }
      if (table === 'learner_points') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: learnerPoints.length > 0 ? learnerPoints : null }),
          }),
        };
      }
      if (table === 'enrollments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({ data: enrollmentCompletions.length > 0 ? enrollmentCompletions : null }),
          }),
        };
      }
      if (table === 'quizzes') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({ data: quizPasses.length > 0 ? quizPasses : null }),
          }),
        };
      }
      if (table === 'surveys') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({ data: surveys.length > 0 ? surveys : null }),
          }),
        };
      }
      if (table === 'points_events') {
        return { upsert: pointsEventsUpsertSpy };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    return { from, _badgeUpsert: achievementsBadgeUpsertSpy, _pointsUpsert: pointsEventsUpsertSpy };
  }

  it('returns 0 when achievements table load fails', async () => {
    const db = buildAchievementsDb({ achievementsError: { message: 'load error' } });
    mockCreateAdminClient.mockReturnValue(db as never);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Achievements]'), expect.anything());
    warnSpy.mockRestore();
  });

  it('returns 0 when achievements array is empty', async () => {
    const db = buildAchievementsDb({ achievements: [] });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(0);
    logSpy.mockRestore();
  });

  it('returns 0 when no learners have points data', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'first-zoom', criteria_type: 'zoom_sessions', criteria_value: 1, bonus_points: 0 }],
      learnerPoints: [],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(0);
    logSpy.mockRestore();
  });

  it('awards zoom_sessions achievement when sessions_attended meets threshold', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'zoom-1', criteria_type: 'zoom_sessions', criteria_value: 1, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l1', company_id: 'c1',
        sessions_attended: 1, total_points: 50,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(1);
    expect(db._badgeUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ learner_id: 'l1', achievement_slug: 'zoom-1' }),
      ]),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
    logSpy.mockRestore();
  });

  it('does not award zoom_sessions achievement when sessions_attended is below threshold', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'zoom-5', criteria_type: 'zoom_sessions', criteria_value: 5, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l2', company_id: 'c1',
        sessions_attended: 3, total_points: 150,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(0);
    logSpy.mockRestore();
  });

  it('skips achievement already in earned set — no duplicate awarded', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'zoom-1', criteria_type: 'zoom_sessions', criteria_value: 1, bonus_points: 0 }],
      earnedRows: [{ learner_id: 'l1', achievement_slug: 'zoom-1' }],
      learnerPoints: [{
        learner_id: 'l1', company_id: 'c1',
        sessions_attended: 5, total_points: 250,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(0);
    logSpy.mockRestore();
  });

  it('awards courses_complete achievement when course count meets threshold', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'course-1', criteria_type: 'courses_complete', criteria_value: 1, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l3', company_id: 'c1',
        sessions_attended: 0, total_points: 100,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
      enrollmentCompletions: [{ learner_id: 'l3' }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(1);
    logSpy.mockRestore();
  });

  it('awards quiz_passes achievement when quiz count meets threshold', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'quiz-ace', criteria_type: 'quiz_passes', criteria_value: 3, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l4', company_id: 'c1',
        sessions_attended: 0, total_points: 75,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
      quizPasses: [{ learner_id: 'l4' }, { learner_id: 'l4' }, { learner_id: 'l4' }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(1);
    logSpy.mockRestore();
  });

  it('awards streak_days achievement when longest_streak_days meets threshold', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'streaker-7', criteria_type: 'streak_days', criteria_value: 7, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l5', company_id: 'c1',
        sessions_attended: 0, total_points: 50,
        current_streak_days: 7, longest_streak_days: 7, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(1);
    logSpy.mockRestore();
  });

  it('awards surveys_submitted achievement when survey count meets threshold', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'survey-fan', criteria_type: 'surveys_submitted', criteria_value: 2, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l6', company_id: 'c1',
        sessions_attended: 0, total_points: 30,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 30,
      }],
      surveys: [{ learner_id: 'l6' }, { learner_id: 'l6' }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(1);
    logSpy.mockRestore();
  });

  it('awards lessons_complete achievement when total_points > 0', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'first-lesson', criteria_type: 'lessons_complete', criteria_value: 1, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l7', company_id: 'c1',
        sessions_attended: 0, total_points: 10,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(1);
    logSpy.mockRestore();
  });

  it('does not award lessons_complete achievement when total_points is 0', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'first-lesson', criteria_type: 'lessons_complete', criteria_value: 1, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l8', company_id: 'c1',
        sessions_attended: 0, total_points: 0,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(0);
    logSpy.mockRestore();
  });

  it('skips unknown criteria_type without awarding or throwing', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'mystery', criteria_type: 'rank_global', criteria_value: 1, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l9', company_id: 'c1',
        sessions_attended: 10, total_points: 500,
        current_streak_days: 30, longest_streak_days: 30, survey_points: 75,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(0);
    logSpy.mockRestore();
  });

  it('awards multiple achievements when learner qualifies for all', async () => {
    const db = buildAchievementsDb({
      achievements: [
        { slug: 'zoom-1', criteria_type: 'zoom_sessions', criteria_value: 1, bonus_points: 0 },
        { slug: 'course-1', criteria_type: 'courses_complete', criteria_value: 1, bonus_points: 0 },
        { slug: 'streak-7', criteria_type: 'streak_days', criteria_value: 7, bonus_points: 0 },
      ],
      learnerPoints: [{
        learner_id: 'l-all', company_id: 'c1',
        sessions_attended: 5, total_points: 500,
        current_streak_days: 10, longest_streak_days: 10, survey_points: 0,
      }],
      enrollmentCompletions: [{ learner_id: 'l-all' }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(3);
    logSpy.mockRestore();
  });

  it('awards bonus points events when bonus_points > 0', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'zoom-bonus', criteria_type: 'zoom_sessions', criteria_value: 1, bonus_points: 100 }],
      learnerPoints: [{
        learner_id: 'l-bonus', company_id: 'c1',
        sessions_attended: 2, total_points: 100,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await awardAchievements();
    expect(db._pointsUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          learner_id: 'l-bonus',
          event_type: 'achievement_zoom-bonus',
          points_earned: 100,
          reference_id: 'zoom-bonus',
        }),
      ]),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
    logSpy.mockRestore();
  });

  it('does not upsert bonus points when bonus_points is 0', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'zoom-nobns', criteria_type: 'zoom_sessions', criteria_value: 1, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l-no-bonus', company_id: 'c1',
        sessions_attended: 1, total_points: 50,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await awardAchievements();
    expect(db._pointsUpsert).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('warns on learner_achievements upsert error and handles gracefully', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'zoom-err', criteria_type: 'zoom_sessions', criteria_value: 1, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l-err', company_id: 'c1',
        sessions_attended: 5, total_points: 250,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
      upsertAchievementsResult: { error: { message: 'upsert conflict' } },
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(awardAchievements()).resolves.not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Achievements]'), expect.anything());
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('does not award achievement when learner has not crossed the threshold exactly', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'zoom-5', criteria_type: 'zoom_sessions', criteria_value: 5, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l-below', company_id: 'c1',
        sessions_attended: 4, total_points: 200,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(0);
    logSpy.mockRestore();
  });

  it('awards achievement at exact threshold boundary', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'zoom-5', criteria_type: 'zoom_sessions', criteria_value: 5, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l-exact', company_id: 'c1',
        sessions_attended: 5, total_points: 250,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await awardAchievements();
    expect(result).toBe(1);
    logSpy.mockRestore();
  });

  it('logs a summary of awarded badges', async () => {
    const db = buildAchievementsDb({
      achievements: [{ slug: 'zoom-1', criteria_type: 'zoom_sessions', criteria_value: 1, bonus_points: 0 }],
      learnerPoints: [{
        learner_id: 'l-log', company_id: 'c1',
        sessions_attended: 1, total_points: 50,
        current_streak_days: 0, longest_streak_days: 0, survey_points: 0,
      }],
    });
    mockCreateAdminClient.mockReturnValue(db as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await awardAchievements();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Achievements]'));
    logSpy.mockRestore();
  });
});
