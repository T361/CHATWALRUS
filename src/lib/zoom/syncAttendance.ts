// =============================================================================
// Zoom Attendance Sync
// =============================================================================

import { zoomGet, isZoomConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from '@/lib/thinkific/syncCore';

export type ZoomAttendanceChunkResult = {
  status: 'success' | 'error' | 'skipped';
  recordsProcessed: number;
  totalSessions: number;
  nextOffset: number;
  done: boolean;
  errorMessage?: string;
};

type ZoomUser = { id: string; email: string };
type ZoomMeeting = {
  id: number; uuid: string; topic: string;
  start_time: string; end_time: string; duration: number; type: number;
};
type ZoomWebinar = {
  id: string; uuid: string; topic: string;
  start_time: string; end_time: string; duration: number;
};
type ZoomWebinarParticipant = {
  id: string; name: string; user_email: string;
  join_time: string; leave_time: string; duration: number;
};
type ZoomParticipant = {
  id: string; name: string; user_email: string;
  join_time: string; leave_time: string; duration: number;
};

async function zoomGetAllPages<T>(
  endpoint: string,
  params: Record<string, string>,
  key: keyof T,
): Promise<T[keyof T] extends unknown[] ? T[keyof T] : never> {
  const items: unknown[] = [];
  let nextPageToken = '';

  do {
    const p = nextPageToken ? { ...params, next_page_token: nextPageToken } : params;
    const page = await zoomGet<T & { next_page_token?: string }>(endpoint, p);
    const batch = page[key];
    if (Array.isArray(batch)) items.push(...batch);
    nextPageToken = page.next_page_token ?? '';
  } while (nextPageToken);

  return items as T[keyof T] extends unknown[] ? T[keyof T] : never;
}

export async function syncZoomAttendance(): Promise<SyncResult> {
  if (!isZoomConfigured()) {
    return { syncType: 'zoom_attendance', status: 'skipped', recordsProcessed: 0, errorMessage: 'Zoom not configured' };
  }

  return runSync('zoom_attendance', async () => {
    const db = createAdminClient();
    let count = 0;

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);

    const users = await zoomGetAllPages<{ users: ZoomUser[] }>(
      '/users',
      { page_size: '300', status: 'active' },
      'users',
    );

    for (const user of users) {
      try {
        const allMeetings = await zoomGetAllPages<{ meetings: ZoomMeeting[] }>(
          `/users/${user.id}/meetings`,
          { type: 'previous_meetings', page_size: '300' },
          'meetings',
        );

        // Zoom ignores 'from' for previous_meetings type — filter client-side
        // to last 30 days so we only attempt participant lookups on recent meetings
        // whose reports haven't expired yet
        const meetings = allMeetings.filter(
          (m) => m.start_time && new Date(m.start_time) >= fromDate
        );

        for (const meeting of meetings) {
          const { data: session } = await db.from('zoom_sessions').upsert(
            {
              zoom_meeting_id: String(meeting.id),
              topic: meeting.topic,
              host_email: user.email,
              start_time: meeting.start_time,
              end_time: meeting.end_time,
              duration_minutes: meeting.duration,
              session_type: meeting.type === 8 ? 'webinar' : 'meeting',
            },
            { onConflict: 'zoom_meeting_id' }
          ).select('id').single();

          if (!session) continue;

          try {
            // Fetch all past occurrences of this meeting — recurring meetings have
            // a new UUID per occurrence; base UUID returns 404 on participants
            type MeetingInstance = { uuid: string; start_time: string };
            let occurrenceUUIDs: string[] = [];
            try {
              const { meetings: instances } = await zoomGet<{ meetings: MeetingInstance[] }>(
                `/past_meetings/${meeting.id}/instances`
              );
              occurrenceUUIDs = (instances || []).map((i) => i.uuid);
            } catch {
              // Non-recurring or already-ended single meeting — use the base UUID
              occurrenceUUIDs = [meeting.uuid];
            }

            const participants: ZoomParticipant[] = [];
            for (const occUUID of occurrenceUUIDs) {
              // Zoom requires double-encoding for UUIDs starting with '/' or containing '//'
              const encodedUUID = (occUUID.startsWith('/') || occUUID.includes('//'))
                ? encodeURIComponent(encodeURIComponent(occUUID))
                : encodeURIComponent(occUUID);
              try {
                const batch = await zoomGetAllPages<{ participants: ZoomParticipant[] }>(
                  `/past_meetings/${encodedUUID}/participants`,
                  { page_size: '300' },
                  'participants',
                );
                participants.push(...batch);
              } catch (occErr) {
                console.warn(`[ZoomSync] No participants for occurrence ${occUUID.slice(0, 8)}…: ${occErr}`);
              }
            }

            for (const p of participants) {
              const attendeeEmail = (p.user_email || '').trim().toLowerCase();
              const attendeeIdentity = attendeeEmail || `participant:${(p.id || p.name || '').trim().toLowerCase()}`;
              const dedupeKey = [
                session.id,
                attendeeIdentity,
                p.join_time || 'unknown-join-time',
              ].join(':');

              const { data: learner } = attendeeEmail
                ? await db
                    .from('learners')
                    .select('id, company_id')
                    .eq('email', attendeeEmail)
                    .limit(1)
                    .single()
                : { data: null };

              const { error: attendanceError } = await db.from('zoom_attendance').upsert({
                zoom_session_id: session.id,
                learner_id: learner?.id || null,
                company_id: learner?.company_id || null,
                dedupe_key: dedupeKey,
                attendee_name: p.name,
                attendee_email: attendeeEmail || null,
                join_time: p.join_time,
                leave_time: p.leave_time,
                duration_minutes: Math.round(p.duration / 60),
                attended: true,
              }, {
                onConflict: 'dedupe_key',
              });

              if (attendanceError) {
                throw new Error(`Failed to upsert Zoom attendance: ${attendanceError.message}`);
              }

              count++;
            }
          } catch (error) {
            console.warn(`[ZoomSync] Failed to sync participants for meeting ${meeting.id}:`, error);
          }
        }
      } catch (error) {
        console.warn(`[ZoomSync] Failed to sync meetings for user ${user.id}:`, error);
      }
    }

    // ── Webinars (requires webinar:read:list_webinars:admin scope) ────────────
    // Silently skips if the scope is not yet granted — returns 0 new records
    // rather than throwing an error so the rest of the sync still succeeds.
    try {
      const webinarCount = await syncWebinarAttendance(db, fromDate);
      count += webinarCount;
    } catch (err) {
      console.warn('[ZoomSync] Webinar sync skipped (scope not granted or error):', err);
    }

    return count;
  });
}

