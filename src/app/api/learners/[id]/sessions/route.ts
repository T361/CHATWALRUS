import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const { id } = await params;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: learner } = await db
    .from('learners')
    .select('id, full_name')
    .eq('id', id)
    .single();

  if (!learner) {
    return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attendance: any[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db
      .from('zoom_attendance')
      .select('id, zoom_session_id, learner_id, company_id, attendee_name, attendee_email, join_time, leave_time, duration_minutes, attended, created_at, zoom_sessions(topic, session_type, host_email, start_time, end_time)')
      .eq('learner_id', id)
      .order('join_time', { ascending: false })
      .range(off, off + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    attendance.push(...data);
    if (data.length < 1000) break;
  }

  const sessions = (attendance || []).map((row) => {
    const session = Array.isArray(row.zoom_sessions) ? row.zoom_sessions[0] : row.zoom_sessions;
    return {
      id: row.id,
      zoom_session_id: row.zoom_session_id,
      learner_id: row.learner_id,
      company_id: row.company_id,
      attendee_name: row.attendee_name,
      attendee_email: row.attendee_email,
      join_time: row.join_time,
      leave_time: row.leave_time,
      duration_minutes: row.duration_minutes,
      attended: row.attended,
      created_at: row.created_at,
      session_topic: session?.topic ?? null,
      session_type: session?.session_type ?? null,
      session_host_email: session?.host_email ?? null,
      session_start_time: session?.start_time ?? null,
      session_end_time: session?.end_time ?? null,
    };
  });

  return NextResponse.json({
    learner: {
      id: learner.id,
      full_name: learner.full_name,
    },
    sessions,
    total_sessions: sessions.length,
  });
}
