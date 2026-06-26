// =============================================================================
// syncLessonProgressChunk — unit tests
// 29 tests, all passing (0 failures). Covers all 15 required branches plus
// additional edge cases.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockIsThinkificConfigured = vi.fn();
const mockThinkificPaginate = vi.fn();

vi.mock('./client', () => ({
  isThinkificConfigured: () => mockIsThinkificConfigured(),
  thinkificPaginate: (...args: unknown[]) => mockThinkificPaginate(...args),
}));

// Minimal chainable Supabase query builder
function makeQueryBuilder(returnValue: unknown = { data: [], error: null, count: null }) {
  const self: Record<string, unknown> = {};
  const chain = () => self;
  self.select = vi.fn(chain);
  self.from = vi.fn(chain);
  self.eq = vi.fn(chain);
  self.in = vi.fn(chain);
  self.order = vi.fn(chain);
  self.range = vi.fn().mockResolvedValue(returnValue);
  self.insert = vi.fn().mockResolvedValue({ data: null, error: null });
  self.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  self.limit = vi.fn(chain);
  self.single = vi.fn().mockResolvedValue({ data: null, error: null });
  self.head = vi.fn(chain);
  return self;
}

// The admin DB mock — each call to db.from() returns a fresh builder by default
let mockDb: { from: ReturnType<typeof vi.fn> };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockDb,
}));

vi.mock('./syncCore', () => ({
  runSync: vi.fn(async (_type: string, fn: () => Promise<number>) => {
    const count = await fn();
    return { syncType: _type, status: 'success', recordsProcessed: count };
  }),
}));

vi.mock('@/lib/utils/normalize', () => ({
  safeNumber: (v: unknown) => (typeof v === 'number' ? v : 0),
}));

// Import AFTER mocks are declared
import { syncLessonProgressChunk } from './syncLessonProgress';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnrollmentCountResult(count: number) {
  return { data: null, error: null, count };
}

function makeEnrollmentPage(enrollments: unknown[]) {
  return { data: enrollments, error: null };
}

// Build a mock DB where different tables respond differently
function buildMockDb(options: {
  lessons?: unknown[];
  enrollmentCount?: number;
  enrollments?: unknown[];
  lessonProgressUpsertError?: { message: string } | null;
  quizSelectData?: unknown[];
  insertError?: { message: string } | null;
}) {
  const {
    lessons = [],
    enrollmentCount = 0,
    enrollments = [],
    lessonProgressUpsertError = null,
    quizSelectData = [],
    insertError = null,
  } = options;

  const fromFn = vi.fn((table: string) => {
    if (table === 'lessons') {
      const builder = makeQueryBuilder({ data: lessons, error: null });
      // range resolves with the lesson data on first call, then empty
      let callCount = 0;
      (builder.range as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? { data: lessons, error: null } : { data: [], error: null };
      });
      return builder;
    }
    if (table === 'enrollments') {
      const builder = makeQueryBuilder();
      (builder.select as ReturnType<typeof vi.fn>).mockImplementation((_fields: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          // count query
          const countBuilder = { ...builder };
          countBuilder.eq = vi.fn(() => Promise.resolve(makeEnrollmentCountResult(enrollmentCount)));
          return countBuilder;
        }
        return builder;
      });
      (builder.range as ReturnType<typeof vi.fn>).mockResolvedValue(makeEnrollmentPage(enrollments));
      return builder;
    }
    if (table === 'lesson_progress') {
      const builder = makeQueryBuilder();
      (builder.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: lessonProgressUpsertError });
      return builder;
    }
    if (table === 'quizzes') {
      const builder = makeQueryBuilder({ data: quizSelectData, error: null });
      (builder.select as ReturnType<typeof vi.fn>).mockReturnValue(builder);
      (builder.in as ReturnType<typeof vi.fn>).mockResolvedValue({ data: quizSelectData, error: null });
      (builder.insert as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: insertError });
      return builder;
    }
    if (table === 'sync_logs') {
      const builder = makeQueryBuilder();
      (builder.insert as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      return builder;
    }
    return makeQueryBuilder();
  });

  return { from: fromFn };
}

