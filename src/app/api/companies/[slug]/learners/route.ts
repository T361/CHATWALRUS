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

  // Paginate enrollments — Supabase caps at 1k rows per request
  const allEnrollments: Array<{ learner_id: string; progress_percent: number; course_id: string }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db
      .from('enrollments')
      .select('learner_id, progress_percent, course_id')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    allEnrollments.push(...page);
    if (page.length < 1000) break;
  }

  // Paginate snapshots by company_id to avoid both URL limits and the Supabase
  // 1000-row server cap. We only need the latest snapshot per learner so we
  // paginate until we have at least one row per learner or exhaust the table.
  const allSnapshots: Array<{ learner_id: string; status: string; live_sessions_last_30_days: number; snapshot_date: string }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db
      .from('learner_status_snapshots')
      .select('learner_id, status, live_sessions_last_30_days, snapshot_date')
      .eq('company_id', company.id)
      .order('snapshot_date', { ascending: false })
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    allSnapshots.push(...page);
    // Stop once we have a snapshot for every learner (they're sorted desc so
    // we'll hit the latest for all learners before going further back in time).
    const covered = new Set(allSnapshots.map(s => s.learner_id));
    if (covered.size >= learnerIds.length || page.length < 1000) break;
  }

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
