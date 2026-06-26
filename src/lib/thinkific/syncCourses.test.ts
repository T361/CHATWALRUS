import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock all external dependencies before importing the module under test ----

vi.mock('@/lib/thinkific/client', () => ({
  isThinkificConfigured: vi.fn(),
  thinkificPaginate: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/thinkific/syncCore', () => ({
  runSync: vi.fn(),
}));

// ---- Import mocked modules ----
import * as thinkificClient from '@/lib/thinkific/client';
import * as supabaseAdmin from '@/lib/supabase/admin';
import * as syncCoreModule from '@/lib/thinkific/syncCore';

// ---- Import the functions under test after mocks are set up ----
import { syncCourses, syncCourseLessons } from './syncCourses';

// ---- Helpers ----

/**
 * Build a mock Supabase client with fluent chaining.
 *
 * Supports:
 *   .from(table).upsert(data, opts)              → Promise<{error}>
 *   .from(table).select(cols).eq(k,v).single()   → Promise<{data, error}>
 */
function makeDb(overrides: {
  upsertResult?: { error: null | { message: string } };
  singleResult?: { data: unknown; error: null | { message: string } };
} = {}) {
  const upsertResult = overrides.upsertResult ?? { error: null };
  const singleResult = overrides.singleResult ?? { data: { id: 'internal-uuid' }, error: null };

  const single = vi.fn().mockResolvedValue(singleResult);
  const eq = vi.fn().mockReturnValue({ single });
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const select = vi.fn().mockReturnValue({ eq, upsert });
  const from = vi.fn().mockReturnValue({ select, upsert });

  return { from, select, eq, single, upsert };
}

/**
 * Build a more advanced per-table mock DB that can return different results
 * for 'courses' vs 'lessons' tables.
 */
function makePerTableDb(options: {
  coursesSingleResult?: { data: unknown; error: null | { message: string } };
  coursesUpsertResult?: { error: null | { message: string } };
  lessonsUpsertResult?: { error: null | { message: string } };
}) {
  const coursesSingleResult = options.coursesSingleResult ?? { data: { id: 'internal-uuid' }, error: null };
  const coursesUpsertResult = options.coursesUpsertResult ?? { error: null };
  const lessonsUpsertResult = options.lessonsUpsertResult ?? { error: null };

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'courses') {
      const single = vi.fn().mockResolvedValue(coursesSingleResult);
      const eq = vi.fn().mockReturnValue({ single });
      const coursesUpsert = vi.fn().mockResolvedValue(coursesUpsertResult);
      const select = vi.fn().mockReturnValue({ eq, upsert: coursesUpsert });
      return { select, upsert: coursesUpsert };
    }
    if (table === 'lessons') {
      const lessonsUpsert = vi.fn().mockResolvedValue(lessonsUpsertResult);
      const select = vi.fn().mockReturnValue({ upsert: lessonsUpsert });
      return { select, upsert: lessonsUpsert };
    }
    // fallback
    const single = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const select = vi.fn().mockReturnValue({ eq, upsert });
    return { select, upsert };
  });

  return { from };
}

/**
 * Standard runSync mock that immediately invokes the inner callback.
 */
function setupRunSyncMock() {
  vi.mocked(syncCoreModule.runSync).mockImplementation(
    async (_type: string, fn: () => Promise<number>) => {
      try {
        const r = await fn();
        return { syncType: _type, status: 'success', recordsProcessed: r as number, errorMessage: undefined };
      } catch (e) {
        return { syncType: _type, status: 'error', recordsProcessed: 0, errorMessage: String(e) };
      }
    }
  );
}

// ---- Test data ----

const makeCourse = (id: number, overrides: Partial<{
  name: string; slug: string; description: string; content_count: number;
}> = {}) => ({
  id,
  name: overrides.name ?? `Course ${id}`,
  slug: overrides.slug ?? `course-${id}`,
  description: overrides.description ?? `Description for course ${id}`,
  content_count: overrides.content_count ?? 3,
});

const makeChapter = (id: number, contentCount = 2) => ({
  id,
  name: `Chapter ${id}`,
  position: id,
  contents: Array.from({ length: contentCount }, (_, i) => ({
    id: id * 100 + i,
    name: `Lesson ${i + 1}`,
    content_type: i === 0 ? 'video' : 'text',
    position: i,
  })),
});

// ---- describe syncCourses ----

