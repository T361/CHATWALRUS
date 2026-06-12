// =============================================================================
// Zoom Attendance Sync
// =============================================================================

import { zoomGet, isZoomConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from '@/lib/thinkific/syncCore';

export async function syncZoomAttendance(): Promise<SyncResult> {
  if (!isZoomConfigured()) {
    return { syncType: 'zoom_attendance', status: 'skipped', recordsProcessed: 0, errorMessage: 'Zoom not configured' };
  }

  return runSync('zoom_attendance', async () => {
    const db = createAdminClient();
    let count = 0;

    // Fetch past meetings from last 30 days
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);

    const users = await zoomGet<{ users: Array<{ id: string; email: string }> }>('/users', { page_size: '300' });

    for (const user of users.users || []) {
      try {
        const meetings = await zoomGet<{
          meetings: Array<{
            id: number; uuid: string; topic: string;
            start_time: string; end_time: string; duration: number; type: number;
          }>;
        }>(`/users/${user.id}/meetings`, {
          type: 'previous_meetings',
          from: fromDate.toISOString().split('T')[0],
          page_size: '300',
        });

        for (const meeting of meetings.meetings || []) {
          // Upsert zoom session
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

          // Fetch participants
          try {
            const participants = await zoomGet<{
              participants: Array<{
                id: string; name: string; user_email: string;
                join_time: string; leave_time: string; duration: number;
              }>;
            }>(`/past_meetings/${meeting.uuid}/participants`, { page_size: '300' });

            for (const p of participants.participants || []) {
              // Match email to learner
              const { data: learner } = await db
                .from('learners')
                .select('id, company_id')
                .eq('email', p.user_email.toLowerCase())
                .limit(1)
                .single();

              await db.from('zoom_attendance').insert({
                zoom_session_id: session.id,
                learner_id: learner?.id || null,
                company_id: learner?.company_id || null,
                attendee_name: p.name,
                attendee_email: p.user_email,
                join_time: p.join_time,
                leave_time: p.leave_time,
                duration_minutes: Math.round(p.duration / 60),
                attended: true,
              });
              count++;
            }
          } catch {
            console.warn(`[ZoomSync] Failed to fetch participants for meeting ${meeting.id}`);
          }
        }
      } catch {
        console.warn(`[ZoomSync] Failed to fetch meetings for user ${user.id}`);
      }
    }

    return count;
  });
}
