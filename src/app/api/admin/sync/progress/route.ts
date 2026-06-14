import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncEnrollments } from '@/lib/thinkific/syncEnrollments';

// Single Thinkific pagination pass — enrollments already include progress_percent
// and completed_at, so syncEnrollments handles both in one ~120s run.
export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const result = await syncEnrollments();
    return NextResponse.json({
      status: result.status,
      records_processed: result.recordsProcessed,
      message: result.errorMessage,
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
