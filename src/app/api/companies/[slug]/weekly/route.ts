export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyOrAdmin } from '@/lib/auth/guards';
import { withServerTiming } from '@/lib/perf';
import { getWeeklyReportResultByCompanySlug } from '@/lib/weekly/rollups';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return withServerTiming('weekly.route.get', async () => {
    const { slug } = await params;
    const authError = requireCompanyOrAdmin(req, slug);
    if (authError) return authError;
    const result = await getWeeklyReportResultByCompanySlug(slug);
    if (!result.report) {
      return NextResponse.json(
        { error: result.error || 'Weekly report unavailable' },
        { status: result.status },
      );
    }

    return NextResponse.json(result.report);
  });
}
