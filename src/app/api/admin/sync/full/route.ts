export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { syncEnrollmentData } from '@/lib/thinkific/syncEnrollmentData';
import { syncSurveys } from '@/lib/thinkific/syncSurveys';
import { summarizeSyncResults } from '@/lib/thinkific/syncCore';
import { createDailySnapshots } from '@/lib/snapshots/createDailySnapshots';
import { runAllMilestoneChecks } from '@/lib/milestones/runMilestoneCheck';
import { invalidateDashboardCaches } from '@/lib/cache/invalidation';

// Full sync: import all Thinkific data, then create snapshots + run milestones.
// Order matters: courses + users must exist before enrollment data can be mapped.
export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const courseResult    = await syncCourses();
    const userResult      = await syncUsers();
    const { enrollments: enrollmentResult, assignments: assignmentResult } = await syncEnrollmentData();
    const surveyResult    = await syncSurveys();

    // After data is synced, create daily snapshots and run milestone checks
    // so charts and statuses are immediately up to date.
    const snapshotCount   = await createDailySnapshots();
    const milestoneResults = await runAllMilestoneChecks();

    const results = {
      courses:    courseResult,
      users:      userResult,
      enrollments:enrollmentResult,
      assignments:assignmentResult,
      surveys:    surveyResult,
    };

    const summary = summarizeSyncResults(results);
    invalidateDashboardCaches();

    return NextResponse.json({
      status:           summary.status,
      message:          summary.message,
      results,
      records_processed:summary.recordsProcessed,
      snapshots_created:snapshotCount,
      milestones_run:   milestoneResults.length,
    }, { status: summary.status === 'failed' ? 500 : 200 });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
