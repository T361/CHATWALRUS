import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { getLearnerDirectory } from '@/lib/learners/directory';
import { withServerTiming } from '@/lib/perf';

export async function GET(req: NextRequest) {
  return withServerTiming('global.learners.route', async () => {
    const authError = requireAdminOrCron(req);
    if (authError) return authError;

    const searchParams = req.nextUrl.searchParams;
    const result = await getLearnerDirectory({
      q: searchParams.get('q') || '',
      courseId: searchParams.get('course_id') || '',
      status: searchParams.get('status') || 'all',
      page: Number(searchParams.get('page') || '1'),
      limit: Number(searchParams.get('limit') || '25'),
    });

    return NextResponse.json({
      learners: result.rows,
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
