import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import type { LearnerStatus } from '@/types/learner';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  const { slug } = await params;
  const db = createAdminClient();
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

  if (!learners || learners.length === 0) {
    return NextResponse.json({ learners: [], company_name: company.name });
  }

  const learnerIds = learners.map((l) => l.id);

  // Bulk-fetch all enrollments for this company in one query
  const { data: allEnrollments } = await db
    .from('enrollments')
    .select('learner_id, progress_percent, course_id')
    .eq('company_id', company.id)
    .eq('is_active', true)
    .in('learner_id', learnerIds);

  // Fetch most recent snapshots per learner — NOT filtered to today, so status
  // shows even if milestones haven't run today. Ordered desc so first hit per
  // learner is the latest; deduplication happens in-memory below.
  const { data: allSnapshots } = await db
    .from('learner_status_snapshots')
    .select('learner_id, status, live_sessions_last_30_days, snapshot_date')
    .in('learner_id', learnerIds)
    .order('snapshot_date', { ascending: false })
    .limit(learnerIds.length * 3);

  // Build Maps for O(1) lookups
  const enrollmentsByLearner = new Map<string, Array<{ progress_percent: number; course_id: string }>>();
  for (const e of allEnrollments || []) {
    if (!enrollmentsByLearner.has(e.learner_id)) enrollmentsByLearner.set(e.learner_id, []);
    enrollmentsByLearner.get(e.learner_id)!.push(e);
  }

  // Keep only the most recent snapshot per learner (rows already sorted desc)
  const latestSnapshotByLearner = new Map<string, { status: LearnerStatus; live_sessions_last_30_days: number }>();
  for (const snap of allSnapshots || []) {
    if (!latestSnapshotByLearner.has(snap.learner_id)) {
      latestSnapshotByLearner.set(snap.learner_id, {
        status: snap.status as LearnerStatus,
        live_sessions_last_30_days: snap.live_sessions_last_30_days ?? 0,
      });
    }
  }

  // Merge in memory — zero extra DB queries
  const enriched = learners.map((l) => {
    const enrollments = enrollmentsByLearner.get(l.id) || [];
    const avgProgress = enrollments.length > 0
      ? enrollments.reduce((s, e) => s + Number(e.progress_percent || 0), 0) / enrollments.length
      : 0;

    const snap = latestSnapshotByLearner.get(l.id);

    return {
      id: l.id,
      full_name: l.full_name || 'Unknown',
      email: l.email,
      department: l.department,
      title: l.title,
      progress_percent: Math.round(avgProgress * 10) / 10,
      status: (snap?.status || 'not_started') as LearnerStatus,
      courses_enrolled: enrollments.length,
      last_active_at: l.last_active_at,
      live_sessions_last_30_days: snap?.live_sessions_last_30_days ?? 0,
    };
  });

  return NextResponse.json({ learners: enriched, company_name: company.name });
}
