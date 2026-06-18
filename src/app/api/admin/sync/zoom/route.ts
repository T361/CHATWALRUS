export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncZoomAttendance } from '@/lib/zoom/syncAttendance';
import { invalidateDashboardCaches } from '@/lib/cache/invalidation';
import { refreshLearnerDirectoryRollups } from '@/lib/learners/rollups';
import { refreshCompanyWeeklyRollups } from '@/lib/weekly/rollups';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const result = await syncZoomAttendance();
    await refreshLearnerDirectoryRollups();
    await refreshCompanyWeeklyRollups();
    invalidateDashboardCaches();
    return NextResponse.json({ status: result.status, records_processed: result.recordsProcessed, error: result.errorMessage });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
