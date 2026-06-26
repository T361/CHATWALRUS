export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyOrAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const authError = requireCompanyOrAdmin(req, slug);
  if (authError) return authError;
  const db = createAdminClient();

  const { data: company } = await db
    .from('companies')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const { data: rows, error } = await db
    .from('learner_points')
    .select('learner_id, total_points, sessions_attended, current_streak_days, learners(full_name, email, department)')
    .eq('company_id', company.id)
    .order('total_points', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ranked = (rows ?? []).map((r, i) => {
    const learner = Array.isArray(r.learners) ? r.learners[0] : r.learners;
    return {
      rank: i + 1,
      learner_id: r.learner_id,
      full_name: (learner as { full_name?: string } | null)?.full_name ?? 'Unknown',
      email: (learner as { email?: string } | null)?.email ?? '',
      department: (learner as { department?: string } | null)?.department ?? null,
      total_points: r.total_points,
      sessions_attended: r.sessions_attended,
      current_streak_days: r.current_streak_days,
    };
  });

  return NextResponse.json({ leaderboard: ranked, company_name: company.name, total: ranked.length });
}
