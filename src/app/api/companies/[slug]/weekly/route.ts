export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { withServerTiming } from '@/lib/perf';
import { getWeeklyReportByCompanySlug } from '@/lib/weekly/rollups';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return withServerTiming('weekly.route.get', async () => {
    const authError = requireAdminOrCron(req);
    if (authError) return authError;

    const { slug } = await params;
    const report = await getWeeklyReportByCompanySlug(slug);
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(report);
  });
}
