import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock all external dependencies before importing the module ----

vi.mock('@/lib/zoom/client', () => ({
  isZoomConfigured: vi.fn(),
  zoomGet: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/thinkific/syncCore', () => ({
  runSync: vi.fn(),
}));

// ---- Import mocked modules ----
import * as zoomClient from '@/lib/zoom/client';
import * as supabaseAdmin from '@/lib/supabase/admin';

// ---- Import the function under test ----
import { syncZoomAttendanceChunk } from './syncAttendance';

// =============================================================================
// DB Mock helpers
//
// The code under test uses these DB call patterns:
//
// 1. Discovery upsert (offset=0):
//    await db.from('zoom_sessions').upsert({...}, {onConflict:...})
//
// 2. Count query:
//    const {count} = await db.from('zoom_sessions').select('*', {count:'exact', head:true})
//
// 3. Page query:
//    const {data} = await db.from('zoom_sessions').select(...).order('id').range(a,b)
//
// 4. Learner lookup:
//    const {data} = attendeeEmail
//      ? await db.from('learners').select(...).eq('email', email).limit(1).single()
//      : {data: null}
//
// 5. Attendance upsert:
//    await db.from('zoom_attendance').upsert({...}, {onConflict:'dedupe_key'})
//
// =============================================================================

function makeZoomSessionsTable(
  countValue: number | null,
  pageData: unknown[],
  upsertSpy: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ error: null }),
) {
  const rangeFn = vi.fn().mockResolvedValue({ data: pageData });
  const orderFn = vi.fn().mockReturnValue({ range: rangeFn });

  const selectFn = vi.fn().mockImplementation(
    (_cols: unknown, opts?: { count?: string; head?: boolean }) => {
      if (opts && opts.count === 'exact' && opts.head === true) {
        return Promise.resolve({ count: countValue });
      }
      return { order: orderFn };
    },
  );

  return { select: selectFn, upsert: upsertSpy };
}

function makeLearnersTable(learnerData: { id: string; company_id: string } | null) {
  const singleFn = vi.fn().mockResolvedValue({ data: learnerData });
  const limitFn = vi.fn().mockReturnValue({ single: singleFn });
  const eqFn = vi.fn().mockReturnValue({ limit: limitFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
  return { select: selectFn };
}

function makeZoomAttendanceTable(
  upsertSpy: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ error: null }),
) {
  return { upsert: upsertSpy };
}

function buildDb(tables: {
  zoom_sessions?: ReturnType<typeof makeZoomSessionsTable>;
  learners?: ReturnType<typeof makeLearnersTable>;
  zoom_attendance?: ReturnType<typeof makeZoomAttendanceTable>;
}) {
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'zoom_sessions') return tables.zoom_sessions ?? makeZoomSessionsTable(0, []);
    if (table === 'learners') return tables.learners ?? makeLearnersTable(null);
    if (table === 'zoom_attendance') return tables.zoom_attendance ?? makeZoomAttendanceTable();
    throw new Error(`Unexpected table: ${table}`);
  });
  return { from };
}

function makeParticipant(overrides: Partial<{
  id: string; name: string; user_email: string;
  join_time: string; leave_time: string; duration: number;
}> = {}) {
  return {
    id: 'p-default',
    name: 'Default User',
    user_email: 'user@example.com',
    join_time: '2026-01-01T10:00:00Z',
    leave_time: '2026-01-01T11:00:00Z',
    duration: 3600,
    ...overrides,
  };
}

