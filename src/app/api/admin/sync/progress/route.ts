import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncEnrollments } from '@/lib/thinkific/syncEnrollments';
import { syncProgress } from '@/lib/thinkific/syncProgress';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    // Enrollments must exist before progress can be synced
    const enrollmentResult = await syncEnrollments();
    const progressResult = await syncProgress();
    return NextResponse.json({
      status: progressResult.status === 'error' ? 'error' : enrollmentResult.status,
      records_processed: enrollmentResult.recordsProcessed + progressResult.recordsProcessed,
      enrollments: enrollmentResult,
      progress: progressResult,
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
