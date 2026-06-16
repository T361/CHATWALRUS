export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const db = createAdminClient();

  const { data: rows, error } = await db
    .from('learner_points')
    .select('learner_id, company_id, total_points, sessions_attended, current_streak_days, learners(full_name, email), companies(name, slug)')
    .order('total_points', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ranked = (rows ?? []).map((r, i) => {
    const learner = Array.isArray(r.learners) ? r.learners[0] : r.learners;
    const company = Array.isArray(r.companies) ? r.companies[0] : r.companies;
    return {
      rank: i + 1,
      learner_id: r.learner_id,
      full_name: (learner as { full_name?: string } | null)?.full_name ?? 'Unknown',
      email: (learner as { email?: string } | null)?.email ?? '',
      company_name: (company as { name?: string } | null)?.name ?? null,
      company_slug: (company as { slug?: string } | null)?.slug ?? null,
      total_points: r.total_points,
      sessions_attended: r.sessions_attended,
      current_streak_days: r.current_streak_days,
    };
  });

  return NextResponse.json({ leaderboard: ranked, total: ranked.length });
}
