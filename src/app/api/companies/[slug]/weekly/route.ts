export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const { slug } = await params;
  const db = createAdminClient();

  const { data: company } = await db
    .from('companies')
    .select('id, name, start_date, learning_timeline_days')
    .eq('slug', slug)
    .single();

  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoISO = weekAgo.toISOString();

  // Run all queries in parallel
  const [
    learnersResult,
    activeThisWeekResult,
    completionsThisWeekResult,
    zoomThisWeekResult,
    assignmentsThisWeekResult,
    surveysThisWeekResult,
    snapshotsResult,
    topLearnersResult,
    alertsResult,
  ] = await Promise.all([
    db.from('learners').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
    db.from('learners').select('*', { count: 'exact', head: true }).eq('company_id', company.id).gte('last_active_at', weekAgoISO),
    db.from('enrollments').select('*', { count: 'exact', head: true }).eq('company_id', company.id).gte('completed_at', weekAgoISO),
    db.from('zoom_attendance')
      .select('learner_id, zoom_sessions(start_time)', { count: 'exact', head: false })
      .eq('company_id', company.id)
      .eq('attended', true)
      .gte('join_time', weekAgoISO)
      .limit(1000),
    db.from('assignments').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('submitted', true).gte('submitted_at', weekAgoISO),
    db.from('surveys').select('*', { count: 'exact', head: true }).eq('company_id', company.id).gte('submitted_at', weekAgoISO),
    db.from('learner_status_snapshots')
      .select('status, completion_percent, snapshot_date')
      .eq('company_id', company.id)
      .gte('snapshot_date', weekAgo.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: false }),
    db.from('learner_points')
      .select('learner_id, total_points, sessions_attended, learners(full_name)')
      .eq('company_id', company.id)
      .order('total_points', { ascending: false })
      .limit(5),
    db.from('alerts')
      .select('alert_type, severity, title, created_at')
      .eq('company_id', company.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const snapshots = snapshotsResult.data ?? [];
  const latestSnaps = new Map<string, { status: string; completion_percent: number }>();
  for (const s of snapshots) {
    if (!latestSnaps.has(s.status)) latestSnaps.set(s.status, { status: s.status, completion_percent: Number(s.completion_percent) });
  }

  const statusCounts = { high_engagement: 0, on_track: 0, slightly_behind: 0, at_risk: 0, not_started: 0 };
  for (const s of snapshots) {
    const k = s.status as keyof typeof statusCounts;
    if (k in statusCounts) statusCounts[k]++;
  }
  const avgCompletion = snapshots.length
    ? snapshots.reduce((a, b) => a + Number(b.completion_percent), 0) / snapshots.length
    : 0;

  const topLearners = (topLearnersResult.data ?? []).map((r) => {
    const learner = Array.isArray(r.learners) ? r.learners[0] : r.learners;
    return {
      full_name: (learner as { full_name?: string } | null)?.full_name ?? 'Unknown',
      total_points: r.total_points,
      sessions_attended: r.sessions_attended,
    };
  });

  return NextResponse.json({
    company: { name: company.name, start_date: company.start_date, learning_timeline_days: company.learning_timeline_days },
    week_start: weekAgoISO,
    week_end: now.toISOString(),
    totals: {
      learners: learnersResult.count ?? 0,
      active_this_week: activeThisWeekResult.count ?? 0,
      course_completions: completionsThisWeekResult.count ?? 0,
      zoom_attendances: zoomThisWeekResult.data?.length ?? 0,
      assignments_submitted: assignmentsThisWeekResult.count ?? 0,
      surveys_submitted: surveysThisWeekResult.count ?? 0,
    },
    status_distribution: statusCounts,
    avg_completion: avgCompletion,
    top_learners: topLearners,
    open_alerts: alertsResult.data ?? [],
  });
}