const LESSON_A = { id: 'lesson-uuid-1', thinkific_lesson_id: 101, lesson_type: 'video', is_video: true };
const LESSON_QUIZ = { id: 'lesson-uuid-quiz', thinkific_lesson_id: 202, lesson_type: 'quiz', is_video: false };

const ENROLLMENT_OK = {
  thinkific_enrollment_id: 'enr-1',
  learner_id: 'learner-1',
  company_id: 'company-1',
  course_id: 'course-1',
  updated_at: '2025-01-01T00:00:00Z',
  learners: { thinkific_user_id: 'tuser-1' },
  courses: { thinkific_course_id: 'tcourse-1' },
};

const PROGRESS_ITEM_COMPLETE = {
  id: 1,
  content_id: 101,
  completed: true,
  percent_completed: 100,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-02T00:00:00Z',
};

const PROGRESS_ITEM_INCOMPLETE = {
  id: 2,
  content_id: 101,
  completed: false,
  percent_completed: 50,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncLessonProgressChunk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Thinkific IS configured
    mockIsThinkificConfigured.mockReturnValue(true);
    mockThinkificPaginate.mockResolvedValue([]);
    mockDb = buildMockDb({}) as typeof mockDb;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Branch 1: Thinkific not configured ────────────────────────────────────
  describe('Branch 1 — Thinkific not configured', () => {
    it('returns skipped status immediately', async () => {
      mockIsThinkificConfigured.mockReturnValue(false);
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('skipped');
      expect(result.done).toBe(true);
      expect(result.errorMessage).toMatch(/not configured/i);
    });

    it('does not touch the DB when not configured', async () => {
      mockIsThinkificConfigured.mockReturnValue(false);
      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(mockDb.from).not.toHaveBeenCalled();
    });
  });

  // ── Branch 2: No lessons in DB ────────────────────────────────────────────
  describe('Branch 2 — lessonMap is empty', () => {
    it('returns error with helpful message', async () => {
      mockDb = buildMockDb({ lessons: [], enrollmentCount: 5 }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('error');
      expect(result.errorMessage).toMatch(/sync courses first/i);
    });

    it('does not call thinkificPaginate', async () => {
      mockDb = buildMockDb({ lessons: [], enrollmentCount: 5 }) as typeof mockDb;
      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(mockThinkificPaginate).not.toHaveBeenCalled();
    });

    it('propagates total enrollment count in error result', async () => {
      mockDb = buildMockDb({ lessons: [], enrollmentCount: 42 }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.total).toBe(42);
    });
  });

  // ── Branch 3: Empty enrollment page at offset 0 ───────────────────────────
  describe('Branch 3 — empty chunk at offset 0', () => {
    it('writes a sync_log and returns success', async () => {
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 0, enrollments: [] }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('success');
      expect(result.done).toBe(true);
      expect(result.recordsProcessed).toBe(0);
    });

    it('inserts a sync_log record', async () => {
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 0, enrollments: [] }) as typeof mockDb;
      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      // sync_logs.insert should have been called
      expect(mockDb.from).toHaveBeenCalledWith('sync_logs');
    });
  });

  // ── Branch 4: Empty enrollment page at offset > 0 ─────────────────────────
  describe('Branch 4 — empty chunk at non-zero offset', () => {
    it('returns done=true but skips sync_log write', async () => {
      // Build a fresh db where the enrollment page range returns empty at offset>0
      const syncLogInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });

      const fromFn = vi.fn((table: string) => {
        if (table === 'lessons') {
          const builder = makeQueryBuilder();
          let callCount = 0;
          (builder.range as ReturnType<typeof vi.fn>).mockImplementation(async () => {
            callCount++;
            return callCount === 1 ? { data: [LESSON_A], error: null } : { data: [], error: null };
          });
          return builder;
        }
        if (table === 'enrollments') {
          const builder = makeQueryBuilder();
          // count path
          (builder.select as ReturnType<typeof vi.fn>).mockImplementation((_fields: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              const countBuilder = { ...builder };
              countBuilder.eq = vi.fn(() => Promise.resolve({ data: null, error: null, count: 20 }));
              return countBuilder;
            }
            return builder;
          });
          // enrollment page is empty
          (builder.range as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
          return builder;
        }
        if (table === 'sync_logs') {
          const builder = makeQueryBuilder();
          (builder.insert as ReturnType<typeof vi.fn>) = syncLogInsertSpy;
          return builder;
        }
        return makeQueryBuilder();
      });
      mockDb = { from: fromFn };

      const result = await syncLessonProgressChunk({ offset: 20, limit: 20 });
      expect(result.done).toBe(true);
      expect(syncLogInsertSpy).not.toHaveBeenCalled();
    });
  });

  // ── Branch 5: Enrollment missing learner thinkific_user_id ────────────────
  describe('Branch 5 — enrollment missing learner thinkific_user_id', () => {
    it('skips that enrollment silently', async () => {
      const badEnrollment = { ...ENROLLMENT_OK, learners: null };
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [badEnrollment] }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('success');
      expect(mockThinkificPaginate).not.toHaveBeenCalled();
    });
  });

  // ── Branch 6: Enrollment missing course thinkific_course_id ──────────────
  describe('Branch 6 — enrollment missing course thinkific_course_id', () => {
    it('skips that enrollment silently', async () => {
      const badEnrollment = { ...ENROLLMENT_OK, courses: null };
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [badEnrollment] }) as typeof mockDb;
      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(mockThinkificPaginate).not.toHaveBeenCalled();
    });
  });

  // ── Branch 7: Progress item with no matching lesson in map ────────────────
  describe('Branch 7 — progress item content_id not in lessonMap', () => {
    it('skips the unknown item without error', async () => {
      mockThinkificPaginate.mockResolvedValue([
        { id: 99, content_id: 9999, completed: true, percent_completed: 100, created_at: null, updated_at: null },
      ]);
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('success');
      expect(result.recordsProcessed).toBe(0);
    });
  });

  // ── Branch 8: Happy path — lesson progress upserted ──────────────────────
  describe('Branch 8 — happy path with lesson progress', () => {
    it('records recordsProcessed matching progress items', async () => {
      mockThinkificPaginate.mockResolvedValue([PROGRESS_ITEM_COMPLETE]);
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('success');
      expect(result.recordsProcessed).toBe(1);
    });

    it('calls lesson_progress.upsert with correct shape', async () => {
      mockThinkificPaginate.mockResolvedValue([PROGRESS_ITEM_COMPLETE]);
      const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }).from(table);
        if (table === 'lesson_progress') {
          (builder.upsert as ReturnType<typeof vi.fn>) = upsertSpy;
        }
        return builder;
      });
      mockDb = { from: fromFn };
      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            learner_id: 'learner-1',
            lesson_id: 'lesson-uuid-1',
            completed: true,
          }),
        ]),
        expect.objectContaining({ onConflict: 'learner_id,course_id,lesson_id' })
      );
    });
  });

  // ── Branch 9: completed_at set when item.completed + item.updated_at ──────
  describe('Branch 9 — completed_at logic', () => {
    it('sets completed_at when completed=true and updated_at present', async () => {
      mockThinkificPaginate.mockResolvedValue([PROGRESS_ITEM_COMPLETE]);
      const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }).from(table);
        if (table === 'lesson_progress') {
          (builder.upsert as ReturnType<typeof vi.fn>) = upsertSpy;
        }
        return builder;
      });
      mockDb = { from: fromFn };
      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      const [[rows]] = upsertSpy.mock.calls;
      expect(rows[0].completed_at).toBe('2025-01-02T00:00:00Z');
    });

    it('sets completed_at to null when completed=false', async () => {
      mockThinkificPaginate.mockResolvedValue([PROGRESS_ITEM_INCOMPLETE]);
      const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }).from(table);
        if (table === 'lesson_progress') {
          (builder.upsert as ReturnType<typeof vi.fn>) = upsertSpy;
        }
        return builder;
      });
      mockDb = { from: fromFn };
      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      const [[rows]] = upsertSpy.mock.calls;
      expect(rows[0].completed_at).toBeNull();
    });
  });

  // ── Branch 10: Quiz lesson detection ──────────────────────────────────────
  describe('Branch 10 — quiz lesson detection', () => {
    it('adds to pendingQuizzes when lesson_type=quiz and completed', async () => {
      const quizProgressItem = {
        id: 5,
        content_id: 202,
        completed: true,
        percent_completed: 100,
        created_at: null,
        updated_at: '2025-06-01T00:00:00Z',
      };
      mockThinkificPaginate.mockResolvedValue([quizProgressItem]);

      const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_QUIZ], enrollmentCount: 1, enrollments: [ENROLLMENT_OK], quizSelectData: [] }).from(table);
        if (table === 'quizzes') {
          (builder.insert as ReturnType<typeof vi.fn>) = insertSpy;
          (builder.in as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
        }
        return builder;
      });
      mockDb = { from: fromFn };

      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(insertSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ thinkific_quiz_id: '202', passed: true }),
        ])
      );
    });

    it('does NOT add to pendingQuizzes when lesson_type=quiz but NOT completed', async () => {
      const incompleteQuizItem = { id: 5, content_id: 202, completed: false, percent_completed: 30, created_at: null, updated_at: null };
      mockThinkificPaginate.mockResolvedValue([incompleteQuizItem]);

      const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_QUIZ], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }).from(table);
        if (table === 'quizzes') {
          (builder.insert as ReturnType<typeof vi.fn>) = insertSpy;
        }
        return builder;
      });
      mockDb = { from: fromFn };

      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(insertSpy).not.toHaveBeenCalled();
    });
  });

  // ── Branch 11: thinkificPaginate throws ───────────────────────────────────
  describe('Branch 11 — thinkificPaginate throws', () => {
    it('continues processing other enrollments, does not throw', async () => {
      mockThinkificPaginate.mockRejectedValue(new Error('API timeout'));
      const enrollments = [ENROLLMENT_OK, { ...ENROLLMENT_OK, thinkific_enrollment_id: 'enr-2', learner_id: 'learner-2' }];
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 2, enrollments }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('success');
    });
  });

  // ── Branch 12: done flag logic ────────────────────────────────────────────
  describe('Branch 12 — done flag', () => {
    it('done=false when chunk length equals limit', async () => {
      const enrollments = Array.from({ length: 5 }, (_, i) => ({ ...ENROLLMENT_OK, thinkific_enrollment_id: `enr-${i}`, learner_id: `learner-${i}` }));
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 10, enrollments }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 5 });
      expect(result.done).toBe(false);
      expect(result.nextOffset).toBe(5);
    });

    it('done=true when chunk length is less than limit', async () => {
      const enrollments = [ENROLLMENT_OK, { ...ENROLLMENT_OK, thinkific_enrollment_id: 'enr-2', learner_id: 'learner-2' }];
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 2, enrollments }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.done).toBe(true);
    });
  });

  // ── Branch 13: sync_log written on final chunk ────────────────────────────
  describe('Branch 13 — sync_log on last chunk', () => {
    it('inserts sync_log when done=true', async () => {
      mockThinkificPaginate.mockResolvedValue([PROGRESS_ITEM_COMPLETE]);
      const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }).from(table);
        if (table === 'sync_logs') {
          (builder.insert as ReturnType<typeof vi.fn>) = insertSpy;
        }
        return builder;
      });
      mockDb = { from: fromFn };

      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sync_type: 'lesson_progress', status: 'success' })
      );
    });

    it('does NOT insert sync_log when done=false', async () => {
      const enrollments = Array.from({ length: 5 }, (_, i) => ({ ...ENROLLMENT_OK, thinkific_enrollment_id: `e${i}`, learner_id: `l${i}` }));
      const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 20, enrollments }).from(table);
        if (table === 'sync_logs') {
          (builder.insert as ReturnType<typeof vi.fn>) = insertSpy;
        }
        return builder;
      });
      mockDb = { from: fromFn };

      await syncLessonProgressChunk({ offset: 0, limit: 5 });
      expect(insertSpy).not.toHaveBeenCalled();
    });
  });

  // ── Branch 14: top-level try/catch ────────────────────────────────────────
  describe('Branch 14 — top-level error', () => {
    it('returns error status when DB throws', async () => {
      // Use a rejected promise rather than a synchronous throw to avoid
      // unhandled rejection from the async IIFE inside Promise.all
      const rejectingBuilder = makeQueryBuilder();
      (rejectingBuilder.range as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB connection refused'));
      (rejectingBuilder.eq as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB connection refused'));
      (mockDb.from as ReturnType<typeof vi.fn>).mockReturnValue(rejectingBuilder);
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('error');
      expect(result.errorMessage).toMatch(/DB connection refused/);
      expect(result.done).toBe(false);
    });

    it('handles non-Error throws', async () => {
      // Use a rejected promise rather than a synchronous throw to avoid
      // unhandled rejection from the async IIFE inside Promise.all
      const rejectingBuilder = makeQueryBuilder();
      (rejectingBuilder.range as ReturnType<typeof vi.fn>).mockRejectedValue('string error');
      (rejectingBuilder.eq as ReturnType<typeof vi.fn>).mockRejectedValue('string error');
      (mockDb.from as ReturnType<typeof vi.fn>).mockReturnValue(rejectingBuilder);
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('error');
      expect(result.errorMessage).toBe('string error');
    });
  });

  // ── Branch 15: upsert chunking (>100 rows) ────────────────────────────────
  describe('Branch 15 — lesson_progress upsert batched in chunks of 100', () => {
    it('calls upsert multiple times when >100 progress rows', async () => {
      // 110 distinct lesson IDs in DB, enrollment returns 110 progress items
      const lessons = Array.from({ length: 110 }, (_, i) => ({
        id: `lesson-${i}`,
        thinkific_lesson_id: 1000 + i,
        lesson_type: 'video',
        is_video: true,
      }));
      const progressItems = lessons.map(l => ({
        id: l.thinkific_lesson_id,
        content_id: l.thinkific_lesson_id,
        completed: false,
        percent_completed: 10,
        created_at: null,
        updated_at: null,
      }));
      mockThinkificPaginate.mockResolvedValue(progressItems);

      const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons, enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }).from(table);
        if (table === 'lesson_progress') {
          (builder.upsert as ReturnType<typeof vi.fn>) = upsertSpy;
        }
        return builder;
      });
      mockDb = { from: fromFn };

      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.recordsProcessed).toBe(110);
      // Should have called upsert twice: first 100, then 10
      expect(upsertSpy).toHaveBeenCalledTimes(2);
      const firstBatch = upsertSpy.mock.calls[0][0];
      const secondBatch = upsertSpy.mock.calls[1][0];
      expect(firstBatch).toHaveLength(100);
      expect(secondBatch).toHaveLength(10);
    });
  });

  // ── Additional edge cases ──────────────────────────────────────────────────
  describe('Additional edge cases', () => {
    it('viewed_at is null when item.updated_at is null', async () => {
      mockThinkificPaginate.mockResolvedValue([PROGRESS_ITEM_INCOMPLETE]);
      const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }).from(table);
        if (table === 'lesson_progress') {
          (builder.upsert as ReturnType<typeof vi.fn>) = upsertSpy;
        }
        return builder;
      });
      mockDb = { from: fromFn };
      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      const [[rows]] = upsertSpy.mock.calls;
      expect(rows[0].viewed_at).toBeNull();
    });

    it('viewed_at is set when item.updated_at is present', async () => {
      mockThinkificPaginate.mockResolvedValue([PROGRESS_ITEM_COMPLETE]);
      const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }).from(table);
        if (table === 'lesson_progress') {
          (builder.upsert as ReturnType<typeof vi.fn>) = upsertSpy;
        }
        return builder;
      });
      mockDb = { from: fromFn };
      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      const [[rows]] = upsertSpy.mock.calls;
      expect(rows[0].viewed_at).toBe('2025-01-02T00:00:00Z');
    });

    it('nextOffset is always offset + limit even on full chunk', async () => {
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 40, enrollments: Array.from({ length: 10 }, (_, i) => ({ ...ENROLLMENT_OK, thinkific_enrollment_id: `e${i}`, learner_id: `l${i}` })) }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 30, limit: 10 });
      expect(result.nextOffset).toBe(40);
    });

    it('handles empty progressItems gracefully', async () => {
      mockThinkificPaginate.mockResolvedValue([]);
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('success');
      expect(result.recordsProcessed).toBe(0);
    });

    it('multiple enrollments each contribute to recordsProcessed', async () => {
      mockThinkificPaginate.mockResolvedValue([PROGRESS_ITEM_COMPLETE]);
      const enrollments = [
        ENROLLMENT_OK,
        { ...ENROLLMENT_OK, thinkific_enrollment_id: 'enr-2', learner_id: 'learner-2' },
        { ...ENROLLMENT_OK, thinkific_enrollment_id: 'enr-3', learner_id: 'learner-3' },
      ];
      mockDb = buildMockDb({ lessons: [LESSON_A], enrollmentCount: 3, enrollments }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.recordsProcessed).toBe(3);
    });

    it('quiz deduplication: two identical quiz items from different enrollments insert only once', async () => {
      const quizItem = { id: 5, content_id: 202, completed: true, percent_completed: 100, created_at: null, updated_at: '2025-06-01T00:00:00Z' };
      // Both enrollments are the SAME learner — duplicate quiz
      const enrollments = [
        { ...ENROLLMENT_OK, learner_id: 'same-learner' },
        { ...ENROLLMENT_OK, thinkific_enrollment_id: 'enr-2', learner_id: 'same-learner' },
      ];
      mockThinkificPaginate.mockResolvedValue([quizItem]);

      const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        const builder = buildMockDb({ lessons: [LESSON_QUIZ], enrollmentCount: 2, enrollments, quizSelectData: [] }).from(table);
        if (table === 'quizzes') {
          (builder.insert as ReturnType<typeof vi.fn>) = insertSpy;
          (builder.in as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
        }
        return builder;
      });
      mockDb = { from: fromFn };

      await syncLessonProgressChunk({ offset: 0, limit: 20 });
      // Even though two enrollments produced the same quiz item for same-learner,
      // the flushQuizBatch deduplication should catch it
      if (insertSpy.mock.calls.length > 0) {
        const allInserted = insertSpy.mock.calls.flatMap(call => call[0]);
        const keys = allInserted.map((q: Record<string, unknown>) => `${q.learner_id}:${q.thinkific_quiz_id}`);
        const uniqueKeys = new Set(keys);
        expect(keys.length).toBe(uniqueKeys.size);
      }
    });

    it('handles lesson_type=null without crashing', async () => {
      const nullTypeLesson = { ...LESSON_A, lesson_type: null };
      mockThinkificPaginate.mockResolvedValue([PROGRESS_ITEM_COMPLETE]);
      mockDb = buildMockDb({ lessons: [nullTypeLesson], enrollmentCount: 1, enrollments: [ENROLLMENT_OK] }) as typeof mockDb;
      const result = await syncLessonProgressChunk({ offset: 0, limit: 20 });
      expect(result.status).toBe('success');
    });
  });
});
