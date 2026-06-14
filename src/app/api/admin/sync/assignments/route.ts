import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncEnrollmentData } from '@/lib/thinkific/syncEnrollmentData';

// Assignments derive from enrollment data — runs the same combined pass as Import Progress.
// Calling this standalone does the full enrollments+assignments sync in one Thinkific pass.
export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const { enrollments, assignments } = await syncEnrollmentData();
    return NextResponse.json({
      status: assignments.status,
      records_processed: assignments.recordsProcessed,
      message: assignments.errorMessage,
      enrollments,
      assignments,
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
