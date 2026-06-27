import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { readThroughTtlCache } from '@/lib/cache/serverCache';
import { withServerTiming } from '@/lib/perf';

export interface CompanySessionAttendee {
  attendance_id: string;
  learner_id: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  join_time: string | null;
  leave_time: string | null;
  duration_minutes: number | null;
  attended: boolean;
}

export interface CompanySessionListItem {
  session_id: string;
  zoom_meeting_id: string | null;
  topic: string | null;
  host_email: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  session_type: string | null;
  attendee_count: number;
  attendees: CompanySessionAttendee[];
}

export interface CompanyZoomAnalytics {
  attendance_rate: number;
  active_learners: number;
  attending_learners: number;
  period_start: string;
  period_end: string;
  session_trends: Array<{
    week_start: string;
    sessions_held: number;
    total_attendances: number;
    unique_attendees: number;
    average_duration_minutes: number;
  }>;
}

function startOfWeekUTC(date: Date): string {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  const diff = (day + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

export async function getCompanySessionLists(
  companyId: string,
  limit = 25,
): Promise<CompanySessionListItem[]> {
  return readThroughTtlCache(`zoom:sessions:${companyId}:${limit}`, 60_000, async () => {
    return withServerTiming('zoom.company_sessions.load', async () => {
      const db = createAdminClient();
      const { data, error } = await db
        .from('zoom_attendance')
        .select('id, learner_id, attendee_name, attendee_email, join_time, leave_time, duration_minutes, attended, zoom_sessions!inner(id, zoom_meeting_id, topic, host_email, start_time, end_time, duration_minutes, session_type)')
        .eq('company_id', companyId)
        .order('join_time', { ascending: false })
        .limit(Math.max(limit * 50, 250));

      if (error) throw error;

      // Per-session attendee dedup map: session_id → (email|name → best row)
      const sessionAttendeeKeys = new Map<string, Map<string, CompanySessionAttendee>>();
      const sessions = new Map<string, CompanySessionListItem>();

      for (const row of data || []) {
        const session = Array.isArray(row.zoom_sessions) ? row.zoom_sessions[0] : row.zoom_sessions;
        if (!session?.id) continue;

        if (!sessions.has(session.id)) {
          sessions.set(session.id, {
            session_id: session.id,
            zoom_meeting_id: session.zoom_meeting_id ?? null,
            topic: session.topic ?? null,
            host_email: session.host_email ?? null,
            start_time: session.start_time ?? null,
            end_time: session.end_time ?? null,
            duration_minutes: session.duration_minutes ?? null,
            session_type: session.session_type ?? null,
            attendee_count: 0,
            attendees: [],
          });
          sessionAttendeeKeys.set(session.id, new Map());
        }

        // Deduplicate by email (or name if no email) — keep row with longest duration
        const dedupeKey = (row.attendee_email || '').trim().toLowerCase() || `name:${(row.attendee_name || '').trim().toLowerCase()}`;
        const attendeeMap = sessionAttendeeKeys.get(session.id)!;
        const existing = attendeeMap.get(dedupeKey);
        const thisDuration = row.duration_minutes ?? 0;
        const existingDuration = existing?.duration_minutes ?? -1;

        if (!existing || thisDuration > existingDuration) {
          attendeeMap.set(dedupeKey, {
            attendance_id: row.id,
            learner_id: row.learner_id,
            attendee_name: row.attendee_name,
            attendee_email: row.attendee_email,
            join_time: row.join_time,
            leave_time: row.leave_time,
            duration_minutes: row.duration_minutes,
            attended: row.attended,
          });
        }
      }

      for (const [sessionId, attendeeMap] of sessionAttendeeKeys) {
        const s = sessions.get(sessionId)!;
        s.attendees = Array.from(attendeeMap.values());
        s.attendee_count = s.attendees.length;
      }

      return Array.from(sessions.values())
        .sort((a, b) => new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime())
        .slice(0, limit);
    }, { company_id: companyId, limit });
  });
}

export async function getCompanyZoomAnalytics(
  companyId: string,
  days = 84,
): Promise<CompanyZoomAnalytics> {
  return readThroughTtlCache(`zoom:analytics:${companyId}:${days}`, 60_000, async () => {
    return withServerTiming('zoom.company_analytics.load', async () => {
      const db = createAdminClient();
      const now = new Date();
      const from = new Date(now);
      from.setUTCDate(from.getUTCDate() - days);
      const periodStart = from.toISOString();
      const periodEnd = now.toISOString();

      const { count: activeLearners } = await db
        .from('learners').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('is_active', true);

      // Paginate to avoid Supabase 1000-row default cap
      const attendanceRows: Array<{ learner_id: string | null; join_time: string | null; duration_minutes: number | null; zoom_session_id: string | null }> = [];
      for (let off = 0; ; off += 1000) {
        const { data, error } = await db.from('zoom_attendance')
          .select('learner_id, join_time, duration_minutes, zoom_session_id')
          .eq('company_id', companyId)
          .eq('attended', true)
          .gte('join_time', periodStart)
          .order('join_time', { ascending: false })
          .range(off, off + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        attendanceRows.push(...data);
        if (data.length < 1000) break;
      }

      const uniqueLearners = new Set<string>();
      const trends = new Map<string, {
        sessions: Set<string>;
        total_attendances: number;
        unique_attendees: Set<string>;
        duration_total: number;
      }>();

      for (const row of attendanceRows || []) {
        if (row.learner_id) uniqueLearners.add(row.learner_id);
        const joinTime = row.join_time ? new Date(row.join_time) : null;
        if (!joinTime) continue;
        const weekStart = startOfWeekUTC(joinTime);
        const existing = trends.get(weekStart) || {
          sessions: new Set<string>(),
          total_attendances: 0,
          unique_attendees: new Set<string>(),
          duration_total: 0,
        };
        if (row.zoom_session_id) existing.sessions.add(row.zoom_session_id);
        if (row.learner_id) existing.unique_attendees.add(row.learner_id);
        existing.total_attendances += 1;
        existing.duration_total += Number(row.duration_minutes ?? 0);
        trends.set(weekStart, existing);
      }

      const attendingLearners = uniqueLearners.size;
      const denominator = Math.max(Number(activeLearners ?? 0), 1);

      return {
        attendance_rate: Math.round((attendingLearners / denominator) * 1000) / 10,
        active_learners: Number(activeLearners ?? 0),
        attending_learners: attendingLearners,
        period_start: periodStart,
        period_end: periodEnd,
        session_trends: Array.from(trends.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([weekStart, value]) => ({
            week_start: weekStart,
            sessions_held: value.sessions.size,
            total_attendances: value.total_attendances,
            unique_attendees: value.unique_attendees.size,
            average_duration_minutes: value.total_attendances > 0
              ? Math.round((value.duration_total / value.total_attendances) * 10) / 10
              : 0,
          })),
      };
    }, { company_id: companyId, days });
  });
}
