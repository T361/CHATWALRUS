export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { invalidateDashboardCaches } from '@/lib/cache/invalidation';
import { getWeeklyRollupHealth, refreshCompanyWeeklyRollups } from '@/lib/weekly/rollups';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  try {
    const recordsProcessed = await refreshCompanyWeeklyRollups();
    invalidateDashboardCaches();
    const health = await getWeeklyRollupHealth();

    return NextResponse.json({
      status: 'success',
      records_processed: recordsProcessed,
      scope: 'all',
      active_companies: health.active_companies,
      rollup_companies: health.rollup_companies,
      week_start: health.week_start,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      scope: 'all',
    }, { status: 500 });
  }
}
