export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { syncGroups } from '@/lib/thinkific/syncGroups';
import { syncOrders } from '@/lib/thinkific/syncOrders';
import { syncEnrollmentData } from '@/lib/thinkific/syncEnrollmentData';
import { syncStartDates } from '@/lib/thinkific/syncStartDates';
import { summarizeSyncResults } from '@/lib/thinkific/syncCore';
import { invalidateDashboardCaches } from '@/lib/cache/invalidation';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const courseResult = await syncCourses();
    const userResult = await syncUsers();
    // Groups: canonical company list + learner→company assignments (more authoritative than email-domain)
    const groupResult = await syncGroups();
    const orderResult = await syncOrders();
    // Enrollments needed so start-date inference has data to work from
    const { enrollments: enrollmentResult } = await syncEnrollmentData();
    // Auto-detect start dates for any company that doesn't have one yet
    const startDateResult = await syncStartDates();
    const results = { courses: courseResult, users: userResult, groups: groupResult, orders: orderResult, enrollments: enrollmentResult, start_dates: startDateResult };
    const summary = summarizeSyncResults(results);
    invalidateDashboardCaches();

    return NextResponse.json({
      status: summary.status,
      message: summary.message,
      results,
      records_processed: summary.recordsProcessed,
    }, { status: summary.status === 'failed' ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
