import { NextRequest, NextResponse } from 'next/server';
import { createServerClientSafe } from '@/lib/supabase/server';
import type { LearnerStatus } from '@/types/learner';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = createServerClientSafe();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: company } = await db
    .from('companies')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  // Fetch learners
  const { data: learners } = await db
    .from('learners')
    .select('id, full_name, email, department, title, last_active_at')
    .eq('company_id', company.id)
    .eq('is_active', true)
    .order('full_name');

  if (!learners) return NextResponse.json({ learners: [], company_name: company.name });

  // For each learner, get progress and status
  const enriched = await Promise.all(
    learners.map(async (l) => {
      const { data: enrollments } = await db
        .from('enrollments')
        .select('progress_percent, course_id')
        .eq('learner_id', l.id)
        .eq('is_active', true);

      const avgProgress = enrollments && enrollments.length > 0
        ? enrollments.reduce((s, e) => s + Number(e.progress_percent || 0), 0) / enrollments.length
        : 0;

      // Get latest status snapshot
      const { data: statusSnap } = await db
        .from('learner_status_snapshots')
        .select('status, live_sessions_last_30_days')
        .eq('learner_id', l.id)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

      return {
        id: l.id,
        full_name: l.full_name || 'Unknown',
        email: l.email,
        department: l.department,
        title: l.title,
        progress_percent: Math.round(avgProgress * 10) / 10,
        status: (statusSnap?.status || 'not_started') as LearnerStatus,
        courses_enrolled: enrollments?.length ?? 0,
        last_active_at: l.last_active_at,
        live_sessions_last_30_days: statusSnap?.live_sessions_last_30_days ?? 0,
      };
    })
  );

  return NextResponse.json({ learners: enriched, company_name: company.name });
}
