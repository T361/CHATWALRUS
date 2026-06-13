import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { syncEnrollments } from '@/lib/thinkific/syncEnrollments';
import { syncProgress } from '@/lib/thinkific/syncProgress';
import { syncAssignments } from '@/lib/thinkific/syncAssignments';
import { syncSurveys } from '@/lib/thinkific/syncSurveys';
import { summarizeSyncResults } from '@/lib/thinkific/syncCore';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const results = {
      courses: await syncCourses(),
      users: await syncUsers(),
      enrollments: await syncEnrollments(),
      progress: await syncProgress(),
      assignments: await syncAssignments(),
      surveys: await syncSurveys(),
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
