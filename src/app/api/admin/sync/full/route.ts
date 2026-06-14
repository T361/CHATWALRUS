import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { syncEnrollmentData } from '@/lib/thinkific/syncEnrollmentData';
import { syncSurveys } from '@/lib/thinkific/syncSurveys';
import { summarizeSyncResults } from '@/lib/thinkific/syncCore';

// Full sync: one pass over Thinkific data instead of 4 separate enrollment paginations.
// Order matters: courses+users must exist before enrollment data can be mapped.
export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const courseResult = await syncCourses();
    const userResult = await syncUsers();
    const { enrollments: enrollmentResult, assignments: assignmentResult } = await syncEnrollmentData();
    const surveyResult = await syncSurveys();

    const results = {
      courses: courseResult,
      users: userResult,
      enrollments: enrollmentResult,
      assignments: assignmentResult,
      surveys: surveyResult,
    };

    const summary = summarizeSyncResults(results);

    return NextResponse.json({
      status: summary.status,
      message: summary.message,
      results,
      records_processed: summary.recordsProcessed,
    }, { status: summary.status === 'failed' ? 500 : 200 });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
