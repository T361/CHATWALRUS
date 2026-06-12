import { NextRequest, NextResponse } from 'next/server';
import { createServerClientSafe } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerClientSafe();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: learner, error } = await db
    .from('learners')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !learner) {
    return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
  }

  // Get enrollments
  const { data: enrollments } = await db
    .from('enrollments')
    .select('*, courses(name)')
    .eq('learner_id', id)
    .eq('is_active', true);

  // Get latest status
  const { data: statusSnap } = await db
    .from('learner_status_snapshots')
    .select('*')
    .eq('learner_id', id)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  // Get zoom attendance
  const { data: attendance } = await db
    .from('zoom_attendance')
    .select('*, zoom_sessions(topic, start_time)')
    .eq('learner_id', id)
    .order('join_time', { ascending: false });

  return NextResponse.json({
    learner,
    enrollments: enrollments || [],
    status: statusSnap || null,
    zoom_attendance: attendance || [],
  });
}
