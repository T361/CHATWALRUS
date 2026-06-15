import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

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
    .select('id')
    .eq('slug', slug)
    .single();

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  // Completion trend from daily_snapshots (aggregated by date)
  const { data: snapshots } = await db
    .from('daily_snapshots')
    .select('snapshot_date, completion_percent')
    .eq('company_id', company.id)
    .order('snapshot_date', { ascending: true })
    .limit(365);

  // Aggregate by date
  const dateMap = new Map<string, { total: number; count: number }>();
  for (const snap of snapshots || []) {
    const entry = dateMap.get(snap.snapshot_date) || { total: 0, count: 0 };
    entry.total += Number(snap.completion_percent || 0);
    entry.count += 1;
    dateMap.set(snap.snapshot_date, entry);
  }

  const completionTrend = Array.from(dateMap.entries()).map(([date, { total, count }]) => ({
    date,
    average_completion: Math.round((total / count) * 10) / 10,
  }));

  // Status distribution — latest snapshot per learner, fully paginated
  const learnerStatuses = new Map<string, string>();
  for (let offset = 0; ; offset += 1000) {
    const { data: statusPage } = await db
      .from('learner_status_snapshots')
      .select('learner_id, status, snapshot_date')
      .eq('company_id', company.id)
      .order('snapshot_date', { ascending: false })
      .range(offset, offset + 999);
    if (!statusPage || statusPage.length === 0) break;
    for (const s of statusPage) {
      if (!learnerStatuses.has(s.learner_id)) {
        learnerStatuses.set(s.learner_id, s.status);
      }
    }
    if (statusPage.length < 1000) break;
  }

  const statusCounts: Record<string, number> = {
    not_started: 0, at_risk: 0, slightly_behind: 0, on_track: 0, high_engagement: 0,
  };
  for (const status of learnerStatuses.values()) {
    if (status in statusCounts) statusCounts[status]++;
  }

  return NextResponse.json({
    completion_trend: completionTrend,
    status_distribution: Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    })),
  });
}