describe('syncZoomAttendanceChunk', () => {
  const mockIsZoomConfigured = vi.mocked(zoomClient.isZoomConfigured);
  const mockZoomGet = vi.mocked(zoomClient.zoomGet);
  const mockCreateAdminClient = vi.mocked(supabaseAdmin.createAdminClient);

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsZoomConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns skipped result when Zoom is not configured', async () => {
    mockIsZoomConfigured.mockReturnValue(false);
    const result = await syncZoomAttendanceChunk({ offset: 0, limit: 10 });
    expect(result.status).toBe('skipped');
    expect(result.done).toBe(true);
    expect(result.recordsProcessed).toBe(0);
    expect(result.totalSessions).toBe(0);
    expect(result.nextOffset).toBe(0);
    expect(result.errorMessage).toBe('Zoom not configured');
  });

  it('does not call createAdminClient when Zoom is not configured', async () => {
    mockIsZoomConfigured.mockReturnValue(false);
    await syncZoomAttendanceChunk({ offset: 0, limit: 10 });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('calls /users during discovery when offset=0', async () => {
    mockZoomGet.mockResolvedValueOnce({ users: [], next_page_token: '' });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(0, []) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 0, limit: 10 });
    expect(mockZoomGet).toHaveBeenCalledWith('/users', { page_size: '300', status: 'active' });
  });

  it('upserts discovered meetings to zoom_sessions during offset=0', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    mockZoomGet
      .mockResolvedValueOnce({ users: [{ id: 'u1', email: 'host@example.com' }], next_page_token: '' })
      .mockResolvedValueOnce({ meetings: [{ id: 101, uuid: 'uuid-101', topic: 'Test Meeting', start_time: recentDate.toISOString(), end_time: recentDate.toISOString(), duration: 60, type: 2 }], next_page_token: '' });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, [], upsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 0, limit: 10 });
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ zoom_meeting_id: '101', topic: 'Test Meeting', host_email: 'host@example.com', session_type: 'meeting' }), { onConflict: 'zoom_meeting_id' });
  });

  it('filters out old meetings (> 30 days) during discovery', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    mockZoomGet
      .mockResolvedValueOnce({ users: [{ id: 'u1', email: 'host@example.com' }], next_page_token: '' })
      .mockResolvedValueOnce({ meetings: [
        { id: 200, uuid: 'uuid-200', topic: 'Old', start_time: oldDate.toISOString(), end_time: oldDate.toISOString(), duration: 30, type: 2 },
        { id: 201, uuid: 'uuid-201', topic: 'Recent', start_time: recentDate.toISOString(), end_time: recentDate.toISOString(), duration: 30, type: 2 },
      ], next_page_token: '' });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, [], upsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 0, limit: 10 });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ zoom_meeting_id: '201' }), expect.anything());
  });

  it('does NOT call /users when offset > 0', async () => {
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(5, []) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    const userCalls = mockZoomGet.mock.calls.filter((c) => typeof c[0] === 'string' && c[0] === '/users');
    expect(userCalls).toHaveLength(0);
  });

  it('returns done=true and recordsProcessed=0 when no sessions in DB page', async () => {
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(0, []) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.status).toBe('success');
    expect(result.done).toBe(true);
    expect(result.recordsProcessed).toBe(0);
    expect(result.totalSessions).toBe(0);
  });

  it('returns done=true when page has fewer sessions than limit', async () => {
    const sessions = [{ id: 's1', zoom_meeting_id: 'm1', session_type: 'meeting' }];
    mockZoomGet.mockRejectedValue(new Error('404 not found'));
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(3, sessions) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.done).toBe(true);
  });

  it('returns done=false when page length equals limit', async () => {
    const sessions = Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, zoom_meeting_id: `m${i}`, session_type: 'meeting' }));
    mockZoomGet.mockRejectedValue(new Error('404'));
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(10, sessions) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 6, limit: 3 });
    expect(result.done).toBe(false);
    expect(result.nextOffset).toBe(9);
  });

  it('falls back to empty occurrenceUUIDs (no participants) when instance lookup throws', async () => {
    const sessions = [{ id: 'sess-1', zoom_meeting_id: 'meet-1', session_type: 'meeting' }];
    mockZoomGet.mockRejectedValueOnce(new Error('Not found'));
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.status).toBe('success');
    expect(result.recordsProcessed).toBe(0);
  });

  it('double-encodes occurrence UUID starting with "/"', async () => {
    const uuid = '/special/uuid';
    const sessions = [{ id: 'sess-2', zoom_meeting_id: 'meet-2', session_type: 'meeting' }];
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid, start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants: [], next_page_token: '' });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    const doubleEncoded = encodeURIComponent(encodeURIComponent(uuid));
    expect(mockZoomGet).toHaveBeenCalledWith(`/past_meetings/${doubleEncoded}/participants`, { page_size: '300' });
  });

  it('double-encodes occurrence UUID containing "//"', async () => {
    const uuid = 'abc//def';
    const sessions = [{ id: 'sess-3', zoom_meeting_id: 'meet-3', session_type: 'meeting' }];
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid, start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants: [], next_page_token: '' });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    const doubleEncoded = encodeURIComponent(encodeURIComponent(uuid));
    expect(mockZoomGet).toHaveBeenCalledWith(`/past_meetings/${doubleEncoded}/participants`, { page_size: '300' });
  });

  it('single-encodes a normal (no slashes) UUID', async () => {
    const uuid = 'uuid+plus';
    const sessions = [{ id: 'sess-4', zoom_meeting_id: 'meet-4', session_type: 'meeting' }];
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid, start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants: [], next_page_token: '' });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    const singleEncoded = encodeURIComponent(uuid);
    const doubleEncoded = encodeURIComponent(singleEncoded);
    expect(mockZoomGet).toHaveBeenCalledWith(`/past_meetings/${singleEncoded}/participants`, { page_size: '300' });
    const doubleEncodedCall = mockZoomGet.mock.calls.find((c) => c[0] === `/past_meetings/${doubleEncoded}/participants`);
    expect(doubleEncodedCall).toBeUndefined();
  });

  it('upserts attendance with learner_id and company_id when email matches a learner', async () => {
    const sessions = [{ id: 'sess-5', zoom_meeting_id: 'meet-5', session_type: 'meeting' }];
    const participant = makeParticipant({ user_email: 'alice@example.com', duration: 3600 });
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-uuid-1', start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants: [participant], next_page_token: '' });
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions), learners: makeLearnersTable({ id: 'learner-1', company_id: 'company-1' }), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(attendanceUpsertSpy).toHaveBeenCalledWith(expect.objectContaining({ zoom_session_id: 'sess-5', learner_id: 'learner-1', company_id: 'company-1', attendee_email: 'alice@example.com', attended: true, duration_minutes: 60 }), { onConflict: 'dedupe_key' });
    expect(result.recordsProcessed).toBe(1);
  });

  it('upserts attendance with null learner_id/company_id when email not in learners', async () => {
    const sessions = [{ id: 'sess-6', zoom_meeting_id: 'meet-6', session_type: 'meeting' }];
    const participant = makeParticipant({ user_email: 'bob@unknown.com', duration: 1800 });
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-uuid-2', start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants: [participant], next_page_token: '' });
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions), learners: makeLearnersTable(null), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(attendanceUpsertSpy).toHaveBeenCalledWith(expect.objectContaining({ learner_id: null, company_id: null, attendee_email: 'bob@unknown.com' }), { onConflict: 'dedupe_key' });
    expect(result.recordsProcessed).toBe(1);
  });

  it('uses "participant:{id}" identity when participant has no email', async () => {
    const sessions = [{ id: 'sess-7', zoom_meeting_id: 'meet-7', session_type: 'meeting' }];
    const participant = makeParticipant({ id: 'pid-3', name: 'No Email User', user_email: '', duration: 900 });
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-uuid-3', start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants: [participant], next_page_token: '' });
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(attendanceUpsertSpy).toHaveBeenCalledTimes(1);
    const callArgs = attendanceUpsertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.dedupe_key).toContain('participant:pid-3');
    expect(callArgs.attendee_email).toBeNull();
    expect(callArgs.learner_id).toBeNull();
  });

  it('catches participant fetch errors and continues to next occurrence', async () => {
    const sessions = [{ id: 'sess-8', zoom_meeting_id: 'meet-8', session_type: 'meeting' }];
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-a', start_time: '2026-01-01' }, { uuid: 'occ-b', start_time: '2026-01-02' }] })
      .mockRejectedValueOnce(new Error('Participant fetch failed'))
      .mockResolvedValueOnce({ participants: [], next_page_token: '' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.status).toBe('success');
    expect(result.recordsProcessed).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[ZoomChunk] Participant fetch failed for occurrence'), expect.anything());
    warnSpy.mockRestore();
  });

  it('catches session-level errors and continues to next session', async () => {
    const sessions = [
      { id: 'sess-9', zoom_meeting_id: 'meet-9', session_type: 'meeting' },
      { id: 'sess-10', zoom_meeting_id: 'meet-10', session_type: 'meeting' },
    ];
    const participant = makeParticipant({ user_email: 'charlie@example.com' });
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'fail-occ', start_time: '2026-01-01' }] })
      .mockRejectedValueOnce(new Error('Unexpected occurrence error'))
      .mockResolvedValueOnce({ meetings: [{ uuid: 'good-occ', start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants: [participant], next_page_token: '' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(2, sessions), learners: makeLearnersTable(null), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 2 });
    expect(result.recordsProcessed).toBe(1);
    expect(result.status).toBe('success');
    warnSpy.mockRestore();
  });

  it('returns totalSessions from the DB count query', async () => {
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(42, []) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.totalSessions).toBe(42);
  });

  it('returns totalSessions=0 when count is null', async () => {
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(null, []) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.totalSessions).toBe(0);
  });

  it('returns nextOffset = offset + limit', async () => {
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(50, []) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 20, limit: 15 });
    expect(result.nextOffset).toBe(35);
  });

  it('returns status=error with message when the count query throws', async () => {
    const zoomSessionsMock = { select: vi.fn().mockImplementation((_cols: unknown, opts?: { count?: string; head?: boolean }) => { if (opts?.count === 'exact' && opts?.head === true) { return Promise.reject(new Error('DB connection failed')); } return { order: vi.fn() }; }) };
    const db = { from: vi.fn().mockReturnValue(zoomSessionsMock) };
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.status).toBe('error');
    expect(result.errorMessage).toBe('DB connection failed');
    expect(result.recordsProcessed).toBe(0);
    expect(result.done).toBe(false);
    expect(result.nextOffset).toBe(5);
  });

  it('returns errorMessage as String(err) when thrown value inside try is not an Error instance', async () => {
    const zoomSessionsMock = { select: vi.fn().mockImplementation((_cols: unknown, opts?: { count?: string; head?: boolean }) => { if (opts?.count === 'exact' && opts?.head === true) { return Promise.reject('string error'); } return { order: vi.fn() }; }) };
    const db = { from: vi.fn().mockReturnValue(zoomSessionsMock) };
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.status).toBe('error');
    expect(result.errorMessage).toBe('string error');
  });

  it('continues to next user when per-user meeting fetch fails during discovery', async () => {
    mockZoomGet
      .mockResolvedValueOnce({ users: [{ id: 'u-bad', email: 'bad@example.com' }, { id: 'u-good', email: 'good@example.com' }], next_page_token: '' })
      .mockRejectedValueOnce(new Error('Meeting fetch failed'))
      .mockResolvedValueOnce({ meetings: [], next_page_token: '' });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(0, []) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await syncZoomAttendanceChunk({ offset: 0, limit: 10 });
    expect(result.status).toBe('success');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[ZoomChunk] Session discovery failed for user u-bad'), expect.anything());
    warnSpy.mockRestore();
  });

  it('sets session_type to "webinar" for meetings with type === 8 during discovery', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);
    mockZoomGet
      .mockResolvedValueOnce({ users: [{ id: 'u-w', email: 'webinar-host@example.com' }], next_page_token: '' })
      .mockResolvedValueOnce({ meetings: [{ id: 888, uuid: 'uuid-888', topic: 'Webinar Meeting', start_time: recentDate.toISOString(), end_time: recentDate.toISOString(), duration: 90, type: 8 }], next_page_token: '' });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, [], upsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 0, limit: 10 });
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ session_type: 'webinar' }), expect.anything());
  });

  it('sets session_type to "meeting" for meetings with type !== 8 during discovery', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);
    mockZoomGet
      .mockResolvedValueOnce({ users: [{ id: 'u-m', email: 'meeting-host@example.com' }], next_page_token: '' })
      .mockResolvedValueOnce({ meetings: [{ id: 999, uuid: 'uuid-999', topic: 'Regular Meeting', start_time: recentDate.toISOString(), end_time: recentDate.toISOString(), duration: 45, type: 2 }], next_page_token: '' });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, [], upsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 0, limit: 10 });
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ session_type: 'meeting' }), expect.anything());
  });

  it('constructs dedupe key as "session_id:email:join_time"', async () => {
    const sessions = [{ id: 'sess-dk', zoom_meeting_id: 'meet-dk', session_type: 'meeting' }];
    const participant = makeParticipant({ user_email: 'dedupe@example.com', join_time: '2026-01-15T09:00:00Z' });
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-dk', start_time: '2026-01-15' }] })
      .mockResolvedValueOnce({ participants: [participant], next_page_token: '' });
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions), learners: makeLearnersTable(null), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    const callArgs = attendanceUpsertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.dedupe_key).toBe('sess-dk:dedupe@example.com:2026-01-15T09:00:00Z');
  });

  it('uses "unknown-join-time" in dedupe key when participant has no join_time', async () => {
    const sessions = [{ id: 'sess-nojoin', zoom_meeting_id: 'meet-nojoin', session_type: 'meeting' }];
    const participant = makeParticipant({ user_email: 'nojoin@example.com', join_time: '' });
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-nojoin', start_time: '2026-01-15' }] })
      .mockResolvedValueOnce({ participants: [participant], next_page_token: '' });
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions), learners: makeLearnersTable(null), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    const callArgs = attendanceUpsertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.dedupe_key).toContain('unknown-join-time');
  });

  it('fetches all pages of /users when next_page_token is present', async () => {
    mockZoomGet
      .mockResolvedValueOnce({ users: [{ id: 'u-page1', email: 'page1@example.com' }], next_page_token: 'token-abc' })
      .mockResolvedValueOnce({ users: [{ id: 'u-page2', email: 'page2@example.com' }], next_page_token: '' })
      .mockResolvedValueOnce({ meetings: [], next_page_token: '' })
      .mockResolvedValueOnce({ meetings: [], next_page_token: '' });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(0, []) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 0, limit: 10 });
    const userCalls = mockZoomGet.mock.calls.filter((c) => typeof c[0] === 'string' && c[0] === '/users');
    expect(userCalls[0][1]).toMatchObject({ page_size: '300', status: 'active' });
    expect(userCalls[1][1]).toMatchObject({ next_page_token: 'token-abc' });
    expect(userCalls).toHaveLength(2);
  });

  it('rounds duration_minutes correctly using Math.round(duration/60)', async () => {
    const sessions = [{ id: 'sess-dur', zoom_meeting_id: 'meet-dur', session_type: 'meeting' }];
    const participant = makeParticipant({ user_email: 'dur@example.com', duration: 2700 });
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-dur', start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants: [participant], next_page_token: '' });
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions), learners: makeLearnersTable(null), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(attendanceUpsertSpy).toHaveBeenCalledWith(expect.objectContaining({ duration_minutes: 45 }), expect.anything());
  });

  it('processes multiple participants and increments recordsProcessed correctly', async () => {
    const sessions = [{ id: 'sess-multi', zoom_meeting_id: 'meet-multi', session_type: 'meeting' }];
    const participants = [
      makeParticipant({ id: 'pm1', user_email: 'multi1@example.com' }),
      makeParticipant({ id: 'pm2', user_email: 'multi2@example.com' }),
      makeParticipant({ id: 'pm3', user_email: '' }),
    ];
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-multi', start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants, next_page_token: '' });
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions), learners: makeLearnersTable(null), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.recordsProcessed).toBe(3);
    expect(attendanceUpsertSpy).toHaveBeenCalledTimes(3);
  });

  it('fetches participants for each occurrence and accumulates count', async () => {
    const sessions = [{ id: 'sess-occ', zoom_meeting_id: 'meet-occ', session_type: 'meeting' }];
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-x1', start_time: '2026-01-01' }, { uuid: 'occ-x2', start_time: '2026-01-08' }] })
      .mockResolvedValueOnce({ participants: [makeParticipant({ id: 'px1', user_email: 'px1@example.com' })], next_page_token: '' })
      .mockResolvedValueOnce({ participants: [makeParticipant({ id: 'px2', user_email: 'px2@example.com' }), makeParticipant({ id: 'px3', user_email: 'px3@example.com' })], next_page_token: '' });
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions), learners: makeLearnersTable(null), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    const result = await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(result.recordsProcessed).toBe(3);
    expect(attendanceUpsertSpy).toHaveBeenCalledTimes(3);
  });

  it('trims and lowercases participant email before upserting', async () => {
    const sessions = [{ id: 'sess-email', zoom_meeting_id: 'meet-email', session_type: 'meeting' }];
    const participant = makeParticipant({ user_email: '  UPPER@Example.COM  ' });
    mockZoomGet
      .mockResolvedValueOnce({ meetings: [{ uuid: 'occ-email', start_time: '2026-01-01' }] })
      .mockResolvedValueOnce({ participants: [participant], next_page_token: '' });
    const attendanceUpsertSpy = vi.fn().mockResolvedValue({ error: null });
    const db = buildDb({ zoom_sessions: makeZoomSessionsTable(1, sessions), learners: makeLearnersTable(null), zoom_attendance: makeZoomAttendanceTable(attendanceUpsertSpy) });
    mockCreateAdminClient.mockReturnValue(db as never);
    await syncZoomAttendanceChunk({ offset: 5, limit: 10 });
    expect(attendanceUpsertSpy).toHaveBeenCalledWith(expect.objectContaining({ attendee_email: 'upper@example.com' }), expect.anything());
  });
});
