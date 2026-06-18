export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { refreshLearnerDirectoryRollups } from '@/lib/learners/rollups';
import { invalidateDashboardCaches } from '@/lib/cache/invalidation';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  try {
    const recordsProcessed = await refreshLearnerDirectoryRollups();
    invalidateDashboardCaches();
    return NextResponse.json({
      status: 'success',
      records_processed: recordsProcessed,
      scope: 'all',
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      scope: 'all',
    }, { status: 500 });
  }
}