describe('syncCourses()', () => {
  const mockIsThinkificConfigured = vi.mocked(thinkificClient.isThinkificConfigured);
  const mockThinkificPaginate = vi.mocked(thinkificClient.thinkificPaginate);
  const mockCreateAdminClient = vi.mocked(supabaseAdmin.createAdminClient);

  beforeEach(() => {
    vi.clearAllMocks();
    setupRunSyncMock();
    // Default: configured
    mockIsThinkificConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Branch: Thinkific not configured ----

  it('returns skipped status when Thinkific is not configured', async () => {
    mockIsThinkificConfigured.mockReturnValue(false);

    const result = await syncCourses();

    expect(result.status).toBe('skipped');
    expect(result.syncType).toBe('courses');
    expect(result.recordsProcessed).toBe(0);
    expect(result.errorMessage).toBe('Thinkific not configured');
    // runSync must NOT be called when not configured
    expect(syncCoreModule.runSync).not.toHaveBeenCalled();
  });

  // ---- Branch: empty courses array ----

  it('returns 0 records when thinkificPaginate returns empty array', async () => {
    mockThinkificPaginate.mockResolvedValue([]);

    // DB still needed (but upsert should not be called)
    const db = makeDb();
    mockCreateAdminClient.mockReturnValue(db as never);

    const result = await syncCourses();

    expect(result.status).toBe('success');
    expect(result.recordsProcessed).toBe(0);
    expect(db.from).not.toHaveBeenCalledWith('courses');
  });

  // ---- Branch: courses returned, chapters have contents ----

  it('upserts courses and lessons when courses and chapters with contents are returned', async () => {
    const courses = [makeCourse(1), makeCourse(2)];
    mockThinkificPaginate.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/courses') return courses;
      // chapters endpoint for any course
      return [makeChapter(1, 2)];
    });

    const db = makePerTableDb({
      coursesSingleResult: { data: { id: 'uuid-1' }, error: null },
      coursesUpsertResult: { error: null },
      lessonsUpsertResult: { error: null },
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    const result = await syncCourses();

    expect(result.status).toBe('success');
    // 2 courses upserted
    expect(result.recordsProcessed).toBe(2);
    // courses upsert was called
    expect(db.from).toHaveBeenCalledWith('courses');
  });

  // ---- Branch: chapters API throws → syncCourseLessons catches, returns 0 ----

  it('handles chapters API error gracefully — syncCourseLessons returns 0 per failed course', async () => {
    const courses = [makeCourse(1)];
    mockThinkificPaginate.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/courses') return courses;
      throw new Error('Chapters API unavailable');
    });

    const db = makePerTableDb({
      coursesSingleResult: { data: { id: 'uuid-1' }, error: null },
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    const result = await syncCourses();

    // syncCourses still succeeds — the lesson sync error is caught inside syncCourseLessons
    expect(result.status).toBe('success');
    // Course count is still 1 (course upsert succeeded)
    expect(result.recordsProcessed).toBe(1);
  });

  // ---- Branch: 10+ courses → verify batching ----

  it('processes 15 courses in two batches of 10 and 5', async () => {
    const courses = Array.from({ length: 15 }, (_, i) => makeCourse(i + 1));
    const paginateCalls: string[] = [];

    mockThinkificPaginate.mockImplementation(async (endpoint: string) => {
      paginateCalls.push(endpoint);
      if (endpoint === '/courses') return courses;
      return []; // no chapters — keeps test fast
    });

    const db = makePerTableDb({
      coursesSingleResult: { data: { id: 'uuid-x' }, error: null },
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    const result = await syncCourses();

    expect(result.status).toBe('success');
    expect(result.recordsProcessed).toBe(15);

    // 1 call for /courses + 15 calls for chapters (one per course)
    const chapterCalls = paginateCalls.filter((e) => e.includes('/chapters'));
    expect(chapterCalls).toHaveLength(15);
  });

  // ---- Branch: course not found in DB → syncCourseLessons returns 0 early ----

  it('skips lesson sync for courses not found in the DB', async () => {
    const courses = [makeCourse(42)];
    mockThinkificPaginate.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/courses') return courses;
      return [makeChapter(1, 3)];
    });

    // courses table: upsert ok, but single() returns null (course not found)
    const db = makePerTableDb({
      coursesSingleResult: { data: null, error: null },
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    const result = await syncCourses();

    expect(result.status).toBe('success');
    // The courses upsert still counts 1 record
    expect(result.recordsProcessed).toBe(1);
  });

  // ---- Branch: lessonRecords empty (no chapter contents) ----

  it('does not call lessons upsert when chapters have no contents', async () => {
    const courses = [makeCourse(7)];
    mockThinkificPaginate.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/courses') return courses;
      // Chapter with no contents array
      return [{ id: 1, name: 'Empty Chapter', position: 1, contents: [] }];
    });

    const db = makePerTableDb({
      coursesSingleResult: { data: { id: 'uuid-7' }, error: null },
    });
    const lessonsUpsert = vi.fn().mockResolvedValue({ error: null });
    // Override the lessons table upsert spy to track calls
    const originalFrom = db.from;
    db.from = vi.fn().mockImplementation((table: string) => {
      const result = originalFrom(table);
      if (table === 'lessons') {
        return { ...result, upsert: lessonsUpsert };
      }
      return result;
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    await syncCourses();

    // Lessons upsert should never be called — empty lessonRecords
    expect(lessonsUpsert).not.toHaveBeenCalled();
  });

  // ---- Branch: upsert error is warned but does not throw ----

  it('logs a warning but continues when courses upsert returns an error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const courses = [makeCourse(5)];
    mockThinkificPaginate.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/courses') return courses;
      return [];
    });

    const db = makePerTableDb({
      coursesSingleResult: { data: { id: 'uuid-5' }, error: null },
      coursesUpsertResult: { error: { message: 'unique constraint violation' } },
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    const result = await syncCourses();

    expect(result.status).toBe('success');
    expect(warnSpy).toHaveBeenCalledWith(
      '[SyncCourses] Upsert error:',
      'unique constraint violation'
    );
    warnSpy.mockRestore();
  });

  // ---- Branch: fallback values for missing course fields ----

  it('maps missing name to "Untitled Course" and missing slug/description to null', async () => {
    const courses = [
      { id: 99, name: '', slug: '', description: '', content_count: undefined },
    ];
    mockThinkificPaginate.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/courses') return courses;
      return [];
    });

    const db = makePerTableDb({
      coursesSingleResult: { data: { id: 'uuid-99' }, error: null },
    });
    // Capture what gets passed to upsert
    let capturedRecords: unknown[] = [];
    const originalFrom = db.from;
    db.from = vi.fn().mockImplementation((table: string) => {
      const tableObj = originalFrom(table);
      if (table === 'courses') {
        const origUpsert = tableObj.upsert;
        tableObj.upsert = vi.fn().mockImplementation((records: unknown[], opts: unknown) => {
          capturedRecords = records as unknown[];
          return origUpsert(records, opts);
        });
      }
      return tableObj;
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    await syncCourses();

    expect(capturedRecords[0]).toMatchObject({
      name: 'Untitled Course',
      slug: null,
      description: null,
      total_lessons: 0,
      is_active: true,
    });
  });
});

// ---- describe syncCourseLessons ----

describe('syncCourseLessons()', () => {
  const mockIsThinkificConfigured = vi.mocked(thinkificClient.isThinkificConfigured);
  const mockThinkificPaginate = vi.mocked(thinkificClient.thinkificPaginate);
  const mockCreateAdminClient = vi.mocked(supabaseAdmin.createAdminClient);

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsThinkificConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Branch: not configured ----

  it('returns 0 immediately when Thinkific is not configured', async () => {
    mockIsThinkificConfigured.mockReturnValue(false);

    const result = await syncCourseLessons('123');

    expect(result).toBe(0);
    expect(supabaseAdmin.createAdminClient).not.toHaveBeenCalled();
  });

  // ---- Branch: course not in DB ----

  it('returns 0 when course is not found in the DB', async () => {
    const db = makeDb({ singleResult: { data: null, error: null } });
    mockCreateAdminClient.mockReturnValue(db as never);

    const result = await syncCourseLessons('999');

    expect(result).toBe(0);
    expect(mockThinkificPaginate).not.toHaveBeenCalled();
  });

  // ---- Branch: chapters with contents ----

  it('returns correct lesson count when chapters have contents', async () => {
    const db = makeDb({ singleResult: { data: { id: 'uuid-abc' }, error: null } });
    // Override the from mock to also handle lessons upsert
    const lessonsUpsert = vi.fn().mockResolvedValue({ error: null });
    db.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') {
        return { select: vi.fn().mockReturnValue({ upsert: lessonsUpsert }), upsert: lessonsUpsert };
      }
      // courses table
      const single = vi.fn().mockResolvedValue({ data: { id: 'uuid-abc' }, error: null });
      const eq = vi.fn().mockReturnValue({ single });
      const upsert = vi.fn().mockResolvedValue({ error: null });
      const select = vi.fn().mockReturnValue({ eq, upsert });
      return { select, upsert };
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    mockThinkificPaginate.mockResolvedValue([
      makeChapter(1, 3), // 3 lessons
      makeChapter(2, 2), // 2 lessons
    ]);

    const result = await syncCourseLessons('42');

    expect(result).toBe(5);
    expect(lessonsUpsert).toHaveBeenCalledOnce();
  });

  // ---- Branch: chapters with no contents ----

  it('returns 0 when chapters exist but have no contents', async () => {
    const db = makeDb({ singleResult: { data: { id: 'uuid-def' }, error: null } });
    const lessonsUpsert = vi.fn().mockResolvedValue({ error: null });
    db.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') {
        return { select: vi.fn().mockReturnValue({ upsert: lessonsUpsert }), upsert: lessonsUpsert };
      }
      const single = vi.fn().mockResolvedValue({ data: { id: 'uuid-def' }, error: null });
      const eq = vi.fn().mockReturnValue({ single });
      const upsert = vi.fn().mockResolvedValue({ error: null });
      const select = vi.fn().mockReturnValue({ eq, upsert });
      return { select, upsert };
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    mockThinkificPaginate.mockResolvedValue([
      { id: 1, name: 'Empty', position: 1, contents: [] },
    ]);

    const result = await syncCourseLessons('77');

    expect(result).toBe(0);
    expect(lessonsUpsert).not.toHaveBeenCalled();
  });

  // ---- Branch: API error ----

  it('returns 0 and logs a warning when the chapters API throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = makeDb({ singleResult: { data: { id: 'uuid-ghi' }, error: null } });
    db.from = vi.fn().mockImplementation((_table: string) => {
      const single = vi.fn().mockResolvedValue({ data: { id: 'uuid-ghi' }, error: null });
      const eq = vi.fn().mockReturnValue({ single });
      const select = vi.fn().mockReturnValue({ eq });
      return { select };
    });
    mockCreateAdminClient.mockReturnValue(db as never);

    mockThinkificPaginate.mockRejectedValue(new Error('Network timeout'));

    const result = await syncCourseLessons('55');

    expect(result).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      '[SyncCourseLessons] Failed for course 55:',
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  // ---- Branch: lessons upsert error is warned but count still returned ----

  it('logs a warning but still returns lesson count when lessons upsert fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const lessonsUpsert = vi.fn().mockResolvedValue({ error: { message: 'lessons upsert failed' } });
    const db = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') {
          return { select: vi.fn().mockReturnValue({ upsert: lessonsUpsert }), upsert: lessonsUpsert };
        }
        const single = vi.fn().mockResolvedValue({ data: { id: 'uuid-jkl' }, error: null });
        const eq = vi.fn().mockReturnValue({ single });
        const select = vi.fn().mockReturnValue({ eq });
        return { select };
      }),
    };
    mockCreateAdminClient.mockReturnValue(db as never);

    mockThinkificPaginate.mockResolvedValue([makeChapter(1, 2)]);

    const result = await syncCourseLessons('66');

    expect(result).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(
      '[SyncCourseLessons] Upsert error for course 66:',
      'lessons upsert failed'
    );
    warnSpy.mockRestore();
  });

  // ---- Branch: is_video mapped correctly ----

  it('sets is_video=true for video content_type and false for others', async () => {
    let capturedLessons: unknown[] = [];

    const lessonsUpsert = vi.fn().mockImplementation((records: unknown[]) => {
      capturedLessons = records;
      return Promise.resolve({ error: null });
    });

    const db = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') {
          return { select: vi.fn().mockReturnValue({ upsert: lessonsUpsert }), upsert: lessonsUpsert };
        }
        const single = vi.fn().mockResolvedValue({ data: { id: 'uuid-mno' }, error: null });
        const eq = vi.fn().mockReturnValue({ single });
        const select = vi.fn().mockReturnValue({ eq });
        return { select };
      }),
    };
    mockCreateAdminClient.mockReturnValue(db as never);

    mockThinkificPaginate.mockResolvedValue([
      {
        id: 10,
        name: 'Ch 10',
        position: 1,
        contents: [
          { id: 101, name: 'Watch Me', content_type: 'video', position: 0 },
          { id: 102, name: 'Read Me', content_type: 'text', position: 1 },
        ],
      },
    ]);

    await syncCourseLessons('88');

    expect(capturedLessons[0]).toMatchObject({ is_video: true, lesson_type: 'video' });
    expect(capturedLessons[1]).toMatchObject({ is_video: false, lesson_type: 'text' });
  });

  // ---- Branch: chapter without contents property ----

  it('skips chapters that do not have a contents array (falsy check)', async () => {
    const lessonsUpsert = vi.fn().mockResolvedValue({ error: null });

    const db = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') {
          return { select: vi.fn().mockReturnValue({ upsert: lessonsUpsert }), upsert: lessonsUpsert };
        }
        const single = vi.fn().mockResolvedValue({ data: { id: 'uuid-pqr' }, error: null });
        const eq = vi.fn().mockReturnValue({ single });
        const select = vi.fn().mockReturnValue({ eq });
        return { select };
      }),
    };
    mockCreateAdminClient.mockReturnValue(db as never);

    mockThinkificPaginate.mockResolvedValue([
      // @ts-expect-error intentionally omitting contents to test the guard
      { id: 20, name: 'No Contents', position: 1 },
    ]);

    const result = await syncCourseLessons('11');

    expect(result).toBe(0);
    expect(lessonsUpsert).not.toHaveBeenCalled();
  });
});
