import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncEnrollmentData } from '@/lib/thinkific/syncEnrollmentData';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const { enrollments, assignments } = await syncEnrollmentData();
    return NextResponse.json({
      status: 'success',
      records_processed: enrollments.recordsProcessed + assignments.recordsProcessed,
      enrollments,
      assignments,
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
