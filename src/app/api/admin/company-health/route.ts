import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  const { data: companies, error } = await db
    .from('companies')
    .select('id, name, slug, is_active')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!companies || companies.length === 0) return NextResponse.json({ companies: [] });

  const companyIds = companies.map((c) => c.id);

  const [
    learnersRes,
    enrollmentsRes,
    weeklyRollupsRes,
    learnerRollupsRes,
    lessonProgressRes,
    zoomRes,
  ] = await Promise.all([
    db.from('learners').select('company_id').in('company_id', companyIds).eq('is_active', true).limit(50000),
    db.from('enrollments').select('company_id').in('company_id', companyIds).eq('is_active', true).limit(50000),
    db
      .from('weekly_company_rollups')
      .select('company_id, week_start')
      .in('company_id', companyIds)
      .order('week_start', { ascending: false })
      .limit(10000),
    db.from('learner_directory_rollups').select('company_id').in('company_id', companyIds).limit(50000),
    db.from('lesson_progress').select('company_id').in('company_id', companyIds).limit(50000),
    db.from('zoom_attendance').select('company_id').in('company_id', companyIds).limit(50000),
  ]);

  // Count per company
  function countByCompany(rows: { company_id: string | null }[] | null): Record<string, number> {
    const map: Record<string, number> = {};
    for (const row of rows ?? []) {
      if (row.company_id) map[row.company_id] = (map[row.company_id] ?? 0) + 1;
    }
    return map;
  }

  // Last weekly rollup date per company
  const lastWeeklyRollup: Record<string, string> = {};
  for (const row of weeklyRollupsRes.data ?? []) {
    if (row.company_id && !lastWeeklyRollup[row.company_id]) {
      lastWeeklyRollup[row.company_id] = row.week_start;
    }
  }

  const learnerCount = countByCompany(learnersRes.data);
  const enrollmentCount = countByCompany(enrollmentsRes.data);
  const learnerRollupCount = countByCompany(learnerRollupsRes.data);
  const lessonProgressCount = countByCompany(lessonProgressRes.data);
  const zoomCount = countByCompany(zoomRes.data);

  const today = new Date();

  const result = companies.map((c) => {
    const learners = learnerCount[c.id] ?? 0;
    const enrollments = enrollmentCount[c.id] ?? 0;
    const rollups = learnerRollupCount[c.id] ?? 0;
    const lessonProgress = lessonProgressCount[c.id] ?? 0;
    const zoom = zoomCount[c.id] ?? 0;
    const lastWeekly = lastWeeklyRollup[c.id] ?? null;

    const weeklyDaysAgo = lastWeekly
      ? Math.floor((today.getTime() - new Date(lastWeekly).getTime()) / 86400000)
      : null;

    const issues: string[] = [];
    if (learners > 0 && rollups < learners) issues.push(`learner rollups: ${rollups}/${learners}`);
    if (weeklyDaysAgo === null) issues.push('no weekly rollups');
    else if (weeklyDaysAgo > 14) issues.push(`weekly rollup stale: ${weeklyDaysAgo}d ago`);
    if (learners > 0 && lessonProgress === 0) issues.push('no lesson progress');
    if (learners > 0 && zoom === 0) issues.push('no zoom attendance');

    return {
      name: c.name,
      slug: c.slug,
      is_active: c.is_active,
      learners,
      enrollments,
      learner_rollups: rollups,
      lesson_progress_rows: lessonProgress,
      zoom_attendance_rows: zoom,
      last_weekly_rollup: lastWeekly,
      weekly_days_ago: weeklyDaysAgo,
      healthy: issues.length === 0,
      issues,
    };
  });

  return NextResponse.json({ companies: result });
}