async function syncWebinarAttendance(
  db: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  fromDate: Date,
): Promise<number> {
  let count = 0;

  const users = await zoomGetAllPages<{ users: { id: string; email: string }[] }>(
    '/users',
    { page_size: '300', status: 'active' },
    'users',
  );

  for (const user of users) {
    try {
      const allWebinars = await zoomGetAllPages<{ webinars: ZoomWebinar[] }>(
        `/users/${user.id}/webinars`,
        { page_size: '300' },
        'webinars',
      );

      const webinars = allWebinars.filter(
        (w) => w.start_time && new Date(w.start_time) >= fromDate,
      );

      for (const webinar of webinars) {
        const { data: session } = await db.from('zoom_sessions').upsert(
          {
            zoom_meeting_id: String(webinar.id),
            zoom_webinar_id: webinar.uuid,
            topic: webinar.topic,
            host_email: user.email,
            start_time: webinar.start_time,
            end_time: webinar.end_time,
            duration_minutes: webinar.duration,
            session_type: 'webinar',
          },
          { onConflict: 'zoom_meeting_id' },
        ).select('id').single();

        if (!session) continue;

        try {
          const encodedUUID = (webinar.uuid.startsWith('/') || webinar.uuid.includes('//'))
            ? encodeURIComponent(encodeURIComponent(webinar.uuid))
            : encodeURIComponent(webinar.uuid);

          const participants = await zoomGetAllPages<{ participants: ZoomWebinarParticipant[] }>(
            `/past_webinars/${encodedUUID}/participants`,
            { page_size: '300' },
            'participants',
          );

          for (const p of participants) {
            const attendeeEmail = (p.user_email || '').trim().toLowerCase();
            const attendeeIdentity = attendeeEmail || `participant:${(p.id || p.name || '').trim().toLowerCase()}`;
            const dedupeKey = [session.id, attendeeIdentity, p.join_time || 'unknown-join-time'].join(':');

            const { data: learner } = attendeeEmail
              ? await db.from('learners').select('id, company_id').eq('email', attendeeEmail).limit(1).single()
              : { data: null };

            await db.from('zoom_attendance').upsert({
              zoom_session_id: session.id,
              learner_id: learner?.id || null,
              company_id: learner?.company_id || null,
              dedupe_key: dedupeKey,
              attendee_name: p.name,
              attendee_email: attendeeEmail || null,
              join_time: p.join_time,
              leave_time: p.leave_time,
              duration_minutes: Math.round(p.duration / 60),
              attended: true,
            }, { onConflict: 'dedupe_key' });

            count++;
          }
        } catch (err) {
          console.warn(`[ZoomSync] Failed webinar participant fetch for ${webinar.id}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[ZoomSync] Webinar list failed for user ${user.id}:`, err);
    }
  }

  return count;
}

// Chunked Zoom sync — safe for Vercel Hobby 60s limit.
// offset=0 also discovers/upserts all zoom_sessions from Zoom API (fast — few users).
// Then processes participants for sessions[offset : offset+limit].
export async function syncZoomAttendanceChunk(opts: {
  offset: number;
  limit: number;
}): Promise<ZoomAttendanceChunkResult> {
  if (!isZoomConfigured()) {
    return { status: 'skipped', recordsProcessed: 0, totalSessions: 0, nextOffset: 0, done: true, errorMessage: 'Zoom not configured' };
  }

  const db = createAdminClient();

  try {
    // Phase 1 (offset=0 only): discover sessions from Zoom API and upsert to zoom_sessions
    if (opts.offset === 0) {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);

      const users = await zoomGetAllPages<{ users: ZoomUser[] }>(
        '/users',
        { page_size: '300', status: 'active' },
        'users',
      );

      for (const user of users) {
        try {
          const allMeetings = await zoomGetAllPages<{ meetings: ZoomMeeting[] }>(
            `/users/${user.id}/meetings`,
            { type: 'previous_meetings', page_size: '300' },
            'meetings',
          );
          const meetings = allMeetings.filter(m => m.start_time && new Date(m.start_time) >= fromDate);
          for (const meeting of meetings) {
            await db.from('zoom_sessions').upsert({
              zoom_meeting_id: String(meeting.id),
              topic: meeting.topic,
              host_email: user.email,
              start_time: meeting.start_time,
              end_time: meeting.end_time,
              duration_minutes: meeting.duration,
              session_type: meeting.type === 8 ? 'webinar' : 'meeting',
            }, { onConflict: 'zoom_meeting_id' });
          }
        } catch (err) {
          console.warn(`[ZoomChunk] Session discovery failed for user ${user.id}:`, err);
        }
      }
    }

    // Count total sessions
    const { count: totalSessions } = await db
      .from('zoom_sessions')
      .select('*', { count: 'exact', head: true });

    // Fetch this page of sessions
    const { data: sessions } = await db
      .from('zoom_sessions')
      .select('id, zoom_meeting_id, session_type')
      .order('id')
      .range(opts.offset, opts.offset + opts.limit - 1);

    const page = sessions || [];
    const done = page.length < opts.limit;
    const nextOffset = opts.offset + opts.limit;
    let recordsProcessed = 0;

    for (const session of page) {
      try {
        type MeetingInstance = { uuid: string; start_time: string };
        let occurrenceUUIDs: string[] = [];
        try {
          const { meetings: instances } = await zoomGet<{ meetings: MeetingInstance[] }>(
            `/past_meetings/${session.zoom_meeting_id}/instances`
          );
          occurrenceUUIDs = (instances || []).map(i => i.uuid);
        } catch {
          // single non-recurring meeting — skip (no UUID to encode without knowing it)
        }

        for (const occUUID of occurrenceUUIDs) {
          const encodedUUID = (occUUID.startsWith('/') || occUUID.includes('//'))
            ? encodeURIComponent(encodeURIComponent(occUUID))
            : encodeURIComponent(occUUID);
          try {
            const participants = await zoomGetAllPages<{ participants: ZoomParticipant[] }>(
              `/past_meetings/${encodedUUID}/participants`,
              { page_size: '300' },
              'participants',
            );
            for (const p of participants) {
              const attendeeEmail = (p.user_email || '').trim().toLowerCase();
              const attendeeIdentity = attendeeEmail || `participant:${(p.id || p.name || '').trim().toLowerCase()}`;
              const dedupeKey = [session.id, attendeeIdentity, p.join_time || 'unknown-join-time'].join(':');

              const { data: learner } = attendeeEmail
                ? await db.from('learners').select('id, company_id').eq('email', attendeeEmail).limit(1).single()
                : { data: null };

              await db.from('zoom_attendance').upsert({
                zoom_session_id: session.id,
                learner_id: learner?.id || null,
                company_id: learner?.company_id || null,
                dedupe_key: dedupeKey,
                attendee_name: p.name,
                attendee_email: attendeeEmail || null,
                join_time: p.join_time,
                leave_time: p.leave_time,
                duration_minutes: Math.round(p.duration / 60),
                attended: true,
              }, { onConflict: 'dedupe_key' });

              recordsProcessed++;
            }
          } catch (err) {
            console.warn(`[ZoomChunk] Participant fetch failed for occurrence ${occUUID.slice(0, 8)}:`, err);
          }
        }
      } catch (err) {
        console.warn(`[ZoomChunk] Failed session ${session.zoom_meeting_id}:`, err);
      }
    }

    return { status: 'success', recordsProcessed, totalSessions: totalSessions ?? 0, nextOffset, done };
  } catch (err) {
    return { status: 'error', recordsProcessed: 0, totalSessions: 0, nextOffset: opts.offset, done: false, errorMessage: err instanceof Error ? err.message : String(err) };
  }
}
