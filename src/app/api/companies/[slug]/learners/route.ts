import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLearnerDirectory } from '@/lib/learners/directory';
import { withServerTiming } from '@/lib/perf';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return withServerTiming('company.learners.route', async () => {
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

    const searchParams = req.nextUrl.searchParams;
    const result = await getLearnerDirectory({
      companyId: company.id,
      q: searchParams.get('q') || '',
      courseId: searchParams.get('course_id') || '',
      status: searchParams.get('status') || 'all',
      role: searchParams.get('role') || undefined,
      sortBy: searchParams.get('sort_by') || undefined,
      sortDir: (searchParams.get('sort_dir') as 'asc' | 'desc') || undefined,
      page: Number(searchParams.get('page') || '1'),
      limit: Number(searchParams.get('limit') || '25'),
    });

    return NextResponse.json({
      learners: result.rows.map((row) => ({
        id: row.learner_id,
        full_name: row.full_name || 'Unknown',
        email: row.email,
        department: row.department,
        title: row.title,
        progress_percent: row.avg_progress,
        status: row.status,
        courses_enrolled: row.courses_enrolled,
        last_active_at: row.last_active_at,
        live_sessions_last_30_days: row.live_sessions_last_30_days,
      })),
      company_name: company.name,
      total: result.total,
      page: result.page,
      limit: result.limit,
      has_more: result.has_more,
      filters: {
        q: searchParams.get('q') || '',
        course_id: searchParams.get('course_id') || '',
        status: searchParams.get('status') || 'all',
      },
    });
  });
}
