export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncZoomAttendance, syncZoomAttendanceChunk } from '@/lib/zoom/syncAttendance';
import { invalidateDashboardCaches } from '@/lib/cache/invalidation';
import { refreshLearnerDirectoryRollups } from '@/lib/learners/rollups';
import { refreshCompanyWeeklyRollups } from '@/lib/weekly/rollups';

// Chunked GET — safe for Vercel Hobby 60s limit.
// offset=0 also discovers sessions. Client loops until done=true.
export async function GET(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0;
  const limit  = parseInt(req.nextUrl.searchParams.get('limit')  ?? '5',  10) || 5;
  try {
    const result = await syncZoomAttendanceChunk({ offset, limit });
    if (result.done) {
      invalidateDashboardCaches();
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

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
