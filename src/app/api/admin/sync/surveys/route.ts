export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncSurveys } from '@/lib/thinkific/syncSurveys';
import { invalidateDashboardCaches } from '@/lib/cache/invalidation';
import { refreshCompanyWeeklyRollups } from '@/lib/weekly/rollups';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const result = await syncSurveys();
    await refreshCompanyWeeklyRollups();
    invalidateDashboardCaches();
    return NextResponse.json({
      status: result.status,
      records_processed: result.recordsProcessed,
      message: result.errorMessage
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
